// ============================================================
// LAPORAN EXCEL
// Menyusun file .xlsx berisi TIGA sheet, dengan urutan tetap:
//   1. "Data ..."      : daftar lengkap data bulan itu (nama, NIS, dan semua isian formulir)
//   2. "Ringkasan"     : kartu angka kunci + grafik berwarna (siap dipresentasikan)
//   3. "Data Analisis" : tabel angka dan persentase di balik setiap grafik
// Angka di sheet 3 memakai RUMUS yang membaca sheet 1, jadi kalau data di Excel diubah,
// tabel dan grafik ikut berubah. Nilai cadangan ikut ditulis supaya aplikasi pembaca
// yang tidak menghitung ulang (pratinjau ponsel) tetap menampilkan angka.
// ============================================================
const { Workbook, dateSerial, dateTimeSerial, colName, sheetRef, PALETTE, RED, GRAY } = require('../utils/xlsx');
const { getCategory } = require('../utils/bloodPressure');

const SCHOOL = 'UKS PMR WIRA SMK Negeri 1 Gombong';
const DATA_FIRST_ROW = 4; // baris 1 judul, 2 keterangan, 3 header kolom
const SUMMARY_SHEET = 'Ringkasan';
const ANALYSIS_SHEET = 'Data Analisis';

// Tata letak sheet Ringkasan: 12 kolom sama lebar. Kartu angka = 3 kolom, grafik = 6 kolom.
const GRID_COLS = 12;
const COL_WIDTH = 13;
const CHART_ROWS = 19;
const BAND_ROWS = CHART_ROWS + 2; // baris keterangan + grafik + jarak
const COL_EMU = Math.floor(7 * COL_WIDTH + 5) * 9525; // lebar satu kolom dalam EMU
const GAP_EMU = 60000; // jarak antar grafik kiri dan kanan

// Warna kartu angka dan pita judul tabel (cukup gelap agar tulisan putihnya jelas)
const CARD_COLORS = ['E11D2E', '1D6FEB', '12B76A', 'FF6A00', '8B3FD9', '00A3BF', 'D97706', 'E91E8C'];
const ACCENTS = ['E11D2E', '1D6FEB', '12B76A', '8B3FD9', 'FF6A00', '00A3BF', 'E91E8C', '0F766E'];

// ---------- Penghitung ----------

// Mengelompokkan tanpa membedakan huruf besar-kecil. Hasil: [{ label, count, sum }] terurut terbanyak.
function tally(rows, keyOf, weightOf = () => 1) {
  const map = new Map();
  rows.forEach((row) => {
    const raw = String(keyOf(row) ?? '').replace(/\s+/g, ' ').trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    if (!map.has(key)) map.set(key, { label: raw, count: 0, sum: 0 });
    const entry = map.get(key);
    entry.count += 1;
    entry.sum += Number(weightOf(row)) || 0;
  });
  return [...map.values()].sort((a, b) => b.sum - a.sum || b.count - a.count || a.label.localeCompare(b.label, 'id'));
}

