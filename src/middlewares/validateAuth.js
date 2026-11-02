// ============================================================
// Validasi untuk fitur akun dan login.
// Fungsi check... dipakai bersama oleh middleware di bawah dan oleh
// skrip pembuat akun (src/scripts).
// ============================================================
const { clean } = require('../utils/text');

const NIS_PATTERN = /^\d{5}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLES_LOGIN = ['administrator', 'petugas', 'siswa'];
const ROLES_STAFF = ['administrator', 'petugas'];

const text = (value) => String(value ?? '').trim();

function checkNama(nama) {
  if (!nama) return 'Nama lengkap wajib diisi.';
  if (nama.length < 2) return 'Nama lengkap minimal 2 karakter.';
  if (nama.length > 100) return 'Nama lengkap maksimal 100 karakter.';
  return null;
}

// required = true: wajib diisi. required = false: boleh kosong, tapi kalau diisi harus benar.
function checkUsername(username, required = true) {
  if (!username) return required ? 'Username wajib diisi.' : null;
  if (!USERNAME_PATTERN.test(username)) {
    return 'Username 3–30 karakter dan hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung.';
  }
  return null;
}

function checkEmail(email, required = true) {
  if (!email) return required ? 'Email wajib diisi.' : null;
  if (email.length > 150) return 'Email maksimal 150 karakter.';
  if (!EMAIL_PATTERN.test(email)) return 'Format email tidak valid.';
  return null;
}

function checkNis(nis) {
  if (!nis) return 'NIS wajib diisi.';
  if (!NIS_PATTERN.test(nis)) return 'NIS harus 5 digit angka.';
  return null;
}

function checkPassword(password) {
  if (!password) return 'Kata sandi wajib diisi.';
  if (password.length < 8) return 'Kata sandi minimal 8 karakter.';
  if (password.length > 100) return 'Kata sandi maksimal 100 karakter.';
  return null;
}

// Akun siswa harus punya username ATAU email (salah satunya cukup)
function checkIdentity({ username, email }) {
  if (!username && !email) return 'Isi username atau email untuk login.';
  return null;
}

function reject(res, errors) {
  return res.status(400).json({ success: false, message: errors[0], errors });
}

// Mengambil dan membersihkan isian akun dari body
function readAccount(body = {}) {
  return {
    nama: clean(body.nama),
    nis: text(body.nis),
    username: text(body.username),
    email: text(body.email).toLowerCase(),
    password: String(body.password ?? '')
  };
}

// POST /api/auth/register dan POST /api/accounts/students
// (siswa mendaftar sendiri, atau Administrator mendaftarkan siswa)
function validateStudentCreate(req, res, next) {
  const data = readAccount(req.body);
  const errors = [
    checkNama(data.nama),
    checkNis(data.nis),
    checkUsername(data.username, false),
    checkEmail(data.email, false),
    checkIdentity(data),
    checkPassword(data.password)
  ].filter(Boolean);
  if (errors.length > 0) return reject(res, errors);

  req.body = data;
  next();
}

// PUT /api/accounts/students/:nis  (kata sandi boleh kosong = tidak diubah)
function validateStudentUpdate(req, res, next) {
  const data = readAccount(req.body);
  const errors = [
    checkNama(data.nama),
    checkUsername(data.username, false),
    checkEmail(data.email, false),
    checkIdentity(data),
    data.password ? checkPassword(data.password) : null
  ].filter(Boolean);
  if (errors.length > 0) return reject(res, errors);

  req.body = data;
  next();
}

// POST /api/auth/login  (peran dipilih dari kartu, lalu username/email dan kata sandi)
function validateLogin(req, res, next) {
  const body = req.body || {};
  const data = {
    role: text(body.role),
    identifier: text(body.identifier ?? body.username ?? body.email),
    password: String(body.password ?? '')
  };

  const errors = [];
  if (!ROLES_LOGIN.includes(data.role)) errors.push('Peran tidak valid. Pilih salah satu kartu peran.');
  if (!data.identifier) errors.push('Username/email wajib diisi.');
  else if (data.identifier.length > 150) errors.push('Username/email terlalu panjang.');
  if (!data.password) errors.push('Kata sandi wajib diisi.');
  if (errors.length > 0) return reject(res, errors);

  req.body = data;
  next();
}

// POST /api/accounts/staff  (Administrator membuat akun Petugas UKS atau Administrator)
function validateStaffCreate(req, res, next) {
  const body = req.body || {};
  const data = { ...readAccount(body), role: text(body.role) };
  const errors = [
    checkNama(data.nama),
    checkUsername(data.username, true),
    checkEmail(data.email, false),
    checkPassword(data.password)
  ].filter(Boolean);
  if (!ROLES_STAFF.includes(data.role)) errors.push('Peran harus Petugas UKS atau Administrator.');
  if (errors.length > 0) return reject(res, errors);

  req.body = data;
  next();
}

// PUT /api/accounts/staff/:id  (peran tidak bisa diubah; kata sandi boleh kosong)
function validateStaffUpdate(req, res, next) {
  const data = readAccount(req.body);
  const errors = [
    checkNama(data.nama),
    checkUsername(data.username, true),
    checkEmail(data.email, false),
    data.password ? checkPassword(data.password) : null
  ].filter(Boolean);
  if (errors.length > 0) return reject(res, errors);

  req.body = data;
  next();
}

function validateStaffId(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'ID akun tidak valid.' });
  }
  req.accountId = id;
  next();
}

function validateStudentNis(req, res, next) {
  const nis = text(req.params.nis);
  if (!NIS_PATTERN.test(nis)) {
    return res.status(400).json({ success: false, message: 'NIS tidak valid.' });
  }
  req.accountNis = nis;
  next();
}

module.exports = {
  NIS_PATTERN,
  checkNama,
  checkUsername,
  checkEmail,
  checkNis,
  checkPassword,
  validateStudentCreate,
  validateStudentUpdate,
  validateLogin,
  validateStaffCreate,
  validateStaffUpdate,
  validateStaffId,
  validateStudentNis
};
