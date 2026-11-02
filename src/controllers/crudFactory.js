// ============================================================
// PABRIK CONTROLLER (daftar, tambah, ubah, hapus)
// Pola yang sama dipakai oleh data pasien, obat keluar, dan peminjaman barang.
// Format response seragam: { success, message?, data?, count? }
// ============================================================
module.exports = function createCrudController(Model, label) {
  const notFound = (res) => res.status(404).json({ success: false, message: `${label} tidak ditemukan.` });

  return {
    // GET ?search=kata
    list: async (req, res, next) => {
      try {
        const search = String(req.query.search || '').trim();
        const data = await Model.findAll({ search });
        res.json({ success: true, count: data.length, data });
      } catch (err) {
        next(err);
      }
    },

    getOne: async (req, res, next) => {
      try {
        const row = await Model.findById(req.recordId);
        if (!row) return notFound(res);
        res.json({ success: true, data: row });
      } catch (err) {
        next(err);
      }
    },

    create: async (req, res, next) => {
      try {
        const id = await Model.create(req.body);
        const row = await Model.findById(id);
        res.status(201).json({ success: true, message: 'Catatan disimpan.', data: row });
      } catch (err) {
        next(err);
      }
    },

    update: async (req, res, next) => {
      try {
        const affected = await Model.update(req.recordId, req.body);
        if (!affected) return notFound(res);
        const row = await Model.findById(req.recordId);
        res.json({ success: true, message: 'Perubahan disimpan.', data: row });
      } catch (err) {
        next(err);
      }
    },

    remove: async (req, res, next) => {
      try {
        const affected = await Model.remove(req.recordId);
        if (!affected) return notFound(res);
        res.json({ success: true, message: 'Catatan dihapus.' });
      } catch (err) {
        next(err);
      }
    }
  };
};
