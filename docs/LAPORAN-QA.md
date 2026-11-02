# Laporan QA (pemeriksaan kualitas dan keamanan)

Cakupan: seluruh aplikasi (login dan pendaftaran, pencatatan, ekspor Excel, kelola akun, kelola konten, beranda), ditambah fitur baru **pratinjau siluet + detail kegiatan/lomba**.

## Cara memeriksa

| Cara | Isi |
| --- | --- |
| Uji unit (`test/run.js`) | 19 uji: penulis Excel, klasifikasi tekanan darah, validator. |
| Uji API end-to-end (`test/api-qa.js`) | 36 uji. Menjalankan **kode asli** (route, middleware, controller, validator) lewat HTTP dengan Express tiruan dan database memori. |
| Uji tampilan (`test/ui-qa.js`) | 29 skenario di Chromium: desktop 1280 px dan ponsel 390 px. |
| **Uji mutasi** | Kode sengaja dirusak (CSRF dimatikan, cookie rusak dibiarkan melempar error, jangkar regex penghapus file dilepas, gambar tak lagi wajib, cek login konten dibuang) untuk memastikan uji benar-benar gagal. Satu mutasi sempat lolos, lalu ujinya diperketat; kini kelimanya terdeteksi. |
| Audit manual kode | Seluruh `src/` dibaca: auth, validasi, model, controller, route; pemakaian `innerHTML` di `public/js/`. |

## Temuan dan perbaikan

### Keamanan

| # | Temuan | Dampak | Perbaikan |
| --- | --- | --- | --- |
| S1 | Akun bawaan dengan kata sandi yang tercantum di README (mis. `Administrator01` / `administrator01`) dibuat **otomatis di semua lingkungan**. | **Kritis** bila server dibuka ke internet: siapa pun bisa login sebagai Administrator. | Hanya dibuat di mode pengembangan. Di produksi server **menolak berjalan** selama kata sandi awal masih dipakai; `npm run seed` ditolak. Administrator pertama dibuat dengan `npm run buat-admin`. |
| S2 | `cors()` terbuka tanpa batas, padahal frontend dan API satu alamat. | Permukaan serangan tak perlu. | CORS dihapus (dependensi `cors` ikut dibuang). |
| S3 | Tidak ada header pengaman (CSP, nosniff, anti-iframe, dll.). | XSS dan clickjacking lebih mudah. | `securityHeaders`: CSP ketat (tanpa skrip inline: terbukti HTML proyek tidak memakainya), nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, Cross-Origin-*, HSTS di produksi. |
| S4 | Tidak ada pertahanan CSRF selain `SameSite=Lax`. | Lapisan pengaman tunggal. | `sameOriginGuard` menolak permintaan pengubah data dengan `Origin` situs lain. Sadar proxy (`TRUST_PROXY`, `X-Forwarded-Host`, `ALLOWED_ORIGINS`). |
| S5 | Semua endpoint API mem-parsing bodi JSON hingga **10 MB sebelum** pengecekan login. | Siapa pun tanpa akun bisa memaksa server menampung kiriman besar. | Batas global 100 KB. Route konten (14 MB untuk foto) baru membaca bodi **setelah** terbukti Administrator. |
| S6 | Cookie sesi yang rusak (`%E0%A4%A`) membuat `decodeURIComponent` melempar error: semua endpoint ber-login menjawab 500. | Bug; bisa dipakai mengganggu. | Dibungkus `try/catch`, dijawab 401. |
| S7 | Tidak ada pembatas per IP pada login, pendaftaran, dan API. | Tebak sandi lintas akun, banjir permintaan. | `rateLimit` per IP, sengaja longgar (satu sekolah berbagi satu IP), bisa diatur lewat `.env`. Kunci per akun tetap ada. |
| S8 | Penghapusan file lama hanya memeriksa awalan `uploads/konten/` dan `..`. | Rentan terhadap pola alamat tak terduga. | Regex ketat (`isOwnImage`), diuji dengan 8 alamat berbahaya. |
| S9 | Foto unggahan tanpa `nosniff`, tanpa cache. | Risiko penyajian ulang konten ambigu. | `nosniff` di semua jawaban, cache panjang untuk file bernama unik. |
| S10 | Kesalahan 413 (terlalu besar) berpesan bahasa Inggris dari pustaka. | Membingungkan pengguna. | Pesan Indonesia. |

