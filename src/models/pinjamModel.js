// MODEL peminjaman barang
const { pool } = require('../config/db');
const { createModel, D } = require('./crudModel');

const model = createModel({
  table: 'peminjaman_barang',
  select: `id, ${D('tanggal_pinjam')}, nama, kelas, jenis_barang, ${D('tanggal_kembali')}, keterangan, created_at, updated_at`,
  fields: ['tanggal_pinjam', 'nama', 'kelas', 'jenis_barang', 'tanggal_kembali', 'keterangan'],
  searchColumns: ['nama', 'kelas', 'jenis_barang', 'keterangan'],
  dateColumn: 'tanggal_pinjam',
  orderBy: 'tanggal_pinjam DESC, id DESC'
});

// Menandai barang sudah dikembalikan pada tanggal tertentu (tombol "Tandai kembali")
model.markReturned = async (id, tanggal) => {
  const [result] = await pool.execute('UPDATE peminjaman_barang SET tanggal_kembali = ? WHERE id = ?', [tanggal, id]);
  return result.affectedRows;
};

module.exports = model;
