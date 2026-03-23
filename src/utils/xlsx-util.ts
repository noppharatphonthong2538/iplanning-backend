/**
 * Pure TypeScript XLSX writer & reader — zero external dependencies.
 * Uses Node.js built-in `zlib` (deflate) and `Buffer` to produce/consume
 * valid Office Open XML (.xlsx) files.
 *
 * Writer  : buildXlsx(sheets)  → Buffer
 * Reader  : parseXlsx(buffer) → { [sheetName]: string[][] }
 */

import { deflateRawSync, inflateRawSync } from 'zlib';

// ─────────────────────────────────────────────
// CRC-32
// ─────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ─────────────────────────────────────────────
// ZIP builder
// ─────────────────────────────────────────────
interface ZipEntry { name: string; data: Buffer }

function buildZip(entries: ZipEntry[]): Buffer {
  const parts: Buffer[] = [];
  const centralDir: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const raw  = entry.data;
    const comp = deflateRawSync(raw, { level: 6 });
    const crc  = crc32(raw);
    const now  = dosDateTime();

    // Local file header
    const lh = Buffer.alloc(30 + name.length);
    lh.writeUInt32LE(0x04034b50, 0);  // sig
    lh.writeUInt16LE(20, 4);           // version needed
    lh.writeUInt16LE(0, 6);            // flags
    lh.writeUInt16LE(8, 8);            // compression: DEFLATE
    lh.writeUInt16LE(now.time, 10);
    lh.writeUInt16LE(now.date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);           // extra length
    name.copy(lh, 30);

    // Central directory header
    const cd = Buffer.alloc(46 + name.length);
    cd.writeUInt32LE(0x02014b50, 0);  // sig
    cd.writeUInt16LE(20, 4);           // version made by
    cd.writeUInt16LE(20, 6);           // version needed
    cd.writeUInt16LE(0, 8);            // flags
    cd.writeUInt16LE(8, 10);           // compression
    cd.writeUInt16LE(now.time, 12);
    cd.writeUInt16LE(now.date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30);           // extra
    cd.writeUInt16LE(0, 32);           // comment
    cd.writeUInt16LE(0, 34);           // disk start
    cd.writeUInt16LE(0, 36);           // int attr
    cd.writeUInt32LE(0, 38);           // ext attr
    cd.writeUInt32LE(offset, 42);      // relative offset
    name.copy(cd, 46);

    parts.push(lh, comp);
    centralDir.push(cd);
    offset += lh.length + comp.length;
  }

  const cdBuf = Buffer.concat(centralDir);
  const eocd  = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, cdBuf, eocd]);
}

function dosDateTime() {
  const d = new Date();
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { date, time };
}

// ─────────────────────────────────────────────
// XML helpers
// ─────────────────────────────────────────────
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Convert column index (0-based) to A, B, ... Z, AA, AB ...
function colName(i: number): string {
  let s = '';
  i++;
  while (i > 0) { s = String.fromCharCode(64 + (i % 26 || 26)) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

// ─────────────────────────────────────────────
// XLSX Writer
// ─────────────────────────────────────────────
export interface XlsxSheet { name: string; rows: (string | number | null)[][] }

export function buildXlsx(sheets: XlsxSheet[]): Buffer {
  // Collect all strings into a shared string table
  const sst: string[] = [];
  const sstIndex = new Map<string, number>();

  function si(val: string): number {
    if (sstIndex.has(val)) return sstIndex.get(val)!;
    const idx = sst.length;
    sst.push(val);
    sstIndex.set(val, idx);
    return idx;
  }

  // Pre-process: build SST
  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      for (const cell of row) {
        if (cell !== null && typeof cell === 'string') si(cell);
      }
    }
  }

  // ── Content Types ──
  const sheetOverrides = sheets
    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+main+xml"/>`)
    .join('');
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetOverrides}
</Types>`;

  // ── Root .rels ──
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  // ── Workbook ──
  const sheetElems = sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetElems}</sheets>
</workbook>`;

  // ── Workbook .rels ──
  const wbRelsEntries = sheets
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join('');
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${wbRelsEntries}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  // ── Styles (minimal with one header style) ──
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/>
  </cellXfs>
