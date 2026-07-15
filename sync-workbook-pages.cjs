const fs = require("fs");
const vm = require("vm");

const workbookPath = "index.html";
const pages = {
  amReport: "am-report-page.html",
  chassisStatus: "chassis-status-page.html",
  billing: "billing-page.html",
  excelView: "excel-view-page.html",
  roster: "roster-page.html",
  timeMd: "timesheet-md-page.html",
  timeOff: "time-off-page.html",
  audits: "audits-page.html",
};

function stripPageSwitcher(html) {
  return html.replace(/<nav class="page-switcher"[\s\S]*?<\/nav>\s*/g, "");
}

function escapeScriptString(value) {
  return JSON.stringify(value).replace(/<\/script/gi, "<\\/script");
}

function inlineYardCrewSprites(html) {
  const spritePaths = [
    "assets/yard-crew/yard-crane.png",
    "assets/yard-crew/yard-flip-machine.png",
    "assets/yard-crew/yard-groundman.png",
    "assets/yard-crew/yard-hostler.png",
  ];
  return spritePaths.reduce((updated, spritePath) => {
    const dataUri = `data:image/png;base64,${fs.readFileSync(spritePath).toString("base64")}`;
    return updated.replaceAll(spritePath, dataUri);
  }, html);
}

function validatePageScripts(pageId, html) {
  const scripts = html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi);
  let index = 0;
  for (const match of scripts) {
    if (/type\s*=\s*["']application\/json["']/i.test(match[1])) continue;
    index += 1;
    new vm.Script(match[2], { filename: `${pageId}-inline-${index}.js` });
  }
}

function syncPerformanceIntoBilling() {
  const billingPath = "billing-page.html";
  const performanceHtml = fs.readFileSync("performance-page.html", "utf8");
  validatePageScripts("performance", performanceHtml);
  const billingHtml = fs.readFileSync(billingPath, "utf8");
  const source = /(<script id="performancePageSource" type="application\/json">)([\s\S]*?)(<\/script>)/;
  if (!source.test(billingHtml)) throw new Error("Could not find the embedded Performance page in Billing.");
  const updatedBilling = billingHtml.replace(source, (_, open, _oldSource, close) => {
    return open + escapeScriptString(performanceHtml) + close;
  });
  fs.writeFileSync(billingPath, updatedBilling);
}

syncPerformanceIntoBilling();

let output = fs.readFileSync(workbookPath, "utf8");

for (const [pageId, sourcePath] of Object.entries(pages)) {
  let pageHtml = stripPageSwitcher(fs.readFileSync(sourcePath, "utf8"));
  if (pageId === "timeOff") pageHtml = inlineYardCrewSprites(pageHtml);
  validatePageScripts(pageId, pageHtml);
  const entry = new RegExp(
    `(\\"${pageId}\\"\\s*:\\s*\\{\\s*\\"?label\\"?\\s*:\\s*\\"[^\\"]+\\"\\s*,\\s*\\"?html\\"?\\s*:\\s*)(\\"(?:\\\\.|[^\\"\\\\])*\\")`
  );
  if (!entry.test(output)) throw new Error(`Could not find embedded page: ${pageId}`);
  output = output.replace(entry, (_, prefix) => prefix + escapeScriptString(pageHtml));
}

const outerScripts = [...output.matchAll(/^\s*<script>\s*$([\s\S]*?)^\s*<\/script>\s*$/gm)];
if (!outerScripts.length) throw new Error("Could not find the workbook runtime for validation.");
new vm.Script(outerScripts.at(-1)[1], { filename: workbookPath });

fs.writeFileSync(workbookPath, output);
console.log(`Synced ${Object.keys(pages).join(", ")} into ${workbookPath}.`);