const pad = (n) => String(n).padStart(2, '0');
const shortDate = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const longDate = (date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// "33,3%" (koma desimal, tanpa ",0" yang tidak perlu)
function pctText(value, total) {
  if (!total) return '0%';
  return `${String(Math.round((value / total) * 1000) / 10).replace('.', ',')}%`;
}

// Deret per hari untuk satu bulan penuh (hari tanpa data = 0). Untuk "seluruh data": per bulan.
function timeSeries(rows, dateOf, period) {
  const counts = new Map();
  rows.forEach((row) => {
    const iso = String(dateOf(row) || '').slice(0, 10);
    if (iso) counts.set(iso, (counts.get(iso) || 0) + 1);
  });

  if (period.from) {
    const [year, month] = period.from.split('-').map(Number);
    const days = new Date(year, month, 0).getDate();
    const items = [];
    for (let d = 1; d <= days; d += 1) {
      const iso = `${year}-${pad(month)}-${pad(d)}`;
      items.push({ iso, label: shortDate(iso), value: counts.get(iso) || 0 });
    }
    return { daily: true, items };
  }

  const months = new Map();
  counts.forEach((count, iso) => {
    const key = iso.slice(0, 7);
    months.set(key, (months.get(key) || 0) + count);
  });
  const items = [...months.keys()].sort().map((key) => {
    const [year, month] = key.split('-').map(Number);
    return {
      key,
      from: dateSerial(`${key}-01`),
      to: dateSerial(`${key}-${pad(new Date(year, month, 0).getDate())}`),
      label: `${BULAN_SINGKAT[month - 1]} ${year}`,
      value: months.get(key)
    };
  });
  return { daily: false, items };
}

const top = (list, n = 10) => list.slice(0, n);
const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// ---------- Analisis tambahan ----------

const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

const isoOf = (value) => String(value || '').slice(0, 10);

// Hari dalam seminggu (0 = Senin ... 6 = Minggu) dari tanggal "YYYY-MM-DD"
function weekdayIndex(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return (new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() + 6) % 7;
}

// Tingkat kelas dari awalan nama kelas: XII, XI, X. Aturan yang sama dipakai rumus Excel di bawah.
function gradeOf(kelas) {
  const k = String(kelas || '').trim().toUpperCase();
  if (k.startsWith('XII')) return 'Kelas XII';
  if (k.startsWith('XI')) return 'Kelas XI';
  if (k.startsWith('X')) return 'Kelas X';
  return 'Lainnya';
}

// "Naik 3 (33%)", "Turun 2 (20%)", "Sama" (dibanding bulan sebelumnya)
function compareText(count, previous) {
  if (!previous) return '-';
  if (count === previous.count) return count === 0 ? 'Sama (tidak ada data)' : `Sama (${count})`;
  const diff = count - previous.count;
  const percent = previous.count ? ` (${Math.round((Math.abs(diff) / previous.count) * 100)}%)` : '';
  return `${diff > 0 ? 'Naik' : 'Turun'} ${Math.abs(diff)}${percent}`;
}

// Kartu perbandingan dengan bulan sebelumnya
function compareCard(count, previous) {
  const diff = count - previous.count;
  if (diff === 0) return { label: 'Dibanding bulan lalu', value: 'Sama', note: `sama seperti ${previous.label} (${count})` };
  const note = previous.count
    ? `${pctText(Math.abs(diff), previous.count)} ${diff > 0 ? 'lebih banyak' : 'lebih sedikit'} dari ${previous.label}`
    : `${previous.label}: belum ada data`;
  return { label: 'Dibanding bulan lalu', value: `${diff > 0 ? 'Naik' : 'Turun'} ${Math.abs(diff)}`, note };
}

// Kartu angka yang sama untuk semua laporan bulanan
function commonKpis({ rows, dateOf, period, previous, noun }) {
  if (!period.from) return [];
  const series = timeSeries(rows, dateOf, period);
  const busiest = series.items.reduce((best, item) => (item.value > best.value ? item : best), { value: 0, label: '-' });
  const cards = [
    { label: 'Rata-rata per hari', value: Math.round((rows.length / period.days) * 10) / 10, note: `${noun} per hari` },
    { label: 'Hari tersibuk', value: busiest.value ? busiest.label : '-', note: busiest.value ? `${busiest.value} ${noun}` : 'belum ada data' }
  ];
  if (previous) cards.push(compareCard(rows.length, previous));
  return cards;
}

// Rumus hitung jumlah baris yang cocok (tanpa membedakan huruf besar-kecil)
const countIf = (rangeRef) => (row) => `SUMPRODUCT(--(${rangeRef}=A${row}))`;
const sumIf = (rangeRef, weightRef) => (row) => `SUMPRODUCT((${rangeRef}=A${row})*${weightRef})`;

// Peringkat (batang mendatar): setiap batang punya warna sendiri
function rankSection({ ctx, title, chartTitle, caption, header, list, labelKey, weightKey, valTitle }) {
  return {
    title,
    chartTitle,
    caption,
    kind: 'bar',
    header,
    valTitle,
    total: weightKey ? { value: list.reduce((n, x) => n + x.sum, 0), formula: `SUM(${ctx.range(weightKey)})` } : undefined,
    items: top(list).map((x) => ({
      label: x.label,
      value: weightKey ? x.sum : x.count,
      formula: weightKey ? sumIf(ctx.range(labelKey), ctx.range(weightKey)) : countIf(ctx.range(labelKey))
    }))
  };
}

// Diagram lingkaran: 6 teratas + "Lainnya" supaya persentasenya tetap utuh
// weightKey diisi bila nilainya berupa jumlah satuan (kolom jumlah), bukan banyaknya baris
function proportionSection({ title, chartTitle, caption, header, list, ctx, labelKey, weightKey }) {
  const top6 = list.slice(0, 6);
  const value = (x) => (weightKey ? x.sum : x.count);
  const restTotal = list.slice(6).reduce((n, x) => n + value(x), 0);
  const items = top6.map((x) => ({
    label: x.label,
    value: value(x),
    formula: weightKey ? sumIf(ctx.range(labelKey), ctx.range(weightKey)) : countIf(ctx.range(labelKey))
  }));
  if (restTotal > 0) {
    items.push({
      label: 'Lainnya',
      value: restTotal,
      formula: (row, first) => `${weightKey ? `SUM(${ctx.range(weightKey)})` : `COUNTA(${ctx.range(labelKey)})`}-SUM(B${first}:B${row - 1})`
    });
  }
  return {
    title,
    chartTitle,
    caption,
    header,
    kind: 'pie',
    pie: true,
    total: weightKey ? { value: list.reduce((n, x) => n + x.sum, 0), formula: `SUM(${ctx.range(weightKey)})` } : undefined,
    items
  };
}

// Deret waktu (per hari untuk laporan bulanan, per bulan untuk seluruh data)
function seriesSection(ctx, dateOf, { dateKey, dailyTitle, monthlyTitle, dailyChart, monthlyChart, noun, caption }) {
  const series = timeSeries(ctx.rows, dateOf, ctx.period);
  const dates = ctx.range(dateKey);
  return {
    title: series.daily ? dailyTitle : monthlyTitle,
    chartTitle: series.daily ? dailyChart : monthlyChart,
    caption,
    kind: series.daily ? 'line' : 'col',
    wide: true,
    rotateCats: true,
    everyLabel: true,
    color: PALETTE[1],
    header: [series.daily ? 'Tanggal' : 'Bulan', 'Jumlah'],
    valTitle: noun,
    catTitle: series.daily ? 'Tanggal' : 'Bulan',
    items: series.items.map((item) => ({
      label: item.label,
      value: item.value,
      formula: series.daily
        ? () => `COUNTIF(${dates},${dateSerial(item.iso)})`
        : () => `COUNTIFS(${dates},">="&${item.from},${dates},"<="&${item.to})`
    }))
  };
}

// Pencatatan menurut hari dalam seminggu (rumus WEEKDAY membaca sheet data)
function weekdaySection(ctx, dateKey, dateOf, noun, caption) {
  const counts = Array(7).fill(0);
  ctx.rows.forEach((row) => {
    const index = weekdayIndex(isoOf(dateOf(row)));
    if (index !== null) counts[index] += 1;
  });
  return {
    title: 'Berdasarkan hari dalam seminggu',
    chartTitle: `${cap(noun)} berdasarkan hari`,
    caption,
    kind: 'col',
    header: ['Hari', 'Jumlah'],
    valTitle: noun,
    items: HARI.map((hari, i) => ({
      label: hari,
      value: counts[i],
      formula: () => `SUMPRODUCT(--(WEEKDAY(${ctx.range(dateKey)},2)=${i + 1}))`
    }))
  };
}

// Pencatatan per minggu dalam satu bulan (tanggal 1-7, 8-14, ...). Hanya untuk laporan bulanan.
function weekSection(ctx, dateKey, dateOf, noun, caption) {
  if (!ctx.period.from) return null;
  const days = ctx.period.days;
  const weeks = [];
  for (let start = 1, n = 1; start <= days; start += 7, n += 1) {
    const end = Math.min(start + 6, days);
    weeks.push({ n, start, end });
  }
  const dayOf = (row) => Number(isoOf(dateOf(row)).slice(8, 10));
  const range = ctx.range(dateKey);
  return {
    title: 'Perkembangan per minggu',
    chartTitle: `${cap(noun)} per minggu`,
    caption,
    kind: 'col',
    header: ['Minggu', 'Jumlah'],
    valTitle: noun,
    items: weeks.map((w) => ({
      label: `Minggu ke-${w.n} (tgl ${w.start}-${w.end})`,
      value: ctx.rows.filter((row) => dayOf(row) >= w.start && dayOf(row) <= w.end).length,
      formula: () => `SUMPRODUCT((DAY(${range})>=${w.start})*(DAY(${range})<=${w.end}))`
    }))
  };
}

// Perbandingan kelas X, XI, dan XII (rumus COUNTIF dengan awalan nama kelas)
function gradeSection(ctx, { kelasKey = 'kelas', noun, caption }) {
  const range = ctx.range(kelasKey);
  const counts = { 'Kelas X': 0, 'Kelas XI': 0, 'Kelas XII': 0, Lainnya: 0 };
  ctx.rows.forEach((row) => {
    counts[gradeOf(row.kelas)] += 1;
  });
  const items = [
    { label: 'Kelas X', value: counts['Kelas X'], formula: () => `COUNTIF(${range},"X*")-COUNTIF(${range},"XI*")`, color: PALETTE[1] },
    { label: 'Kelas XI', value: counts['Kelas XI'], formula: () => `COUNTIF(${range},"XI*")-COUNTIF(${range},"XII*")`, color: PALETTE[3] },
    { label: 'Kelas XII', value: counts['Kelas XII'], formula: () => `COUNTIF(${range},"XII*")`, color: PALETTE[5] }
  ];
  if (counts.Lainnya > 0) {
    items.push({
      label: 'Lainnya',
      value: counts.Lainnya,
      formula: (row, first) => `COUNTA(${range})-SUM(B${first}:B${row - 1})`,
      color: GRAY
    });
  }
  return {
    title: 'Berdasarkan tingkat kelas',
    chartTitle: `${cap(noun)} menurut tingkat kelas`,
    caption,
    kind: 'col',
    header: ['Tingkat kelas', 'Jumlah'],
    valTitle: noun,
    items
  };
}

// ---------- Perakit workbook ----------

function build({ title, sheetName, noun, period, previous = null, user, columns, rows, dateOf, kpis, sections }) {
  const wb = new Workbook();
  const data = wb.addSheet(sheetName, { tab: RED });
  const summary = wb.addSheet(SUMMARY_SHEET, { tab: PALETTE[1] });
  const analysis = wb.addSheet(ANALYSIS_SHEET, { tab: PALETTE[3] });

  const last = DATA_FIRST_ROW + Math.max(rows.length, 1) - 1;
  const letter = (key) => colName(columns.findIndex((c) => c.key === key) + 1);
  const range = (key) => `${sheetRef(sheetName)}!$${letter(key)}$${DATA_FIRST_ROW}:$${letter(key)}$${last}`;
  const printed = longDate(new Date());
  const heading = period.from ? `${title} Bulan ${period.monthName} ${period.year}` : `${title} (Seluruh Data)`;
  const subtitle = `Periode: ${period.label}   |   Dicetak: ${printed}${user ? `   |   Oleh: ${user.nama}` : ''}`;
  const live = rows.length > 0; // rumus hanya dipakai bila ada baris data yang dibaca

  // ===== Sheet 1: daftar data (semua isian formulir) =====
  data.set(1, 1, `${heading} - ${SCHOOL}`, 'title').height(1, 26);
  data.set(2, 1, `${subtitle}   |   ${rows.length} baris`, 'sub');
  data.row(3, columns.map((c) => c.header), 'header').height(3, 30);
  data.cols(columns.map((c) => c.width));
  rows.forEach((row, i) => {
    const alt = i % 2 ? 'Alt' : '';
    columns.forEach((c, k) => {
      const value = c.value(row, i, DATA_FIRST_ROW + i);
      data.set(DATA_FIRST_ROW + i, k + 1, value, `${c.style || 'text'}${alt}`);
    });
  });
  if (rows.length === 0) data.set(DATA_FIRST_ROW, 1, 'Belum ada data pada periode ini.', 'sub');
  data.autoFilter(`A3:${colName(columns.length)}${Math.max(last, 3)}`).freeze(3);

  // ===== Bahan untuk sheet 2 dan 3 =====
  const ctx = {
    rows,
    range,
    last,
    letter,
    period,
    total: { value: rows.length, formula: `COUNTA(${range('nama')})` }
  };
  const tables = sections(ctx).filter((s) => s && s.items.length > 0);

  // ===== Sheet 3: tabel angka di balik setiap grafik =====
  analysis.cols([42, 14, 16, 38]);
  analysis.set(1, 1, `Data Analisis - ${heading}`, 'title').height(1, 26);
  analysis.set(2, 1, `Angka di bawah dihitung otomatis dari sheet "${sheetName}". Grafik di sheet "${SUMMARY_SHEET}" membaca angka dari sini, jadi ikut berubah bila data diubah.`, 'sub');

  let ar = 4;
  tables.forEach((table, index) => {
    const accent = ACCENTS[index % ACCENTS.length];
    const total = table.total || ctx.total;
    const totalFormula = total.formula;
    const first = ar + 2;
    const lastRow = first + table.items.length - 1;

    analysis.block(ar, 1, ar, 4, `Tabel ${index + 1}.  ${table.title}`, { font: { size: 11, bold: true, color: 'FFFFFF' }, fill: accent, v: 'center', indent: 1 });
    analysis.height(ar, 22);
    analysis.row(ar + 1, [table.header[0], table.header[1], 'Persentase', table.pie ? 'Label grafik' : ''], 'header').height(ar + 1, 22);

    table.catValues = [];
    table.items.forEach((item, i) => {
      const row = first + i;
      const alt = i % 2 ? 'Alt' : '';
      const share = total.value ? item.value / total.value : 0;
      analysis.set(row, 1, item.label, `text${alt}`);
      analysis.set(row, 2, item.formula && live ? { f: item.formula(row, first), v: item.value } : item.value, `center${alt}`);
      analysis.set(row, 3, live ? { f: `IF(${totalFormula}=0,0,B${row}/${totalFormula})`, v: share } : 0, `percent${alt}`);

      if (table.pie) {
        const labelText = `${item.label} (${item.value})`;
        analysis.set(row, 4, live ? { f: `A${row}&" ("&B${row}&")"`, v: labelText } : labelText, `muted${alt}`);
        table.catValues.push(labelText);
      } else {
        table.catValues.push(item.label);
      }
    });

    if (live) analysis.dataBar(`B${first}:B${lastRow}`, accent);
    table.place = { first, last: lastRow, catCol: table.pie ? 4 : 1, accent };
    ar = lastRow + 3;
  });

  // ===== Sheet 2: ringkasan (kartu angka + grafik) =====
  summary.cols(Array(GRID_COLS).fill(COL_WIDTH));
  summary.block(1, 1, 1, GRID_COLS, heading, 'title').height(1, 28);
  summary.block(2, 1, 2, GRID_COLS, `${SCHOOL}   |   ${subtitle}`, 'sub');

  const cards = [...kpis(ctx), ...commonKpis({ rows, dateOf, period, previous, noun })];
  const cardStyle = (color, part) => ({
    fill: color,
    border: { style: 'thick', color: 'FFFFFF', sides: 'lr' },
    h: 'center',
    v: 'center',
    wrap: true,
    font: part.font
  });
  const valueSize = (value) => {
    const len = String(value).length;
    return len <= 12 ? 22 : len <= 20 ? 15 : 11;
  };

  let r = 4;
  for (let i = 0; i < cards.length; i += 4) {
    cards.slice(i, i + 4).forEach((card, k) => {
      const color = CARD_COLORS[(i + k) % CARD_COLORS.length];
      const c1 = k * 3 + 1;
      const c2 = c1 + 2;
      const value = card.formula && live ? { f: card.formula, v: card.value } : card.value;
      summary.block(r, c1, r, c2, card.label.toUpperCase(), cardStyle(color, { font: { size: 9, bold: true, color: 'FFFFFF' } }));
      summary.block(r + 1, c1, r + 1, c2, value, cardStyle(color, { font: { size: valueSize(card.value), bold: true, color: 'FFFFFF' } }));
      summary.block(r + 2, c1, r + 2, c2, card.note || '', cardStyle(color, { font: { size: 9, color: 'FFFFFF' } }));
    });
    summary.height(r, 20).height(r + 1, 38).height(r + 2, 22).height(r + 3, 8);
    r += 4;
  }

  summary.block(r, 1, r, GRID_COLS, 'GRAFIK ANALISIS', 'bar').height(r, 26);
  summary.block(
    r + 1,
    1,
    r + 1,
    GRID_COLS,
    `Cara membaca: angka dan persentase tertulis langsung pada grafik. Tabel lengkapnya ada di sheet "${ANALYSIS_SHEET}". Grafik ikut berubah bila data di sheet "${sheetName}" diubah.`,
    'note'
  );
  summary.height(r + 1, 30);
  r += 3;

  if (!live) {
    summary.block(r, 1, r, GRID_COLS, 'Belum ada data pada periode ini, jadi grafik belum dapat dibuat.', 'note');
    return wb.toBuffer();
  }

  // Grafik disusun dua per baris (grafik lebar memakai satu baris penuh)
  const place = (table, number, captionRow, c1, c2) => {
    const { first, last: lastRow, catCol, accent } = table.place;
    summary.height(captionRow, 36);
    if (c1 === 1) summary.pageBreak(captionRow - 1); // grafik tidak terpotong saat dicetak
    summary.block(captionRow, c1, captionRow, c2, `Grafik ${number}  |  ${table.caption}`, {
      font: { size: 10, color: '1D2331' },
      fill: 'F3F4F6',
      border: { style: 'thick', color: accent, sides: 'l' },
      v: 'center',
      wrap: true,
      indent: 1
    });

    const full = c1 === 1 && c2 === GRID_COLS;
    const left = c1 === 1 && !full;
    const colors = table.items.map((item, i) => item.color || (item.label === 'Lainnya' ? GRAY : PALETTE[i % PALETTE.length]));
    summary.addChart({
      type: table.kind,
      title: table.chartTitle,
      seriesName: table.header[1],
      valTitle: table.valTitle,
      catTitle: table.catTitle,
      color: table.color,
      colors,
      rotateCats: table.rotateCats,
      everyLabel: table.everyLabel,
      cats: { sheet: ANALYSIS_SHEET, col: catCol, fromRow: first, toRow: lastRow, values: table.catValues },
      vals: { sheet: ANALYSIS_SHEET, col: 2, fromRow: first, toRow: lastRow, values: table.items.map((x) => x.value) },
      from: { col: c1 - 1, row: captionRow, colOff: full || left ? 0 : GAP_EMU },
      to: { col: left ? c2 - 1 : c2, row: captionRow + CHART_ROWS, colOff: left ? COL_EMU - GAP_EMU : 0 }
    });
  };

  let bandRow = r;
  let side = 0; // 0: grafik berikutnya di kiri, 1: di kanan
  tables.forEach((table, index) => {
    const number = index + 1;
    if (table.wide) {
      if (side === 1) {
        r = bandRow + BAND_ROWS;
        side = 0;
      }
      bandRow = r;
      place(table, number, bandRow, 1, GRID_COLS);
      r = bandRow + BAND_ROWS;
      bandRow = r;
      return;
    }
    if (side === 0) {
      bandRow = r;
      place(table, number, bandRow, 1, GRID_COLS / 2);
      side = 1;
    } else {
      place(table, number, bandRow, GRID_COLS / 2 + 1, GRID_COLS);
      r = bandRow + BAND_ROWS;
      side = 0;
    }
  });

  return wb.toBuffer();
}

// ---------- Laporan per jenis ----------

function pasien({ rows, period, previous, user }) {
  const dateOf = (r) => r.tanggal_sakit;
  const noun = 'siswa sakit';
  return build({
    title: 'Rekapitulasi Data Siswa Sakit',
    sheetName: 'Data Siswa Sakit',
    noun,
    period,
    previous,
    user,
    rows,
    dateOf,
    columns: [
      { key: 'no', header: 'No', width: 6, style: 'center', value: (_, i) => i + 1 },
      { key: 'tanggal', header: 'Tanggal sakit', width: 15, style: 'date', value: (r) => dateSerial(r.tanggal_sakit) },
      { key: 'nama', header: 'Nama pasien', width: 30, value: (r) => r.nama_pasien },
      { key: 'nis', header: 'NIS', width: 10, style: 'center', value: (r) => r.nis },
      { key: 'kelas', header: 'Kelas', width: 16, style: 'center', value: (r) => r.kelas },
      { key: 'keluhan', header: 'Sakit / keluhan', width: 42, style: 'wrap', value: (r) => r.keluhan },
      { key: 'dicatat', header: 'Dicatat pada', width: 18, style: 'datetime', value: (r) => dateTimeSerial(r.created_at) }
    ],
    kpis: ({ rows: list, range }) => {
      const kelas = tally(list, (r) => r.kelas);
      const keluhan = tally(list, (r) => r.keluhan);
      const grade = tally(list, (r) => gradeOf(r.kelas));
      const n = list.length;
      const share = (x) => (x ? `${x.count} siswa  •  ${pctText(x.count, n)}` : 'belum ada data');
      return [
        { label: 'Total siswa sakit', value: n, note: 'catatan pada periode ini', formula: `COUNTA(${range('nama')})` },
        { label: 'Siswa yang berbeda', value: new Set(list.map((r) => r.nis)).size, note: 'siswa yang berobat ke UKS' },
        { label: 'Jenis sakit terbanyak', value: keluhan[0] ? keluhan[0].label : '-', note: share(keluhan[0]) },
        { label: 'Kelas paling banyak sakit', value: kelas[0] ? kelas[0].label : '-', note: share(kelas[0]) },
        { label: 'Tingkat kelas terbanyak', value: grade[0] ? grade[0].label : '-', note: share(grade[0]) }
      ];
    },
    sections: (ctx) => {
      const kelas = tally(ctx.rows, (r) => r.kelas);
      const keluhan = tally(ctx.rows, (r) => r.keluhan);

      // Siswa yang berobat lebih dari sekali (dikelompokkan menurut NIS)
      const byNis = new Map();
      ctx.rows.forEach((r) => {
        const entry = byNis.get(r.nis) || { label: `${r.nama_pasien} (${r.nis})`, count: 0, sum: 0 };
        entry.count += 1;
        byNis.set(r.nis, entry);
      });
      const repeat = [...byNis.values()].filter((x) => x.count > 1).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'id'));

      return [
        seriesSection(ctx, dateOf, {
          dateKey: 'tanggal',
          dailyTitle: 'Siswa sakit per hari',
          monthlyTitle: 'Siswa sakit per bulan',
          dailyChart: 'Jumlah siswa sakit per hari',
          monthlyChart: 'Jumlah siswa sakit per bulan',
          noun: 'Jumlah siswa',
          caption: 'Titik yang tinggi berarti banyak siswa sakit pada hari itu. Angka di atas titik = jumlah siswa sakit.'
        }),
        proportionSection({
          title: 'Proporsi jenis sakit',
          chartTitle: 'Proporsi jenis sakit',
          caption: 'Persentase tiap jenis sakit tertulis di lingkaran. Makin besar potongannya, makin sering sakit itu terjadi.',
          header: ['Sakit / keluhan', 'Jumlah'],
          list: keluhan,
          ctx,
          labelKey: 'keluhan',
        }),
        rankSection({
          ctx,
          title: 'Jenis sakit / keluhan terbanyak (10 teratas)',
          chartTitle: 'Jenis sakit / keluhan terbanyak',
          caption: 'Batang terpanjang = sakit yang paling banyak dialami siswa. Angka di ujung batang = jumlah siswa.',
          header: ['Sakit / keluhan', 'Jumlah'],
          list: keluhan,
          labelKey: 'keluhan',
          valTitle: 'Jumlah siswa'
        }),
        rankSection({
          ctx,
          title: 'Kelas yang paling banyak sakit (10 teratas)',
          chartTitle: 'Siswa sakit berdasarkan kelas',
          caption: 'Batang terpanjang = kelas dengan siswa sakit paling banyak. Cocok untuk melihat kelas yang perlu diperhatikan.',
          header: ['Kelas', 'Jumlah'],
          list: kelas,
          labelKey: 'kelas',
          valTitle: 'Jumlah siswa'
        }),
        gradeSection(ctx, { noun, caption: 'Perbandingan jumlah siswa sakit antara kelas X, XI, dan XII.' }),
        weekdaySection(ctx, 'tanggal', dateOf, 'Jumlah siswa', 'Menunjukkan hari apa siswa paling sering sakit dan berobat ke UKS.'),
        weekSection(ctx, 'tanggal', dateOf, 'Jumlah siswa', 'Melihat apakah jumlah siswa sakit naik atau turun dari minggu ke minggu.'),
        repeat.length
          ? {
              title: 'Siswa yang paling sering berobat (10 teratas)',
              chartTitle: 'Siswa yang berobat lebih dari satu kali',
              caption: 'Siswa yang berkali-kali sakit dalam periode ini. Mereka mungkin perlu perhatian lebih dari petugas UKS.',
              kind: 'bar',
              header: ['Siswa (NIS)', 'Jumlah'],
              valTitle: 'Berapa kali sakit',
              items: top(repeat).map((x) => ({ label: x.label, value: x.count }))
            }
          : null
      ];
    }
  });
}

