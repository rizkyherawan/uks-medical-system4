// ============================================================
// KONEKSI FRONTEND -> BACKEND untuk login dan akun.
// Memakai fungsi request() dari api.js, jadi api.js harus dimuat lebih dulu.
// ============================================================

// Login, daftar, keluar, dan cek siapa yang sedang masuk.
// skipAuthRedirect: jawaban 401 di sini adalah hal biasa (belum login atau
// salah kata sandi), jadi tidak boleh mengalihkan halaman.
const AuthAPI = {
  me: () => request('/auth/me', { skipAuthRedirect: true }),

  login: (role, identifier, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ role, identifier, password }),
      skipAuthRedirect: true
    }),

  register: (data) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
      skipAuthRedirect: true
    }),

  logout: () => request('/auth/logout', { method: 'POST', skipAuthRedirect: true })
};

// Kelola akun: hanya bisa dipakai Administrator
const AccountAPI = {
  overview: () => request('/accounts/overview'),

  listStaff: () => request('/accounts/staff'),
  createStaff: (data) => request('/accounts/staff', { method: 'POST', body: JSON.stringify(data) }),
  updateStaff: (id, data) => request(`/accounts/staff/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStaff: (id) => request(`/accounts/staff/${id}`, { method: 'DELETE' }),

  listStudents: () => request('/accounts/students'),
  createStudent: (data) => request('/accounts/students', { method: 'POST', body: JSON.stringify(data) }),
  updateStudent: (nis, data) => request(`/accounts/students/${nis}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStudent: (nis) => request(`/accounts/students/${nis}`, { method: 'DELETE' })
};

// Data milik siswa yang sedang masuk
const MyAPI = {
  bloodPressure: () => request('/me/blood-pressure')
};
