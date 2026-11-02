const path = require('path');
const express = require('express');

const routes = require('./routes');
const kontenRoutes = require('./routes/kontenRoutes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const { securityHeaders, sameOriginGuard, rateLimit } = require('./middlewares/security');
const { uploadRoot } = require('./utils/imageStore');

const app = express();

app.disable('x-powered-by');

// Di belakang reverse proxy (Nginx, Caddy, Cloudflare, hosting) isi TRUST_PROXY di .env
// (angka = jumlah proxy, mis. 1) agar alamat IP pengunjung dan status HTTPS terbaca benar.
// Tanpa ini, pembatas percobaan login melihat SEMUA pengunjung sebagai satu IP milik proxy.
if (process.env.TRUST_PROXY) {
  const value = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(value) ? Number(value) : value === 'true' ? 1 : value);
}

// ------------------------------------------------------------
// KONEKSI BACKEND <-> FRONTEND
// Folder /public (HTML, CSS, JS) disajikan langsung oleh Express, jadi frontend dan API
// berada di SATU alamat (mis. http://localhost:3000). Karena sama-sama satu asal (origin),
// CORS tidak diperlukan dan sengaja TIDAK diaktifkan: situs lain tidak boleh memanggil API ini.
// ------------------------------------------------------------
app.use(securityHeaders);

// Foto unggahan. Nama file unik dan tidak pernah berubah isinya, jadi aman di-cache lama.
app.use('/uploads', express.static(path.join(uploadRoot(), 'uploads'), { maxAge: '30d', immutable: true, index: false, dotfiles: 'deny' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html', dotfiles: 'deny' }));

// Semua endpoint API diawali /api
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: Number(process.env.API_RATE_MAX) || 600, keyPrefix: 'api' }));
app.use('/api', sameOriginGuard);

// Konten beranda memakai parser JSON besar miliknya sendiri (foto dikirim sebagai data URL),
// dan itu hanya dibuka SETELAH pengguna terbukti Administrator. Selain itu batas bodi hanya 100 KB.
app.use('/api/konten', kontenRoutes);
app.use('/api', express.json({ limit: '100kb' }));
app.use('/api', routes);
app.use('/api', notFound);

app.use(errorHandler);

module.exports = app;
