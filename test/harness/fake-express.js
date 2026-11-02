// ============================================================
// EXPRESS TIRUAN (hanya untuk pengujian)
// Sandbox pengujian tidak selalu bisa memasang paket npm, jadi file ini menyediakan bagian
// Express yang dipakai proyek ini: app.use, Router (get/post/put/delete/route/use), express.json,
// express.static, penanganan error 4-argumen, req.params/query/body/ip, res.status/json/send.
// Dengan ini seluruh kode ASLI di src/ (routes, middlewares, controllers) bisa dijalankan lewat
// HTTP sungguhan tanpa MySQL. Untuk menjalankan website sungguhan tetap pakai Express asli.
// ============================================================
const fs = require('fs');
const path = require('path');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };

function toRegex(pattern, end) {
  const keys = [];
  const source = pattern
    .replace(/\/+$/, '')
    .replace(/:([A-Za-z_]+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    });
  return { regex: new RegExp(`^${source}${end ? '/?$' : '(?=/|$)'}`), keys };
}

function parseLimit(limit) {
  const m = /^(\d+(?:\.\d+)?)\s*(kb|mb)?$/i.exec(String(limit || '100kb'));
  const n = Number(m[1]);
  return Math.round(n * ((m[2] || 'b').toLowerCase() === 'mb' ? 1048576 : (m[2] || '').toLowerCase() === 'kb' ? 1024 : 1));
}

class Router {
  constructor() {
    this.stack = [];
  }

  use(...args) {
    const prefix = typeof args[0] === 'string' ? args.shift() : '';
    args.flat().forEach((fn) => this.stack.push({ type: 'use', prefix, ...toRegex(prefix, false), fn }));
    return this;
  }

  // router.get('/x', ...), router.post(...), dst.
  get(pattern, ...fns) {
    return this.route(pattern).get(...fns), this;
  }

  post(pattern, ...fns) {
    return this.route(pattern).post(...fns), this;
  }

  put(pattern, ...fns) {
    return this.route(pattern).put(...fns), this;
  }

  delete(pattern, ...fns) {
    return this.route(pattern).delete(...fns), this;
  }

  route(pattern) {
    const route = {};
    ['get', 'post', 'put', 'delete'].forEach((method) => {
      route[method] = (...fns) => {
        fns.flat().forEach((fn) => this.stack.push({ type: 'route', method: method.toUpperCase(), ...toRegex(pattern, true), fn }));
        return route;
      };
    });
    return route;
  }

  handle(req, res, done) {
    let index = 0;
    const baseUrl = req.baseUrl || '';
    const originalUrl = req.url;

    const next = (err) => {
      req.url = originalUrl;
      req.baseUrl = baseUrl;
      const layer = this.stack[index];
      index += 1;
      if (!layer) return done(err);

      const pathOnly = originalUrl.split('?')[0] || '/';
      try {
        if (layer.type === 'use') {
          const m = layer.regex.exec(pathOnly);
          if (!m) return next(err);
          const isErrorHandler = layer.fn.length === 4;
          if (err && !isErrorHandler) return next(err);
          if (!err && isErrorHandler) return next();
          const consumed = m[0];
          req.baseUrl = baseUrl + consumed;
          req.url = originalUrl.slice(consumed.length) || '/';
          if (!req.url.startsWith('/') && !req.url.startsWith('?')) req.url = `/${req.url}`;
          if (err) return layer.fn(err, req, res, next);
          if (layer.fn instanceof Router) return layer.fn.handle(req, res, next);
          return layer.fn(req, res, next);
        }
        if (err) return next(err);
        if (layer.method !== req.method) return next();
        const m = layer.regex.exec(pathOnly);
        if (!m) return next();
        req.params = {};
        layer.keys.forEach((key, i) => {
          req.params[key] = decodeURIComponent(m[i + 1]);
        });
        return layer.fn(req, res, next);
      } catch (error) {
        return next(error);
      }
    };
    next();
  }
}

function createApp() {
  const app = (req, res) => {
    decorate(req, res, app);
    app.router.handle(req, res, (err) => {
      if (err) {
        res.statusCode = 500;
        return res.end('Error tak tertangani: ' + (err && err.message));
      }
      res.statusCode = 404;
      res.end('Not found');
    });
  };
  app.router = new Router();
  app.settings = {};
  app.get = (key) => (key in app.settings ? app.settings[key] : undefined); // seperti Express: app.get("pengaturan")
  app.use = (...args) => {
    app.router.use(...args);
    return app;
  };
  app.disable = (key) => {
    app.settings[key] = false;
  };
  app.set = (key, value) => {
    app.settings[key] = value;
  };
  return app;
}

function decorate(req, res, app) {
  const url = new URL(req.url, 'http://localhost');
  req.app = app;
  req.originalUrl = req.url;
  req.query = Object.fromEntries(url.searchParams);
  const trusted = app.settings['trust proxy'];
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  req.ip = trusted && forwarded ? forwarded : req.socket.remoteAddress;
  req.secure = false;
  req.body = undefined;

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
    return res;
  };
  res.send = (data) => {
    res.end(data);
    return res;
  };
}

function express() {
  return createApp();
}
express.Router = () => new Router();

express.json = ({ limit } = {}) => {
  const max = parseLimit(limit);
  return (req, res, next) => {
    if (req._body) return next();
    if (!/application\/json/i.test(req.headers['content-type'] || '')) {
      req.body = {};
      return next();
    }
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > max) {
        failed = true;
        const err = new Error('request entity too large');
        err.status = 413;
        err.type = 'entity.too.large';
        req.resume();
        return next(err);
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (failed) return;
      req._body = true;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        req.body = {};
        return next();
      }
      try {
        req.body = JSON.parse(raw);
        next();
      } catch (e) {
        const err = new Error('Unexpected token in JSON');
        err.status = 400;
        err.type = 'entity.parse.failed';
        next(err);
      }
    });
  };
};

express.static = (dir, options = {}) => (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let pathname;
  try {
    pathname = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    return next();
  }
  if (pathname.endsWith('/')) pathname += options.index === false ? '' : options.index || 'index.html';
  const file = path.join(dir, pathname);
  if (!file.startsWith(path.resolve(dir))) return next();
  if (options.dotfiles === 'deny' && pathname.split('/').some((part) => part.startsWith('.') && part.length > 1)) return next();
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return next();
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    if (options.maxAge) res.setHeader('Cache-Control', `public, max-age=${30 * 86400}${options.immutable ? ', immutable' : ''}`);
    res.statusCode = 200;
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
};

module.exports = express;
