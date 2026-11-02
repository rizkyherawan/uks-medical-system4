const crudRoutes = require('./crudRoutes');
const controller = require('../controllers/pinjamController');
const { validatePinjam, validateKembali } = require('../middlewares/validateFitur');
const { validateId } = require('../middlewares/validators');

// /api/peminjaman  dan  /api/peminjaman/:id
const router = crudRoutes(controller, validatePinjam);

// /api/peminjaman/:id/kembali : tombol "Tandai kembali"
router.post('/:id/kembali', validateId, validateKembali, controller.markReturned);

module.exports = router;