</styleSheet>`;

  // ── Shared Strings ──
  const sstXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sst.length}" uniqueCount="${sst.length}">
${sst.map((s) => `  <si><t xml:space="preserve">${esc(s)}</t></si>`).join('\n')}
</sst>`;

  // ── Worksheets ──
  function buildSheet(sheet: XlsxSheet, sheetIdx: number): string {
    const rowXmls: string[] = [];
    for (let r = 0; r < sheet.rows.length; r++) {
      const row = sheet.rows[r];
      const cellXmls: string[] = [];
      for (let c = 0; c < row.length; c++) {
        const addr = `${colName(c)}${r + 1}`;
        const val  = row[c];
        const styleAttr = r === 0 ? ' s="1"' : '';  // header row = bold+bg
        if (val === null || val === undefined || val === '') {
          // Empty cell — still emit for header style
          if (r === 0) cellXmls.push(`<c r="${addr}"${styleAttr}/>`);
        } else if (typeof val === 'number') {
          cellXmls.push(`<c r="${addr}" t="n"${styleAttr}><v>${val}</v></c>`);
        } else {
          const idx = sstIndex.get(String(val)) ?? 0;
          cellXmls.push(`<c r="${addr}" t="s"${styleAttr}><v>${idx}</v></c>`);
        }
      }
      if (cellXmls.length > 0) {
        rowXmls.push(`  <row r="${r + 1}">${cellXmls.join('')}</row>`);
      }
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
${rowXmls.join('\n')}
  </sheetData>
</worksheet>`;
  }

  // ── Assemble ZIP ──
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml',      data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels',              data: Buffer.from(rootRels, 'utf8') },
    { name: 'xl/workbook.xml',          data: Buffer.from(workbook, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(wbRels, 'utf8') },
    { name: 'xl/sharedStrings.xml',     data: Buffer.from(sstXml, 'utf8') },
    { name: 'xl/styles.xml',            data: Buffer.from(styles, 'utf8') },
    ...sheets.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: Buffer.from(buildSheet(s, i), 'utf8'),
    })),
  ];

  return buildZip(entries);
}

// ─────────────────────────────────────────────
// XLSX Reader
// ─────────────────────────────────────────────
/** Parse an xlsx Buffer → map of sheetName → rows (string[][]) */
export function parseXlsx(buf: Buffer): Record<string, string[][]> {
  // ── Unzip ──
  const files = unzip(buf);

  // ── Shared Strings ──
  const sstXml = files['xl/sharedStrings.xml'] ?? '';
  const strings: string[] = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(sstXml))) {
    // collect all <t> values inside this <si>
    const tRe = /<t[^>]*>([^<]*)<\/t>/g;
    let tm: RegExpExecArray | null;
    let text = '';
    while ((tm = tRe.exec(m[1]))) text += tm[1];
    strings.push(unescXml(text));
  }

  // ── Workbook: sheet names ──
  const wbXml = files['xl/workbook.xml'] ?? '';
  const sheetNames: { id: string; name: string }[] = [];
  const sheetRe = /<sheet[^>]+name="([^"]*)"[^>]+r:id="([^"]*)"/g;
  while ((m = sheetRe.exec(wbXml))) sheetNames.push({ name: unescXml(m[1]), id: m[2] });

  // ── Workbook rels: map rId → sheet file ──
  const wbRelsXml = files['xl/_rels/workbook.xml.rels'] ?? '';
  const rIdToFile = new Map<string, string>();
  const relRe = /<Relationship[^>]+Id="([^"]*)"[^>]+Target="([^"]*)"/g;
  while ((m = relRe.exec(wbRelsXml))) rIdToFile.set(m[1], m[2]);

  // ── Parse each sheet ──
  const result: Record<string, string[][]> = {};
  for (const sn of sheetNames) {
    const target = rIdToFile.get(sn.id) ?? '';
    const key = target.startsWith('worksheets/') ? `xl/${target}` : `xl/worksheets/${target}`;
    const wsXml = files[key] ?? '';
    result[sn.name] = parseWorksheet(wsXml, strings);
  }
  return result;
}

function parseWorksheet(xml: string, sst: string[]): string[][] {
  const rows: string[][] = [];
  let headerLen = 0;

  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const rowXml = rm[2];
    const rowCells: { col: number; val: string }[] = [];

    // Match both regular cells <c ...>...</c> AND self-closing empty cells <c ... />
    // Self-closing cells (e.g. blank cells cleared in Excel) have no value — treated as ''
    const cellRe = /<c\s([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rowXml))) {
      const attrs  = cm[1];
      const inner  = cm[3] ?? '';  // undefined for self-closing
      const rAttr  = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? '';
      const tAttr  = /\bt="([^"]*)"/.exec(attrs)?.[1] ?? '';
      const colStr = rAttr.replace(/\d/g, '');
      if (!colStr) continue;
      const colIdx = colLetterToIndex(colStr);
      const vMatch = /<v>([^<]*)<\/v>/.exec(inner);
      let val = '';
      if (vMatch) {
        val = tAttr === 's' ? (sst[parseInt(vMatch[1], 10)] ?? '') : unescXml(vMatch[1]);
      }
      rowCells.push({ col: colIdx, val });
    }

    if (rowCells.length === 0) continue;

    // Row 1 = header — record its width so data rows are padded to same length
    const maxCol = Math.max(...rowCells.map((c) => c.col));
    const rowLen = Math.max(maxCol + 1, headerLen);  // never shorter than header
    const row = new Array(rowLen).fill('');
    for (const { col, val } of rowCells) row[col] = val;

    if (rows.length === 0) headerLen = row.length;  // capture header length
    rows.push(row);
  }
  return rows;
}

function colLetterToIndex(s: string): number {
  let idx = 0;
  for (let i = 0; i < s.length; i++) idx = idx * 26 + (s.charCodeAt(i) - 64);
  return idx - 1;
}

function unescXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ─────────────────────────────────────────────
// ZIP reader
// ─────────────────────────────────────────────
function unzip(buf: Buffer): Record<string, string> {
  const files: Record<string, string> = {};

  // Find End of Central Directory
  let eocdPos = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocdPos = i; break; }
  }
  if (eocdPos < 0) return files;

  const cdOffset = buf.readUInt32LE(eocdPos + 16);
  const cdCount  = buf.readUInt16LE(eocdPos + 10);

  let pos = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const compression   = buf.readUInt16LE(pos + 10);
    const compSize      = buf.readUInt32LE(pos + 20);
    const uncompSize    = buf.readUInt32LE(pos + 24);
    const nameLen       = buf.readUInt16LE(pos + 28);
    const extraLen      = buf.readUInt16LE(pos + 30);
    const commentLen    = buf.readUInt16LE(pos + 32);
    const localOffset   = buf.readUInt32LE(pos + 42);
    const name          = buf.slice(pos + 46, pos + 46 + nameLen).toString('utf8');
    pos += 46 + nameLen + extraLen + commentLen;

    // Local file header
    const lhExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart  = localOffset + 30 + nameLen + lhExtraLen;

    try {
      let data: Buffer;
      if (compression === 0) {
        data = buf.slice(dataStart, dataStart + uncompSize);
      } else if (compression === 8) {
        data = inflateRawSync(buf.slice(dataStart, dataStart + compSize));
      } else continue;
      files[name] = data.toString('utf8');
    } catch { /* skip bad entries */ }
  }
  return files;
}
