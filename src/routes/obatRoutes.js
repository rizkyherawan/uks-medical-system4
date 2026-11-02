const crudRoutes = require('./crudRoutes');
const controller = require('../controllers/obatController');
const { validateObat } = require('../middlewares/validateFitur');

// /api/obat-keluar  dan  /api/obat-keluar/:id
module.exports = crudRoutes(controller, validateObat);
