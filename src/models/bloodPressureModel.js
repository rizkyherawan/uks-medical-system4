// ============================================================
// MODEL tekanan darah: hanya query SQL, tanpa req/res.
// Kolom "tanggal" diambil dari waktu pencatatan (created_at).
// ============================================================
const { pool } = require('../config/db');

const COLUMNS =
  "id, nama_siswa, nis, kelas, pengukuran_ke, sistolik, diastolik, kategori, DATE_FORMAT(created_at, '%Y-%m-%d') AS tanggal, created_at, updated_at";

const BloodPressureModel = {
  async findAll() {
    const [rows] = await pool.execute(
      `SELECT ${COLUMNS} FROM blood_pressure_readings ORDER BY created_at DESC, id DESC`
    );
    return rows;
  },

  // Data satu periode untuk laporan Excel (from/to = YYYY-MM-DD, null = semua)
  async findRange({ from, to } = {}) {
    if (!from || !to) return this.findAll();
    const [rows] = await pool.execute(
      `SELECT ${COLUMNS} FROM blood_pressure_readings
        WHERE DATE(created_at) BETWEEN ? AND ? ORDER BY created_at DESC, id DESC`,
      [from, to]
    );
    return rows;
  },

  // Semua pengukuran milik satu NIS, terbaru lebih dulu (dipakai halaman tekanan darah siswa)
  async findByNis(nis) {
    const [rows] = await pool.execute(
      `SELECT ${COLUMNS} FROM blood_pressure_readings WHERE nis = ? ORDER BY created_at DESC, id DESC`,
      [nis]
    );
    return rows;
  },

  async findById(id) {
    const [rows] = await pool.execute(`SELECT ${COLUMNS} FROM blood_pressure_readings WHERE id = ?`, [id]);
    return rows[0] || null;
  },

  async create({ nama_siswa, nis, kelas, pengukuran_ke, sistolik, diastolik, kategori }) {
    const [result] = await pool.execute(
      `INSERT INTO blood_pressure_readings
         (nama_siswa, nis, kelas, pengukuran_ke, sistolik, diastolik, kategori)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nama_siswa, nis, kelas, pengukuran_ke, sistolik, diastolik, kategori]
    );
    return result.insertId;
  },

  async update(id, { nama_siswa, nis, kelas, pengukuran_ke, sistolik, diastolik, kategori }) {
    const [result] = await pool.execute(
      `UPDATE blood_pressure_readings
          SET nama_siswa = ?, nis = ?, kelas = ?, pengukuran_ke = ?,
              sistolik = ?, diastolik = ?, kategori = ?
        WHERE id = ?`,
      [nama_siswa, nis, kelas, pengukuran_ke, sistolik, diastolik, kategori, id]
    );
    return result.affectedRows;
  },

  async remove(id) {
    const [result] = await pool.execute('DELETE FROM blood_pressure_readings WHERE id = ?', [id]);
    return result.affectedRows;
  }
};

module.exports = BloodPressureModel;
