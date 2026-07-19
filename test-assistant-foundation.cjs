const assert = require("assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const vm = require("vm");
const { injectAssistantShell, validateAssistantSources } = require("./assistant-shell-inject.cjs");

const html = fs.readFileSync("index.html", "utf8");
const mirrorPath = "GITHUB UPLOAD - ONE FILE/index.html";
const runtimeFile = fs.readFileSync("assistant-shell.js", "utf8").trim();
const knowledgeFile = fs.readFileSync("assistant-knowledge.js", "utf8").trim();
const cssFile = fs.readFileSync("assistant-shell.css", "utf8").trim();
const digest = value => crypto.createHash("sha256").update(value).digest("hex");

function count(value, needle) {
  return value.split(needle).length - 1;
}

function scriptSource(value, id) {
  const pattern = new RegExp(`<script\\s+id=["']${id}["'][^>]*>\\s*([\\s\\S]*?)\\s*<\\/script>`);
  const match = value.match(pattern);
  assert(match, `Missing ${id}`);
  return match[1].trim();
}

function evaluateKnowledge(source) {
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: "assistant-knowledge.js" });
  return sandbox.window.CONGLOBAL_OPS_KNOWLEDGE;
}

function evaluateIntentClassifier(source) {
  const start = source.indexOf("function classifyPromptIntent");
  const end = source.indexOf("\n  function structuredResponse", start);
  assert(start >= 0 && end > start, "Intent classifier test seam is missing");
  const sandbox = {};
  vm.runInNewContext(`${source.slice(start, end)}\nthis.classifyPromptIntent = classifyPromptIntent;`, sandbox);
  return sandbox.classifyPromptIntent;
}

validateAssistantSources();

assert.equal(count(html, 'id="conglobalOpsAssistant"'), 1, "Assistant root must be unique");
assert.equal(count(html, 'id="conglobalOpsAssistantStyles"'), 1, "Assistant styles must be unique");
assert.equal(count(html, 'id="conglobalOpsAssistantKnowledge"'), 1, "Assistant knowledge must be unique");
assert.equal(count(html, 'id="conglobalOpsAssistantRuntime"'), 1, "Assistant runtime must be unique");
assert.equal(count(html, "ConglobalOpsAssistant?.setPage"), 1, "Page navigation hook must be unique");
assert.equal(count(html, "ConglobalOpsAssistant?.refreshContext"), 1, "Post-load page-context refresh hook must be unique");
assert.equal(count(html, "CONGLOBAL_OPS_ASSISTANT_CONTEXT_PROVIDER"), 1, "Child-page data-adapter bridge must be unique");
assert(html.includes("@media print"), "Assistant needs print hiding rules");
assert(html.includes("conglobal-ops-assistant-"), "Assistant local state must be excluded from shared workbook state");
assert(html.includes("privateNode.remove()"), "Portable export must scrub live assistant UI");

const embeddedKnowledgeSource = scriptSource(html, "conglobalOpsAssistantKnowledge");
const embeddedRuntimeSource = scriptSource(html, "conglobalOpsAssistantRuntime");
new vm.Script(embeddedKnowledgeSource, { filename: "embedded-assistant-knowledge.js" });
new vm.Script(embeddedRuntimeSource, { filename: "embedded-assistant-runtime.js" });
assert.equal(digest(embeddedKnowledgeSource), digest(knowledgeFile), "Embedded knowledge is stale relative to assistant-knowledge.js");
assert.equal(digest(embeddedRuntimeSource), digest(runtimeFile), "Embedded runtime is stale relative to assistant-shell.js");
assert(html.includes(cssFile), "Embedded assistant CSS is stale relative to assistant-shell.css");

const knowledge = evaluateKnowledge(knowledgeFile);
const expectedStatuses = ["confirmed", "inferred", "proposed", "superseded", "unresolved", "verification-required"].sort();
assert(knowledge.entries.length >= 30, "Expected the strengthened operational knowledge foundation");
assert.deepEqual(Object.keys(knowledge.statusDefinitions || {}).sort(), expectedStatuses, "Knowledge status vocabulary is incomplete");
assert.deepEqual([...new Set(knowledge.entries.map(entry => entry.status))].sort(), expectedStatuses, "Every knowledge status must be represented by a real, labeled entry");

const ids = new Set();
for (const entry of knowledge.entries) {
  assert(entry.id && !ids.has(entry.id), `Missing or duplicate knowledge id: ${entry.id}`);
  ids.add(entry.id);
  for (const field of ["title", "category", "pages", "summary", "source", "sourceVersion", "status", "confidence", "keywords", "lastReview", "effectiveDate", "supersededRuleReference", "verificationRequired"]) {
    assert(Object.prototype.hasOwnProperty.call(entry, field), `Knowledge ${entry.id} does not support ${field}`);
  }
  assert(Array.isArray(entry.pages) && entry.pages.length, `Knowledge ${entry.id} needs related pages`);
  assert(Array.isArray(entry.keywords) && entry.keywords.length, `Knowledge ${entry.id} needs retrieval keywords`);
  assert(expectedStatuses.includes(entry.status), `Knowledge ${entry.id} has an unsupported status`);
}

