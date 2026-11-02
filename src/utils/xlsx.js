// ============================================================
// PENULIS FILE EXCEL (.xlsx) TANPA PAKET TAMBAHAN
// Membuat file Excel langsung dari Node.js: sheet, gaya sel, rumus, serta
// grafik asli Excel (batang, garis, lingkaran). File .xlsx hanyalah ZIP berisi
// file XML, jadi cukup modul bawaan Node.js (zlib).
//
// Pemakaian singkat:
//   const wb = new Workbook();
//   const sh = wb.addSheet('Ringkasan');
//   sh.set(1, 1, 'Judul', 'title');          // baris 1, kolom A
//   sh.set(3, 1, { f: 'SUM(B1:B2)', v: 7 }); // rumus + nilai cadangan
//   sh.addChart({ type: 'bar', title: '...', cats: {...}, vals: {...}, from: {col: 3, row: 2}, to: {col: 10, row: 18} });
//   const buffer = wb.toBuffer();
// ============================================================
const zlib = require('zlib');

// ---------- ZIP ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const chunks = [];
  const central = [];
  let offset = 0;

  files.forEach((file) => {
    const name = Buffer.from(file.name, 'utf8');
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
    const packed = zlib.deflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nama file UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, packed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(dosTime, 12);
    entry.writeUInt16LE(dosDate, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);

    offset += local.length + name.length + packed.length;
  });

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, centralBuffer, end]);
}

// ---------- Util ----------

// Menghapus karakter kontrol yang membuat XML tidak valid, lalu meloloskan simbol XML
const esc = (value) =>
  String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// 1 -> A, 27 -> AA
function colName(n) {
  let name = '';
  let x = n;
  while (x > 0) {
    const rem = (x - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    x = Math.floor((x - 1) / 26);
  }
  return name;
}

const ref = (r, c) => `${colName(c)}${r}`;
const absRef = (r, c) => `$${colName(c)}$${r}`;

// "2026-10-26" -> nomor seri tanggal Excel (hari sejak 30 Desember 1899)
function dateSerial(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!match) return null;
  return Math.round((Date.UTC(+match[1], +match[2] - 1, +match[3]) - Date.UTC(1899, 11, 30)) / 86400000);
}

// Nama sheet yang aman dipakai dalam rumus: 'Data'!$A$1
const sheetRef = (name) => `'${String(name).replace(/'/g, "''")}'`;

