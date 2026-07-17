const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sourceArgument = process.argv[2];
if (!sourceArgument) {
  throw new Error("Usage: node adopt-workbook-baseline.cjs <all-in-one-index.html>");
}

const sourcePath = path.resolve(sourceArgument);
const workbookPath = path.resolve("index.html");
const pageFiles = {
  matrix: "matrix-page.html",
  matrixWide: "matrix-wide-page.html",
  amReport: "am-report-page.html",
  chassisStatus: "chassis-status-page.html",
  billing: "billing-page.html",
  excelView: "excel-view-page.html",
  roster: "roster-page.html",
  timeMd: "timesheet-md-page.html",
  timeOff: "time-off-page.html",
  audits: "audits-page.html",
  checklist: "checklist-page.html",
};

function extractEmbeddedPage(workbookHtml, pageId) {
  const entry = new RegExp(
    `\\"${pageId}\\"\\s*:\\s*\\{\\s*\\"?label\\"?\\s*:\\s*\\"[^\\"]+\\"\\s*,\\s*\\"?html\\"?\\s*:\\s*(\\"(?:\\\\.|[^\\"\\\\])*\\")`
  );
  const match = workbookHtml.match(entry);
  if (!match) throw new Error(`Could not find embedded page: ${pageId}`);
  return JSON.parse(match[1]);
}

function extractAmReportSheet(workspaceHtml) {
  const match = workspaceHtml.match(/const days = (\[[\s\S]*?\]);\s*const workspace/);
  if (!match) throw new Error("Could not find the three-day AM Report payload.");
  const days = JSON.parse(match[1]);
  const today = days.find((day) => Number(day && day.offset) === 0) || days[1];
  if (!today || typeof today.html !== "string") throw new Error("Could not find the current-day AM Report sheet.");
  return today.html.replace(
    /\s*<script>window\.AM_REPORT_DAY_OFFSET=-?\d+;window\.AM_REPORT_DAY_LABEL="(?:\\.|[^"])*";<\/script>\s*/i,
    "\n"
  );
}

function restoreTimeOffSpritePaths(html) {
  const spritePaths = [
    "assets/yard-crew/yard-crane.png",
    "assets/yard-crew/yard-flip-machine.png",
    "assets/yard-crew/yard-groundman.png",
    "assets/yard-crew/yard-hostler.png",
  ];
  return spritePaths.reduce((updated, spritePath) => {
    const dataUri = `data:image/png;base64,${fs.readFileSync(spritePath).toString("base64")}`;
    return updated.replaceAll(dataUri, spritePath);
  }, html);
}

function extractPerformancePage(billingHtml) {
  const match = billingHtml.match(/<script id="performancePageSource" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("Could not find the Performance page embedded in Billing.");
  return JSON.parse(match[1]);
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

const workbookHtml = fs.readFileSync(sourcePath, "utf8");
const extractedPages = {};
for (const pageId of Object.keys(pageFiles)) {
  let pageHtml = extractEmbeddedPage(workbookHtml, pageId);
  if (pageId === "amReport") pageHtml = extractAmReportSheet(pageHtml);
  if (pageId === "timeOff") pageHtml = restoreTimeOffSpritePaths(pageHtml);
  validatePageScripts(pageId, pageHtml);
  extractedPages[pageId] = pageHtml;
}

const performanceHtml = extractPerformancePage(extractedPages.billing);
validatePageScripts("performance", performanceHtml);

fs.writeFileSync(workbookPath, workbookHtml);
for (const [pageId, outputPath] of Object.entries(pageFiles)) {
  fs.writeFileSync(outputPath, extractedPages[pageId]);
}
fs.writeFileSync("performance-page.html", performanceHtml);

console.log(`Adopted ${sourcePath} as ${workbookPath}.`);
console.log(`Extracted ${Object.values(pageFiles).join(", ")} and performance-page.html.`);
