const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = __dirname;
const files = {
  css: path.join(root, "assistant-shell.css"),
  knowledge: path.join(root, "assistant-knowledge.js"),
  runtime: path.join(root, "assistant-shell.js"),
};

const markers = {
  style: ["<!-- CONGLOBAL_ASSISTANT_STYLE_START -->", "<!-- CONGLOBAL_ASSISTANT_STYLE_END -->"],
  mount: ["<!-- CONGLOBAL_ASSISTANT_MOUNT_START -->", "<!-- CONGLOBAL_ASSISTANT_MOUNT_END -->"],
  runtime: ["<!-- CONGLOBAL_ASSISTANT_RUNTIME_START -->", "<!-- CONGLOBAL_ASSISTANT_RUNTIME_END -->"],
};

function readSources() {
  for (const sourcePath of Object.values(files)) {
    if (!fs.existsSync(sourcePath)) throw new Error(`Assistant source is missing: ${sourcePath}`);
  }
  const sources = {
    css: fs.readFileSync(files.css, "utf8").trim(),
    knowledge: fs.readFileSync(files.knowledge, "utf8").trim(),
    runtime: fs.readFileSync(files.runtime, "utf8").trim(),
  };
  validateSources(sources);
  return sources;
}

function validateSources(sources) {
  new vm.Script(sources.knowledge, { filename: "assistant-knowledge.js" });
  new vm.Script(sources.runtime, { filename: "assistant-shell.js" });
  const sandbox = { window: {} };
  vm.runInNewContext(sources.knowledge, sandbox, { filename: "assistant-knowledge.js" });
  const knowledge = sandbox.window.CONGLOBAL_OPS_KNOWLEDGE;
  if (!knowledge || !Array.isArray(knowledge.entries) || knowledge.entries.length < 10) {
    throw new Error("Assistant knowledge payload is missing or incomplete.");
  }
  const requiredStatuses = ["confirmed", "inferred", "proposed", "superseded", "unresolved", "verification-required"];
  for (const status of requiredStatuses) {
    if (!knowledge.statusDefinitions || !knowledge.statusDefinitions[status]) throw new Error(`Assistant knowledge status is missing: ${status}.`);
  }
  const ids = new Set();
  for (const entry of knowledge.entries) {
    if (!entry.id || ids.has(entry.id)) throw new Error(`Assistant knowledge entry has a missing or duplicate id: ${entry.id || "(blank)"}`);
    ids.add(entry.id);
    for (const required of ["title", "category", "summary", "source", "sourceVersion", "confidence", "status", "keywords"]) {
      if (entry[required] == null || entry[required] === "") throw new Error(`Knowledge entry ${entry.id} is missing ${required}.`);
    }
    if (!requiredStatuses.includes(entry.status)) throw new Error(`Knowledge entry ${entry.id} has unsupported status ${entry.status}.`);
    if (!Array.isArray(entry.pages) || !entry.pages.length || !Array.isArray(entry.keywords) || !entry.keywords.length) throw new Error(`Knowledge entry ${entry.id} needs page and keyword metadata.`);
    for (const supported of ["effectiveDate", "supersededRuleReference", "verificationRequired", "lastReview"]) {
      if (!Object.prototype.hasOwnProperty.call(entry, supported)) throw new Error(`Knowledge entry ${entry.id} does not support ${supported}.`);
    }
  }
}

function removeMarkedBlock(html, marker) {
  const start = escapeRegExp(marker[0]);
  const end = escapeRegExp(marker[1]);
  return html.replace(new RegExp(`${start}[\\s\\S]*?${end}\\s*`, "g"), "");
}

function injectAssistantShell(workbookHtml) {
  const sources = readSources();
  let html = String(workbookHtml || "");
  html = removeMarkedBlock(html, markers.style);
  html = removeMarkedBlock(html, markers.mount);
  html = removeMarkedBlock(html, markers.runtime);
  html = applyAssistantPrivacyGuards(html);
  html = applyAssistantContextHook(html);

  const styleBlock = `${markers.style[0]}\n<style id="conglobalOpsAssistantStyles">\n${sources.css}\n</style>\n${markers.style[1]}`;
  if (!/<\/head>/i.test(html)) throw new Error("Assistant injection could not find </head>.");
  html = html.replace(/<\/head>/i, `${styleBlock}\n</head>`);

  const knowledgeJs = escapeClosingScript(sources.knowledge);
  const mountBlock = `${markers.mount[0]}\n<div id="conglobalOpsAssistant" data-private-ui="true" aria-label="YardMate operations assistant"></div>\n<script id="conglobalOpsAssistantKnowledge">\n${knowledgeJs}\n</script>\n${markers.mount[1]}`;
  const portableStateTag = /\s*<script id="conglobalPortableState"/i;
  if (portableStateTag.test(html)) html = html.replace(portableStateTag, `\n${mountBlock}\n  <script id="conglobalPortableState"`);
  else html = insertBeforeLastClosingBody(html, mountBlock);

  const runtimeJs = escapeClosingScript(sources.runtime);
  const runtimeBlock = `${markers.runtime[0]}\n<script id="conglobalOpsAssistantRuntime">\n${runtimeJs}\n</script>\n${markers.runtime[1]}`;
  html = insertBeforeLastClosingBody(html, runtimeBlock);

  assertSingle(html, "id=\"conglobalOpsAssistant\"", "assistant root");
  assertSingle(html, "id=\"conglobalOpsAssistantStyles\"", "assistant stylesheet");
  assertSingle(html, "id=\"conglobalOpsAssistantKnowledge\"", "assistant knowledge payload");
  assertSingle(html, "id=\"conglobalOpsAssistantRuntime\"", "assistant runtime");
  return html;
}