function obat({ rows, period, previous, user }) {
  const dateOf = (r) => r.tanggal;
  const noun = 'pencatatan';
  return build({
    title: 'Rekapitulasi Data Obat Keluar',
    sheetName: 'Data Obat Keluar',
    noun,
    period,
    previous,
    user,
    rows,
    dateOf,
    columns: [
      { key: 'no', header: 'No', width: 6, style: 'center', value: (_, i) => i + 1 },
      { key: 'tanggal', header: 'Tanggal', width: 14, style: 'date', value: (r) => dateSerial(r.tanggal) },
      { key: 'nama', header: 'Nama', width: 28, value: (r) => r.nama },
      { key: 'kelas', header: 'Kelas', width: 16, style: 'center', value: (r) => r.kelas },
      { key: 'obat', header: 'Obat', width: 26, value: (r) => r.obat },
      { key: 'jumlah', header: 'Jumlah', width: 10, style: 'center', value: (r) => Number(r.jumlah) || 1 },
      { key: 'keterangan', header: 'Keterangan', width: 38, style: 'wrap', value: (r) => r.keterangan || '' },
      { key: 'dicatat', header: 'Dicatat pada', width: 18, style: 'datetime', value: (r) => dateTimeSerial(r.created_at) }
    ],
    kpis: ({ rows: list, range }) => {
      const obatList = tally(list, (r) => r.obat, (r) => r.jumlah);
      const kelas = tally(list, (r) => r.kelas);
      const grade = tally(list, (r) => gradeOf(r.kelas));
      const n = list.length;
      const totalQty = list.reduce((sum, r) => sum + (Number(r.jumlah) || 0), 0);
      return [
        { label: 'Total pencatatan obat', value: n, note: 'kali obat diberikan', formula: `COUNTA(${range('obat')})` },
        { label: 'Total jumlah obat keluar', value: totalQty, note: 'satuan obat', formula: `SUM(${range('jumlah')})` },
        { label: 'Obat paling banyak keluar', value: obatList[0] ? obatList[0].label : '-', note: obatList[0] ? `${obatList[0].sum} satuan  •  ${pctText(obatList[0].sum, totalQty)}` : 'belum ada data' },
        { label: 'Kelas penerima terbanyak', value: kelas[0] ? kelas[0].label : '-', note: kelas[0] ? `${kelas[0].count} kali  •  ${pctText(kelas[0].count, n)}` : 'belum ada data' },
        { label: 'Tingkat kelas terbanyak', value: grade[0] ? grade[0].label : '-', note: grade[0] ? `${grade[0].count} kali  •  ${pctText(grade[0].count, n)}` : 'belum ada data' }
      ];
    },
    sections: (ctx) => {
      const obatList = tally(ctx.rows, (r) => r.obat, (r) => r.jumlah);
      const kelas = tally(ctx.rows, (r) => r.kelas);
      return [
        seriesSection(ctx, dateOf, {
          dateKey: 'tanggal',
          dailyTitle: 'Pencatatan obat keluar per hari',
          monthlyTitle: 'Pencatatan obat keluar per bulan',
          dailyChart: 'Obat keluar per hari (jumlah pencatatan)',
          monthlyChart: 'Obat keluar per bulan (jumlah pencatatan)',
          noun: 'Pencatatan',
          caption: 'Titik yang tinggi berarti banyak obat diberikan pada hari itu. Angka di atas titik = jumlah pencatatan.'
        }),
        proportionSection({
          title: 'Proporsi obat yang keluar',
          chartTitle: 'Proporsi obat yang keluar',
          caption: 'Persentase tiap jenis obat (dihitung dari jumlah satuan) tertulis di lingkaran.',
          header: ['Obat', 'Jumlah keluar'],
          list: obatList,
          ctx,
          labelKey: 'obat',
          weightKey: 'jumlah',
        }),
        rankSection({
          ctx,
          title: 'Obat yang paling banyak keluar (10 teratas)',
          chartTitle: 'Obat paling banyak keluar (jumlah satuan)',
          caption: 'Batang terpanjang = obat yang paling banyak dipakai. Berguna untuk merencanakan stok obat.',
          header: ['Obat', 'Jumlah keluar'],
          list: obatList,
          labelKey: 'obat',
          weightKey: 'jumlah',
          valTitle: 'Jumlah satuan'
        }),
        rankSection({
          ctx,
          title: 'Kelas penerima obat terbanyak (10 teratas)',
          chartTitle: 'Obat keluar berdasarkan kelas',
          caption: 'Batang terpanjang = kelas yang paling sering menerima obat dari UKS.',
          header: ['Kelas', 'Jumlah'],
          list: kelas,
          labelKey: 'kelas',
          valTitle: 'Pencatatan'
        }),
        gradeSection(ctx, { noun, caption: 'Perbandingan pencatatan obat keluar antara kelas X, XI, dan XII.' }),
        weekdaySection(ctx, 'tanggal', dateOf, 'Pencatatan', 'Menunjukkan hari apa obat paling sering diberikan.'),
        weekSection(ctx, 'tanggal', dateOf, 'Pencatatan', 'Melihat apakah pemberian obat naik atau turun dari minggu ke minggu.')
      ];
    }
  });
}

