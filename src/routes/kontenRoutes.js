const express = require('express');
const controller = require('../controllers/kontenController');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { validateKonten } = require('../middlewares/validateFitur');
const { validateId } = require('../middlewares/validators');

const router = express.Router();

// Daftar konten terbuka untuk umum (dipakai halaman beranda)
router.get('/', controller.list);

// Selebihnya hanya Administrator. Parser JSON besar (foto) dipasang SETELAH cek login,
// supaya pengunjung biasa tidak bisa memaksa server menampung kiriman berukuran besar.
router.use(requireAuth, requireRole('administrator'), express.json({ limit: '14mb' }));
router.post('/', validateKonten, controller.create);
router.route('/:id').put(validateId, validateKonten, controller.update).delete(validateId, controller.remove);

module.exports = router;
