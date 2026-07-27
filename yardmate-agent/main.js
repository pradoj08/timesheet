const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, safeStorage, Tray } = require('electron');
const { watch } = require('node:fs');
const { createServer } = require('node:http');
const { mkdir, readFile, readdir, stat, writeFile } = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const XLSX = require('xlsx');

const EXPORT_PATTERN = /^Mismatched Equipments(?: \(\d+\))?\.(?:xls|xlsx)$/i;
const MAX_SOURCE_REFRESH_AGE_MS = 10 * 60 * 1000;
const MAX_EXPORT_AGE_MS = 10 * 60 * 1000;
const EXPORT_REFRESH_TOLERANCE_MS = 5000;
let settingsWindow;
let tray;
let watcher;
let controlServer;
let settings;
let settingsPath;
let lastMessage = 'Ready';
let lastFile = '';
let lastPreview = Buffer.alloc(0);
let lastAlertMeterPreview = Buffer.alloc(0);
let lastAlertMeterCapturedAt = '';
let lastExtensionSeenAt = '';
let extensionSchedule = {
  mismatchEnabled: false,
  alertMeterEnabled: false,
  yardCheckEnabled: false,
  mismatchNextAt: '',
  alertMeterNextAt: '',
  yardCheckNextAt: '',
};
let programmedSchedules = {
  mismatchEnabled: false,
  alertMeterEnabled: false,
  yardCheckEnabled: false,
  mismatchTimes: [],
  alertMeterTimes: [],
  yardCheckTimes: [],
};
let lastRows = [];
let sourceRefresh = { timestamp: '', observedAt: '', ageMinutes: null, verified: false, changed: false };
let alertMeterCommand = { id: '', status: 'idle', requestedAt: '', claimedAt: '', completedAt: '', error: '' };
let yardCheckCommand = { id: '', status: 'idle', requestedAt: '', claimedAt: '', completedAt: '', error: '' };
const queued = new Map();
const processed = new Set();
const processing = new Set();

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeScheduleTimes(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[\s,;]+/);
  return [...new Set(values.map((item) => String(item).replace(/\D/g, '').padStart(4, '0')).filter((item) => {
    const hour = Number(item.slice(0, 2));
    const minute = Number(item.slice(2));
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
  }))].sort();
}

function normalizeProgrammedSchedules(value = {}) {
  const mismatchTimes = normalizeScheduleTimes(value.mismatchTimes);
  const alertMeterTimes = normalizeScheduleTimes(value.alertMeterTimes);
  const yardCheckTimes = normalizeScheduleTimes(value.yardCheckTimes);
  return {
    mismatchEnabled: Boolean(value.mismatchEnabled) && mismatchTimes.length > 0,
    alertMeterEnabled: Boolean(value.alertMeterEnabled) && alertMeterTimes.length > 0,
    yardCheckEnabled: Boolean(value.yardCheckEnabled) && yardCheckTimes.length > 0,
    mismatchTimes,
    alertMeterTimes,
    yardCheckTimes,
  };
}

function mismatchDurationMinutes(value, now = new Date()) {
  const raw = text(value);
  if (!raw) return '';
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  let started;
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    let hour = Number(match[4]);
    const meridiem = String(match[7] || '').toUpperCase();
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    started = new Date(year, Number(match[1]) - 1, Number(match[2]), hour, Number(match[5]), Number(match[6] || 0));
  } else {
    started = new Date(raw);
  }
  if (Number.isNaN(started.getTime())) return '';
  return String(Math.max(0, Math.floor((now.getTime() - started.getTime()) / 60000)));
}

function encrypt(value) {
  if (!value) return '';
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Operating-system secure credential storage is unavailable.');
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
    programmedSchedules = normalizeProgrammedSchedules(stored.programmedSchedules);
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
    programmedSchedules,
  }, null, 2), 'utf8');
}

