// ============================================================
// UJI QA TAMPILAN (browser sungguhan)   ->   npm run test:ui
// Menjalankan app ASLI lewat harness (Express tiruan + database memori), lalu mengendalikan
// Chromium: login dengan isian kosong, form konten, editor crop + siluet, kartu beranda,
// jendela detail, tampilan ponsel, dan pelolosan XSS. Juga memastikan tidak ada galat JavaScript
// maupun pelanggaran Content-Security-Policy.
//
// Syarat: paket Playwright dan browser Chromium  ->  npm i -D playwright && npx playwright install chromium
// Opsi:   SHOTS=/folder/tangkapan  untuk menyimpan tangkapan layar tiap tahap.
// ============================================================
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let playwright;
try {
  playwright = require('playwright');
} catch (err) {
  playwright = require(process.env.PLAYWRIGHT_PATH || '/home/claude/.npm-global/lib/node_modules/playwright');
}
const { startHarness } = require('./harness');

const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

let passed = 0;
let failed = 0;
const problems = []; // galat JS / pelanggaran CSP yang tertangkap di semua halaman

async function step(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`GAGAL ${name}\n      ${String(err.message).split('\n').slice(0, 6).join('\n      ').slice(0, 900)}`);
  }
}

function watch(page, label) {
  page.on('pageerror', (e) => problems.push(`[${label}] galat JS: ${e.message}`));
  page.on('console', (m) => {
    const text = m.text();
    if (/Content Security Policy|Refused to (load|execute|apply)/i.test(text)) problems.push(`[${label}] CSP: ${text}`);
    else if (m.type() === 'error' && !/status of (400|401|403|404|409|429)/.test(text)) problems.push(`[${label}] console.error: ${text}`);
  });
}

const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

// Foto uji: pemandangan dengan "orang" dan tekstur, 1800 x 1200 (lebih besar dari batas 1600)
const makePhoto = (page) =>
  page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1800;
    c.height = 1200;
    const x = c.getContext('2d');
    const sky = x.createLinearGradient(0, 0, 0, 700);
    sky.addColorStop(0, '#6fb1e8');
    sky.addColorStop(1, '#e9f3fb');
    x.fillStyle = sky;
    x.fillRect(0, 0, 1800, 700);
    x.fillStyle = '#4e8a3c';
    x.fillRect(0, 700, 1800, 500);
    for (let i = 0; i < 7; i += 1) {
      const px = 160 + i * 240;
      x.fillStyle = ['#c4111f', '#f5f5f5', '#2a4d8f', '#f2c14e'][i % 4];
      x.fillRect(px, 560, 110, 300);
      x.fillStyle = '#d9a37c';
      x.beginPath();
      x.arc(px + 55, 510, 55, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#2b1d14';
      x.fillRect(px + 20, 470, 70, 24);
    }
    x.fillStyle = '#f7dc6f';
    x.beginPath();
    x.arc(1500, 160, 90, 0, Math.PI * 2);
    x.fill();
    for (let i = 0; i < 4000; i += 1) {
      x.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
      x.fillRect(Math.random() * 1800, Math.random() * 1200, 3, 3);
    }
    return c.toDataURL('image/jpeg', 0.9);
  });

// Hitung komposisi warna pada canvas pratinjau editor: merah tua, putih, dan lainnya
const palette = (page) =>
  page.evaluate(() => {
    const c = document.getElementById('ed-out');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let red = 0;
    let white = 0;
    let other = 0;
    const total = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
      if (r > 235 && g > 235 && b > 235) white += 1;
      else if (Math.abs(r - 163) < 40 && Math.abs(g - 15) < 40 && Math.abs(b - 26) < 40) red += 1;
      else other += 1;
    }
    return { red: red / total, white: white / total, other: other / total, w: c.width, h: c.height };
  });

