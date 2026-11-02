// ============================================================
// MODEL akun staf (Administrator dan Petugas UKS). Hanya query SQL.
// ============================================================
const { pool } = require('../config/db');

const PUBLIC_COLUMNS = 'id, nama, username, email, role, last_login, created_at';

const StaffModel = {
  async list() {
    const [rows] = await pool.execute(
      `SELECT ${PUBLIC_COLUMNS} FROM staff_accounts ORDER BY FIELD(role, 'administrator', 'petugas'), nama ASC`
    );
    return rows;
  },

  async count() {
    const [rows] = await pool.execute('SELECT COUNT(*) AS total FROM staff_accounts');
    return Number(rows[0].total);
  },

  // Dipakai saat login: username ATAU email, sekalian mengambil password_hash.
  // Kalau ada dua akun yang cocok, yang cocok di username didahulukan.
  async findByLogin(identifier) {
    const [rows] = await pool.execute(
      `SELECT id, nama, username, email, role, password_hash, last_login, created_at
         FROM staff_accounts
        WHERE username = ? OR email = ?
        ORDER BY (username = ?) DESC
        LIMIT 1`,
      [identifier, identifier, identifier]
    );
    return rows[0] || null;
  },

  async findById(id) {
    const [rows] = await pool.execute(`SELECT ${PUBLIC_COLUMNS} FROM staff_accounts WHERE id = ?`, [id]);
    return rows[0] || null;
  },

  async findByUsername(username) {
    const [rows] = await pool.execute(`SELECT ${PUBLIC_COLUMNS} FROM staff_accounts WHERE username = ?`, [username]);
    return rows[0] || null;
  },

  async findByEmail(email) {
    const [rows] = await pool.execute(`SELECT ${PUBLIC_COLUMNS} FROM staff_accounts WHERE email = ?`, [email]);
    return rows[0] || null;
  },

  async create({ nama, username, email, password_hash, role }) {
    const [result] = await pool.execute(
      'INSERT INTO staff_accounts (nama, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [nama, username, email || null, password_hash, role]
    );
    return result.insertId;
  },

  // password_hash boleh kosong: berarti kata sandi tidak diubah
  async update(id, { nama, username, email, password_hash }) {
    const sets = ['nama = ?', 'username = ?', 'email = ?'];
    const params = [nama, username, email || null];
    if (password_hash) {
      sets.push('password_hash = ?');
      params.push(password_hash);
    }
    params.push(id);
    const [result] = await pool.execute(`UPDATE staff_accounts SET ${sets.join(', ')} WHERE id = ?`, params);
    return result.affectedRows;
  },

  async touchLogin(id) {
    await pool.execute('UPDATE staff_accounts SET last_login = NOW() WHERE id = ?', [id]);
  },

  async remove(id) {
    const [result] = await pool.execute('DELETE FROM staff_accounts WHERE id = ?', [id]);
    return result.affectedRows;
  },

  async countByRole(role) {
    const [rows] = await pool.execute('SELECT COUNT(*) AS total FROM staff_accounts WHERE role = ?', [role]);
    return Number(rows[0].total);
  }
};

module.exports = StaffModel;
