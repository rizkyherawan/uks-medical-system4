-- =====================================================
-- Skema database: Sistem Rekam Medis UKS PMR WIRA SMK Negeri 1 Gombong (versi beta)
-- SATU file berisi semua tabel. Impor sekali lewat phpMyAdmin (tab Import)
-- atau terminal:  mysql -u root -p < database/schema.sql
--
-- Pernah mengimpor skema versi sebelumnya (NISN 10 digit)? Hapus dulu database
-- `uks_pmr_wira` di phpMyAdmin, lalu impor file ini. Struktur tabel berubah
-- (NISN menjadi NIS 5 digit, ada username, ada tabel baru), jadi tidak bisa ditimpa.
-- =====================================================

CREATE DATABASE IF NOT EXISTS uks_pmr_wira
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE uks_pmr_wira;

-- -----------------------------------------------------
-- AKUN
-- -----------------------------------------------------

-- Administrator dan Petugas UKS. Login memakai username (email boleh diisi, opsional).
CREATE TABLE IF NOT EXISTS staff_accounts (
  id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nama           VARCHAR(100)  NOT NULL,
  username       VARCHAR(50)   NOT NULL,
  email          VARCHAR(150)  NULL,
  password_hash  VARCHAR(255)  NOT NULL,
  role           ENUM('administrator', 'petugas') NOT NULL,
  last_login     DATETIME      NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_staff_username (username),
  UNIQUE KEY uq_staff_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Akun Siswa (anggota PMR). NIS (5 digit) adalah PRIMARY KEY: satu NIS hanya bisa punya satu akun.
-- Login memakai username ATAU email, mana yang dipilih saat akun dibuat.
-- Data tekanan darah dihubungkan ke siswa lewat NIS yang sama (tanpa FOREIGN KEY,
-- karena petugas boleh mencatat tekanan darah sebelum akun siswa dibuat).
CREATE TABLE IF NOT EXISTS students (
  nis            CHAR(5)       NOT NULL,
  nama           VARCHAR(100)  NOT NULL,
  username       VARCHAR(50)   NULL,
  email          VARCHAR(150)  NULL,
  password_hash  VARCHAR(255)  NOT NULL,
  last_login     DATETIME      NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (nis),
  UNIQUE KEY uq_students_username (username),
  UNIQUE KEY uq_students_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sesi login. Yang disimpan adalah HASH token (SHA-256), bukan token aslinya.
-- account_id berisi id akun staf, atau NIS untuk akun siswa.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash     CHAR(64)      NOT NULL,
  account_type   ENUM('staff', 'student') NOT NULL,
  account_id     VARCHAR(20)   NOT NULL,
  expires_at     DATETIME      NOT NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  INDEX idx_sessions_expires (expires_at),
  INDEX idx_sessions_account (account_type, account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- DATA UKS (diisi Petugas UKS dan Administrator)
-- -----------------------------------------------------

-- Pasien sakit. Satu baris = satu kunjungan. NIS TIDAK dibuat UNIQUE karena satu siswa bisa sakit berkali-kali.
CREATE TABLE IF NOT EXISTS patients (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nama_pasien    VARCHAR(100) NOT NULL,
  nis            CHAR(5)      NOT NULL,
  kelas          VARCHAR(30)  NOT NULL,
  tanggal_sakit  DATE         NOT NULL,
  keluhan        VARCHAR(500) NOT NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_patients_nis (nis),
  INDEX idx_patients_kelas (kelas),
  INDEX idx_patients_tanggal (tanggal_sakit)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pemeriksaan tekanan darah. Tiap siswa diukur 3 kali (pengukuran_ke 1 sampai 3).
-- Kolom "kategori" diisi oleh server (hasil klasifikasi), bukan dari input pengguna.
CREATE TABLE IF NOT EXISTS blood_pressure_readings (
  id             INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  nama_siswa     VARCHAR(100)      NOT NULL,
  nis            CHAR(5)           NOT NULL,
  kelas          VARCHAR(30)       NOT NULL,
  pengukuran_ke  TINYINT UNSIGNED  NOT NULL,
  sistolik       SMALLINT UNSIGNED NOT NULL,
  diastolik      SMALLINT UNSIGNED NOT NULL,
  kategori       VARCHAR(30)       NOT NULL,
  created_at     TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_bp_nis (nis),
  INDEX idx_bp_kelas (kelas),
  INDEX idx_bp_kategori (kategori),
  INDEX idx_bp_created_at (created_at),
  CONSTRAINT chk_bp_pengukuran_ke CHECK (pengukuran_ke BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Obat keluar: obat UKS yang diberikan kepada siswa.
CREATE TABLE IF NOT EXISTS obat_keluar (
  id             INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  tanggal        DATE              NOT NULL,
  nama           VARCHAR(100)      NOT NULL,
  kelas          VARCHAR(30)       NOT NULL,
  obat           VARCHAR(100)      NOT NULL,
  jumlah         SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  keterangan     VARCHAR(255)      NULL,
  created_at     TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_obat_tanggal (tanggal),
  INDEX idx_obat_nama_obat (obat)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Peminjaman barang UKS oleh siswa atau organisasi lain.
-- tanggal_kembali kosong (NULL) = barang masih dipinjam.
CREATE TABLE IF NOT EXISTS peminjaman_barang (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tanggal_pinjam  DATE         NOT NULL,
  nama            VARCHAR(100) NOT NULL,
  kelas           VARCHAR(60)  NOT NULL,
  jenis_barang    VARCHAR(100) NOT NULL,
  tanggal_kembali DATE         NULL,
  keterangan      VARCHAR(255) NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_pinjam_tanggal (tanggal_pinjam),
  INDEX idx_pinjam_barang (jenis_barang)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- KONTEN BERANDA (diisi Administrator lewat halaman Kelola konten)
-- jenis 'kegiatan' = Kegiatan PMR Wira, 'lomba' = Prestasi dan lomba.
-- gambar = foto asli (tampil penuh saat kartu diklik); gambar_preview = hasil crop/siluet
-- untuk kartu di beranda. Keduanya berisi alamat file di folder public/uploads/konten/.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS konten_situs (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  jenis          ENUM('kegiatan', 'lomba') NOT NULL,
  judul          VARCHAR(150) NOT NULL,
  tanggal        DATE         NULL,
  deskripsi      TEXT         NOT NULL,
  juara          VARCHAR(100) NULL,
  gambar         VARCHAR(255) NULL,
  gambar_preview VARCHAR(255) NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_konten_jenis (jenis, tanggal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