function applyAssistantPrivacyGuards(html) {
  const oldFilter = `function workbookSyncShouldIncludeKey(key) {\n      return typeof key === "string" && !key.startsWith("conglobal-supabase-");\n    }`;
  const guardedFilter = `function workbookSyncShouldIncludeKey(key) {\n      if (typeof key !== "string") return false;\n      const privatePrefixes = ["conglobal-supabase-", "conglobal-ops-assistant-", "ops-assistant-", "assistant-private-"];\n      return !privatePrefixes.some((prefix) => key.startsWith(prefix));\n    }`;
  if (html.includes(oldFilter)) html = html.replace(oldFilter, guardedFilter);
  if (!html.includes("conglobal-ops-assistant-")) {
    throw new Error("Assistant privacy guard could not be verified in workbookSyncShouldIncludeKey().");
  }

  const cloneLine = `const clone = document.documentElement.cloneNode(true);`;
  const scrubLine = `const clone = document.documentElement.cloneNode(true);\n      clone.querySelectorAll("[data-private-ui='true'], #conglobalOpsAssistant, #conglobalOpsAssistantRestore, #conglobalOpsAssistantEnable").forEach((privateNode) => privateNode.remove());`;
  if (html.includes(cloneLine) && !html.includes("privateNode.remove()")) html = html.replace(cloneLine, scrubLine);
  if (!html.includes("privateNode.remove()")) throw new Error("Assistant portable-export privacy scrub could not be verified.");
  return html;
}

function applyAssistantContextHook(html) {
  let next = html;
  const selectStart = `function selectPage(id) {\n      activePage = pages[id] && !["compare", "time", "dayforce", "archive", "roster", "timeOff"].includes(id) ? id : "amReport";`;
  const hookedStart = `${selectStart}\n      window.ConglobalOpsAssistant?.setPage({ id: activePage, label: pages[activePage] && pages[activePage].label });`;
  if (!next.includes("ConglobalOpsAssistant?.setPage")) {
    if (!next.includes(selectStart)) throw new Error("Assistant page-context hook could not find selectPage().");
    next = next.replace(selectStart, hookedStart);
  }

  const loadStart = `function handleWorkbookFrameLoad(event) {\n      const loadedFrame = event.currentTarget;\n      resizeFrame(loadedFrame);`;
  const hookedLoadStart = `${loadStart}\n      window.ConglobalOpsAssistant?.refreshContext();`;
  if (!next.includes("ConglobalOpsAssistant?.refreshContext")) {
    if (!next.includes(loadStart)) throw new Error("Assistant page-context hook could not find handleWorkbookFrameLoad().");
    next = next.replace(loadStart, hookedLoadStart);
  }

  const childBridgeLine = `        '["input","change"].forEach(function(name){document.addEventListener(name,function(){queued("dom",name);},true);});',`;
  const childContextLine = `        'window.addEventListener("message",function(event){var d=event.data;if(event.source!==window.parent||(location.origin!=="null"&&event.origin!==location.origin)||!d||d.type!=="conglobal-ops-assistant-context-request"||d.schemaVersion!==1)return;var provider=window.CONGLOBAL_OPS_ASSISTANT_CONTEXT_PROVIDER;if(typeof provider!=="function")return;Promise.resolve(provider({pageId:d.pageId,requestedFields:Array.isArray(d.requestedFields)?d.requestedFields.slice(0,30):[],explicit:d.requestedFields&&d.requestedFields.length>6,purpose:d.purpose||""})).then(function(value){if(!value||typeof value!=="object")return;window.parent.postMessage({type:"conglobal-ops-assistant-context-response",schemaVersion:1,requestId:d.requestId,token:d.token,pageId:d.pageId,context:value.context&&typeof value.context==="object"?value.context:value,source:value.source&&typeof value.source==="object"?value.source:{id:"page-"+d.pageId,label:"Validated page context provider",source:"embedded page adapter",freshness:"provided on request",validationStatus:"provider supplied"}},event.origin==="null"?"*":event.origin);}).catch(function(){});});',`;
  if (!next.includes("CONGLOBAL_OPS_ASSISTANT_CONTEXT_PROVIDER")) {
    if (!next.includes(childBridgeLine)) throw new Error("Assistant child context-provider bridge could not find workbookSyncBridgeScript().");
    next = next.replace(childBridgeLine, `${childBridgeLine}\n${childContextLine}`);
  }
  return next;
}

function assertSingle(html, needle, label) {
  const count = html.split(needle).length - 1;
  if (count !== 1) throw new Error(`Expected exactly one ${label}; found ${count}.`);
}

function escapeClosingScript(value) {
  return String(value).replace(/<\/script/gi, "<\\/script");
}

function insertBeforeLastClosingBody(html, block) {
  const index = html.toLowerCase().lastIndexOf("</body>");
  if (index < 0) throw new Error("Assistant injection could not find the outer </body>.");
  return `${html.slice(0, index)}${block}\n${html.slice(index)}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  injectAssistantShell,
  validateAssistantSources: () => validateSources(readSources()),
  assistantSourceFiles: { ...files },
};