// "2026-10-26 14:05:00" atau objek Date -> nomor seri tanggal + jam Excel (pecahan = jam)
function dateTimeSerial(value) {
  let y;
  let mo;
  let d;
  let h = 0;
  let mi = 0;
  let s = 0;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    [y, mo, d, h, mi, s] = [value.getFullYear(), value.getMonth() + 1, value.getDate(), value.getHours(), value.getMinutes(), value.getSeconds()];
  } else {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(value || ''));
    if (!m) return null;
    [y, mo, d, h, mi, s] = [+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)];
  }
  const days = (Date.UTC(y, mo - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  // dibulatkan ke detik agar jam tampil tepat (tanpa sisa pecahan)
  return Math.round((days * 86400 + h * 3600 + mi * 60 + s)) / 86400;
}

// ---------- Warna ----------

const RED = 'C4111F';
// Palet RGB tegas (jenuh) agar tiap kategori mudah dibedakan di grafik dan kartu angka
const PALETTE = ['E11D2E', '1D6FEB', 'FFB400', '12B76A', '8B3FD9', 'FF6A00', '00B8D9', 'E91E8C', '84CC16', '0F766E'];
const GRAY = '8A94A6';
const INK = '1D2331';
const LINE = 'D5D9E0';

// ---------- Gaya sel ----------
// Gaya dideskripsikan sebagai objek lalu didaftarkan otomatis (tanpa daftar tetap):
//   { font: { size, bold, italic, color }, fill: 'RRGGBB', border: true | { style, color, sides: 'lrtb' },
//     h: 'left|center|right', v: 'top|center', wrap: true, numFmt: 'dd/mm/yyyy', indent: 1 }
// Nama gaya di bawah dipakai di seluruh laporan: sheet.set(r, c, nilai, 'header').

const ALT = 'FFF3F4'; // warna selang-seling baris data (merah sangat muda)

const BASE_CELL = { border: true, v: 'center' };
const STYLE_DEFS = {
  default: {},
  title: { font: { size: 16, bold: true, color: RED } },
  sub: { font: { size: 9, italic: true, color: '5A6372' } },
  section: { font: { size: 12, bold: true, color: INK } },
  header: { font: { bold: true, color: 'FFFFFF' }, fill: RED, border: { color: 'FFFFFF' }, h: 'center', v: 'center', wrap: true },
  text: { ...BASE_CELL },
  textAlt: { ...BASE_CELL, fill: ALT },
  center: { ...BASE_CELL, h: 'center' },
  centerAlt: { ...BASE_CELL, h: 'center', fill: ALT },
  date: { ...BASE_CELL, h: 'center', numFmt: 'dd/mm/yyyy' },
  dateAlt: { ...BASE_CELL, h: 'center', numFmt: 'dd/mm/yyyy', fill: ALT },
  datetime: { ...BASE_CELL, h: 'center', numFmt: 'dd/mm/yyyy hh:mm' },
  datetimeAlt: { ...BASE_CELL, h: 'center', numFmt: 'dd/mm/yyyy hh:mm', fill: ALT },
  wrap: { ...BASE_CELL, wrap: true },
  wrapAlt: { ...BASE_CELL, wrap: true, fill: ALT },
  percent: { ...BASE_CELL, h: 'center', numFmt: '0.0%' },
  percentAlt: { ...BASE_CELL, h: 'center', numFmt: '0.0%', fill: ALT },
  muted: { ...BASE_CELL, font: { size: 9, color: '7A8294' } },
  mutedAlt: { ...BASE_CELL, font: { size: 9, color: '7A8294' }, fill: ALT },
  note: { font: { size: 9, italic: true, color: '5A6372' }, wrap: true, v: 'top' },
  bar: { font: { size: 12, bold: true, color: 'FFFFFF' }, fill: INK, v: 'center', indent: 1 }
};

const BUILTIN_FORMATS = { '0': 1, '0.00': 2, '0%': 9, '0.00%': 10 };

const fontXml = ({ size = 10, bold = false, italic = false, color = null, name = 'Arial' } = {}) =>
  `<font>${bold ? '<b/>' : ''}${italic ? '<i/>' : ''}<sz val="${size}"/>${color ? `<color rgb="FF${color}"/>` : ''}<name val="${name}"/></font>`;

function borderXml(border) {
  const b = { style: 'thin', color: LINE, sides: 'lrtb', ...(border === true ? {} : border) };
  const side = (tag, key) => (b.sides.includes(key) ? `<${tag} style="${b.style}"><color rgb="FF${b.color}"/></${tag}>` : `<${tag}/>`);
  return `<border>${side('left', 'l')}${side('right', 'r')}${side('top', 't')}${side('bottom', 'b')}<diagonal/></border>`;
}

class Styles {
  constructor() {
    this.fonts = [fontXml()];
    this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    this.borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    this.formats = [];
    this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    this.cache = new Map([['{}', 0]]);
    this.named = new Map();
  }

  static intern(list, xml) {
    let i = list.indexOf(xml);
    if (i < 0) {
      list.push(xml);
      i = list.length - 1;
    }
    return i;
  }

  // Nama gaya (teks) atau deskripsi gaya (objek) -> indeks di cellXfs
  id(style) {
    if (typeof style === 'string' && this.named.has(style)) return this.named.get(style);
    const def = typeof style === 'string' ? STYLE_DEFS[style] || {} : style || {};
    const key = JSON.stringify(def);
    if (!this.cache.has(key)) this.cache.set(key, this.add(def));
    if (typeof style === 'string') this.named.set(style, this.cache.get(key));
    return this.cache.get(key);
  }

  add(def) {
    const fontId = def.font ? Styles.intern(this.fonts, fontXml(def.font)) : 0;
    const fillId = def.fill ? Styles.intern(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${def.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const borderId = def.border ? Styles.intern(this.borders, borderXml(def.border)) : 0;

    let numFmtId = 0;
    if (def.numFmt) {
      if (BUILTIN_FORMATS[def.numFmt]) numFmtId = BUILTIN_FORMATS[def.numFmt];
      else {
        let i = this.formats.indexOf(def.numFmt);
        if (i < 0) {
          this.formats.push(def.numFmt);
          i = this.formats.length - 1;
        }
        numFmtId = 164 + i;
      }
    }

    const align =
      def.h || def.v || def.wrap || def.indent
        ? `<alignment${def.h ? ` horizontal="${def.h}"` : ''}${def.v ? ` vertical="${def.v}"` : ''}${def.wrap ? ' wrapText="1"' : ''}${def.indent ? ` indent="${def.indent}"` : ''}/>`
        : '';
    const flags = `${numFmtId ? ' applyNumberFormat="1"' : ''}${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''}${align ? ' applyAlignment="1"' : ''}`;
    const xf = `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${flags}${align ? `>${align}</xf>` : '/>'}`;
    this.xfs.push(xf);
    return this.xfs.length - 1;
  }

  xml() {
    const formats = this.formats.length
      ? `<numFmts count="${this.formats.length}">${this.formats.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join('')}</numFmts>\n`
      : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${formats}<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>
<fills count="${this.fills.length}">${this.fills.join('')}</fills>
<borders count="${this.borders.length}">${this.borders.join('')}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${this.xfs.length}">${this.xfs.join('\n')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  }
}

// ---------- Sheet ----------

class Sheet {
  constructor(workbook, name, options = {}) {
    this.workbook = workbook;
    this.name = name;
    this.tabColor = options.tab || RED;
    this.rows = new Map();
    this.widths = [];
    this.heights = new Map();
    this.merges = [];
    this.charts = [];
    this.dataBars = [];
    this.rowBreaks = [];
    this.filter = null;
    this.freezeRow = 0;
    this.landscape = true;
  }

  // set(baris, kolom, nilai, gaya). Nilai: angka, teks, atau { f: 'rumus', v: nilaiCadangan }
  set(r, c, value, style = 'default') {
    if (!this.rows.has(r)) this.rows.set(r, new Map());
    this.rows.get(r).set(c, { value, style: this.workbook.styles.id(style) });
    return this;
  }

  // Menulis satu baris sekaligus mulai dari kolom tertentu
  row(r, values, style = 'text', startCol = 1) {
    values.forEach((value, i) => this.set(r, startCol + i, value, Array.isArray(style) ? style[i] : style));
    return this;
  }

  // Sel gabungan dengan gaya yang sama di seluruh selnya (supaya warna dan garis tepi utuh)
  block(r1, c1, r2, c2, value, style = 'default') {
    for (let r = r1; r <= r2; r += 1) {
      for (let c = c1; c <= c2; c += 1) this.set(r, c, r === r1 && c === c1 ? value : '', style);
    }
    if (r1 !== r2 || c1 !== c2) this.merges.push(`${ref(r1, c1)}:${ref(r2, c2)}`);
    return this;
  }

  cols(widths) {
    this.widths = widths;
    return this;
  }

  height(r, points) {
    this.heights.set(r, points);
    return this;
  }

  merge(range) {
    this.merges.push(range);
    return this;
  }

  autoFilter(range) {
    this.filter = range;
    return this;
  }

  freeze(rowsAbove) {
    this.freezeRow = rowsAbove;
    return this;
  }

  // Batang data di dalam sel (panjang batang mengikuti angka)
  dataBar(range, color) {
    this.dataBars.push({ range, color });
    return this;
  }

  // Pemisah halaman cetak: halaman baru dimulai setelah baris r
  pageBreak(r) {
    this.rowBreaks.push(r);
    return this;
  }

  addChart(options) {
    this.charts.push(options);
    return this;
  }

  xml(index, hasDrawing) {
    let maxRow = 1;
    let maxCol = 1;
    this.rows.forEach((cells, r) => {
      maxRow = Math.max(maxRow, r);
      cells.forEach((_, c) => {
        maxCol = Math.max(maxCol, c);
      });
    });

    const sst = this.workbook.sharedStrings;
    const rowsXml = [...this.rows.keys()]
      .sort((a, b) => a - b)
      .map((r) => {
        const cells = this.rows.get(r);
        const ht = this.heights.get(r);
        const cellsXml = [...cells.keys()]
          .sort((a, b) => a - b)
          .map((c) => {
            const { value, style } = cells.get(c);
            const at = `r="${ref(r, c)}" s="${style}"`;

            if (value === null || value === undefined || value === '') return `<c ${at}/>`;

            if (typeof value === 'object' && value.f) {
              const cached = value.v;
              if (typeof cached === 'number') return `<c ${at}><f>${esc(value.f)}</f><v>${cached}</v></c>`;
              return `<c ${at} t="str"><f>${esc(value.f)}</f><v>${esc(cached ?? '')}</v></c>`;
            }

            if (typeof value === 'number' && Number.isFinite(value)) return `<c ${at}><v>${value}</v></c>`;
            return `<c ${at} t="s"><v>${sst.index(String(value))}</v></c>`;
          })
          .join('');
        return `<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cellsXml}</row>`;
      })
      .join('');

    const colsXml = this.widths.length
      ? `<cols>${this.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      : '';

    const pane = this.freezeRow
      ? `<pane ySplit="${this.freezeRow}" topLeftCell="A${this.freezeRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${this.freezeRow + 1}" sqref="A${this.freezeRow + 1}"/>`
      : '';

    const bars = this.dataBars
      .map(
        (bar, i) =>
          `<conditionalFormatting sqref="${bar.range}"><cfRule type="dataBar" priority="${i + 1}"><dataBar><cfvo type="num" val="0"/><cfvo type="max"/><color rgb="FF${bar.color}"/></dataBar></cfRule></conditionalFormatting>`
      )
      .join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><tabColor rgb="FF${this.tabColor}"/><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${ref(maxRow, maxCol)}"/>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"${index === 0 ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${colsXml}
<sheetData>${rowsXml}</sheetData>
${this.filter ? `<autoFilter ref="${this.filter}"/>` : ''}
${this.merges.length ? `<mergeCells count="${this.merges.length}">${this.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}
${bars}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="${this.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>
${this.rowBreaks.length ? `<rowBreaks count="${this.rowBreaks.length}" manualBreakCount="${this.rowBreaks.length}">${this.rowBreaks.map((b) => `<brk id="${b}" max="16383" man="1"/>`).join('')}</rowBreaks>` : ''}
${hasDrawing ? '<drawing r:id="rId1"/>' : ''}
</worksheet>`;
  }
}

class SharedStrings {
  constructor() {
    this.list = [];
    this.map = new Map();
  }

  index(text) {
    if (!this.map.has(text)) {
      this.map.set(text, this.list.length);
      this.list.push(text);
    }
    return this.map.get(text);
  }

  xml() {
    const items = this.list.map((t) => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.list.length}" uniqueCount="${this.list.length}">${items}</sst>`;
  }
}

// ---------- Grafik ----------

const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

const fill = (hex) => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;

// Angka nol disembunyikan pada label supaya grafik tidak penuh "0"
const HIDE_ZERO = '0;-0;;';

const textProps = (size, bold = false, color = INK, rotate = 0) =>
  `<c:txPr><a:bodyPr${rotate ? ` rot="${rotate}" vert="horz"` : ''}/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size}" b="${bold ? 1 : 0}">${fill(color)}<a:latin typeface="Arial"/></a:defRPr></a:pPr><a:endParaRPr lang="id-ID"/></a:p></c:txPr>`;

function strCache(values) {
  return `<c:strCache><c:ptCount val="${values.length}"/>${values
    .map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`)
    .join('')}</c:strCache>`;
}

function numCache(values) {
  return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values
    .map((v, i) => `<c:pt idx="${i}"><c:v>${Number(v) || 0}</c:v></c:pt>`)
    .join('')}</c:numCache>`;
}

function axisTitle(text) {
  if (!text) return '';
  return `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000" b="1">${fill('4A5363')}<a:latin typeface="Arial"/></a:defRPr></a:pPr><a:r><a:rPr lang="id-ID" sz="1000" b="1">${fill('4A5363')}<a:latin typeface="Arial"/></a:rPr><a:t>${esc(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
}

// Warna tiap titik data: daftar warna khusus > satu warna > palet tegas
const pointColors = (o) => o.cats.values.map((_, i) => (o.colors && o.colors[i]) || o.color || PALETTE[i % PALETTE.length]);

// cats / vals: { sheet, col, fromRow, toRow, values: [...] }
function seriesXml(kind, o) {
  const catRef = `${sheetRef(o.cats.sheet)}!${absRef(o.cats.fromRow, o.cats.col)}:${absRef(o.cats.toRow, o.cats.col)}`;
  const valRef = `${sheetRef(o.vals.sheet)}!${absRef(o.vals.fromRow, o.vals.col)}:${absRef(o.vals.toRow, o.vals.col)}`;

  const cat = `<c:cat><c:strRef><c:f>${esc(catRef)}</c:f>${strCache(o.cats.values)}</c:strRef></c:cat>`;
  const val = `<c:val><c:numRef><c:f>${esc(valRef)}</c:f>${numCache(o.vals.values)}</c:numRef></c:val>`;
  const name = `<c:tx><c:v>${esc(o.seriesName || 'Jumlah')}</c:v></c:tx>`;
  const colors = pointColors(o);

  // Label angka (batang dan garis)
  const valueLabels = (position) =>
    `<c:dLbls><c:numFmt formatCode="${HIDE_ZERO}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${textProps(1000, true, INK)}<c:dLblPos val="${position}"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`;

  if (kind === 'pie') {
    // Setiap irisan memuat nama + persen langsung di lingkaran (kotak putih agar terbaca di warna apa pun)
    const labels = `<c:dLbls><c:numFmt formatCode="0.0%" sourceLinked="0"/><c:spPr>${fill('FFFFFF')}<a:ln w="9525">${fill('C9CED8')}</a:ln></c:spPr>${textProps(1000, true, INK)}<c:dLblPos val="bestFit"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="1"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:separator>\n</c:separator><c:showLeaderLines val="1"/></c:dLbls>`;
    const points = colors
      .map((hex, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr>${fill(hex)}<a:ln w="25400">${fill('FFFFFF')}</a:ln></c:spPr></c:dPt>`)
      .join('');
    return `<c:ser><c:idx val="0"/><c:order val="0"/>${name}${points}${labels}${cat}${val}</c:ser>`;
  }

  if (kind === 'line') {
    const color = o.color || PALETTE[1];
    return `<c:ser><c:idx val="0"/><c:order val="0"/>${name}<c:spPr><a:ln w="38100" cap="rnd">${fill(color)}<a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="8"/><c:spPr>${fill(color)}<a:ln w="19050">${fill('FFFFFF')}</a:ln></c:spPr></c:marker>${valueLabels('t')}${cat}${val}<c:smooth val="0"/></c:ser>`;
  }

  // Batang: tiap batang berwarna sendiri
  const bars = colors.map((hex, i) => `<c:dPt><c:idx val="${i}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr>${fill(hex)}</c:spPr></c:dPt>`).join('');
  return `<c:ser><c:idx val="0"/><c:order val="0"/>${name}<c:spPr>${fill(colors[0] || RED)}</c:spPr><c:invertIfNegative val="0"/>${bars}${valueLabels('outEnd')}${cat}${val}</c:ser>`;
}

function chartXml(o) {
  const kind = o.type; // 'col' | 'bar' | 'line' | 'pie'
  const horizontal = kind === 'bar';
  const maxValue = Math.max(0, ...o.vals.values.map((v) => Number(v) || 0));
  // Sumbu angka bulat: tanpa ini Excel bisa menampilkan 0,5 / 1,5 untuk data kecil
  const unit = kind !== 'pie' && maxValue <= 10 ? '<c:majorUnit val="1"/>' : '';
  const rotate = o.rotateCats ? -2700000 : 0;

  const axes = (catPos, valPos) => `
<c:catAx><c:axId val="111111"/><c:scaling><c:orientation val="${horizontal ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${catPos}"/>${axisTitle(o.catTitle)}<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="12700">${fill('9AA3B2')}</a:ln></c:spPr>${textProps(1000, false, INK, rotate)}<c:crossAx val="222222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/>${o.everyLabel ? '<c:tickLblSkip val="1"/>' : ''}<c:noMultiLvlLbl val="0"/></c:catAx>
<c:valAx><c:axId val="222222"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="${valPos}"/><c:majorGridlines><c:spPr><a:ln w="6350">${fill('E3E6EC')}</a:ln></c:spPr></c:majorGridlines>${axisTitle(o.valTitle)}<c:numFmt formatCode="0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${textProps(1000, false, '4A5363')}<c:crossAx val="111111"/><c:crosses val="${horizontal ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/>${unit}</c:valAx>`;

  let plot;
  if (kind === 'pie') {
    plot = `<c:pieChart><c:varyColors val="1"/>${seriesXml('pie', o)}<c:firstSliceAng val="0"/></c:pieChart>`;
  } else if (kind === 'line') {
    plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${seriesXml('line', o)}<c:marker val="1"/><c:axId val="111111"/><c:axId val="222222"/></c:lineChart>${axes('b', 'l')}`;
  } else {
    plot = `<c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${seriesXml('bar', o)}<c:gapWidth val="45"/><c:axId val="111111"/><c:axId val="222222"/></c:barChart>${axes(horizontal ? 'l' : 'b', horizontal ? 'b' : 'l')}`;
  }

  const legend = kind === 'pie' ? `<c:legend><c:legendPos val="r"/><c:overlay val="0"/>${textProps(1000, false, INK)}</c:legend>` : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:roundedCorners val="0"/>
<c:chart>
<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="1">${fill(INK)}<a:latin typeface="Arial"/></a:defRPr></a:pPr><a:r><a:rPr lang="id-ID" sz="1400" b="1">${fill(INK)}<a:latin typeface="Arial"/></a:rPr><a:t>${esc(o.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
<c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>${plot}</c:plotArea>
${legend}
<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
</c:chart>
<c:spPr>${fill('FFFFFF')}<a:ln w="15875">${fill('C9CED8')}</a:ln></c:spPr>
</c:chartSpace>`;
}

function drawingXml(charts) {
  const anchors = charts
    .map(
      (chart, i) => `
<xdr:twoCellAnchor>
<xdr:from><xdr:col>${chart.from.col}</xdr:col><xdr:colOff>${chart.from.colOff || 0}</xdr:colOff><xdr:row>${chart.from.row}</xdr:row><xdr:rowOff>${chart.from.rowOff || 0}</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>${chart.to.col}</xdr:col><xdr:colOff>${chart.to.colOff || 0}</xdr:colOff><xdr:row>${chart.to.row}</xdr:row><xdr:rowOff>${chart.to.rowOff || 0}</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Grafik ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame>
<xdr:clientData/>
</xdr:twoCellAnchor>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${NS_A}">${anchors}
</xdr:wsDr>`;
}

// ---------- Workbook ----------

class Workbook {
  constructor() {
    this.sheets = [];
    this.sharedStrings = new SharedStrings();
    this.styles = new Styles();
  }

  addSheet(name, options) {
    const clean = String(name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    const sheet = new Sheet(this, clean, options);
    this.sheets.push(sheet);
    return sheet;
  }

  toBuffer() {
    const files = [];
    const overrides = [];
    let chartCount = 0;
    let drawingCount = 0;

    const sheetXmls = [];
    this.sheets.forEach((sheet, i) => {
      const hasDrawing = sheet.charts.length > 0;
      sheetXmls.push(sheet.xml(i, hasDrawing));
      files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXmls[i] });
      overrides.push(
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      );

      if (hasDrawing) {
        drawingCount += 1;
        const drawingId = drawingCount;
        const chartRels = [];

        sheet.charts.forEach((chart, k) => {
          chartCount += 1;
          files.push({ name: `xl/charts/chart${chartCount}.xml`, data: chartXml(chart) });
          overrides.push(
            `<Override PartName="/xl/charts/chart${chartCount}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`
          );
          chartRels.push(
            `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartCount}.xml"/>`
          );
        });

        files.push({ name: `xl/drawings/drawing${drawingId}.xml`, data: drawingXml(sheet.charts) });
        files.push({
          name: `xl/drawings/_rels/drawing${drawingId}.xml.rels`,
          data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${chartRels.join('')}</Relationships>`
        });
        files.push({
          name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
          data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingId}.xml"/></Relationships>`
        });
        overrides.push(
          `<Override PartName="/xl/drawings/drawing${drawingId}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
        );
      }
    });

    const sheetEntries = this.sheets
      .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('');

    files.unshift(
      {
        name: '[Content_Types].xml',
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>${overrides.join('')}</Types>`
      },
      {
        name: '_rels/.rels',
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
      },
      {
        name: 'xl/workbook.xml',
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheetEntries}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`
      },
      {
        name: 'xl/_rels/workbook.xml.rels',
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${this.sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
          )
          .join('')}<Relationship Id="rId${this.sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${this.sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`
      }
    );

    // styles dan sharedStrings dibuat terakhir karena diisi saat sheet ditulis
    files.push({ name: 'xl/styles.xml', data: this.styles.xml() });
    files.push({ name: 'xl/sharedStrings.xml', data: this.sharedStrings.xml() });

    return zip(files);
  }
}

module.exports = { Workbook, dateSerial, dateTimeSerial, colName, sheetRef, PALETTE, RED, GRAY, INK };
