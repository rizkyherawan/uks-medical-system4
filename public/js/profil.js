// ============================================================
// Halaman Profil: sama untuk semua peran, hanya baca.
// Data diambil dari Auth.user (hasil GET /api/auth/me).
// ============================================================
(() => {
  'use strict';

  const ROLE_LABEL = { administrator: 'Administrator', petugas: 'Petugas UKS', siswa: 'Siswa' };

  const ACCESS = {
    administrator: [
      'Memegang seluruh kendali sistem',
      'Membuat, mengubah, dan menghapus akun Administrator, Petugas UKS, dan Siswa',
      'Mengisi kegiatan dan lomba yang tampil di beranda',
      'Mencatat data pasien sakit, tekanan darah, obat keluar, dan peminjaman barang',
      'Mengunduh rekap data bulanan ke dokumen dan mencetak data'
    ],
    petugas: [
      'Mencatat dan mengelola data pasien sakit',
      'Mencatat dan mengelola data tekanan darah',
      'Mencatat obat keluar dan peminjaman barang',
      'Mengunduh rekap data bulanan ke dokumen dan mencetak data',
      'Melihat beranda'
    ],
    siswa: [
      'Melihat beranda',
      'Melihat hasil tekanan darah milik sendiri (berdasarkan NIS)'
    ]
  };

  const esc = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function render(user) {
    const label = ROLE_LABEL[user.role] || user.role;

    document.getElementById('profile-avatar').textContent = (String(user.nama).trim()[0] || '?').toUpperCase();
    document.getElementById('profile-name').textContent = user.nama;

    const badge = document.getElementById('profile-role');
    badge.textContent = label;
    badge.className = `role-badge role-${user.role}`;

    const rows = [
      ['Nama lengkap', user.nama],
      user.username ? ['Username', user.username] : null,
      user.email ? ['Email', user.email] : null,
      user.nis ? ['NIS', user.nis] : null,
      ['Peran', label],
      ['Terdaftar sejak', formatDate(user.dibuat)]
    ].filter(Boolean);

    document.getElementById('profile-rows').innerHTML = rows
      .map(([term, value]) => `<div class="info-row"><dt>${esc(term)}</dt><dd>${esc(value)}</dd></div>`)
      .join('');

    document.getElementById('access-list').innerHTML = (ACCESS[user.role] || [])
      .map((text) => `<li><span class="access-tick">${Icons.svg('tick')}</span><span>${esc(text)}</span></li>`)
      .join('');
  }

  Auth.ready.then((user) => {
    if (user) render(user);
  });
})();
