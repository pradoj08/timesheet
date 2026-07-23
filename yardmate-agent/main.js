const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, safeStorage, Tray } = require('electron');
const { watch } = require('node:fs');
const { createServer } = require('node:http');
const { mkdir, readFile, readdir, stat, writeFile } = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const XLSX = require('xlsx');

const EXPORT_PATTERN = /^Mismatched Equipments(?: \(\d+\))?\.(?:xls|xlsx)$/i;
let settingsWindow;
let tray;
let watcher;
let controlServer;
let settings;
let settingsPath;
let lastMessage = 'Ready';
let lastFile = '';
let lastPreview = Buffer.alloc(0);
let lastRows = [];
const queued = new Map();
const processed = new Set();

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function encrypt(value) {
  if (!value) return '';
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure credential storage is unavailable.');
  return safeStorage.encryptString(value).toString('base64');
}

function decrypt(value) {
  if (!value) return '';
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  } catch {
    return '';
  }
}

async function loadSettings() {
  const defaults = { enabled: false, downloadFolder: app.getPath('downloads'), appToken: '', userKey: '' };
  try {
    const stored = JSON.parse(await readFile(settingsPath, 'utf8'));
    return {
      enabled: Boolean(stored.enabled),
      downloadFolder: path.isAbsolute(stored.downloadFolder || '') ? stored.downloadFolder : defaults.downloadFolder,
      appToken: decrypt(stored.appToken),
      userKey: decrypt(stored.userKey),
    };
  } catch {
    return defaults;
  }
}

async function persistSettings() {
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify({
    enabled: settings.enabled,
    downloadFolder: settings.downloadFolder,
    appToken: encrypt(settings.appToken),
    userKey: encrypt(settings.userKey),
  }, null, 2), 'utf8');
}

function publicState() {
  const noMates = lastRows.filter((row) => !row.chassis).length;
  return {
    online: true,
    settings: {
      enabled: settings.enabled,
      downloadFolder: settings.downloadFolder,
      hasAppToken: Boolean(settings.appToken),
      hasUserKey: Boolean(settings.userKey),
    },
    lastMessage,
    lastFile: lastFile ? path.basename(lastFile) : '',
    previewAvailable: Boolean(lastPreview.length),
    counts: { total: lastRows.length, noMates, mismatches: lastRows.length - noMates },
  };
}

function publishState() {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('yardmate:state', publicState());
}

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('The workbook contains no worksheet.');
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }).map((record) => {
    const row = new Map(Object.entries(record).map(([key, value]) => [text(key).toLowerCase(), value]));
    return {
      container: text(row.get('container id')),
      chassis: text(row.get('chassis id')),
      requiredPool: text(row.get('eqmt pool id')),
      chassisPool: text(row.get('chassis pool id')),
      size: text(row.get('car kind')),
      location: text(row.get('location')),
    };
  }).filter((row) => row.container);
}

function xml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

