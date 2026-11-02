// ============================================================
// CONTROLLER autentikasi
//  - register : siswa mendaftar (nama, NIS, username ATAU email, kata sandi)
//  - login    : masuk dengan username/email sesuai peran yang dipilih di kartu
//  - logout   : keluar dan mencabut sesi
//  - me       : data akun yang sedang masuk (dipakai browser untuk
//               menentukan menu dan halaman yang boleh dibuka)
// ============================================================
const StaffModel = require('../models/staffModel');
const StudentModel = require('../models/studentModel');
const SessionModel = require('../models/sessionModel');
const { hashPassword, verifyPassword } = require('../utils/password');
const { getToken, sha256, startSession, clearSessionCookie, toProfile } = require('../middlewares/auth');

// ---------- Pembatasan percobaan login ----------
// 5 kali salah untuk kombinasi (alamat IP + username/email) mengunci login selama 5 menit.
// Disimpan di memori server, jadi hilang kalau server dimulai ulang.
const MAX_FAILURES = 5;
const LOCK_MS = 5 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map();

const throttleKey = (req, identifier) =>
  `${req.ip || (req.socket && req.socket.remoteAddress) || 'unknown'}|${String(identifier).toLowerCase()}`;

function remainingLockMs(key) {
  const entry = failures.get(key);
  if (!entry) return 0;
  const now = Date.now();
  if (entry.lockedUntil > now) return entry.lockedUntil - now;
  if (now - entry.first > WINDOW_MS) failures.delete(key);
  return 0;
}

function recordFailure(key) {
  const now = Date.now();
  let entry = failures.get(key);
  if (!entry || now - entry.first > WINDOW_MS) entry = { count: 0, first: now, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) entry.lockedUntil = now + LOCK_MS;
  failures.set(key, entry);

  if (failures.size > 2000) {
    for (const [k, v] of failures) if (now - v.first > WINDOW_MS) failures.delete(k);
  }
}

// Hash palsu untuk akun yang tidak terdaftar, agar waktu respons tidak
// membedakan "akun tidak ada" dari "kata sandi salah".
let dummyHash = null;
const getDummyHash = () => {
  if (!dummyHash) dummyHash = hashPassword('kata-sandi-pembanding');
  return dummyHash;
};

// Mengubah error duplikat MySQL menjadi pesan yang mudah dipahami
function duplicateMessage(err) {
  if (!err || err.code !== 'ER_DUP_ENTRY') return null;
  const detail = String(err.message);
  if (/uq_students_email/.test(detail)) return 'Email ini sudah terdaftar. Silakan masuk.';
  if (/uq_students_username/.test(detail)) return 'Username ini sudah dipakai. Pilih username lain.';
  return 'NIS ini sudah terdaftar. Silakan masuk.';
}

// Memeriksa NIS, username, dan email sebelum akun siswa dibuat.
// Mengembalikan pesan kesalahan, atau null kalau semuanya masih bebas.
async function studentConflict({ nis, username, email }) {
  if (await StudentModel.findByNis(nis)) return 'NIS ini sudah terdaftar. Silakan masuk.';
  if (username && (await StudentModel.findByUsername(username))) return 'Username ini sudah dipakai. Pilih username lain.';
  if (email && (await StudentModel.findByEmail(email))) return 'Email ini sudah terdaftar. Silakan masuk.';
  return null;
}

// POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const { nama, nis, username, email, password } = req.body;

    const conflict = await studentConflict({ nis, username, email });
    if (conflict) return res.status(409).json({ success: false, message: conflict });

    await StudentModel.create({ nis, nama, username, email, password_hash: await hashPassword(password) });

    // Langsung masuk setelah mendaftar
    await startSession(res, { accountType: 'student', accountId: nis });
    await StudentModel.touchLogin(nis);
    const account = await StudentModel.findByNis(nis);

    res.status(201).json({
      success: true,
      message: 'Akun berhasil dibuat.',
      data: toProfile({ ...account, role: 'siswa' })
    });
  } catch (err) {
    const message = duplicateMessage(err);
    if (message) return res.status(409).json({ success: false, message });
    next(err);
  }
};

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { role, identifier, password } = req.body;
    const key = throttleKey(req, identifier);

    const locked = remainingLockMs(key);
    if (locked > 0) {
      const minutes = Math.ceil(locked / 60000);
      return res.status(429).json({
        success: false,
        message: `Terlalu banyak percobaan masuk. Coba lagi dalam ${minutes} menit.`
      });
    }

    // Peran yang dipilih di kartu menentukan tabel yang diperiksa
    let account = null;
    if (role === 'siswa') {
      account = await StudentModel.findByLogin(identifier);
    } else {
      const staff = await StaffModel.findByLogin(identifier);
      account = staff && staff.role === role ? staff : null;
    }

    const valid = account
      ? await verifyPassword(password, account.password_hash)
      : (await verifyPassword(password, await getDummyHash()), false);

    if (!valid) {
      recordFailure(key);
      return res.status(401).json({
        success: false,
        message: 'Username/email atau kata sandi salah, atau peran yang dipilih tidak sesuai.'
      });
    }

    failures.delete(key);

    if (role === 'siswa') {
      await startSession(res, { accountType: 'student', accountId: account.nis });
      await StudentModel.touchLogin(account.nis);
      return res.json({ success: true, message: 'Berhasil masuk.', data: toProfile({ ...account, role: 'siswa' }) });
    }

    await startSession(res, { accountType: 'staff', accountId: account.id });
    await StaffModel.touchLogin(account.id);
    res.json({ success: true, message: 'Berhasil masuk.', data: toProfile(account) });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/logout
const logout = async (req, res, next) => {
  try {
    const token = getToken(req);
    if (token) await SessionModel.remove(sha256(token));
    clearSessionCookie(res);
    res.json({ success: true, message: 'Anda telah keluar.' });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me  (requireAuth sudah mengisi req.auth)
const me = (req, res) => {
  res.json({ success: true, data: toProfile(req.auth) });
};

module.exports = { register, login, logout, me, studentConflict, duplicateMessage };
