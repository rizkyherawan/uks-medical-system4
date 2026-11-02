// ============================================================
// PABRIK MODEL (query SQL umum untuk satu tabel)
// Dipakai oleh data pasien, obat keluar, peminjaman barang, dan konten beranda,
// supaya empat tabel itu tidak punya empat salinan kode yang hampir sama.
// Hanya berurusan dengan database: tidak ada req/res di sini.
//
//   table         nama tabel
//   select        daftar kolom untuk SELECT (kolom tanggal diformat YYYY-MM-DD)
//   fields        kolom yang boleh diisi dari input (urutan = urutan parameter)
//   searchColumns kolom yang dicari lewat kotak pencarian
//   dateColumn    kolom tanggal untuk filter periode laporan
//   orderBy       urutan tampil
// ============================================================
const { pool } = require('../config/db');

function createModel({ table, select, fields, searchColumns = [], dateColumn, orderBy }) {
  const values = (data) => fields.map((f) => (data[f] === undefined || data[f] === '' ? null : data[f]));

  return {
    async findAll({ search = '', where = '', params = [] } = {}) {
      const conditions = [];
      const bind = [...params];
      if (where) conditions.push(where);

      if (search && searchColumns.length) {
        conditions.push(`(${searchColumns.map((c) => `${c} LIKE ?`).join(' OR ')})`);
        searchColumns.forEach(() => bind.push(`%${search}%`));
      }

      const sql = `SELECT ${select} FROM ${table}${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''} ORDER BY ${orderBy}`;
      const [rows] = await pool.execute(sql, bind);
      return rows;
    },

    // Data dalam satu periode (from/to berformat YYYY-MM-DD, null = tanpa batas)
    async findRange({ from, to } = {}) {
      if (!dateColumn || !from || !to) return this.findAll();
      return this.findAll({ where: `${dateColumn} BETWEEN ? AND ?`, params: [from, to] });
    },

    async findById(id) {
      const [rows] = await pool.execute(`SELECT ${select} FROM ${table} WHERE id = ?`, [id]);
      return rows[0] || null;
    },

    async create(data) {
      const [result] = await pool.execute(
        `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
        values(data)
      );
      return result.insertId;
    },

    async update(id, data) {
      const [result] = await pool.execute(
        `UPDATE ${table} SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
        [...values(data), id]
      );
      return result.affectedRows;
    },

    async remove(id) {
      const [result] = await pool.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
      return result.affectedRows;
    }
  };
}

const D = (column) => `DATE_FORMAT(${column}, '%Y-%m-%d') AS ${column}`;

module.exports = { createModel, D };