function publicState() {
  const noMates = lastRows.filter((row) => !row.chassis).length;
  const extensionAge = lastExtensionSeenAt ? Date.now() - new Date(lastExtensionSeenAt).getTime() : Infinity;
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
    alertMeterPreviewAvailable: Boolean(lastAlertMeterPreview.length),
    alertMeterCapturedAt: lastAlertMeterCapturedAt,
    extensionConnected: Number.isFinite(extensionAge) && extensionAge < 90000,
    yardCheckOnline: Number.isFinite(extensionAge) && extensionAge < 90000,
    extensionLastSeenAt: lastExtensionSeenAt,
    extensionSchedule,
    programmedSchedules,
    sourceRefresh,
    alertMeterCommand: {
      status: alertMeterCommand.status,
      requestedAt: alertMeterCommand.requestedAt,
      completedAt: alertMeterCommand.completedAt,
      error: alertMeterCommand.error,
    },
    yardCheckCommand: {
      status: yardCheckCommand.status,
      requestedAt: yardCheckCommand.requestedAt,
      completedAt: yardCheckCommand.completedAt,
      error: yardCheckCommand.error,
    },
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
      mismatchTime: text(row.get('mismatch time') || row.get('mismatch')),
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
    .map((row) => ({ ...row, durationMinutes: mismatchDurationMinutes(row.mismatchTime) }))
    .sort((left, right) => compare(left.location, right.location) || compare(left.container, right.container));
  const mismatches = rows
    .filter((row) => row.chassis)
    .sort((left, right) => compare(left.requiredPool, right.requiredPool) || compare(left.location, right.location) || compare(left.container, right.container));
  const reportTime = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const noMateColumns = [
    ['LOCATION', 'location', 135],
    ['CONTAINER', 'container', 145],
    ['CHASSIS', 'chassis', 125],
    ['REQUIRED POOL', 'requiredPool', 125],
    ['SIZE', 'size', 70],
    ['DURATION (MIN)', 'durationMinutes', 135],
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
  const sectionStartY = 112;
  const mismatchY = sectionStartY + noMateHeight + 16;
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
    <style>text{font-family:Segoe UI,Arial}.title{font-size:25px;font-weight:900;fill:#111827}.summary{font-size:13px;font-weight:700;fill:#5b6573}.refresh-good{font-size:13px;font-weight:900;fill:#16803a}.refresh-bad{font-size:13px;font-weight:900;fill:#c8102e}.header{font-size:9px;font-weight:900;letter-spacing:.55px;fill:#27313f}.cell{font-size:12px;font-weight:700;fill:#17202c}.warning{font-size:12px;font-weight:900;fill:#c8102e}.section{font-size:13px;font-weight:900;letter-spacing:1px;fill:#ffffff}.empty{font-size:12px;font-weight:700;fill:#657080}</style>
    <rect width="100%" height="100%" fill="#ffffff"/><rect width="100%" height="6" fill="#c8102e"/>
    <text x="${margin}" y="40" class="title">Settegast Inbound Equipment Status [${xml(reportTime)}]</text>
    <text x="${margin}" y="67" class="summary">${noMates.length} no mates | ${mismatches.length} pool mismatches</text>
    <text x="${margin}" y="88" class="${sourceRefresh.verified ? 'refresh-good' : 'refresh-bad'}">UP refresh: ${xml(sourceRefresh.timestamp || 'Not verified')} ${sourceRefresh.verified ? '| VERIFIED CURRENT' : '| NOT VERIFIED'}</text>
    ${section('NO MATES', noMates, sectionStartY, '#c8102e', true, noMateColumns)}
    ${section('POOL MISMATCHES', mismatches, mismatchY, '#111111', false, mismatchColumns)}
  </svg>`;
  return sharp(Buffer.from(svg), { failOn: 'warning' }).png().toBuffer();
}

async function renderMeetingPng(payload) {
  const tones = { blue: '#eaf3fb', green: '#edf8f2', tan: '#fbf5e9', purple: '#f5effb' };
  const title = text(payload.title || 'Morning Meeting').slice(0, 80);
  const boardTitle = text(payload.boardTitle || `${title} Plan`).slice(0, 100);
  const incoming = Array.isArray(payload.sections) ? payload.sections.slice(0, 4) : [];
  const sections = incoming.map((section, index) => ({
    title: text(section?.title || `Section ${index + 1}`).slice(0, 60),
    subtitle: text(section?.subtitle || '').slice(0, 100),
    tone: tones[section?.tone] || Object.values(tones)[index] || '#f4f6f8',
    lines: (Array.isArray(section?.lines) ? section.lines : []).slice(0, 5).map((line) => text(line).slice(0, 130)),
  }));
  while (sections.length < 4) sections.push({ title: 'Notes', subtitle: '', tone: '#f4f6f8', lines: [] });
  const width = 1200;
  const height = 760;
  const margin = 28;
  const gap = 18;
  const cardWidth = (width - margin * 2 - gap) / 2;
  const cardHeight = 292;
  const card = (section, index) => {
    const x = margin + (index % 2) * (cardWidth + gap);
    const y = 118 + Math.floor(index / 2) * (cardHeight + gap);
    let rows = '';
    for (let lineIndex = 0; lineIndex < 5; lineIndex += 1) {
      const rowY = y + 94 + lineIndex * 36;
      const value = section.lines[lineIndex] || '';
      rows += `<rect x="${x + 14}" y="${rowY}" width="${cardWidth - 28}" height="36" fill="${lineIndex % 2 ? '#fbfcfd' : '#ffffff'}" stroke="#cad4df"/>`;
      rows += `<rect x="${x + 14}" y="${rowY}" width="38" height="36" fill="#e6edf4" stroke="#cad4df"/>`;
      rows += `<text x="${x + 33}" y="${rowY + 23}" text-anchor="middle" class="number">${lineIndex + 1}</text>`;
      rows += `<text x="${x + 62}" y="${rowY + 23}" class="line">${xml(value.length > 82 ? `${value.slice(0, 79)}...` : value)}</text>`;
    }
    return `<rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="16" fill="${section.tone}" stroke="#c9d3df"/>
      <text x="${x + 16}" y="${y + 31}" class="card-title">${xml(section.title)}</text>
      <text x="${x + 16}" y="${y + 53}" class="subtitle">${xml(section.subtitle)}</text>${rows}`;
  };
  const reportTime = new Date().toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <style>text{font-family:Segoe UI,Arial}.title{font-size:28px;font-weight:900;fill:#17324d}.meta{font-size:13px;font-weight:700;fill:#60748a}.card-title{font-size:20px;font-weight:900;fill:#172033;text-decoration:underline}.subtitle{font-size:11px;font-weight:800;fill:#667085}.number{font-size:12px;font-weight:900;fill:#213047}.line{font-size:13px;font-weight:750;fill:#172033}</style>
    <rect width="100%" height="100%" fill="#eef4f8"/><rect width="100%" height="7" fill="#17324d"/>
    <text x="${margin}" y="48" class="title">${xml(boardTitle)}</text>
    <text x="${margin}" y="76" class="meta">${xml(reportTime)}</text>
    ${sections.map(card).join('')}
  </svg>`;
  return sharp(Buffer.from(svg), { failOn: 'warning' }).png().toBuffer();
}

async function pushMeeting(payload, png) {
  if (!settings.appToken || !settings.userKey) throw new Error('Enter both Pushover keys in YardMate Agent.');
  const title = text(payload.title || 'Morning Meeting').slice(0, 80);
  const response = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: settings.appToken,
      user: settings.userKey,
      title: `Settegast ${title}`,
      message: `${title} board attached.`,
      attachment_base64: png.toString('base64'),
      attachment_type: 'image/png',
    }),
  });
  const result = await response.json();
  if (!response.ok || result.status !== 1) throw new Error(result.errors?.join(' ') || `Pushover returned ${response.status}.`);
}

