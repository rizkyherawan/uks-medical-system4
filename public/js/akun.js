// ============================================================
// Halaman Kelola Akun (hanya Administrator)
// Administrator memegang semua akun: membuat, melihat, mengubah, dan menghapus akun
// Administrator, Petugas UKS, dan Siswa. Daftar dibaca langsung dari database server.
// Server tetap memeriksa peran di setiap permintaan, jadi halaman ini
// tidak bisa dipakai oleh pengguna yang bukan Administrator.
// ============================================================
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const icon = (name) => Icons.svg(name);

  const ROLE_LABEL = { administrator: 'Administrator', petugas: 'Petugas UKS', siswa: 'Siswa' };
  const ROLE_HINT = {
    petugas: 'Petugas UKS menginput data pasien sakit, tekanan darah, obat keluar, dan peminjaman barang.',
    administrator: 'Administrator memegang seluruh kendali sistem, termasuk semua akun dan konten beranda.',
    siswa: 'Siswa hanya bisa melihat hasil tekanan darahnya sendiri dan beranda.'
  };

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;

  const form = $('acc-form');
  const fields = {
    nama: $('nama'),
    nis: $('nis'),
    username: $('username'),
    email: $('email'),
    password: $('password')
  };
  const roleSelect = $('role');
  const dialog = $('confirm-dialog');

  let all = []; // gabungan akun staf + siswa
  let filter = 'semua';
  let editing = null; // { type, key } saat mode ubah
  let pending = null;
  let loginMode = 'username'; // pilihan Siswa saat membuat akun

  // ---------- Util ----------

  const esc = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const initial = (nama) => (String(nama || '?').trim()[0] || '?').toUpperCase();

  function formatDate(value, withTime = false) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return '';
    const opts = withTime
      ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'short', year: 'numeric' };
    return date.toLocaleString('id-ID', opts);
  }

  const friendly = (err) =>
    err instanceof TypeError
      ? 'Sistem tidak dapat dihubungi. Periksa koneksi atau pastikan server sudah dijalankan, lalu coba lagi.'
      : err.message || 'Terjadi kesalahan.';

  const isSelf = (row) =>
    row.type === 'staff' && Auth.user && Auth.user.role === row.role && Auth.user.username === row.username;

  // ---------- Status server ----------

  function setServer(state, text) {
    $('server-line').dataset.state = state;
    $('server-text').textContent = text;
  }

  // ---------- Muat data ----------

  async function load({ silent = false } = {}) {
    if (!silent) {
      $('loading').hidden = false;
      $('table-wrap').hidden = true;
      $('empty-state').hidden = true;
    }
    $('acc-error').hidden = true;
    setServer('loading', 'Memeriksa koneksi server...');

    try {
      const [overview, staffRes, studentRes] = await Promise.all([
        AccountAPI.overview(),
        AccountAPI.listStaff(),
        AccountAPI.listStudents()
      ]);

      all = [
        ...staffRes.data.map((a) => ({ ...a, type: 'staff', key: a.id })),
        ...studentRes.data.map((a) => ({ ...a, type: 'student', key: a.nis, role: 'siswa' }))
      ];

      const o = overview.data;
      $('stat-admin').textContent = o.administrator;
      $('stat-petugas').textContent = o.petugas;
      $('stat-siswa').textContent = o.siswa;
      $('stat-total').textContent = o.total;

      const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setServer('ok', `Terhubung ke database server. ${o.total} akun tersimpan. Diperbarui ${time}.`);
      $('loading').hidden = true;
      render();
    } catch (err) {
      all = [];
      ['admin', 'petugas', 'siswa', 'total'].forEach((k) => ($(`stat-${k}`).textContent = '-'));
      $('loading').hidden = true;
      $('table-wrap').hidden = true;
      $('result-info').textContent = '';
      $('acc-error-text').textContent = friendly(err);
      $('acc-error').hidden = false;
      setServer('error', 'Tidak terhubung ke server.');
    }
  }

  // ---------- Daftar ----------

  function visible() {
    const q = $('search').value.trim().toLowerCase();
    return all.filter((a) => {
      if (filter !== 'semua' && a.role !== filter) return false;
      if (!q) return true;
      return [a.nama, a.username, a.email, a.nis, ROLE_LABEL[a.role]].some((v) => String(v ?? '').toLowerCase().includes(q));
    });
  }

  function render() {
    const rows = visible();
    const filtering = filter !== 'semua' || $('search').value.trim();
    $('result-info').textContent = filtering ? `${rows.length} dari ${all.length} akun` : `${all.length} akun`;

    if (rows.length === 0) {
      $('table-wrap').hidden = true;
      $('empty-state').innerHTML = `
        <span class="state-icon">${icon(all.length ? 'search' : 'users')}</span>
        <h3>${all.length ? 'Tidak ada akun yang cocok' : 'Belum ada akun'}</h3>
        <p>${all.length ? 'Ubah kata pencarian atau pilih peran lain.' : 'Buat akun pertama lewat formulir di samping.'}</p>`;
      $('empty-state').hidden = false;
      return;
    }

    $('empty-state').hidden = true;
    $('table-wrap').hidden = false;
    $('acc-rows').innerHTML = rows
      .map((a) => {
        const self = isSelf(a);
        // Baris keterangan di bawah nama: identitas untuk login (username/email) dan NIS untuk Siswa
        const ids = [a.type === 'student' ? `NIS ${esc(a.nis)}` : '', a.username ? `@${esc(a.username)}` : '', a.email ? esc(a.email) : '']
          .filter(Boolean)
          .map((t) => `<span>${t}</span>`)
          .join('');
        const last = a.last_login ? esc(formatDate(a.last_login, true)) : '<span class="never">Belum pernah masuk</span>';
        const isEditing = editing && editing.type === a.type && editing.key === a.key;
        return `
        <tr class="${isEditing ? 'is-editing' : ''}">
          <td class="cell-patient" data-label="Akun">
            <div class="patient-cell">
              <span class="avatar" aria-hidden="true">${esc(initial(a.nama))}</span>
              <div>
                <p class="patient-name">${esc(a.nama)}${self ? ' <span class="self-tag">Anda</span>' : ''}</p>
                <p class="acc-ids">${ids}</p>
              </div>
            </div>
          </td>
          <td data-label="Peran"><span class="role-badge role-${esc(a.role)}">${esc(ROLE_LABEL[a.role])}</span></td>
          <td class="date" data-label="Login terakhir">${last}<span class="date-time">Dibuat ${esc(formatDate(a.created_at))}</span></td>
          <td class="cell-actions">
            <div class="row-actions">
              <button type="button" class="icon-btn" data-action="edit" data-type="${a.type}" data-key="${esc(a.key)}"
                      aria-label="Ubah akun ${esc(a.nama)}" title="Ubah">${icon('edit')}</button>
              ${
                self
                  ? ''
                  : `<button type="button" class="icon-btn icon-btn-danger" data-action="delete" data-type="${a.type}" data-key="${esc(a.key)}"
                      aria-label="Hapus akun ${esc(a.nama)}" title="Hapus">${icon('trash')}</button>`
              }
            </div>
          </td>
        </tr>`;
      })
      .join('');
  }

  // ---------- Form ----------

  function setError(name, message) {
    const el = $(`err-${name}`);
    if (!el) return;
    fields[name].setAttribute('aria-invalid', message ? 'true' : 'false');
    el.textContent = message || '';
    el.hidden = !message;
  }

  const clearErrors = () => Object.keys(fields).forEach((n) => setError(n, ''));

  // Menampilkan kolom sesuai peran dan mode (buat / ubah)
  function syncForm() {
    const role = roleSelect.value;
    const student = role === 'siswa';
    const editMode = Boolean(editing);

    $('role-hint').textContent = ROLE_HINT[role];
    $('nis-field').hidden = !student;
    fields.nis.readOnly = editMode;

    // Siswa baru: pilih username ATAU email. Siswa yang diubah: kedua kolom boleh diisi.
    $('mode-field').hidden = !student || editMode;
    $('username-field').hidden = student && !editMode && loginMode !== 'username';
    $('email-field').hidden = student && !editMode && loginMode !== 'email';
    $('email-optional').hidden = student && !editMode;
    $('email-optional').textContent = student && editMode ? '(opsional, isi salah satu)' : '(opsional)';
    $('email-optional').hidden = student && !editMode;

    document.querySelectorAll('.seg-btn').forEach((b) => {
      const on = b.dataset.mode === loginMode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });

    $('pw-label').textContent = editMode ? 'Kata sandi baru' : 'Kata sandi awal';
    fields.password.placeholder = editMode ? 'Kosongkan jika tidak diubah' : 'Minimal 8 karakter';
    $('pw-hint').textContent = editMode
      ? 'Kosongkan jika kata sandi tidak ingin diubah.'
      : 'Berikan kata sandi ini kepada pemilik akun.';
  }

  function resetForm() {
    form.reset();
    editing = null;
    loginMode = 'username';
    roleSelect.disabled = false;
    $('form-title-text').textContent = 'Buat akun baru';
    $('submit-label').textContent = 'Buat akun';
    $('mode-badge').hidden = true;
    $('cancel-btn').hidden = true;
    $('form-error').hidden = true;
    clearErrors();
    fields.password.type = 'password';
    syncForm();
    render();
  }

  function startEdit(type, key) {
    const acc = all.find((a) => a.type === type && String(a.key) === String(key));
    if (!acc) return;

    editing = { type, key: acc.key };
    roleSelect.value = acc.role;
    roleSelect.disabled = true;
    fields.nama.value = acc.nama;
    fields.nis.value = acc.nis || '';
    fields.username.value = acc.username || '';
    fields.email.value = acc.email || '';
    fields.password.value = '';
    $('form-title-text').textContent = `Ubah akun ${ROLE_LABEL[acc.role]}`;
    $('submit-label').textContent = 'Simpan perubahan';
    $('mode-badge').hidden = false;
    $('cancel-btn').hidden = false;
    $('form-error').hidden = true;
    clearErrors();
    syncForm();
    render();

    const narrow = window.matchMedia('(max-width: 1040px)').matches;
    $('form-card').scrollIntoView({ behavior: 'smooth', block: narrow ? 'start' : 'nearest' });
    fields.nama.focus({ preventScroll: true });
  }

  function collect() {
    const role = roleSelect.value;
    const data = {
      nama: fields.nama.value.trim().replace(/\s+/g, ' '),
      username: fields.username.value.trim(),
      email: fields.email.value.trim().toLowerCase(),
      password: fields.password.value
    };
    if (role === 'siswa') {
      data.nis = fields.nis.value.trim();
      // Saat membuat akun, hanya kolom yang dipilih (username ATAU email) yang dikirim
      if (!editing) {
        if (loginMode === 'username') data.email = '';
        else data.username = '';
      }
    } else {
      data.role = role;
    }
    return data;
  }

  function validate(role, data) {
    const errors = {};
    if (!data.nama) errors.nama = 'Nama lengkap wajib diisi.';
    else if (data.nama.length < 2) errors.nama = 'Nama lengkap minimal 2 karakter.';

    if (role === 'siswa') {
      if (!data.nis) errors.nis = 'NIS wajib diisi.';
      else if (!/^\d{5}$/.test(data.nis)) errors.nis = 'NIS harus 5 digit angka.';
      if (!data.username && !data.email) {
        errors[loginMode === 'email' && !editing ? 'email' : 'username'] = 'Isi username atau email untuk login.';
      }
    } else if (!data.username) {
      errors.username = 'Username wajib diisi.';
    }

    if (data.username && !USERNAME_PATTERN.test(data.username)) {
      errors.username = 'Username 3–30 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.';
    }
    if (data.email && !EMAIL_PATTERN.test(data.email)) errors.email = 'Format email tidak valid.';

    if (!editing && !data.password) errors.password = 'Kata sandi wajib diisi.';
    else if (data.password && data.password.length < 8) errors.password = 'Kata sandi minimal 8 karakter.';
    return errors;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    $('form-error').hidden = true;

    const role = roleSelect.value;
    const data = collect();
    const errors = validate(role, data);
    Object.keys(fields).forEach((n) => setError(n, errors[n]));
    const first = Object.keys(fields).find((n) => errors[n]);
    if (first) {
      fields[first].focus();
      return;
    }

    $('submit-btn').disabled = true;
    try {
      let result;
      if (editing) {
        result =
          editing.type === 'staff'
            ? await AccountAPI.updateStaff(editing.key, data)
            : await AccountAPI.updateStudent(editing.key, data);
      } else {
        result = role === 'siswa' ? await AccountAPI.createStudent(data) : await AccountAPI.createStaff(data);
      }
      Auth.toast(result.message || 'Tersimpan.');
      resetForm();
      await load({ silent: true });
    } catch (err) {
      const messages = err.details && err.details.length ? err.details : [friendly(err)];
      $('form-error').innerHTML = `<ul>${messages.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`;
      $('form-error').hidden = false;
    } finally {
      $('submit-btn').disabled = false;
    }
  });

  // ---------- Hapus ----------

  $('acc-rows').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, type, key } = button.dataset;

    if (action === 'edit') return startEdit(type, key);

    const acc = all.find((a) => a.type === type && String(a.key) === String(key));
    if (!acc) return;
    pending = acc;
    $('confirm-text').innerHTML = `Akun <strong>${esc(acc.nama)}</strong> (${esc(ROLE_LABEL[acc.role])}) akan dihapus permanen dan tidak bisa masuk lagi.`;
    dialog.showModal();
  });

  $('confirm-no').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    pending = null;
  });
  $('confirm-yes').addEventListener('click', async () => {
    if (!pending) return;
    const acc = pending;
    $('confirm-yes').disabled = true;
    try {
      const result = acc.type === 'staff' ? await AccountAPI.deleteStaff(acc.key) : await AccountAPI.deleteStudent(acc.key);
      if (editing && editing.type === acc.type && String(editing.key) === String(acc.key)) resetForm();
      Auth.toast(result.message || 'Akun dihapus.');
      await load({ silent: true });
    } catch (err) {
      Auth.toast(friendly(err), 'error');
    } finally {
      $('confirm-yes').disabled = false;
      dialog.close();
    }
  });

  // ---------- Interaksi lain ----------

  roleSelect.addEventListener('change', () => {
    clearErrors();
    syncForm();
  });

  document.querySelectorAll('.seg-btn').forEach((b) =>
    b.addEventListener('click', () => {
      loginMode = b.dataset.mode;
      clearErrors();
      syncForm();
      (loginMode === 'username' ? fields.username : fields.email).focus();
    })
  );

  document.querySelectorAll('.role-tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      filter = tab.dataset.filter;
      document.querySelectorAll('.role-tab').forEach((t) => {
        t.classList.toggle('is-active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      render();
    })
  );

  $('search').addEventListener('input', render);
  $('cancel-btn').addEventListener('click', resetForm);
  $('retry-btn').addEventListener('click', () => load());
  $('refresh-btn').addEventListener('click', () => load({ silent: true }));

  fields.nis.addEventListener('input', () => {
    fields.nis.value = fields.nis.value.replace(/\D/g, '').slice(0, 5);
  });

  Object.keys(fields).forEach((name) =>
    fields[name].addEventListener('input', () => {
      if (fields[name].getAttribute('aria-invalid') === 'true') setError(name, '');
    })
  );

  // Tampilkan / sembunyikan kata sandi
  $('pw-toggle').addEventListener('click', () => {
    const show = fields.password.type === 'password';
    fields.password.type = show ? 'text' : 'password';
    $('pw-toggle').setAttribute('aria-pressed', String(show));
    $('pw-toggle').setAttribute('aria-label', show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
    $('pw-toggle').innerHTML = icon(show ? 'eye-off' : 'eye');
  });

  // Kata sandi acak yang mudah diketik (tanpa huruf yang mirip)
  $('pw-generate').addEventListener('click', () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint32Array(10);
    crypto.getRandomValues(bytes);
    fields.password.value = Array.from(bytes, (n) => chars[n % chars.length]).join('');
    fields.password.type = 'text';
    $('pw-toggle').setAttribute('aria-pressed', 'true');
    $('pw-toggle').innerHTML = icon('eye-off');
    setError('password', '');
  });

  syncForm();
  Auth.ready.then((user) => {
    if (user && user.role === 'administrator') load();
  });
})();
