// ============================================================
// CONTROLLER kelola akun (hanya Administrator)
// Administrator memegang seluruh akun: membuat, melihat, mengubah, dan menghapus
// akun Administrator, Petugas UKS, dan Siswa. Semua data dibaca langsung dari database server.
// ============================================================
const { pool } = require('../config/db');
const StaffModel = require('../models/staffModel');
const StudentModel = require('../models/studentModel');
const SessionModel = require('../models/sessionModel');
const { hashPassword } = require('../utils/password');
const { studentConflict } = require('./authController');

const ROLE_LABEL = { administrator: 'Administrator', petugas: 'Petugas UKS' };

// Memeriksa username dan email akun staf. excludeId = akun yang sedang diubah.
async function staffConflict({ username, email }, excludeId = null) {
  const sameUsername = await StaffModel.findByUsername(username);
  if (sameUsername && sameUsername.id !== excludeId) return 'Username ini sudah dipakai akun lain.';
  if (email) {
    const sameEmail = await StaffModel.findByEmail(email);
    if (sameEmail && sameEmail.id !== excludeId) return 'Email ini sudah dipakai akun lain.';
  }
  return null;
}

const duplicate = (res) => res.status(409).json({ success: false, message: 'Username atau email ini sudah dipakai akun lain.' });

// GET /api/accounts/overview : ringkasan akun + status koneksi database
const overview = async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    const [administrator, petugas, siswa] = await Promise.all([
      StaffModel.countByRole('administrator'),
      StaffModel.countByRole('petugas'),
      StudentModel.count()
    ]);
    res.json({
      success: true,
      data: { administrator, petugas, siswa, total: administrator + petugas + siswa, database: 'terhubung', waktu: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/accounts/staff
const listStaff = async (req, res, next) => {
  try {
    const data = await StaffModel.list();
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    next(err);
  }
};

// POST /api/accounts/staff
const createStaff = async (req, res, next) => {
  try {
    const { nama, username, email, password, role } = req.body;

    const conflict = await staffConflict({ username, email });
    if (conflict) return res.status(409).json({ success: false, message: conflict });

    const id = await StaffModel.create({ nama, username, email, role, password_hash: await hashPassword(password) });
    res.status(201).json({
      success: true,
      message: `Akun ${ROLE_LABEL[role]} berhasil dibuat.`,
      data: await StaffModel.findById(id)
    });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') return duplicate(res);
    next(err);
  }
};

// PUT /api/accounts/staff/:id
const updateStaff = async (req, res, next) => {
  try {
    const { nama, username, email, password } = req.body;
    if (!(await StaffModel.findById(req.accountId))) {
      return res.status(404).json({ success: false, message: 'Akun tidak ditemukan.' });
    }

    const conflict = await staffConflict({ username, email }, req.accountId);
    if (conflict) return res.status(409).json({ success: false, message: conflict });

    await StaffModel.update(req.accountId, {
      nama,
      username,
      email,
      password_hash: password ? await hashPassword(password) : null
    });
    // Kata sandi diganti: semua sesi lama akun itu dicabut kecuali sesi yang sedang dipakai
    if (password && !(req.auth.type === 'staff' && req.auth.id === req.accountId)) {
      await SessionModel.removeForAccount('staff', req.accountId);
    }

    res.json({ success: true, message: 'Perubahan akun disimpan.', data: await StaffModel.findById(req.accountId) });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') return duplicate(res);
    next(err);
  }
};

// DELETE /api/accounts/staff/:id
const deleteStaff = async (req, res, next) => {
  try {
    // Administrator tidak boleh menghapus akunnya sendiri, sehingga sistem
    // selalu memiliki minimal satu administrator.
    if (req.auth.type === 'staff' && req.auth.id === req.accountId) {
      return res.status(400).json({
        success: false,
        message: 'Akun yang sedang Anda gunakan tidak dapat dihapus.'
      });
    }

    const affected = await StaffModel.remove(req.accountId);
    if (!affected) {
      return res.status(404).json({ success: false, message: 'Akun tidak ditemukan.' });
    }

    await SessionModel.removeForAccount('staff', req.accountId);
    res.json({ success: true, message: 'Akun berhasil dihapus.' });
  } catch (err) {
    next(err);
  }
};

// GET /api/accounts/students
const listStudents = async (req, res, next) => {
  try {
    const data = await StudentModel.list();
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    next(err);
  }
};

// POST /api/accounts/students : Administrator mendaftarkan akun Siswa
const createStudent = async (req, res, next) => {
  try {
    const { nama, nis, username, email, password } = req.body;

    const conflict = await studentConflict({ nis, username, email });
    if (conflict) return res.status(409).json({ success: false, message: conflict });

    await StudentModel.create({ nis, nama, username, email, password_hash: await hashPassword(password) });
    res.status(201).json({ success: true, message: 'Akun Siswa berhasil dibuat.', data: await StudentModel.findByNis(nis) });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') return duplicate(res);
    next(err);
  }
};

// PUT /api/accounts/students/:nis
const updateStudent = async (req, res, next) => {
  try {
    const { nama, username, email, password } = req.body;
    if (!(await StudentModel.findByNis(req.accountNis))) {
      return res.status(404).json({ success: false, message: 'Akun Siswa tidak ditemukan.' });
    }

    if (username) {
      const same = await StudentModel.findByUsername(username);
      if (same && same.nis !== req.accountNis) return res.status(409).json({ success: false, message: 'Username ini sudah dipakai akun lain.' });
    }
    if (email) {
      const same = await StudentModel.findByEmail(email);
      if (same && same.nis !== req.accountNis) return res.status(409).json({ success: false, message: 'Email ini sudah dipakai akun lain.' });
    }

    await StudentModel.update(req.accountNis, {
      nama,
      username,
      email,
      password_hash: password ? await hashPassword(password) : null
    });
    if (password) await SessionModel.removeForAccount('student', req.accountNis);

    res.json({ success: true, message: 'Perubahan akun disimpan.', data: await StudentModel.findByNis(req.accountNis) });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') return duplicate(res);
    next(err);
  }
};

// DELETE /api/accounts/students/:nis
const deleteStudent = async (req, res, next) => {
  try {
    const affected = await StudentModel.remove(req.accountNis);
    if (!affected) {
      return res.status(404).json({ success: false, message: 'Akun Siswa tidak ditemukan.' });
    }

    await SessionModel.removeForAccount('student', req.accountNis);
    res.json({ success: true, message: 'Akun Siswa berhasil dihapus.' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  overview,
  listStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  listStudents,
  createStudent,
  updateStudent,
  deleteStudent
};
