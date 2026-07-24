const { writeFile } = require('node:fs/promises');
const XLSX = require('xlsx');
const sharp = require('sharp');

const source = process.argv[2];
const target = process.argv[3];
const workbook = XLSX.readFile(source);
const records = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '', raw: false });
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const mismatchDurationMinutes = (value, now = new Date()) => {
  const raw = clean(value);
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
};
const rows = records.map((record) => {
  const row = new Map(Object.entries(record).map(([key, value]) => [clean(key).toLowerCase(), value]));
  return {
    container: clean(row.get('container id')), chassis: clean(row.get('chassis id')),
    requiredPool: clean(row.get('eqmt pool id')), chassisPool: clean(row.get('chassis pool id')),
    size: clean(row.get('car kind')), location: clean(row.get('location')),
    mismatchTime: clean(row.get('mismatch time') || row.get('mismatch')),
  };
}).filter((row) => row.container);
const xml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]);
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
  ['LOCATION', 'location', 135], ['CONTAINER', 'container', 145],
  ['CHASSIS', 'chassis', 125], ['REQUIRED POOL', 'requiredPool', 125],
  ['SIZE', 'size', 70], ['DURATION (MIN)', 'durationMinutes', 135],
];
const mismatchColumns = [
  ['LOCATION', 'location', 140], ['CONTAINER', 'container', 145],
  ['CHASSIS', 'chassis', 145], ['REQUIRED POOL', 'requiredPool', 120],
  ['CHASSIS POOL', 'chassisPool', 115], ['SIZE', 'size', 70],
];
const margin = 24;
const tableWidth = mismatchColumns.reduce((total, column) => total + column[2], 0);
const sectionHeight = (sectionRows) => 70 + Math.max(sectionRows.length, 1) * 38;
const mismatchY = 94 + sectionHeight(noMates) + 16;
const height = mismatchY + sectionHeight(mismatches) + 24;
function section(title, sectionRows, startY, accent, noMateSection, sectionColumns) {
  let output = `<rect x="${margin}" y="${startY}" width="${tableWidth}" height="36" rx="8" fill="${accent}"/><text x="${margin + 13}" y="${startY + 24}" class="section">${title}</text><text x="${margin + tableWidth - 13}" y="${startY + 24}" text-anchor="end" class="section">${sectionRows.length}</text>`;
  let x = margin;
  for (const [label, _key, width] of sectionColumns) {
    output += `<rect x="${x}" y="${startY + 36}" width="${width}" height="34" fill="#d9dde2"/><text x="${x + 8}" y="${startY + 58}" class="header">${label}</text>`;
    x += width;
  }
  if (!sectionRows.length) return `${output}<text x="${margin + 13}" y="${startY + 96}" class="empty">None in this report</text>`;
  sectionRows.forEach((row, index) => {
    const y = startY + 70 + index * 38;
    output += `<rect x="${margin}" y="${y}" width="${tableWidth}" height="38" fill="${index % 2 ? '#eceff2' : '#ffffff'}"/>`;
    x = margin;
    for (const [_label, key, width] of sectionColumns) {
      const raw = noMateSection && key === 'chassis' ? 'NO MATE' : row[key] || '-';
      output += `<text x="${x + 8}" y="${y + 24}" class="${noMateSection && key === 'chassis' ? 'warning' : 'cell'}">${xml(raw.length > 24 ? `${raw.slice(0, 21)}...` : raw)}</text>`;
      x += width;
    }
  });
  return output;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tableWidth + margin * 2}" height="${height}"><style>text{font-family:Segoe UI,Arial}.title{font-size:25px;font-weight:900;fill:#111827}.summary{font-size:13px;font-weight:700;fill:#5b6573}.header{font-size:9px;font-weight:900;letter-spacing:.55px;fill:#27313f}.cell{font-size:12px;font-weight:700;fill:#17202c}.warning{font-size:12px;font-weight:900;fill:#c8102e}.section{font-size:13px;font-weight:900;letter-spacing:1px;fill:#ffffff}.empty{font-size:12px;font-weight:700;fill:#657080}</style><rect width="100%" height="100%" fill="#ffffff"/><rect width="100%" height="6" fill="#c8102e"/><text x="${margin}" y="40" class="title">Settegast Inbound Equipment Status [${xml(reportTime)}]</text><text x="${margin}" y="67" class="summary">${noMates.length} no mates | ${mismatches.length} pool mismatches</text>${section('NO MATES', noMates, 94, '#c8102e', true, noMateColumns)}${section('POOL MISMATCHES', mismatches, mismatchY, '#111111', false, mismatchColumns)}</svg>`;
sharp(Buffer.from(svg), { failOn: 'warning' }).png().toBuffer().then((png) => writeFile(target, png));