async function pushAlertMeterSnapshot(payload) {
  if (!settings.appToken || !settings.userKey) throw new Error('Enter both Pushover keys in YardMate Agent.');
  const match = text(payload.imageDataUrl).match(/^data:image\/(?:png|jpeg);base64,(.+)$/i);
  if (!match) throw new Error('The AlertMeter snapshot was missing or invalid.');
  const screenshot = Buffer.from(match[1], 'base64');
  const source = sharp(screenshot, { failOn: 'warning' });
  const metadata = await source.metadata();
  const viewportWidth = Math.max(1, Number(payload.viewportWidth) || metadata.width || 1);
  const viewportHeight = Math.max(1, Number(payload.viewportHeight) || metadata.height || 1);
  const crop = payload.crop && typeof payload.crop === 'object' ? payload.crop : {};
  const scaleX = (metadata.width || viewportWidth) / viewportWidth;
  const scaleY = (metadata.height || viewportHeight) / viewportHeight;
  const left = Math.max(0, Math.min(Math.round((Number(crop.left) || 0) * scaleX), (metadata.width || 1) - 1));
  const top = Math.max(0, Math.min(Math.round((Number(crop.top) || 0) * scaleY), (metadata.height || 1) - 1));
  const width = Math.max(1, Math.min(Math.round((Number(crop.width) || viewportWidth) * scaleX), (metadata.width || 1) - left));
  const height = Math.max(1, Math.min(Math.round((Number(crop.height) || viewportHeight) * scaleY), (metadata.height || 1) - top));
  const cropped = await source
    .extract({ left, top, width, height })
    .resize({ width: 1400, height: 1800, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  const croppedMetadata = await sharp(cropped).metadata();
  const participation = Math.max(0, Math.min(100, Number(payload.participation)));
  if (!Number.isFinite(participation)) throw new Error('Mori could not read the AlertMeter participation percentage.');
  const compliant = participation === 100;
  const missingEmployees = Array.isArray(payload.missingEmployees)
    ? payload.missingEmployees.map(text).filter(Boolean).slice(0, 30)
    : [];
  const badgeSize = Math.max(118, Math.min(176, Math.round((croppedMetadata.width || 1200) * 0.13)));
  const badgeX = Math.max(12, (croppedMetadata.width || 1200) - badgeSize - 22);
  const badgeY = 18;
  const badgeColor = compliant ? '#138a42' : '#c8102e';
  const badgeLabel = compliant
    ? `<text x="${badgeX + badgeSize / 2}" y="${badgeY + badgeSize * 0.43}" text-anchor="middle" class="big">100%</text><text x="${badgeX + badgeSize / 2}" y="${badgeY + badgeSize * 0.66}" text-anchor="middle" class="small">COMPLIANT</text>`
    : `<text x="${badgeX + badgeSize / 2}" y="${badgeY + badgeSize * 0.36}" text-anchor="middle" class="big">${participation}%</text><text x="${badgeX + badgeSize / 2}" y="${badgeY + badgeSize * 0.56}" text-anchor="middle" class="small">OUT OF</text><text x="${badgeX + badgeSize / 2}" y="${badgeY + badgeSize * 0.72}" text-anchor="middle" class="small">COMPLIANCE</text>`;
  const badge = Buffer.from(`<svg width="${croppedMetadata.width}" height="${croppedMetadata.height}" xmlns="http://www.w3.org/2000/svg">
    <style>.big{font:900 ${Math.round(badgeSize * 0.22)}px Segoe UI,Arial;fill:#fff}.small{font:900 ${Math.round(badgeSize * 0.095)}px Segoe UI,Arial;fill:#fff;letter-spacing:.5px}</style>
    <circle cx="${badgeX + badgeSize / 2}" cy="${badgeY + badgeSize / 2}" r="${badgeSize / 2 - 5}" fill="${badgeColor}" stroke="#fff" stroke-width="8"/>
    ${badgeLabel}
  </svg>`);
  const attachment = await sharp(cropped)
    .composite([{ input: badge, top: 0, left: 0 }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  lastAlertMeterPreview = attachment;
  lastAlertMeterCapturedAt = new Date().toISOString();
  const capturedAt = payload.capturedAt ? new Date(payload.capturedAt) : new Date();
  const timeLabel = Number.isNaN(capturedAt.getTime())
    ? new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : capturedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const response = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: settings.appToken,
      user: settings.userKey,
      title: `AlertMeter ${compliant ? '100% Participation' : 'Out of Compliance'} [${timeLabel}]`,
      message: compliant
        ? 'Participation verified at 100%. Cropped dashboard snapshot attached.'
        : `OUT OF COMPLIANCE: participation is ${participation}%.${missingEmployees.length
          ? ` No test taken: ${missingEmployees.join(', ')}.`
          : ' The No Test Taken filter was applied; review the attached cropped table.'}`,
      attachment_base64: attachment.toString('base64'),
      attachment_type: 'image/jpeg',
    }),
  });
  const result = await response.json();
  if (!response.ok || result.status !== 1) throw new Error(result.errors?.join(' ') || `Pushover returned ${response.status}.`);
}

