# UKS PMR WIRA SMK Negeri 1 Gombong

Sistem rekam medis digital Unit Kesehatan Sekolah (UKS) PMR Wira SMKN 1 Gombong.

- **Tampilan**: HTML, CSS, dan JavaScript biasa (tanpa framework, tanpa proses build).
- **Server**: Node.js + Express.
- **Database**: MySQL atau MariaDB.

Dokumen ini ditulis agar developer yang baru pertama kali melihat proyek ini bisa menjalankannya, menyambungkannya ke server dan database, lalu memasangnya di server sungguhan. Bacalah berurutan dari bagian 1.

**Daftar isi**

1. [Cara kerja singkat](#1-cara-kerja-singkat)
2. [Peran dan hak akses](#2-peran-dan-hak-akses)
3. [Menjalankan di komputer sendiri](#3-menjalankan-di-komputer-sendiri)
4. [Koneksi ke database dan server (isi `.env`)](#4-koneksi-ke-database-dan-server-isi-env)
5. [Akun pertama](#5-akun-pertama)
6. [Fitur dan cara memakainya](#6-fitur-dan-cara-memakainya)
7. [Memasang di server sungguhan (produksi)](#7-memasang-di-server-sungguhan-produksi)
8. [Keamanan](#8-keamanan)
9. [Pengujian](#9-pengujian)
10. [Struktur folder](#10-struktur-folder)
11. [API ringkas](#11-api-ringkas)
12. [Mengubah isi tanpa membuka database](#12-mengubah-isi-tanpa-membuka-database)
13. [Pemecahan masalah](#13-pemecahan-masalah)

Laporan hasil pemeriksaan kualitas (QA) ada di [`docs/LAPORAN-QA.md`](docs/LAPORAN-QA.md).

---

## 1. Cara kerja singkat

```
 Browser (HTML/CSS/JS di folder public/)
        |
        |  satu alamat saja, mis. http://localhost:3000
        v
 Express (src/app.js)
   |-- menyajikan file di folder public/        (halaman, gambar, foto unggahan)
   |-- menjawab alamat yang diawali /api        (data JSON)
        |
        v
 MySQL (database uks_pmr_wira)
```

Hal penting yang perlu dipahami:

- **Frontend dan API berada di satu alamat.** Halaman dibuka dari Express, dan semua panggilan data memakai alamat relatif `/api/...` (lihat `public/js/api.js`). Karena itu **tidak ada pengaturan alamat API yang perlu diubah** ketika pindah dari komputer lokal ke server: cukup buka alamat server.
- **Tidak memakai CORS.** Situs lain sengaja tidak diizinkan memanggil API ini. Jangan membuka file HTML langsung dari folder (`file://`) atau lewat Live Server di port lain: login tidak akan berfungsi. Selalu buka lewat alamat Express.
- **Login memakai cookie sesi** (`uks_session`, `HttpOnly`, `SameSite=Lax`, berlaku 8 jam). Token sesi disimpan di database dalam bentuk hash, bukan teks asli.
- **Hak akses dijaga di server** pada setiap permintaan. Menyembunyikan menu di tampilan hanya untuk kenyamanan, bukan pengaman.

## 2. Peran dan hak akses

| Peran | Yang bisa dilakukan |
| --- | --- |
| **Administrator** | Seluruh kendali sistem. Membuat, mengubah, dan menghapus akun Administrator, Petugas UKS, dan Siswa. Mengelola Kegiatan dan Lomba di beranda. Mengerjakan semua yang bisa dikerjakan Petugas UKS. |
| **Petugas UKS** | Mencatat data pasien sakit, tekanan darah, obat keluar, dan peminjaman barang. Mengunduh rekap bulanan (Excel) dan mencetak data. |
| **Siswa** | Melihat hasil tekanan darahnya sendiri (berdasarkan NIS). |
| **Pengunjung** (belum login) | Melihat beranda, termasuk Kegiatan dan Lomba. |

Siswa bisa mendaftar sendiri lewat kartu Siswa, atau didaftarkan Administrator. Akun Petugas UKS dan Administrator hanya dibuat oleh Administrator.

## 3. Menjalankan di komputer sendiri

**Kebutuhan**

| Kebutuhan | Keterangan |
| --- | --- |
| Node.js **18 atau lebih baru** | Cek dengan `node -v`. Unduh dari <https://nodejs.org> (pilih LTS). |
| MySQL 5.7+ atau MariaDB 10.3+ | Di Windows paling mudah lewat **XAMPP** atau **Laragon** (sudah termasuk MySQL dan phpMyAdmin). |
| Terminal | Command Prompt, PowerShell, atau terminal VS Code. |

**Langkah**

1. **Masuk ke folder proyek**:
   ```bash
   cd uks-pmr-wira
   ```
2. **Pasang paket**:
   ```bash
   npm install
   ```
3. **Buat file `.env`** dari contohnya:
   ```bash
   # Windows (Command Prompt)         : copy .env.example .env
   # Windows (PowerShell) / Mac / Linux: cp .env.example .env
   ```
   Untuk XAMPP/Laragon bawaan (user `root`, tanpa kata sandi) isinya tidak perlu diubah. Penjelasan tiap baris ada di [bagian 4](#4-koneksi-ke-database-dan-server-isi-env).
4. **Nyalakan MySQL** (tombol *Start* pada MySQL di XAMPP/Laragon).
5. **Impor database.** Pilih salah satu:
   - **phpMyAdmin**: buka <http://localhost/phpmyadmin>, tab **Import**, pilih file `database/schema.sql`, klik **Go**.
   - **Terminal**: `mysql -u root -p < database/schema.sql`

   File ini membuat database `uks_pmr_wira` beserta semua tabelnya. Aman dijalankan ulang (memakai `IF NOT EXISTS`) dan **tidak menghapus data** yang sudah ada.
6. **Jalankan server**:
   ```bash
   npm start
   ```
   Bila berhasil, terminal menampilkan:
   ```
   [OK] Terhubung ke database MySQL
   [OK] Akun awal (khusus pengembangan) dibuat: Administrator01, Alpha, ...
   [OK] Server berjalan di http://localhost:3000 (mode pengembangan)
   ```
7. **Buka** <http://localhost:3000>.

**Cek cepat bahwa semuanya tersambung**: buka <http://localhost:3000/api/health>. Jawaban yang benar:
```json
{"status":"ok","database":"terhubung","time":"..."}
```
Bila `database` bukan `terhubung`, lihat [bagian 13](#13-pemecahan-masalah).

**Perintah lain**

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Seperti `npm start`, tetapi server dimulai ulang otomatis saat kode berubah (nodemon). |
| `npm run buat-admin` | Membuat akun Administrator baru secara interaktif (dipakai di server produksi). |
| `npm run seed` | Membuat akun awal untuk uji coba (hanya mode pengembangan). |
| `npm test` | Menjalankan uji otomatis (unit + API end-to-end). |
| `npm run test:ui` | Menjalankan uji tampilan di browser (butuh Playwright, lihat [bagian 9](#9-pengujian)). |

**Memperbarui dari versi lama.** Server memeriksa struktur database setiap kali menyala dan **menambahkan kolom yang kurang secara otomatis** (saat ini: `konten_situs.gambar_preview`). Cukup ganti kode lalu jalankan ulang server; data lama tetap aman. Bila versi Anda jauh lebih lama (NISN 10 digit, tanpa tabel `students`), struktur tabelnya berubah total: ekspor data yang perlu, hapus database `uks_pmr_wira`, lalu impor `database/schema.sql`.

## 4. Koneksi ke database dan server (isi `.env`)

Semua pengaturan ada di file **`.env`** di folder utama proyek. File ini rahasia dan **tidak boleh diunggah ke GitHub** (sudah ada di `.gitignore`). Yang diunggah hanyalah `.env.example`, contoh tanpa rahasia.

| Variabel | Bawaan | Penjelasan |
| --- | --- | --- |
| `PORT` | `3000` | Port server Express. Ganti bila bentrok dengan program lain. |
| `NODE_ENV` | `development` | `production` untuk server sungguhan. Mode produksi lebih ketat (lihat [bagian 7](#7-memasang-di-server-sungguhan-produksi)). |
| `DB_HOST` | `localhost` | Alamat server MySQL. Isi IP atau nama host bila MySQL ada di komputer lain. |
| `DB_PORT` | `3306` | Port MySQL. |
| `DB_USER` | `root` | Pengguna MySQL. **Di server sungguhan jangan pakai `root`**; buat pengguna khusus (lihat bawah). |
| `DB_PASSWORD` | *(kosong)* | Kata sandi pengguna MySQL. **Wajib diisi di server sungguhan.** |
| `DB_NAME` | `uks_pmr_wira` | Nama database. |
| `TRUST_PROXY` | *(kosong)* | Isi `1` bila server di belakang Nginx/Caddy/Cloudflare. Lihat [bagian 7.4](#74-nginx-sebagai-pintu-depan--https). |
| `UPLOAD_ROOT` | *(kosong)* | Folder induk penyimpanan foto unggahan (subfolder `uploads/konten` dibuat otomatis). Kosong = folder `public/`. |
| `ALLOWED_ORIGINS` | *(kosong)* | Alamat situs lain yang boleh mengirim data ke API (dipisah koma). Hampir tidak pernah perlu. |
| `API_RATE_MAX` | `600` | Batas permintaan API per menit per IP. |
| `LOGIN_RATE_MAX` | `200` | Batas percobaan login per 15 menit per IP. |
| `REGISTER_RATE_MAX` | `80` | Batas pendaftaran per jam per IP. |
| `ALLOW_DEFAULT_PASSWORDS` | `false` | Hanya untuk uji coba di mode produksi. **Jangan diaktifkan di server sungguhan.** |

> Batas per IP sengaja longgar karena satu sekolah biasanya berbagi **satu IP publik**; satu kelas yang login bersamaan tidak boleh saling memblokir. Perlindungan tebak-sandi yang sebenarnya dikunci **per akun** (5 kali salah, dikunci 5 menit).

**Menyambung ke MySQL di komputer lain (atau layanan database online)**

1. Pastikan MySQL di sana menerima koneksi dari luar (`bind-address` bukan `127.0.0.1`) dan port 3306 dibuka **hanya untuk IP server aplikasi**.
2. Isi `DB_HOST` dengan alamatnya, serta `DB_USER` dan `DB_PASSWORD`.
3. Impor `database/schema.sql` ke database tujuan.

**Membuat pengguna MySQL khusus (disarankan untuk server sungguhan)**

```sql
CREATE USER 'uks_app'@'localhost' IDENTIFIED BY 'GANTI-DENGAN-KATA-SANDI-KUAT';
GRANT SELECT, INSERT, UPDATE, DELETE, ALTER ON uks_pmr_wira.* TO 'uks_app'@'localhost';
FLUSH PRIVILEGES;
```

Lalu isi `.env`: `DB_USER=uks_app` dan `DB_PASSWORD=` kata sandi tadi. Hak `ALTER` dibutuhkan agar server bisa menambah kolom baru otomatis saat pembaruan; setelah pembaruan selesai hak itu boleh dicabut.

**Bila database bermasalah**: server tetap hidup dan permintaan data dijawab `503` dengan pesan "Database tidak dapat dihubungi"; tampilan menunjukkan pesan yang ramah, bukan layar kosong. Begitu MySQL menyala lagi, koneksi pulih sendiri tanpa memulai ulang server.

## 5. Akun pertama

**Mode pengembangan** (`NODE_ENV=development`): saat server pertama kali menyala dan belum ada akun staf, 6 akun uji dibuat otomatis.

| Peran | Username | Kata sandi |
| --- | --- | --- |
| Administrator | `Administrator01` | `administrator01` |
| Petugas UKS | `Alpha` | `alphasenin01` |
| Petugas UKS | `Beta` | `betaselasa02` |
| Petugas UKS | `Gamma` | `gammarabu03` |
| Petugas UKS | `Delta` | `deltakamis04` |
| Petugas UKS | `Epsilon` | `epsilonjumat05` |

**Mode produksi** (`NODE_ENV=production`): akun di atas **tidak dibuat**, dan server **menolak berjalan** bila akun-akun itu ada dengan kata sandi awal. Buat Administrator pertama dengan:

```bash
npm run buat-admin
```

Ikuti pertanyaannya (nama, username, kata sandi minimal 8 karakter; kata sandi tidak tampil saat diketik). Tanpa pertanyaan: `npm run buat-admin -- --nama "Nama Lengkap" --username NamaAdmin --password "KataSandiAnda"`. Setelah itu masuk lewat kartu **Administrator**, buka **Kelola akun**, lalu buat akun Petugas UKS dan Siswa yang diperlukan.

Login memakai **username atau email**. Huruf besar-kecil username tidak dibedakan. Kartu yang dipilih harus sesuai peran akunnya.

## 6. Fitur dan cara memakainya

### Beranda

Profil, layanan, informasi sistem, **Kegiatan PMR Wira**, dan **Prestasi dan lomba**.

Kartu Kegiatan dan Lomba **hanya menampilkan gambar pratinjau dan judul**. Gambar pratinjau berupa potongan foto (crop) yang bisa dibuat bergaya **siluet merah-putih** senada dengan warna situs. **Klik gambar atau judul** untuk membuka jendela detail: **foto asli berwarna dan utuh**, judul, tanggal, juara (untuk lomba), dan deskripsi lengkap. Di jendela detail, tombol *Sebelumnya/Berikutnya* atau panah kiri/kanan keyboard berpindah antar konten sejenis; `Esc`, tombol tutup, atau klik area gelap menutupnya. Foto asli hanya dimuat saat kartu diklik, sehingga beranda tetap ringan.

### Login

Tiga kartu peran. Sorot atau sentuh kartu agar maju ke depan, klik untuk memilih. Kartu terbang ke tengah sambil berputar, dan punggungnya adalah form login yang warnanya sesuai kartu. Latar netral abu-abu muda agar senada dengan dashboard; nuansanya diubah lewat `--auth-bg` di `public/css/login.css`. Gambar kartu disiapkan sekali di waktu senggang (SVG dirender menjadi bitmap) supaya animasi tidak patah-patah.

**Validasi** (pesan tampil tepat di bawah kolom yang salah, kolom pertama yang salah otomatis difokuskan, dan form tidak terkirim sebelum benar):

| Kolom kosong atau salah | Pesan |
| --- | --- |
| Username/email kosong | `Username/email wajib diisi.` |
| Kata sandi kosong | `Kata sandi wajib diisi.` |
| Nama (daftar) kosong | `Nama lengkap wajib diisi.` |
| NIS bukan 5 digit | `NIS harus 5 digit angka.` |
| Kata sandi (daftar) kurang dari 8 karakter | `Kata sandi minimal 8 karakter.` |
| Akun tidak cocok | Pesan umum dari server (sengaja tidak menyebut mana yang salah agar akun tidak bisa ditebak). |
| Terlalu sering salah | Akun dikunci sementara beberapa menit. |

### Kelola konten (Administrator): Kegiatan dan Lomba

Halaman **Konten** di menu atas. Satu konten terdiri dari **jenis** (Kegiatan atau Lomba), **judul**, **tanggal**, **deskripsi**, **juara** (khusus Lomba), dan **foto**. Judul, deskripsi, dan foto **wajib**: peringatan muncul di bawah kolom yang kosong dan konten tidak tersimpan sebelum semuanya terisi.

**Alur menambah konten**

1. Pilih jenis, isi judul, tanggal, dan deskripsi.
2. Klik **Pilih foto** (JPG, PNG, atau WEBP). Foto otomatis dikecilkan di browser (maks. 1600 px).
3. **Editor gambar pratinjau** terbuka otomatis:
   - **Crop**: geser kotak 4:3 untuk memilih bagian foto yang tampil di kartu. Tarik pegangan di empat sudut untuk mengubah ukuran, atau pakai slider *Ukuran kotak crop*. Dengan keyboard: tombol panah menggeser (Shift = lebih jauh), `+` dan `-` mengubah ukuran. Foto asli tidak berubah.
   - **Gaya siluet merah-putih**: tombol geser untuk mengubah potongan menjadi seni siluet. *Ketebalan siluet* mengatur banyaknya area merah, *Balik warna* menukar merah dan putih. Matikan tombolnya bila ingin pratinjau berwarna biasa.
   - Panel kanan menampilkan pratinjau hasil secara langsung.
4. Klik **Pakai pratinjau ini**. (Bila editor dibatalkan, pratinjau dibuat otomatis dari crop tengah dengan gaya siluet.)
5. Formulir menampilkan **Foto asli** dan **Pratinjau kartu**. **Atur crop dan siluet** membuka editor lagi; **Ganti foto** memilih foto lain.
6. Klik **Simpan dan tampilkan**. Konten langsung tampil di beranda.

**Mengubah konten**: tombol **Ubah** (di halaman Konten, atau langsung di kartu pada beranda saat login sebagai Administrator). Untuk memotong ulang saja, klik *Atur crop dan siluet*: yang diganti hanya pratinjau, foto asli tetap. File gambar lama yang tak terpakai dihapus otomatis. **Hapus** meminta konfirmasi dan ikut menghapus kedua file gambar.

Warna siluet adalah merah tua `#a30f1a` (sama dengan `--red-700` di `public/css/style.css`), diatur di konstanta `INK` pada `public/js/image-editor.js`. Pratinjau yang sudah tersimpan tidak berubah otomatis bila warna diganti; potong ulang lewat tombol Ubah.

### Data pasien sakit (Petugas UKS dan Administrator)

Nama, NIS (5 digit), kelas, tanggal sakit, dan sakit/keluhan (pilih dari daftar atau ketik). Ada pencarian, filter kelas, ubah, dan hapus. Semua kolom wajib; peringatan muncul per kolom.

### Tekanan darah

Tiap siswa diukur 3 kali. Kategori dihitung otomatis oleh server:

| Kategori | Rentang |
| --- | --- |
| Hipotensi | Sistolik < 90 **atau** diastolik < 60 |
| Normal | Sistolik < 120 **dan** diastolik < 80 |
| Prehipertensi | Sistolik 120–129 **dan** diastolik < 80 |
| Hipertensi Derajat 1 | Sistolik 130–139 **atau** diastolik 80–89 |
| Hipertensi Derajat 2 | Sistolik ≥ 140 **atau** diastolik ≥ 90 |
| Krisis Hipertensi | Sistolik > 180 **atau** diastolik > 120 |

Bila dua kategori sama-sama cocok, yang lebih tinggi dipakai (150/55 masuk Hipertensi Derajat 2). Ini alat bantu skrining, **bukan diagnosis**. Siswa melihat hasilnya sendiri di halaman *Tekanan darah saya*.

### Obat keluar dan peminjaman barang

**Obat keluar**: tanggal, nama, kelas, obat (pilih atau ketik), jumlah (bilangan bulat 1–999), keterangan.
**Peminjaman**: tanggal pinjam, nama, kelas/organisasi, jenis barang, tanggal kembali, keterangan. Tanggal kembali kosong berarti masih dipinjam; tombol **Tandai kembali** mengisinya dengan tanggal hari ini. Tanggal kembali tidak boleh sebelum tanggal pinjam.

### Rekap data bulanan ke dokumen (Excel) dan cetak

Di halaman Data pasien, Tekanan darah, Obat keluar, dan Peminjaman: pilih **Bulan** dan **Tahun**, lalu **Unduh Excel**. Nama file otomatis, contoh `Rekap Data Siswa Sakit Bulan November 2026.xlsx`. File berisi **tiga sheet dengan urutan tetap**:

1. **Data ...** (mis. `Data Siswa Sakit`): daftar lengkap semua isian formulir. Baris selang-seling berwarna, header terkunci, bisa difilter.
2. **Ringkasan**: kartu angka berwarna dan 7–8 grafik Excel asli berwarna tegas. Diagram lingkaran menampilkan nama, jumlah, dan persentase langsung pada irisan. Tiap grafik diberi satu kalimat "cara membaca".
3. **Data Analisis**: tabel angka dan persentase di balik tiap grafik, dengan rumus yang membaca sheet 1. Bila data di Excel diedit, tabel dan grafik ikut berubah.

Tombol **Cetak** mencetak data bulan yang dipilih saja (tanpa menu dan formulir).

### Kelola akun (Administrator)

Daftar semua akun dibaca langsung dari database, dengan filter per peran. Buat akun Administrator, Petugas UKS, atau Siswa; ubah (termasuk reset kata sandi, yang otomatis mengeluarkan akun itu dari semua perangkat); hapus. Akun yang sedang dipakai tidak bisa menghapus dirinya sendiri.

## 7. Memasang di server sungguhan (produksi)

Contoh di bawah untuk **server Linux (Ubuntu/Debian)**. Pada hosting lain (VPS, Docker, panel Node.js) prinsipnya sama: Node.js 18+, MySQL, `.env` produksi, proses yang dijaga tetap hidup, dan HTTPS di depannya.

### 7.1. Daftar periksa sebelum dibuka ke internet

- [ ] `NODE_ENV=production` di `.env`.
- [ ] `DB_USER` bukan `root`, dan `DB_PASSWORD` diisi kata sandi kuat.
- [ ] Port MySQL (3306) **tidak** terbuka ke internet.
- [ ] Administrator dibuat dengan `npm run buat-admin`; tidak ada akun yang memakai kata sandi awal.
- [ ] Situs diakses lewat **HTTPS**.
- [ ] `TRUST_PROXY=1` bila memakai Nginx/Caddy/Cloudflare.
- [ ] Cadangan database dan folder foto sudah dijadwalkan (7.5).

### 7.2. Pasang kebutuhan dan kode

```bash
# Node.js 20 LTS (contoh via NodeSource), MySQL, dan Nginx
sudo apt update && sudo apt install -y mysql-server nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs

# Kode (mis. di /var/www/uks-pmr-wira)
cd /var/www/uks-pmr-wira
npm ci --omit=dev
cp .env.example .env && nano .env      # isi sesuai bagian 4, NODE_ENV=production
```

Buat pengguna database (SQL di bagian 4), impor skema, lalu buat Administrator:

```bash
sudo mysql < database/schema.sql
npm run buat-admin
```

### 7.3. Menjalankan terus-menerus dengan PM2

```bash
sudo npm install -g pm2
pm2 start src/server.js --name uks-pmr-wira
pm2 save
pm2 startup            # jalankan perintah yang ditampilkan agar otomatis hidup saat server reboot
pm2 logs uks-pmr-wira  # melihat log
```

Server berhenti dengan rapi pada sinyal `SIGTERM`/`SIGINT`, jadi `pm2 restart` aman.

### 7.4. Nginx sebagai pintu depan + HTTPS

`/etc/nginx/sites-available/uks-pmr-wira`:

```nginx
server {
    listen 80;
    server_name uks.contoh.sch.id;

    client_max_body_size 15m;            # foto kegiatan dikirim sampai ~14 MB; jangan lebih kecil

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;                         # PENTING, lihat catatan di bawah
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/uks-pmr-wira /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d uks.contoh.sch.id    # memasang HTTPS gratis dan memperbaruinya otomatis
```

Lalu isi `TRUST_PROXY=1` di `.env` dan `pm2 restart uks-pmr-wira`.

> **Catatan penting tentang header `Host`.** Server menolak permintaan pengubah data yang asalnya (`Origin`) tidak sama dengan alamat situs, sebagai pengaman CSRF. Bila Nginx tidak meneruskan `Host` yang benar, **semua** simpan/hapus/login dijawab `403 Permintaan ditolak karena berasal dari situs yang tidak dikenal`. Pastikan `proxy_set_header Host $host;` ada dan `TRUST_PROXY=1` terisi, atau daftarkan alamat situs di `ALLOWED_ORIGINS=https://uks.contoh.sch.id`.
>
> Tanpa `TRUST_PROXY`, pembatas percobaan login menganggap semua pengunjung sebagai satu IP milik Nginx, dan status HTTPS tidak terbaca.

Tutup port 3000 dari luar dan hanya buka 80/443:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

### 7.5. Cadangan dan pemulihan

Yang dicadangkan ada dua: **database** dan **folder foto** (`public/uploads/konten/`, atau `UPLOAD_ROOT/uploads/konten/` bila diatur).

```bash
# Cadangan harian (contoh untuk cron: crontab -e)
mysqldump -u uks_app -p'KATA-SANDI' uks_pmr_wira | gzip > /backup/uks-$(date +%F).sql.gz
tar czf /backup/uploads-$(date +%F).tar.gz -C /var/www/uks-pmr-wira/public uploads

# Pemulihan
gunzip < /backup/uks-2026-11-01.sql.gz | mysql -u uks_app -p uks_pmr_wira
tar xzf /backup/uploads-2026-11-01.tar.gz -C /var/www/uks-pmr-wira/public
```

Salin cadangan ke tempat lain (bukan hanya di server yang sama). Data kesehatan siswa sensitif: lindungi cadangan seperti data aslinya.

### 7.6. Memperbarui ke versi baru

```bash
cd /var/www/uks-pmr-wira
# cadangkan dulu (7.5), lalu:
git pull                      # atau salin kode baru
npm ci --omit=dev
pm2 restart uks-pmr-wira      # struktur database diperbarui otomatis saat server menyala
pm2 logs uks-pmr-wira --lines 30
```

### 7.7. Memantau

- `GET /api/health` menjawab `200` bila server dan database sehat (cocok untuk UptimeRobot atau pemantau lain).
- Log: `pm2 logs`. Kesalahan tak terduga dicatat di sana, sedangkan pengguna hanya melihat pesan umum (rincian teknis tidak dibocorkan).

## 8. Keamanan

**Yang sudah ada di kode**

| Area | Perlindungan |
| --- | --- |
| Kata sandi | Di-hash dengan **scrypt** + garam acak; perbandingan waktu-konstan. Tidak pernah dikirim balik ke browser. |
| Sesi | Token acak 256-bit; yang disimpan di database hanya **hash**-nya. Cookie `HttpOnly`, `SameSite=Lax`, `Secure` di produksi. Ganti/hapus akun mengeluarkannya dari semua perangkat. |
| Tebak sandi | Kunci per akun (5 kali salah, 5 menit) + pembatas per IP + pesan galat yang sama untuk "akun tidak ada" dan "sandi salah". |
| Akses data | Hak akses per peran dicek di server pada setiap permintaan. |
| SQL injection | Semua query memakai parameter (`?`); tidak ada penyambungan masukan ke SQL. |
| XSS | Semua data yang ditampilkan dilolos (escape) atau dimasukkan lewat `textContent`. **Content-Security-Policy** ketat: skrip hanya dari situs sendiri, tanpa skrip inline, tanpa plugin, tanpa iframe. |
| CSRF | Cookie `SameSite=Lax`, ditambah penolakan permintaan pengubah data dengan `Origin` dari situs lain. API tidak mengaktifkan CORS. |
| Header | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-*`, dan HSTS (produksi lewat HTTPS). |
| Upload foto | Hanya admin. Jenis ditentukan dari **isi file** (JPG/PNG/WEBP), bukan nama atau klaim browser; **SVG, GIF, dan HTML yang menyamar ditolak**. Maks. 6 MB per gambar. Nama file dibuat server (acak). File hanya bisa dihapus bila berada di `uploads/konten/`. |
| Bodi permintaan | Maks. 100 KB, kecuali route konten (14 MB) yang baru membaca bodi **setelah** terbukti Administrator. |
| Akun bawaan | Tidak dibuat di produksi; server produksi menolak jalan bila kata sandi awal masih dipakai. |
| Berkas rahasia | Hanya folder `public/` yang disajikan; `.env`, `src/`, dan `database/` tidak bisa diunduh. |

**Catatan dan risiko yang perlu Anda ketahui**

1. **Pendaftaran mandiri siswa tidak memverifikasi NIS.** Siapa pun bisa mendaftar dengan NIS siswa lain lalu melihat hasil tekanan darah NIS itu bila sudah tercatat. Untuk data sensitif ada tiga pilihan: (a) hanya Administrator yang membuat akun siswa (di Kelola akun) dan pendaftaran mandiri tidak diumumkan; (b) menambahkan daftar induk siswa (NIS + nama) dan mencocokkannya saat daftar; (c) menambahkan persetujuan Administrator. Ini keputusan kebijakan sekolah, bukan bug, sehingga belum diubah.
2. **Pembatas permintaan tersimpan di memori satu proses.** Cukup untuk satu server. Bila dijalankan di beberapa instance, pindahkan ke Redis.
3. **Foto tidak dipindai antivirus.** Isi file diverifikasi sebagai gambar dan disajikan dengan `nosniff` sehingga tidak bisa dieksekusi, tetapi gambar yang rusak bisa tetap tersimpan.
4. **Jalankan `npm audit`** berkala di server yang punya internet untuk memeriksa kerentanan paket, lalu `npm update` bila ada pembaruan keamanan. (Pemeriksaan ini tidak bisa dilakukan di lingkungan pengembangan kode ini karena tidak ada akses internet.)
5. Data kesehatan siswa sensitif: batasi siapa yang diberi akun Administrator dan Petugas UKS, dan ganti kata sandi bila ada anggota yang keluar dari kepengurusan.

## 9. Pengujian

```bash
npm test          # unit (19) + API end-to-end (36): tanpa MySQL, tanpa browser
npm run test:ui   # tampilan di browser sungguhan (29 skenario)
```

**`npm test`** menjalankan:

- `test/run.js`: uji unit (penulis Excel, klasifikasi tekanan darah, validator, dll.).
- `test/api-qa.js`: menjalankan **kode asli** (`src/app.js` lengkap dengan semua route, middleware, controller, dan validator) lewat HTTP sungguhan. Mencakup pesan validasi setiap kolom wajib, hak akses setiap peran, login/daftar/keluar, CRUD semua modul, upload gambar termasuk serangan (SVG, HTML yang menyamar, file terlalu besar), header keamanan, CSRF, dan pembatas permintaan.
- `test/harness/` menyediakan **Express tiruan** dan **database di memori** (`fake-express.js`, `memory-models.js`), sehingga uji berjalan di komputer mana pun tanpa memasang MySQL.

**`npm run test:ui`** membutuhkan Playwright:

```bash
npm i -D playwright
npx playwright install chromium
npm run test:ui                       # tambahkan SHOTS=./tangkapan untuk menyimpan tangkapan layar
```

Skenarionya: login dengan kolom kosong, form konten kosong, editor crop dan siluet (geser, ubah ukuran, keyboard, slider, tombol siluet), kartu di beranda, jendela detail, tampilan ponsel (390 px), uji luapan halaman dengan data sangat panjang, XSS di semua modul, serta memastikan **tidak ada galat JavaScript atau pelanggaran CSP**.

**Yang belum bisa diuji di lingkungan pengembangan kode ini** (tidak ada akses internet dan MySQL), jadi mohon dicoba sekali oleh developer:

- Menjalankan dengan **Express dan MySQL asli** (`npm install`, `npm start`). Kode asli diuji dengan pengganti keduanya; pernyataan SQL lama tidak diubah, sedangkan yang baru (`ensureSchema`: `INFORMATION_SCHEMA` + `ALTER TABLE`) standar tetapi belum dijalankan di MySQL asli.
- Membuka file Excel hasil unduhan di **Microsoft Excel** (diuji lewat LibreOffice dan pembaca `openpyxl`).
- Tampilan di perangkat sungguhan (diuji di Chromium dengan emulasi ponsel).

## 10. Struktur folder

```
database/schema.sql          semua tabel (satu file)
docs/LAPORAN-QA.md           hasil pemeriksaan kualitas dan daftar perbaikan
public/                      tampilan (disajikan langsung oleh Express)
  *.html                     halaman
  css/                       style.css, login.css, fitur.css, editor.css, tensi.css, ...
  js/                        api.js (semua panggilan ke server), login.js, landing.js,
                             konten.js, image-editor.js (crop + siluet), crud-page.js, ...
  uploads/konten/            foto kegiatan dan lomba (dibuat otomatis, tidak masuk Git)
src/
  server.js                  titik masuk: cek database, migrasi ringan, jalankan server
  app.js                     susunan Express (header keamanan, batas permintaan, route)
  config/db.js               koneksi MySQL
  routes/                    peta alamat API + penjagaan hak akses
  middlewares/               auth.js (sesi), security.js (CSP, CSRF, batas), validator
  controllers/               logika tiap fitur
  models/                    query SQL
  services/exportService.js  penyusun laporan Excel (3 sheet)
  scripts/                   seedAccounts.js, createAdmin.js, ensureSchema.js
  utils/                     imageStore.js, password.js, xlsx.js (penulis .xlsx), dll.
test/
  run.js, api-qa.js, ui-qa.js
  harness/                   Express tiruan dan database memori untuk pengujian
.env.example                 contoh pengaturan (salin menjadi .env)
```

## 11. API ringkas

Semua berawalan `/api`. Jawaban selalu berbentuk `{ success, message?, data?, errors? }`. Galat validasi memakai status `400` dengan daftar pesan di `errors`.

| Alamat | Siapa |
| --- | --- |
| `GET /health` | umum |
| `POST /auth/login`, `/auth/register`, `/auth/logout`, `GET /auth/me` | umum / sesi |
| `GET /konten?jenis=kegiatan\|lomba` | umum |
| `POST /konten`, `PUT /konten/:id`, `DELETE /konten/:id` | Administrator |
| `/patients`, `/blood-pressure`, `/obat-keluar`, `/peminjaman` (+ `POST /peminjaman/:id/kembali`) | Petugas UKS, Administrator |
| `GET /export/:jenis?bulan=2026-10` atau `?semua=1` (`pasien`, `obat-keluar`, `peminjaman`, `tekanan-darah`) | Petugas UKS, Administrator |
| `/accounts/overview`, `/accounts/staff`, `/accounts/students` | Administrator |
| `GET /me/blood-pressure` | Siswa |

**Isi permintaan konten** (`POST` dan `PUT /konten`), JSON:

| Kolom | Keterangan |
| --- | --- |
| `jenis` | `kegiatan` atau `lomba` |
| `judul` | wajib, maks. 150 karakter |
| `deskripsi` | wajib, maks. 3000 karakter |
| `tanggal` | opsional, `YYYY-MM-DD` |
| `juara` | opsional, hanya dipakai bila `jenis` = `lomba` |
| `gambar` | **foto asli** sebagai data URL (`data:image/jpeg;base64,...`). Wajib saat membuat. Saat mengubah: kosongkan bila foto tidak diganti. |
| `gambar_preview` | **pratinjau** hasil crop/siluet sebagai data URL. Opsional; bila kosong, beranda memakai foto asli. Saat mengubah boleh dikirim sendiri tanpa `gambar` (memotong ulang foto yang sudah tersimpan). |

Jawaban memuat alamat file `gambar` dan `gambar_preview` (mis. `uploads/konten/1730000000000-ab12cd34.jpg`).

## 12. Mengubah isi tanpa membuka database

| Yang ingin diubah | Di mana |
| --- | --- |
| Alamat, email, telepon, jam layanan, tautan sosial media | `public/js/site-data.js` |
| Kegiatan dan lomba di beranda | Halaman **Konten** (Administrator) |
| Gambar kartu login | Ganti file di `public/img/cards/` (`card-administrator.svg`, `card-petugas.svg`, `card-siswa.svg`, `card-back.svg`) |
| Warna latar login | `--auth-bg` di `public/css/login.css` |
| Warna form login per peran | `public/css/login.css`, bagian "Form di punggung kartu" |
| Warna siluet pratinjau | konstanta `INK` di `public/js/image-editor.js` |

## 13. Pemecahan masalah

| Gejala | Penyebab dan solusi |
| --- | --- |
| `[GAGAL] Tidak bisa terhubung ke database` | MySQL belum menyala, atau `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` di `.env` salah. Tes dengan `mysql -u USER -p -h HOST`. |
| `[GAGAL] Struktur database belum sesuai` | Database belum diimpor atau terlalu lama. Impor `database/schema.sql` (bagian 3). |
| `ER_ACCESS_DENIED_ERROR` | Kata sandi atau hak pengguna MySQL salah. |
| `Cannot find module 'express'` | Lupa `npm install`. |
| `EADDRINUSE: address already in use :::3000` | Port 3000 dipakai program lain. Ganti `PORT` di `.env`. |
| Halaman terbuka tetapi data tidak muncul / login tidak jalan | Halaman dibuka lewat `file://` atau server lain. Buka lewat alamat Express (`http://localhost:3000`). |
| Semua simpan/login dijawab `403 ... situs yang tidak dikenal` | Di belakang proxy: atur `proxy_set_header Host $host;`, `TRUST_PROXY=1`, atau `ALLOWED_ORIGINS` (bagian 7.4). |
| `413 Data yang dikirim terlalu besar` saat unggah foto | `client_max_body_size` Nginx terlalu kecil (butuh ≥ 15m). |
| Server produksi langsung berhenti: "menolak berjalan selama kata sandi awal masih dipakai" | Ganti kata sandi akun bawaan lewat Kelola akun, atau hapus akunnya. |
| Tidak bisa login | Pilih kartu yang sesuai peran akun. Setelah 5 kali salah, akun dikunci sementara (5 menit). |
| `429 Terlalu banyak ...` | Batas permintaan per IP terlampaui. Tunggu, atau naikkan `LOGIN_RATE_MAX`/`API_RATE_MAX` bila sekolah berbagi satu IP. |
| Foto gagal diunggah | Gunakan JPG, PNG, atau WEBP. SVG dan GIF ditolak demi keamanan. |
| Foto kegiatan hilang setelah pindah server | Folder `public/uploads/konten/` (atau `UPLOAD_ROOT`) belum ikut disalin dari cadangan. |
| Perubahan CSS/JS tidak terlihat | Muat ulang paksa dengan `Ctrl + Shift + R`. |
| Animasi login patah-patah di perangkat lama | Gambar kartu disiapkan di latar belakang setelah halaman dimuat; tunggu 1–2 detik sebelum membuka login. |
