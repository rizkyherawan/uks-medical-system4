// ============================================================
// UJI QA API (end-to-end)   ->   npm test  (dijalankan setelah test/run.js)
// Menjalankan app ASLI (src/app.js, semua route, middleware, controller, validator) lewat HTTP
// sungguhan dengan Express tiruan dan database memori (lihat test/harness). Tidak butuh MySQL.
//
// Yang diperiksa: pesan validasi tiap isian wajib, hak akses tiap peran, alur login/daftar/keluar,
// CRUD konten + upload gambar (termasuk serangan), header keamanan, CSRF, batas permintaan.
// ============================================================
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const { startHarness } = require('./harness');

let passed = 0;
let failed = 0;
const queue = [];
const test = (name, fn) => queue.push({ name, fn });

// ---------- alat bantu ----------

let base = '';

async function api(method, url, { body, cookie, headers = {}, raw } = {}) {
  const init = { method, headers: { ...headers } };
  if (cookie) init.headers.Cookie = cookie;
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = raw ? body : JSON.stringify(body);
  }
  const res = await fetch(base + url, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    // bukan JSON
  }
  const setCookie = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return { status: res.status, json, text, headers: res.headers, setCookie };
}

const cookies = {};
async function login(role) {
  if (cookies[role]) return cookies[role];
  const creds = {
    administrator: { identifier: 'admin.uji', password: 'KataSandi-Admin1' },
    petugas: { identifier: 'petugas.uji', password: 'KataSandi-Petugas1' },
    siswa: { identifier: 'siswa.uji', password: 'KataSandi-Siswa1' }
  }[role];
  const res = await api('POST', '/api/auth/login', { body: { role, ...creds } });
  assert.strictEqual(res.status, 200, `login ${role} gagal: ${res.text}`);
  cookies[role] = res.setCookie[0].split(';')[0];
  return cookies[role];
}

const has = (res, text) => assert.ok((res.json.errors || [res.json.message]).includes(text), `pesan "${text}" tidak ada. Isi: ${JSON.stringify(res.json)}`);

