const express = require('express');
const { pool } = require('../config/db');
const { requireAuth, requireRole } = require('../middlewares/auth');

const router = express.Router();

// ------------------------------------------------------------
// Peta hak akses
//   /api/health          : terbuka untuk umum
//   /api/auth/*          : daftar, masuk, keluar (me butuh login)
//   /api/konten          : daftar terbuka untuk umum; ubah hanya Administrator
//   /api/patients        : Petugas UKS dan Administrator  (pasien sakit)
//   /api/blood-pressure  : Petugas UKS dan Administrator
//   /api/obat-keluar     : Petugas UKS dan Administrator
//   /api/peminjaman      : Petugas UKS dan Administrator
//   /api/export          : Petugas UKS dan Administrator  (unduh Excel)
//   /api/accounts        : Administrator saja
//   /api/me              : Siswa saja (data milik siswa itu sendiri)
// Penjagaan dipasang SEBELUM router tiap fitur, sehingga permintaan
// tanpa izin ditolak lebih dulu dan tidak pernah sampai ke controller.
// ------------------------------------------------------------
const staffOnly = [requireAuth, requireRole('petugas', 'administrator')];

// Cek cepat apakah server dan database hidup: http://localhost:3000/api/health
router.get('/health', async (req, res) => {
  let database = 'terhubung';
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    database = 'terputus';
  }
  res.json({ status: database === 'terhubung' ? 'ok' : 'error', database, time: new Date().toISOString() });
});

router.use('/auth', require('./authRoutes'));

router.use('/patients', ...staffOnly, require('./patientRoutes'));
router.use('/blood-pressure', ...staffOnly, require('./bloodPressureRoutes'));
router.use('/obat-keluar', ...staffOnly, require('./obatRoutes'));
router.use('/peminjaman', ...staffOnly, require('./pinjamRoutes'));
router.use('/export', ...staffOnly, require('./exportRoutes'));
router.use('/accounts', requireAuth, requireRole('administrator'), require('./accountRoutes'));
router.use('/me', requireAuth, requireRole('siswa'), require('./meRoutes'));

module.exports = router;
