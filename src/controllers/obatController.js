// CONTROLLER obat keluar (logika umum ada di crudFactory.js)
const createCrudController = require('./crudFactory');
const ObatModel = require('../models/obatModel');

module.exports = createCrudController(ObatModel, 'Catatan obat keluar');
