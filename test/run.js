// ============================================================
// UJI OTOMATIS TANPA DATABASE    ->   npm test
// Memeriksa logika murni: klasifikasi tekanan darah, validasi input, periode laporan,
// pemeriksa gambar, dan pembuat file Excel. Tidak butuh MySQL maupun server menyala.
// ============================================================
const assert = require('assert');
const path = require('path');
const zlib = require('zlib');

const src = (p) => require(path.join(__dirname, '..', 'src', p));
const { classifyCode } = src('utils/bloodPressure');
const { clean, normalizeKelas, sentenceCase, isValidDate } = src('utils/text');
const { resolvePeriod, previousPeriod } = src('utils/period');
const { decodeDataUrl } = src('utils/imageStore');
const exportService = src('services/exportService');
const validateAuth = src('middlewares/validateAuth');
const validators = src('middlewares/validators');
const fitur = src('middlewares/validateFitur');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    console.log(`GAGAL  ${name}\n       ${err.message}`);
  }
}

// Menjalankan sebuah middleware validasi dengan req/res palsu
function run(middleware, body, params = {}) {
  const req = { body, params };
  const out = { status: null, json: null, next: false };
  const res = {
    status(code) {
      out.status = code;
      return res;
    },
    json(data) {
      out.json = data;
    }
  };
  middleware(req, res, () => {
    out.next = true;
  });
  return { ...out, body: req.body };
}

// ---------- Tekanan darah ----------
test('klasifikasi tekanan darah', () => {
  const cases = [
    [85, 55, 'hipotensi'], [100, 55, 'hipotensi'], [110, 70, 'normal'], [119, 79, 'normal'],
    [125, 75, 'prehipertensi'], [128, 79, 'prehipertensi'], [135, 85, 'hipertensi1'], [125, 85, 'hipertensi1'],
    [145, 95, 'hipertensi2'], [130, 95, 'hipertensi2'], [150, 55, 'hipertensi2'], [185, 110, 'krisis'], [170, 125, 'krisis']
  ];
  cases.forEach(([s, d, expected]) => assert.strictEqual(classifyCode(s, d), expected, `${s}/${d}`));
});

// ---------- Teks dan tanggal ----------
test('normalisasi teks', () => {
  assert.strictEqual(clean('  a   b '), 'a b');
  assert.strictEqual(normalizeKelas('xii  tkj a'), 'XII TKJ A');
  assert.strictEqual(sentenceCase('pusing sejak pagi'), 'Pusing sejak pagi');
});

test('validasi tanggal', () => {
  assert.ok(isValidDate('2026-10-28'));
  assert.ok(!isValidDate('2026-02-31'));
  assert.ok(!isValidDate('28-10-2026'));
  assert.ok(!isValidDate(''));
});

test('periode laporan', () => {
  assert.deepStrictEqual(
    (({ from, to, label }) => ({ from, to, label }))(resolvePeriod({ bulan: '2026-02' })),
    { from: '2026-02-01', to: '2026-02-28', label: 'Februari 2026' }
  );
  assert.strictEqual(resolvePeriod({ semua: '1' }).from, null);
  assert.strictEqual(resolvePeriod({ bulan: 'ngawur' }, new Date(2026, 9, 5)).from, '2026-10-01');
});

test('nama file rekap otomatis dan perbandingan bulan lalu', () => {
  const p = resolvePeriod({ bulan: '2026-11' });
  assert.strictEqual(`Rekap Data Siswa Sakit ${p.filePart}.xlsx`, 'Rekap Data Siswa Sakit Bulan November 2026.xlsx');
  assert.strictEqual(previousPeriod(p).label, 'Oktober 2026');
  assert.strictEqual(previousPeriod(resolvePeriod({ bulan: '2026-01' })).label, 'Desember 2025');
  assert.strictEqual(previousPeriod(resolvePeriod({ semua: '1' })), null);
  assert.strictEqual(exportService.compareText(12, { label: 'Oktober 2026', count: 9 }), 'Naik 3 (33%)');
  assert.strictEqual(exportService.compareText(6, { label: 'Oktober 2026', count: 9 }), 'Turun 3 (33%)');
  assert.strictEqual(exportService.compareText(9, { label: 'Oktober 2026', count: 9 }), 'Sama (9)');
});

