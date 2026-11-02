// ============================================================
// MODEL akun siswa. NIS (5 digit) adalah primary key tabel students.
// ============================================================
const { pool } = require('../config/db');

const PUBLIC_COLUMNS = 'nis, nama, username, email, last_login, created_at';

const StudentModel = {
  async list() {
    const [rows] = await pool.execute(`SELECT ${PUBLIC_COLUMNS} FROM students ORDER BY nama ASC`);
    return rows;
  },

  // Dipakai saat login: username ATAU email, sekalian mengambil password_hash
  async findByLogin(identifier) {
    const [rows] = await pool.execute(
      `SELECT nis, nama, username, email, password_hash, last_login, created_at
         FROM students
        WHERE username = ? OR email = ?
        ORDER BY (username = ?) DESC
        LIMIT 1`,
      [identifier, identifier, identifier]
    );
    return rows[0] || null;
  },

  async findByNis(nis) {
    const [rows] = await pool.execute(`SELECT ${PUBLIC_COLUMNS} FROM students WHERE nis = ?`, [nis]);
    return rows[0] || null;
  },

  async findByUsername(username) {
    const [rows] = await pool.execute(`SELECT ${PUBLIC_COLUMNS} FROM students WHERE username = ?`, [username]);
    return rows[0] || null;
  },

  async findByEmail(email) {
    const [rows] = await pool.execute(`SELECT ${PUBLIC_COLUMNS} FROM students WHERE email = ?`, [email]);
    return rows[0] || null;
  },

  async create({ nis, nama, username, email, password_hash }) {
    await pool.execute(
      'INSERT INTO students (nis, nama, username, email, password_hash) VALUES (?, ?, ?, ?, ?)',
      [nis, nama, username || null, email || null, password_hash]
    );
    return nis;
  },

  // NIS tidak bisa diubah (itu identitas akun). password_hash kosong = kata sandi tetap.
  async update(nis, { nama, username, email, password_hash }) {
    const sets = ['nama = ?', 'username = ?', 'email = ?'];
    const params = [nama, username || null, email || null];
    if (password_hash) {
      sets.push('password_hash = ?');
      params.push(password_hash);
    }
    params.push(nis);
    const [result] = await pool.execute(`UPDATE students SET ${sets.join(', ')} WHERE nis = ?`, params);
    return result.affectedRows;
  },

  async touchLogin(nis) {
    await pool.execute('UPDATE students SET last_login = NOW() WHERE nis = ?', [nis]);
  },

  async remove(nis) {
    const [result] = await pool.execute('DELETE FROM students WHERE nis = ?', [nis]);
    return result.affectedRows;
  },

  async count() {
    const [rows] = await pool.execute('SELECT COUNT(*) AS total FROM students');
    return Number(rows[0].total);
  }
};

module.exports = StudentModel;
