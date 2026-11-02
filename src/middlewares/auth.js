// ============================================================
// AUTENTIKASI DAN OTORISASI
//
// Cara kerja sesi:
//  1. Saat login berhasil, server membuat token acak (64 karakter heksadesimal).
//  2. Token dikirim ke browser sebagai cookie "uks_session" (HttpOnly, sehingga
//     JavaScript di halaman tidak bisa membacanya).
//  3. Di database hanya disimpan HASH token. Di setiap permintaan, server
//     mengambil cookie, menghitung hash-nya, lalu mencocokkan ke tabel sessions.
//
// requireAuth  : memastikan pengguna sudah login. Jika ya, mengisi req.auth.
// requireRole  : memastikan peran pengguna termasuk yang diizinkan.
// ============================================================
const crypto = require('crypto');
const SessionModel = require('../models/sessionModel');
const StaffModel = require('../models/staffModel');
const StudentModel = require('../models/studentModel');

const COOKIE_NAME = 'uks_session';
const SESSION_SECONDS = 8 * 60 * 60; // sesi berlaku 8 jam
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function parseCookies(header) {
  const cookies = {};
  String(header || '')
    .split(';')
    .forEach((part) => {
      const index = part.indexOf('=');
      if (index < 0) return;
      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (!name) return;
      try {
        cookies[name] = decodeURIComponent(value);
      } catch (err) {
        cookies[name] = value; // cookie rusak (%E0%A4%A dst) jangan sampai menjatuhkan permintaan
      }
    });
  return cookies;
}

function getToken(req) {
  const token = parseCookies(req.headers && req.headers.cookie)[COOKIE_NAME];
  return token && TOKEN_PATTERN.test(token) ? token : null;
}

function cookieAttributes(maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// Membuat sesi baru untuk sebuah akun dan memasang cookie-nya
async function startSession(res, { accountType, accountId }) {
  const token = crypto.randomBytes(32).toString('hex');
  await SessionModel.create({
    tokenHash: sha256(token),
    accountType,
    accountId,
    ttlSeconds: SESSION_SECONDS
  });
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; ${cookieAttributes(SESSION_SECONDS)}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${cookieAttributes(0)}`);
}

// Data akun yang aman dikirim ke browser (tanpa password_hash)
function toProfile(auth) {
  return {
    role: auth.role,
    nama: auth.nama,
    username: auth.username || null,
    email: auth.email || null,
    nis: auth.nis || null,
    dibuat: auth.created_at
  };
}

// Mengembalikan objek auth untuk permintaan ini, atau null kalau belum login
async function loadAuth(req) {
  const token = getToken(req);
  if (!token) return null;

  const tokenHash = sha256(token);
  const session = await SessionModel.find(tokenHash);
  if (!session) return null;

  if (session.account_type === 'staff') {
    const account = await StaffModel.findById(Number(session.account_id));
    if (!account) {
      await SessionModel.remove(tokenHash);
      return null;
    }
    return {
      type: 'staff',
      id: account.id,
      role: account.role,
      nama: account.nama,
      username: account.username,
      email: account.email,
      created_at: account.created_at,
      tokenHash
    };
  }

  const account = await StudentModel.findByNis(session.account_id);
  if (!account) {
    await SessionModel.remove(tokenHash);
    return null;
  }
  return {
    type: 'student',
    id: account.nis,
    nis: account.nis,
    role: 'siswa',
    nama: account.nama,
    username: account.username,
    email: account.email,
    created_at: account.created_at,
    tokenHash
  };
}

async function requireAuth(req, res, next) {
  try {
    const auth = await loadAuth(req);
    if (!auth) {
      return res.status(401).json({
        success: false,
        message: 'Silakan masuk terlebih dahulu.'
      });
    }
    req.auth = auth;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({
        success: false,
        message: 'Anda tidak memiliki akses ke fitur ini.'
      });
    }
    next();
  };
}

module.exports = {
  COOKIE_NAME,
  parseCookies,
  getToken,
  sha256,
  startSession,
  clearSessionCookie,
  toProfile,
  requireAuth,
  requireRole
};
