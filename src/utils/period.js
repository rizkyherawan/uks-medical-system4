// ============================================================
// Periode laporan untuk unduhan Excel.
//   ?bulan=2026-10  -> 1 Oktober sampai 31 Oktober 2026
//   ?semua=1        -> seluruh data
//   (kosong)        -> bulan berjalan
// Mengembalikan { from, to, label } dengan from/to berformat YYYY-MM-DD (atau null untuk semua).
// ============================================================
const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const pad = (n) => String(n).padStart(2, '0');

function resolvePeriod(query = {}, now = new Date()) {
  if (String(query.semua || '') === '1') {
    return { from: null, to: null, label: 'Seluruh data', slug: 'semua-data', monthName: null, year: null, filePart: 'Seluruh Periode' };
  }

  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  const match = /^(\d{4})-(\d{2})$/.exec(String(query.bulan || ''));
  if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12) {
    year = Number(match[1]);
    month = Number(match[2]);
  }

  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
    label: `${BULAN[month - 1]} ${year}`,
    slug: `${year}-${pad(month)}`,
    monthName: BULAN[month - 1],
    year,
    days: lastDay,
    // Bagian nama file: "Bulan November 2026"
    filePart: `Bulan ${BULAN[month - 1]} ${year}`
  };
}

// Bulan sebelumnya dari sebuah periode bulanan (null untuk "seluruh data")
function previousPeriod(period) {
  if (!period.from) return null;
  const [year, month] = period.from.split('-').map(Number);
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  return resolvePeriod({ bulan: `${prev.year}-${pad(prev.month)}` });
}

module.exports = { resolvePeriod, previousPeriod, BULAN };