// ---------- Gambar ----------
test('pemeriksa gambar memeriksa isi file, bukan nama', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  assert.ok(decodeDataUrl(png).ok);
  assert.ok(!decodeDataUrl('data:image/png;base64,AAAA').ok);
  assert.ok(!decodeDataUrl('data:text/html;base64,PHNjcmlwdD4=').ok);
  assert.ok(!decodeDataUrl('bukan data url').ok);
});

// ---------- Validasi akun ----------
test('NIS harus 5 digit', () => {
  assert.strictEqual(validateAuth.checkNis('12345'), null);
  assert.ok(validateAuth.checkNis('1234'));
  assert.ok(validateAuth.checkNis('1234567890'));
  assert.ok(validateAuth.checkNis('12a45'));
});

test('login menerima username atau email', () => {
  const r = run(validateAuth.validateLogin, { role: 'petugas', identifier: ' Alpha ', password: 'x' });
  assert.ok(r.next);
  assert.strictEqual(r.body.identifier, 'Alpha');
  assert.strictEqual(run(validateAuth.validateLogin, { role: 'dewa', identifier: 'a', password: 'x' }).status, 400);
  assert.strictEqual(run(validateAuth.validateLogin, { role: 'siswa', identifier: '', password: 'x' }).status, 400);
});

test('akun siswa: username atau email salah satunya wajib', () => {
  const base = { nama: 'Budi', nis: '12345', password: 'rahasia123' };
  assert.ok(run(validateAuth.validateStudentCreate, { ...base, username: 'budi.s' }).next);
  assert.ok(run(validateAuth.validateStudentCreate, { ...base, email: 'Budi@Mail.com' }).next);
  assert.strictEqual(run(validateAuth.validateStudentCreate, base).status, 400);
  assert.strictEqual(run(validateAuth.validateStudentCreate, { ...base, nis: '123' , username: 'budi'}).status, 400);
  assert.strictEqual(run(validateAuth.validateStudentCreate, { ...base, username: 'a b' }).status, 400);
  assert.strictEqual(run(validateAuth.validateStudentCreate, { ...base, username: 'budi', password: 'pendek' }).status, 400);
});

test('akun staf: hanya Administrator atau Petugas UKS', () => {
  const base = { nama: 'Petugas Zeta', username: 'Zeta', password: 'zetakamis06' };
  assert.ok(run(validateAuth.validateStaffCreate, { ...base, role: 'petugas' }).next);
  assert.ok(run(validateAuth.validateStaffCreate, { ...base, role: 'administrator' }).next);
  assert.strictEqual(run(validateAuth.validateStaffCreate, { ...base, role: 'siswa' }).status, 400);
});

// ---------- Validasi data UKS ----------
test('pasien sakit', () => {
  const ok = { nama_pasien: 'Gamma Stemsago', nis: '99999', kelas: 'xii tkj a', tanggal_sakit: '2026-10-05', keluhan: 'pusing' };
  const r = run(validators.validatePatient, ok);
  assert.ok(r.next);
  assert.strictEqual(r.body.kelas, 'XII TKJ A');
  assert.strictEqual(r.body.keluhan, 'Pusing');
  assert.strictEqual(run(validators.validatePatient, { ...ok, nis: '9999' }).status, 400);
  assert.strictEqual(run(validators.validatePatient, { ...ok, tanggal_sakit: '' }).status, 400);
  assert.strictEqual(run(validators.validatePatient, { ...ok, keluhan: '' }).status, 400);
});

test('obat keluar', () => {
  const ok = { tanggal: '2026-10-05', nama: 'Siti', kelas: 'xi rpl 1', obat: 'paracetamol', jumlah: '2' };
  const r = run(fitur.validateObat, ok);
  assert.ok(r.next);
  assert.strictEqual(r.body.jumlah, 2);
  assert.strictEqual(run(fitur.validateObat, { ...ok, jumlah: 0 }).status, 400);
  assert.strictEqual(run(fitur.validateObat, { ...ok, obat: '' }).status, 400);
});

test('peminjaman barang', () => {
  const ok = { tanggal_pinjam: '2026-10-05', nama: 'OSIS', kelas: 'osis', jenis_barang: 'tandu' };
  const r = run(fitur.validatePinjam, ok);
  assert.ok(r.next);
  assert.strictEqual(r.body.tanggal_kembali, null);
  assert.strictEqual(run(fitur.validatePinjam, { ...ok, tanggal_kembali: '2026-10-01' }).status, 400);
  assert.ok(run(fitur.validatePinjam, { ...ok, tanggal_kembali: '2026-10-09' }).next);
});

