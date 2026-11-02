// ============================================================
// KEAMANAN LAPISAN HTTP
//
//  securityHeaders : header pengaman pada semua jawaban (CSP, nosniff, anti-iframe, dst).
//  sameOriginGuard : menolak permintaan yang MENGUBAH data bila berasal dari situs lain (CSRF).
//  rateLimit       : membatasi jumlah permintaan per alamat IP (anti tebak-sandi dan banjir).
//
// Semuanya fungsi biasa (req, res, next) tanpa library tambahan.
// ============================================================

// Kebijakan konten: hanya skrip dari situs sendiri, tanpa skrip inline, tanpa plugin, tanpa iframe.
// img-src mengizinkan data: dan blob: karena editor gambar dan kartu login memakainya.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  // HSTS hanya bila memang diakses lewat HTTPS (langsung atau lewat proxy)
  const https = req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  if (https && process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Browser SELALU menyertakan header Origin pada permintaan lintas situs yang mengubah data.
// Bila Origin ada tetapi bukan situs ini, tolak. Permintaan tanpa Origin (curl, uji otomatis)
// tidak membawa cookie sesi dari browser, jadi tidak berbahaya dan tetap diizinkan.
function sameOriginGuard(req, res, next) {
  if (!UNSAFE_METHODS.has(req.method)) return next();

  const origin = req.headers.origin;
  if (!origin) return next();

  // Alamat yang dianggap "situs sendiri": header Host; bila server berada di belakang proxy
  // tepercaya (TRUST_PROXY) juga X-Forwarded-Host; plus daftar tambahan ALLOWED_ORIGINS di .env.
  const hosts = [req.headers.host];
  const trustsProxy = req.app && typeof req.app.get === 'function' && req.app.get('trust proxy');
  if (trustsProxy && req.headers['x-forwarded-host']) {
    String(req.headers['x-forwarded-host']).split(',').forEach((h) => hosts.push(h.trim()));
  }
  const extra = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  let allowed = false;
  try {
    allowed = hosts.includes(new URL(origin).host) || extra.includes(origin.replace(/\/+$/, ''));
  } catch (err) {
    allowed = false;
  }
  if (allowed) return next();

  return res.status(403).json({
    success: false,
    message: 'Permintaan ditolak karena berasal dari situs yang tidak dikenal. (Bila ini situs resmi di belakang proxy, atur header Host / TRUST_PROXY / ALLOWED_ORIGINS; lihat README.)'
  });
}

// Pembatas jumlah permintaan: maksimal `max` permintaan per `windowMs` untuk setiap IP.
// Disimpan di memori server (cukup untuk satu server; ganti ke Redis bila nanti memakai banyak server).
function rateLimit({ windowMs, max, message, keyPrefix = 'umum' }) {
  const hits = new Map();
  let lastSweep = Date.now();

  return function limiter(req, res, next) {
    const now = Date.now();
    if (now - lastSweep > windowMs) {
      for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
      lastSweep = now;
    }

    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'tidak-diketahui';
    const key = `${keyPrefix}|${ip}`;
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - entry.count)));

    if (entry.count > max) {
      const wait = Math.max(1, Math.ceil((entry.reset - now) / 1000));
      res.setHeader('Retry-After', String(wait));
      return res.status(429).json({ success: false, message: message || `Terlalu banyak permintaan. Coba lagi dalam ${wait} detik.` });
    }
    next();
  };
}

module.exports = { securityHeaders, sameOriginGuard, rateLimit, CSP };