function peminjaman({ rows, period, previous, user }) {
  const dateOf = (r) => r.tanggal_pinjam;
  const noun = 'peminjaman';
  const dipinjam = (list) => list.filter((r) => !r.tanggal_kembali).length;
  return build({
    title: 'Rekapitulasi Data Peminjaman Barang',
    sheetName: 'Data Peminjaman',
    noun,
    period,
    previous,
    user,
    rows,
    dateOf,
    columns: [
      { key: 'no', header: 'No', width: 6, style: 'center', value: (_, i) => i + 1 },
      { key: 'pinjam', header: 'Tanggal pinjam', width: 15, style: 'date', value: (r) => dateSerial(r.tanggal_pinjam) },
      { key: 'nama', header: 'Nama peminjam', width: 28, value: (r) => r.nama },
      { key: 'kelas', header: 'Kelas / organisasi', width: 22, style: 'center', value: (r) => r.kelas },
      { key: 'barang', header: 'Jenis barang', width: 26, value: (r) => r.jenis_barang },
      { key: 'kembali', header: 'Tanggal kembali', width: 15, style: 'date', value: (r) => (r.tanggal_kembali ? dateSerial(r.tanggal_kembali) : '') },
      {
        key: 'status',
        header: 'Status',
        width: 14,
        style: 'center',
        value: (r, _i, row) => ({
          f: `IF(F${row}="","Dipinjam","Dikembalikan")`,
          v: r.tanggal_kembali ? 'Dikembalikan' : 'Dipinjam'
        })
      },
      { key: 'keterangan', header: 'Keterangan', width: 34, style: 'wrap', value: (r) => r.keterangan || '' },
      { key: 'dicatat', header: 'Dicatat pada', width: 18, style: 'datetime', value: (r) => dateTimeSerial(r.created_at) }
    ],
    kpis: ({ rows: list, range }) => {
      const barang = tally(list, (r) => r.jenis_barang);
      const n = list.length;
      return [
        { label: 'Total peminjaman', value: n, note: 'kali barang dipinjam', formula: `COUNTA(${range('barang')})` },
        { label: 'Masih dipinjam', value: dipinjam(list), note: 'belum dikembalikan', formula: `COUNTBLANK(${range('kembali')})` },
        { label: 'Sudah dikembalikan', value: n - dipinjam(list), note: 'sudah kembali ke UKS', formula: `COUNTA(${range('barang')})-COUNTBLANK(${range('kembali')})` },
        { label: 'Barang paling sering dipinjam', value: barang[0] ? barang[0].label : '-', note: barang[0] ? `${barang[0].count} kali  •  ${pctText(barang[0].count, n)}` : 'belum ada data' }
      ];
    },
    sections: (ctx) => {
      const barang = tally(ctx.rows, (r) => r.jenis_barang);
      const peminjam = tally(ctx.rows, (r) => r.kelas);
      const out = ctx.rows.length - dipinjam(ctx.rows);
      return [
        seriesSection(ctx, dateOf, {
          dateKey: 'pinjam',
          dailyTitle: 'Peminjaman per hari',
          monthlyTitle: 'Peminjaman per bulan',
          dailyChart: 'Jumlah peminjaman per hari',
          monthlyChart: 'Jumlah peminjaman per bulan',
          noun: 'Peminjaman',
          caption: 'Titik yang tinggi berarti banyak barang dipinjam pada hari itu. Angka di atas titik = jumlah peminjaman.'
        }),
        {
          title: 'Status peminjaman',
          chartTitle: 'Status peminjaman',
          caption: 'Berapa persen barang yang sudah kembali dan yang masih dipinjam. Merah = masih dipinjam.',
          kind: 'pie',
          pie: true,
          header: ['Status', 'Jumlah'],
          items: [
            { label: 'Dipinjam', value: dipinjam(ctx.rows), color: PALETTE[0], formula: () => `COUNTBLANK(${ctx.range('kembali')})` },
            { label: 'Dikembalikan', value: out, color: PALETTE[3], formula: () => `COUNTA(${ctx.range('barang')})-COUNTBLANK(${ctx.range('kembali')})` }
          ].filter((x) => x.value > 0)
        },
        rankSection({
          ctx,
          title: 'Barang yang paling sering dipinjam (10 teratas)',
          chartTitle: 'Barang yang paling sering dipinjam',
          caption: 'Batang terpanjang = barang yang paling sering dipinjam dari UKS.',
          header: ['Jenis barang', 'Jumlah'],
          list: barang,
          labelKey: 'barang',
          valTitle: 'Peminjaman'
        }),
        rankSection({
          ctx,
          title: 'Peminjam terbanyak menurut kelas / organisasi (10 teratas)',
          chartTitle: 'Peminjaman berdasarkan kelas / organisasi',
          caption: 'Batang terpanjang = kelas atau organisasi yang paling sering meminjam.',
          header: ['Kelas / organisasi', 'Jumlah'],
          list: peminjam,
          labelKey: 'kelas',
          valTitle: 'Peminjaman'
        }),
        weekdaySection(ctx, 'pinjam', dateOf, 'Peminjaman', 'Menunjukkan hari apa barang paling sering dipinjam.'),
        weekSection(ctx, 'pinjam', dateOf, 'Peminjaman', 'Melihat apakah peminjaman naik atau turun dari minggu ke minggu.')
      ];
    }
  });
}