for (const requiredId of ["rail-track-capacity", "lpmh-definition-gap", "ss-dwell-timers", "ss-hold-policy-gap", "arrival-departure-policy-gap", "pivot-indicators-inferred", "operational-glossary", "known-exceptions-and-edge-cases", "verification-register", "superseded-operating-rules", "switching-authority-and-objective", "switching-orientation-access-and-legality", "switching-track-roles-and-capacity", "switching-block-tiers-and-train-ownership", "switching-blocking-modes-and-priorities", "switching-buried-blocks-and-special-handling", "switching-tactical-patterns", "switching-planning-workflow", "switching-plan-output-and-audit", "switching-default-checklist", "switching-track-803-capacity-conflict"]) {
  assert(ids.has(requiredId), `Missing operational knowledge category: ${requiredId}`);
}
const trackRule = knowledge.entries.find(entry => entry.id === "rail-track-capacity");
assert(trackRule.rules.some(rule => /Track 803 capacity:\s*2,200 ft/.test(rule)), "Track 803 capacity rule is missing");
const lpmh = knowledge.entries.find(entry => entry.id === "lpmh-definition-gap");
assert.equal(lpmh.status, "unresolved");
assert.equal(lpmh.verificationRequired, true);
const switchingOrientation = knowledge.entries.find(entry => entry.id === "switching-orientation-access-and-legality");
assert(switchingOrientation.rules.some(rule => /NORTH \/ REAR -> SOUTH \/ HEAD -> ENGINE/.test(rule)), "Switching orientation rule is missing");
assert(switchingOrientation.rules.some(rule => /South-Out Integrity/.test(rule)), "Switching move legality labels are missing");
const switchingWorkflow = knowledge.entries.find(entry => entry.id === "switching-planning-workflow");
assert(switchingWorkflow.rules.some(rule => /Option A minimal moves, Option B balanced, and Option C strict/.test(rule)), "Switching three-option gate is missing");
assert(switchingWorkflow.rules.some(rule => /do not issue the final detailed switching plan before selection/i.test(rule)), "Switching selection gate is missing");
const switchingConflict = knowledge.entries.find(entry => entry.id === "switching-track-803-capacity-conflict");
assert.equal(switchingConflict.status, "unresolved");
assert.equal(switchingConflict.verificationRequired, true);
assert(/1,750 ft/.test(switchingConflict.summary) && /2,200 ft/.test(switchingConflict.summary), "Track 803 source conflict is not preserved");

const classify = evaluateIntentClassifier(runtimeFile);
assert.deepEqual({ ...classify("What inputs are needed to forecast release?") }, { capability: "forecasting", mode: "guidance", requiresLive: false });
assert.deepEqual({ ...classify("What should reconcile to the archive?") }, { capability: "data-audit", mode: "guidance", requiresLive: false });
assert.equal(classify("Audit the current track setup").mode, "execute");
assert.equal(classify("Forecast chassis shortages").mode, "execute");
assert.equal(classify("Explain the track capacity rules", { requiresLive: true }).mode, "execute");

for (const state of ["minimized", "compact", "expanded", "hidden", "disabled"]) assert(runtimeFile.includes(`"${state}"`), `Missing state: ${state}`);
for (const capability of ["application-guidance", "data-interpretation", "data-audit", "forecasting", "scenario-comparison", "operational-suggestions", "information-gathering", "risk-detection", "report-handoff"]) assert(runtimeFile.includes(`id: "${capability}"`), `Missing capability: ${capability}`);
for (const schema of ["auditFinding", "forecastResult", "actionProposal", "notification"]) assert(runtimeFile.includes(`${schema}: Object.freeze`), `Missing foundation schema: ${schema}`);
for (const providerState of ["not-configured", "configured", "testing", "connected", "invalid-credentials", "provider-unavailable", "model-unavailable", "usage-limit", "quota-exceeded", "timeout", "request-failed"]) assert(runtimeFile.includes(`${providerState}`), `Missing provider state: ${providerState}`);
assert(runtimeFile.includes("sessionStorage.setItem(SESSION_KEY"), "Conversation must use sessionStorage");
assert(!runtimeFile.includes("localStorage.setItem(SESSION_KEY"), "Conversation must not use localStorage");
assert(runtimeFile.includes("animationMode"), "Animation preference must support an enum");
assert(!runtimeFile.includes("prefs.animations"), "Legacy Boolean animation behavior must not remain active");
assert(runtimeFile.includes("substantiveScore < 4"), "Page context must not make an unrelated prompt match knowledge");
assert(!/sk-[A-Za-z0-9_-]{20,}|OPENAI_API_KEY|apiKey\s*[:=]/.test(runtimeFile + knowledgeFile), "Assistant source contains a possible AI credential");

const once = injectAssistantShell(html);
const twice = injectAssistantShell(once);
assert.equal(digest(once), digest(twice), "Assistant injection must be idempotent");
if (fs.existsSync(mirrorPath)) assert.equal(digest(html), digest(fs.readFileSync(mirrorPath, "utf8")), "Canonical and GitHub-upload HTML must match");

console.log(`Assistant foundation checks passed: ${knowledge.entries.length} knowledge entries, one global instance, status and intent safeguards verified.`);
