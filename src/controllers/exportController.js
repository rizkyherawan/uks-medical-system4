// ============================================================
// CONTROLLER unduhan Excel (Administrator dan Petugas UKS)
//   GET /api/export/:jenis?bulan=2026-10   atau   ?semua=1
//   jenis: pasien | obat-keluar | peminjaman | tekanan-darah
// ============================================================
const PatientModel = require('../models/patientModel');
const ObatModel = require('../models/obatModel');
const PinjamModel = require('../models/pinjamModel');
const BloodPressureModel = require('../models/bloodPressureModel');
const exportService = require('../services/exportService');
const { resolvePeriod, previousPeriod } = require('../utils/period');

// Nama file otomatis, contoh: "Rekap Data Siswa Sakit Bulan November 2026.xlsx"
const REPORTS = {
  pasien: { model: PatientModel, build: exportService.pasien, file: 'Rekap Data Siswa Sakit' },
  'obat-keluar': { model: ObatModel, build: exportService.obat, file: 'Rekap Data Obat Keluar' },
  peminjaman: { model: PinjamModel, build: exportService.peminjaman, file: 'Rekap Data Peminjaman Barang' },
  'tekanan-darah': { model: BloodPressureModel, build: exportService.tekananDarah, file: 'Rekap Data Tekanan Darah' }
};

const download = async (req, res, next) => {
  try {
    const report = REPORTS[req.params.jenis];
    if (!report) {
      return res.status(404).json({ success: false, message: 'Jenis laporan tidak dikenal.' });
    }

    const period = resolvePeriod(req.query);
    const rows = await report.model.findRange({ from: period.from, to: period.to });
    // Urutan di Excel: tanggal terlama di atas (urutan kronologis)
    const ordered = [...rows].reverse();

    // Bulan sebelumnya dipakai untuk perbandingan di sheet Ringkasan
    const before = previousPeriod(period);
    const previous = before
      ? { label: before.label, count: (await report.model.findRange({ from: before.from, to: before.to })).length }
      : null;

    const buffer = report.build({ rows: ordered, period, previous, user: { nama: req.auth.nama } });
    const fileName = `${report.file} ${period.filePart}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
};

module.exports = { download };
