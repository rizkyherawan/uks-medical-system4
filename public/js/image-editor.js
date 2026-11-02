// ============================================================
// EDITOR GAMBAR PRATINJAU (dipakai halaman Kelola konten)
//
// Administrator memilih bagian foto yang akan jadi kartu di beranda:
//   1. CROP     : kotak rasio 4:3 yang bisa digeser dan diubah ukurannya (mouse, sentuh, atau
//                 keyboard). Foto asli TIDAK diubah; hanya potongan itu yang dipakai pratinjau.
//   2. SILUET   : tombol geser untuk mengubah potongan menjadi seni siluet merah-putih
//                 (seperti poster sablon), dengan pengaturan ketebalan dan balik warna.
//
// Semua pemrosesan terjadi di browser (canvas); server hanya menerima hasil akhirnya.
//
// Pemakaian:
//   const hasil = await ImageEditor.open({ src });       // null bila dibatalkan
//   // hasil = { preview: 'data:image/...', siluet: true, detail: 50, balik: false }
//   const otomatis = await ImageEditor.auto(src);        // pratinjau tanpa tampilan (crop tengah)
// ============================================================
const ImageEditor = (() => {
  'use strict';

  const RATIO = 3 / 4; // tinggi / lebar kotak crop (sama dengan rasio kartu di beranda)
  const OUT_MAX = 960; // lebar maksimal gambar pratinjau (px)
  const OUT_MIN = 320;
  const MIN_FRACTION = 0.15; // kotak crop terkecil = 15% dari kotak terbesar

  // Warna siluet. Merah ini sama dengan --red-700 di css/style.css (merah tua khas situs,
  // tidak menyilaukan). Ubah di sini bila warna situs berganti; pratinjau lama perlu dibuat ulang.
  const INK = [163, 15, 26];
  const PAPER = [255, 255, 255];

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ---------- Mesin gambar ----------

  // Rata-rata kotak (box blur) dengan jendela bergeser: cepat walau radius besar
  function boxBlur(src, w, h, r) {
    const size = r * 2 + 1;
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);

    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      let sum = 0;
      for (let x = -r; x <= r; x += 1) sum += src[row + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x += 1) {
        tmp[row + x] = sum / size;
        sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let y = -r; y <= r; y += 1) sum += tmp[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y += 1) {
        out[y * w + x] = sum / size;
        sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  }

  // Mengubah isi canvas menjadi dua warna: merah (gelap) dan putih (terang).
  //  - kontras diratakan dulu (persentil 2%-98%) supaya hasilnya konsisten untuk foto gelap/terang
  //  - ambang memadukan ambang global dan rata-rata lokal, jadi bayangan tidak menelan detail
  //  - tepi dibuat sedikit lembut (anti-alias) agar tidak bergerigi
  function posterize(ctx, w, h, detail, invert) {
    const image = ctx.getImageData(0, 0, w, h);
    const px = image.data;
    const total = w * h;

    const gray = new Float32Array(total);
    const hist = new Uint32Array(256);
    for (let i = 0, j = 0; i < total; i += 1, j += 4) {
      const g = (0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2]) / 255;
      gray[i] = g;
      hist[Math.min(255, (g * 255) | 0)] += 1;
    }

    let acc = 0;
    let lo = 0;
    let hi = 255;
    for (let v = 0; v < 256; v += 1) {
      acc += hist[v];
      if (acc >= total * 0.02) {
        lo = v;
        break;
      }
    }
    acc = 0;
    for (let v = 255; v >= 0; v -= 1) {
      acc += hist[v];
      if (acc >= total * 0.02) {
        hi = v;
        break;
      }
    }
    const span = Math.max(0.2, (hi - lo) / 255);
    for (let i = 0; i < total; i += 1) gray[i] = clamp((gray[i] - lo / 255) / span, 0, 1);

    const smooth = boxBlur(gray, w, h, 1);
    const local = boxBlur(boxBlur(smooth, w, h, Math.max(6, Math.round(w * 0.05))), w, h, Math.max(6, Math.round(w * 0.05)));
    const bias = ((detail - 50) / 50) * 0.18; // slider "ketebalan": makin besar makin banyak area merah
    const edge = 0.035;

    for (let i = 0, j = 0; i < total; i += 1, j += 4) {
      const threshold = 0.5 * local[i] + 0.25 + bias;
      let t = clamp((threshold - smooth[i]) / edge + 0.5, 0, 1); // 1 = merah
      if (invert) t = 1 - t;
      px[j] = PAPER[0] + (INK[0] - PAPER[0]) * t;
      px[j + 1] = PAPER[1] + (INK[1] - PAPER[1]) * t;
      px[j + 2] = PAPER[2] + (INK[2] - PAPER[2]) * t;
      px[j + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }

  // Menggambar potongan `crop` dari `img` ke `canvas`, lalu menerapkan gaya yang dipilih
  function renderTo(canvas, img, crop, { siluet, detail, balik }) {
    const outW = clamp(Math.round(crop.w), OUT_MIN, OUT_MAX);
    const outH = Math.round(outW * RATIO);
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.w * RATIO, 0, 0, outW, outH); // tinggi selalu 3/4 lebar
    if (siluet) posterize(ctx, outW, outH, detail, balik);
  }

  // Siluet dua warna paling kecil sebagai PNG; foto berwarna sebagai JPEG
  const exportCanvas = (canvas, siluet) => (siluet ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.86));

  // Kotak crop terbesar dengan rasio 4:3, di tengah gambar
  function centerCrop(natW, natH) {
    const w = Math.min(natW, natH / RATIO);
    return { x: (natW - w) / 2, y: (natH - w * RATIO) / 2, w };
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => (img.naturalWidth > 0 ? resolve(img) : reject(new Error('Gambar tidak dapat dibuka.')));
      img.onerror = () => reject(new Error('Gambar tidak dapat dibuka.'));
      img.src = src;
    });
  }

  // Pratinjau otomatis tanpa tampilan: crop di tengah + siluet bawaan
  async function auto(src, { siluet = true, detail = 50, balik = false } = {}) {
    const img = await loadImage(src);
    const canvas = document.createElement('canvas');
    renderTo(canvas, img, centerCrop(img.naturalWidth, img.naturalHeight), { siluet, detail, balik });
    return { preview: exportCanvas(canvas, siluet), siluet, detail, balik };
  }

  // ---------- Tampilan ----------

  let dialog = null;
  let ui = null;
  let session = null;

  function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'editor-dialog';
    dialog.setAttribute('aria-labelledby', 'ed-title');
    dialog.innerHTML = `
      <div class="ed-head">
        <h2 id="ed-title">Atur gambar pratinjau</h2>
        <p>Geser dan ubah ukuran kotak untuk memilih bagian foto yang tampil di kartu beranda. Foto asli tetap utuh dan tampil penuh saat kartu diklik.</p>
      </div>

      <div class="ed-body">
        <div class="ed-left">
          <div class="ed-stage" id="ed-stage">
            <div class="ed-canvas" id="ed-canvas">
              <img id="ed-img" alt="Foto asli" draggable="false">
              <div class="ed-dim" aria-hidden="true"><span class="ed-hole" id="ed-hole"></span></div>
              <div class="ed-crop" id="ed-crop" tabindex="0" role="group"
                   aria-label="Kotak crop. Gunakan tombol panah untuk menggeser, plus dan minus untuk mengubah ukuran.">
                <span class="ed-grid" aria-hidden="true"></span>
                <span class="ed-handle" data-h="nw"></span>
                <span class="ed-handle" data-h="ne"></span>
                <span class="ed-handle" data-h="sw"></span>
                <span class="ed-handle" data-h="se"></span>
              </div>
            </div>
          </div>
          <label class="ed-slider">
            <span>Ukuran kotak crop <output id="ed-size-out">100%</output></span>
            <input type="range" id="ed-size" min="15" max="100" value="100">
          </label>
        </div>

        <div class="ed-right">
          <p class="ed-label">Pratinjau di beranda</p>
          <div class="ed-out"><canvas id="ed-out" aria-label="Pratinjau hasil"></canvas></div>

          <label class="ed-switch">
            <input type="checkbox" id="ed-siluet" role="switch" checked>
            <span class="ed-track" aria-hidden="true"><span class="ed-thumb"></span></span>
            <span class="ed-switch-text"><strong>Gaya siluet merah-putih</strong><small>Ubah foto menjadi seni siluet yang senada dengan warna website.</small></span>
          </label>

          <div class="ed-siluet-opts" id="ed-siluet-opts">
            <label class="ed-slider">
              <span>Ketebalan siluet <output id="ed-detail-out">50</output></span>
              <input type="range" id="ed-detail" min="0" max="100" value="50">
              <small class="ed-range-hint"><span>Tipis</span><span>Tebal</span></small>
            </label>
            <label class="ed-check"><input type="checkbox" id="ed-balik"> <span>Balik warna (merah dan putih bertukar)</span></label>
          </div>

          <button type="button" class="btn btn-outline btn-sm" id="ed-reset">Kembalikan crop awal</button>
        </div>
      </div>

      <p class="ed-error" id="ed-error" role="alert" hidden></p>
      <div class="ed-actions">
        <button type="button" class="btn btn-outline" id="ed-cancel">Batal</button>
        <button type="button" class="btn btn-primary" id="ed-done">Pakai pratinjau ini</button>
      </div>`;
    document.body.appendChild(dialog);

    const $ = (id) => dialog.querySelector(`#${id}`);
    ui = {
      stage: $('ed-stage'),
      canvas: $('ed-canvas'),
      img: $('ed-img'),
      crop: $('ed-crop'),
      hole: $('ed-hole'),
      size: $('ed-size'),
      sizeOut: $('ed-size-out'),
      out: $('ed-out'),
      siluet: $('ed-siluet'),
      opts: $('ed-siluet-opts'),
      detail: $('ed-detail'),
      detailOut: $('ed-detail-out'),
      balik: $('ed-balik'),
      reset: $('ed-reset'),
      error: $('ed-error'),
      cancel: $('ed-cancel'),
      done: $('ed-done')
    };

    bindEvents();
  }

  // ----- geometri: koordinat kotak crop dalam piksel ASLI gambar -----

  const maxCropW = () => Math.min(session.natW, session.natH / RATIO);
  const minCropW = () => Math.max(60, maxCropW() * MIN_FRACTION);
  const scale = () => session.natW / session.shownW; // piksel asli per piksel layar

  function layoutStage() {
    const maxW = Math.max(200, ui.stage.clientWidth - 2);
    const maxH = Math.max(160, Math.min(window.innerHeight * 0.4, 400));
    const ratio = Math.min(maxW / session.natW, maxH / session.natH);
    session.shownW = Math.round(session.natW * ratio);
    session.shownH = Math.round(session.natH * ratio);
    ui.canvas.style.width = `${session.shownW}px`;
    ui.canvas.style.height = `${session.shownH}px`;
    paintCrop();
  }

  function paintCrop() {
    const k = scale();
    const c = session.crop;
    // Kotak crop (interaktif) dan "lubang" pada lapisan gelap berukuran sama
    [ui.crop, ui.hole].forEach((el) => {
      el.style.left = `${c.x / k}px`;
      el.style.top = `${c.y / k}px`;
      el.style.width = `${c.w / k}px`;
      el.style.height = `${(c.w * RATIO) / k}px`;
    });
    const percent = Math.round((c.w / maxCropW()) * 100);
    ui.size.value = String(percent);
    ui.sizeOut.textContent = `${percent}%`;
    schedulePreview();
  }

  function setCrop(next) {
    const w = clamp(next.w, minCropW(), maxCropW());
    session.crop = {
      w,
      x: clamp(next.x, 0, session.natW - w),
      y: clamp(next.y, 0, session.natH - w * RATIO)
    };
    paintCrop();
  }

  // Mengubah ukuran dengan titik tengah tetap (slider dan tombol +/-)
  function resizeAroundCenter(newW) {
    const c = session.crop;
    const w = clamp(newW, minCropW(), maxCropW());
    setCrop({ w, x: c.x + (c.w - w) / 2, y: c.y + (c.w - w) * RATIO / 2 });
  }

  let frame = 0;
  function schedulePreview() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (session) renderTo(ui.out, session.img, session.crop, currentStyle());
    });
  }

  const currentStyle = () => ({ siluet: ui.siluet.checked, detail: Number(ui.detail.value), balik: ui.balik.checked });

  function syncStyleUi() {
    ui.opts.hidden = !ui.siluet.checked;
    ui.detailOut.textContent = ui.detail.value;
    schedulePreview();
  }

  // ----- interaksi: geser dan ubah ukuran dengan pointer (mouse, sentuh, pena) -----

  function bindEvents() {
    let drag = null;

    ui.crop.addEventListener('pointerdown', (event) => {
      if (!session) return;
      const handle = event.target.closest('.ed-handle');
      ui.crop.setPointerCapture(event.pointerId);
      const c = session.crop;
      drag = { id: event.pointerId, x0: event.clientX, y0: event.clientY, start: { ...c }, handle: handle ? handle.dataset.h : null };
      ui.crop.focus({ preventScroll: true });
      event.preventDefault();
    });

    ui.crop.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const k = scale();
      const dx = (event.clientX - drag.x0) * k;
      const dy = (event.clientY - drag.y0) * k;
      const s = drag.start;

      if (!drag.handle) {
        setCrop({ ...s, x: s.x + dx, y: s.y + dy });
        return;
      }

      // Ubah ukuran dari sudut: sudut di seberangnya tetap (jangkar), rasio 4:3 dijaga
      const east = drag.handle.includes('e');
      const south = drag.handle.includes('s');
      const ax = east ? s.x : s.x + s.w; // jangkar
      const ay = south ? s.y : s.y + s.w * RATIO;
      const px = (east ? s.x + s.w : s.x) + dx; // posisi sudut yang ditarik
      const py = (south ? s.y + s.w * RATIO : s.y) + dy;
      const limitW = Math.min(east ? session.natW - ax : ax, (south ? session.natH - ay : ay) / RATIO);
      const w = clamp(Math.max(Math.abs(px - ax), Math.abs(py - ay) / RATIO), minCropW(), Math.min(limitW, maxCropW()));
      setCrop({ w, x: east ? ax : ax - w, y: south ? ay : ay - w * RATIO });
    });

    const stop = (event) => {
      if (drag && event.pointerId === drag.id) drag = null;
    };
    ui.crop.addEventListener('pointerup', stop);
    ui.crop.addEventListener('pointercancel', stop);

    // Keyboard: panah = geser, Shift+panah = geser jauh, + / - = ubah ukuran
    ui.crop.addEventListener('keydown', (event) => {
      if (!session) return;
      const step = (event.shiftKey ? 0.1 : 0.02) * session.natW;
      const c = session.crop;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[event.key]) {
        setCrop({ ...c, x: c.x + moves[event.key][0], y: c.y + moves[event.key][1] });
      } else if (event.key === '+' || event.key === '=') {
        resizeAroundCenter(c.w * 1.06);
      } else if (event.key === '-' || event.key === '_') {
        resizeAroundCenter(c.w / 1.06);
      } else {
        return;
      }
      event.preventDefault();
    });

    ui.size.addEventListener('input', () => {
      if (session) resizeAroundCenter((Number(ui.size.value) / 100) * maxCropW());
    });
    [ui.siluet, ui.detail, ui.balik].forEach((el) => el.addEventListener('input', syncStyleUi));
    ui.reset.addEventListener('click', () => {
      if (session) setCrop(centerCrop(session.natW, session.natH));
    });

    ui.cancel.addEventListener('click', () => finish(false));
    ui.done.addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault(); // Esc: tutup lewat jalur yang sama dengan tombol Batal
      finish(false);
    });
    window.addEventListener('resize', () => {
      if (session && dialog.open) layoutStage();
    });
  }

  function finish(save) {
    if (!session) return;
    const { resolve } = session;
    let result = null;

    if (save) {
      try {
        renderTo(ui.out, session.img, session.crop, currentStyle());
        const style = currentStyle();
        result = { preview: exportCanvas(ui.out, style.siluet), siluet: style.siluet, detail: style.detail, balik: style.balik };
      } catch (err) {
        ui.error.textContent = 'Pratinjau gagal dibuat. Coba pilih foto lain.';
        ui.error.hidden = false;
        return;
      }
    }

    session = null;
    dialog.close();
    resolve(result);
  }

  // Membuka editor. Mengembalikan Promise: hasil atau null bila dibatalkan.
  async function open({ src, siluet = true, detail = 50, balik = false } = {}) {
    if (!src) throw new Error('Tidak ada gambar untuk diatur.');
    if (!dialog) build();
    if (session) throw new Error('Editor gambar sedang terbuka.');

    const img = await loadImage(src);

    return new Promise((resolve) => {
      session = {
        img,
        resolve,
        natW: img.naturalWidth,
        natH: img.naturalHeight,
        shownW: 0,
        shownH: 0,
        crop: centerCrop(img.naturalWidth, img.naturalHeight)
      };
      ui.img.src = src;
      ui.siluet.checked = siluet;
      ui.detail.value = String(detail);
      ui.balik.checked = balik;
      ui.error.hidden = true;
      syncStyleUi();

      dialog.showModal();
      layoutStage();
      ui.crop.focus({ preventScroll: true });
    });
  }

  return { open, auto, posterize, boxBlur, centerCrop, INK };
})();