// Gambar palsu tetapi berkepala (magic bytes) valid, cukup untuk lolos pemeriksa isi file
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(60, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(60, 3)]);
const dataUrl = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`;
const IMG = { jpg: dataUrl('image/jpeg', JPG), png: dataUrl('image/png', PNG), webp: dataUrl('image/webp', WEBP) };

const konten = (extra = {}) => ({ jenis: 'kegiatan', judul: 'Latihan P3K', tanggal: '2026-10-20', deskripsi: 'Latihan pertolongan pertama.', gambar: IMG.jpg, gambar_preview: IMG.png, ...extra });
const filesOnDisk = (root) => {
  const dir = path.join(root, 'uploads', 'konten');
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
};

// ============================================================
// 1. LOGIN
// ============================================================

test('login: semua kosong -> peringatan untuk peran, username, dan kata sandi', async () => {
  const res = await api('POST', '/api/auth/login', { body: {} });
  assert.strictEqual(res.status, 400);
  has(res, 'Peran tidak valid. Pilih salah satu kartu peran.');
  has(res, 'Username/email wajib diisi.');
  has(res, 'Kata sandi wajib diisi.');
});

test('login: username diisi, kata sandi kosong -> "Kata sandi wajib diisi."', async () => {
  const res = await api('POST', '/api/auth/login', { body: { role: 'petugas', identifier: 'petugas.uji', password: '' } });
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(res.json.errors, ['Kata sandi wajib diisi.']);
});

test('login: kata sandi diisi, username kosong -> "Username/email wajib diisi."', async () => {
  const res = await api('POST', '/api/auth/login', { body: { role: 'petugas', identifier: '   ', password: 'abc' } });
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(res.json.errors, ['Username/email wajib diisi.']);
});

test('login: kata sandi salah atau peran tidak sesuai -> 401 dengan pesan umum', async () => {
  const wrong = await api('POST', '/api/auth/login', { body: { role: 'petugas', identifier: 'petugas.uji', password: 'salah-salah' } });
  assert.strictEqual(wrong.status, 401);
  const role = await api('POST', '/api/auth/login', { body: { role: 'administrator', identifier: 'petugas.uji', password: 'KataSandi-Petugas1' } });
  assert.strictEqual(role.status, 401);
  assert.strictEqual(wrong.json.message, role.json.message, 'pesan sama agar tidak membocorkan akun mana yang ada');
});

test('login berhasil: cookie HttpOnly + SameSite, tanpa hash kata sandi di jawaban', async () => {
  const res = await api('POST', '/api/auth/login', { body: { role: 'siswa', identifier: 'SISWA.UJI', password: 'KataSandi-Siswa1' } });
  assert.strictEqual(res.status, 200);
  assert.ok(/HttpOnly/.test(res.setCookie[0]) && /SameSite=Lax/.test(res.setCookie[0]), res.setCookie[0]);
  assert.ok(!/password|hash/i.test(res.text), 'jawaban tidak boleh memuat hash');
  assert.strictEqual(res.json.data.role, 'siswa');
});

test('login: 5 kali salah -> akun terkunci sementara (429)', async () => {
  for (let i = 0; i < 5; i += 1) {
    const r = await api('POST', '/api/auth/login', { body: { role: 'petugas', identifier: 'kunci.uji', password: 'salah-terus' } });
    assert.strictEqual(r.status, 401);
  }
  const locked = await api('POST', '/api/auth/login', { body: { role: 'petugas', identifier: 'kunci.uji', password: 'salah-terus' } });
  assert.strictEqual(locked.status, 429);
  assert.ok(/menit/.test(locked.json.message));
});

// ============================================================
// 2. SESI, COOKIE, DAN FORMAT PERMINTAAN
// ============================================================

test('sesi: tanpa cookie 401, cookie rusak tidak membuat server error, keluar mengakhiri sesi', async () => {
  assert.strictEqual((await api('GET', '/api/auth/me')).status, 401);
  assert.strictEqual((await api('GET', '/api/auth/me', { cookie: 'uks_session=%E0%A4%A' })).status, 401);
  assert.strictEqual((await api('GET', '/api/auth/me', { cookie: `uks_session=${'a'.repeat(64)}` })).status, 401);

  const res = await api('POST', '/api/auth/login', { body: { role: 'petugas', identifier: 'petugas.uji', password: 'KataSandi-Petugas1' } });
  const cookie = res.setCookie[0].split(';')[0];
  assert.strictEqual((await api('GET', '/api/auth/me', { cookie })).status, 200);
  assert.strictEqual((await api('POST', '/api/auth/logout', { cookie })).status, 200);
  assert.strictEqual((await api('GET', '/api/auth/me', { cookie })).status, 401, 'sesi harus mati setelah keluar');
});

test('format permintaan: JSON rusak -> 400, bodi terlalu besar -> 413 (pesan Indonesia)', async () => {
  const bad = await api('POST', '/api/auth/login', { body: '{rusak', raw: true });
  assert.strictEqual(bad.status, 400);
  assert.strictEqual(bad.json.message, 'Format JSON tidak valid.');

  const big = await api('POST', '/api/auth/login', { body: { role: 'siswa', identifier: 'x'.repeat(150000), password: 'x' } });
  assert.strictEqual(big.status, 413);
  assert.ok(/terlalu besar/.test(big.json.message));
});

// ============================================================
// 3. PENDAFTARAN SISWA
// ============================================================

test('daftar: semua kosong -> semua peringatan wajib muncul', async () => {
  const res = await api('POST', '/api/auth/register', { body: {} });
  assert.strictEqual(res.status, 400);
  ['Nama lengkap wajib diisi.', 'NIS wajib diisi.', 'Isi username atau email untuk login.', 'Kata sandi wajib diisi.'].forEach((m) => has(res, m));
});

test('daftar: NIS bukan 5 digit, kata sandi pendek, username/email tidak valid', async () => {
  const res = await api('POST', '/api/auth/register', { body: { nama: 'Budi', nis: '12ab', username: 'b!', email: 'bukan-email', password: '123' } });
  assert.strictEqual(res.status, 400);
  has(res, 'NIS harus 5 digit angka.');
  has(res, 'Kata sandi minimal 8 karakter.');
  has(res, 'Format email tidak valid.');
  assert.ok(res.json.errors.some((m) => /^Username 3/.test(m)));
});

test('daftar: berhasil lalu NIS / username / email ganda ditolak (409)', async () => {
  const ok = await api('POST', '/api/auth/register', { body: { nama: 'Siti Aminah', nis: '55555', username: 'siti.a', email: 'Siti@Contoh.id', password: 'rahasia-123' } });
  assert.strictEqual(ok.status, 201);
  assert.ok(ok.setCookie[0].includes('uks_session='));
  const nis = await api('POST', '/api/auth/register', { body: { nama: 'Lain', nis: '55555', username: 'lain.x', password: 'rahasia-123' } });
  assert.strictEqual(nis.status, 409);
  const user = await api('POST', '/api/auth/register', { body: { nama: 'Lain', nis: '55556', username: 'SITI.A', password: 'rahasia-123' } });
  assert.strictEqual(user.status, 409);
  const mail = await api('POST', '/api/auth/register', { body: { nama: 'Lain', nis: '55557', email: 'siti@contoh.id', password: 'rahasia-123' } });
  assert.strictEqual(mail.status, 409);
});

// ============================================================
// 4. HAK AKSES PER PERAN
// ============================================================

test('hak akses: pengunjung hanya boleh melihat konten, selebihnya 401', async () => {
  assert.strictEqual((await api('GET', '/api/konten')).status, 200);
  for (const [method, url] of [['GET', '/api/patients'], ['POST', '/api/patients'], ['GET', '/api/obat-keluar'], ['GET', '/api/peminjaman'], ['GET', '/api/blood-pressure'], ['GET', '/api/export/pasien'], ['GET', '/api/accounts/staff'], ['GET', '/api/me/blood-pressure'], ['POST', '/api/konten'], ['PUT', '/api/konten/1'], ['DELETE', '/api/konten/1']]) {
    const res = await api(method, url, method === 'GET' ? {} : { body: {} });
    assert.strictEqual(res.status, 401, `${method} ${url} harus 401, dapat ${res.status}`);
  }
});

test('hak akses: siswa hanya boleh melihat tekanan darahnya sendiri', async () => {
  const cookie = await login('siswa');
  assert.strictEqual((await api('GET', '/api/me/blood-pressure', { cookie })).status, 200);
  for (const [method, url] of [['GET', '/api/patients'], ['GET', '/api/blood-pressure'], ['GET', '/api/export/pasien'], ['GET', '/api/accounts/staff'], ['POST', '/api/konten']]) {
    const res = await api(method, url, { cookie, ...(method === 'GET' ? {} : { body: {} }) });
    assert.strictEqual(res.status, 403, `${method} ${url} harus 403, dapat ${res.status}`);
  }
});

test('hak akses: petugas bisa mencatat tetapi tidak bisa kelola akun dan konten', async () => {
  const cookie = await login('petugas');
  for (const url of ['/api/patients', '/api/obat-keluar', '/api/peminjaman', '/api/blood-pressure']) {
    assert.strictEqual((await api('GET', url, { cookie })).status, 200, url);
  }
  for (const [method, url] of [['GET', '/api/accounts/staff'], ['POST', '/api/accounts/staff'], ['DELETE', '/api/accounts/students/12345'], ['POST', '/api/konten'], ['DELETE', '/api/konten/1'], ['GET', '/api/me/blood-pressure']]) {
    const res = await api(method, url, { cookie, ...(method === 'GET' || method === 'DELETE' ? {} : { body: {} }) });
    assert.strictEqual(res.status, 403, `${method} ${url} harus 403, dapat ${res.status}`);
  }
});

// ============================================================
// 5. PENCATATAN (pasien, obat, peminjaman, tekanan darah)
// ============================================================

test('pasien: isian kosong -> setiap peringatan wajib muncul', async () => {
  const cookie = await login('petugas');
  const res = await api('POST', '/api/patients', { cookie, body: {} });
  assert.strictEqual(res.status, 400);
  ['Nama pasien wajib diisi.', 'NIS wajib diisi.', 'Kelas wajib diisi.', 'Tanggal sakit wajib diisi.', 'Sakit/keluhan wajib diisi.'].forEach((m) => has(res, m));
});

test('pasien: NIS, tanggal, dan panjang teks diperiksa; CRUD lengkap berjalan', async () => {
  const cookie = await login('petugas');
  const valid = { nama_pasien: '  Rani   Putri ', nis: '10001', kelas: 'xii tkj a', tanggal_sakit: '2026-10-05', keluhan: 'demam tinggi' };

  has(await api('POST', '/api/patients', { cookie, body: { ...valid, nis: '1000' } }), 'NIS harus 5 digit angka.');
  has(await api('POST', '/api/patients', { cookie, body: { ...valid, tanggal_sakit: '2026-02-31' } }), 'Tanggal sakit tidak valid.');
  has(await api('POST', '/api/patients', { cookie, body: { ...valid, keluhan: 'x'.repeat(501) } }), 'Sakit/keluhan maksimal 500 karakter.');

  const created = await api('POST', '/api/patients', { cookie, body: valid });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.json.data.nama_pasien, 'Rani Putri', 'spasi dirapikan');
  assert.strictEqual(created.json.data.kelas, 'XII TKJ A', 'kelas dijadikan huruf besar');
  assert.strictEqual(created.json.data.keluhan, 'Demam tinggi', 'keluhan diawali huruf besar');

  const id = created.json.data.id;
  assert.strictEqual((await api('GET', `/api/patients/${id}`, { cookie })).status, 200);
  assert.strictEqual((await api('PUT', `/api/patients/${id}`, { cookie, body: { ...valid, keluhan: 'Batuk' } })).json.data.keluhan, 'Batuk');
  assert.strictEqual((await api('GET', '/api/patients?search=rani', { cookie })).json.count, 1);
  assert.strictEqual((await api('GET', '/api/patients?search=tidak-ada', { cookie })).json.count, 0);
  assert.strictEqual((await api('DELETE', `/api/patients/${id}`, { cookie })).status, 200);
  assert.strictEqual((await api('GET', `/api/patients/${id}`, { cookie })).status, 404);
  assert.strictEqual((await api('PUT', '/api/patients/999', { cookie, body: valid })).status, 404);
  assert.strictEqual((await api('GET', '/api/patients/abc', { cookie })).status, 400);
  assert.strictEqual((await api('GET', '/api/patients/-5', { cookie })).status, 400);
});

test('obat dan peminjaman: aturan jumlah dan tanggal kembali', async () => {
  const cookie = await login('petugas');
  const empty = await api('POST', '/api/obat-keluar', { cookie, body: {} });
  ['Tanggal wajib diisi.', 'Nama wajib diisi.', 'Kelas wajib diisi.', 'Obat wajib diisi.'].forEach((m) => has(empty, m));
  const obat = { tanggal: '2026-10-05', nama: 'Dewi', kelas: 'X DKV 2', obat: 'paracetamol', jumlah: 2 };
  has(await api('POST', '/api/obat-keluar', { cookie, body: { ...obat, jumlah: 0 } }), 'Jumlah harus bilangan bulat 1 sampai 999.');
  has(await api('POST', '/api/obat-keluar', { cookie, body: { ...obat, jumlah: 1.5 } }), 'Jumlah harus bilangan bulat 1 sampai 999.');
  assert.strictEqual((await api('POST', '/api/obat-keluar', { cookie, body: obat })).status, 201);

  const emptyLoan = await api('POST', '/api/peminjaman', { cookie, body: {} });
  ['Tanggal peminjaman wajib diisi.', 'Nama peminjam wajib diisi.', 'Kelas atau organisasi wajib diisi.', 'Jenis barang wajib diisi.'].forEach((m) => has(emptyLoan, m));
  const loan = { tanggal_pinjam: '2026-10-05', nama: 'Eko', kelas: 'pmr', jenis_barang: 'tandu' };
  has(await api('POST', '/api/peminjaman', { cookie, body: { ...loan, tanggal_kembali: '2026-10-01' } }), 'Tanggal kembali tidak boleh sebelum tanggal peminjaman.');
  const made = await api('POST', '/api/peminjaman', { cookie, body: loan });
  assert.strictEqual(made.status, 201);
  const back = await api('POST', `/api/peminjaman/${made.json.data.id}/kembali`, { cookie, body: { tanggal_kembali: '2026-10-09' } });
  assert.strictEqual(back.status, 200);
  assert.strictEqual(back.json.data.tanggal_kembali, '2026-10-09');
});

test('tekanan darah: rentang nilai diperiksa, kategori dihitung otomatis, siswa melihat miliknya', async () => {
  const cookie = await login('petugas');
  const empty = await api('POST', '/api/blood-pressure', { cookie, body: {} });
  ['Nama siswa wajib diisi.', 'NIS wajib diisi.', 'Kelas wajib diisi.', 'Pengukuran ke- harus 1, 2, atau 3.'].forEach((m) => has(empty, m));
  const reading = { nama_siswa: 'Siswa Uji', nis: '12345', kelas: 'XI RPL 1', pengukuran_ke: 1, sistolik: 125, diastolik: 82 };
  assert.strictEqual((await api('POST', '/api/blood-pressure', { cookie, body: { ...reading, sistolik: 40 } })).status, 400);
  assert.strictEqual((await api('POST', '/api/blood-pressure', { cookie, body: { ...reading, pengukuran_ke: 4 } })).status, 400);
  const ok = await api('POST', '/api/blood-pressure', { cookie, body: reading });
  assert.strictEqual(ok.status, 201);
  assert.ok(ok.json.data.kategori_nama, 'kategori terisi');

  const mine = await api('GET', '/api/me/blood-pressure', { cookie: await login('siswa') });
  assert.strictEqual(mine.status, 200);
  assert.strictEqual(mine.json.data.pengukuran[0].sistolik, 125);
});

test('ekspor Excel: file xlsx sungguhan, jenis salah -> 404', async () => {
  const cookie = await login('petugas');
  const res = await fetch(`${base}/api/export/pasien?bulan=2026-10`, { headers: { Cookie: cookie } });
  assert.strictEqual(res.status, 200);
  assert.ok(/spreadsheetml/.test(res.headers.get('content-type')));
  const buf = Buffer.from(await res.arrayBuffer());
  assert.strictEqual(buf.slice(0, 2).toString(), 'PK', 'berkas zip/xlsx');
  assert.strictEqual((await api('GET', '/api/export/rahasia', { cookie })).status, 404);
  assert.strictEqual((await api('GET', '/api/export/pasien?bulan=bukan-bulan', { cookie })).status, 200, 'bulan tidak valid memakai bulan ini');
});

// ============================================================
// 6. KELOLA AKUN (Administrator)
// ============================================================

test('akun: isian wajib, duplikat, tidak bisa hapus diri sendiri, ganti sandi mengeluarkan sesi', async () => {
  const cookie = await login('administrator');
  const empty = await api('POST', '/api/accounts/staff', { cookie, body: {} });
  ['Nama lengkap wajib diisi.', 'Username wajib diisi.', 'Kata sandi wajib diisi.', 'Peran harus Petugas UKS atau Administrator.'].forEach((m) => has(empty, m));
  has(await api('POST', '/api/accounts/staff', { cookie, body: { nama: 'Baru', username: 'baru.uji', password: '1234567', role: 'petugas' } }), 'Kata sandi minimal 8 karakter.');

  const made = await api('POST', '/api/accounts/staff', { cookie, body: { nama: 'Petugas Baru', username: 'baru.uji', password: 'sandi-baru-1', role: 'petugas' } });
  assert.strictEqual(made.status, 201);
  assert.ok(!/password/i.test(made.text), 'hash tidak bocor');
  assert.strictEqual((await api('POST', '/api/accounts/staff', { cookie, body: { nama: 'Dobel', username: 'BARU.UJI', password: 'sandi-baru-1', role: 'petugas' } })).status, 409);

  const loginBaru = await api('POST', '/api/auth/login', { body: { role: 'petugas', identifier: 'baru.uji', password: 'sandi-baru-1' } });
  const sesiBaru = loginBaru.setCookie[0].split(';')[0];
  assert.strictEqual((await api('GET', '/api/auth/me', { cookie: sesiBaru })).status, 200);

  const id = made.json.data.id;
  const ubah = await api('PUT', `/api/accounts/staff/${id}`, { cookie, body: { nama: 'Petugas Baru', username: 'baru.uji', password: 'sandi-ganti-2' } });
  assert.strictEqual(ubah.status, 200);
  assert.strictEqual((await api('GET', '/api/auth/me', { cookie: sesiBaru })).status, 401, 'sesi lama harus mati setelah sandi diganti');

  const me = (await api('GET', '/api/auth/me', { cookie })).json.data;
  const list = (await api('GET', '/api/accounts/staff', { cookie })).json.data;
  const diriSendiri = list.find((a) => a.username === me.username);
  const hapusDiri = await api('DELETE', `/api/accounts/staff/${diriSendiri.id}`, { cookie });
  assert.strictEqual(hapusDiri.status, 400);
  assert.strictEqual((await api('DELETE', `/api/accounts/staff/${id}`, { cookie })).status, 200);
  assert.strictEqual((await api('DELETE', `/api/accounts/staff/${id}`, { cookie })).status, 404);
  assert.strictEqual((await api('DELETE', '/api/accounts/students/abc', { cookie })).status, 400);
});

// ============================================================
// 7. KONTEN BERANDA: pratinjau + foto asli
// ============================================================

test('konten: judul, deskripsi, dan gambar wajib diisi', async () => {
  const cookie = await login('administrator');
  const empty = await api('POST', '/api/konten', { cookie, body: { jenis: 'kegiatan' } });
  assert.strictEqual(empty.status, 400);
  has(empty, 'Judul wajib diisi.');
  has(empty, 'Deskripsi wajib diisi.');

  const noPhoto = await api('POST', '/api/konten', { cookie, body: konten({ gambar: undefined, gambar_preview: undefined }) });
  assert.strictEqual(noPhoto.status, 400);
  assert.strictEqual(noPhoto.json.message, 'Gambar wajib dipilih.');

  has(await api('POST', '/api/konten', { cookie, body: konten({ jenis: 'berita' }) }), 'Jenis konten harus Kegiatan atau Lomba.');
  has(await api('POST', '/api/konten', { cookie, body: konten({ judul: 'x'.repeat(151) }) }), 'Judul maksimal 150 karakter.');
  has(await api('POST', '/api/konten', { cookie, body: konten({ deskripsi: 'x'.repeat(3001) }) }), 'Deskripsi maksimal 3000 karakter.');
  has(await api('POST', '/api/konten', { cookie, body: konten({ tanggal: '2026-13-40' }) }), 'Tanggal tidak valid.');
  assert.deepStrictEqual(filesOnDisk(h.uploadRoot), [], 'penolakan tidak boleh meninggalkan file');
});

test('konten: simpan foto asli + pratinjau, tampil untuk umum, file tersaji aman', async () => {
  const cookie = await login('administrator');
  const res = await api('POST', '/api/konten', { cookie, body: konten({ jenis: 'lomba', juara: 'Juara 1', judul: '  Lomba   Tandu ' }) });
  assert.strictEqual(res.status, 201, res.text);
  const item = res.json.data;
  assert.strictEqual(item.judul, 'Lomba Tandu');
  assert.ok(/^uploads\/konten\/\d+-[a-f0-9]{8}\.jpg$/.test(item.gambar), item.gambar);
  assert.ok(/^uploads\/konten\/\d+-[a-f0-9]{8}\.png$/.test(item.gambar_preview), item.gambar_preview);
  assert.strictEqual(filesOnDisk(h.uploadRoot).length, 2);

  const publik = await api('GET', '/api/konten?jenis=lomba');
  assert.strictEqual(publik.status, 200);
  assert.strictEqual(publik.json.data[0].gambar_preview, item.gambar_preview);
  assert.strictEqual(publik.headers.get('cache-control'), 'no-store');

  const file = await fetch(`${base}/${item.gambar_preview}`);
  assert.strictEqual(file.status, 200);
  assert.strictEqual(file.headers.get('content-type'), 'image/png');
  assert.strictEqual(file.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(/max-age/.test(file.headers.get('cache-control')));
});

test('konten: juara hanya berlaku untuk lomba', async () => {
  const cookie = await login('administrator');
  const res = await api('POST', '/api/konten', { cookie, body: konten({ jenis: 'kegiatan', juara: 'Juara 3' }) });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.json.data.juara, null);
});

test('konten: serangan upload ditolak (SVG, HTML menyamar, GIF, terlalu besar, bukan teks)', async () => {
  const cookie = await login('administrator');
  const before = filesOnDisk(h.uploadRoot);
  const svg = dataUrl('image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
  const fakePng = dataUrl('image/png', Buffer.from('<html><script>alert(document.cookie)</script></html>'));
  const gif = dataUrl('image/gif', Buffer.from('GIF89a' + 'x'.repeat(40)));
  const huge = dataUrl('image/png', Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024 + 10, 7)]));

  for (const [label, body, expect] of [
    ['SVG', konten({ gambar: svg }), /JPG, PNG, atau WEBP/],
    ['HTML berkedok PNG', konten({ gambar: fakePng }), /bukan gambar/],
    ['GIF', konten({ gambar: gif }), /JPG, PNG, atau WEBP/],
    ['pratinjau SVG', konten({ gambar_preview: svg }), /JPG, PNG, atau WEBP/],
    ['pratinjau HTML berkedok PNG', konten({ gambar_preview: fakePng }), /bukan gambar/],
    ['terlalu besar', konten({ gambar: huge }), /maksimal 6 MB/],
    ['bukan teks', konten({ gambar: { x: 1 } }), /tidak valid/],
    ['alamat file, bukan data URL', konten({ gambar: '../../etc/passwd' }), /JPG, PNG, atau WEBP/]
  ]) {
    const res = await api('POST', '/api/konten', { cookie, body });
    assert.strictEqual(res.status, 400, `${label} harus ditolak, dapat ${res.status}`);
    assert.ok(expect.test(JSON.stringify(res.json)), `${label}: ${JSON.stringify(res.json)}`);
  }
  assert.deepStrictEqual(filesOnDisk(h.uploadRoot), before, 'tidak ada file baru dari serangan');
});

test('konten: file asli yang valid tetapi pratinjau rusak -> tidak meninggalkan file yatim', async () => {
  const cookie = await login('administrator');
  const before = filesOnDisk(h.uploadRoot);
  const res = await api('POST', '/api/konten', { cookie, body: konten({ gambar_preview: dataUrl('image/png', Buffer.from('bukan gambar sama sekali')) }) });
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(filesOnDisk(h.uploadRoot), before, 'foto asli yang sempat tersimpan harus dibersihkan');
});

test('konten: ubah judul saja, ganti pratinjau saja, ganti foto asli, dan file lama dibersihkan', async () => {
  const cookie = await login('administrator');
  const made = (await api('POST', '/api/konten', { cookie, body: konten({ judul: 'Untuk Diubah' }) })).json.data;
  const id = made.id;
  const count = () => filesOnDisk(h.uploadRoot).length;
  const start = count();

  const t = await api('PUT', `/api/konten/${id}`, { cookie, body: { jenis: 'kegiatan', judul: 'Judul Baru', deskripsi: 'Deskripsi baru.' } });
  assert.strictEqual(t.status, 200);
  assert.strictEqual(t.json.data.gambar, made.gambar, 'foto tidak berubah');
  assert.strictEqual(t.json.data.gambar_preview, made.gambar_preview);
  assert.strictEqual(count(), start);

  const p = await api('PUT', `/api/konten/${id}`, { cookie, body: { jenis: 'kegiatan', judul: 'Judul Baru', deskripsi: 'D', gambar_preview: IMG.webp } });
  assert.strictEqual(p.status, 200);
  assert.strictEqual(p.json.data.gambar, made.gambar);
  assert.notStrictEqual(p.json.data.gambar_preview, made.gambar_preview);
  assert.ok(p.json.data.gambar_preview.endsWith('.webp'));
  assert.strictEqual(count(), start, 'pratinjau lama dihapus');
  assert.ok(!fs.existsSync(path.join(h.uploadRoot, made.gambar_preview)));

  const g = await api('PUT', `/api/konten/${id}`, { cookie, body: { jenis: 'kegiatan', judul: 'Judul Baru', deskripsi: 'D', gambar: IMG.png } });
  assert.strictEqual(g.status, 200);
  assert.strictEqual(g.json.data.gambar_preview, null, 'pratinjau lama tidak cocok dengan foto baru');
  assert.strictEqual(count(), start - 1, 'foto lama dan pratinjau lama dihapus, foto baru ditambah');

  const gagal = await api('PUT', `/api/konten/${id}`, { cookie, body: { jenis: 'kegiatan', judul: 'X', deskripsi: 'D', hapus_gambar: true } });
  assert.strictEqual(gagal.status, 400, 'foto tidak boleh dikosongkan begitu saja');
  assert.strictEqual((await api('PUT', '/api/konten/99999', { cookie, body: { jenis: 'kegiatan', judul: 'X', deskripsi: 'D' } })).status, 404);
  assert.strictEqual((await api('PUT', '/api/konten/abc', { cookie, body: {} })).status, 400);
});

test('konten: hapus -> baris dan semua file hilang', async () => {
  const cookie = await login('administrator');
  const made = (await api('POST', '/api/konten', { cookie, body: konten({ judul: 'Untuk Dihapus' }) })).json.data;
  const before = filesOnDisk(h.uploadRoot).length;
  assert.strictEqual((await api('DELETE', `/api/konten/${made.id}`, { cookie })).status, 200);
  assert.strictEqual(filesOnDisk(h.uploadRoot).length, before - 2);
  assert.strictEqual((await api('DELETE', `/api/konten/${made.id}`, { cookie })).status, 404);
  assert.ok(!(await api('GET', '/api/konten')).json.data.some((k) => k.id === made.id));
});

test('konten: judul berisi HTML disimpan apa adanya (pelolosan dilakukan saat ditampilkan)', async () => {
  const cookie = await login('administrator');
  const res = await api('POST', '/api/konten', { cookie, body: konten({ judul: '<img src=x onerror=alert(1)>' }) });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.json.data.judul, '<img src=x onerror=alert(1)>');
  assert.ok(/application\/json/.test(res.headers.get('content-type')), 'dijawab sebagai JSON, bukan HTML');
});

test('konten: kiriman besar tanpa login ditolak 401 sebelum bodi dibaca; admin boleh sampai 14 MB', async () => {
  const bigBody = JSON.stringify(konten({ gambar: dataUrl('image/png', Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024, 5)])) }));
  const anon = await api('POST', '/api/konten', { body: bigBody, raw: true });
  assert.strictEqual(anon.status, 401);
  const admin = await api('POST', '/api/konten', { cookie: await login('administrator'), body: bigBody, raw: true });
  assert.strictEqual(admin.status, 201, admin.text.slice(0, 200));
});

// ============================================================
// 8. KEAMANAN HTTP
// ============================================================

test('keamanan: header pengaman ada di halaman maupun API, tanpa CORS terbuka', async () => {
  for (const url of ['/index.html', '/api/konten']) {
    const res = await fetch(base + url, { headers: { Origin: 'https://situs-jahat.example' } });
    const csp = res.headers.get('content-security-policy');
    assert.ok(csp && /script-src 'self'/.test(csp) && /object-src 'none'/.test(csp) && /frame-ancestors 'none'/.test(csp), `CSP di ${url}`);
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');
    assert.ok(res.headers.get('referrer-policy'));
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null, 'situs lain tidak boleh membaca API');
    assert.ok(!res.headers.get('x-powered-by'));
  }
});

test('keamanan CSRF: permintaan pengubah data dari situs lain ditolak, dari situs sendiri diterima', async () => {
  const cross = await api('POST', '/api/auth/login', { headers: { Origin: 'https://situs-jahat.example' }, body: { role: 'siswa', identifier: 'siswa.uji', password: 'KataSandi-Siswa1' } });
  assert.strictEqual(cross.status, 403);
  const cookie = await login('administrator');
  const lintas = await api('DELETE', '/api/konten/1', { cookie, headers: { Origin: 'https://situs-jahat.example' } });
  assert.strictEqual(lintas.status, 403, 'walau cookie admin ikut terkirim');
  const host = new URL(base).host;
  const sendiri = await api('POST', '/api/auth/login', { headers: { Origin: `http://${host}` }, body: { role: 'siswa', identifier: 'siswa.uji', password: 'KataSandi-Siswa1' } });
  assert.strictEqual(sendiri.status, 200);
  assert.strictEqual((await api('GET', '/api/konten', { headers: { Origin: 'https://situs-jahat.example' } })).status, 200, 'GET baca-saja tidak diblokir');
});

