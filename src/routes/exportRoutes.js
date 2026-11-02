const express = require('express');
const controller = require('../controllers/exportController');

const router = express.Router();

// Dijaga di routes/index.js: Petugas UKS dan Administrator
router.get('/:jenis', controller.download);

module.exports = router;
