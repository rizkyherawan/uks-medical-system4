// ============================================================
// HALAMAN DATA UMUM (dipakai Obat keluar dan Peminjaman barang)
// Satu skrip ini membuat ringkasan, tabel dengan pencarian, formulir tambah/ubah,
// dialog hapus, dan notifikasi dari sebuah konfigurasi. Pemakaian:
//   CrudPage.init({ api, noun, ..., fields: [...], columns: [...] })
// Halaman HTML-nya cukup berisi <main id="crud-root"></main> dan dialog/toast.
// ============================================================
const CrudPage = (() => {
  'use strict';

  const esc = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // "2026-10-27" -> "27 Okt 2026" (dibaca manual agar tidak bergeser karena zona waktu)
  function formatDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '-';
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const friendly = (err) =>
    err instanceof TypeError
      ? 'Sistem tidak dapat dihubungi. Periksa koneksi atau pastikan server sudah dijalankan, lalu coba lagi.'
      : err.message || 'Terjadi kesalahan.';

  function init(config) {
    const root = document.getElementById('crud-root');
    const $ = (id) => document.getElementById(id);
    const { api, fields } = config;

    // ---------- Kerangka halaman ----------
    root.innerHTML = `
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="index.html">Beranda</a><span aria-hidden="true">/</span><span aria-current="page">${esc(config.crumb)}</span>
      </nav>

      <div class="page-head">
        <span class="badge">${esc(config.badge)}</span>
        <h1>${esc(config.title)}</h1>
        <p class="lead">${esc(config.lead)}</p>
        <div class="meta-row">
          <span class="meta-item">${icon('users')}Dikelola <strong>PMR Wira SMKN 1 Gombong</strong></span>
          <span class="meta-item">${icon('calendar')}<span id="today-date"></span></span>
          <span class="meta-item">${icon('info')}Versi beta</span>
        </div>
      </div>

      <div data-export="${esc(config.exportKey)}" data-export-label="${esc(config.exportLabel)}"></div>

      <section class="stats" aria-label="Ringkasan">
        ${config.stats
          .map(
            (s, i) => `
        <div class="card stat">
          <span class="stat-icon">${icon(s.icon)}</span>
          <div><p class="stat-label">${esc(s.label)}</p><p class="stat-value" id="stat-${i}">-</p></div>
        </div>`
          )
          .join('')}
      </section>

      <div class="workspace">
        <section class="card list-card" aria-labelledby="list-title">
          <div class="list-head">
            <div>
              <h2 class="card-title" id="list-title">${esc(config.listTitle)}</h2>
              <p class="card-sub" id="result-info" aria-live="polite">Memuat data...</p>
            </div>
            <div class="toolbar no-print">
              <div class="search">
                <label class="sr-only" for="search">Cari catatan</label>
                ${icon('search')}
                <input class="input" type="search" id="search" placeholder="${esc(config.searchPlaceholder)}" autocomplete="off">
              </div>
              ${
                config.filter
                  ? `<div><label class="sr-only" for="filter">${esc(config.filter.label)}</label>
                     <select class="select" id="filter"><option value="">${esc(config.filter.label)}</option></select></div>`
                  : ''
              }
            </div>
          </div>

          <div class="loading" id="loading" aria-hidden="true"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>

          <div class="state" id="list-error" role="alert" hidden>
            <span class="state-icon">${icon('alert')}</span>
            <h3>Data belum bisa dimuat</h3>
            <p id="list-error-text"></p>
            <button type="button" class="btn btn-outline btn-sm" id="retry-btn">Coba lagi</button>
          </div>

          <div class="table-wrap" id="table-wrap" hidden>
            <table>
              <thead><tr>
                ${config.columns.map((c) => `<th scope="col">${esc(c.label)}</th>`).join('')}
                <th scope="col" class="no-print"><span class="sr-only">Aksi</span></th>
              </tr></thead>
              <tbody id="rows"></tbody>
            </table>
          </div>

          <div class="state" id="empty-state" hidden></div>
        </section>

        <aside class="card form-card no-print" id="form-card" aria-labelledby="form-title">
          <div class="form-head">
            <h2 class="card-title" id="form-title">
              <span class="icon-dot">${icon('plus')}</span><span id="form-title-text">${esc(config.formTitle)}</span>
            </h2>
            <span class="mode-badge" id="mode-badge" hidden>Mode ubah</span>
          </div>

          <form id="crud-form" novalidate>
            ${fields.map(fieldHtml).join('')}
            <div class="form-error" id="form-error" role="alert" hidden></div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary" id="submit-btn">${icon('check')}<span id="submit-label">Simpan catatan</span></button>
              <button type="button" class="btn btn-outline" id="cancel-btn" hidden>Batal</button>
            </div>
          </form>
        </aside>
      </div>`;

    if (typeof ExportBar !== 'undefined') ExportBar.mountAll(root);

    function fieldHtml(f) {
      const err = `<p class="field-error" id="err-${f.name}" hidden></p>`;
      let control;
      if (f.type === 'choice') {
        control = `<select class="select" id="${f.name}" aria-describedby="err-${f.name}">
            <option value="">${esc(f.placeholder || 'Pilih')}</option>
            ${f.options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
            <option value="__lainnya">Lainnya (ketik manual)</option>
          </select>
          <input class="input keluhan-manual" type="text" id="${f.name}__manual" maxlength="${f.max || 100}" autocomplete="off"
                 placeholder="Ketik secara manual" aria-label="${esc(f.label)} (manual)" hidden>`;
      } else if (f.type === 'textarea') {
        control = `<textarea class="textarea" id="${f.name}" maxlength="${f.max || 255}" placeholder="${esc(f.placeholder || '')}"
                   aria-describedby="err-${f.name}"></textarea>`;
      } else {
        control = `<input class="input" type="${f.type || 'text'}" id="${f.name}" ${f.max ? `maxlength="${f.max}"` : ''}
                   ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.maxValue !== undefined ? `max="${f.maxValue}"` : ''}
                   autocomplete="off" placeholder="${esc(f.placeholder || '')}" aria-describedby="err-${f.name}">`;
      }
      const label = `<label for="${f.name}">${esc(f.label)}${f.required ? '' : ' <small class="optional">(opsional)</small>'}</label>`;
      return `<div class="field">${label}${control}${f.hint ? `<p class="field-hint">${esc(f.hint)}</p>` : ''}${err}</div>`;
    }

    // Dua kolom tanggal/angka yang bersebelahan dibungkus .field-row
    const formEl = $('crud-form');
    config.pairs?.forEach(([a, b]) => {
      const fa = $(a).closest('.field');
      const fb = $(b).closest('.field');
      const row = document.createElement('div');
      row.className = 'field-row';
      fa.before(row);
      row.append(fa, fb);
    });

    // ---------- State ----------
    let allRows = [];
    let editingId = null;
    let pendingDelete = null;

    const searchInput = $('search');
    const filterSelect = config.filter ? $('filter') : null;
    const dialog = $('confirm-dialog');

    const readValue = (f) => {
      const el = $(f.name);
      if (f.type === 'choice') {
        return el.value === '__lainnya' ? $(`${f.name}__manual`).value.trim() : el.value;
      }
      return el.value.trim();
    };

    function writeValue(f, value) {
      const el = $(f.name);
      if (f.type === 'choice') {
        const manual = $(`${f.name}__manual`);
        if (!value) {
          el.value = '';
          manual.value = '';
        } else if (f.options.includes(value)) {
          el.value = value;
          manual.value = '';
        } else {
          el.value = '__lainnya';
          manual.value = value;
        }
        manual.hidden = el.value !== '__lainnya';
        return;
      }
      el.value = value ?? '';
    }

    function setError(name, message) {
      const el = $(`err-${name}`);
      $(name).setAttribute('aria-invalid', message ? 'true' : 'false');
      el.textContent = message || '';
      el.hidden = !message;
    }

    function resetForm() {
      fields.forEach((f) => {
        writeValue(f, f.defaultValue ? f.defaultValue() : '');
        setError(f.name, '');
      });
      editingId = null;
      $('form-title-text').textContent = config.formTitle;
      $('submit-label').textContent = 'Simpan catatan';
      $('mode-badge').hidden = true;
      $('cancel-btn').hidden = true;
      $('form-error').hidden = true;
      renderList();
    }

    // ---------- Tampilan ----------
    function show(name) {
      $('loading').hidden = name !== 'loading';
      $('list-error').hidden = name !== 'error';
      if (name !== 'ready') {
        $('table-wrap').hidden = true;
        $('empty-state').hidden = true;
      }
    }

    function renderStats() {
      config.stats.forEach((s, i) => {
        $(`stat-${i}`).textContent = allRows.length ? s.value(allRows) : s.empty ?? '-';
      });
    }

    function renderFilter() {
      if (!filterSelect) return;
      const current = filterSelect.value;
      const values = [...new Set(allRows.map((r) => r[config.filter.key]))].sort((a, b) =>
        String(a).localeCompare(String(b), 'id', { numeric: true })
      );
      filterSelect.innerHTML =
        `<option value="">${esc(config.filter.label)}</option>` +
        values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
      filterSelect.value = values.includes(current) ? current : '';
    }

    // Bulan yang sedang dicetak (YYYY-MM). null = tampilan biasa. Diatur oleh export.js.
    let printMonth = null;
    document.addEventListener('rekap:periode', (event) => {
      printMonth = event.detail.bulan;
      renderList();
    });

    function visibleRows() {
      const query = searchInput.value.trim().toLowerCase();
      const filter = filterSelect ? filterSelect.value : '';
      return allRows.filter((r) => {
        if (printMonth && !String(r[config.dateKey] || '').startsWith(printMonth)) return false;
        if (filter && r[config.filter.key] !== filter) return false;
        if (!query) return true;
        return config.searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(query));
      });
    }

    function actionButtons(row) {
      const extra = (config.rowActions || [])
        .filter((a) => a.show(row))
        .map(
          (a) => `<button type="button" class="icon-btn" data-action="${a.action}" data-id="${row.id}"
                  aria-label="${esc(a.label)} ${esc(config.rowTitle(row))}" title="${esc(a.label)}">${icon(a.icon)}</button>`
        )
        .join('');
      const name = esc(config.rowTitle(row));
      return `${extra}
        <button type="button" class="icon-btn" data-action="edit" data-id="${row.id}" aria-label="Ubah catatan ${name}" title="Ubah">${icon('edit')}</button>
        <button type="button" class="icon-btn icon-btn-danger" data-action="delete" data-id="${row.id}" aria-label="Hapus catatan ${name}" title="Hapus">${icon('trash')}</button>`;
    }

    function renderList() {
      const rows = visibleRows();
      const filtering = Boolean(searchInput.value.trim() || (filterSelect && filterSelect.value));
      $('result-info').textContent = filtering ? `${rows.length} dari ${allRows.length} catatan` : `${allRows.length} catatan`;

      if (rows.length === 0) {
        $('table-wrap').hidden = true;
        $('empty-state').innerHTML = allRows.length
          ? `<span class="state-icon">${icon('search')}</span><h3>Tidak ada hasil</h3><p>Tidak ada catatan yang cocok dengan pencarian atau filter yang dipilih.</p>
             <button type="button" class="btn btn-outline btn-sm" data-action="clear">Hapus pencarian</button>`
          : `<span class="state-icon">${icon(config.emptyIcon || 'clipboard')}</span><h3>${esc(config.emptyTitle)}</h3><p>${esc(config.emptyText)}</p>`;
        $('empty-state').hidden = false;
        return;
      }

      $('empty-state').hidden = true;
      $('table-wrap').hidden = false;
      $('rows').innerHTML = rows
        .map(
          (r) => `<tr class="${r.id === editingId ? 'is-editing' : ''}">
            ${config.columns.map((c) => `<td data-label="${esc(c.label)}"${c.cls ? ` class="${c.cls}"` : ''}>${c.render(r)}</td>`).join('')}
            <td class="cell-actions no-print"><div class="row-actions">${actionButtons(r)}</div></td>
          </tr>`
        )
        .join('');
    }

    async function load({ silent = false } = {}) {
      if (!silent) show('loading');
      try {
        allRows = (await api.list()).data;
        show('ready');
        renderStats();
        renderFilter();
        renderList();
      } catch (err) {
        allRows = [];
        renderStats();
        $('result-info').textContent = '';
        $('list-error-text').textContent = friendly(err);
        show('error');
      }
    }

    // ---------- Form ----------
    function validate(data) {
      const errors = {};
      fields.forEach((f) => {
        const value = data[f.name];
        if (f.required && !value) errors[f.name] = `${f.label} wajib diisi.`;
        else if (f.max && String(value).length > f.max) errors[f.name] = `${f.label} maksimal ${f.max} karakter.`;
        else if (f.type === 'number' && value) {
          const n = Number(value);
          if (!Number.isInteger(n) || n < (f.min ?? 1) || n > (f.maxValue ?? 999)) errors[f.name] = `${f.label} harus bilangan bulat ${f.min ?? 1}–${f.maxValue ?? 999}.`;
        }
      });
      if (config.crossValidate) Object.assign(errors, config.crossValidate(data));
      return errors;
    }

    formEl.addEventListener('submit', async (event) => {
      event.preventDefault();
      $('form-error').hidden = true;

      const data = {};
      fields.forEach((f) => {
        data[f.name] = readValue(f);
      });

      const errors = validate(data);
      fields.forEach((f) => setError(f.name, errors[f.name]));
      const firstBad = fields.find((f) => errors[f.name]);
      if (firstBad) {
        $(firstBad.name).focus();
        return;
      }

      $('submit-btn').disabled = true;
      try {
        if (editingId) {
          await api.update(editingId, data);
          Auth.toast('Perubahan disimpan.');
        } else {
          await api.create(data);
          Auth.toast('Catatan disimpan.');
        }
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

    function startEdit(id) {
      const row = allRows.find((r) => r.id === id);
      if (!row) return;
      editingId = id;
      fields.forEach((f) => {
        writeValue(f, row[f.name] ?? '');
        setError(f.name, '');
      });
      $('form-title-text').textContent = config.editTitle || 'Ubah catatan';
      $('submit-label').textContent = 'Simpan perubahan';
      $('mode-badge').hidden = false;
      $('cancel-btn').hidden = false;
      $('form-error').hidden = true;
      renderList();
      const narrow = window.matchMedia('(max-width: 1040px)').matches;
      $('form-card').scrollIntoView({ behavior: 'smooth', block: narrow ? 'start' : 'nearest' });
      $(fields[0].name).focus({ preventScroll: true });
    }

    $('cancel-btn').addEventListener('click', resetForm);

    // Memilih "Lainnya" pada kolom pilihan membuka kolom ketik manual
    fields
      .filter((f) => f.type === 'choice')
      .forEach((f) => {
        $(f.name).addEventListener('change', () => {
          const manual = $(`${f.name}__manual`);
          manual.hidden = $(f.name).value !== '__lainnya';
          if (!manual.hidden) manual.focus();
          setError(f.name, '');
        });
        $(`${f.name}__manual`).addEventListener('input', () => setError(f.name, ''));
      });

    fields.forEach((f) => {
      $(f.name).addEventListener('input', () => {
        if ($(f.name).getAttribute('aria-invalid') === 'true') setError(f.name, '');
      });
    });

    // ---------- Aksi baris ----------
    $('rows').addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const id = Number(button.dataset.id);
      const row = allRows.find((r) => r.id === id);
      if (!row) return;

      if (button.dataset.action === 'edit') return startEdit(id);

      if (button.dataset.action === 'delete') {
        pendingDelete = id;
        $('confirm-name').textContent = config.rowTitle(row);
        dialog.showModal();
        return;
      }

      const custom = (config.rowActions || []).find((a) => a.action === button.dataset.action);
      if (custom) {
        button.disabled = true;
        try {
          await custom.handler(row);
          await load({ silent: true });
        } catch (err) {
          Auth.toast(friendly(err), 'error');
          button.disabled = false;
        }
      }
    });

    $('confirm-no').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      pendingDelete = null;
    });
    $('confirm-yes').addEventListener('click', async () => {
      if (pendingDelete === null) return;
      const id = pendingDelete;
      $('confirm-yes').disabled = true;
      try {
        await api.remove(id);
        if (id === editingId) resetForm();
        Auth.toast('Catatan dihapus.');
        await load({ silent: true });
      } catch (err) {
        Auth.toast(friendly(err), 'error');
      } finally {
        $('confirm-yes').disabled = false;
        dialog.close();
      }
    });

    $('empty-state').addEventListener('click', (event) => {
      if (!event.target.closest('[data-action="clear"]')) return;
      searchInput.value = '';
      if (filterSelect) filterSelect.value = '';
      renderList();
    });
    $('retry-btn').addEventListener('click', () => load());
    searchInput.addEventListener('input', renderList);
    if (filterSelect) filterSelect.addEventListener('change', renderList);

    // Kolom angka: hanya digit
    fields
      .filter((f) => f.type === 'number')
      .forEach((f) =>
        $(f.name).addEventListener('input', () => {
          $(f.name).value = $(f.name).value.replace(/\D/g, '').slice(0, 3);
        })
      );

    $('today-date').textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    resetForm();
    load();
  }

  return { init, esc, icon, formatDate, todayIso };
})();
