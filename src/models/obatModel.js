// MODEL obat keluar
const { createModel, D } = require('./crudModel');

module.exports = createModel({
  table: 'obat_keluar',
  select: `id, ${D('tanggal')}, nama, kelas, obat, jumlah, keterangan, created_at, updated_at`,
  fields: ['tanggal', 'nama', 'kelas', 'obat', 'jumlah', 'keterangan'],
  searchColumns: ['nama', 'kelas', 'obat', 'keterangan'],
  dateColumn: 'tanggal',
  orderBy: 'tanggal DESC, id DESC'
});
