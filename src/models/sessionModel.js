// ============================================================
// MODEL sesi login.
// Waktu kedaluwarsa dihitung oleh MySQL sendiri (NOW()), bukan oleh Node.js,
// supaya tidak ada selisih zona waktu antara dua program itu.
// ============================================================
const { pool } = require('../config/db');

const SessionModel = {
  async create({ tokenHash, accountType, accountId, ttlSeconds }) {
    const ttl = Math.max(60, Math.floor(Number(ttlSeconds)) || 0);

    // Sekalian membersihkan sesi yang sudah kedaluwarsa agar tabel tidak menumpuk
    await pool.execute('DELETE FROM sessions WHERE expires_at < NOW()');

    await pool.execute(
      `INSERT INTO sessions (token_hash, account_type, account_id, expires_at)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ${ttl} SECOND))`,
      [tokenHash, accountType, String(accountId)]
    );
  },

  // Mengembalikan sesi yang masih berlaku, atau null
  async find(tokenHash) {
    const [rows] = await pool.execute(
      'SELECT account_type, account_id FROM sessions WHERE token_hash = ? AND expires_at > NOW()',
      [tokenHash]
    );
    return rows[0] || null;
  },

  async remove(tokenHash) {
    await pool.execute('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
  },

  // Dipakai saat sebuah akun dihapus: semua sesinya ikut dicabut
  async removeForAccount(accountType, accountId) {
    await pool.execute('DELETE FROM sessions WHERE account_type = ? AND account_id = ?', [
      accountType,
      String(accountId)
    ]);
  }
};

module.exports = SessionModel;
