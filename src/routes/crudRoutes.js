// Pembuat rute CRUD standar: GET/POST di "/" dan GET/PUT/DELETE di "/:id".
const express = require('express');
const { validateId } = require('../middlewares/validators');

module.exports = function crudRoutes(controller, validateBody) {
  const router = express.Router();
  router.route('/').get(controller.list).post(validateBody, controller.create);
  router
    .route('/:id')
    .get(validateId, controller.getOne)
    .put(validateId, validateBody, controller.update)
    .delete(validateId, controller.remove);
  return router;
};
