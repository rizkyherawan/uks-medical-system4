// ============================================================
// STATUS LOGIN DI BROWSER
//
// Tugas file ini:
//  1. Bertanya ke server siapa yang sedang login (GET /api/auth/me).
//  2. Menampilkan atau menyembunyikan elemen sesuai peran, lewat atribut
//       data-show-for="guest siswa petugas administrator auth"
//     ("guest" = belum login, "auth" = peran apa pun asal sudah login).
//  3. Mengisi tombol Login atau menu pengguna di header ([data-auth-slot]).
//  4. Menjaga halaman yang butuh login, lewat atribut pada <body>:
//       data-auth="petugas administrator"
//
// PENTING: semua ini hanya mengatur TAMPILAN. Yang benar-benar melindungi data
// adalah server: setiap permintaan ke /api dicek ulang di sisi server (middleware
// requireAuth dan requireRole), sehingga mengubah tampilan lewat browser
// tidak memberi akses ke data.
// ============================================================
(() => {
  'use strict';

  const ROLE_LABEL = { administrator: 'Administrator', petugas: 'Petugas UKS', siswa: 'Siswa' };
  const ROLE_HOME = { administrator: 'akun.html', petugas: 'patients.html', siswa: 'tensi-saya.html' };

  // Disimpan di sessionStorage hanya agar menu langsung benar saat halaman dibuka
  // (tidak ada kedipan). Bukan untuk keamanan, dan selalu diperbarui dari server.
  const HINT_KEY = 'uks.auth.hint';

  const state = { user: null };
  const listeners = [];
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });

  const esc = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const currentRole = () => (state.user ? state.user.role : 'guest');
  const initial = (nama) => (String(nama || '?').trim()[0] || '?').toUpperCase();
  const firstName = (nama) => String(nama || '').trim().split(/\s+/)[0] || 'Pengguna';

  function readHint() {
    try {
      return JSON.parse(sessionStorage.getItem(HINT_KEY));
    } catch (_) {
      return null;
    }
  }

  function writeHint(user) {
    try {
      if (user) {
        sessionStorage.setItem(HINT_KEY, JSON.stringify({ role: user.role, nama: user.nama, username: user.username, email: user.email }));
      } else {
        sessionStorage.removeItem(HINT_KEY);
      }
    } catch (_) {
      // penyimpanan tidak tersedia: abaikan
    }
  }

  // ---------- Tampilan menurut peran ----------

  function applyVisibility() {
    const role = currentRole();
    document.querySelectorAll('[data-show-for]').forEach((el) => {
      const allowed = el.dataset.showFor.split(/\s+/);
      el.hidden = !(allowed.includes(role) || (allowed.includes('auth') && role !== 'guest'));
    });
  }

  function renderSlots() {
    const user = state.user;

    document.querySelectorAll('[data-auth-slot]').forEach((slot) => {
      if (!user) {
        slot.innerHTML = `
          <button type="button" class="btn btn-white btn-sm auth-login-btn" data-open-login>
            ${Icons.svg('login')}<span>Login</span>
          </button>`;
        return;
      }

      const label = ROLE_LABEL[user.role] || user.role;
      slot.innerHTML = `
        <div class="user-menu">
          <button type="button" class="user-chip" aria-haspopup="true" aria-expanded="false" aria-controls="user-panel">
            <span class="user-avatar" aria-hidden="true">${esc(initial(user.nama))}</span>
            <span class="user-meta"><strong>${esc(firstName(user.nama))}</strong><small>${esc(label)}</small></span>
            ${Icons.svg('chevron-down', 'user-caret')}
          </button>
          <div class="user-panel" id="user-panel">
            <div class="user-panel-head">
              <span class="user-avatar user-avatar-lg" aria-hidden="true">${esc(initial(user.nama))}</span>
              <div class="user-panel-id">
                <strong>${esc(user.nama)}</strong>
                <span>${esc(user.username || user.email || '')}</span>
                <span class="role-badge role-${esc(user.role)}">${esc(label)}</span>
              </div>
            </div>
            <a class="user-link" href="profil.html">${Icons.svg('user')}<span>Profil saya</span></a>
            <button type="button" class="user-link user-link-danger" data-action="logout">${Icons.svg('logout')}<span>Keluar</span></button>
          </div>
        </div>`;
    });
  }

  function refreshUi() {
    applyVisibility();
    renderSlots();
    listeners.forEach((fn) => fn(state.user));
  }

  function setUser(user) {
    state.user = user;
    writeHint(user);
    refreshUi();
  }

  // ---------- Penjaga halaman ----------

  function redirectToLogin() {
    const page = window.location.pathname.split('/').pop() || 'index.html';
    window.location.replace(`index.html?masuk=1&next=${encodeURIComponent(page)}`);
  }

  function showDenied(required) {
    const main = document.querySelector('main');
    if (!main) return;

    const names = required.includes('auth')
      ? 'pengguna yang sudah login'
      : required.map((r) => ROLE_LABEL[r] || r).join(' dan ');
    const role = currentRole();
    const home = ROLE_HOME[role] || 'index.html';

    main.innerHTML = `
      <div class="container">
        <div class="state denied">
          <span class="state-icon">${Icons.svg('lock')}</span>
          <h1>Akses terbatas</h1>
          <p>Halaman ini hanya dapat dibuka oleh ${esc(names)}. Anda login sebagai ${esc(ROLE_LABEL[role] || role)}.</p>
          <div class="denied-actions">
            <a class="btn btn-primary btn-sm" href="${esc(home)}">Buka halaman saya</a>
            <a class="btn btn-outline btn-sm" href="index.html">Kembali ke beranda</a>
          </div>
        </div>
      </div>`;
  }

  function guardPage() {
    const required = (document.body.dataset.auth || '').split(/\s+/).filter(Boolean);
    if (required.length === 0) return;

    const role = currentRole();
    if (role === 'guest') {
      redirectToLogin();
      return;
    }
    if (!required.includes('auth') && !required.includes(role)) showDenied(required);
  }

  // ---------- Notifikasi ----------

  let toastEl = null;
  let toastTimer = null;

  function toast(message, type = 'success') {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'auth-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.classList.toggle('is-error', type === 'error');
    toastEl.innerHTML = `${Icons.svg(type === 'error' ? 'alert' : 'check')}<span>${esc(message)}</span>`;
    // paksa reflow agar animasi masuk selalu berjalan
    void toastEl.offsetWidth;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 3600);
  }

  // ---------- Keluar ----------

  async function logout() {
    try {
      await AuthAPI.logout();
    } catch (_) {
      // tetap lanjut keluar di sisi browser
    }
    writeHint(null);
    window.location.href = 'index.html';
  }

  // ---------- Menu pengguna ----------

  function closeUserMenu() {
    document.querySelectorAll('.user-menu.is-open').forEach((menu) => {
      menu.classList.remove('is-open');
      const chip = menu.querySelector('.user-chip');
      if (chip) chip.setAttribute('aria-expanded', 'false');
    });
  }

  document.addEventListener('click', (event) => {
    const chip = event.target.closest('.user-chip');
    if (chip) {
      const menu = chip.closest('.user-menu');
      const willOpen = !menu.classList.contains('is-open');
      closeUserMenu();
      if (willOpen) {
        menu.classList.add('is-open');
        chip.setAttribute('aria-expanded', 'true');
      }
      return;
    }

    if (event.target.closest('[data-action="logout"]')) {
      logout();
      return;
    }

    if (!event.target.closest('.user-menu')) closeUserMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeUserMenu();
  });

  // ---------- Mulai ----------

  function afterLoad(fn) {
    if (document.readyState === 'complete') fn();
    else window.addEventListener('load', fn, { once: true });
  }

  const hint = readHint();
  if (hint) state.user = hint;
  applyVisibility();
  renderSlots();

  AuthAPI.me()
    .then((result) => {
      state.user = result.data;
    })
    .catch((err) => {
      // 401 = memang belum login. Galat jaringan = server tidak terjangkau:
      // pertahankan perkiraan terakhir supaya halaman tidak terlempar keluar.
      if (!(err instanceof TypeError)) state.user = null;
    })
    .then(() =>
      // Tunggu sampai SEMUA skrip halaman selesai dimuat. Kalau penjaga bertindak lebih awal,
      // halaman "Akses terbatas" bisa menimpa <main> sebelum skrip halaman sempat berjalan.
      afterLoad(() => {
        writeHint(state.user);
        refreshUi();
        guardPage();
        document.documentElement.classList.add('auth-ready');
        resolveReady(state.user);
      })
    );

  window.Auth = {
    ready,
    get user() {
      return state.user;
    },
    role: currentRole,
    setUser,
    logout,
    toast,
    homeFor: (role) => ROLE_HOME[role] || 'index.html',
    onChange: (fn) => listeners.push(fn)
  };
})();
