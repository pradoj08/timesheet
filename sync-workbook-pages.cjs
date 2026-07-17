const fs = require("fs");
const vm = require("vm");

const workbookPath = "index.html";
const pages = {
  matrix: "matrix-page.html",
  matrixWide: "matrix-wide-page.html",
  superBash: "super-bash-page.html",
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

function configureSuperBashPage(html) {
  // The upstream single-file build still loads its large runtime media from
  // /assets. Root-relative paths resolve to the drive root under file://, so
  // point them at the asset package carried beside this workbook instead.
  return html
    .replaceAll("/assets/", "assets/super-bash/")
    .replaceAll("./favicon.svg", "assets/super-bash/favicon.svg");
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
  .am-roster-float{position:fixed;z-index:1000;top:76px;left:50%;width:min(470px,calc(100vw - 24px));max-height:calc(100vh - 92px);transform:translateX(-50%);overflow:hidden;border:2px solid #22344d;border-radius:8px;background:#f8fafc;box-shadow:0 20px 55px rgba(15,23,42,.38)}
  .am-roster-float[hidden]{display:none!important}
  .am-roster-float.dragging{opacity:.96;user-select:none}
  .am-roster-titlebar{display:flex;align-items:center;justify-content:space-between;min-height:36px;padding:5px 7px 5px 12px;background:#0f1b31;color:#fff;cursor:move;touch-action:none}
  .am-roster-titlebar strong{font-size:13px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
  .am-roster-close{width:27px;height:26px;border:1px solid #64748b;border-radius:4px;background:#16263d;color:#fff;font-size:19px;font-weight:900;line-height:1;cursor:pointer}
  .am-roster-date{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:7px 10px;border-bottom:2px solid #263950;background:#eef2f7;color:#14213a;font-weight:900}
  .am-roster-date strong{font-size:18px;text-transform:uppercase}.am-roster-date em{justify-self:center;color:#52617a;font-size:11px;font-style:normal;letter-spacing:.09em;text-transform:uppercase}.am-roster-date b{justify-self:end;font-size:24px}
  .am-roster-body{max-height:calc(100vh - 155px);overflow:auto;padding:0}
  .am-roster-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0}
  .am-roster-shift{min-width:0;overflow:hidden;background:#fff}.am-roster-shift:first-child{border-right:1px solid #9aa9bc}
  .am-roster-shift-head{display:flex;align-items:center;min-height:27px;padding:5px 8px;background:#263950;color:#fff;font-size:12px;font-weight:900;letter-spacing:.05em;text-transform:uppercase}
  .am-roster-person{display:grid;grid-template-columns:minmax(0,1fr) auto;width:100%;min-height:28px;align-items:center;gap:5px;padding:4px 7px;border:0;border-bottom:1px solid #cbd5e1;background:#fff;color:#172033;text-align:left;cursor:pointer}
  .am-roster-person:hover,.am-roster-person:focus-visible{position:relative;z-index:1;outline:2px solid #2563eb;outline-offset:-2px}
  .am-roster-person.is-off{background:#dfe7f0;color:#4b5c74}.am-roster-person.is-present{background:#d6f7df;color:#126430}.am-roster-person.is-warning{background:#fff0be;color:#8a5100}.am-roster-person.is-sick{background:#ffe0e4;color:#b42336}.am-roster-person.is-vacation{background:#f1e6ff;color:#6d28d9}
  .am-roster-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:850}.am-roster-flags{display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:950;white-space:nowrap}.am-roster-unassigned{color:#dc2626}
  .am-roster-total{display:flex;align-items:center;justify-content:space-between;min-height:28px;padding:5px 8px;border-top:1px solid #263950;background:#ffe1e5;color:#b10e2d;font-size:13px;font-weight:950}
  .am-roster-save-note{padding:6px 8px;background:#f8fafc;color:#52617a;font-size:10px;font-weight:700;text-align:center}
  .am-quick-actions{position:fixed;z-index:1010;width:min(390px,calc(100vw - 16px));overflow:hidden;border:1px solid #9aa9bc;border-radius:5px;background:#f8fafc;box-shadow:0 16px 40px rgba(15,23,42,.38)}.am-quick-actions[hidden]{display:none!important}
  .am-quick-titlebar{display:flex;align-items:center;justify-content:space-between;min-height:34px;padding:5px 7px 5px 10px;background:#0f1b31;color:#fff}.am-quick-titlebar strong{font-size:12px;font-weight:900}.am-quick-close{width:25px;height:24px;padding:0;border:1px solid #64748b;border-radius:3px;background:#16263d;color:#fff;font-size:18px;font-weight:900;line-height:1;cursor:pointer}
  .am-quick-name{padding:8px 10px 6px;background:#fff;color:#172033;font-size:13px;font-weight:900}.am-quick-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:0 7px 7px}.am-quick-column{overflow:hidden;border:1px solid #c4cfdd;border-radius:4px;background:#f8fafc}.am-quick-column h3{display:flex;align-items:center;justify-content:space-between;margin:0;padding:6px 7px;background:#edf2f7;color:#425168;font-size:10px;font-weight:950;letter-spacing:.05em;text-transform:uppercase}.am-quick-column h3 span{font-size:8px;color:#718096}
  .am-quick-action{display:flex;width:100%;min-height:29px;align-items:center;justify-content:space-between;padding:5px 8px;border:0;border-top:1px solid #cbd5e1;background:#fff;color:#172033;font:900 12px/1.1 Calibri,Arial,sans-serif;text-align:left;cursor:pointer}.am-quick-action span{font-size:9px}.am-quick-action:hover:not(:disabled),.am-quick-action:focus-visible:not(:disabled){outline:2px solid #2563eb;outline-offset:-2px}.am-quick-action.active{box-shadow:inset 0 0 0 2px #d69e00}.am-quick-action:disabled{background:#f1f5f9;color:#9aa5b5;cursor:not-allowed}
  .am-quick-action.here,.am-quick-action.flipline{background:#d6f7df;color:#126430}.am-quick-action.sic,.am-quick-action.calledoff,.am-quick-action.ncns{background:#ffe0e4;color:#b42336}.am-quick-action.vac{background:#f1e6ff;color:#6d28d9}.am-quick-action.out,.am-quick-action.unknown{background:#dfe7f0;color:#34445c}.am-quick-action.bnsf{background:#ffe5ea;color:#b42336}.am-quick-action.hostler,.am-quick-action.traineehostler{background:#fff2c6;color:#8a5100}.am-quick-action.groundman,.am-quick-action.traineegroundman{background:#ffead5;color:#9a3412}.am-quick-action.flipoperator{background:#eee5ff;color:#6d28d9}.am-quick-action.crane1,.am-quick-action.crane2{background:#dbeafe;color:#1d4ed8}.am-quick-action.clear{background:#f8fafc;color:#52617a}
  .am-quick-times{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:0 7px 7px}.am-quick-time-card{overflow:hidden;border:1px solid #c4cfdd;border-radius:4px;background:#fff}.am-quick-time-card h3{margin:0;padding:6px 7px;background:#263950;color:#fff;font-size:10px;font-weight:950;letter-spacing:.06em;text-align:center;text-transform:uppercase}.am-quick-time-row{display:grid;grid-template-columns:minmax(46px,1fr) minmax(74px,1.35fr) minmax(46px,1fr);align-items:center;gap:4px;padding:5px}.am-quick-time-row+.am-quick-time-row{padding-top:0}.am-quick-time-value{width:100%;height:30px;min-width:0;border:1px solid #8fa1b8;border-radius:4px;background:#f8fafc;color:#14213a;font-size:13px;font-weight:900;text-align:center}.am-quick-time-step{height:28px;min-width:0;padding:0 4px;border:1px solid #94a3b8;border-radius:4px;background:#eaf0f7;color:#22344d;font-size:10px;font-weight:950;cursor:pointer}.am-quick-time-step:hover,.am-quick-time-step:focus-visible{border-color:#2563eb;background:#dbeafe;outline:2px solid #2563eb;outline-offset:-2px}.am-quick-time-hint{color:#64748b;font-size:8px;font-weight:900;line-height:1.05;text-align:center;text-transform:uppercase}
  .am-quick-message{min-height:24px;padding:5px 8px;border-top:1px solid #cbd5e1;background:#fff;color:#52617a;font-size:10px;font-weight:700}
  @media(max-width:900px){body{padding:4px}.am-three-day-workspace{gap:0}.am-day-heading{padding:6px}.am-day-heading strong{font-size:11px}.am-day-heading span{font-size:10px}.am-roster-float{top:50px}.am-roster-body{max-height:calc(100vh - 128px)}}
</style>
</head>
<body>
<main class="am-three-day-workspace" aria-label="Yesterday, today, and tomorrow AM Reports"></main>
<section class="am-roster-float" id="amRosterFloat" role="dialog" aria-modal="false" aria-labelledby="amRosterTitle" hidden>
  <div class="am-roster-titlebar" id="amRosterHandle"><strong id="amRosterTitle">Current Day Roster</strong><button class="am-roster-close" id="amRosterClose" type="button" aria-label="Close roster">&times;</button></div>
  <div class="am-roster-date"><strong id="amRosterWeekday"></strong><em>Today</em><b id="amRosterDayNumber"></b></div>
  <div class="am-roster-body"><div class="am-roster-columns" id="amRosterColumns"></div><div class="am-roster-save-note" id="amRosterNote">Changes save immediately and are shared with Timesheet.</div></div>
</section>
<section class="am-quick-actions" id="amQuickActions" role="dialog" aria-modal="false" aria-labelledby="amQuickTitle" hidden>
  <div class="am-quick-titlebar"><strong id="amQuickTitle">Quick Actions</strong><button class="am-quick-close" id="amQuickClose" type="button" aria-label="Close quick actions">&times;</button></div>
  <div class="am-quick-name" id="amQuickName"></div>
  <div class="am-quick-columns"><section class="am-quick-column"><h3>Status <span>Selected day</span></h3><div id="amQuickStatuses"></div></section><section class="am-quick-column"><h3>Today's role <span id="amQuickRoleShift"></span></h3><div id="amQuickRoles"></div></section></div>
  <div class="am-quick-times" aria-label="Employee clock times">
    <section class="am-quick-time-card"><h3>Clocked in</h3><div class="am-quick-time-row"><button class="am-quick-time-step" type="button" data-quick-time="start" data-time-delta="-60">&#8722;1 hr</button><input class="am-quick-time-value" id="amQuickClockIn" type="time" step="600" value="03:00"><button class="am-quick-time-step" type="button" data-quick-time="start" data-time-delta="60">+1 hr</button></div><div class="am-quick-time-row"><button class="am-quick-time-step" type="button" data-quick-time="start" data-time-delta="-10">&#8722;10m</button><span class="am-quick-time-hint">10-minute<br>steps</span><button class="am-quick-time-step" type="button" data-quick-time="start" data-time-delta="10">+10m</button></div></section>
    <section class="am-quick-time-card"><h3>Clocking out</h3><div class="am-quick-time-row"><button class="am-quick-time-step" type="button" data-quick-time="end" data-time-delta="-60">&#8722;1 hr</button><input class="am-quick-time-value" id="amQuickClockOut" type="time" step="600" value="15:00"><button class="am-quick-time-step" type="button" data-quick-time="end" data-time-delta="60">+1 hr</button></div><div class="am-quick-time-row"><button class="am-quick-time-step" type="button" data-quick-time="end" data-time-delta="-10">&#8722;10m</button><span class="am-quick-time-hint">10-minute<br>steps</span><button class="am-quick-time-step" type="button" data-quick-time="end" data-time-delta="10">+10m</button></div></section>
  </div>
  <div class="am-quick-message" id="amQuickMessage"></div>
</section>
<script>
(() => {
  const days = ${dayPayload};
  const workspace = document.querySelector(".am-three-day-workspace");
  const frames = [];
  const rosterFloat = document.getElementById("amRosterFloat");
  const rosterColumns = document.getElementById("amRosterColumns");
  const rosterNote = document.getElementById("amRosterNote");
  const rosterDefaults = {
    first:["Branford Alton","Castruita Armando","Frazer Dacoyea","Citizen Dante","Towler Demetrius","Stewart Dexter","Gardner Dorrean","Thomas Henry","Brown James","Herrera Jose","Player Keyston","Hickman Makia","Dever Mikey","Wanza Myles","Romero Nelson","McDaniel Charles","Nava Ramon","Tran Tyler"],
    second:["Carruthers Timothy","Caceres Virula Victor","Keme Aweri Jr.","Hosey Kevin","Brown Brandy","Mejia Aaron","Bookman Derrell","Hopkins Alexander","Tingle Jason","Contreras Marco","Benavides Robert","Urtado Ernest","Johnson Messiah","Gilder Rufus II","Echendu Chimenierm","Delgado Jose"]
  };
  const statusOptions = [["here","Here","✓"],["flipline","Flip Line","FL"],["sic","Sick","S"],["vac","Vacation","V"],["calledoff","Called Off","CO"],["out","Out","O"],["ncns","NCNS","NC"],["bnsf","BNSF","BN"],["unknown","Unknown","??"],["clear","Clear Selection","—"]];
  const roleOptions = [["hostler","Hostler","H"],["groundman","Groundman","G"],["traineehostler","Trainee Hostler","TH"],["traineegroundman","Trainee Groundman","TG"],["flipoperator","Flip Operator","FO"],["crane1","Crane 1","C1"],["crane2","Crane 2","C2"],["clear","Clear Role","—"]];
  const readJson = (key, fallback) => {
    try { const value = JSON.parse(localStorage.getItem(key) || "null"); return value == null ? fallback : value; }
    catch (_) { return fallback; }
  };
  const dateKey = date => date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2,"0") + "-" + String(date.getDate()).padStart(2,"0");
  const normalizeName = name => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\\bbranford atton\\b/g,"branford alton").trim();
  const escapeHtml = value => String(value == null ? "" : value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
  const rosterEmployees = () => {
    const result = { first:rosterDefaults.first.map(name => ({name:name,days:null})), second:rosterDefaults.second.map(name => ({name:name,days:null})) };
    const saved = readJson("conglobal-roster-state-v1", null);
    ["first","second"].forEach(shift => {
      if (saved && Array.isArray(saved[shift]) && saved[shift].length) result[shift] = saved[shift].filter(item => item && item.name).map(item => ({ name:String(item.name), days:Array.isArray(item.days) ? item.days.slice(0,7) : null }));
    });
    const seen = new Set(result.first.concat(result.second).map(item => normalizeName(item.name)));
    const additions = readJson("conglobal-roster-additions-v1", []);
    if (Array.isArray(additions)) additions.forEach(item => {
      if (!item || !item.name || !result[item.shift]) return;
      const key = normalizeName(item.name);
      if (!key || seen.has(key)) return;
      result[item.shift].push({ name:String(item.name), days:Array.isArray(item.days) ? item.days.slice(0,7) : null });
      seen.add(key);
    });
    return result;
  };
  const isScheduled = (employee, today) => {
    if (!Array.isArray(employee.days)) return true;
    const mondayIndex = (today.getDay() + 6) % 7;
    return String(employee.days[mondayIndex] || "W").toUpperCase() !== "O";
  };
  const explicitStatus = (name, today) => {
    const key = normalizeName(name);
    const day = dateKey(today);
    const timeOff = readJson("conglobal-time-off-calendar-v1", {});
    const absence = Array.isArray(timeOff[day]) ? timeOff[day].find(item => normalizeName(item && item.name) === key) : null;
    if (absence) return String(absence.code || "").toUpperCase() === "SIC" ? "sic" : "vac";
    const statuses = readJson("conglobal-time-off-day-status-v1", {});
    if (statuses[day] && statuses[day][key]) return statuses[day][key];
    const punches = readJson("conglobal-dayforce-punches-v1", []);
    if (Array.isArray(punches) && punches.some(punch => normalizeName(punch && punch.name) === key && (!punch.date || String(punch.date).slice(0,10) === day) && (punch.start || punch.end))) return "here";
    const bank = readJson("conglobal-time-off-employee-bank-v1", {});
    return statusOptions.some(option => option[0] === bank[key]) ? bank[key] : "";
  };
  const assignedRole = (name, shift, today) => {
    const state = readJson("conglobal-three-day-yard-crew-v1", {});
    const assignments = state[dateKey(today)] && state[dateKey(today)][shift];
    if (!assignments || typeof assignments !== "object") return "";
    const match = Object.entries(assignments).find(entry => normalizeName(entry[0]) === normalizeName(name));
    return match && roleOptions.some(option => option[0] === match[1]) ? match[1] : "";
  };
  const statusClass = (status, scheduled) => {
    if (["sic","vac","calledoff","out","ncns"].includes(status) || (!status && !scheduled)) return "is-off";
    if (["here","flipline","bnsf"].includes(status)) return "is-present";
    if (status === "unknown") return "is-warning";
    return "";
  };
  const saveStatus = (name, status, today) => {
    const day = dateKey(today);
    const key = normalizeName(name);
    const calendar = readJson("conglobal-time-off-calendar-v1", {});
    const entries = Array.isArray(calendar[day]) ? calendar[day] : [];
    calendar[day] = entries.filter(item => normalizeName(item && item.name) !== key);
    if (status === "vac" || status === "sic") calendar[day].push({ date:day, name:name, code:status.toUpperCase(), reason:status === "sic" ? "Sick" : "Vacation", location:"", sheet:"AM Report" });
    if (!calendar[day].length) delete calendar[day];
    localStorage.setItem("conglobal-time-off-calendar-v1", JSON.stringify(calendar));
    const statuses = readJson("conglobal-time-off-day-status-v1", {});
    if (!statuses[day] || typeof statuses[day] !== "object") statuses[day] = {};
    if (!status || status === "vac" || status === "sic") delete statuses[day][key]; else statuses[day][key] = status;
    if (!Object.keys(statuses[day]).length) delete statuses[day];
    localStorage.setItem("conglobal-time-off-day-status-v1", JSON.stringify(statuses));
    localStorage.removeItem("conglobal-current-day-roster-snapshot-v1");
  };
  const saveRole = (name, role, shift, today) => {
    const day = dateKey(today);
    const state = readJson("conglobal-three-day-yard-crew-v1", {});
    if (!state[day] || typeof state[day] !== "object") state[day] = {};
    if (!state[day][shift] || typeof state[day][shift] !== "object") state[day][shift] = {};
    const assignments = state[day][shift];
    Object.keys(assignments).forEach(assignedName => {
      if (normalizeName(assignedName) === normalizeName(name) || ((role === "crane1" || role === "crane2") && assignments[assignedName] === role)) delete assignments[assignedName];
    });
    if (role) assignments[name] = role;
    localStorage.setItem("conglobal-three-day-yard-crew-v1", JSON.stringify(state));
    localStorage.removeItem("conglobal-current-day-roster-snapshot-v1");
  };
  const quickActions = document.getElementById("amQuickActions");
  const quickStatuses = document.getElementById("amQuickStatuses");
  const quickRoles = document.getElementById("amQuickRoles");
  const quickClockIn = document.getElementById("amQuickClockIn");
  const quickClockOut = document.getElementById("amQuickClockOut");
  let quickEmployee = null;
  let quickStatusChosen = false;
  let quickRoleChosen = false;
  const actionHtml = (options, kind) => options.map(option => '<button class="am-quick-action ' + option[0] + '" type="button" data-quick-' + kind + '="' + option[0] + '"><b>' + option[1] + '</b><span>(' + option[2] + ')</span></button>').join("");
  quickStatuses.innerHTML = actionHtml(statusOptions.filter(option => option[0] !== "flipline"),"status");
  quickRoles.innerHTML = actionHtml(roleOptions,"role");
  const employeeRecord = (name, shift) => rosterEmployees()[shift].find(employee => normalizeName(employee.name) === normalizeName(name)) || { name:name, days:null };
  const workingToday = (employee, status, today) => {
    if (["sic","vac","calledoff","out","ncns"].includes(status)) return false;
    if (["here","flipline","bnsf"].includes(status)) return true;
    return isScheduled(employee,today);
  };
  const punchDateKey = value => {
    const text = String(value || "").trim();
    const iso = text.match(/^(\\d{4}-\\d{2}-\\d{2})/);
    if (iso) return iso[1];
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? "" : dateKey(parsed);
  };
  const timeValueMinutes = (value, fallback) => {
    const text = String(value || "").trim();
    const match = text.match(/(\\d{1,2}):(\\d{2})\\s*(AM|PM)?/i);
    if (!match) return fallback;
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const meridiem = String(match[3] || "").toUpperCase();
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59 || hours > 23) return fallback;
    if (meridiem) {
      if (hours < 1 || hours > 12) return fallback;
      if (hours === 12) hours = 0;
      if (meridiem === "PM") hours += 12;
    }
    return hours * 60 + minutes;
  };
  const minutesToInputTime = minutes => {
    const normalized = ((Number(minutes) || 0) % 1440 + 1440) % 1440;
    return String(Math.floor(normalized / 60)).padStart(2,"0") + ":" + String(normalized % 60).padStart(2,"0");
  };
  const minutesToPunchTime = minutes => {
    const normalized = ((Number(minutes) || 0) % 1440 + 1440) % 1440;
    const hour24 = Math.floor(normalized / 60);
    const minute = normalized % 60;
    const hour12 = hour24 % 12 || 12;
    return hour12 + ":" + String(minute).padStart(2,"0") + " " + (hour24 >= 12 ? "PM" : "AM");
  };
  const currentPunch = (name, today) => {
    const punches = readJson("conglobal-dayforce-punches-v1", []);
    if (!Array.isArray(punches)) return null;
    const day = dateKey(today);
    return punches.find(punch => normalizeName(punch && punch.name) === normalizeName(name) && (!punch.date || punchDateKey(punch.date) === day)) || null;
  };
  const syncQuickTimes = () => {
    if (!quickEmployee) return;
    const punch = currentPunch(quickEmployee.name,new Date());
    quickClockIn.value = minutesToInputTime(timeValueMinutes(punch && punch.start,180));
    quickClockOut.value = minutesToInputTime(timeValueMinutes(punch && punch.end,900));
  };
  const saveQuickTimes = () => {
    if (!quickEmployee) return;
    const today = new Date();
    const day = dateKey(today);
    let punches = readJson("conglobal-dayforce-punches-v1", []);
    if (!Array.isArray(punches)) punches = [];
    const index = punches.findIndex(punch => normalizeName(punch && punch.name) === normalizeName(quickEmployee.name) && (!punch.date || punchDateKey(punch.date) === day));
    const next = index >= 0 ? Object.assign({},punches[index]) : { source:"am-report", name:quickEmployee.name, date:day, lunch:"" };
    next.name = quickEmployee.name;
    next.date = day;
    next.start = minutesToPunchTime(timeValueMinutes(quickClockIn.value,180));
    next.end = minutesToPunchTime(timeValueMinutes(quickClockOut.value,900));
    if (index >= 0) punches[index] = next; else punches.push(next);
    localStorage.setItem("conglobal-dayforce-punches-v1",JSON.stringify(punches));
    localStorage.removeItem("conglobal-current-day-roster-snapshot-v1");
    rosterNote.textContent = quickEmployee.name + " clock times saved. Changes are shared with Timesheet.";
    renderRoster();
  };
  const rosterStatusCode = status => {
    const option = statusOptions.find(item => item[0] === status);
    return option && option[0] !== "clear" ? option[2] : "";
  };
  const rosterRoleCode = role => {
    const option = roleOptions.find(item => item[0] === role);
    if (!option || option[0] === "clear") return "";
    return {crane1:"C",crane2:"C",groundman:"G",traineegroundman:"TG",hostler:"H",traineehostler:"TH",flipoperator:"FL"}[role] || option[2];
  };
  const renderRoster = () => {
    const today = new Date();
    const roster = rosterEmployees();
    document.getElementById("amRosterWeekday").textContent = today.toLocaleDateString(undefined,{weekday:"short"});
    document.getElementById("amRosterDayNumber").textContent = String(today.getDate());
    rosterColumns.innerHTML = ["first","second"].map(shift => {
      const label = shift === "first" ? "Day" : "Night";
      let total = 0;
      const rows = roster[shift].map((employee,index) => {
        const status = explicitStatus(employee.name,today);
        const role = assignedRole(employee.name,shift,today);
        const works = workingToday(employee,status,today);
        if (works) total += 1;
        return { employee:employee, status:status, role:role, works:works, index:index };
      }).sort((left,right) => Number(right.works) - Number(left.works) || left.index - right.index).map(item => {
        const safeName = escapeHtml(item.employee.name);
        const statusCode = rosterStatusCode(item.status) || (item.works ? "✓" : "O");
        const roleCode = rosterRoleCode(item.role);
        const className = item.status === "sic" ? "is-sick" : item.status === "vac" ? "is-vacation" : statusClass(item.status,isScheduled(item.employee,today));
        const unassigned = item.works && !roleCode ? '<span class="am-roster-unassigned" title="Role not assigned">⚑</span>' : "";
        return '<button class="am-roster-person ' + className + '" type="button" data-roster-name="' + safeName + '" data-roster-shift="' + shift + '"><span class="am-roster-name" title="' + safeName + '">' + safeName + '</span><span class="am-roster-flags"><span>(' + statusCode + ')</span>' + (roleCode ? '<span>(' + roleCode + ')</span>' : unassigned) + '</span></button>';
      }).join("");
      return '<section class="am-roster-shift"><div class="am-roster-shift-head">' + label + '</div>' + rows + '<div class="am-roster-total"><span>Total</span><span>' + total + '</span></div></section>';
    }).join("");
  };
  const syncQuickActions = () => {
    if (!quickEmployee) return;
    const today = new Date();
    const employee = employeeRecord(quickEmployee.name,quickEmployee.shift);
    const status = explicitStatus(quickEmployee.name,today);
    const role = assignedRole(quickEmployee.name,quickEmployee.shift,today);
    const working = workingToday(employee,status,today);
    document.getElementById("amQuickName").textContent = quickEmployee.name + " - " + today.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric"});
    document.getElementById("amQuickRoleShift").textContent = working ? (quickEmployee.shift === "first" ? "Day shift" : "Night shift") : "Not working";
    quickStatuses.querySelectorAll("[data-quick-status]").forEach(button => {
      const active = button.dataset.quickStatus === status || (!status && button.dataset.quickStatus === "clear");
      button.classList.toggle("active",active);
      button.setAttribute("aria-pressed",String(active));
    });
    quickRoles.querySelectorAll("[data-quick-role]").forEach(button => {
      const active = button.dataset.quickRole === role || (!role && button.dataset.quickRole === "clear");
      button.classList.toggle("active",active);
      button.setAttribute("aria-pressed",String(active));
      button.disabled = !working;
    });
    syncQuickTimes();
    document.getElementById("amQuickMessage").textContent = working
      ? "Choose status and role, then adjust clock times as needed. Hour buttons change 1 hour; minute buttons change 10 minutes."
      : "Choose a status. Clock times default to 3:00 AM - 3:00 PM and can still be adjusted.";
  };
  const closeQuickActions = () => { quickActions.hidden = true; quickEmployee = null; };
  const positionQuickActions = anchor => {
    const rect = anchor.getBoundingClientRect();
    const width = quickActions.offsetWidth || 390;
    const height = quickActions.offsetHeight || 545;
    let left = rect.right + 6;
    if (left + width > window.innerWidth - 6) left = rect.left - width - 6;
    left = Math.max(6,Math.min(left,window.innerWidth - width - 6));
    const top = Math.max(6,Math.min(rect.top,window.innerHeight - height - 6));
    quickActions.style.left = Math.round(left) + "px";
    quickActions.style.top = Math.round(top) + "px";
  };
  const openQuickActions = (name,shift,anchor) => {
    quickEmployee = { name:name, shift:shift };
    quickStatusChosen = false;
    quickRoleChosen = false;
    quickActions.hidden = false;
    syncQuickActions();
    positionQuickActions(anchor);
  };
  const finishQuickAction = message => {
    rosterNote.textContent = message + " Changes are shared with Timesheet.";
    renderRoster();
    syncQuickActions();
    if (quickStatusChosen && quickRoleChosen) closeQuickActions();
  };
  const openRoster = () => { renderRoster(); rosterFloat.hidden = false; };
  const closeRoster = () => { closeQuickActions(); rosterFloat.hidden = true; };
  rosterColumns.addEventListener("click", event => {
    const person = event.target.closest("[data-roster-name]");
    if (person) openQuickActions(person.dataset.rosterName,person.dataset.rosterShift,person);
  });
  quickStatuses.addEventListener("click", event => {
    const action = event.target.closest("[data-quick-status]");
    if (!action || !quickEmployee) return;
    const today = new Date();
    const current = explicitStatus(quickEmployee.name,today);
    const selected = action.dataset.quickStatus;
    const next = selected === "clear" || selected === current ? "" : selected;
    saveStatus(quickEmployee.name,next,today);
    const employee = employeeRecord(quickEmployee.name,quickEmployee.shift);
    if (!workingToday(employee,next,today)) saveRole(quickEmployee.name,"",quickEmployee.shift,today);
    quickStatusChosen = true;
    finishQuickAction(quickEmployee.name + " attendance saved.");
  });
  quickRoles.addEventListener("click", event => {
    const action = event.target.closest("[data-quick-role]");
    if (!action || action.disabled || !quickEmployee) return;
    const today = new Date();
    const current = assignedRole(quickEmployee.name,quickEmployee.shift,today);
    const selected = action.dataset.quickRole;
    const next = selected === "clear" || selected === current ? "" : selected;
    saveRole(quickEmployee.name,next,quickEmployee.shift,today);
    quickRoleChosen = true;
    finishQuickAction(quickEmployee.name + " role saved.");
  });
  quickActions.addEventListener("click", event => {
    const button = event.target.closest("[data-quick-time][data-time-delta]");
    if (!button || !quickEmployee) return;
    const input = button.dataset.quickTime === "end" ? quickClockOut : quickClockIn;
    const fallback = button.dataset.quickTime === "end" ? 900 : 180;
    input.value = minutesToInputTime(timeValueMinutes(input.value,fallback) + Number(button.dataset.timeDelta || 0));
    saveQuickTimes();
  });
  [quickClockIn,quickClockOut].forEach(input => input.addEventListener("change",saveQuickTimes));
  document.getElementById("amQuickClose").addEventListener("click",closeQuickActions);
  document.getElementById("amRosterClose").addEventListener("click",closeRoster);
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (!quickActions.hidden) closeQuickActions(); else if (!rosterFloat.hidden) closeRoster();
  });
  window.addEventListener("storage", event => {
    if (["conglobal-roster-state-v1","conglobal-roster-additions-v1","conglobal-time-off-calendar-v1","conglobal-time-off-day-status-v1","conglobal-time-off-employee-bank-v1","conglobal-dayforce-punches-v1","conglobal-three-day-yard-crew-v1"].includes(event.key)) {
      if (!rosterFloat.hidden) renderRoster();
      if (!quickActions.hidden) syncQuickActions();
    }
  });
  (() => {
    const handle = document.getElementById("amRosterHandle");
    let drag = null;
    handle.addEventListener("pointerdown", event => {
      if (event.target.closest("button")) return;
      closeQuickActions();
      const rect = rosterFloat.getBoundingClientRect();
      rosterFloat.style.left = rect.left + "px";
      rosterFloat.style.top = rect.top + "px";
      rosterFloat.style.transform = "none";
      drag = { x:event.clientX - rect.left, y:event.clientY - rect.top };
      rosterFloat.classList.add("dragging");
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", event => {
      if (!drag) return;
      const left = Math.max(4,Math.min(window.innerWidth - rosterFloat.offsetWidth - 4,event.clientX - drag.x));
      const top = Math.max(4,Math.min(window.innerHeight - 38,event.clientY - drag.y));
      rosterFloat.style.left = left + "px";
      rosterFloat.style.top = top + "px";
    });
    const end = event => { if (!drag) return; drag = null; rosterFloat.classList.remove("dragging"); try { handle.releasePointerCapture(event.pointerId); } catch (_) {} };
    handle.addEventListener("pointerup",end);
    handle.addEventListener("pointercancel",end);
  })();
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
    if (event.data && event.data.type === "conglobal-open-todays-roster") {
      if (rosterFloat.hidden) openRoster(); else closeRoster();
      return;
    }
    if (event.data && ["conglobal-am-report-format-updated", "conglobal-am-report-column-widths-updated"].includes(event.data.type)) {
      frames.forEach(frame => {
        if (frame.contentWindow !== event.source) frame.contentWindow.postMessage(event.data, "*");
      });
      return;
    }
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
    // Bundled pages can contain native ES modules. vm.Script validates classic
    // scripts only, so leave module parsing to the browser that executes them.
    if (/type\s*=\s*["']module["']/i.test(match[1])) continue;
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
  if (pageId === "superBash") pageHtml = configureSuperBashPage(pageHtml);
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
