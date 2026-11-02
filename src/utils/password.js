// ============================================================
// KATA SANDI
// Kata sandi TIDAK PERNAH disimpan apa adanya. Yang disimpan adalah hasil
// "hash" satu arah: dari hash tidak bisa dikembalikan ke kata sandi aslinya.
// Memakai scrypt bawaan Node.js (modul crypto), jadi tidak perlu paket baru.
//
// Format yang tersimpan di database:
//   scrypt$N$r$p$<salt base64>$<hash base64>
// Salt acak berbeda untuk tiap akun, sehingga dua akun dengan kata sandi
// yang sama tetap memiliki hash yang berbeda.
// ============================================================
const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

const PARAMS = { N: 16384, r: 8, p: 1 }; // parameter standar scrypt
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, keyB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;

    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const actual = await scrypt(password, salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p)
    });

    // timingSafeEqual: perbandingan dengan waktu konstan agar tidak bocor lewat selisih waktu
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (err) {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
