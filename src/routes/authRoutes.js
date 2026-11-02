const express = require('express');
const controller = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');
const { validateStudentCreate, validateLogin } = require('../middlewares/validateAuth');

const { rateLimit } = require('../middlewares/security');

const router = express.Router();

// Batas per IP sengaja longgar karena satu sekolah biasanya berbagi satu IP publik (satu kelas
// bisa login bersamaan). Perlindungan tebak-sandi yang sebenarnya ada di controller (per akun).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_MAX) || 200,
  keyPrefix: 'login',
  message: 'Terlalu banyak percobaan masuk dari jaringan ini. Coba lagi beberapa menit lagi.'
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.REGISTER_RATE_MAX) || 80,
  keyPrefix: 'register',
  message: 'Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti.'
});

// Terbuka untuk umum (belum perlu login)
router.post('/register', registerLimiter, validateStudentCreate, controller.register);
router.post('/login', loginLimiter, validateLogin, controller.login);
router.post('/logout', controller.logout);

// Perlu login: dipakai browser untuk mengetahui siapa yang sedang masuk
router.get('/me', requireAuth, controller.me);

module.exports = router;
