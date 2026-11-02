// ============================================================
// KARTU "REKAP BULANAN"
// Dipasang lewat: <div data-export="pasien" data-export-label="siswa sakit"></div>
// jenis: pasien | obat-keluar | peminjaman | tekanan-darah
//
// Cara kerja:
//  1. Pilih BULAN dan TAHUN rekap (awal: bulan berjalan).
//  2. "Unduh Excel": server membuat file bernama otomatis, contoh
//     "Rekap Data Siswa Sakit Bulan November 2026.xlsx", berisi tiga sheet: daftar data,
//     ringkasan + grafik, dan data analisis (angka di balik grafik).
//  3. "Cetak": hanya data bulan terpilih yang dicetak. Halaman data mendengarkan
//     peristiwa 'rekap:periode' dan menyaring tabelnya sebelum dicetak (lihat patients.js,
//     tensi.js, dan crud-page.js).
// ============================================================
const ExportBar = (() => {
  'use strict';

  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  // Awalan nama file dari server (src/controllers/exportController.js)
  const NAMA_FILE = {
    pasien: 'Rekap Data Siswa Sakit',
    'obat-keluar': 'Rekap Data Obat Keluar',
    peminjaman: 'Rekap Data Peminjaman Barang',
    'tekanan-darah': 'Rekap Data Tekanan Darah'
  };

  const now = new Date();
  const YEARS = 5; // tahun berjalan dan 4 tahun sebelumnya

  function mountAll(root = document) {
    root.querySelectorAll('[data-export]:not([data-export-ready])').forEach(mount);
  }

  function mount(box) {
    box.dataset.exportReady = '1';
    const jenis = box.dataset.export;
    const label = box.dataset.exportLabel || jenis;
    const base = NAMA_FILE[jenis] || 'Rekap Data';

    const monthOptions = BULAN.map(
      (name, i) => `<option value="${String(i + 1).padStart(2, '0')}"${i === now.getMonth() ? ' selected' : ''}>${name}</option>`
    ).join('');
    const yearOptions = Array.from({ length: YEARS }, (_, i) => now.getFullYear() - i)
      .map((y) => `<option value="${y}"${y === now.getFullYear() ? ' selected' : ''}>${y}</option>`)
      .join('');

    box.className = 'card export-bar no-print';
    box.innerHTML = `
      <div class="export-info">
        <span class="icon-dot">${Icons.svg('sheet')}</span>
        <div>
          <h2 class="card-title">Rekap bulanan</h2>
          <p class="card-sub">Pilih bulan, lalu unduh rekap ${label} sebagai dokumen Excel (sheet 1 daftar data, sheet 2 ringkasan dan grafik, sheet 3 data analisis), atau cetak data bulan tersebut.</p>
        </div>
      </div>
      <div class="export-controls">
        <label class="export-field">
          <span>Bulan</span>
          <select class="select" data-export-month aria-label="Bulan rekap">${monthOptions}</select>
        </label>
        <label class="export-field">
          <span>Tahun</span>
          <select class="select" data-export-year aria-label="Tahun rekap">${yearOptions}</select>
        </label>
        <button type="button" class="btn btn-primary btn-sm" data-export-excel>${Icons.svg('download')}<span>Unduh Excel</span></button>
        <button type="button" class="btn btn-outline btn-sm" data-export-print>${Icons.svg('printer')}<span>Cetak</span></button>
      </div>
      <p class="export-file">Nama file: <strong data-export-filename></strong></p>`;

    // Judul yang hanya muncul di kertas saat mencetak
    const printTitle = document.createElement('p');
    printTitle.className = 'print-title';
    box.insertAdjacentElement('beforebegin', printTitle);

    const monthEl = box.querySelector('[data-export-month]');
    const yearEl = box.querySelector('[data-export-year]');
    const excel = box.querySelector('[data-export-excel]');

    const periode = () => ({ bulan: `${yearEl.value}-${monthEl.value}`, nama: `${BULAN[Number(monthEl.value) - 1]} ${yearEl.value}` });

    const refresh = () => {
      const { nama } = periode();
      const text = `${base} Bulan ${nama}`;
      box.querySelector('[data-export-filename]').textContent = `${text}.xlsx`;
      excel.querySelector('span').textContent = `Unduh Excel ${nama}`;
      printTitle.textContent = `${text} | UKS PMR WIRA SMK Negeri 1 Gombong`;
    };
    monthEl.addEventListener('change', refresh);
    yearEl.addEventListener('change', refresh);
    refresh();

    excel.addEventListener('click', async () => {
      const text = excel.querySelector('span');
      excel.disabled = true;
      text.textContent = 'Menyiapkan...';
      try {
        await downloadReport(jenis, { bulan: periode().bulan });
        Auth.toast(`Rekap ${periode().nama} berhasil diunduh.`);
      } catch (err) {
        Auth.toast(err instanceof TypeError ? 'Sistem tidak dapat dihubungi.' : err.message, 'error');
      } finally {
        excel.disabled = false;
        refresh();
      }
    });

    // Cetak: saring tabel ke bulan terpilih, cetak, lalu pulihkan tampilan
    box.querySelector('[data-export-print]').addEventListener('click', () => {
      const { bulan, nama } = periode();
      document.dispatchEvent(new CustomEvent('rekap:periode', { detail: { jenis, bulan, nama } }));

      const restore = () => {
        window.removeEventListener('afterprint', restore);
        document.dispatchEvent(new CustomEvent('rekap:periode', { detail: { jenis, bulan: null } }));
      };
      window.addEventListener('afterprint', restore);
      window.print();
    });
  }

  mountAll();
  return { mountAll };
})();
