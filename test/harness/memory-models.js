// ============================================================
// DATABASE DI MEMORI (hanya untuk pengujian)
// Mengganti lapisan model (yang biasanya menjalankan SQL ke MySQL) dengan penyimpanan
// di memori, tanpa mengubah satu pun baris kode di src/. Perilaku penting MySQL ditiru:
// username/email tidak peka huruf besar-kecil, pelanggaran unik memunculkan ER_DUP_ENTRY.
// ============================================================
const stores = [];
const tables = {}; // nama tabel -> penyimpanan, dipakai pool tiruan untuk SQL langsung
const resetters = [];
const lower = (v) => String(v ?? '').toLowerCase();

function dup(name) {
  const err = new Error(`Duplicate entry for key '${name}'`);
  err.code = 'ER_DUP_ENTRY';
  return err;
}

// ----- model CRUD generik (pengganti models/crudModel.js) -----
function createModel({ table, fields, searchColumns = [], dateColumn, orderBy }) {
  const store = { rows: [], nextId: 1 };
  stores.push(store);
  if (table) tables[table] = store;

  const sorters = String(orderBy || 'id DESC')
    .split(',')
    .map((part) => part.trim().split(/\s+/))
    .map(([col, dir]) => ({ col, sign: /desc/i.test(dir || '') ? -1 : 1 }));

  const sortRows = (rows) =>
    [...rows].sort((a, b) => {
      for (const { col, sign } of sorters) {
        const x = a[col];
        const y = b[col];
        if (x === y) continue;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (x < y ? -1 : 1) * sign;
      }
      return 0;
    });

  const clone = (row) => (row ? { ...row } : null);

  return {
    async findAll({ search = '', where = '', params = [] } = {}) {
      let rows = store.rows;
      const m = /^(\w+) = \?$/.exec(where);
      if (m) rows = rows.filter((r) => r[m[1]] === params[0]);
      const between = /^(\w+) BETWEEN \? AND \?$/.exec(where);
      if (between) rows = rows.filter((r) => String(r[between[1]]) >= params[0] && String(r[between[1]]) <= params[1]);
      if (search && searchColumns.length) {
        rows = rows.filter((r) => searchColumns.some((c) => lower(r[c]).includes(lower(search))));
      }
      return sortRows(rows).map(clone);
    },
    async findRange({ from, to } = {}) {
      if (!dateColumn || !from || !to) return this.findAll();
      return this.findAll({ where: `${dateColumn} BETWEEN ? AND ?`, params: [from, to] });
    },
    async findById(id) {
      return clone(store.rows.find((r) => r.id === id));
    },
    async create(data) {
      const row = { id: store.nextId, created_at: new Date(), updated_at: new Date() };
      store.nextId += 1;
      fields.forEach((f) => {
        row[f] = data[f] === undefined || data[f] === '' ? null : data[f];
      });
      store.rows.push(row);
      return row.id;
    },
    async update(id, data) {
      const row = store.rows.find((r) => r.id === id);
      if (!row) return 0;
      fields.forEach((f) => {
        row[f] = data[f] === undefined || data[f] === '' ? null : data[f];
      });
      row.updated_at = new Date();
      return 1;
    },
    async remove(id) {
      const before = store.rows.length;
      store.rows = store.rows.filter((r) => r.id !== id);
      return before - store.rows.length;
    },
    _store: store
  };
}

// ----- akun staf -----
const staff = { rows: [], nextId: 1 };
const students = { rows: [] };
const sessions = { rows: [] };
const readings = { rows: [], nextId: 1 };
stores.push(staff, students, sessions, readings);

const publicStaff = (r) => (r ? { id: r.id, nama: r.nama, username: r.username, email: r.email, role: r.role, last_login: r.last_login, created_at: r.created_at } : null);
const publicStudent = (r) => (r ? { nis: r.nis, nama: r.nama, username: r.username, email: r.email, last_login: r.last_login, created_at: r.created_at } : null);

const StaffModel = {
  async list() {
    return staff.rows.map(publicStaff).sort((a, b) => (a.role === b.role ? a.nama.localeCompare(b.nama) : a.role === 'administrator' ? -1 : 1));
  },
  async count() {
    return staff.rows.length;
  },
  async findByLogin(identifier) {
    const id = lower(identifier);
    const row = staff.rows.find((r) => lower(r.username) === id) || staff.rows.find((r) => r.email && lower(r.email) === id);
    return row ? { ...row } : null;
  },
  async findById(id) {
    return publicStaff(staff.rows.find((r) => r.id === id));
  },
  async findByUsername(username) {
    return publicStaff(staff.rows.find((r) => lower(r.username) === lower(username)));
  },
  async findByEmail(email) {
    return publicStaff(staff.rows.find((r) => r.email && lower(r.email) === lower(email)));
  },
  async create({ nama, username, email, password_hash, role }) {
    if (staff.rows.some((r) => lower(r.username) === lower(username))) throw dup('uq_staff_username');
    if (email && staff.rows.some((r) => r.email && lower(r.email) === lower(email))) throw dup('uq_staff_email');
    const row = { id: staff.nextId, nama, username, email: email || null, password_hash, role, last_login: null, created_at: new Date() };
    staff.nextId += 1;
    staff.rows.push(row);
    return row.id;
  },
  async update(id, { nama, username, email, password_hash }) {
    const row = staff.rows.find((r) => r.id === id);
    if (!row) return 0;
    Object.assign(row, { nama, username, email: email || null });
    if (password_hash) row.password_hash = password_hash;
    return 1;
  },
  async touchLogin(id) {
    const row = staff.rows.find((r) => r.id === id);
    if (row) row.last_login = new Date();
  },
  async remove(id) {
    const before = staff.rows.length;
    staff.rows = staff.rows.filter((r) => r.id !== id);
    return before - staff.rows.length;
  },
  async countByRole(role) {
    return staff.rows.filter((r) => r.role === role).length;
  }
};