async function pushYardCheckSnapshot(payload) {
  if (!settings.appToken || !settings.userKey) throw new Error('Enter both Pushover keys in YardMate Agent.');
  const match = text(payload.imageDataUrl).match(/^data:image\/(?:png|jpeg);base64,(.+)$/i);
  if (!match) throw new Error('The Yard Check snapshot was missing or invalid.');
  const screenshot = Buffer.from(match[1], 'base64');
  const source = sharp(screenshot, { failOn: 'warning' });
  const metadata = await source.metadata();
  const viewportWidth = Math.max(1, Number(payload.viewportWidth) || metadata.width || 1);
  const viewportHeight = Math.max(1, Number(payload.viewportHeight) || metadata.height || 1);
  const crop = payload.crop && typeof payload.crop === 'object' ? payload.crop : {};
  const scaleX = (metadata.width || viewportWidth) / viewportWidth;
  const scaleY = (metadata.height || viewportHeight) / viewportHeight;
  const left = Math.max(0, Math.min(Math.round((Number(crop.left) || 0) * scaleX), (metadata.width || 1) - 1));
  const top = Math.max(0, Math.min(Math.round((Number(crop.top) || 0) * scaleY), (metadata.height || 1) - 1));
  const width = Math.max(1, Math.min(Math.round((Number(crop.width) || viewportWidth) * scaleX), (metadata.width || 1) - left));
  const height = Math.max(1, Math.min(Math.round((Number(crop.height) || viewportHeight) * scaleY), (metadata.height || 1) - top));
  const attachment = await source
    .extract({ left, top, width, height })
    .resize({ width: 1500, height: 1900, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
  const capturedAt = payload.capturedAt ? new Date(payload.capturedAt) : new Date();
  const timeLabel = Number.isNaN(capturedAt.getTime())
    ? new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : capturedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const yard = text(payload.yard || 'B 372').slice(0, 40);
  const lookbackHours = Math.max(12, Number(payload.lookbackHours) || 12);
  const response = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: settings.appToken,
      user: settings.userKey,
      title: `UP Yard Check ${yard} [${timeLabel}]`,
      message: `Yard Check movements during the last ${lookbackHours}+ hours. Container, Trailer, Arrivals, Other Movement, and Yard Check filters applied; Chassis excluded.`,
      attachment_base64: attachment.toString('base64'),
      attachment_type: 'image/jpeg',
    }),
  });
  const result = await response.json();
  if (!response.ok || result.status !== 1) throw new Error(result.errors?.join(' ') || `Pushover returned ${response.status}.`);
}

