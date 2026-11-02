// ============================================================
// Halaman Kelola Konten (hanya Administrator)
// Mengisi Kegiatan PMR dan Lomba untuk beranda: judul, tanggal, deskripsi, dan foto.
// Alur foto: pilih foto -> (dikecilkan di browser, maks. 1600 px) -> editor crop + siluet ->
// simpan. Server menerima DUA gambar: foto asli (tampil penuh saat kartu diklik) dan
// pratinjau hasil crop/siluet (tampil di kartu beranda). Keduanya dikirim sebagai data URL.
// ============================================================
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const icon = (name) => Icons.svg(name);

  const JENIS = {
    kegiatan: { label: 'Kegiatan PMR', judul: 'Judul kegiatan', placeholder: 'Contoh: Latihan pertolongan pertama', kosong: 'Belum ada kegiatan' },
    lomba: { label: 'Lomba dan prestasi', judul: 'Nama lomba', placeholder: 'Contoh: Lomba tandu darurat', kosong: 'Belum ada lomba' }
  };

  const MAX_SIDE = 1600;

  const form = $('konten-form');
  const fields = { judul: $('judul'), tanggal: $('tanggal'), deskripsi: $('deskripsi') };

  let all = [];
  let tab = 'kegiatan';
  let editing = null;
  let newImage = null; // data URL foto asli baru (belum tersimpan)
  let newPreview = null; // data URL pratinjau baru (hasil crop/siluet)
  let origSrc = ''; // foto asli yang ditampilkan/diedit: data URL baru atau alamat file lama
  let previewSrc = ''; // pratinjau yang ditampilkan
  let previewLabel = '';
  let styleInfo = { siluet: true, detail: 50, balik: false }; // pengaturan terakhir di editor
  let pending = null;

  const esc = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  function formatDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  const friendly = (err) =>
    err instanceof TypeError
      ? 'Sistem tidak dapat dihubungi. Periksa koneksi atau pastikan server sudah dijalankan, lalu coba lagi.'
      : err.message || 'Terjadi kesalahan.';

  // ---------- Daftar ----------

  function render() {
    const rows = all.filter((k) => k.jenis === tab);
    $('result-info').textContent = `${rows.length} ${tab === 'kegiatan' ? 'kegiatan' : 'lomba'} tampil di beranda`;

    if (rows.length === 0) {
      $('konten-list').hidden = true;
      $('empty-state').innerHTML = `<span class="state-icon">${icon('image')}</span><h3>${JENIS[tab].kosong}</h3>
        <p>Isi formulir di samping. Konten yang disimpan langsung muncul di beranda.</p>`;
      $('empty-state').hidden = false;
      return;
    }

    $('empty-state').hidden = true;
    $('konten-list').hidden = false;
    $('konten-list').innerHTML = rows
      .map(
        (k) => `
      <article class="konten-item ${editing === k.id ? 'is-editing' : ''}">
        <div class="konten-thumb">${k.gambar_preview || k.gambar ? `<img src="${esc(k.gambar_preview || k.gambar)}" alt="" loading="lazy">` : `<span>${icon('image')}</span>`}</div>
        <div class="konten-info">
          <h3>${esc(k.judul)}</h3>
          <p class="konten-meta">${k.tanggal ? esc(formatDate(k.tanggal)) : 'Tanpa tanggal'}${k.juara ? ` &middot; <strong>${esc(k.juara)}</strong>` : ''}</p>
          <p class="konten-desc">${esc(k.deskripsi)}</p>
          <a class="konten-view" href="index.html#${k.jenis === 'lomba' ? 'prestasi' : 'kegiatan'}" target="_blank" rel="noopener">Lihat di beranda</a>
        </div>
        <div class="konten-actions">
          <button type="button" class="btn btn-outline btn-sm" data-action="edit" data-id="${k.id}" aria-label="Ubah ${esc(k.judul)}">${icon('edit')}<span>Ubah</span></button>
          <button type="button" class="btn btn-outline btn-sm btn-danger-outline" data-action="delete" data-id="${k.id}" aria-label="Hapus ${esc(k.judul)}">${icon('trash')}<span>Hapus</span></button>
        </div>
      </article>`
      )
      .join('');
  }

  async function load({ silent = false } = {}) {
    if (!silent) {
      $('loading').hidden = false;
      $('konten-list').hidden = true;
      $('empty-state').hidden = true;
    }
    $('list-error').hidden = true;
    try {
      all = (await KontenAPI.list()).data;
      $('loading').hidden = true;
      render();
    } catch (err) {
      all = [];
      $('loading').hidden = true;
      $('result-info').textContent = '';
      $('list-error-text').textContent = friendly(err);
      $('list-error').hidden = false;
    }
  }

  // ---------- Form ----------

  function setError(name, message) {
    const el = $(`err-${name}`);
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
    if (fields[name]) fields[name].setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function syncJenis() {
    const jenis = $('jenis').value;
    $('judul-label').textContent = JENIS[jenis].judul;
    fields.judul.placeholder = JENIS[jenis].placeholder;
    $('juara-field').hidden = jenis !== 'lomba';
  }

  // Menampilkan foto asli + pratinjau di formulir (atau kotak "Pilih foto" bila belum ada)
  function showImages() {
    const has = Boolean(origSrc);
    $('dropzone').hidden = has;
    $('img-result').hidden = !has;
    $('img-actions').hidden = !has;
    if (has) {
      $('orig-thumb').src = origSrc;
      $('preview').src = previewSrc || origSrc;
      $('preview-style').textContent = previewLabel || (previewSrc ? 'Pratinjau tersimpan' : 'Memakai foto asli (belum di-crop)');
    } else {
      $('orig-thumb').removeAttribute('src');
      $('preview').removeAttribute('src');
    }
  }

  function labelFor(info) {
    return info.siluet ? 'Siluet merah-putih' : 'Foto berwarna (sudah di-crop)';
  }

  function resetForm() {
    form.reset();
    editing = null;
    newImage = null;
    newPreview = null;
    origSrc = '';
    previewSrc = '';
    previewLabel = '';
    styleInfo = { siluet: true, detail: 50, balik: false };
    $('jenis').value = tab;
    syncJenis();
    showImages();
    $('gambar').value = '';
    $('gambar-hint').textContent = '(wajib)';
    $('form-title-text').textContent = 'Tambah konten';
    $('submit-label').textContent = 'Simpan dan tampilkan';
    $('mode-badge').hidden = true;
    $('cancel-btn').hidden = true;
    $('form-error').hidden = true;
    $('deskripsi-count').textContent = '0/3000';
    Object.keys(fields).forEach((n) => setError(n, ''));
    setError('gambar', '');
    render();
  }

  function startEdit(id) {
    const k = all.find((x) => x.id === id);
    if (!k) return;
    editing = id;
    newImage = null;
    newPreview = null;
    $('jenis').value = k.jenis;
    syncJenis();
    fields.judul.value = k.judul;
    fields.tanggal.value = k.tanggal || '';
    fields.deskripsi.value = k.deskripsi;
    $('juara').value = k.juara || '';
    $('deskripsi-count').textContent = `${k.deskripsi.length}/3000`;
    origSrc = k.gambar || '';
    previewSrc = k.gambar_preview || '';
    previewLabel = '';
    styleInfo = { siluet: true, detail: 50, balik: false };
    showImages();
    $('gambar').value = '';
    $('gambar-hint').textContent = k.gambar ? '(biarkan bila tidak diganti)' : '(wajib)';
    $('form-title-text').textContent = 'Ubah konten';
    $('submit-label').textContent = 'Simpan perubahan';
    $('mode-badge').hidden = false;
    $('cancel-btn').hidden = false;
    $('form-error').hidden = true;
    render();
    const narrow = window.matchMedia('(max-width: 1040px)').matches;
    $('form-card').scrollIntoView({ behavior: 'smooth', block: narrow ? 'start' : 'nearest' });
    fields.judul.focus({ preventScroll: true });
  }

  // Mengecilkan gambar di browser: sisi terpanjang maksimal 1600 px, hasil JPEG
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; // PNG transparan menjadi latar putih
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('File tidak bisa dibaca sebagai gambar.'));
      };
      img.src = url;
    });
  }

  // Membuka editor crop + siluet. Bila Administrator membatalkan saat foto baru dipilih,
  // tetap dibuat pratinjau otomatis (crop tengah + siluet) supaya kartu di beranda tetap rapi.
  async function runEditor(isNewPhoto) {
    if (!origSrc) return;
    try {
      const result = await ImageEditor.open({ src: origSrc, ...styleInfo });
      if (result) {
        newPreview = result.preview;
        previewSrc = result.preview;
        styleInfo = { siluet: result.siluet, detail: result.detail, balik: result.balik };
        previewLabel = labelFor(styleInfo);
        setError('gambar', '');
      } else if (isNewPhoto && !newPreview) {
        const auto = await ImageEditor.auto(origSrc, styleInfo);
        newPreview = auto.preview;
        previewSrc = auto.preview;
        previewLabel = `${labelFor(styleInfo)} (otomatis)`;
      }
    } catch (err) {
      setError('gambar', err.message || 'Editor gambar tidak dapat dibuka.');
    }
    showImages();
  }

  $('gambar').addEventListener('change', async () => {
    const file = $('gambar').files[0];
    setError('gambar', '');
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError('gambar', 'Foto harus berformat JPG, PNG, atau WEBP.');
      $('gambar').value = '';
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('gambar', 'Ukuran file terlalu besar (maksimal 25 MB).');
      $('gambar').value = '';
      return;
    }
    try {
      const shrunk = await shrink(file);
      newImage = shrunk;
      origSrc = shrunk;
      newPreview = null;
      previewSrc = '';
      previewLabel = '';
      showImages();
      await runEditor(true);
    } catch (err) {
      setError('gambar', err.message);
    } finally {
      $('gambar').value = ''; // supaya foto yang sama bisa dipilih ulang
    }
  });

  $('edit-image').addEventListener('click', () => runEditor(false));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    $('form-error').hidden = true;

    const data = {
      jenis: $('jenis').value,
      judul: fields.judul.value.trim().replace(/\s+/g, ' '),
      tanggal: fields.tanggal.value,
      deskripsi: fields.deskripsi.value.trim(),
      juara: $('juara').value.trim()
    };
    if (newImage) data.gambar = newImage;
    if (newPreview) data.gambar_preview = newPreview;

    // Semua isian wajib harus beres dulu sebelum konten boleh disimpan
    const target = editing ? all.find((k) => k.id === editing) : null;
    const legacyWithoutPhoto = Boolean(target && !target.gambar); // konten lama tanpa foto boleh tetap begitu
    const errors = {};
    if (!data.judul) errors.judul = `${JENIS[data.jenis].judul} wajib diisi.`;
    if (data.tanggal && Number.isNaN(Date.parse(data.tanggal))) errors.tanggal = 'Tanggal tidak valid.';
    if (!data.deskripsi) errors.deskripsi = 'Deskripsi wajib diisi.';
    if (!newImage && !(target && target.gambar) && !legacyWithoutPhoto) errors.gambar = 'Foto wajib dipilih.';
    ['judul', 'tanggal', 'deskripsi', 'gambar'].forEach((n) => setError(n, errors[n]));
    const first = ['judul', 'tanggal', 'deskripsi', 'gambar'].find((n) => errors[n]);
    if (first) {
      (first === 'gambar' ? $('gambar') : fields[first]).focus();
      return;
    }

    $('submit-btn').disabled = true;
    $('submit-label').textContent = 'Menyimpan...';
    try {
      const result = editing ? await KontenAPI.update(editing, data) : await KontenAPI.create(data);
      Auth.toast(result.message || 'Tersimpan.');
      tab = data.jenis;
      syncTabs();
      resetForm();
      await load({ silent: true });
    } catch (err) {
      const messages = err.details && err.details.length ? err.details : [friendly(err)];
      $('form-error').innerHTML = `<ul>${messages.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`;
      $('form-error').hidden = false;
    } finally {
      $('submit-btn').disabled = false;
      $('submit-label').textContent = editing ? 'Simpan perubahan' : 'Simpan dan tampilkan';
    }
  });

  // ---------- Aksi ----------

  $('konten-list').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = Number(button.dataset.id);
    if (button.dataset.action === 'edit') return startEdit(id);
    const k = all.find((x) => x.id === id);
    if (!k) return;
    pending = k;
    $('confirm-text').innerHTML = `<strong>${esc(k.judul)}</strong> akan dihapus dari beranda beserta gambarnya, dan tidak bisa dikembalikan.`;
    $('confirm-dialog').showModal();
  });

  $('confirm-no').addEventListener('click', () => $('confirm-dialog').close());
  $('confirm-dialog').addEventListener('close', () => {
    pending = null;
  });
  $('confirm-yes').addEventListener('click', async () => {
    if (!pending) return;
    const k = pending;
    $('confirm-yes').disabled = true;
    try {
      await KontenAPI.remove(k.id);
      if (editing === k.id) resetForm();
      Auth.toast('Konten dihapus.');
      await load({ silent: true });
    } catch (err) {
      Auth.toast(friendly(err), 'error');
    } finally {
      $('confirm-yes').disabled = false;
      $('confirm-dialog').close();
    }
  });

  function syncTabs() {
    document.querySelectorAll('.role-tab').forEach((t) => {
      t.classList.toggle('is-active', t.dataset.filter === tab);
      t.setAttribute('aria-selected', String(t.dataset.filter === tab));
    });
  }

  document.querySelectorAll('.role-tab').forEach((t) =>
    t.addEventListener('click', () => {
      tab = t.dataset.filter;
      syncTabs();
      if (!editing) {
        $('jenis').value = tab;
        syncJenis();
      }
      render();
    })
  );

  $('jenis').addEventListener('change', syncJenis);
  $('cancel-btn').addEventListener('click', resetForm);
  $('retry-btn').addEventListener('click', () => load());
  fields.deskripsi.addEventListener('input', () => {
    $('deskripsi-count').textContent = `${fields.deskripsi.value.length}/3000`;
    setError('deskripsi', '');
  });
  fields.judul.addEventListener('input', () => setError('judul', ''));
  fields.tanggal.addEventListener('input', () => setError('tanggal', ''));

  // Tombol "Tambah konten baru": kosongkan form dan arahkan ke isian pertama
  $('new-btn').addEventListener('click', () => {
    resetForm();
    const narrow = window.matchMedia('(max-width: 1040px)').matches;
    $('form-card').scrollIntoView({ behavior: 'smooth', block: narrow ? 'start' : 'nearest' });
    fields.judul.focus({ preventScroll: true });
  });

  // Dibuka dari beranda: ?jenis=lomba&baru=1 (tambah) atau ?edit=12 (ubah)
  function applyUrlIntent() {
    const params = new URLSearchParams(window.location.search);
    const jenis = params.get('jenis');
    if (jenis && JENIS[jenis]) {
      tab = jenis;
      syncTabs();
      $('jenis').value = jenis;
      syncJenis();
      render();
    }
    const editId = Number(params.get('edit'));
    if (editId) {
      const target = all.find((k) => k.id === editId);
      if (target) {
        tab = target.jenis;
        syncTabs();
        startEdit(editId);
      } else {
        Auth.toast('Konten yang ingin diubah sudah tidak ada.', 'error');
      }
    } else if (params.has('baru')) {
      fields.judul.focus({ preventScroll: true });
    }
    if (editId || params.has('baru')) window.history.replaceState(null, '', window.location.pathname);
  }

  syncJenis();
  Auth.ready.then(async (user) => {
    if (user && user.role === 'administrator') {
      await load();
      applyUrlIntent();
    }
  });
})();
