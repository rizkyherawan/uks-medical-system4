// ============================================================
// Validasi di sisi server untuk data pasien sakit.
// Validasi di browser hanya kenyamanan, yang menjadi penjaga sebenarnya adalah file ini.
// ============================================================
const { clean, normalizeKelas, sentenceCase, isValidDate } = require('../utils/text');
const { NIS_PATTERN } = require('./validateAuth');

function validatePatient(req, res, next) {
  const body = req.body || {};

  const data = {
    nama_pasien: clean(body.nama_pasien),
    nis: String(body.nis ?? '').trim(),
    kelas: normalizeKelas(body.kelas),
    tanggal_sakit: String(body.tanggal_sakit ?? '').trim(),
    keluhan: sentenceCase(body.keluhan)
  };

  const errors = [];

  if (!data.nama_pasien) errors.push('Nama pasien wajib diisi.');
  else if (data.nama_pasien.length > 100) errors.push('Nama pasien maksimal 100 karakter.');

  if (!data.nis) errors.push('NIS wajib diisi.');
  else if (!NIS_PATTERN.test(data.nis)) errors.push('NIS harus 5 digit angka.');

  if (!data.kelas) errors.push('Kelas wajib diisi.');
  else if (data.kelas.length > 30) errors.push('Kelas maksimal 30 karakter.');

  if (!data.tanggal_sakit) errors.push('Tanggal sakit wajib diisi.');
  else if (!isValidDate(data.tanggal_sakit)) errors.push('Tanggal sakit tidak valid.');

  if (!data.keluhan) errors.push('Sakit/keluhan wajib diisi.');
  else if (data.keluhan.length > 500) errors.push('Sakit/keluhan maksimal 500 karakter.');

  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: errors[0], errors });
  }

  req.body = data; // data yang sudah dibersihkan dipakai controller
  next();
}

// Dipakai semua rute /:id (pasien, obat keluar, peminjaman, konten)
function validateId(req, res, next) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'ID data tidak valid.' });
  }

  req.recordId = id;
  next();
}

module.exports = { validatePatient, validateId };