const StudentModel = {
  async list() {
    return students.rows.map(publicStudent).sort((a, b) => a.nama.localeCompare(b.nama));
  },
  async findByLogin(identifier) {
    const id = lower(identifier);
    const row = students.rows.find((r) => r.username && lower(r.username) === id) || students.rows.find((r) => r.email && lower(r.email) === id);
    return row ? { ...row } : null;
  },
  async findByNis(nis) {
    return publicStudent(students.rows.find((r) => r.nis === String(nis)));
  },
  async findByUsername(username) {
    return publicStudent(students.rows.find((r) => r.username && lower(r.username) === lower(username)));
  },
  async findByEmail(email) {
    return publicStudent(students.rows.find((r) => r.email && lower(r.email) === lower(email)));
  },
  async create({ nis, nama, username, email, password_hash }) {
    if (students.rows.some((r) => r.nis === nis)) throw dup('PRIMARY');
    if (username && students.rows.some((r) => r.username && lower(r.username) === lower(username))) throw dup('uq_students_username');
    if (email && students.rows.some((r) => r.email && lower(r.email) === lower(email))) throw dup('uq_students_email');
    students.rows.push({ nis, nama, username: username || null, email: email || null, password_hash, last_login: null, created_at: new Date() });
    return nis;
  },
  async update(nis, { nama, username, email, password_hash }) {
    const row = students.rows.find((r) => r.nis === nis);
    if (!row) return 0;
    Object.assign(row, { nama, username: username || null, email: email || null });
    if (password_hash) row.password_hash = password_hash;
    return 1;
  },
  async touchLogin(nis) {
    const row = students.rows.find((r) => r.nis === nis);
    if (row) row.last_login = new Date();
  },
  async remove(nis) {
    const before = students.rows.length;
    students.rows = students.rows.filter((r) => r.nis !== String(nis));
    return before - students.rows.length;
  },
  async count() {
    return students.rows.length;
  }
};

const SessionModel = {
  async create({ tokenHash, accountType, accountId, ttlSeconds }) {
    sessions.rows = sessions.rows.filter((s) => s.expires > Date.now());
    sessions.rows.push({ tokenHash, account_type: accountType, account_id: String(accountId), expires: Date.now() + ttlSeconds * 1000 });
  },
  async find(tokenHash) {
    const s = sessions.rows.find((x) => x.tokenHash === tokenHash && x.expires > Date.now());
    return s ? { account_type: s.account_type, account_id: s.account_id } : null;
  },
  async remove(tokenHash) {
    sessions.rows = sessions.rows.filter((s) => s.tokenHash !== tokenHash);
  },
  async removeForAccount(type, id) {
    sessions.rows = sessions.rows.filter((s) => !(s.account_type === type && s.account_id === String(id)));
  }
};

const withDate = (r) => (r ? { ...r, tanggal: r.created_at.toISOString().slice(0, 10) } : null);
const BloodPressureModel = {
  async findAll() {
    return [...readings.rows].sort((a, b) => b.id - a.id).map(withDate);
  },
  async findRange({ from, to } = {}) {
    const all = await this.findAll();
    return !from || !to ? all : all.filter((r) => r.tanggal >= from && r.tanggal <= to);
  },
  async findByNis(nis) {
    return (await this.findAll()).filter((r) => r.nis === nis);
  },
  async findById(id) {
    return withDate(readings.rows.find((r) => r.id === id));
  },
  async create(data) {
    const row = { id: readings.nextId, ...data, created_at: new Date(), updated_at: new Date() };
    readings.nextId += 1;
    readings.rows.push(row);
    return row.id;
  },
  async update(id, data) {
    const row = readings.rows.find((r) => r.id === id);
    if (!row) return 0;
    Object.assign(row, data);
    return 1;
  },
  async remove(id) {
    const before = readings.rows.length;
    readings.rows = readings.rows.filter((r) => r.id !== id);
    return before - readings.rows.length;
  }
};

function reset() {
  stores.forEach((s) => {
    s.rows = [];
    if ('nextId' in s) s.nextId = 1;
  });
}

// Pool tiruan: hanya mengerti pernyataan SQL langsung yang dipakai model khusus
// (peminjaman: UPDATE ... SET tanggal_kembali). Selebihnya mengembalikan hasil kosong.
async function fakeExecute(sql, params = []) {
  const m = /^UPDATE (\w+) SET tanggal_kembali = \? WHERE id = \?$/.exec(String(sql).trim());
  if (m && tables[m[1]]) {
    const row = tables[m[1]].rows.find((r) => r.id === params[1]);
    if (row) row.tanggal_kembali = params[0];
    return [{ affectedRows: row ? 1 : 0 }, []];
  }
  return [[], []];
}

const fakeMysql = {
  createPool: () => ({
    execute: fakeExecute,
    query: async () => [[], []],
    getConnection: async () => ({ ping: async () => {}, release: () => {} }),
    end: async () => {}
  })
};

module.exports = {
  createModel,
  D: (column) => column,
  StaffModel,
  StudentModel,
  SessionModel,
  BloodPressureModel,
  fakeMysql,
  reset,
  data: { staff, students, sessions, readings }
};