test('keamanan CSRF di belakang proxy: X-Forwarded-Host hanya dipercaya bila TRUST_PROXY aktif; ALLOWED_ORIGINS', () => {
  const { sameOriginGuard } = require('../src/middlewares/security');
  const run = (req) => {
    let status = 0;
    let passedOn = false;
    const res = { status: (c) => ((status = c), res), json: () => {} };
    sameOriginGuard({ method: 'POST', ...req }, res, () => (passedOn = true));
    return passedOn ? 'lolos' : status;
  };
  const trusted = { get: () => true };
  const untrusted = { get: () => undefined };
  const viaProxy = { headers: { origin: 'https://uks.contoh.sch.id', host: 'localhost:3000', 'x-forwarded-host': 'uks.contoh.sch.id' } };

  assert.strictEqual(run({ ...viaProxy, app: trusted }), 'lolos', 'proxy tepercaya meneruskan host asli');
  assert.strictEqual(run({ ...viaProxy, app: untrusted }), 403, 'tanpa TRUST_PROXY header X-Forwarded-Host bisa dipalsukan, jadi diabaikan');
  assert.strictEqual(run({ headers: { origin: 'https://uks.contoh.sch.id', host: 'uks.contoh.sch.id' }, app: untrusted }), 'lolos');
  assert.strictEqual(run({ headers: { origin: 'not-a-url', host: 'x' }, app: untrusted }), 403, 'Origin rusak ditolak');
  assert.strictEqual(run({ headers: { origin: 'null', host: 'x' }, app: untrusted }), 403, 'Origin "null" (iframe/file) ditolak');
  assert.strictEqual(run({ method: 'GET', headers: { origin: 'https://lain.example', host: 'x' }, app: untrusted }), 'lolos', 'GET tidak mengubah data');

  process.env.ALLOWED_ORIGINS = 'https://mitra.example, https://lain.example/';
  assert.strictEqual(run({ headers: { origin: 'https://lain.example', host: 'x' }, app: untrusted }), 'lolos', 'daftar ALLOWED_ORIGINS');
  assert.strictEqual(run({ headers: { origin: 'https://jahat.example', host: 'x' }, app: untrusted }), 403);
  delete process.env.ALLOWED_ORIGINS;
});

