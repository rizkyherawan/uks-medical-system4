// ============================================================
// DATA SITUS
// Edit file ini untuk mengubah profil, kontak, dan media sosial di footer.
//
// Kegiatan PMR dan Lomba TIDAK diisi di sini lagi. Administrator mengisinya
// lewat halaman "Kelola konten" (gambar + deskripsi), lalu langsung tampil
// di beranda tanpa menyentuh kode.
// ============================================================

const SITE_INFO = {
  nama: 'UKS PMR Wira SMKN 1 Gombong',
  judul: 'UKS PMR WIRA SMK Negeri 1 Gombong',

  deskripsi:
    'PMR Wira SMKN 1 Gombong adalah wadah pembinaan Palang Merah Remaja di sekolah. Anggotanya terlibat dalam kegiatan kepalangmerahan dan pelayanan kesehatan melalui Unit Kesehatan Sekolah (UKS).',

  alamat: 'Jl. Wilis No.15, Klapasawit, Wero, Kecamatan Gombong, Kabupaten Kebumen, Jawa Tengah 54416.',
  email: 'pmrwirastemsago18@gmail.com',

  // Nomor ditulis seperti biasa; tautan WhatsApp dibuat otomatis dari nomor ini.
  telepon: [
    { nama: 'Bu Ika Febriana', nomor: '+62 812-2865-0082' },
    { nama: 'Bu Mei Rosita Sari', nomor: '+62 852-1989-7975' },
    { nama: 'Pak Agus', nomor: '+62 878-3751-7121' },
    { nama: 'Bu Juminah', nomor: '+62 856-8708-763' }
  ],

  jamLayanan: '07.00–15.00',

  // Hanya tiga akun media sosial yang dipakai.
  sosial: [
    { nama: 'Instagram', ikon: 'instagram', url: 'https://www.instagram.com/pmrwirastemsago_?vrfl=aDd1b2NoOTd5MHN5' },
    { nama: 'YouTube', ikon: 'youtube', url: 'https://youtube.com/@pmrwirastemsago?si=vV2GtA_EUBsbv7Xh' },
    { nama: 'TikTok', ikon: 'tiktok', url: 'https://www.tiktok.com/@pmrwirastemsago?_r=1&_t=ZS-9Aj1HD2fOi6' }
  ]
};
