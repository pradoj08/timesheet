const fs = require("fs");
const vm = require("vm");

const workbookPath = "index.html";
const pages = {
  matrix: "matrix-page.html",
  matrixWide: "matrix-wide-page.html",
  lphTracker: "lph-tracker-page.html",
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

function configureAmReportSheet(html, offset, label) {
  const config = `<script>window.AM_REPORT_DAY_OFFSET=${offset};window.AM_REPORT_DAY_LABEL=${JSON.stringify(label)};</script>`;
  return html.replace(/<head\b[^>]*>/i, match => match + "\n" + config);
}

function buildAmReportWorkspace(sheetHtml) {
  const dayDefinitions = [
    { offset:-1, label:"Yesterday" },
    { offset:0, label:"Today" },
    { offset:1, label:"Tomorrow" },
  ].map(day => ({
    ...day,
    html:configureAmReportSheet(sheetHtml, day.offset, day.label),
  }));
  const dayPayload = escapeScriptString(dayDefinitions);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Three-Day AM Report</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  html,body{min-height:100%;margin:0;background:#e9eef5;color:#132238;font-family:Calibri,"Aptos Narrow",Arial,sans-serif}
  body{padding:8px;overflow-x:hidden}
  .am-three-day-workspace{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:start;gap:0;width:100%;max-width:none;margin:0 auto}
  .am-day-panel{min-width:0;overflow:hidden;border:1px solid #a9b8cc;border-radius:12px;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.09)}
  .am-day-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:42px;padding:8px 12px;border-bottom:1px solid #cbd5e1;background:#132238;color:#fff}
  .am-day-heading strong{font-size:15px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
  .am-day-heading span{color:#dbeafe;font-size:13px;font-weight:800}
  .am-day-frame{display:block;width:100%;min-width:0;height:900px;border:0;background:#eef2f6;overflow:hidden}
  @media(max-width:900px){body{padding:4px}.am-three-day-workspace{gap:0}.am-day-heading{padding:6px}.am-day-heading strong{font-size:11px}.am-day-heading span{font-size:10px}}
</style>
</head>
<body>
<main class="am-three-day-workspace" aria-label="Yesterday, today, and tomorrow AM Reports"></main>
<script>
(() => {
  const days = ${dayPayload};
  const workspace = document.querySelector(".am-three-day-workspace");
  const frames = [];
  const clearFrameSelection = frame => {
    try {
      const reportDocument = frame.contentDocument;
      if (!reportDocument) return;
      reportDocument.querySelectorAll(".selected-cell, .range-selected").forEach(cell => {
        cell.classList.remove("selected-cell", "range-selected");
        cell.removeAttribute("aria-selected");
      });
    } catch (_) {}
  };
  const formatDate = offset => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date.toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" });
  };
  days.forEach(day => {
    const panel = document.createElement("section");
    panel.className = "am-day-panel";
    panel.innerHTML = '<header class="am-day-heading"><strong></strong><span></span></header><iframe class="am-day-frame" title=""></iframe>';
    panel.querySelector("strong").textContent = day.label;
    panel.querySelector("span").textContent = formatDate(day.offset);
    const frame = panel.querySelector("iframe");
    frame.title = day.label + " AM Report";
    frames.push(frame);
    workspace.appendChild(panel);
    frame.addEventListener("load", () => {
      try {
        const reportDocument = frame.contentDocument;
        reportDocument.addEventListener("pointerdown", event => {
          const target = event.target;
          if (target && target.closest && target.closest(".sheet-grid td.sheet-cell, .sheet-editor-toolbar, .sheet-formula-row, .sheet-dropdown-modal")) return;
          clearFrameSelection(frame);
        });
      } catch (_) {}
      const fit = () => {
        try {
          const reportDocument = frame.contentDocument;
          const reportRoot = reportDocument.getElementById("am-report");
          const bodyStyle = reportDocument.defaultView.getComputedStyle(reportDocument.body);
          const paddingBottom = parseFloat(bodyStyle.paddingBottom) || 0;
          const contentHeight = reportRoot
            ? reportRoot.offsetTop + reportRoot.offsetHeight + paddingBottom
            : reportDocument.body.scrollHeight;
          const nextHeight = Math.max(1, Math.ceil(contentHeight + 2));
          if (Math.abs((parseFloat(frame.style.height) || 0) - nextHeight) > 1) {
            frame.style.height = nextHeight + "px";
          }
        } catch (_) {}
      };
      fit();
      requestAnimationFrame(fit);
      setTimeout(fit, 120);
      setTimeout(fit, 500);
      try {
        if (typeof ResizeObserver === "function") {
          new ResizeObserver(fit).observe(frame.contentDocument.body);
        }
      } catch (_) {}
    });
    frame.srcdoc = day.html;
  });
  document.addEventListener("pointerdown", event => {
    const target = event.target;
    if (target && target.closest && target.closest(".am-day-frame")) return;
    frames.forEach(clearFrameSelection);
  });
  window.addEventListener("message", event => {
    if (!frames.some(frame => frame.contentWindow === event.source)) return;
    if (!event.data || !["conglobal-open-mass-export", "conglobal-open-audits-popup", "conglobal-open-checklist-popup"].includes(event.data.type)) return;
    window.parent.postMessage(event.data, "*");
  });
  // Rebuild all three dated frames just after local midnight. Their absolute
  // date keys rotate tomorrow -> today -> yesterday without copying state.
  const nextMidnight = new Date();
  nextMidnight.setHours(24, 0, 2, 0);
  window.setTimeout(() => window.location.reload(), Math.max(1000, nextMidnight.getTime() - Date.now()));
})();
</script>
</body>
</html>`;
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
  if (pageId === "amReport") {
    validatePageScripts("amReportSheet", pageHtml);
    pageHtml = buildAmReportWorkspace(pageHtml);
  }
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
