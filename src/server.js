// .env harus dimuat PERTAMA, sebelum db.js membaca process.env
require('dotenv').config();

const app = require('./app');
const { pool, testConnection } = require('./config/db');
const StaffModel = require('./models/staffModel');
const { seedDefaultAccounts, findAccountsWithDefaultPassword } = require('./scripts/seedAccounts');
const { ensureSchema } = require('./scripts/ensureSchema');

const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Kesalahan yang lolos tidak boleh diam-diam menjatuhkan server tanpa jejak
process.on('unhandledRejection', (reason) => {
  console.error('[PERINGATAN] Janji (promise) ditolak tanpa penanganan:', reason);
});

async function start() {
  try {
    await testConnection();
    console.log('[OK] Terhubung ke database MySQL');
  } catch (err) {
    console.error('[GAGAL] Tidak bisa terhubung ke database:', err.message);
    console.error('        Periksa MySQL sudah menyala dan isi file .env sudah benar.');
    process.exit(1);
  }

  // Database lama: tambahkan kolom yang baru dibutuhkan versi ini
  try {
    const changes = await ensureSchema();
    changes.forEach((change) => console.log(`[OK] Struktur database diperbarui: ${change}`));
  } catch (err) {
    console.error('[GAGAL] Struktur database belum sesuai:', err.message);
    console.error('        Impor database/schema.sql (lihat README), lalu jalankan ulang server.');
    process.exit(1);
  }

  try {
    if ((await StaffModel.count()) === 0) {
      if (IS_PRODUCTION) {
        // Akun bawaan memakai kata sandi yang bisa ditebak, jadi TIDAK dibuat di server produksi
        console.warn('[PERHATIAN] Belum ada akun staf. Buat Administrator pertama dengan: npm run buat-admin');
      } else {
        const { dibuat } = await seedDefaultAccounts();
        console.log(`[OK] Akun awal (khusus pengembangan) dibuat: ${dibuat.join(', ')}`);
      }
    }
  } catch (err) {
    console.error('[GAGAL] Tabel akun belum sesuai:', err.message);
    console.error('        Impor database/schema.sql (lihat README), lalu jalankan ulang server.');
    process.exit(1);
  }

  // Pemeriksaan keamanan: kata sandi awal yang belum diganti
  try {
    const weak = await findAccountsWithDefaultPassword();
    if (weak.length > 0) {
      console.warn(`[PERINGATAN KEAMANAN] Akun masih memakai kata sandi awal: ${weak.join(', ')}`);
      console.warn('                      Ganti lewat halaman Kelola akun, atau hapus akunnya.');
      if (IS_PRODUCTION && process.env.ALLOW_DEFAULT_PASSWORDS !== 'true') {
        console.error('[GAGAL] Server produksi menolak berjalan selama kata sandi awal masih dipakai.');
        console.error('        (Hanya untuk uji coba: isi ALLOW_DEFAULT_PASSWORDS=true di .env.)');
        process.exit(1);
      }
    }
  } catch (err) {
    console.error('[PERINGATAN] Pemeriksaan kata sandi awal dilewati:', err.message);
  }

  const server = app.listen(PORT, () => {
    console.log(`[OK] Server berjalan di http://localhost:${PORT}${IS_PRODUCTION ? ' (mode produksi)' : ' (mode pengembangan)'}`);
  });

  // Berhenti dengan rapi (Ctrl+C, restart PM2/systemd/Docker): selesaikan permintaan yang berjalan
  const shutdown = (signal) => {
    console.log(`\n[INFO] ${signal} diterima, server dihentikan...`);
    server.close(async () => {
      try {
        await pool.end();
      } catch (err) {
        // abaikan
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
