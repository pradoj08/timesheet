const fs = require("fs");

const pages = [
  ["time", "Timesheet", "time-input.html"],
  ["timeMd", "Timesheet MD", "timesheet-md.html"],
  ["roster", "Schedule", "roster.html"],
  ["dayforce", "Dayforce", "dayforce.html"],
  ["compare", "Compare", "compare.html"],
  ["archive", "Archive", "archive.html"],
  ["timeOff", "Time Off", "time-off.html"],
];

function stripPageSwitcher(html) {
  return html.replace(/<nav class="page-switcher"[\s\S]*?<\/nav>\s*/g, "");
}

function escapeScriptString(value) {
  return JSON.stringify(value).replace(/<\/script/gi, "<\\/script");
}

const embedded = pages.map(([id, label, file]) => {
  const html = stripPageSwitcher(fs.readFileSync(file, "utf8"));
  return `      ${JSON.stringify(id)}: { label: ${JSON.stringify(label)}, html: ${escapeScriptString(html)} }`;
}).join(",\n");

const output = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ConGlobal Timesheet Workbook</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #fff;
      color: #000;
      font-family: Arial, Helvetica, sans-serif;
      overflow-x: hidden;
    }
    .workbook-tabs {
      width: 100%;
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
      padding: 6px 8px;
      background: #111;
      border-bottom: 2px solid #000;
      position: sticky;
      top: 0;
      z-index: 20;
    }
    .workbook-tabs button {
      min-width: 118px;
      height: 28px;
      border: 1px solid #777;
      background: #e7e6e6;
      color: #000;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
    }
    .workbook-tabs button.active {
      background: #ffff00;
      border-color: #ffff00;
    }
    .page-frame {
      width: 100%;
      border: 0;
      display: block;
      min-height: calc(100vh - 42px);
    }
    @media (max-width: 760px) {
      .workbook-tabs { padding: 5px; }
      .workbook-tabs button {
        min-width: 96px;
        font-size: 12px;
      }
    }
  </style>
</head>
<body>
  <nav class="workbook-tabs" aria-label="Workbook pages"></nav>
  <iframe class="page-frame" id="pageFrame" title="Workbook page"></iframe>
  <script>
    const pages = {
${embedded}
    };

    const tabs = document.querySelector(".workbook-tabs");
    const frame = document.getElementById("pageFrame");
    let activePage = localStorage.getItem("conglobal-active-page") || "time";

    function resizeFrame() {
      try {
        const doc = frame.contentDocument;
        if (!doc) return;
        frame.style.height = Math.max(
          doc.documentElement.scrollHeight,
          doc.body ? doc.body.scrollHeight : 0,
          window.innerHeight - tabs.offsetHeight
        ) + "px";
      } catch (error) {
        frame.style.height = "calc(100vh - 42px)";
      }
    }

    function selectPage(id) {
      activePage = pages[id] ? id : "time";
      localStorage.setItem("conglobal-active-page", activePage);
      document.querySelectorAll(".workbook-tabs button").forEach((button) => {
        button.classList.toggle("active", button.dataset.page === activePage);
      });
      frame.srcdoc = pages[activePage].html;
    }

    Object.entries(pages).forEach(([id, page]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.page = id;
      button.textContent = page.label;
      button.addEventListener("click", () => selectPage(id));
      tabs.appendChild(button);
    });

    frame.addEventListener("load", () => {
      resizeFrame();
      const doc = frame.contentDocument;
      if (!doc) return;
      doc.addEventListener("input", () => setTimeout(resizeFrame, 0));
      doc.addEventListener("click", () => setTimeout(resizeFrame, 0));
      setTimeout(resizeFrame, 100);
    });
    window.addEventListener("resize", resizeFrame);
    selectPage(activePage);
  </script>
</body>
</html>
`;

fs.writeFileSync("index.html", output);