// Warna kategori tekanan darah: biru (rendah), hijau (normal), lalu kuning, jingga, merah, merah tua
const CATEGORY_COLORS = {
  hipotensi: PALETTE[1],
  normal: PALETTE[3],
  prehipertensi: PALETTE[2],
  hipertensi1: PALETTE[5],
  hipertensi2: PALETTE[0],
  krisis: '7F1D1D'
};

function tekananDarah({ rows, period, previous, user }) {
  const dateOf = (r) => r.tanggal;
  const noun = 'pengukuran';
  const kategoriNama = (kode) => (getCategory(kode) ? getCategory(kode).nama : kode);
  return build({
    title: 'Rekapitulasi Data Pemeriksaan Tekanan Darah',
    sheetName: 'Data Tekanan Darah',
    noun,
    period,
    previous,
    user,
    rows,
    dateOf,
    columns: [
      { key: 'no', header: 'No', width: 6, style: 'center', value: (_, i) => i + 1 },
      { key: 'tanggal', header: 'Tanggal', width: 14, style: 'date', value: (r) => dateSerial(r.tanggal) },
      { key: 'nama', header: 'Nama siswa', width: 28, value: (r) => r.nama_siswa },
      { key: 'nis', header: 'NIS', width: 10, style: 'center', value: (r) => r.nis },
      { key: 'kelas', header: 'Kelas', width: 16, style: 'center', value: (r) => r.kelas },
      { key: 'ke', header: 'Pengukuran ke-', width: 14, style: 'center', value: (r) => r.pengukuran_ke },
      { key: 'sis', header: 'Sistolik', width: 11, style: 'center', value: (r) => r.sistolik },
      { key: 'dia', header: 'Diastolik', width: 11, style: 'center', value: (r) => r.diastolik },
      { key: 'kategori', header: 'Kategori', width: 34, value: (r) => kategoriNama(r.kategori) }
    ],
    kpis: ({ rows: list, range }) => {
      const kategori = tally(list, (r) => kategoriNama(r.kategori));
      const grade = tally(list, (r) => gradeOf(r.kelas));
      const n = list.length;
      const abnormal = list.filter((r) => r.kategori !== 'normal').length;
      return [
        { label: 'Total pengukuran', value: n, note: 'kali tekanan darah diukur', formula: `COUNTA(${range('nama')})` },
        { label: 'Siswa terukur', value: new Set(list.map((r) => r.nis)).size, note: 'siswa yang diperiksa' },
        { label: 'Di luar kategori normal', value: abnormal, note: `${pctText(abnormal, n)} dari seluruh pengukuran` },
        { label: 'Kategori paling banyak', value: kategori[0] ? kategori[0].label : '-', note: kategori[0] ? `${kategori[0].count} pengukuran  •  ${pctText(kategori[0].count, n)}` : 'belum ada data' },
        { label: 'Tingkat kelas terbanyak', value: grade[0] ? grade[0].label : '-', note: grade[0] ? `${grade[0].count} pengukuran  •  ${pctText(grade[0].count, n)}` : 'belum ada data' }
      ];
    },
    sections: (ctx) => {
      const kategori = tally(ctx.rows, (r) => kategoriNama(r.kategori));
      const abnormal = tally(ctx.rows.filter((r) => r.kategori !== 'normal'), (r) => r.kelas);
      const colorOf = {};
      ctx.rows.forEach((r) => {
        colorOf[kategoriNama(r.kategori)] = CATEGORY_COLORS[r.kategori];
      });
      const normalName = kategoriNama('normal');
      return [
        {
          title: 'Jumlah pengukuran menurut kategori',
          chartTitle: 'Sebaran kategori tekanan darah',
          caption: 'Persentase tiap kategori tertulis di lingkaran. Hijau = normal; makin ke merah makin tinggi tekanan darahnya.',
          kind: 'pie',
          pie: true,
          header: ['Kategori', 'Jumlah'],
          items: kategori.map((x) => ({ label: x.label, value: x.count, color: colorOf[x.label], formula: countIf(ctx.range('kategori')) }))
        },
        {
          title: 'Kelas dengan hasil di luar normal terbanyak (10 teratas)',
          chartTitle: 'Hasil di luar normal berdasarkan kelas',
          caption: 'Batang terpanjang = kelas dengan paling banyak hasil di luar normal. Ini hasil skrining, bukan diagnosis.',
          kind: 'bar',
          header: ['Kelas', 'Jumlah'],
          valTitle: 'Pengukuran',
          items: top(abnormal).map((x) => ({
            label: x.label,
            value: x.count,
            formula: (row) => `COUNTIFS(${ctx.range('kelas')},A${row},${ctx.range('kategori')},"<>${normalName}")`
          }))
        },
        seriesSection(ctx, dateOf, {
          dateKey: 'tanggal',
          dailyTitle: 'Pengukuran per hari',
          monthlyTitle: 'Pengukuran per bulan',
          dailyChart: 'Jumlah pengukuran per hari',
          monthlyChart: 'Jumlah pengukuran per bulan',
          noun: 'Pengukuran',
          caption: 'Titik yang tinggi berarti banyak pengukuran pada hari itu. Angka di atas titik = jumlah pengukuran.'
        }),
        gradeSection(ctx, { noun, caption: 'Perbandingan jumlah pengukuran antara kelas X, XI, dan XII.' }),
        weekdaySection(ctx, 'tanggal', dateOf, 'Pengukuran', 'Menunjukkan hari apa tekanan darah paling sering diukur.'),
        weekSection(ctx, 'tanggal', dateOf, 'Pengukuran', 'Melihat apakah jumlah pengukuran naik atau turun dari minggu ke minggu.')
      ];
    }
  });
}

module.exports = { pasien, obat, peminjaman, tekananDarah, tally, timeSeries, compareText, gradeOf, SCHOOL };