async function renderPng(rows) {
  const noMates = rows.filter((row) => !row.chassis);
  const mismatches = rows.filter((row) => row.chassis);
  const ordered = [...noMates, ...mismatches];
  const columns = [
    ['CONTAINER', 'container', 28, 190], ['CHASSIS', 'chassis', 218, 190],
    ['REQUIRED POOL', 'requiredPool', 408, 160], ['CHASSIS POOL', 'chassisPool', 568, 160],
    ['SIZE', 'size', 728, 100], ['LOCATION', 'location', 828, 220],
  ];
  const splitGap = noMates.length && mismatches.length ? 42 : 0;
  const height = 156 + ordered.length * 42 + splitGap;
  let body = '';
  let y = 132;
  ordered.forEach((row, index) => {
    if (index === noMates.length && index > 0) {
      body += `<rect x="28" y="${y}" width="1020" height="34" fill="#381d25"/><text x="42" y="${y + 23}" class="section">POOL MISMATCHES</text>`;
      y += 42;
    }
    const noMate = !row.chassis;
    body += `<rect x="28" y="${y}" width="1020" height="42" fill="${noMate ? '#423719' : (index % 2 ? '#10283a' : '#163247')}"/>`;
    for (const [_label, key, x] of columns) {
      const raw = noMate && key === 'chassis' ? 'NO MATE' : row[key] || '—';
      const value = raw.length > 22 ? `${raw.slice(0, 21)}…` : raw;
      body += `<text x="${x + 9}" y="${y + 27}" class="${noMate && key === 'chassis' ? 'warning' : 'cell'}">${xml(value)}</text>`;
    }
    y += 42;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1076" height="${height}">
    <style>text{font-family:Segoe UI,Arial}.title{font-size:27px;font-weight:900;fill:#f7fbff}.summary{font-size:14px;font-weight:700;fill:#a9c3d5}.header{font-size:10px;font-weight:900;letter-spacing:.8px;fill:#a5c0d2}.cell{font-size:13px;font-weight:700;fill:#f1f7fb}.warning{font-size:13px;font-weight:900;fill:#ffe078}.section{font-size:13px;font-weight:900;letter-spacing:1px;fill:#ff929b}</style>
    <rect width="1076" height="${height}" fill="#07131f"/><rect width="1076" height="7" fill="#37caef"/>
    <text x="28" y="46" class="title">YardMate Inbound Equipment Alert</text>
    <text x="28" y="75" class="summary">${noMates.length} no mates • ${mismatches.length} pool mismatches</text>
    <rect x="28" y="92" width="1020" height="40" fill="#173a52"/>
    ${columns.map(([label, _key, x]) => `<text x="${x + 9}" y="117" class="header">${label}</text>`).join('')}${body}</svg>`;
  return sharp(Buffer.from(svg), { failOn: 'warning' }).png().toBuffer();
}

async function renderCompactPng(rows) {
  const compare = (left, right) => String(left || '').localeCompare(String(right || ''), undefined, { numeric: true, sensitivity: 'base' });
  const noMates = rows
    .filter((row) => !row.chassis)
    .sort((left, right) => compare(left.location, right.location) || compare(left.container, right.container));
  const mismatches = rows
    .filter((row) => row.chassis)
    .sort((left, right) => compare(left.requiredPool, right.requiredPool) || compare(left.location, right.location) || compare(left.container, right.container));
  const reportTime = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const noMateColumns = [
    ['LOCATION', 'location', 150],
    ['CONTAINER', 'container', 160],
    ['CHASSIS', 'chassis', 155],
    ['REQUIRED POOL', 'requiredPool', 150],
    ['SIZE', 'size', 120],
  ];
  const mismatchColumns = [
    ['LOCATION', 'location', 140],
    ['CONTAINER', 'container', 145],
    ['CHASSIS', 'chassis', 145],
    ['REQUIRED POOL', 'requiredPool', 120],
    ['CHASSIS POOL', 'chassisPool', 115],
    ['SIZE', 'size', 70],
  ];
  const margin = 24;
  const tableWidth = mismatchColumns.reduce((total, column) => total + column[2], 0);
  const sectionHeight = (sectionRows) => 70 + Math.max(sectionRows.length, 1) * 38;
  const noMateHeight = sectionHeight(noMates);
  const mismatchY = 94 + noMateHeight + 16;
  const height = mismatchY + sectionHeight(mismatches) + 24;

  function section(title, sectionRows, startY, accent, noMateSection, sectionColumns) {
    let output = `<rect x="${margin}" y="${startY}" width="${tableWidth}" height="36" rx="8" fill="${accent}"/>`;
    output += `<text x="${margin + 13}" y="${startY + 24}" class="section">${title}</text>`;
    output += `<text x="${margin + tableWidth - 13}" y="${startY + 24}" text-anchor="end" class="section">${sectionRows.length}</text>`;
    let x = margin;
    for (const [label, _key, columnWidth] of sectionColumns) {
      output += `<rect x="${x}" y="${startY + 36}" width="${columnWidth}" height="34" fill="#d9dde2"/>`;
      output += `<text x="${x + 8}" y="${startY + 58}" class="header">${label}</text>`;
      x += columnWidth;
    }
    if (!sectionRows.length) {
      output += `<text x="${margin + 13}" y="${startY + 96}" class="empty">None in this report</text>`;
      return output;
    }
    sectionRows.forEach((row, rowIndex) => {
      const rowY = startY + 70 + rowIndex * 38;
      output += `<rect x="${margin}" y="${rowY}" width="${tableWidth}" height="38" fill="${rowIndex % 2 ? '#eceff2' : '#ffffff'}"/>`;
      x = margin;
      for (const [_label, key, columnWidth] of sectionColumns) {
        const raw = noMateSection && key === 'chassis' ? 'NO MATE' : row[key] || '-';
        const limit = key === 'location' ? 27 : 18;
        const value = raw.length > limit ? `${raw.slice(0, limit - 3)}...` : raw;
        output += `<text x="${x + 8}" y="${rowY + 24}" class="${noMateSection && key === 'chassis' ? 'warning' : 'cell'}">${xml(value)}</text>`;
        x += columnWidth;
      }
    });
    return output;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tableWidth + margin * 2}" height="${height}">
    <style>text{font-family:Segoe UI,Arial}.title{font-size:25px;font-weight:900;fill:#111827}.summary{font-size:13px;font-weight:700;fill:#5b6573}.header{font-size:9px;font-weight:900;letter-spacing:.55px;fill:#27313f}.cell{font-size:12px;font-weight:700;fill:#17202c}.warning{font-size:12px;font-weight:900;fill:#c8102e}.section{font-size:13px;font-weight:900;letter-spacing:1px;fill:#ffffff}.empty{font-size:12px;font-weight:700;fill:#657080}</style>
    <rect width="100%" height="100%" fill="#ffffff"/><rect width="100%" height="6" fill="#c8102e"/>
    <text x="${margin}" y="40" class="title">Settegast Inbound Equipment Status [${xml(reportTime)}]</text>
    <text x="${margin}" y="67" class="summary">${noMates.length} no mates | ${mismatches.length} pool mismatches</text>
    ${section('NO MATES', noMates, 94, '#c8102e', true, noMateColumns)}
    ${section('POOL MISMATCHES', mismatches, mismatchY, '#111111', false, mismatchColumns)}
  </svg>`;
  return sharp(Buffer.from(svg), { failOn: 'warning' }).png().toBuffer();
}

async function push(rows, png) {
  if (!settings.appToken || !settings.userKey) throw new Error('Enter both Pushover keys in YardMate Agent.');
  const noMates = rows.filter((row) => !row.chassis).length;
  const payload = {
    token: settings.appToken,
    user: settings.userKey,
    title: `Settegast Inbound Equipment Status [${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}]`,
    message: rows.length
      ? `No mates: ${noMates} • Pool mismatches: ${rows.length - noMates}\nFull equipment table attached.`
      : 'YardMate Agent test successful.',
  };
  if (png.length) {
    payload.attachment_base64 = png.toString('base64');
    payload.attachment_type = 'image/png';
  }
  const response = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || result.status !== 1) throw new Error(result.errors?.join(' ') || `Pushover returned ${response.status}.`);
}

async function prepareExport(filePath) {
  const rows = parseWorkbook(await readFile(filePath));
  if (!rows.length) throw new Error('No equipment rows were found.');
  const png = await renderCompactPng(rows);
  lastFile = filePath;
  lastRows = rows;
  lastPreview = png;
  return { rows, png };
}

async function findLatestExport() {
  const entries = await readdir(settings.downloadFolder, { withFileTypes: true });
  const candidates = await Promise.all(entries
    .filter((entry) => entry.isFile() && EXPORT_PATTERN.test(entry.name))
    .map(async (entry) => {
      const filePath = path.join(settings.downloadFolder, entry.name);
      return { filePath, info: await stat(filePath) };
    }));
  candidates.sort((left, right) => right.info.mtimeMs - left.info.mtimeMs);
  if (!candidates.length) throw new Error('No Mismatched Equipments Excel file was found in Downloads.');
  return candidates[0].filePath;
}

async function processLatestExport(sendAlert) {
  const filePath = await findLatestExport();
  const { rows, png } = await prepareExport(filePath);
  if (sendAlert) {
    await push(rows, png);
    const noMates = rows.filter((row) => !row.chassis).length;
    lastMessage = `Sent ${noMates} no mates and ${rows.length - noMates} mismatches at ${new Date().toLocaleTimeString()}.`;
  } else {
    lastMessage = `Previewed ${path.basename(filePath)} at ${new Date().toLocaleTimeString()}.`;
  }
  publishState();
  return publicState();
}

async function processExport(filePath) {
  queued.delete(filePath);
  try {
    const info = await stat(filePath);
    const identity = `${filePath}:${info.size}:${info.mtimeMs}`;
    if (!info.size || processed.has(identity)) return;
    const { rows, png } = await prepareExport(filePath);
    await push(rows, png);
    processed.add(identity);
    const noMates = rows.filter((row) => !row.chassis).length;
    lastMessage = `Sent ${noMates} no mates and ${rows.length - noMates} mismatches at ${new Date().toLocaleTimeString()}.`;
    new Notification({ title: 'YardMate alert sent', body: lastMessage }).show();
  } catch (error) {
    lastMessage = error instanceof Error ? error.message : String(error);
    new Notification({ title: 'YardMate could not process the Excel', body: lastMessage }).show();
  }
  publishState();
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': 'null',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16384) throw new Error('Request is too large.');
  }
  return body ? JSON.parse(body) : {};
}

function startControlServer() {
  controlServer = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1:43127');
    const origin = request.headers.origin;
    if (origin && origin !== 'null') return sendJson(response, 403, { error: 'This connection is only available to the local YardMate workbook.' });
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Origin': 'null',
      });
      return response.end();
    }
    try {
      if (request.method === 'GET' && url.pathname === '/api/state') return sendJson(response, 200, publicState());
      if (request.method === 'GET' && url.pathname === '/api/preview') {
        if (!lastPreview.length) await processLatestExport(false);
        response.writeHead(200, {
          'Access-Control-Allow-Origin': 'null',
          'Cache-Control': 'no-store',
          'Content-Type': 'image/png',
        });
        return response.end(lastPreview);
      }
      if (request.method === 'POST' && url.pathname === '/api/watch') {
        const body = await readJsonBody(request);
        settings.enabled = Boolean(body.enabled);
        await persistSettings();
        restartWatcher();
        lastMessage = settings.enabled ? 'Automatic download watching enabled.' : 'Automatic download watching paused.';
        publishState();
        return sendJson(response, 200, publicState());
      }
      if (request.method === 'POST' && url.pathname === '/api/preview-latest') {
        return sendJson(response, 200, await processLatestExport(false));
      }
      if (request.method === 'POST' && url.pathname === '/api/process-latest') {
        return sendJson(response, 200, await processLatestExport(true));
      }
      if (request.method === 'POST' && url.pathname === '/api/test-push') {
        await push([], Buffer.alloc(0));
        lastMessage = `Test alert sent at ${new Date().toLocaleTimeString()}.`;
        publishState();
        return sendJson(response, 200, publicState());
      }
      if (request.method === 'POST' && url.pathname === '/api/open-settings') {
        createWindow();
        return sendJson(response, 200, publicState());
      }
      return sendJson(response, 404, { error: 'Not found.' });
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : String(error);
      publishState();
      return sendJson(response, 500, { error: lastMessage, state: publicState() });
    }
  });
  controlServer.on('error', (error) => {
    lastMessage = `YardMate control connection failed: ${error.message}`;
    publishState();
  });
  controlServer.listen(43127, '127.0.0.1');
}

