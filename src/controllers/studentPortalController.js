// ============================================================
// CONTROLLER portal siswa
// Siswa hanya bisa melihat pengukuran dengan NIS yang SAMA dengan NIS
// akunnya. NIS diambil dari sesi login (req.auth), BUKAN dari permintaan
// browser, sehingga siswa tidak bisa melihat data siswa lain.
// ============================================================
const BloodPressureModel = require('../models/bloodPressureModel');
const { classify, getCategory } = require('../utils/bloodPressure');

function categoryInfo(kode) {
  const c = getCategory(kode);
  return c
    ? { kode: c.kode, nama: c.nama, singkat: c.singkat, rentang: c.rentang, catatan: c.catatan }
    : { kode, nama: kode, singkat: kode, rentang: '', catatan: '' };
}

// GET /api/me/blood-pressure
const myBloodPressure = async (req, res, next) => {
  try {
    const rows = await BloodPressureModel.findByNis(req.auth.nis); // terbaru lebih dulu

    // Tiga slot (pengukuran ke-1, ke-2, ke-3). Kalau satu slot punya lebih dari
    // satu data, yang dipakai adalah yang terbaru.
    const pengukuran = [null, null, null];
    for (const row of rows) {
      const slot = row.pengukuran_ke - 1;
      if (!pengukuran[slot]) {
        pengukuran[slot] = {
          id: row.id,
          pengukuran_ke: row.pengukuran_ke,
          sistolik: row.sistolik,
          diastolik: row.diastolik,
          kategori: categoryInfo(row.kategori),
          dicatat: row.created_at
        };
      }
    }

    const taken = pengukuran.filter(Boolean);
    let ringkasan = null;

    if (taken.length > 0) {
      const sistolik = Math.round(taken.reduce((total, p) => total + p.sistolik, 0) / taken.length);
      const diastolik = Math.round(taken.reduce((total, p) => total + p.diastolik, 0) / taken.length);
      ringkasan = {
        sistolik,
        diastolik,
        jumlah: taken.length,
        lengkap: taken.length === 3,
        kategori: categoryInfo(classify(sistolik, diastolik).kode)
      };
    }

    res.json({
      success: true,
      data: { nis: req.auth.nis, nama: req.auth.nama, pengukuran, ringkasan }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { myBloodPressure };
