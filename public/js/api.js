// ============================================================
// KONEKSI FRONTEND -> BACKEND
// Semua pemanggilan ke server Node.js lewat file ini.
//
// Halaman dibuka lewat Express (http://localhost:3000)  -> pakai '/api'
//
// CATATAN: karena sistem sekarang memakai login berbasis cookie, buka
// halaman LEWAT http://localhost:3000. Live Server dan file:// tidak lagi
// didukung, sebab cookie sesi tidak ikut terkirim ke alamat yang berbeda.
//
// Login: cookie sesi dikirim otomatis oleh browser pada setiap fetch ke
// alamat yang sama. Kalau server menjawab 401 (belum login atau sesi habis),
// pengguna diarahkan ke beranda dengan kartu login terbuka.
// ============================================================
const API_BASE_URL = '/api';

function redirectToLogin() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  window.location.href = `index.html?masuk=1&next=${encodeURIComponent(page)}`;
}

// options.skipAuthRedirect = true dipakai oleh permintaan login/daftar/cek sesi,
// yang menjawab 401 sebagai hal biasa dan tidak boleh memicu pengalihan.
async function request(path, options = {}) {
  const { skipAuthRedirect = false, ...fetchOptions } = options;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...fetchOptions
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    // response bukan JSON (mis. server mati di tengah jalan)
  }

  if (response.status === 401 && !skipAuthRedirect) {
    redirectToLogin();
    throw new Error('Sesi Anda telah berakhir. Silakan login kembali.');
  }

  if (!response.ok) {
    const error = new Error((payload && payload.message) || 'Terjadi kesalahan pada server.');
    error.details = (payload && payload.errors) || [];
    throw error;
  }

  return payload;
}

const PatientAPI = {
  list: (search = '') =>
    request(`/patients${search ? `?search=${encodeURIComponent(search)}` : ''}`),

  get: (id) => request(`/patients/${id}`),

  create: (data) =>
    request('/patients', { method: 'POST', body: JSON.stringify(data) }),

  update: (id, data) =>
    request(`/patients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  remove: (id) => request(`/patients/${id}`, { method: 'DELETE' })
};

// Pembuat API CRUD standar untuk obat keluar dan peminjaman barang
function crudApi(base) {
  return {
    list: (search = '') => request(`${base}${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    create: (data) => request(base, { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`${base}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`${base}/${id}`, { method: 'DELETE' })
  };
}

const ObatAPI = crudApi('/obat-keluar');

const PinjamAPI = {
  ...crudApi('/peminjaman'),
  markReturned: (id, tanggal_kembali = '') =>
    request(`/peminjaman/${id}/kembali`, { method: 'POST', body: JSON.stringify({ tanggal_kembali }) })
};

// Konten beranda (Kegiatan dan Lomba). Membaca daftar terbuka untuk umum.
const KontenAPI = {
  list: (jenis = '') =>
    request(`/konten${jenis ? `?jenis=${jenis}` : ''}`, { skipAuthRedirect: true }),
  create: (data) => request('/konten', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/konten/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => request(`/konten/${id}`, { method: 'DELETE' })
};

// Mengunduh laporan Excel. jenis: pasien | obat-keluar | peminjaman | tekanan-darah
// periode: { bulan: '2026-10' } atau { semua: true }
async function downloadReport(jenis, periode = {}) {
  const query = periode.semua ? 'semua=1' : periode.bulan ? `bulan=${encodeURIComponent(periode.bulan)}` : '';
  const response = await fetch(`${API_BASE_URL}/export/${jenis}${query ? `?${query}` : ''}`);

  if (response.status === 401) {
    redirectToLogin();
    throw new Error('Sesi Anda telah berakhir. Silakan login kembali.');
  }
  if (!response.ok) {
    let message = 'Gagal membuat file Excel.';
    try {
      message = (await response.json()).message || message;
    } catch (_) {
      // bukan JSON
    }
    throw new Error(message);
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = match ? match[1] : `rekap-${jenis}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
