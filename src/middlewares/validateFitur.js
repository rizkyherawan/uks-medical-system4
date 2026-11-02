// ============================================================
// Validasi untuk fitur Obat keluar, Peminjaman barang, dan Konten beranda.
// ============================================================
const { clean, normalizeKelas, sentenceCase, isValidDate } = require('../utils/text');

function reject(res, errors) {
  return res.status(400).json({ success: false, message: errors[0], errors });
}

const optional = (value, max, label, errors) => {
  const text = clean(value);
  if (text.length > max) errors.push(`${label} maksimal ${max} karakter.`);
  return text || null;
};

// POST/PUT /api/obat-keluar
function validateObat(req, res, next) {
  const body = req.body || {};
  const errors = [];

  const data = {
    tanggal: String(body.tanggal ?? '').trim(),
    nama: clean(body.nama),
    kelas: normalizeKelas(body.kelas),
    obat: sentenceCase(body.obat),
    jumlah: body.jumlah === undefined || body.jumlah === '' ? 1 : Number(body.jumlah),
    keterangan: optional(body.keterangan, 255, 'Keterangan', errors)
  };

  if (!data.tanggal) errors.push('Tanggal wajib diisi.');
  else if (!isValidDate(data.tanggal)) errors.push('Tanggal tidak valid.');

  if (!data.nama) errors.push('Nama wajib diisi.');
  else if (data.nama.length > 100) errors.push('Nama maksimal 100 karakter.');

  if (!data.kelas) errors.push('Kelas wajib diisi.');
  else if (data.kelas.length > 30) errors.push('Kelas maksimal 30 karakter.');

  if (!data.obat) errors.push('Obat wajib diisi.');
  else if (data.obat.length > 100) errors.push('Nama obat maksimal 100 karakter.');

  if (!Number.isInteger(data.jumlah) || data.jumlah < 1 || data.jumlah > 999) {
    errors.push('Jumlah harus bilangan bulat 1 sampai 999.');
  }

  if (errors.length > 0) return reject(res, errors);
  req.body = data;
  next();
}

// POST/PUT /api/peminjaman
function validatePinjam(req, res, next) {
  const body = req.body || {};
  const errors = [];

  const data = {
    tanggal_pinjam: String(body.tanggal_pinjam ?? '').trim(),
    nama: clean(body.nama),
    kelas: clean(body.kelas).toUpperCase(),
    jenis_barang: sentenceCase(body.jenis_barang),
    tanggal_kembali: String(body.tanggal_kembali ?? '').trim() || null,
    keterangan: optional(body.keterangan, 255, 'Keterangan', errors)
  };

  if (!data.tanggal_pinjam) errors.push('Tanggal peminjaman wajib diisi.');
  else if (!isValidDate(data.tanggal_pinjam)) errors.push('Tanggal peminjaman tidak valid.');

  if (!data.nama) errors.push('Nama peminjam wajib diisi.');
  else if (data.nama.length > 100) errors.push('Nama peminjam maksimal 100 karakter.');

  if (!data.kelas) errors.push('Kelas atau organisasi wajib diisi.');
  else if (data.kelas.length > 60) errors.push('Kelas/organisasi maksimal 60 karakter.');

  if (!data.jenis_barang) errors.push('Jenis barang wajib diisi.');
  else if (data.jenis_barang.length > 100) errors.push('Jenis barang maksimal 100 karakter.');

  if (data.tanggal_kembali) {
    if (!isValidDate(data.tanggal_kembali)) errors.push('Tanggal kembali tidak valid.');
    else if (data.tanggal_pinjam && data.tanggal_kembali < data.tanggal_pinjam) {
      errors.push('Tanggal kembali tidak boleh sebelum tanggal peminjaman.');
    }
  }

  if (errors.length > 0) return reject(res, errors);
  req.body = data;
  next();
}

// POST /api/peminjaman/:id/kembali  (tanggal boleh kosong = hari ini)
function validateKembali(req, res, next) {
  const tanggal = String((req.body || {}).tanggal_kembali ?? '').trim();
  if (tanggal && !isValidDate(tanggal)) {
    return reject(res, ['Tanggal kembali tidak valid.']);
  }
  req.body = { tanggal_kembali: tanggal || null };
  next();
}

const GAMBAR_PREFIX = /^data:image\/(jpeg|png|webp);base64,/;

// POST/PUT /api/konten
//   gambar       : data URL gambar baru (opsional)
//   hapus_gambar : true untuk membuang gambar lama saat mengubah
function validateKonten(req, res, next) {
  const body = req.body || {};
  const errors = [];

  const data = {
    jenis: String(body.jenis ?? '').trim(),
    judul: clean(body.judul),
    tanggal: String(body.tanggal ?? '').trim() || null,
    deskripsi: String(body.deskripsi ?? '').replace(/\r\n/g, '\n').trim(),
    juara: optional(body.juara, 100, 'Juara/prestasi', errors),
    // gambar = foto asli (tampil penuh), gambar_preview = hasil crop/siluet untuk kartu beranda
    gambarData: typeof body.gambar === 'string' && body.gambar ? body.gambar : null,
    previewData: typeof body.gambar_preview === 'string' && body.gambar_preview ? body.gambar_preview : null,
    hapusGambar: body.hapus_gambar === true || body.hapus_gambar === 'true'
  };

  if (body.gambar && typeof body.gambar !== 'string') errors.push('Data gambar tidak valid.');
  if (body.gambar_preview && typeof body.gambar_preview !== 'string') errors.push('Data gambar pratinjau tidak valid.');

  if (!['kegiatan', 'lomba'].includes(data.jenis)) errors.push('Jenis konten harus Kegiatan atau Lomba.');

  if (!data.judul) errors.push('Judul wajib diisi.');
  else if (data.judul.length > 150) errors.push('Judul maksimal 150 karakter.');

  if (data.tanggal && !isValidDate(data.tanggal)) errors.push('Tanggal tidak valid.');

  if (!data.deskripsi) errors.push('Deskripsi wajib diisi.');
  else if (data.deskripsi.length > 3000) errors.push('Deskripsi maksimal 3000 karakter.');

  if (data.gambarData && !GAMBAR_PREFIX.test(data.gambarData)) {
    errors.push('Gambar utama harus berformat JPG, PNG, atau WEBP.');
  }
  if (data.previewData && !GAMBAR_PREFIX.test(data.previewData)) {
    errors.push('Gambar pratinjau harus berformat JPG, PNG, atau WEBP.');
  }

  if (data.jenis !== 'lomba') data.juara = null;

  if (errors.length > 0) return reject(res, errors);
  req.body = data;
  next();
}

module.exports = { validateObat, validatePinjam, validateKembali, validateKonten };
