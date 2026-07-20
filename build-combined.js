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

function injectAmReportDayContext(html, offset, label) {
  const dayScript = `<script>window.AM_REPORT_DAY_OFFSET=${offset};window.AM_REPORT_DAY_LABEL=${JSON.stringify(label)};</script>`;
  if (/<head(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(/<head(?:\s[^>]*)?>/i, (headTag) => `${headTag}\n${dayScript}`);
  }
  return dayScript + html;
}

function buildThreeDayAmReport(sourceHtml) {
  const days = [
    { offset: -1, label: "Yesterday" },
    { offset: 0, label: "Today" },
    { offset: 1, label: "Tomorrow" }
  ].map((day) => ({
    ...day,
    html: injectAmReportDayContext(sourceHtml, day.offset, day.label)
  }));
  const serializedDays = JSON.stringify(days).replace(/<\/script/gi, "<\\/script");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Three-Day AM Report</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  html,body{min-height:100%;margin:0;background:#e9eef5;color:#132238;font-family:Calibri,"Aptos Narrow",Arial,sans-serif;scrollbar-width:none;-ms-overflow-style:none}
  html::-webkit-scrollbar,body::-webkit-scrollbar{width:0;height:0;display:none}
  body{padding:8px;overflow-x:hidden}
  .am-three-day-workspace{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:start;gap:0;width:100%;margin:0 auto}
  .am-day-panel{min-width:0;overflow:hidden;border:0;background:#fff}
  .am-day-frame{display:block;width:100%;min-width:0;height:900px;border:0;background:#eef2f6;overflow:hidden}
  @media(max-width:760px){body{padding:4px}.am-three-day-workspace{grid-template-columns:1fr}}
</style>
</head>
<body>
<main class="am-three-day-workspace" aria-label="Yesterday, today, and tomorrow AM Reports"></main>
<script>
(() => {
  const days = ${serializedDays};
  const workspace = document.querySelector(".am-three-day-workspace");
  const frames = [];

  function fitHost() {
    const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 1);
    try {
      if (window.frameElement) window.frameElement.style.height = Math.ceil(height) + "px";
    } catch (_) {}
  }

  function fitFrame(frame) {
    try {
      const reportDocument = frame.contentDocument;
      if (!reportDocument) return;
      const reportRoot = reportDocument.getElementById("am-report");
      const contentHeight = reportRoot
        ? reportRoot.getBoundingClientRect().bottom + reportDocument.defaultView.scrollY
        : Math.max(reportDocument.documentElement.scrollHeight, reportDocument.body ? reportDocument.body.scrollHeight : 0);
      frame.style.height = Math.max(1, Math.ceil(contentHeight)) + "px";
      fitHost();
    } catch (_) {}
  }

  function clearOtherSelections(activeFrame) {
    frames.forEach((frame) => {
      if (frame === activeFrame) return;
      try {
        frame.contentDocument.querySelectorAll(".selected-cell, .range-selected").forEach((cell) => {
          cell.classList.remove("selected-cell", "range-selected");
          cell.removeAttribute("aria-selected");
        });
      } catch (_) {}
    });
  }

  days.forEach((day) => {
    const panel = document.createElement("section");
    panel.className = "am-day-panel";
    const frame = document.createElement("iframe");
    frame.className = "am-day-frame";
    frame.title = day.label + " AM Report";
    frame.setAttribute("scrolling", "no");
    panel.appendChild(frame);
    workspace.appendChild(panel);
    frames.push(frame);
    frame.addEventListener("load", () => {
      try {
        const reportDocument = frame.contentDocument;
        reportDocument.addEventListener("pointerdown", () => clearOtherSelections(frame));
        if (typeof ResizeObserver === "function") {
          const observer = new ResizeObserver(() => fitFrame(frame));
          observer.observe(reportDocument.documentElement);
          if (reportDocument.body) observer.observe(reportDocument.body);
        }
      } catch (_) {}
      fitFrame(frame);
      setTimeout(() => fitFrame(frame), 80);
      setTimeout(() => fitFrame(frame), 320);
      setTimeout(() => fitFrame(frame), 900);
    });
    frame.srcdoc = day.html;
  });

  window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "conglobal-toggle-todays-roster") return;
    const todayFrame = frames[1];
    if (todayFrame && todayFrame.contentWindow) todayFrame.contentWindow.postMessage(event.data, "*");
  });

  window.addEventListener("resize", () => frames.forEach(fitFrame));
})();
</script>
</body>
</html>`;
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

  const rawSourceHtml = fs.readFileSync(sourceFile, "utf8");
  const sourceHtml = id === "amReport" ? buildThreeDayAmReport(rawSourceHtml) : rawSourceHtml;
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
