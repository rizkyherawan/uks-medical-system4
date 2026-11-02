// MODEL pasien sakit (query dasar ada di crudModel.js)
const { createModel, D } = require('./crudModel');

module.exports = createModel({
  table: 'patients',
  select: `id, nama_pasien, nis, kelas, ${D('tanggal_sakit')}, keluhan, created_at, updated_at`,
  fields: ['nama_pasien', 'nis', 'kelas', 'tanggal_sakit', 'keluhan'],
  searchColumns: ['nama_pasien', 'nis', 'kelas', 'keluhan'],
  dateColumn: 'tanggal_sakit',
  orderBy: 'tanggal_sakit DESC, id DESC'
});
