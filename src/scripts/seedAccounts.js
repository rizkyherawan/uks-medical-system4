// ============================================================
// AKUN AWAL SISTEM
// Membuat 1 akun Administrator dan 5 akun Petugas UKS bila belum ada.
// Aman dijalankan berkali-kali: akun yang username-nya sudah ada dilewati
// (kata sandi akun yang sudah ada TIDAK ditimpa).
//
//   npm run seed
//
// Server juga memanggil fungsi ini otomatis saat pertama kali menyala
// dengan tabel akun staf yang masih kosong.
//
// PENTING: kata sandi di bawah adalah kata sandi awal. Ganti lewat halaman
// Kelola akun (tombol Ubah) sebelum website dipakai oleh banyak orang.
// ============================================================
const StaffModel = require('../models/staffModel');
const { hashPassword } = require('../utils/password');

const DEFAULT_ACCOUNTS = [
  { nama: 'Administrator UKS', username: 'Administrator01', password: 'administrator01', role: 'administrator' },
  { nama: 'Petugas Alpha', username: 'Alpha', password: 'alphasenin01', role: 'petugas' },
  { nama: 'Petugas Beta', username: 'Beta', password: 'betaselasa02', role: 'petugas' },
  { nama: 'Petugas Gamma', username: 'Gamma', password: 'gammarabu03', role: 'petugas' },
  { nama: 'Petugas Delta', username: 'Delta', password: 'deltakamis04', role: 'petugas' },
  { nama: 'Petugas Epsilon', username: 'Epsilon', password: 'epsilonjumat05', role: 'petugas' }
];

// Mengembalikan { dibuat: [...username], dilewati: [...username] }
async function seedDefaultAccounts() {
  const result = { dibuat: [], dilewati: [] };

  for (const account of DEFAULT_ACCOUNTS) {
    if (await StaffModel.findByUsername(account.username)) {
      result.dilewati.push(account.username);
      continue;
    }
    await StaffModel.create({
      nama: account.nama,
      username: account.username,
      email: null,
      role: account.role,
      password_hash: await hashPassword(account.password)
    });
    result.dibuat.push(account.username);
  }

  return result;
}

// Akun bawaan yang kata sandinya MASIH kata sandi awal (berbahaya bila server dibuka ke internet)
async function findAccountsWithDefaultPassword() {
  const { verifyPassword } = require('../utils/password');
  const weak = [];
  for (const account of DEFAULT_ACCOUNTS) {
    const found = await StaffModel.findByLogin(account.username);
    if (found && found.username === account.username && (await verifyPassword(account.password, found.password_hash))) {
      weak.push(account.username);
    }
  }
  return weak;
}

module.exports = { seedDefaultAccounts, findAccountsWithDefaultPassword, DEFAULT_ACCOUNTS };

// Dijalankan langsung lewat "npm run seed"
if (require.main === module) {
  require('dotenv').config();

  // Akun awal memakai kata sandi yang tercantum di README, jadi tidak boleh dibuat di server sungguhan
  if (process.env.NODE_ENV === 'production') {
    console.error('[DITOLAK] Akun awal tidak dibuat di mode produksi (kata sandinya bisa ditebak).');
    console.error('          Buat Administrator dengan kata sandi sendiri: npm run buat-admin');
    process.exit(1);
  }

  const { pool } = require('../config/db');

  seedDefaultAccounts()
    .then(({ dibuat, dilewati }) => {
      if (dibuat.length) console.log(`[OK] Akun dibuat: ${dibuat.join(', ')}`);
      if (dilewati.length) console.log(`[--] Sudah ada (dilewati): ${dilewati.join(', ')}`);
      console.log('     Masuk lewat kartu Administrator atau Petugas UKS dengan username dan kata sandi awal.');
    })
    .catch((err) => {
      if (err && err.code === 'ER_NO_SUCH_TABLE' || err && err.code === 'ER_BAD_FIELD_ERROR') {
        console.error('[GAGAL] Struktur database belum sesuai. Impor ulang database/schema.sql (lihat README).');
      } else {
        console.error(`[GAGAL] ${err.message}`);
      }
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
