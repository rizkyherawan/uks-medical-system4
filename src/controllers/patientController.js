// CONTROLLER pasien sakit (logika umum ada di crudFactory.js)
const createCrudController = require('./crudFactory');
const PatientModel = require('../models/patientModel');

module.exports = createCrudController(PatientModel, 'Data pasien');
