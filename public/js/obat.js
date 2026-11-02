// Halaman Obat keluar: konfigurasi untuk CrudPage (crud-page.js)
(() => {
  'use strict';
  const { esc, formatDate, todayIso } = CrudPage;

  const OBAT = [
    'Paracetamol', 'Antasida', 'Minyak kayu putih', 'Balsem', 'Betadine', 'Plester luka',
    'Oralit', 'Obat batuk', 'Obat flu', 'Vitamin', 'Tolak angin', 'Kasa steril'
  ];

  const topOf = (rows, keyFn, weightFn = () => 1) => {
    const map = new Map();
    rows.forEach((r) => {
      const key = String(keyFn(r)).trim();
      const k = key.toLowerCase();
      const cur = map.get(k) || { label: key, total: 0 };
      cur.total += weightFn(r);
      map.set(k, cur);
    });
    return [...map.values()].sort((a, b) => b.total - a.total)[0];
  };

  CrudPage.init({
    api: ObatAPI,
    dateKey: 'tanggal',
    exportKey: 'obat-keluar',
    exportLabel: 'obat keluar',
    crumb: 'Obat keluar',
    badge: 'Layanan UKS',
    title: 'Obat Keluar',
    lead: 'Catat obat UKS yang diberikan kepada siswa: tanggal, nama, kelas, obat, dan keterangan. Rekapnya bisa diunduh ke Excel beserta grafik obat yang paling sering keluar.',
    listTitle: 'Riwayat obat keluar',
    formTitle: 'Catat obat keluar',
    editTitle: 'Ubah catatan obat',
    searchPlaceholder: 'Cari nama, kelas, obat',
    searchKeys: ['nama', 'kelas', 'obat', 'keterangan', 'tanggal'],
    emptyIcon: 'pill',
    emptyTitle: 'Belum ada catatan obat keluar',
    emptyText: 'Catatan yang Anda simpan akan muncul di sini. Isi formulir di samping untuk mencatat obat keluar pertama.',
    filter: { key: 'kelas', label: 'Semua kelas' },

    stats: [
      { label: 'Total pencatatan', icon: 'clipboard', value: (rows) => rows.length, empty: '0' },
      {
        label: 'Obat keluar hari ini',
        icon: 'pill',
        value: (rows) => rows.filter((r) => r.tanggal === todayIso()).reduce((n, r) => n + Number(r.jumlah || 0), 0),
        empty: '0'
      },
      {
        label: 'Obat paling sering keluar',
        icon: 'chart',
        value: (rows) => {
          const top = topOf(rows, (r) => r.obat, (r) => Number(r.jumlah || 1));
          return top ? top.label : '-';
        }
      }
    ],

    fields: [
      { name: 'tanggal', label: 'Tanggal', type: 'date', required: true, defaultValue: todayIso },
      { name: 'nama', label: 'Nama', type: 'text', required: true, max: 100, placeholder: 'Nama siswa penerima obat' },
      { name: 'kelas', label: 'Kelas', type: 'text', required: true, max: 30, placeholder: 'Contoh: XII TKJ A' },
      { name: 'obat', label: 'Obat', type: 'choice', required: true, max: 100, options: OBAT, placeholder: 'Pilih obat' },
      { name: 'jumlah', label: 'Jumlah', type: 'number', required: true, min: 1, maxValue: 999, defaultValue: () => '1', placeholder: '1' },
      { name: 'keterangan', label: 'Keterangan', type: 'textarea', max: 255, placeholder: 'Contoh: diberikan untuk sakit kepala' }
    ],

    columns: [
      { label: 'Tanggal', cls: 'date', render: (r) => esc(formatDate(r.tanggal)) },
      {
        label: 'Nama',
        render: (r) => `<p class="patient-name">${esc(r.nama)}</p>`
      },
      { label: 'Kelas', render: (r) => `<span class="kelas-chip">${esc(r.kelas)}</span>` },
      { label: 'Obat', render: (r) => `${esc(r.obat)} <span class="qty-chip">&times;${esc(r.jumlah)}</span>` },
      { label: 'Keterangan', cls: 'complaint', render: (r) => esc(r.keterangan || '-') }
    ],
    rowTitle: (r) => r.nama
  });
})();
