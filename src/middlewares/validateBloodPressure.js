// ============================================================
// Validasi untuk fitur tekanan darah.
// ============================================================
const { checkValues } = require('../utils/bloodPressure');

const { clean, normalizeKelas } = require('../utils/text');
const { NIS_PATTERN } = require('./validateAuth');

// Mengubah "120", 120, " 120 " menjadi angka 120. Selain itu menjadi NaN.
function toInteger(value) {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) ? Number(text) : NaN;
}

function validateReading(req, res, next) {
  const body = req.body || {};

  const data = {
    nama_siswa: clean(body.nama_siswa),
    nis: String(body.nis ?? '').trim(),
    kelas: normalizeKelas(body.kelas),
    pengukuran_ke: toInteger(body.pengukuran_ke),
    sistolik: toInteger(body.sistolik),
    diastolik: toInteger(body.diastolik)
  };

  const errors = [];

  if (!data.nama_siswa) errors.push('Nama siswa wajib diisi.');
  else if (data.nama_siswa.length > 100) errors.push('Nama siswa maksimal 100 karakter.');

  if (!data.nis) errors.push('NIS wajib diisi.');
  else if (!NIS_PATTERN.test(data.nis)) errors.push('NIS harus 5 digit angka.');

  if (!data.kelas) errors.push('Kelas wajib diisi.');
  else if (data.kelas.length > 30) errors.push('Kelas maksimal 30 karakter.');

  if (![1, 2, 3].includes(data.pengukuran_ke)) {
    errors.push('Pengukuran ke- harus 1, 2, atau 3.');
  }

  errors.push(...checkValues(data.sistolik, data.diastolik));

  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: errors[0], errors });
  }

  req.body = data;
  next();
}

// GET /classify?sistolik=100&diastolik=70
function validateClassifyQuery(req, res, next) {
  const sistolik = toInteger(req.query.sistolik);
  const diastolik = toInteger(req.query.diastolik);
  const errors = checkValues(sistolik, diastolik);

  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: errors[0], errors });
  }

  req.bp = { sistolik, diastolik };
  next();
}

function validateReadingId(req, res, next) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'ID pengukuran tidak valid.' });
  }

  req.readingId = id;
  next();
}

module.exports = { validateReading, validateClassifyQuery, validateReadingId };
