// CONTROLLER peminjaman barang: CRUD umum + tombol "Tandai kembali"
const createCrudController = require('./crudFactory');
const PinjamModel = require('../models/pinjamModel');

const controller = createCrudController(PinjamModel, 'Catatan peminjaman');

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// POST /api/peminjaman/:id/kembali
controller.markReturned = async (req, res, next) => {
  try {
    const row = await PinjamModel.findById(req.recordId);
    if (!row) return res.status(404).json({ success: false, message: 'Catatan peminjaman tidak ditemukan.' });

    const tanggal = req.body.tanggal_kembali || today();
    if (tanggal < row.tanggal_pinjam) {
      return res.status(400).json({ success: false, message: 'Tanggal kembali tidak boleh sebelum tanggal peminjaman.' });
    }

    await PinjamModel.markReturned(req.recordId, tanggal);
    res.json({ success: true, message: 'Barang ditandai sudah kembali.', data: await PinjamModel.findById(req.recordId) });
  } catch (err) {
    next(err);
  }
};

module.exports = controller;
