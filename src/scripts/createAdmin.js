// ============================================================
// PEMBUAT ADMINISTRATOR PERTAMA
// Administrator pertama tidak bisa mendaftar lewat website (itu disengaja),
// jadi dibuat lewat terminal oleh pemilik sistem:
//
//   npm run buat-admin
//
// Skrip bertanya nama, username, dan kata sandi (kata sandi tidak tampil saat
// diketik). Untuk cara cepat tanpa pertanyaan:
//
//   npm run buat-admin -- --nama "Nama Lengkap" --username NamaAdmin --password "KataSandiAnda"
//
// Akun awal (Administrator01 dan 5 Petugas UKS) sudah dibuat otomatis lewat "npm run seed".
// Administrator berikutnya dan semua Petugas UKS dibuat dari halaman Kelola akun.
// ============================================================
require('dotenv').config();

const fs = require('fs');
const readline = require('readline');
const { pool } = require('../config/db');
const StaffModel = require('../models/staffModel');
const { hashPassword } = require('../utils/password');
const { checkNama, checkUsername, checkPassword } = require('../middlewares/validateAuth');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      args[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

// Jika input bukan terminal biasa (misalnya dialirkan dari file atau perintah lain),
// semua baris dibaca sekali lalu dibagikan satu per satu ke tiap pertanyaan.
let queuedLines = null;
function nextQueuedLine() {
  if (queuedLines === null) queuedLines = fs.readFileSync(0, 'utf8').split(/\r?\n/);
  return queuedLines.length > 0 ? queuedLines.shift() : null;
}

function ask(question) {
  if (!process.stdin.isTTY) {
    process.stdout.write(question);
    const line = nextQueuedLine();
    process.stdout.write('\n');
    return Promise.resolve(line);
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Membaca kata sandi tanpa menampilkannya di layar
function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      ask(question).then(resolve);
      return;
    }

    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          process.stdout.write('\n');
          process.exit(130); // Ctrl+C
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
        } else {
          value += char;
        }
      }
    };
    stdin.on('data', onData);
  });
}

// Bertanya sampai jawaban lolos pemeriksaan
async function askValid(prompt, check, { hidden = false, normalize = (v) => v.trim() } = {}) {
  for (;;) {
    const raw = hidden ? await askHidden(prompt) : await ask(prompt);
    if (raw === null) throw new Error('Input tidak lengkap.');
    const value = normalize(raw);
    const error = check(value);
    if (!error) return value;
    console.log(`  ${error}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fromArgs = Boolean(args.nama || args.username || args.password);

  console.log('Pembuatan akun Administrator\n');

  let nama = (args.nama || '').trim();
  let username = (args.username || '').trim();
  let password = args.password || '';

  if (fromArgs) {
    const error = checkNama(nama) || checkUsername(username) || checkPassword(password);
    if (error) throw new Error(error);
  } else {
    nama = await askValid('Nama lengkap     : ', checkNama);
    username = await askValid('Username         : ', (v) => checkUsername(v));

    for (;;) {
      password = await askValid('Kata sandi       : ', checkPassword, { hidden: true, normalize: (v) => v });
      const again = await askHidden('Ulangi kata sandi : ');
      if (again === null) throw new Error('Input tidak lengkap.');
      if (again === password) break;
      console.log('  Kata sandi tidak sama. Coba lagi.');
    }
  }

  if (await StaffModel.findByUsername(username)) {
    throw new Error(`Username ${username} sudah dipakai akun staf lain.`);
  }

  await StaffModel.create({
    nama,
    username,
    email: null,
    role: 'administrator',
    password_hash: await hashPassword(password)
  });

  console.log(`\n[OK] Akun Administrator untuk ${nama} (username: ${username}) berhasil dibuat.`);
  console.log('     Jalankan "npm start", lalu masuk lewat kartu Administrator.');
}

main()
  .catch((err) => {
    if (err && err.code === 'ER_NO_SUCH_TABLE') {
      console.error('\n[GAGAL] Tabel akun belum ada. Impor database/schema.sql terlebih dahulu.');
    } else if (err && (err.code === 'ECONNREFUSED' || err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ER_BAD_DB_ERROR')) {
      console.error(`\n[GAGAL] Tidak bisa terhubung ke database: ${err.message}`);
      console.error('        Periksa MySQL sudah menyala dan isi file .env sudah benar.');
    } else {
      console.error(`\n[GAGAL] ${err.message}`);
    }
    process.exitCode = 1;
  })
  .finally(() => pool.end());