Serangan yang **diuji dan ditolak**: unggah SVG berisi skrip, HTML yang menyamar sebagai PNG (di foto utama maupun pratinjau), GIF, file > 6 MB, data gambar bukan teks, alamat file sebagai gambar; XSS lewat judul/nama/keluhan/obat/barang (tampil sebagai teks, skrip tidak berjalan); permintaan lintas situs dengan cookie admin; akses `/.env`, `/src/app.js`, `/database/schema.sql`, penelusuran `..`; kata sandi diganti lalu sesi lama dipakai; sesi setelah keluar.

### Fungsional dan tampilan

| # | Temuan | Perbaikan |
| --- | --- | --- |
| F1 | **Editor siluet tidak menggambar apa pun**: `renderTo` memakai `crop.h` padahal objek crop hanya punya `x, y, w`, hasilnya merah polos. Ditemukan oleh uji tampilan. | Tinggi dihitung dari `w * 3/4`. Uji memeriksa komposisi warna pratinjau. |
| F2 | Daftar konten di halaman admin **meluber hingga 1907 px** di ponsel bila judul panjang tanpa spasi. | `min-width: 0` + `overflow-wrap: anywhere`. |
| F3 | Lima halaman lain meluber di ponsel dengan data panjang: Data pasien, Tekanan darah, Kelola akun, Obat keluar, Peminjaman. | Pengaman teks panjang global di `style.css`; audit otomatis semua halaman. |
| F4 | Pegangan sudut kotak crop terpotong saat kotak berada di tepi foto (sulit disentuh). | Lapisan gelap dipisah dari kotak crop interaktif. |
| F5 | Tombol aksi editor di bawah layar pada tinggi 800 px. | Menempel di dasar jendela (sticky). |
| F6 | Panah "Lihat foto dan deskripsi" menunjuk ke kiri; sorotan sentuh biru di ponsel. | Panah dibalik; `-webkit-tap-highlight-color`. |
| F7 | Foto konten sebelumnya opsional dan tanggal tak divalidasi di form. | Foto wajib saat membuat (konten lama tanpa foto tetap boleh disunting), tanggal divalidasi, peringatan per kolom, tombol menampilkan "Menyimpan...". |
| F8 | Server menyala tanpa menyiapkan kolom baru pada database lama. | `ensureSchema` menambah `gambar_preview` otomatis; server berhenti dengan petunjuk jelas bila gagal. |
| F9 | Penjaga CSRF akan memblokir **semua** simpan/login bila Nginx tidak meneruskan `Host`. | Dikenali (`X-Forwarded-Host` bila `TRUST_PROXY`), pesan galat menyebut cara memperbaiki, dan didokumentasikan di README. |

### Validasi isian (diperiksa tiap kolom, server dan tampilan)

Login (username, kata sandi, peran), daftar siswa (nama, NIS 5 digit, username/email, kata sandi 8+), pasien (nama, NIS, kelas, tanggal valid, keluhan ≤ 500), obat (jumlah bulat 1–999), peminjaman (tanggal kembali tidak sebelum tanggal pinjam), tekanan darah (rentang nilai, pengukuran ke-1..3), akun (wajib, duplikat 409, tak bisa hapus diri sendiri), konten (judul, deskripsi, foto, jenis, panjang, tanggal). Semua mengembalikan pesan Indonesia yang spesifik dan form tidak maju sebelum benar.

## Hasil akhir

`npm test` **55 lulus, 0 gagal** (19 unit + 36 API). `npm run test:ui` **29 lulus, 0 gagal**. Tidak ada galat JavaScript maupun pelanggaran CSP di semua halaman yang diuji.

## Batasan pemeriksaan (jujur)

- **Express dan MySQL asli tidak dijalankan**: lingkungan pemeriksaan tidak punya internet. Kode asli diuji dengan Express tiruan dan database memori. Pernyataan SQL lama tidak diubah; SQL baru hanya `INFORMATION_SCHEMA` dan `ALTER TABLE`. **Mohon jalankan `npm install && npm start` sekali dan buka `/api/health`.**
- Perbedaan kecil Express asli vs tiruan yang diketahui: berkas berawalan titik dijawab 403 (tiruan: 404); keduanya menolak.
- File Excel diuji lewat LibreOffice dan `openpyxl`, **belum di Microsoft Excel**.
- Tidak ada uji beban, pembaca layar, atau perangkat fisik. Dukungan keyboard pada editor crop diuji; kelengkapan aksesibilitas lain tidak diaudit penuh.
- `npm audit` tidak bisa dijalankan tanpa internet.

## Risiko tersisa (keputusan kebijakan, bukan bug)

1. Pendaftaran mandiri siswa tidak memverifikasi NIS terhadap daftar induk (lihat README bagian 8).
2. Pembatas permintaan di memori satu proses.
3. Foto tidak dipindai antivirus (hanya diverifikasi sebagai gambar dan disajikan `nosniff`).
