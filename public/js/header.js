// ============================================================
// HEADER BERSAMA
// Dipakai semua halaman lewat: <header class="site-header" data-site-header></header>
// Menu yang tampil diatur auth.js lewat atribut data-show-for (menurut peran).
// Muat file ini SEBELUM auth.js dan main.js.
// ============================================================
(() => {
  'use strict';

  const header = document.querySelector('[data-site-header]');
  if (!header) return;

  const NAMA = typeof SITE_INFO !== 'undefined' ? SITE_INFO.nama : 'UKS PMR Wira SMKN 1 Gombong';
  const page = window.location.pathname.split('/').pop() || 'index.html';
  const onHome = page === 'index.html';

  // Tautan bagian beranda: di beranda cukup #bagian, di halaman lain menuju index.html#bagian
  const anchor = (hash) => (onHome ? hash : `index.html${hash}`);

  // [label, alamat, peran yang boleh melihat]
  const links = [
    ['Layanan', anchor('#layanan'), 'guest siswa'],
    ['Kegiatan', anchor('#kegiatan'), 'guest siswa'],
    ['Prestasi', anchor('#prestasi'), 'guest siswa'],
    ['Tekanan darah saya', 'tensi-saya.html', 'siswa'],
    ['Beranda', 'index.html', 'petugas administrator'],
    ['Data pasien', 'patients.html', 'petugas administrator'],
    ['Tekanan darah', 'tensi.html', 'petugas administrator'],
    ['Obat keluar', 'obat.html', 'petugas administrator'],
    ['Peminjaman', 'pinjam.html', 'petugas administrator'],
    ['<span class="nav-long">Kelola </span>Akun', 'akun.html', 'administrator'],
    ['<span class="nav-long">Kelola </span>Konten', 'konten.html', 'administrator']
  ];

  const linkHtml = links
    .map(([label, href, show]) => {
      const current = href === page ? ' aria-current="page"' : '';
      return `<a href="${href}" data-show-for="${show}"${current}>${label}</a>`;
    })
    .join('');

  header.innerHTML = `
    <div class="container header-inner">
      <a class="brand" href="index.html" aria-label="${NAMA}, ke beranda">
        <span class="brand-logo"><img src="img/logo-pmi-mark.png" alt="" width="40" height="39"></span>
        <span class="brand-text">
          <strong>${NAMA}</strong>
          <small>Sistem rekam medis</small>
        </span>
      </a>

      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Buka menu">
        <svg class="icon i-open" aria-hidden="true"><use href="#i-menu"/></svg>
        <svg class="icon i-close" aria-hidden="true"><use href="#i-x"/></svg>
      </button>

      <nav id="site-nav" class="site-nav" aria-label="Navigasi utama">
        <div class="nav-pill">${linkHtml}</div>
        <div class="auth-slot" data-auth-slot></div>
      </nav>
    </div>`;
})();
