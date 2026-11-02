// ============================================================
// CONTROLLER konten beranda (Kegiatan PMR dan Lomba)
//  - GET (daftar) terbuka untuk umum: dipakai halaman beranda.
//  - Tambah, ubah, hapus hanya untuk Administrator (dijaga di routes/kontenRoutes.js).
//
// Setiap konten punya DUA gambar:
//   gambar         : foto asli, tampil penuh dan berwarna saat kartu diklik.
//   gambar_preview : hasil crop (dan gaya siluet merah-putih bila dipilih) untuk kartu
//                    di beranda. Dibuat di browser Administrator, lalu dikirim bersama foto asli.
// Keduanya dikirim browser sebagai data URL dan disimpan sebagai file di public/uploads/konten/.
// ============================================================
const KontenModel = require('../models/kontenModel');
const { saveImage, removeImage } = require('../utils/imageStore');

const notFound = (res) => res.status(404).json({ success: false, message: 'Konten tidak ditemukan.' });
const badRequest = (res, message) => res.status(400).json({ success: false, message, errors: [message] });

// GET /api/konten?jenis=kegiatan|lomba
const list = async (req, res, next) => {
  try {
    const jenis = String(req.query.jenis || '');
    const data = ['kegiatan', 'lomba'].includes(jenis) ? await KontenModel.findByJenis(jenis) : await KontenModel.findAll();
    // Perubahan Administrator harus langsung terlihat di beranda, jadi jangan disimpan di cache browser
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    next(err);
  }
};

// POST /api/konten
const create = async (req, res, next) => {
  const saved = [];
  try {
    const { gambarData, previewData, hapusGambar, ...fields } = req.body;
    if (!gambarData) return badRequest(res, 'Gambar wajib dipilih.');

    const gambar = await saveImage(gambarData);
    saved.push(gambar);
    let gambarPreview = null;
    if (previewData) {
      gambarPreview = await saveImage(previewData);
      saved.push(gambarPreview);
    }

    const id = await KontenModel.create({ ...fields, gambar, gambar_preview: gambarPreview });
    res.status(201).json({ success: true, message: 'Konten disimpan dan langsung tampil di beranda.', data: await KontenModel.findById(id) });
  } catch (err) {
    await Promise.all(saved.map(removeImage)); // gagal di tengah jalan: jangan tinggalkan file yatim
    next(err);
  }
};

// PUT /api/konten/:id
const update = async (req, res, next) => {
  const saved = [];
  try {
    const current = await KontenModel.findById(req.recordId);
    if (!current) return notFound(res);

    const { gambarData, previewData, hapusGambar, ...fields } = req.body;
    let { gambar, gambar_preview: gambarPreview } = current;

    if (hapusGambar && !gambarData && current.gambar) {
      return badRequest(res, 'Gambar tidak boleh dikosongkan. Pilih gambar pengganti.');
    }
    if (!gambarData && previewData && !current.gambar) {
      return badRequest(res, 'Gambar pratinjau memerlukan gambar utama.');
    }

    if (gambarData) {
      gambar = await saveImage(gambarData);
      saved.push(gambar);
      gambarPreview = null; // pratinjau lama dibuat dari foto lama, jadi tidak berlaku lagi
    }
    if (previewData) {
      gambarPreview = await saveImage(previewData);
      saved.push(gambarPreview);
    }

    await KontenModel.update(req.recordId, { ...fields, gambar, gambar_preview: gambarPreview });

    // File lama yang sudah tidak dipakai dihapus setelah database berhasil diperbarui
    if (gambar !== current.gambar) await removeImage(current.gambar);
    if (gambarPreview !== current.gambar_preview) await removeImage(current.gambar_preview);

    res.json({ success: true, message: 'Perubahan disimpan.', data: await KontenModel.findById(req.recordId) });
  } catch (err) {
    await Promise.all(saved.map(removeImage));
    next(err);
  }
};

// DELETE /api/konten/:id
const remove = async (req, res, next) => {
  try {
    const current = await KontenModel.findById(req.recordId);
    if (!current) return notFound(res);

    await KontenModel.remove(req.recordId);
    await removeImage(current.gambar);
    await removeImage(current.gambar_preview);
    res.json({ success: true, message: 'Konten dihapus.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, update, remove };