test('konten beranda', () => {
  const ok = { jenis: 'lomba', judul: 'Lomba Tandu', deskripsi: 'Juara', juara: 'Juara 1' };
  assert.ok(run(fitur.validateKonten, ok).next);
  assert.strictEqual(run(fitur.validateKonten, { ...ok, jenis: 'lain' }).status, 400);
  assert.strictEqual(run(fitur.validateKonten, { ...ok, deskripsi: '' }).status, 400);
  assert.strictEqual(run(fitur.validateKonten, { ...ok, gambar: 'data:image/gif;base64,AAAA' }).status, 400);
  assert.strictEqual(run(fitur.validateKonten, { ...ok, jenis: 'kegiatan' }).body.juara, null);
});

test('id harus bilangan bulat positif', () => {
  assert.ok(run(validators.validateId, {}, { id: '5' }).next);
  assert.strictEqual(run(validators.validateId, {}, { id: 'abc' }).status, 400);
  assert.strictEqual(run(validators.validateId, {}, { id: '0' }).status, 400);
});

// ---------- Excel ----------
// Membaca daftar file di dalam .xlsx (ZIP) lewat central directory
function listZip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'bukan file ZIP');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const files = {};
  for (let i = 0; i < count; i += 1) {
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extra = buffer.readUInt16LE(offset + 30);
    const comment = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const raw = buffer.slice(dataStart, dataStart + size);
    files[name] = (method === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8');
    offset += 46 + nameLength + extra + comment;
  }
  return files;
}

