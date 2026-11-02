const crudRoutes = require('./crudRoutes');
const controller = require('../controllers/patientController');
const { validatePatient } = require('../middlewares/validators');

// /api/patients  dan  /api/patients/:id
module.exports = crudRoutes(controller, validatePatient);
