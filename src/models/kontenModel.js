// MODEL konten beranda (kegiatan PMR dan lomba)
const { createModel, D } = require('./crudModel');

const model = createModel({
  table: 'konten_situs',
  select: `id, jenis, judul, ${D('tanggal')}, deskripsi, juara, gambar, gambar_preview, created_at, updated_at`,
  fields: ['jenis', 'judul', 'tanggal', 'deskripsi', 'juara', 'gambar', 'gambar_preview'],
  searchColumns: ['judul', 'deskripsi'],
  orderBy: 'tanggal DESC, id DESC'
});

model.findByJenis = (jenis) => model.findAll({ where: 'jenis = ?', params: [jenis] });

module.exports = model;
