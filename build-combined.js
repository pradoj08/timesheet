const fs = require("fs");
const path = require("path");

const workbookPath = path.join("GITHUB UPLOAD - ONE FILE", "index.html");
const pageSources = Object.freeze({
  obsidian: "obsidian-page.html",
  amReport: "am-report-page.html",
  audits: "audits-page.html",
  time: "time-input.html",
  timeMd: "timesheet-md-page.html",
  chassisStatus: "chassis-status-page.html",
  checklist: "checklist-page.html",
  performance: "performance-page.html",
  matrixWide: "matrix-wide-page.html",
  lphTracker: "lph-tracker-page.html",
  roster: "roster-page.html",
  compare: "compare.html",
  archive: "archive-page.html",
  timeOff: "time-off-page.html",
  billing: "billing-page.html",
  excelView: "excel-view-page.html"
});

function escapeEmbeddedHtml(html) {
  return JSON.stringify(html).replace(/<\/script/gi, "<\\/script");
}

function replaceEmbeddedPage(workbook, id, sourceFile) {
  const entryStartMarker = `        ${JSON.stringify(id)}: {`;
  const entryStart = workbook.indexOf(entryStartMarker);
  if (entryStart < 0) throw new Error(`Embedded page ${id} was not found in ${workbookPath}.`);

  const entryEndMarker = "\n        },";
  const entryEnd = workbook.indexOf(entryEndMarker, entryStart);
  if (entryEnd < 0) throw new Error(`Embedded page ${id} has no closing marker.`);

  const currentEntry = workbook.slice(entryStart, entryEnd + entryEndMarker.length);
  const labelMatch = currentEntry.match(/\n\s*"label":\s*("(?:\\.|[^"\\])*")/);
  if (!labelMatch) throw new Error(`Embedded page ${id} has no label.`);

  const sourceHtml = fs.readFileSync(sourceFile, "utf8");
  const replacement = [
    entryStartMarker,
    `                "label": ${labelMatch[1]},`,
    `                "html": ${escapeEmbeddedHtml(sourceHtml)},`,
    "        },"
  ].join("\n");

  return workbook.slice(0, entryStart) + replacement + workbook.slice(entryEnd + entryEndMarker.length);
}

if (!fs.existsSync(workbookPath)) {
  throw new Error(`The modern all-in-one workbook template is missing: ${workbookPath}`);
}

const requestedPages = process.argv.slice(2);
const pageIds = requestedPages.length ? requestedPages : Object.keys(pageSources);
let workbook = fs.readFileSync(workbookPath, "utf8");

pageIds.forEach((id) => {
  const sourceFile = pageSources[id];
  if (!sourceFile) throw new Error(`Unknown page id: ${id}`);
  if (!fs.existsSync(sourceFile)) throw new Error(`Source page is missing: ${sourceFile}`);
  workbook = replaceEmbeddedPage(workbook, id, sourceFile);
  console.log(`Embedded ${id} from ${sourceFile}`);
});

fs.writeFileSync(workbookPath, workbook);
fs.writeFileSync("index.html", workbook);
console.log(`Updated ${workbookPath} and index.html without replacing the workbook shell.`);
