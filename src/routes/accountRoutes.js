const express = require('express');
const controller = require('../controllers/accountController');
const {
  validateStaffCreate,
  validateStaffUpdate,
  validateStaffId,
  validateStudentCreate,
  validateStudentUpdate,
  validateStudentNis
} = require('../middlewares/validateAuth');

const router = express.Router();

// Seluruh rute di file ini hanya untuk Administrator.
// Penjagaannya dipasang di routes/index.js (requireAuth + requireRole).

router.get('/overview', controller.overview);

// /api/accounts/staff  (Administrator dan Petugas UKS)
router.route('/staff').get(controller.listStaff).post(validateStaffCreate, controller.createStaff);
router
  .route('/staff/:id')
  .put(validateStaffId, validateStaffUpdate, controller.updateStaff)
  .delete(validateStaffId, controller.deleteStaff);

// /api/accounts/students  (Siswa)
router.route('/students').get(controller.listStudents).post(validateStudentCreate, controller.createStudent);
router
  .route('/students/:nis')
  .put(validateStudentNis, validateStudentUpdate, controller.updateStudent)
  .delete(validateStudentNis, controller.deleteStudent);

module.exports = router;
