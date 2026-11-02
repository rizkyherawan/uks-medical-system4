// ============================================================
// Halaman Hasil Tekanan Darah Saya (hanya Siswa)
// Data: GET /api/me/blood-pressure. Server memakai NIS dari sesi login,
// sehingga siswa hanya bisa melihat pengukuran miliknya sendiri.
// ============================================================
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const root = $('my-root');

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  const badge = (kategori, teks) =>
    `<span class="cat-badge cat-${esc(kategori.kode)}" title="${esc(kategori.nama)}">${esc(teks || kategori.nama)}</span>`;

  function renderEmpty() {
    root.innerHTML = `
      <div class="card">
        <div class="state">
          <span class="state-icon">${Icons.svg('activity')}</span>
          <h2>Belum ada hasil tekanan darah</h2>
          <p>Hasil akan tampil di sini setelah Petugas UKS mencatat tekanan darah Anda. Pastikan NIS pada akun Anda sama dengan NIS yang dicatat Petugas UKS.</p>
        </div>
      </div>`;
  }

  function renderSummary(ringkasan) {
    const progress = ringkasan.lengkap
      ? '<span class="progress-pill is-complete">3 dari 3 pengukuran selesai</span>'
      : `<span class="progress-pill">${ringkasan.jumlah} dari 3 pengukuran. Rata-rata akan diperbarui setelah pengukuran berikutnya.</span>`;

    return `
      <section class="card my-summary" aria-labelledby="summary-title">
        <div class="my-summary-top">
          <h2 id="summary-title">Rata-rata tekanan darah</h2>
          ${progress}
        </div>
        <div class="bp-result" data-cat="${esc(ringkasan.kategori.kode)}">
          <div class="bp-result-layout">
            <div class="emo-stage">${BPEmoji.svg(ringkasan.kategori.kode, { size: 112 })}</div>
            <div class="bp-result-body">
              <div class="bp-result-head">
                <p class="bp-result-value">${esc(ringkasan.sistolik)}/${esc(ringkasan.diastolik)} <small>mmHg</small></p>
                ${badge(ringkasan.kategori)}
              </div>
              <p class="bp-result-range">Rentang kategori: ${esc(ringkasan.kategori.rentang)}</p>
              <p class="bp-result-note"><strong>Catatan &amp; anjuran</strong>${esc(ringkasan.kategori.catatan)}</p>
            </div>
          </div>
        </div>
      </section>`;
  }

  function renderMeasurement(item, index) {
    const number = index + 1;

    if (!item) {
      return `
        <article class="card my-card is-empty">
          <div class="my-card-head"><span>Pengukuran ke-${number}</span></div>
          <p>Belum dilakukan</p>
        </article>`;
    }

    return `
      <article class="card my-card">
        <div class="my-card-head">
          <span>Pengukuran ke-${number}</span>
          ${badge(item.kategori, item.kategori.singkat)}
        </div>
        <div class="my-card-emo">${BPEmoji.svg(item.kategori.kode, { size: 56, animate: false })}</div>
        <p class="bp-result-value">${esc(item.sistolik)}/${esc(item.diastolik)} <small>mmHg</small></p>
        <p class="date-line">${Icons.svg('calendar')}<span>${esc(formatDate(item.dicatat))}</span></p>
      </article>`;
  }

  function render(data) {
    $('nis-value').textContent = data.nis;
    $('nis-line').hidden = false;

    if (!data.ringkasan) {
      renderEmpty();
      return;
    }

    root.innerHTML =
      renderSummary(data.ringkasan) +
      `<div class="my-grid">${data.pengukuran.map(renderMeasurement).join('')}</div>`;
    $('my-disclaimer').hidden = false;
  }

  function renderError(err) {
    const message =
      err instanceof TypeError
        ? 'Sistem tidak dapat dihubungi. Periksa koneksi atau pastikan server sudah dijalankan, lalu coba lagi.'
        : err.message || 'Terjadi kesalahan.';

    root.innerHTML = `
      <div class="card">
        <div class="state" role="alert">
          <span class="state-icon">${Icons.svg('alert')}</span>
          <h2>Hasil belum bisa dimuat</h2>
          <p>${esc(message)}</p>
          <button type="button" class="btn btn-outline btn-sm" id="retry-btn">Coba lagi</button>
        </div>
      </div>`;
    $('retry-btn').addEventListener('click', load);
  }

  async function load() {
    try {
      const result = await MyAPI.bloodPressure();
      render(result.data);
    } catch (err) {
      renderError(err);
    }
  }

  Auth.ready.then((user) => {
    if (user && user.role === 'siswa') load();
  });
})();