function restartWatcher() {
  watcher?.close();
  watcher = undefined;
  for (const timer of queued.values()) clearTimeout(timer);
  queued.clear();
  if (!settings.enabled) return;
  watcher = watch(settings.downloadFolder, { persistent: false }, (_event, filename) => {
    if (!filename || !EXPORT_PATTERN.test(filename)) return;
    const filePath = path.join(settings.downloadFolder, filename);
    const current = queued.get(filePath);
    if (current) clearTimeout(current);
    queued.set(filePath, setTimeout(() => void processExport(filePath), 1500));
  });
}

function createWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) return settingsWindow.show();
  settingsWindow = new BrowserWindow({
    width: 780, height: 720, minWidth: 640, minHeight: 600,
    title: 'YardMate Agent', backgroundColor: '#07131f',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  settingsWindow.removeMenu();
  settingsWindow.loadFile('settings.html');
  settingsWindow.on('close', (event) => {
    if (!app.isQuitting) { event.preventDefault(); settingsWindow.hide(); }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.svg');
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 }));
  tray.setToolTip('YardMate Agent');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open YardMate Agent', click: createWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', createWindow);
}

ipcMain.handle('yardmate:get-state', () => publicState());
ipcMain.handle('yardmate:save-settings', async (_event, patch) => {
  if (!patch || typeof patch !== 'object') throw new Error('Invalid settings.');
  settings = {
    ...settings,
    enabled: Boolean(patch.enabled),
    downloadFolder: path.isAbsolute(patch.downloadFolder || '') ? patch.downloadFolder : settings.downloadFolder,
    appToken: typeof patch.appToken === 'string' ? patch.appToken.slice(0, 128) : settings.appToken,
    userKey: typeof patch.userKey === 'string' ? patch.userKey.slice(0, 128) : settings.userKey,
  };
  await persistSettings();
  restartWatcher();
  publishState();
  return publicState();
});
ipcMain.handle('yardmate:test-push', async () => {
  try {
    await push([], Buffer.alloc(0));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle('yardmate:choose-download-folder', async () => {
  const response = await dialog.showOpenDialog(settingsWindow, { properties: ['openDirectory'], defaultPath: settings.downloadFolder });
  return response.canceled ? null : response.filePaths[0];
});

app.requestSingleInstanceLock();
app.on('second-instance', createWindow);
app.whenReady().then(async () => {
  settingsPath = path.join(app.getPath('userData'), 'settings.json');
  settings = await loadSettings();
  createTray();
  createWindow();
  restartWatcher();
  startControlServer();
});
app.on('window-all-closed', () => {});
app.on('before-quit', () => { app.isQuitting = true; watcher?.close(); controlServer?.close(); });