test('migrasi: ensureSchema menambah kolom gambar_preview hanya bila belum ada', async () => {
  const { pool } = require('../src/config/db');
  const { ensureSchema } = require('../src/scripts/ensureSchema');
  const calls = [];
  const original = { execute: pool.execute, query: pool.query };
  pool.query = async (sql) => (calls.push(sql), [[], []]);

  pool.execute = async () => [[], []]; // kolom belum ada
  assert.deepStrictEqual(await ensureSchema(), ['kolom konten_situs.gambar_preview ditambahkan']);
  assert.ok(/ALTER TABLE konten_situs ADD COLUMN gambar_preview/.test(calls[0]));

  calls.length = 0;
  pool.execute = async () => [[{ COLUMN_NAME: 'gambar_preview' }], []]; // sudah ada
  assert.deepStrictEqual(await ensureSchema(), []);
  assert.strictEqual(calls.length, 0, 'tidak mengubah apa pun bila sudah terbaru');
  Object.assign(pool, original);
});

test('keamanan: file rahasia dan penelusuran folder tidak bisa diakses', async () => {
  for (const url of ['/.env', '/package.json', '/src/app.js', '/database/schema.sql', '/uploads/konten/.gitkeep', '/node_modules/express/package.json']) {
    const res = await fetch(base + url);
    assert.strictEqual(res.status, 404, `${url} harus 404, dapat ${res.status}`);
  }
  // Permintaan mentah: klien fetch biasanya merapikan ".." sehingga dikirim manual
  const raw = await new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: new URL(base).port, path: '/../package.json', method: 'GET' }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.end();
  });
  assert.ok(raw === 404 || raw === 400, `penelusuran ".." dapat ${raw}`);
});

