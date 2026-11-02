// ============================================================
// PENYIMPAN GAMBAR KONTEN
// Browser mengirim gambar sebagai data URL (sudah dikecilkan di browser).
// Server memeriksa jenis file dari isi sebenarnya (bukan dari nama atau
// header yang dikirim), lalu menyimpannya di public/uploads/konten/.
// ============================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Lokasi induk folder "uploads". Bawaan: folder public/ proyek (disajikan langsung oleh Express).
// Bisa diganti lewat UPLOAD_ROOT di .env (mis. disk permanen di server), dibaca setiap kali dipakai.
const uploadRoot = () => (process.env.UPLOAD_ROOT ? path.resolve(process.env.UPLOAD_ROOT) : path.join(__dirname, '..', '..', 'public'));
const FOLDER = 'uploads/konten';
const MAX_BYTES = 6 * 1024 * 1024; // 6 MB setelah didekode

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/;

function detectType(buffer) {
  if (buffer.length > 12 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length > 12 && buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length > 12 && buffer.slice(0, 4).toString('latin1') === 'RIFF' && buffer.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

// Mengembalikan { ok: true, buffer, ext } atau { ok: false, message }
function decodeDataUrl(dataUrl) {
  const match = DATA_URL.exec(String(dataUrl || ''));
  if (!match) return { ok: false, message: 'Gambar harus berformat JPG, PNG, atau WEBP.' };

  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (buffer.length === 0) return { ok: false, message: 'File gambar kosong.' };
  if (buffer.length > MAX_BYTES) return { ok: false, message: 'Ukuran gambar maksimal 6 MB.' };

  const ext = detectType(buffer);
  if (!ext) return { ok: false, message: 'Isi file bukan gambar JPG, PNG, atau WEBP yang valid.' };
  return { ok: true, buffer, ext };
}

// Menyimpan gambar, mengembalikan alamat relatif (contoh: uploads/konten/1730000000-ab12cd34.jpg)
async function saveImage(dataUrl) {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded.ok) {
    const error = new Error(decoded.message);
    error.status = 400;
    throw error;
  }

  const folder = path.join(uploadRoot(), FOLDER);
  await fs.promises.mkdir(folder, { recursive: true });

  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${decoded.ext}`;
  await fs.promises.writeFile(path.join(folder, name), decoded.buffer);
  return `${FOLDER}/${name}`;
}

// Alamat gambar yang sah: persis "uploads/konten/<nama-file-aman>". Mencegah penghapusan file di luar folder.
const OWN_IMAGE = /^uploads\/konten\/[A-Za-z0-9._-]+\.(jpg|png|webp)$/;
const isOwnImage = (relativePath) => typeof relativePath === 'string' && OWN_IMAGE.test(relativePath) && !relativePath.includes('..');

// Menghapus file gambar lama. Hanya file di dalam folder konten yang boleh dihapus.
async function removeImage(relativePath) {
  if (!isOwnImage(relativePath)) return;
  try {
    await fs.promises.unlink(path.join(uploadRoot(), relativePath));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Gagal menghapus gambar:', err.message);
  }
}

module.exports = { saveImage, removeImage, decodeDataUrl, isOwnImage, uploadRoot, FOLDER, DATA_URL };