(async () => {
  const h = await startHarness();
  await h.seed();
  const base = h.url;

  const browser = await playwright.chromium.launch();
  // reducedMotion: animasi login dilewati agar uji fungsional cepat (animasinya diuji terpisah)
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  watch(page, 'desktop');

  const fieldError = (name) => page.locator(`[data-field="${name}"] .af-error`).innerText();

  // ----------------------------------------------------------
  console.log('\nLOGIN');
  // ----------------------------------------------------------
  await page.goto(`${base}/index.html`);
  await page.locator('[data-open-login]:visible').first().click();
  await page.waitForSelector('.role-card');
  await page.locator('[data-pick="administrator"]').click();
  await page.waitForSelector('#af-identifier', { state: 'visible' });

  await step('login: kolom kosong -> peringatan username dan kata sandi, form tidak terkirim', async () => {
    await page.locator('.af-submit').click();
    assert.strictEqual(await fieldError('identifier'), 'Username/email wajib diisi.');
    assert.strictEqual(await fieldError('password'), 'Kata sandi wajib diisi.');
    assert.ok(await page.locator('#af-identifier').evaluate((el) => el === document.activeElement), 'fokus ke kolom pertama yang salah');
    await shot(page, '01-login-kosong');
  });

  await step('login: username diisi, kata sandi kosong -> hanya kata sandi yang diperingatkan', async () => {
    await page.fill('#af-identifier', 'admin.uji');
    await page.locator('.af-submit').click();
    assert.strictEqual(await fieldError('identifier'), '');
    assert.strictEqual(await fieldError('password'), 'Kata sandi wajib diisi.');
  });

  await step('login: kata sandi salah -> pesan dari server, tetap di form', async () => {
    await page.fill('#af-password', 'salah-total');
    await page.locator('.af-submit').click();
    await page.waitForFunction(() => /salah|tidak sesuai|tidak ditemukan/i.test(document.querySelector('.af-message, [role="alert"]')?.textContent || document.body.innerText));
    assert.ok(await page.locator('#af-identifier').isVisible());
  });

  await step('login: berhasil -> masuk sebagai Administrator', async () => {
    await page.fill('#af-password', 'KataSandi-Admin1');
    await page.locator('.af-submit').click();
    await page.waitForFunction(() => !document.querySelector('.auth-overlay.is-open'));
    const me = await page.evaluate(() => fetch('/api/auth/me').then((r) => r.json()));
    assert.strictEqual(me.data.role, 'administrator');
  });

  // ----------------------------------------------------------
  console.log('\nKELOLA KONTEN (admin)');
  // ----------------------------------------------------------
  await page.goto(`${base}/konten.html`);
  await page.waitForSelector('#konten-form');

  await step('konten: kirim form kosong -> judul, deskripsi, dan foto wajib, tidak tersimpan', async () => {
    await page.click('#submit-btn');
    assert.ok(/wajib diisi/.test(await page.locator('#err-judul').innerText()));
    assert.strictEqual(await page.locator('#err-deskripsi').innerText(), 'Deskripsi wajib diisi.');
    assert.strictEqual(await page.locator('#err-gambar').innerText(), 'Foto wajib dipilih.');
    assert.strictEqual((await (await fetch(`${base}/api/konten`)).json()).count, 0);
    await shot(page, '02-konten-kosong');
  });

  await step('konten: isian terisi bertahap, peringatan hilang, foto tetap wajib', async () => {
    await page.fill('#judul', 'Latihan Pertolongan Pertama');
    await page.fill('#deskripsi', 'Anggota PMR berlatih membalut luka dan mengangkat korban dengan tandu.');
    await page.click('#submit-btn');
    assert.strictEqual(await page.locator('#err-judul').innerText(), '');
    assert.strictEqual(await page.locator('#err-deskripsi').innerText(), '');
    assert.strictEqual(await page.locator('#err-gambar').innerText(), 'Foto wajib dipilih.');
  });

  const photoUrl = await makePhoto(page);
  const photo = Buffer.from(photoUrl.split(',')[1], 'base64');

  await step('foto: format tidak didukung ditolak dengan pesan', async () => {
    await page.setInputFiles('#gambar', { name: 'x.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
    assert.strictEqual(await page.locator('#err-gambar').innerText(), 'Foto harus berformat JPG, PNG, atau WEBP.');
    assert.ok(!(await page.locator('.editor-dialog[open]').count()), 'editor tidak terbuka');
  });

  await step('editor: memilih foto membuka editor, pratinjau siluet hanya merah dan putih', async () => {
    await page.setInputFiles('#gambar', { name: 'kegiatan.jpg', mimeType: 'image/jpeg', buffer: photo });
    await page.waitForSelector('.editor-dialog[open]');
    await page.waitForTimeout(150);
    const p = await palette(page);
    assert.strictEqual(Math.round((p.w / p.h) * 100), 133, 'rasio 4:3');
    assert.ok(p.red + p.white > 0.96, `hanya merah+putih, dapat ${JSON.stringify(p)}`);
    assert.ok(p.red > 0.05 && p.white > 0.05, `kedua warna harus ada: ${JSON.stringify(p)}`);
    await shot(page, '03-editor-siluet');
  });

  await step('editor: tombol geser siluet dimatikan -> pratinjau kembali berwarna', async () => {
    await page.locator('#ed-siluet').uncheck();
    await page.waitForTimeout(100);
    const p = await palette(page);
    assert.ok(p.other > 0.5, `harus berwarna: ${JSON.stringify(p)}`);
    assert.ok(await page.locator('#ed-siluet-opts').isHidden(), 'pengaturan siluet disembunyikan');
    await page.locator('#ed-siluet').check();
  });

  await step('editor: ketebalan siluet mengubah banyaknya merah, balik warna menukar merah-putih', async () => {
    await page.locator('#ed-detail').fill('0');
    await page.waitForTimeout(100);
    const thin = await palette(page);
    await page.locator('#ed-detail').fill('100');
    await page.waitForTimeout(100);
    const thick = await palette(page);
    assert.ok(thick.red > thin.red + 0.05, `tebal ${thick.red.toFixed(2)} harus lebih merah dari tipis ${thin.red.toFixed(2)}`);
    await page.locator('#ed-detail').fill('50');
    await page.waitForTimeout(100);
    const normal = await palette(page);
    await page.locator('#ed-balik').check();
    await page.waitForTimeout(100);
    const flipped = await palette(page);
    assert.ok(Math.abs(flipped.red - normal.white) < 0.08, 'merah dan putih bertukar');
    await page.locator('#ed-balik').uncheck();
  });

  await step('editor: kotak crop bisa digeser, diubah ukuran (slider, sudut, keyboard)', async () => {
    const crop = page.locator('#ed-crop');
    const geometry = () => crop.evaluate((el) => ({ l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }));

    await page.locator('#ed-size').fill('50');
    const half = await geometry();
    assert.ok(Math.abs(half.w / half.h - 4 / 3) < 0.02, 'rasio tetap 4:3');

    const box = await crop.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20, { steps: 5 });
    await page.mouse.up();
    const moved = await geometry();
    assert.ok(moved.l > half.l + 30 && moved.t > half.t + 5, `geser: ${JSON.stringify([half, moved])}`);

    const handle = await page.locator('.ed-handle[data-h="se"]').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 - 50, handle.y + handle.height / 2 - 40, { steps: 5 });
    await page.mouse.up();
    const smaller = await geometry();
    assert.ok(smaller.w < moved.w - 20, `ubah ukuran dari sudut: ${moved.w} -> ${smaller.w}`);
    assert.ok(Math.abs(smaller.w / smaller.h - 4 / 3) < 0.02, 'rasio tetap 4:3 setelah ditarik');

    await crop.focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    const keyed = await geometry();
    assert.ok(keyed.l < smaller.l, 'panah kiri menggeser');
    await page.keyboard.press('+');
    assert.ok((await geometry()).w > keyed.w, 'tombol + memperbesar');

    // kotak tidak boleh keluar dari gambar
    await page.locator('#ed-size').fill('15');
    for (let i = 0; i < 60; i += 1) await page.keyboard.press('Shift+ArrowLeft');
    const edge = await geometry();
    assert.ok(edge.l >= 0 && edge.t >= 0, `tetap di dalam gambar: ${JSON.stringify(edge)}`);
    await shot(page, '04-editor-crop');
  });

  await step('editor: "Pakai pratinjau ini" -> foto asli dan pratinjau tampil di formulir', async () => {
    await page.locator('#ed-size').fill('80');
    await page.click('#ed-done');
    await page.waitForSelector('.editor-dialog[open]', { state: 'detached' }).catch(() => {});
    assert.ok(await page.locator('#img-result').isVisible());
    assert.ok((await page.getAttribute('#preview', 'src')).startsWith('data:image/png'), 'pratinjau siluet berupa PNG');
    assert.ok((await page.getAttribute('#orig-thumb', 'src')).startsWith('data:image/jpeg'));
    assert.strictEqual(await page.locator('#preview-style').innerText(), 'Siluet merah-putih');
    assert.strictEqual(await page.locator('#err-gambar').innerText(), '');
    await shot(page, '05-form-siap');
  });

  await step('konten: simpan -> tampil di daftar admin dengan pratinjau', async () => {
    await page.click('#submit-btn');
    await page.waitForSelector('#konten-list >> text=Latihan Pertolongan Pertama');
    const stored = (await (await fetch(`${base}/api/konten`)).json()).data[0];
    assert.ok(/\.jpg$/.test(stored.gambar) && /\.png$/.test(stored.gambar_preview));
    const dim = await page.evaluate(() => new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = document.querySelector('#konten-list img').src; }));
    assert.ok(dim[0] > 0);
    const orig = await fetch(`${base}/${stored.gambar}`);
    const bytes = Buffer.from(await orig.arrayBuffer());
    assert.ok(bytes.length < 5 * 1024 * 1024, 'foto asli sudah dikecilkan');
  });

  await step('foto: dibatalkan di editor -> pratinjau otomatis tetap dibuat', async () => {
    await page.fill('#judul', 'Lomba Tandu Tingkat Kabupaten');
    await page.selectOption('#jenis', 'lomba');
    await page.fill('#juara', 'Juara 2');
    await page.fill('#deskripsi', 'Tim PMR Wira meraih juara 2 lomba tandu.');
    await page.setInputFiles('#gambar', { name: 'lomba.jpg', mimeType: 'image/jpeg', buffer: photo });
    await page.waitForSelector('.editor-dialog[open]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.editor-dialog[open]', { state: 'detached' });
    await page.waitForFunction(() => /otomatis/.test(document.getElementById('preview-style').textContent));
    assert.ok((await page.getAttribute('#preview', 'src')).startsWith('data:image/png'));
    await page.click('#submit-btn');
    await page.waitForSelector('#konten-list >> text=Lomba Tandu Tingkat Kabupaten');
  });

  await step('ubah konten: crop ulang foto yang sudah tersimpan, hanya pratinjau yang diganti', async () => {
    const before = (await (await fetch(`${base}/api/konten?jenis=lomba`)).json()).data[0];
    await page.goto(`${base}/konten.html?edit=${before.id}`);
    await page.waitForSelector('#img-result', { state: 'visible' });
    assert.ok(/uploads\/konten\//.test(await page.getAttribute('#orig-thumb', 'src')));
    await page.click('#edit-image');
    await page.waitForSelector('.editor-dialog[open]');
    await page.locator('#ed-siluet').uncheck();
    await page.click('#ed-done');
    await page.click('#submit-btn');
    await page.waitForFunction(async (id) => {
      const d = (await (await fetch('/api/konten?jenis=lomba')).json()).data.find((k) => k.id === id);
      return d && d.gambar_preview.endsWith('.jpg');
    }, before.id);
    const after = (await (await fetch(`${base}/api/konten?jenis=lomba`)).json()).data[0];
    assert.strictEqual(after.gambar, before.gambar, 'foto asli tidak berubah');
    assert.notStrictEqual(after.gambar_preview, before.gambar_preview);
  });

  // ----------------------------------------------------------
  console.log('\nBERANDA (kartu pratinjau + detail)');
  // ----------------------------------------------------------
  await page.goto(`${base}/index.html`);
  await page.waitForSelector('#kegiatan-grid .pv-card');

  await step('beranda: kartu hanya berisi gambar pratinjau + judul (tanpa deskripsi)', async () => {
    const card = page.locator('#kegiatan-grid .pv-card').first();
    assert.ok(/\.png$/.test(await card.locator('img').getAttribute('src')), 'memakai pratinjau, bukan foto asli');
    assert.strictEqual(await card.locator('.pv-title').innerText(), 'Latihan Pertolongan Pertama');
    assert.ok(!(await card.innerText()).includes('membalut luka'), 'deskripsi tidak tampil di kartu');
    assert.strictEqual(await page.locator('.exp-toggle, .expandable').count(), 0);
    const lomba = page.locator('#lomba-grid .pv-card').first();
    assert.ok(/Juara 2/.test(await lomba.innerText()));
    await card.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.querySelectorAll('#kegiatan-grid .pv-card img, #lomba-grid .pv-card img')].every((i) => i.complete && i.naturalWidth > 0));
    await page.waitForTimeout(500);
    await shot(page, '06-beranda-kartu');
  });

  await step('detail: klik gambar -> foto asli penuh + judul + deskripsi; Esc menutup dan fokus kembali', async () => {
    const card = page.locator('#kegiatan-grid .pv-card').first();
    await card.locator('img').click();
    await page.waitForSelector('dialog.detail-dialog[open]');
    const dialog = page.locator('dialog.detail-dialog');
    await page.waitForFunction(() => { const i = document.querySelector('.detail-dialog img'); return i && i.complete && i.naturalWidth > 0; });
    assert.ok(/\.jpg$/.test(await dialog.locator('img').getAttribute('src')), 'foto asli (bukan pratinjau)');
    assert.strictEqual(await dialog.locator('h2').innerText(), 'Latihan Pertolongan Pertama');
    assert.ok((await dialog.locator('.detail-desc').innerText()).includes('membalut luka'));
    const natural = await dialog.locator('img').evaluate((i) => i.naturalWidth);
    assert.ok(natural >= 1500 && natural <= 1600, `foto asli utuh (lebar ${natural})`);
    await page.waitForTimeout(500); // beri waktu gambar selesai dilukis sebelum difoto
    await shot(page, '07-detail');
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog.detail-dialog[open]', { state: 'detached' });
    assert.ok(await card.locator('.pv-open').evaluate((el) => el === document.activeElement), 'fokus kembali ke kartu');
  });

  await step('detail: klik judul juga membuka; klik area gelap dan tombol tutup menutup', async () => {
    const card = page.locator('#kegiatan-grid .pv-card').first();
    await card.locator('.pv-title').click();
    await page.waitForSelector('dialog.detail-dialog[open]');
    await page.mouse.click(8, 8); // area gelap di luar jendela
    await page.waitForSelector('dialog.detail-dialog[open]', { state: 'detached' });
    await card.locator('.pv-title').click();
    await page.click('[data-detail-close]');
    await page.waitForSelector('dialog.detail-dialog[open]', { state: 'detached' });
  });

  await step('detail: lomba menampilkan juara; navigasi sebelumnya/berikutnya antar konten sejenis', async () => {
    await (await context.request.post(`${base}/api/konten`, { data: { jenis: 'kegiatan', judul: 'Bakti Sosial Desa', deskripsi: 'Pembagian sembako.', gambar: photoUrl } })).json();
    await page.reload();
    await page.waitForSelector('#kegiatan-grid .pv-card >> nth=1');
    await page.locator('#kegiatan-grid .pv-card').first().locator('.pv-open').click();
    await page.waitForSelector('dialog.detail-dialog[open]');
    const dialog = page.locator('dialog.detail-dialog');
    assert.strictEqual(await dialog.locator('[data-count]').innerText(), '1 dari 2');
    assert.ok(await dialog.locator('[data-prev]').isDisabled());
    await page.keyboard.press('ArrowRight');
    assert.strictEqual(await dialog.locator('[data-count]').innerText(), '2 dari 2');
    assert.ok(await dialog.locator('[data-next]').isDisabled());
    await dialog.locator('[data-prev]').click();
    assert.strictEqual(await dialog.locator('[data-count]').innerText(), '1 dari 2');
    await page.keyboard.press('Escape');

    await page.locator('#lomba-grid .pv-card').first().locator('.pv-open').click();
    await page.waitForSelector('dialog.detail-dialog[open]');
    assert.ok(/Juara 2/.test(await page.locator('dialog.detail-dialog .detail-meta').innerText()));
    await page.keyboard.press('Escape');
  });

  await step('konten tanpa gambar pratinjau memakai foto asli sebagai cadangan', async () => {
    await context.request.post(`${base}/api/konten`, { data: { jenis: 'kegiatan', judul: 'Tanpa Pratinjau', deskripsi: 'Uji cadangan.', gambar: photoUrl } });
    await page.reload();
    const card = page.locator('#kegiatan-grid .pv-card', { hasText: 'Tanpa Pratinjau' });
    await card.waitFor();
    assert.ok(/\.jpg$/.test(await card.locator('img').getAttribute('src')));
  });

  await step('XSS: judul berisi HTML tampil sebagai teks biasa, skrip tidak berjalan', async () => {
    await context.request.post(`${base}/api/konten`, { data: { jenis: 'kegiatan', judul: '<img src=x onerror="window.__xss=1">Judul', deskripsi: '<script>window.__xss=2</script>deskripsi', gambar: photoUrl } });
    await page.reload();
    const card = page.locator('#kegiatan-grid .pv-card', { hasText: 'Judul' });
    await card.first().waitFor();
    assert.ok((await card.first().locator('.pv-title').innerText()).includes('<img src=x'), 'tampil sebagai teks');
    await card.first().locator('.pv-open').click();
    await page.waitForSelector('dialog.detail-dialog[open]');
    assert.ok((await page.locator('.detail-desc').innerText()).includes('<script>'));
    assert.strictEqual(await page.evaluate(() => window.__xss), undefined, 'skrip tidak boleh berjalan');
    await page.keyboard.press('Escape');
  });

  await step('admin di beranda: tombol Hapus meminta konfirmasi lalu menghapus kartu', async () => {
    const card = page.locator('#kegiatan-grid .pv-card', { hasText: 'Tanpa Pratinjau' });
    await card.locator('[data-admin-delete]').click();
    await page.waitForSelector('dialog[open] [data-yes]');
    await page.locator('dialog[open] [data-yes]').click();
    await page.waitForFunction(() => !document.body.innerText.includes('Tanpa Pratinjau'));
  });

  // ----------------------------------------------------------
  console.log('\nTAMPILAN PONSEL (390 x 844)');
  // ----------------------------------------------------------
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const mobile = await phone.newPage();
  watch(mobile, 'ponsel');

  await step('ponsel: kartu satu kolom tanpa meluber, detail muat di layar', async () => {
    await mobile.goto(`${base}/index.html`);
    await mobile.waitForSelector('#kegiatan-grid .pv-card');
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `halaman tidak boleh bergeser ke samping (${overflow}px)`);
    const card = mobile.locator('#kegiatan-grid .pv-card').first();
    await card.scrollIntoViewIfNeeded();
    await shot(mobile, '08-ponsel-kartu');
    await card.locator('.pv-open').tap();
    await mobile.waitForSelector('dialog.detail-dialog[open]');
    const box = await mobile.locator('dialog.detail-dialog').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 391, `detail muat lebar layar: ${JSON.stringify(box)}`);
    await shot(mobile, '09-ponsel-detail');
    await mobile.locator('[data-detail-close]').tap();
  });

  await step('ponsel: editor crop muat di layar kecil dan bisa disentuh', async () => {
    const adminCookie = (await context.cookies()).find((c) => c.name === 'uks_session');
    await phone.addCookies([{ name: adminCookie.name, value: adminCookie.value, url: base }]);
    await mobile.goto(`${base}/konten.html`);
    await mobile.waitForSelector('#konten-form');
    await mobile.fill('#judul', 'Uji Ponsel');
    await mobile.setInputFiles('#gambar', { name: 'p.jpg', mimeType: 'image/jpeg', buffer: photo });
    await mobile.waitForSelector('.editor-dialog[open]');
    await mobile.waitForTimeout(500); // tunggu animasi buka dialog selesai sebelum mengukur
    const box = await mobile.locator('.editor-dialog').boundingBox();
    const diag = await mobile.evaluate(() => ({
      inner: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
      wide: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 5).map((e) => `${e.tagName}.${String(e.className).slice(0, 30)}:${Math.round(e.getBoundingClientRect().right)}`)
    }));
    assert.ok(box.x >= 0 && box.x + box.width <= 391, `editor muat: ${JSON.stringify(box)} ${JSON.stringify(diag)}`);
    assert.ok(await mobile.locator('#ed-done').isVisible());
    await shot(mobile, '10-ponsel-editor');
    await mobile.keyboard.press('Escape');
  });

  await step('XSS: nama, keluhan, obat, dan barang berisi HTML tampil sebagai teks di semua halaman pencatatan', async () => {
    const payload = '<img src=x onerror="window.__xss=7">';
    const post = (url, data) => phone.request.post(base + url, { data });
    await post('/api/patients', { nama_pasien: payload, nis: '10009', kelas: 'XII TKJ A', tanggal_sakit: '2026-10-05', keluhan: payload });
    await post('/api/obat-keluar', { tanggal: '2026-10-05', nama: payload, kelas: 'X DKV 2', obat: payload, jumlah: 1, keterangan: payload });
    await post('/api/peminjaman', { tanggal_pinjam: '2026-10-05', nama: payload, kelas: 'PMR', jenis_barang: payload, keterangan: payload });
    await post('/api/blood-pressure', { nama_siswa: payload, nis: '10008', kelas: 'XI RPL 1', pengukuran_ke: 1, sistolik: 120, diastolik: 80 });
    for (const page of ['patients.html', 'obat.html', 'pinjam.html', 'tensi.html']) {
      await mobile.goto(`${base}/${page}`);
      await mobile.waitForLoadState('networkidle');
      await mobile.waitForTimeout(250);
      assert.strictEqual(await mobile.evaluate(() => window.__xss), undefined, `skrip berjalan di ${page}`);
      assert.strictEqual(await mobile.locator('img[src="x"]').count(), 0, `tag img sisipan muncul di ${page}`);
      assert.ok((await mobile.locator('body').innerText()).includes('<img src=x'), `${page}: teks harus tampil apa adanya`);
    }
  });

  await step('ponsel: tidak ada halaman yang meluber ke samping walau datanya sangat panjang', async () => {
    const long = (n, ch = 'W') => ch.repeat(n);
    // Isi tiap modul dengan teks terpanjang yang diizinkan server (tanpa spasi = skenario terburuk)
    const tryPost = async (url, build) => {
      for (const n of [480, 300, 150, 90, 40, 18]) {
        const res = await phone.request.post(base + url, { data: build(n) });
        if (res.status() === 201) return;
      }
      throw new Error(`tidak ada panjang yang diterima untuk ${url}`);
    };
    await tryPost('/api/patients', (n) => ({ nama_pasien: long(Math.min(n, 100)), nis: '10001', kelas: long(Math.min(n, 20), 'K'), tanggal_sakit: '2026-10-05', keluhan: long(n, 'Q') }));
    await tryPost('/api/obat-keluar', (n) => ({ tanggal: '2026-10-05', nama: long(Math.min(n, 100)), kelas: long(Math.min(n, 20), 'K'), obat: long(Math.min(n, 100), 'O'), jumlah: 2, keterangan: long(n, 'T') }));
    await tryPost('/api/peminjaman', (n) => ({ tanggal_pinjam: '2026-10-05', nama: long(Math.min(n, 100)), kelas: long(Math.min(n, 30), 'K'), jenis_barang: long(Math.min(n, 100), 'B'), keterangan: long(n, 'T') }));
    await tryPost('/api/blood-pressure', (n) => ({ nama_siswa: long(Math.min(n, 100)), nis: '10002', kelas: long(Math.min(n, 20), 'K'), pengukuran_ke: 1, sistolik: 120, diastolik: 80 }));
    await tryPost('/api/accounts/staff', (n) => ({ nama: long(Math.min(n, 100)), username: long(30, 'u'), password: 'sandi-panjang-1', role: 'petugas' }));

    const wide = [];
    for (const page of ['index.html', 'konten.html', 'patients.html', 'obat.html', 'pinjam.html', 'tensi.html', 'akun.html', 'profil.html']) {
      await mobile.goto(`${base}/${page}`);
      await mobile.waitForLoadState('networkidle');
      await mobile.waitForTimeout(250);
      const over = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 1) {
        const culprit = await mobile.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 3).map((e) => `${e.tagName}.${String(e.className).slice(0, 30)}`).join(' '));
        wide.push(`${page} (+${over}px: ${culprit})`);
      }
    }
    assert.ok(wide.length === 0, `halaman yang meluber: ${wide.join(' | ')}`);
  });

  // ----------------------------------------------------------
  console.log('\nPENDAFTARAN SISWA');
  // ----------------------------------------------------------
  const guest = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const gp = await guest.newPage();
  watch(gp, 'tamu');
  await step('daftar: semua kolom kosong -> peringatan di tiap kolom', async () => {
    await gp.goto(`${base}/index.html?daftar=1`);
    await gp.waitForSelector('#af-nama', { state: 'visible' });
    await gp.locator('.af-submit').click();
    const msg = async (n) => gp.locator(`[data-field="${n}"] .af-error`).innerText();
    assert.strictEqual(await msg('nama'), 'Nama lengkap wajib diisi.');
    assert.strictEqual(await msg('nis'), 'NIS wajib diisi.');
    assert.strictEqual(await msg('identifier'), 'Username wajib diisi.');
    assert.strictEqual(await msg('password'), 'Kata sandi wajib diisi.');
    await gp.fill('#af-nis', '12ab');
    await gp.fill('#af-password', '123');
    await gp.locator('.af-submit').click();
    assert.strictEqual(await msg('nis'), 'NIS harus 5 digit angka.');
    assert.strictEqual(await msg('password'), 'Kata sandi minimal 8 karakter.');
    await shot(gp, '11-daftar-kosong');
  });

  await step('akses halaman admin tanpa login diarahkan ke login', async () => {
    await gp.goto(`${base}/konten.html`);
    await gp.waitForFunction(() => document.querySelector('.auth-overlay.is-open') || /index\.html|\/$/.test(location.pathname) || document.body.innerText.length > 0);
    await gp.waitForTimeout(500);
    const visible = await gp.locator('#konten-form').isVisible().catch(() => false);
    assert.ok(!visible, 'form konten tidak boleh tampil untuk tamu');
  });

  console.log('\nGALAT DI BROWSER');
  await step('tidak ada galat JavaScript dan tidak ada pelanggaran CSP di semua halaman', async () => {
    assert.deepStrictEqual(problems, []);
  });

  await browser.close();
  await h.close();
  h.cleanup();
  console.log(`\nUji QA tampilan: ${passed} lulus, ${failed} gagal`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