async function pushWeather(payload) {
  if (!settings.appToken || !settings.userKey) throw new Error('Enter both Pushover keys in YardMate Agent.');
  const postTitle = text(payload.title || 'Latest weather update').slice(0, 240);
  const published = text(payload.date);
  const link = text(payload.link);
  const weatherPng = await renderWeatherPostPng(payload);
  const pushPayload = {
    token: settings.appToken,
    user: settings.userKey,
    title: `Space City Weather [${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}]`,
    message: `${postTitle}\n\nFull latest post attached.`.slice(0, 1024),
    attachment_base64: weatherPng.toString('base64'),
    attachment_type: 'image/png',
  };
  if (/^https?:\/\//i.test(link)) {
    pushPayload.url = link.slice(0, 512);
    pushPayload.url_title = 'Read the full weather update';
  }
  const response = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pushPayload),
  });
  const result = await response.json();
  if (!response.ok || result.status !== 1) throw new Error(result.errors?.join(' ') || `Pushover returned ${response.status}.`);
}

async function fetchLatestSpaceCityWeatherPost() {
  const response = await fetch(
    'https://spacecityweather.com/wp-json/wp/v2/posts?per_page=1&_fields=link,date,title,excerpt,content',
    {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'YardMate/1.1 (local operations dashboard)',
      },
    },
  );
  if (!response.ok) throw new Error(`Space City Weather returned ${response.status}.`);
  const rows = await response.json();
  const row = rows?.[0];
  if (!row) throw new Error('Space City Weather returned no posts.');
  return {
    title: text(row.title?.rendered),
    summary: text(row.excerpt?.rendered),
    content: String(row.content?.rendered || ''),
    date: text(row.date),
    link: text(row.link),
    retrievedAt: new Date().toISOString(),
  };
}

