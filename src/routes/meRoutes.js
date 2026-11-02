const express = require('express');
const controller = require('../controllers/studentPortalController');

const router = express.Router();

// Seluruh rute di file ini hanya untuk Siswa (penjagaan di routes/index.js).
// Data yang dikembalikan selalu milik siswa yang sedang masuk.
router.get('/blood-pressure', controller.myBloodPressure);

module.exports = router;