test('file Excel: tiga sheet berurutan (Data, Ringkasan, Data Analisis)', () => {
  const period = resolvePeriod({ bulan: '2026-10' });
  const rows = [
    { nama_pasien: 'A', nis: '10001', kelas: 'XII TKJ A', tanggal_sakit: '2026-10-02', keluhan: 'Pusing', created_at: new Date(2026, 9, 2, 8, 30) },
    { nama_pasien: 'B', nis: '10002', kelas: 'XII TKJ A', tanggal_sakit: '2026-10-03', keluhan: 'pusing', created_at: '2026-10-03 09:10:00' },
    { nama_pasien: 'C', nis: '10003', kelas: 'XI RPL 1', tanggal_sakit: '2026-10-03', keluhan: 'Demam', created_at: null }
  ];
  const files = listZip(exportService.pasien({ rows, period, user: { nama: 'Alpha' } }));
  ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml', 'xl/charts/chart1.xml', 'xl/drawings/drawing1.xml'].forEach((f) =>
    assert.ok(files[f], `tidak ada ${f}`)
  );

  // Urutan sheet: 1 data siswa sakit, 2 ringkasan, 3 data analisis
  const names = [...files['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(names, ['Data Siswa Sakit', 'Ringkasan', 'Data Analisis']);

  // Sheet 1 memuat semua isian formulir (nama, NIS, kelas, tanggal, keluhan) dan tanpa grafik
  const strings = files['xl/sharedStrings.xml'];
  ['Nama pasien', 'NIS', 'Kelas', 'Tanggal sakit', 'Sakit / keluhan', 'Dicatat pada', '10001'].forEach((t) => assert.ok(strings.includes(t), `sheet data kurang: ${t}`));
  assert.ok(!files['xl/worksheets/sheet1.xml'].includes('<drawing'), 'sheet 1 tidak berisi grafik');
  assert.ok(files['xl/worksheets/sheet1.xml'].includes('<autoFilter'), 'data bisa difilter');
  assert.ok(files['xl/worksheets/sheet2.xml'].includes('<drawing'), 'grafik ada di sheet Ringkasan');

  // Tabel analisis memakai rumus yang membaca sheet 1
  assert.ok(files['xl/worksheets/sheet3.xml'].includes('SUMPRODUCT'), 'tabel analisis harus memakai rumus');
  assert.ok(files['xl/worksheets/sheet3.xml'].includes("'Data Siswa Sakit'!"), 'rumus membaca sheet data');
  assert.ok(files['xl/worksheets/sheet3.xml'].includes('type="dataBar"'), 'ada batang data di tabel');
  assert.ok(strings.includes('Rekapitulasi Data Siswa Sakit Bulan Oktober 2026'));

  // Grafik: 1 garis harian, 2 lingkaran, 3-4 batang mendatar, 5 tingkat kelas, 6 hari, 7 minggu
  assert.ok(files['xl/charts/chart1.xml'].includes('<c:lineChart>'), 'grafik harian berupa garis');
  assert.ok(files['xl/charts/chart2.xml'].includes('<c:pieChart>'), 'ada diagram proporsi');
  assert.ok(files['xl/charts/chart3.xml'].includes('<c:barChart>'));
  assert.ok(files['xl/charts/chart6.xml'].includes('<c:barChart>'), 'ada grafik per hari dalam seminggu');
  assert.ok(files['xl/charts/chart7.xml'].includes('<c:barChart>'), 'ada grafik per minggu');

  // Diagram lingkaran: nama + persen tampil langsung pada irisan, warna RGB tegas
  const pie = files['xl/charts/chart2.xml'];
  assert.ok(pie.includes('<c:showPercent val="1"/>') && pie.includes('<c:showCatName val="1"/>'), 'label lingkaran memuat nama dan persen');
  assert.ok(pie.includes('<c:v>Pusing (2)</c:v>'), 'label irisan memuat jumlah');
  assert.ok(pie.includes('E11D2E') && pie.includes('1D6FEB'), 'warna irisan tegas');

  // "Pusing" dan "pusing" dihitung sebagai satu jenis sakit
  assert.ok(files['xl/charts/chart3.xml'].includes('<c:v>2</c:v>'));
  // batang berwarna per kategori dan sumbu angka bulat
  assert.ok(files['xl/charts/chart3.xml'].includes('<c:dPt>'), 'tiap batang berwarna sendiri');
  assert.ok(files['xl/charts/chart3.xml'].includes('<c:majorUnit val="1"/>'), 'sumbu angka bulat');

  // semua XML harus berformat benar
  Object.entries(files).forEach(([name, xml]) => {
    if (name.endsWith('.xml') || name.endsWith('.rels')) assert.ok(xml.startsWith('<?xml'), `${name} bukan XML`);
  });
});

test('semua jenis laporan memakai urutan sheet yang sama', () => {
  const period = resolvePeriod({ bulan: '2026-10' });
  const cases = [
    [exportService.obat, [{ tanggal: '2026-10-02', nama: 'A', kelas: 'X DKV 2', obat: 'Paracetamol', jumlah: 2, keterangan: '', created_at: null }], 'Data Obat Keluar'],
    [exportService.peminjaman, [{ tanggal_pinjam: '2026-10-02', nama: 'A', kelas: 'PMR', jenis_barang: 'Tandu', tanggal_kembali: null, keterangan: '', created_at: null }], 'Data Peminjaman'],
    [exportService.tekananDarah, [{ tanggal: '2026-10-02', nama_siswa: 'A', nis: '10001', kelas: 'XI RPL 1', pengukuran_ke: 1, sistolik: 150, diastolik: 95, kategori: 'hipertensi2' }], 'Data Tekanan Darah']
  ];
  cases.forEach(([build, rows, first]) => {
    const files = listZip(build({ rows, period, previous: { label: 'September 2026', count: 1 }, user: { nama: 'Alpha' } }));
    const names = [...files['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
    assert.deepStrictEqual(names, [first, 'Ringkasan', 'Data Analisis']);
    assert.ok(files['xl/charts/chart1.xml'], 'ada grafik');
  });
});

test('tingkat kelas dan jam Excel', () => {
  assert.strictEqual(exportService.gradeOf('XII TKJ A'), 'Kelas XII');
  assert.strictEqual(exportService.gradeOf('XI RPL 1'), 'Kelas XI');
  assert.strictEqual(exportService.gradeOf('X DKV 2'), 'Kelas X');
  assert.strictEqual(exportService.gradeOf('PMR'), 'Lainnya');
  const { dateTimeSerial } = src('utils/xlsx');
  assert.strictEqual(dateTimeSerial('2026-10-26 12:00:00') % 1, 0.5);
  assert.strictEqual(dateTimeSerial(null), null);
});

test('laporan kosong tidak error', () => {
  const period = resolvePeriod({ semua: '1' });
  [exportService.pasien, exportService.obat, exportService.peminjaman, exportService.tekananDarah].forEach((build) => {
    const buffer = build({ rows: [], period, user: null });
    assert.strictEqual(buffer.slice(0, 2).toString(), 'PK');
  });
});

console.log(`\nUji otomatis: ${passed} lulus, ${failed} gagal`);
process.exit(failed ? 1 : 0);