function weatherLines(value, limit = 74) {
  const lines = [];
  String(value || '').split(/\n+/).forEach((paragraph) => {
    const words = text(paragraph).split(' ').filter(Boolean);
    let line = '';
    words.forEach((word) => {
      if (line && `${line} ${word}`.length > limit) {
        lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    });
    if (line) lines.push(line);
    if (words.length) lines.push('');
  });
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}

async function renderWeatherPostPng(payload) {
  const width = 900;
  const margin = 38;
  const titleLines = weatherLines(payload.title, 42).slice(0, 4);
  const beforeLines = weatherLines(payload.beforeImage || payload.summary, 70);
  const afterLines = weatherLines(payload.afterImage, 70);
  let image = null;
  const imageUrl = text(payload.imageUrl);
  if (/^https?:\/\//i.test(imageUrl)) {
    try {
      const response = await fetch(imageUrl);
      if (response.ok) {
        const source = Buffer.from(await response.arrayBuffer());
        if (source.length <= 12 * 1024 * 1024) {
          image = await sharp(source).resize({ width: width - margin * 2, height: 620, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 84 }).toBuffer();
        }
      }
    } catch {}
  }
  const maxBodyLines = image ? 48 : 68;
  const bodyLines = beforeLines.concat(afterLines).slice(0, maxBodyLines);
  const imageMeta = image ? await sharp(image).metadata() : null;
  const imageHeight = imageMeta?.height || 0;
  const titleHeight = titleLines.length * 43;
  const bodyHeight = bodyLines.length * 28;
  const naturalHeight = 144 + titleHeight + 42 + bodyHeight + (imageHeight ? imageHeight + 34 : 0) + 70;
  const height = Math.min(2450, Math.max(620, naturalHeight));
  let y = 76;
  const titleSvg = titleLines.map((line) => {
    const row = `<text x="${margin}" y="${y}" class="title">${xml(line)}</text>`;
    y += 43;
    return row;
  }).join('');
  const dateLabel = payload.date ? new Date(payload.date).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const beforeCount = Math.min(beforeLines.length, maxBodyLines);
  y += 8;
  const metaSvg = `<text x="${margin}" y="${y}" class="meta">${xml(dateLabel)}</text>`;
  y += 42;
  const bodySvg = [];
  let imageY = 0;
  bodyLines.forEach((line, index) => {
    if (image && index === beforeCount) {
      imageY = y + 8;
      y += imageHeight + 34;
    }
    if (y < height - 34) bodySvg.push(`<text x="${margin}" y="${y}" class="body">${xml(line || ' ')}</text>`);
    y += 28;
  });
  const imageTag = image
    ? `<image x="${margin}" y="${imageY}" width="${imageMeta.width}" height="${imageHeight}" href="data:image/jpeg;base64,${image.toString('base64')}"/>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <style>.source{font:900 17px Segoe UI,Arial;letter-spacing:1px;fill:#087f75}.title{font:900 34px Segoe UI,Arial;fill:#172033}.meta{font:800 17px Segoe UI,Arial;fill:#64748b}.body{font:700 20px Segoe UI,Arial;fill:#334155}</style>
    <rect width="100%" height="100%" fill="#ffffff"/><rect width="100%" height="7" fill="#0f172a"/>
    <text x="${margin}" y="28" class="source">SPACE CITY WEATHER</text>
    ${titleSvg}${metaSvg}${imageTag}${bodySvg.join('')}
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
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
  return candidates[0];
}

function verifyCurrentExport(candidate) {
  if (!sourceRefresh.verified) {
    throw new Error('The UP page refresh is not verified. Run Mori Export Now before processing or sending an alert.');
  }
  const observedAt = Date.parse(sourceRefresh.observedAt);
  if (!Number.isFinite(observedAt) || Date.now() - observedAt > MAX_SOURCE_REFRESH_AGE_MS) {
    throw new Error('The verified UP refresh has expired. Run Mori Export Now again.');
  }
  if (Date.now() - candidate.info.mtimeMs > MAX_EXPORT_AGE_MS) {
    throw new Error(`The newest Excel is stale (${path.basename(candidate.filePath)}). No alert was sent.`);
  }
  if (candidate.info.mtimeMs + EXPORT_REFRESH_TOLERANCE_MS < observedAt) {
    throw new Error(`The newest Excel predates the verified UP refresh (${path.basename(candidate.filePath)}). Wait for the new download; no alert was sent.`);
  }
  return candidate.filePath;
}

async function processLatestExport(sendAlert) {
  const filePath = verifyCurrentExport(await findLatestExport());
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
  if (processing.has(filePath)) return;
  processing.add(filePath);
  try {
    const info = await stat(filePath);
    const identity = `${filePath}:${info.size}:${info.mtimeMs}`;
    if (!info.size || processed.has(identity)) return;
    verifyCurrentExport({ filePath, info });
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
  finally {
    processing.delete(filePath);
  }
  publishState();
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Private-Network': 'true',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function isAllowedControlOrigin(origin) {
  if (!origin || origin === 'null' || origin.startsWith('chrome-extension://')) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:'
      && ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

async function readJsonBody(request, maxLength = 16384) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > maxLength) throw new Error('Request is too large.');
  }
  return body ? JSON.parse(body) : {};
}

function startControlServer() {
  controlServer = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1:43127');
    const origin = request.headers.origin;
    if (!isAllowedControlOrigin(origin)) {
      return sendJson(response, 403, { error: 'This connection is only available to the local YardMate workbook and Mori extension.' });
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Private-Network': 'true',
      });
      return response.end();
    }
    try {
      if (request.method === 'GET' && url.pathname === '/api/state') return sendJson(response, 200, publicState());
      if (request.method === 'GET' && url.pathname === '/api/schedules') {
        return sendJson(response, 200, { ok: true, programmedSchedules });
      }
      if (request.method === 'POST' && url.pathname === '/api/schedules') {
        const body = await readJsonBody(request);
        programmedSchedules = normalizeProgrammedSchedules(body);
        await persistSettings();
        lastMessage = 'Pearl schedules saved. The extension will use these times on its next check.';
        publishState();
        return sendJson(response, 200, { ok: true, programmedSchedules, ...publicState() });
      }
      if (request.method === 'GET' && url.pathname === '/api/alertmeter-command') {
        lastExtensionSeenAt = new Date().toISOString();
        extensionSchedule = {
          mismatchEnabled: url.searchParams.get('mismatchEnabled') === '1',
          alertMeterEnabled: url.searchParams.get('alertMeterEnabled') === '1',
          yardCheckEnabled: url.searchParams.get('yardCheckEnabled') === '1',
          mismatchNextAt: url.searchParams.get('mismatchNextAt') || '',
          alertMeterNextAt: url.searchParams.get('alertMeterNextAt') || '',
          yardCheckNextAt: url.searchParams.get('yardCheckNextAt') || '',
        };
        const claimExpired = alertMeterCommand.status === 'processing'
          && Date.now() - new Date(alertMeterCommand.claimedAt || 0).getTime() > 120000;
        if (alertMeterCommand.status === 'pending' || claimExpired) {
          alertMeterCommand.status = 'processing';
          alertMeterCommand.claimedAt = new Date().toISOString();
          return sendJson(response, 200, { ok: true, command: { id: alertMeterCommand.id, type: 'capture-alertmeter' } });
        }
        const yardClaimExpired = yardCheckCommand.status === 'processing'
          && Date.now() - new Date(yardCheckCommand.claimedAt || 0).getTime() > 120000;
        if (yardCheckCommand.status === 'pending' || yardClaimExpired) {
          yardCheckCommand.status = 'processing';
          yardCheckCommand.claimedAt = new Date().toISOString();
          return sendJson(response, 200, { ok: true, command: { id: yardCheckCommand.id, type: 'capture-yardcheck' } });
        }
        return sendJson(response, 200, { ok: true, command: null });
      }
      if (request.method === 'GET' && url.pathname === '/api/weather-latest') {
        return sendJson(response, 200, { ok: true, post: await fetchLatestSpaceCityWeatherPost() });
      }
      if (request.method === 'GET' && url.pathname === '/api/preview') {
        if (!lastPreview.length) await processLatestExport(false);
        response.writeHead(200, {
          'Access-Control-Allow-Origin': 'null',
          'Cache-Control': 'no-store',
          'Content-Type': 'image/png',
        });
        return response.end(lastPreview);
      }
      if (request.method === 'GET' && url.pathname === '/api/alertmeter-preview') {
        if (!lastAlertMeterPreview.length) return sendJson(response, 404, { error: 'No AlertMeter preview has been captured yet.' });
        response.writeHead(200, {
          'Access-Control-Allow-Origin': 'null',
          'Cache-Control': 'no-store',
          'Content-Type': 'image/jpeg',
        });
        return response.end(lastAlertMeterPreview);
      }
      if (request.method === 'POST' && url.pathname === '/api/source-refresh') {
        const body = await readJsonBody(request);
        sourceRefresh = {
          timestamp: text(body.timestamp).slice(0, 40),
          observedAt: text(body.observedAt).slice(0, 40),
          ageMinutes: Number.isFinite(Number(body.ageMinutes)) ? Number(body.ageMinutes) : null,
          verified: Boolean(body.verified),
          changed: Boolean(body.changed),
        };
        if (sourceRefresh.verified) {
          lastFile = '';
          lastRows = [];
          lastPreview = Buffer.alloc(0);
        }
        lastMessage = sourceRefresh.verified
          ? `UP refresh verified: ${sourceRefresh.timestamp}. Waiting for its new Excel download.`
          : `UP refresh timestamp could not be verified: ${sourceRefresh.timestamp || 'not found'}.`;
        publishState();
        return sendJson(response, 200, publicState());
      }
      if (request.method === 'POST' && url.pathname === '/api/request-alertmeter') {
        alertMeterCommand = {
          id: `alertmeter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          status: 'pending',
          requestedAt: new Date().toISOString(),
          claimedAt: '',
          completedAt: '',
          error: '',
        };
        lastMessage = 'AlertMeter refresh and push queued. Settegast Alerts will start it automatically.';
        publishState();
        return sendJson(response, 200, publicState());
      }
      if (request.method === 'POST' && url.pathname === '/api/complete-alertmeter-command') {
        const body = await readJsonBody(request);
        if (text(body.id) && text(body.id) === alertMeterCommand.id) {
          alertMeterCommand.status = body.ok ? 'completed' : 'failed';
          alertMeterCommand.completedAt = new Date().toISOString();
          alertMeterCommand.error = body.ok ? '' : text(body.error).slice(0, 500);
          lastMessage = body.ok
            ? 'AlertMeter dashboard refreshed and pushed successfully.'
            : `AlertMeter request failed: ${alertMeterCommand.error || 'Unknown error'}`;
          publishState();
        }
        return sendJson(response, 200, publicState());
      }
      if (request.method === 'POST' && url.pathname === '/api/request-yardcheck') {
        yardCheckCommand = {
          id: `yardcheck-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          status: 'pending',
          requestedAt: new Date().toISOString(),
          claimedAt: '',
          completedAt: '',
          error: '',
        };
        lastMessage = 'UP Yard Check B 372 snapshot queued. Settegast Alerts will apply the filters and send it automatically.';
        publishState();
        return sendJson(response, 200, publicState());
      }
      if (request.method === 'POST' && url.pathname === '/api/complete-yardcheck-command') {
        const body = await readJsonBody(request);
        if (text(body.id) && text(body.id) === yardCheckCommand.id) {
          yardCheckCommand.status = body.ok ? 'completed' : 'failed';
          yardCheckCommand.completedAt = new Date().toISOString();
          yardCheckCommand.error = body.ok ? '' : text(body.error).slice(0, 500);
          lastMessage = body.ok
            ? 'UP Yard Check B 372 snapshot filtered and pushed successfully.'
            : `UP Yard Check request failed: ${yardCheckCommand.error || 'Unknown error'}`;
          publishState();
        }
        return sendJson(response, 200, publicState());
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
      if (request.method === 'POST' && url.pathname === '/api/push-morning-meeting') {
        const body = await readJsonBody(request);
        const png = await renderMeetingPng(body);
        await pushMeeting(body, png);
        lastMessage = `Sent ${text(body.title || 'Morning Meeting')} alert at ${new Date().toLocaleTimeString()}.`;
        publishState();
        return sendJson(response, 200, { ok: true, state: publicState() });
      }
      if (request.method === 'POST' && url.pathname === '/api/push-alertmeter') {
        const body = await readJsonBody(request, 12 * 1024 * 1024);
        await pushAlertMeterSnapshot(body);
        lastMessage = `Sent AlertMeter dashboard snapshot at ${new Date().toLocaleTimeString()}.`;
        publishState();
        return sendJson(response, 200, { ok: true, state: publicState() });
      }
      if (request.method === 'POST' && url.pathname === '/api/push-yardcheck') {
        const body = await readJsonBody(request, 12 * 1024 * 1024);
        await pushYardCheckSnapshot(body);
        lastMessage = `Sent UP Yard Check snapshot at ${new Date().toLocaleTimeString()}.`;
        publishState();
        return sendJson(response, 200, { ok: true, state: publicState() });
      }
      if (request.method === 'POST' && url.pathname === '/api/push-weather') {
        const body = await readJsonBody(request);
        await pushWeather(body);
        lastMessage = `Sent Space City Weather alert at ${new Date().toLocaleTimeString()}.`;
        publishState();
        return sendJson(response, 200, { ok: true, state: publicState() });
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
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
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
  const trayImage = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 });
  if (process.platform === 'darwin') trayImage.setTemplateImage(true);
  tray = new Tray(trayImage);
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
app.on('activate', createWindow);
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
