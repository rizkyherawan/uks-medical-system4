// Halaman Peminjaman barang: konfigurasi untuk CrudPage (crud-page.js)
(() => {
  'use strict';
  const { esc, formatDate, todayIso } = CrudPage;

  const BARANG = [
    'Tandu', 'Tensimeter', 'Stetoskop', 'Termometer', 'Kotak P3K', 'Matras',
    'Selimut', 'Kursi roda', 'Bidai', 'Perban dan kasa'
  ];

  const topBarang = (rows) => {
    const map = new Map();
    rows.forEach((r) => {
      const k = r.jenis_barang.trim().toLowerCase();
      const cur = map.get(k) || { label: r.jenis_barang.trim(), total: 0 };
      cur.total += 1;
      map.set(k, cur);
    });
    return [...map.values()].sort((a, b) => b.total - a.total)[0];
  };

  CrudPage.init({
    api: PinjamAPI,
    dateKey: 'tanggal_pinjam',
    exportKey: 'peminjaman',
    exportLabel: 'peminjaman barang',
    crumb: 'Peminjaman',
    badge: 'Layanan UKS',
    title: 'Peminjaman Barang',
    lead: 'Catat barang UKS yang dipinjam siswa atau organisasi lain: tanggal pinjam, nama, kelas, jenis barang, tanggal kembali, dan keterangan. Barang yang belum kembali ditandai otomatis.',
    listTitle: 'Riwayat peminjaman',
    formTitle: 'Catat peminjaman',
    editTitle: 'Ubah catatan peminjaman',
    searchPlaceholder: 'Cari nama, kelas, barang',
    searchKeys: ['nama', 'kelas', 'jenis_barang', 'keterangan', 'tanggal_pinjam'],
    emptyIcon: 'box',
    emptyTitle: 'Belum ada catatan peminjaman',
    emptyText: 'Catatan yang Anda simpan akan muncul di sini. Isi formulir di samping untuk mencatat peminjaman pertama.',
    filter: { key: 'jenis_barang', label: 'Semua barang' },

    stats: [
      { label: 'Total peminjaman', icon: 'clipboard', value: (rows) => rows.length, empty: '0' },
      { label: 'Masih dipinjam', icon: 'clock', value: (rows) => rows.filter((r) => !r.tanggal_kembali).length, empty: '0' },
      {
        label: 'Barang paling sering dipinjam',
        icon: 'box',
        value: (rows) => {
          const top = topBarang(rows);
          return top ? top.label : '-';
        }
      }
    ],

    fields: [
      { name: 'tanggal_pinjam', label: 'Tanggal peminjaman', type: 'date', required: true, defaultValue: todayIso },
      { name: 'nama', label: 'Nama peminjam', type: 'text', required: true, max: 100, placeholder: 'Nama siswa atau penanggung jawab' },
      { name: 'kelas', label: 'Kelas / organisasi', type: 'text', required: true, max: 60, placeholder: 'Contoh: XII TKJ A atau OSIS' },
      { name: 'jenis_barang', label: 'Jenis barang', type: 'choice', required: true, max: 100, options: BARANG, placeholder: 'Pilih barang' },
      { name: 'tanggal_kembali', label: 'Tanggal kembali', type: 'date', hint: 'Kosongkan jika barang belum dikembalikan.' },
      { name: 'keterangan', label: 'Keterangan', type: 'textarea', max: 255, placeholder: 'Contoh: dipakai untuk lomba PMR' }
    ],

    crossValidate: (d) =>
      d.tanggal_kembali && d.tanggal_pinjam && d.tanggal_kembali < d.tanggal_pinjam
        ? { tanggal_kembali: 'Tanggal kembali tidak boleh sebelum tanggal peminjaman.' }
        : {},

    columns: [
      { label: 'Tanggal pinjam', cls: 'date', render: (r) => esc(formatDate(r.tanggal_pinjam)) },
      {
        label: 'Peminjam',
        render: (r) => `<p class="patient-name">${esc(r.nama)}</p><p class="patient-nisn">${esc(r.kelas)}</p>`
      },
      { label: 'Barang', render: (r) => esc(r.jenis_barang) },
      {
        label: 'Status',
        render: (r) =>
          r.tanggal_kembali
            ? `<span class="state-badge is-back">Kembali ${esc(formatDate(r.tanggal_kembali))}</span>`
            : '<span class="state-badge is-out">Masih dipinjam</span>'
      },
      { label: 'Keterangan', cls: 'complaint', render: (r) => esc(r.keterangan || '-') }
    ],
    rowTitle: (r) => `${r.nama} (${r.jenis_barang})`,

    rowActions: [
      {
        action: 'return',
        label: 'Tandai sudah kembali',
        icon: 'undo',
        show: (r) => !r.tanggal_kembali,
        handler: async (r) => {
          await PinjamAPI.markReturned(r.id);
          Auth.toast('Barang ditandai sudah kembali.');
        }
      }
    ]
  });
})();
