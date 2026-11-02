// ============================================================
// PEMBARUAN STRUKTUR DATABASE OTOMATIS (migrasi ringan)
// Dipanggil server setiap kali menyala. Untuk database lama yang dibuat dari versi
// sebelumnya, menambahkan kolom yang baru dibutuhkan. Aman dijalankan berulang kali.
//
//   konten_situs.gambar_preview : gambar pratinjau (crop / siluet) untuk kartu di beranda
// ============================================================
const { pool } = require('../config/db');

async function hasColumn(table, column) {
  const [rows] = await pool.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

// Mengembalikan daftar perubahan yang dilakukan (kosong bila struktur sudah terbaru)
async function ensureSchema() {
  const changes = [];
  if (!(await hasColumn('konten_situs', 'gambar_preview'))) {
    await pool.query('ALTER TABLE konten_situs ADD COLUMN gambar_preview VARCHAR(255) NULL AFTER gambar');
    changes.push('kolom konten_situs.gambar_preview ditambahkan');
  }
  return changes;
}

module.exports = { ensureSchema, hasColumn };
