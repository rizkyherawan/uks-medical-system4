// ============================================================
// BERANDA: Kegiatan PMR dan Lomba
// Data diambil dari database lewat GET /api/konten (diisi Administrator di halaman
// Kelola konten). Kartu di beranda hanya menampilkan GAMBAR PRATINJAU (hasil crop/siluet
// merah-putih) dan JUDUL. Saat gambar atau judul diklik, terbuka jendela detail berisi
// foto asli berwarna, judul, tanggal, juara, dan deskripsi lengkap.
// ============================================================
(() => {
  'use strict';

  const esc = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  function formatDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  const message = (text) => `<p class="list-empty">${esc(text)}</p>`;

  // Satu kartu: gambar pratinjau + judul. Seluruh kartu adalah tombol yang membuka detail.
  function card(item) {
    const lomba = item.jenis === 'lomba';
    const cover = item.gambar_preview || item.gambar; // pratinjau; bila belum ada pakai foto asli
    const media = cover
      ? `<img src="${esc(cover)}" alt="" loading="lazy" decoding="async">`
      : `<div class="ph" role="img" aria-label="Gambar belum tersedia"></div>`;

    const adminBar = isAdmin
      ? `<div class="admin-bar">
          <span class="admin-bar-label">Administrator</span>
          <a class="mini-btn" href="konten.html?edit=${item.id}" aria-label="Ubah ${esc(item.judul)}">${icon('edit')}Ubah</a>
          <button type="button" class="mini-btn is-danger" data-admin-delete="${item.id}" aria-label="Hapus ${esc(item.judul)}">${icon('trash')}Hapus</button>
        </div>`
      : '';

    return `
      <article class="card activity pv-card${lomba ? ' is-lomba' : ''}" data-id="${item.id}">
        ${adminBar}
        <button type="button" class="pv-open" data-open="${item.id}" aria-haspopup="dialog" aria-label="Lihat detail: ${esc(item.judul)}">
          <span class="media">
            ${media}
            ${item.juara ? `<span class="rank-pill rank-on-media">${icon('trophy')}${esc(item.juara)}</span>` : ''}
          </span>
          <span class="pv-head">
            ${item.tanggal ? `<span class="date-chip">${icon('calendar')}${esc(formatDate(item.tanggal))}</span>` : ''}
            <span class="pv-title">${esc(item.judul)}</span>
            <span class="pv-hint">Lihat foto dan deskripsi${icon('arrow-left')}</span>
          </span>
        </button>
      </article>`;
  }

  // ---------- Jendela detail ----------
  // Foto asli (berwarna, utuh), judul, tanggal, juara, deskripsi. Panah kiri/kanan berpindah
  // antar konten sejenis. Semua teks dimasukkan lewat textContent (aman dari XSS).
  let detail = null;
  let detailList = [];
  let detailIndex = 0;
  let opener = null;

  function ensureDetail() {
    if (detail) return detail;
    const box = document.createElement('dialog');
    box.className = 'detail-dialog';
    box.setAttribute('aria-labelledby', 'detail-title');
    box.innerHTML = `
      <button type="button" class="detail-close" data-detail-close aria-label="Tutup detail">${icon('x')}</button>
      <div class="detail-layout">
        <figure class="detail-figure" data-figure><img alt="" data-img decoding="async"></figure>
        <div class="detail-info">
          <div class="detail-meta" data-meta></div>
          <h2 id="detail-title" data-title></h2>
          <p class="detail-desc" data-desc></p>
          <div class="detail-nav" data-nav>
            <button type="button" class="nav-prev" data-prev aria-label="Sebelumnya">${icon('arrow-left')}<span>Sebelumnya</span></button>
            <span class="nav-count" data-count aria-live="polite"></span>
            <button type="button" class="nav-next" data-next aria-label="Berikutnya"><span>Berikutnya</span>${icon('arrow-left')}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(box);

    const q = (name) => box.querySelector(`[data-${name}]`);
    detail = { box, figure: q('figure'), img: q('img'), meta: q('meta'), title: q('title'), desc: q('desc'), nav: q('nav'), prev: q('prev'), next: q('next'), count: q('count') };

    q('detail-close').addEventListener('click', () => box.close());
    detail.prev.addEventListener('click', () => step(-1));
    detail.next.addEventListener('click', () => step(1));
    // Klik di area gelap di luar jendela menutup detail
    box.addEventListener('click', (event) => {
      if (event.target === box) box.close();
    });
    box.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
    });
    box.addEventListener('close', () => {
      detail.img.removeAttribute('src'); // hentikan pemuatan foto bila ditutup sebelum selesai
      const back = opener && document.contains(opener) ? opener : document.querySelector(`[data-open="${detailList[detailIndex] ? detailList[detailIndex].id : ''}"]`);
      if (back) back.focus({ preventScroll: true });
      opener = null;
    });
    return detail;
  }

  function showDetail(item) {
    const d = ensureDetail();
    const lomba = item.jenis === 'lomba';

    d.title.textContent = item.judul;
    d.desc.textContent = item.deskripsi;
    d.meta.innerHTML = [
      item.tanggal ? `<span class="date-chip">${icon('calendar')}${esc(formatDate(item.tanggal))}</span>` : '',
      lomba && item.juara ? `<span class="rank-pill">${icon('trophy')}${esc(item.juara)}</span>` : ''
    ].join('');
    d.meta.hidden = !d.meta.innerHTML.trim();

    // Foto asli untuk tampilan penuh. Bila gagal dimuat, pakai gambar pratinjau.
    const full = item.gambar || item.gambar_preview;
    d.figure.hidden = !full;
    d.img.alt = full ? `Foto: ${item.judul}` : '';
    d.img.onerror = () => {
      if (item.gambar_preview && d.img.getAttribute('src') !== item.gambar_preview) d.img.src = item.gambar_preview;
      else d.figure.hidden = true;
    };
    if (full) d.img.src = full;
    else d.img.removeAttribute('src');

    d.nav.hidden = detailList.length < 2;
    d.prev.disabled = detailIndex <= 0;
    d.next.disabled = detailIndex >= detailList.length - 1;
    d.count.textContent = `${detailIndex + 1} dari ${detailList.length}`;
  }

  function step(direction) {
    const next = detailIndex + direction;
    if (next < 0 || next >= detailList.length) return;
    detailIndex = next;
    showDetail(detailList[detailIndex]);
  }

  function openDetail(id, from) {
    const item = items.find((k) => k.id === id);
    if (!item) return;
    detailList = items.filter((k) => k.jenis === item.jenis);
    detailIndex = Math.max(0, detailList.indexOf(item));
    opener = from || null;
    showDetail(item);
    ensureDetail().box.showModal();
    detail.box.querySelector('[data-detail-close]').focus({ preventScroll: true });
    detail.box.querySelector('.detail-info').scrollTop = 0;
  }

  function bind(container) {
    container.addEventListener('click', (event) => {
      const button = event.target.closest('[data-open]');
      if (!button) return;
      openDetail(Number(button.dataset.open), button);
    });
  }

  // ---------- Muat dari server ----------
  const kegiatanGrid = document.getElementById('kegiatan-grid');
  const lombaGrid = document.getElementById('lomba-grid');
  if (!kegiatanGrid && !lombaGrid) return;

  let isAdmin = false;
  let items = [];
  let loadedOnce = false;
  let lastLoad = 0;
  let lastSignature = '';

  // Alat Administrator: tombol tambah dan kelola di atas tiap daftar
  function renderAdminTools() {
    document.querySelectorAll('.admin-tools').forEach((el) => el.remove());
    if (!isAdmin) return;
    [
      [kegiatanGrid, 'kegiatan', 'kegiatan'],
      [lombaGrid, 'lomba', 'lomba']
    ].forEach(([grid, jenis, noun]) => {
      if (!grid) return;
      grid.insertAdjacentHTML(
        'beforebegin',
        `<div class="admin-tools">
          <strong>Mode Administrator</strong>
          <a class="mini-btn" href="konten.html?jenis=${jenis}&baru=1">${icon('plus')}Tambah ${noun}</a>
          <a class="mini-btn" href="konten.html?jenis=${jenis}">${icon('edit')}Kelola ${noun}</a>
        </div>`
      );
    });
  }

  function render() {
    renderAdminTools();
    const kegiatan = items.filter((k) => k.jenis === 'kegiatan');
    const lomba = items.filter((k) => k.jenis === 'lomba');
    if (kegiatanGrid) {
      kegiatanGrid.innerHTML = kegiatan.length ? kegiatan.map(card).join('') : message('Kegiatan akan segera ditampilkan.');
    }
    if (lombaGrid) {
      lombaGrid.innerHTML = lomba.length ? lomba.map(card).join('') : message('Prestasi dan lomba akan segera ditampilkan.');
    }
  }

  async function load() {
    lastLoad = Date.now();
    try {
      const fresh = (await KontenAPI.list()).data;
      const signature = JSON.stringify(fresh);
      // Gambar ulang hanya bila datanya berubah (supaya tampilan tidak berkedip tanpa sebab)
      if (loadedOnce && signature === lastSignature) return;
      lastSignature = signature;
      items = fresh;
      loadedOnce = true;
      render();
    } catch (err) {
      if (!loadedOnce) {
        if (kegiatanGrid) kegiatanGrid.innerHTML = message('Kegiatan belum bisa dimuat. Coba muat ulang halaman.');
        if (lombaGrid) lombaGrid.innerHTML = message('Prestasi belum bisa dimuat. Coba muat ulang halaman.');
      }
    }
  }

  // ---------- Hapus dari beranda (Administrator) ----------
  let dialog = null;
  let pendingDelete = null;

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'konten-dialog-title');
    dialog.innerHTML = `
      <div class="dialog-icon">${icon('trash')}</div>
      <h2 id="konten-dialog-title">Hapus dari beranda?</h2>
      <p id="konten-dialog-text"></p>
      <div class="dialog-actions">
        <button type="button" class="btn btn-outline" data-no>Batal</button>
        <button type="button" class="btn btn-primary" data-yes>Hapus</button>
      </div>`;
    document.body.appendChild(dialog);

    dialog.querySelector('[data-no]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      pendingDelete = null;
    });
    dialog.querySelector('[data-yes]').addEventListener('click', async () => {
      if (!pendingDelete) return;
      const target = pendingDelete;
      const yes = dialog.querySelector('[data-yes]');
      yes.disabled = true;
      try {
        await KontenAPI.remove(target.id);
        Auth.toast('Konten dihapus dari beranda.');
        await load();
      } catch (err) {
        Auth.toast(err instanceof TypeError ? 'Sistem tidak dapat dihubungi.' : err.message, 'error');
      } finally {
        yes.disabled = false;
        dialog.close();
      }
    });
    return dialog;
  }

  function bindAdmin(container) {
    container.addEventListener('click', (event) => {
      const button = event.target.closest('[data-admin-delete]');
      if (!button) return;
      const target = items.find((k) => k.id === Number(button.dataset.adminDelete));
      if (!target) return;
      pendingDelete = target;
      const box = ensureDialog();
      box.querySelector('#konten-dialog-text').innerHTML = `<strong>${esc(target.judul)}</strong> akan dihapus dari beranda beserta gambarnya, dan tidak bisa dikembalikan.`;
      box.showModal();
    });
  }

  [kegiatanGrid, lombaGrid].filter(Boolean).forEach((grid) => {
    bind(grid);
    bindAdmin(grid);
  });

  load();

  // Alat Administrator baru muncul setelah peran pengguna diketahui
  Auth.ready.then((user) => {
    if (user && user.role === 'administrator') {
      isAdmin = true;
      if (loadedOnce) render();
    }
  });

  // Perubahan yang dibuat di tab lain langsung terlihat saat kembali ke beranda
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastLoad > 1500) load();
  });
})();