test('keamanan: pembatas permintaan menolak banjir dengan 429 dan Retry-After', async () => {
  const { rateLimit } = require('../src/middlewares/security');
  const limiter = rateLimit({ windowMs: 60000, max: 3, keyPrefix: 'uji' });
  const headers = {};
  let status = 200;
  const res = { setHeader: (k, v) => (headers[k] = v), status: (c) => ((status = c), res), json: () => {} };
  const req = { ip: '1.2.3.4' };
  let passedThrough = 0;
  for (let i = 0; i < 5; i += 1) limiter(req, res, () => (passedThrough += 1));
  assert.strictEqual(passedThrough, 3);
  assert.strictEqual(status, 429);
  assert.ok(Number(headers['Retry-After']) >= 1);
  let other = 0;
  limiter({ ip: '9.9.9.9' }, res, () => (other += 1));
  assert.strictEqual(other, 1, 'IP lain tidak ikut terblokir');
});

test('keamanan: imageStore hanya mau menghapus file di folder konten', () => {
  const { isOwnImage } = require('../src/utils/imageStore');
  assert.ok(isOwnImage('uploads/konten/1730000000-ab12cd34.jpg'));
  ['../../etc/passwd', 'x/uploads/konten/a.jpg', 'http://situs-lain.example/uploads/konten/a.jpg', 'uploads/konten/a.jpg/..', 'uploads/konten/../../x.jpg', '/etc/passwd', 'uploads/konten/a/b.jpg', 'uploads/konten/x.svg', 'uploads/lain/x.jpg', null, 42].forEach((bad) => assert.ok(!isOwnImage(bad), `harus ditolak: ${bad}`));
});

// ============================================================
// Penjalan uji
// ============================================================

let h;
(async () => {
  h = await startHarness();
  base = h.url;
  await h.seed();

  for (const { name, fn } of queue) {
    try {
      await fn();
      passed += 1;
    } catch (err) {
      failed += 1;
      console.log(`GAGAL  ${name}\n       ${err.message}`);
    }
  }

  await h.close();
  h.cleanup();
  console.log(`\nUji QA API: ${passed} lulus, ${failed} gagal`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
