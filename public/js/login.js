// ============================================================
// LOGIN: kartu peran yang berputar langsung menjadi form
//
// Urutan tampilan:
//  1. Klik tombol Login: tiga kartu naik dalam keadaan tertutup, lalu terbalik
//     satu per satu (animasi pembuka).
//  2. Sorot atau sentuh sebuah kartu: kartu itu maju ke depan (tetap tajam, tidak blur).
//  3. Pilih kartu: dua kartu lain memudar, sedangkan kartu terpilih "terbang" ke tengah
//     layar sambil berputar. Punggung kartu itu adalah form login, jadi kartu depan
//     dan form terasa satu benda yang sama.
//  4. Kirim form: AuthAPI.login(peran, username/email, kata sandi) -> server -> cookie sesi.
//
// Mengapa halus dan tidak blur:
//  - Semua gerakan hanya memakai transform dan opacity (tidak ada animasi lebar/tinggi
//    yang memaksa tata letak dihitung ulang di setiap frame).
//  - Kartu "terbang" dibuat sebesar ukuran akhirnya lalu diperkecil untuk titik awal,
//    sehingga browser tidak pernah memperbesar gambar yang sudah dirender (penyebab blur).
//  - Putaran 3D hanya ada selama animasi. Setelah selesai, form dirender datar dan tajam.
//
// "Daftar" (khusus Siswa) memakai kartu Siswa yang sama dengan isian
// nama, NIS, username ATAU email, dan kata sandi.
// ============================================================
(() => {
  'use strict';

  const ROLES = [
    {
      key: 'administrator',
      label: 'Administrator',
      letter: 'A',
      desc: 'Kelola akun dan sistem',
      card: 'img/cards/card-administrator.svg',
      sub: 'Khusus pengelola sistem.'
    },
    {
      key: 'petugas',
      label: 'Petugas UKS',
      letter: 'P',
      desc: 'Pasien sakit dan tekanan darah',
      card: 'img/cards/card-petugas.svg',
      sub: 'Gunakan akun yang dibuat oleh Administrator.'
    },
    {
      key: 'siswa',
      label: 'Siswa',
      letter: 'S',
      desc: 'Hasil tekanan darah saya',
      card: 'img/cards/card-siswa.svg',
      sub: 'Gunakan username atau email Anda.'
    }
  ];

  const NEXT_ALLOWED = [
    'index.html', 'patients.html', 'tensi.html', 'obat.html', 'pinjam.html',
    'akun.html', 'konten.html', 'profil.html', 'tensi-saya.html'
  ];
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;
  const currentPage = () => window.location.pathname.split('/').pop() || 'index.html';

  const state = {
    open: false,
    chosen: null,
    mode: 'login', // 'login' | 'register'
    idMode: 'username', // pilihan saat Siswa mendaftar
    next: null,
    busy: false,
    transition: false,
    lastFocus: null,
    runId: 0
  };

  let overlay, panel, stage, layer, formEl, holder, flyer;
  const cards = {};

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, reducedMotion() ? 0 : ms));
  const sanitizeNext = (value) => (NEXT_ALLOWED.includes(value) ? value : null);
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms)); // tidak ikut dilewati saat reduced-motion

  // ---------- Gambar kartu: dirender SEKALI menjadi bitmap ----------
  // File SVG kartu besar (360-840 KB, berisi filter blur dan gambar tertanam). Kalau dipakai
  // langsung, browser harus mendekode dan menggambar ulang SVG itu persis saat animasi
  // berjalan, itulah sumber macet (patah-patah) di intro dan outro. Jadi di waktu senggang
  // setelah halaman dimuat, tiap SVG digambar satu kali ke canvas lalu dipakai sebagai
  // bitmap biasa, yang murah untuk digeser, diputar, dan diperkecil oleh GPU.
  // File SVG tetap sumber aslinya (ganti file-nya, hasilnya ikut berubah). Bila canvas
  // gagal, kartu otomatis memakai SVG langsung seperti sebelumnya.
  const BACK_ART = 'img/cards/card-back.svg';
  const CARD_RATIO = 1.4; // tinggi / lebar kartu (5 : 7)
  const art = { urls: {}, keep: [], done: false, promise: null };

  function rasterize(src, width) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onerror = () => reject(new Error(`gagal memuat ${src}`));
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = Math.round(width * CARD_RATIO);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'));
          if (!blob) throw new Error('toBlob gagal');
          const url = URL.createObjectURL(blob);
          const ready = new Image(); // dekode di muka, lalu ditahan agar tidak dibuang dari cache
          ready.src = url;
          await ready.decode();
          art.keep.push(ready);
          resolve(url);
        } catch (err) {
          reject(err);
        }
      };
      img.src = src;
    });
  }

  function preloadArt() {
    if (art.promise) return art.promise;
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
    const width = Math.round(380 * dpr); // ukuran kartu terbesar (380px) pada layar ini
    const jobs = [...ROLES.map((r) => [r.key, r.card]), ['back', BACK_ART]];
    art.promise = (async () => {
      for (const [key, src] of jobs) {
        try {
          art.urls[key] = await rasterize(src, width);
        } catch (err) {
          // tetap memakai file SVG aslinya
        }
        await timeout(30); // beri napas ke thread utama di antara dua kartu
      }
      art.done = true;
    })();
    return art.promise;
  }

  const artUrl = (key, fallback) => art.urls[key] || fallback;

  // Pasang bitmap yang sudah siap ke gambar di overlay (aman dipanggil berulang)
  function applyArt() {
    if (!overlay) return;
    overlay.querySelectorAll('.role-card').forEach((card) => {
      const url = art.urls[card.dataset.role];
      const front = card.querySelector('.role-art');
      if (url && front.getAttribute('src') !== url) front.src = url;
    });
    if (art.urls.back) {
      overlay.querySelectorAll('.role-back-art').forEach((el) => {
        if (el.getAttribute('src') !== art.urls.back) el.src = art.urls.back;
      });
    }
  }

  const decodeAll = () => Promise.all([...overlay.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));

  // Mulai menyiapkan di waktu senggang setelah halaman selesai dimuat
  const scheduleArt = () => ('requestIdleCallback' in window ? window.requestIdleCallback(preloadArt, { timeout: 2000 }) : setTimeout(preloadArt, 800));
  if (document.readyState === 'complete') scheduleArt();
  else window.addEventListener('load', scheduleArt, { once: true });

  const esc = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  // ---------- Membangun elemen ----------

  function fieldHtml({ name, label, type, icon, autocomplete, extra = '', toggle = false }) {
    return `
      <div class="af-field" data-field="${name}">
        <label for="af-${name}">${label}</label>
        <div class="af-input${toggle ? ' has-toggle' : ''}">
          ${Icons.svg(icon)}
          <input id="af-${name}" name="${name}" type="${type}" autocomplete="${autocomplete}" ${extra}>
          ${
            toggle
              ? `<button type="button" class="af-toggle" data-action="toggle-password" aria-label="Tampilkan kata sandi" aria-pressed="false">${Icons.svg('eye')}</button>`
              : ''
          }
        </div>
        <p class="af-error" hidden></p>
        <p class="af-hint" hidden></p>
      </div>`;
  }

  function buildForm() {
    const el = document.createElement('div');
    el.className = 'af';
    el.innerHTML = `
      <div class="af-head">
        <span class="af-badge" aria-hidden="true"></span>
        <div>
          <h3 id="af-title"></h3>
          <p id="af-sub"></p>
        </div>
      </div>
      <div class="af-body">
        <form class="af-form" novalidate>
          ${fieldHtml({ name: 'nama', label: 'Nama lengkap', type: 'text', icon: 'user', autocomplete: 'name', extra: 'maxlength="100" placeholder="Nama sesuai data sekolah"' })}
          ${fieldHtml({ name: 'nis', label: 'NIS', type: 'text', icon: 'id', autocomplete: 'off', extra: 'inputmode="numeric" maxlength="5" placeholder="5 digit angka"' })}
          <div class="af-seg-wrap" data-field="idmode">
            <span class="af-seg-label" id="af-idmode-label">Daftar dengan</span>
            <div class="af-seg" role="group" aria-labelledby="af-idmode-label">
              <button type="button" class="af-seg-btn is-active" data-action="id-mode" data-id-mode="username" aria-pressed="true">Username</button>
              <button type="button" class="af-seg-btn" data-action="id-mode" data-id-mode="email" aria-pressed="false">Email</button>
            </div>
          </div>
          ${fieldHtml({ name: 'identifier', label: 'Username/email', type: 'text', icon: 'user', autocomplete: 'username', extra: 'maxlength="150" autocapitalize="none" spellcheck="false" placeholder="Username atau email"' })}
          ${fieldHtml({ name: 'password', label: 'Kata sandi', type: 'password', icon: 'lock', autocomplete: 'current-password', extra: 'maxlength="100" placeholder="Masukkan kata sandi"', toggle: true })}
          <p class="af-message" role="alert" hidden></p>
          <button type="submit" class="af-submit"><span class="af-submit-label">Login</span></button>
        </form>
        <div class="af-links">
          <p data-links="switch"><button type="button" class="text-link" data-action="switch-mode"></button></p>
          <button type="button" class="text-link back-link" data-action="back">${Icons.svg('arrow-left')}<span>Pilih peran lain</span></button>
        </div>
      </div>`;
    return el;
  }

  function ensureOverlay() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.className = 'auth-overlay';
    overlay.id = 'auth-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'auth-title');
    overlay.inert = true;
    overlay.innerHTML = `
      <div class="auth-backdrop" data-action="close"></div>
      <button type="button" class="auth-close" data-action="close" aria-label="Tutup">${Icons.svg('x')}</button>
      <div class="auth-panel">
        <header class="auth-head">
          <span class="auth-eyebrow">UKS PMR Wira SMKN 1 Gombong</span>
          <h2 id="auth-title">Pilih peran untuk login</h2>
          <p>Pilih kartu yang sesuai dengan peran Anda di sistem.</p>
        </header>
        <div class="card-stage" role="group" aria-label="Pilihan peran">
          ${ROLES.map(
            (r, i) => `
            <div class="role-card" data-role="${r.key}" style="--i:${i}">
              <div class="role-pop">
                <button type="button" class="role-pick" data-pick="${r.key}" aria-label="Login sebagai ${r.label}. ${r.desc}">
                  <span class="role-faces">
                    <img class="role-art" src="${artUrl(r.key, r.card)}" alt="" width="300" height="420" draggable="false" decoding="async">
                    <img class="role-back-art" src="${artUrl('back', BACK_ART)}" alt="" width="300" height="420" draggable="false" decoding="async">
                  </span>
                </button>
              </div>
            </div>`
          ).join('')}
        </div>
        <div class="auth-foot">
          <p>Belum punya akun? <button type="button" class="text-link" data-action="register">Daftar</button></p>
          <p class="auth-note">Pendaftaran hanya untuk Siswa. Akun Petugas UKS dibuat oleh Administrator.</p>
        </div>
      </div>
      <div class="flyer-layer"></div>`;
    document.body.appendChild(overlay);

    panel = overlay.querySelector('.auth-panel');
    stage = overlay.querySelector('.card-stage');
    layer = overlay.querySelector('.flyer-layer');
    overlay.querySelectorAll('.role-card').forEach((card) => {
      cards[card.dataset.role] = card;
    });

    holder = document.createDocumentFragment();
    formEl = buildForm();
    holder.appendChild(formEl);

    bindEvents();
  }

  // ---------- Pengaturan form ----------

  const field = (name) => formEl.querySelector(`[data-field="${name}"]`);
  const input = (name) => formEl.querySelector(`#af-${name}`);
  const FIELDS = ['nama', 'nis', 'identifier', 'password'];

  function setFieldError(name, message) {
    const errorEl = field(name).querySelector('.af-error');
    errorEl.textContent = message || '';
    errorEl.hidden = !message;
    input(name).setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function clearErrors() {
    FIELDS.forEach((name) => setFieldError(name, ''));
    const message = formEl.querySelector('.af-message');
    message.hidden = true;
    message.innerHTML = '';
  }

  function showMessage(lines) {
    const message = formEl.querySelector('.af-message');
    message.innerHTML =
      lines.length > 1 ? `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : esc(lines[0]);
    message.hidden = false;
  }

  // Menyesuaikan label dan petunjuk kolom Username/email dengan mode sekarang
  function syncIdentifier() {
    const register = state.mode === 'register';
    const label = field('identifier').querySelector('label');
    const el = input('identifier');

    formEl.querySelectorAll('.af-seg-btn').forEach((b) => {
      const on = b.dataset.idMode === state.idMode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });

    if (!register) {
      label.textContent = 'Username/email';
      el.type = 'text';
      el.autocomplete = 'username';
      el.placeholder = 'Username atau email';
    } else if (state.idMode === 'email') {
      label.textContent = 'Email';
      el.type = 'email';
      el.autocomplete = 'email';
      el.placeholder = 'nama@email.com';
    } else {
      label.textContent = 'Username';
      el.type = 'text';
      el.autocomplete = 'username';
      el.placeholder = 'Contoh: budi.santoso';
    }
  }

  function setFormMode(roleKey, mode) {
    const role = ROLES.find((r) => r.key === roleKey);
    const register = mode === 'register';

    formEl.querySelector('.af-badge').textContent = role.letter;
    formEl.querySelector('#af-title').textContent = register ? 'Daftar akun Siswa' : `Login sebagai ${role.label}`;
    formEl.querySelector('#af-sub').textContent = register ? 'Isi data diri untuk membuat akun.' : role.sub;

    field('nama').hidden = !register;
    field('nis').hidden = !register;
    field('idmode').hidden = !register;

    input('password').autocomplete = register ? 'new-password' : 'current-password';
    input('password').placeholder = register ? 'Minimal 8 karakter' : 'Masukkan kata sandi';

    const hint = field('password').querySelector('.af-hint');
    hint.textContent = register ? 'Gunakan minimal 8 karakter.' : '';
    hint.hidden = !register;

    formEl.querySelector('.af-submit-label').textContent = register ? 'Daftar' : 'Login';

    const switchWrap = formEl.querySelector('[data-links="switch"]');
    switchWrap.hidden = roleKey !== 'siswa';
    switchWrap.querySelector('button').textContent = register ? 'Sudah punya akun? Login' : 'Belum punya akun? Daftar';

    syncIdentifier();
    clearErrors();
  }

  function resetForm() {
    formEl.querySelector('form').reset();
    const toggle = formEl.querySelector('.af-toggle');
    input('password').type = 'password';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('aria-label', 'Tampilkan kata sandi');
    toggle.innerHTML = Icons.svg('eye');
    state.idMode = 'username';
    clearErrors();
    setBusy(false);
  }

  function setBusy(busy) {
    state.busy = busy;
    const button = formEl.querySelector('.af-submit');
    button.disabled = busy;
    const label = state.mode === 'register' ? 'Daftar' : 'Login';
    button.innerHTML = busy
      ? '<span class="af-spinner" aria-hidden="true"></span><span>Memproses...</span>'
      : `<span class="af-submit-label">${label}</span>`;
  }

  function focusFirstField() {
    const target = state.mode === 'register' ? input('nama') : input('identifier');
    target.focus({ preventScroll: true });
  }

  // ---------- Kartu di tengah baris (layar sentuh) ----------
  // Di ponsel kartu berjajar dan digeser. Kartu yang paling dekat ke tengah ikut "maju",
  // menggantikan efek sorot (hover) yang tidak ada di layar sentuh.
  let centerQueued = false;
  function updateCenter() {
    centerQueued = false;
    if (!stage) return;
    const scrollable = stage.scrollWidth > stage.clientWidth + 4;
    let best = null;
    let bestDistance = Infinity;
    const mid = stage.getBoundingClientRect().left + stage.clientWidth / 2;

    Object.values(cards).forEach((card) => {
      card.classList.remove('is-center');
      if (!scrollable) return;
      const rect = card.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - mid);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = card;
      }
    });
    if (best) best.classList.add('is-center');
  }

  function queueCenter() {
    if (centerQueued) return;
    centerQueued = true;
    requestAnimationFrame(updateCenter);
  }

  // ---------- Animasi ----------

  function removeFlyer() {
    if (formEl) formEl.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    if (!flyer) return;
    flyer.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    holder.appendChild(formEl);
    flyer.remove();
    flyer = null;
  }

  // Menghapus sisa animasi dan gaya sementara pada kartu, judul, dan keterangan
  function clearChoreography() {
    if (!overlay) return;
    overlay.querySelectorAll('.role-card, .auth-head, .auth-foot').forEach((el) => {
      el.getAnimations().forEach((a) => a.cancel());
      el.style.transition = '';
    });
  }

  function resetStage() {
    removeFlyer();
    clearChoreography();
    stage.classList.remove('is-intro', 'is-choosing', 'is-wait');
    panel.classList.remove('is-form');
    Object.values(cards).forEach((card) => {
      card.classList.remove('is-picked', 'is-away');
      card.inert = false;
    });
    state.chosen = null;
    state.transition = false;
    resetForm();
  }

  function playIntro() {
    resetStage();
    void stage.offsetWidth; // paksa reflow agar animasi mulai dari awal
    stage.classList.add('is-intro');
    const run = ++state.runId;
    setTimeout(() => {
      if (state.runId === run) {
        stage.classList.remove('is-intro');
        queueCenter();
      }
    }, reducedMotion() ? 0 : 2600);
  }

  // Membuat kartu "terbang": depan = gambar kartu, belakang = form. Ukuran akhir diatur CSS.
  function buildFlyer(roleKey, mode) {
    const role = ROLES.find((r) => r.key === roleKey);
    const el = document.createElement('div');
    el.className = 'flyer';
    el.dataset.role = roleKey;
    el.dataset.mode = mode;
    el.innerHTML = `
      <div class="flyer-inner">
        <div class="flyer-front"><img src="${artUrl(roleKey, role.card)}" alt="" draggable="false" decoding="sync"></div>
        <div class="flyer-back"></div>
      </div>`;
    el.querySelector('.flyer-back').appendChild(formEl);
    layer.appendChild(el);
    return el;
  }

  const animate = (el, keyframes, options) => {
    const anim = el.animate(keyframes, { fill: 'forwards', ...options, duration: reducedMotion() ? 1 : options.duration });
    return anim.finished.catch(() => {});
  };

  async function choose(roleKey, mode) {
    if (state.transition || state.chosen) return;

    state.transition = true;
    state.chosen = roleKey;
    state.mode = mode;
    state.idMode = 'username';
    state.runId += 1; // hentikan penghitung waktu animasi pembuka
    const run = state.runId;

    stage.classList.remove('is-intro');
    setFormMode(roleKey, mode);

    // Posisi kartu yang terlihat sekarang (termasuk efek "maju" saat disorot)
    const source = cards[roleKey];
    const start = source.querySelector('.role-pop').getBoundingClientRect();

    flyer = buildFlyer(roleKey, mode);
    formEl.querySelector('.af-body').inert = true;

    // Ukuran dan posisi akhir (tanpa transform) untuk menghitung titik awal
    const end = flyer.querySelector('.flyer-front').getBoundingClientRect();
    const scale = start.width / end.width;
    const dx = start.left + start.width / 2 - (end.left + end.width / 2);
    const dy = start.top + start.height / 2 - (end.top + end.height / 2);
    const from = `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;

    // Kartu asli disembunyikan pada frame yang sama dengan munculnya kartu terbang,
    // dua kartu lain memudar, judul dan keterangan ikut memudar.
    flyer.style.transform = from;
    source.classList.add('is-picked');
    stage.classList.add('is-choosing');
    panel.classList.add('is-form');
    Object.entries(cards).forEach(([key, el]) => {
      if (key !== roleKey) {
        el.classList.add('is-away');
        el.inert = true;
      }
    });
    source.inert = true;

    const ease = 'cubic-bezier(0.5, 0.02, 0.15, 1)';
    const move = animate(flyer, [{ transform: from }, { transform: 'translate3d(0, 0, 0) scale(1)' }], { duration: 950, easing: ease });
    const spin = animate(flyer.querySelector('.flyer-inner'), [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], {
      duration: 950,
      easing: 'cubic-bezier(0.45, 0.05, 0.2, 1)'
    });
    await Promise.all([move, spin]);
    if (state.runId !== run || !flyer) return; // overlay ditutup di tengah animasi

    // Putaran selesai: render datar supaya form tajam, lalu lepas animasi
    flyer.style.transform = '';
    flyer.classList.add('is-flat');
    flyer.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    formEl.querySelector('.af-body').inert = false;

    state.transition = false;
    focusFirstField();
  }

  // ---------- Kembali ke pilihan peran ----------
  // Urutan gerak (total sekitar 1,2 detik):
  //   0 ms    isi form memudar, kartu mulai terangkat dan berputar balik
  //   0-1100  kartu melayang membentuk busur ke posisi aslinya sambil mengecil
  //   ~900    kartu "mendarat": sedikit membesar lalu mantap di ukuran sebenarnya
  //   300+    dua kartu lain muncul dari sisi masing-masing, berurutan
  //   600+    judul dan keterangan naik dan muncul kembali
  // Semua memakai transform dan opacity, sehingga tetap halus dan tajam.
  async function back() {
    if (state.transition || !state.chosen || state.busy || !flyer) return;

    state.transition = true;
    const run = ++state.runId;
    const source = cards[state.chosen];
    const order = Object.keys(cards);
    const sourceIndex = order.indexOf(state.chosen);
    const fast = reducedMotion();

    // Tujuan = kotak kartu asli. Titik asal = pusat kartu terbang (kartu depan selalu
    // berada di tengahnya dan selebar kartu terbang itu sendiri).
    const target = source.getBoundingClientRect();
    const origin = flyer.getBoundingClientRect();
    const scale = target.width / origin.width;
    const dx = target.left + target.width / 2 - (origin.left + origin.width / 2);
    const dy = target.top + target.height / 2 - (origin.top + origin.height / 2);
    const lift = Math.min(78, 34 + Math.abs(dy) * 0.16);

    formEl.querySelector('.af-body').inert = true;
    flyer.style.willChange = 'transform';

    // Kembali ke keadaan 3D pada sudut yang sama (180 derajat) agar putar balik mulus
    const inner = flyer.querySelector('.flyer-inner');
    flyer.classList.remove('is-flat');
    inner.style.transform = 'rotateY(180deg)';
    await frame();
    if (state.runId !== run || !flyer) return;

    const DURATION = 1100;
    const timing = (extra) => ({ duration: fast ? 1 : DURATION, fill: 'forwards', ...extra });

    // 1. Isi form memudar cepat, kartu terbang melayang kembali
    animate(formEl, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' });

    const move = animate(
      flyer,
      [{ transform: 'translate3d(0, 0, 0) scale(1)' }, { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${scale})` }],
      timing({ easing: 'cubic-bezier(0.62, 0, 0.16, 1)' })
    );
    const spin = animate(inner, [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }], timing({ easing: 'cubic-bezier(0.55, 0, 0.12, 1)' }));

    // 2. Busur: kartu terangkat di tengah perjalanan, lalu turun
    const arc = inner.animate(
      [{ translate: '0 0' }, { translate: `0 ${-lift}px`, offset: 0.42 }, { translate: '0 0' }],
      timing({ easing: 'ease-in-out', composite: 'replace' })
    );
    // 3. Pendaratan: membesar sedikit lalu mantap
    const settle = inner.animate(
      [{ scale: '1' }, { scale: '1', offset: 0.72 }, { scale: '1.055', offset: 0.9 }, { scale: '1' }],
      timing({ easing: 'cubic-bezier(0.3, 0, 0.2, 1)' })
    );
    [arc, settle].forEach((a) => a.finished.catch(() => {}));

    // 4. Kartu lain muncul dari sisi masing-masing, berurutan; judul dan keterangan menyusul
    stage.classList.remove('is-choosing');
    const entrances = [];
    order.forEach((key, index) => {
      if (key === state.chosen) return;
      const el = cards[key];
      const side = index < sourceIndex ? -1 : 1;
      const distance = Math.abs(index - sourceIndex);
      el.style.transition = 'none'; // gerak diatur animasi di bawah, bukan transisi CSS
      el.classList.remove('is-away');
      el.inert = false;
      entrances.push(
        animate(
          el,
          [
            { opacity: 0, transform: `translate3d(${side * 38}px, 22px, 0) scale(0.9)` },
            { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' }
          ],
          { duration: fast ? 1 : 760, delay: fast ? 0 : 320 + (distance - 1) * 110, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)', fill: 'backwards' }
        )
      );
    });

    panel.classList.remove('is-form');
    const fades = [...panel.querySelectorAll('.auth-head, .auth-foot')].map((el, index) => {
      el.style.transition = 'none';
      return animate(
        el,
        [
          { opacity: 0, transform: 'translateY(14px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ],
        { duration: fast ? 1 : 640, delay: fast ? 0 : 560 + index * 80, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)', fill: 'backwards' }
      );
    });

    await Promise.all([move, spin, ...entrances, ...fades]);
    if (state.runId !== run) return;

    // Kartu asli kembali terlihat pada frame yang sama dengan kartu terbang dilepas
    source.classList.remove('is-picked');
    source.inert = false;
    removeFlyer();
    clearChoreography();
    resetForm();
    state.chosen = null;
    state.transition = false;
    queueCenter();
    source.querySelector('.role-pick').focus({ preventScroll: true });
  }

  function switchMode() {
    if (state.transition || state.busy || state.chosen !== 'siswa') return;
    state.mode = state.mode === 'register' ? 'login' : 'register';
    state.idMode = 'username';
    flyer.dataset.mode = state.mode; // tinggi kartu menyesuaikan lewat transisi CSS
    setFormMode('siswa', state.mode);
    input('password').value = '';
    focusFirstField();
  }

  function shake() {
    if (!flyer) return;
    flyer.classList.remove('is-shaking');
    void flyer.offsetWidth;
    flyer.classList.add('is-shaking');
  }

  // ---------- Buka dan tutup ----------

  function open({ mode = 'login', next = null } = {}) {
    if (window.Auth && window.Auth.user) return;
    ensureOverlay();
    if (state.open) return;

    // tutup menu seluler bila sedang terbuka
    const navToggle = document.querySelector('.nav-toggle[aria-expanded="true"]');
    if (navToggle) navToggle.click();

    state.open = true;
    state.next = sanitizeNext(next);
    state.lastFocus = document.activeElement;
    overlay.inert = false;
    document.body.classList.add('auth-locked');
    void overlay.offsetWidth;
    overlay.classList.add('is-open');

    // Animasi baru dimulai setelah gambar kartu siap dan sudah didekode, supaya frame
    // pertamanya tidak tersendat. Biasanya sudah siap sejak halaman dimuat, jadi tidak
    // terasa menunggu. Paling lama menunggu 1,5 detik (setelah itu memakai SVG langsung).
    if (!art.done) stage.classList.add('is-wait');
    const begin = async () => {
      await Promise.race([preloadArt(), timeout(1500)]);
      if (!state.open) return;
      applyArt();
      await Promise.race([decodeAll(), timeout(400)]);
      if (!state.open) return;

      if (mode === 'register') {
        resetStage();
        queueCenter();
        wait(520).then(() => state.open && choose('siswa', 'register'));
      } else {
        playIntro();
        queueCenter();
        wait(900).then(() => {
          if (state.open && !state.chosen) cards.administrator.querySelector('.role-pick').focus({ preventScroll: true });
        });
      }
    };
    begin();
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    state.runId += 1;
    overlay.classList.remove('is-open');
    overlay.inert = true;
    document.body.classList.remove('auth-locked');

    setTimeout(() => {
      if (!state.open) resetStage();
    }, reducedMotion() ? 0 : 400);

    if (/[?&](masuk|daftar)=/.test(window.location.search)) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (state.lastFocus && typeof state.lastFocus.focus === 'function') state.lastFocus.focus({ preventScroll: true });
  }

  // ---------- Kirim form ----------

  async function submit(event) {
    event.preventDefault();
    if (state.busy || state.transition) return;

    clearErrors();
    const register = state.mode === 'register';
    const data = {
      nama: input('nama').value.trim().replace(/\s+/g, ' '),
      nis: input('nis').value.trim(),
      identifier: input('identifier').value.trim(),
      password: input('password').value
    };

    const errors = {};
    if (register) {
      if (!data.nama) errors.nama = 'Nama lengkap wajib diisi.';
      else if (data.nama.length < 2) errors.nama = 'Nama lengkap minimal 2 karakter.';
      if (!data.nis) errors.nis = 'NIS wajib diisi.';
      else if (!/^\d{5}$/.test(data.nis)) errors.nis = 'NIS harus 5 digit angka.';

      if (!data.identifier) errors.identifier = state.idMode === 'email' ? 'Email wajib diisi.' : 'Username wajib diisi.';
      else if (state.idMode === 'email' && !EMAIL_PATTERN.test(data.identifier)) errors.identifier = 'Format email tidak valid.';
      else if (state.idMode === 'username' && !USERNAME_PATTERN.test(data.identifier)) {
        errors.identifier = 'Username 3–30 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.';
      }
    } else if (!data.identifier) {
      errors.identifier = 'Username/email wajib diisi.';
    }
    if (!data.password) errors.password = 'Kata sandi wajib diisi.';
    else if (register && data.password.length < 8) errors.password = 'Kata sandi minimal 8 karakter.';

    Object.entries(errors).forEach(([name, message]) => setFieldError(name, message));
    const firstInvalid = FIELDS.find((name) => errors[name]);
    if (firstInvalid) {
      input(firstInvalid).focus();
      shake();
      return;
    }

    setBusy(true);
    try {
      const result = register
        ? await AuthAPI.register({
            nama: data.nama,
            nis: data.nis,
            [state.idMode]: data.identifier,
            password: data.password
          })
        : await AuthAPI.login(state.chosen, data.identifier, data.password);

      const user = result.data;
      Auth.setUser(user);
      const first = String(user.nama).trim().split(/\s+/)[0];
      Auth.toast(register ? `Akun berhasil dibuat. Selamat datang, ${first}.` : `Selamat datang, ${first}.`);

      const next = state.next;
      close();
      if (next && next !== currentPage()) window.location.href = next;
    } catch (err) {
      const lines =
        err instanceof TypeError
          ? ['Sistem tidak dapat dihubungi. Periksa koneksi atau pastikan server sudah dijalankan.']
          : err.details && err.details.length > 1
            ? err.details
            : [err.message || 'Terjadi kesalahan. Coba lagi.'];
      showMessage(lines);
      shake();
      if (!register) input('password').select();
      setBusy(false);
    }
  }

  // ---------- Event ----------

  function bindEvents() {
    overlay.addEventListener('click', (event) => {
      const pick = event.target.closest('[data-pick]');
      if (pick) {
        choose(pick.dataset.pick, 'login');
        return;
      }

      const action = event.target.closest('[data-action]');
      if (!action) return;

      switch (action.dataset.action) {
        case 'close':
          close();
          break;
        case 'register':
          choose('siswa', 'register');
          break;
        case 'back':
          back();
          break;
        case 'switch-mode':
          switchMode();
          break;
        case 'id-mode':
          state.idMode = action.dataset.idMode;
          input('identifier').value = '';
          setFieldError('identifier', '');
          syncIdentifier();
          input('identifier').focus();
          break;
        case 'toggle-password': {
          const pw = input('password');
          const show = pw.type === 'password';
          pw.type = show ? 'text' : 'password';
          action.setAttribute('aria-pressed', String(show));
          action.setAttribute('aria-label', show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
          action.innerHTML = Icons.svg(show ? 'eye-off' : 'eye');
          pw.focus();
          break;
        }
        default:
      }
    });

    formEl.querySelector('form').addEventListener('submit', submit);

    // NIS hanya angka, maksimal 5 digit
    input('nis').addEventListener('input', () => {
      input('nis').value = input('nis').value.replace(/\D/g, '').slice(0, 5);
    });

    // Pesan galat sebuah kolom hilang saat pengguna mulai memperbaikinya
    FIELDS.forEach((name) => {
      input(name).addEventListener('input', () => {
        if (input(name).getAttribute('aria-invalid') === 'true') setFieldError(name, '');
      });
    });

    stage.addEventListener('scroll', queueCenter, { passive: true });
    window.addEventListener('resize', queueCenter);

    // Sentuhan langsung memajukan kartu (tanpa menunggu klik selesai)
    stage.addEventListener(
      'pointerdown',
      (event) => {
        if (event.pointerType === 'mouse') return;
        const card = event.target.closest('.role-card');
        if (!card || stage.classList.contains('is-choosing')) return;
        Object.values(cards).forEach((c) => c.classList.toggle('is-touched', c === card));
      },
      { passive: true }
    );
    const clearTouched = () => Object.values(cards).forEach((c) => c.classList.remove('is-touched'));
    stage.addEventListener('pointerup', clearTouched, { passive: true });
    stage.addEventListener('pointercancel', clearTouched, { passive: true });

    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }

      if (event.key !== 'Tab') return;

      // Fokus tetap berputar di dalam overlay
      const focusables = [...overlay.querySelectorAll('button, input, a[href]')].filter(
        (el) => !el.disabled && el.tabIndex >= 0 && !el.closest('[inert]') && !el.closest('[hidden]') && el.getClientRects().length > 0
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  // Esc selalu menutup login, termasuk saat fokus sempat hilang di tengah animasi
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.open) close();
  });

  // Pengunjung mengarah ke tombol Login: siapkan gambar kartu lebih dulu (pra-klik)
  const warm = (event) => {
    if (event.target.closest && event.target.closest('[data-open-login], [data-open-register]')) preloadArt();
  };
  document.addEventListener('pointerover', warm, { passive: true });
  document.addEventListener('touchstart', warm, { passive: true });

  // Tombol dan tautan di halaman mana pun yang membuka login atau daftar
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-open-login], [data-open-register]');
    if (!trigger) return;
    event.preventDefault();
    open({ mode: trigger.hasAttribute('data-open-register') ? 'register' : 'login' });
  });

  // Dibuka otomatis lewat alamat: index.html?masuk=1&next=patients.html atau ?daftar=1
  Auth.ready.then((user) => {
    const params = new URLSearchParams(window.location.search);
    const next = sanitizeNext(params.get('next'));

    if (user) {
      if (params.has('masuk') && next && next !== currentPage()) window.location.replace(next);
      return;
    }

    if (params.has('daftar')) open({ mode: 'register', next });
    else if (params.has('masuk')) open({ mode: 'login', next });
  });

  window.LoginOverlay = { open, close };
})();
