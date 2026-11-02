// ============================================================
// Pembersihan teks dan tanggal yang dipakai semua validator.
// ============================================================

// Memangkas dan merapikan spasi ganda
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

// "xii tkj  a" -> "XII TKJ A" (supaya statistik per kelas tidak terpecah)
const normalizeKelas = (value) => clean(value).toUpperCase();

// "pusing sejak pagi" -> "Pusing sejak pagi"
const sentenceCase = (value) => {
  const text = clean(value);
  return text ? text[0].toUpperCase() + text.slice(1) : text;
};

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Memastikan "YYYY-MM-DD" adalah tanggal yang benar-benar ada (menolak 2026-02-31)
function isValidDate(value) {
  const match = DATE_PATTERN.exec(String(value || ''));
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (y < 2000 || y > 2100) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

module.exports = { clean, normalizeKelas, sentenceCase, isValidDate };
