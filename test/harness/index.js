// ============================================================
// HARNESS UJI: menjalankan app ASLI (src/app.js) dengan Express tiruan dan database memori.
//   const h = await startHarness();   // { url, close, reset, seed, ... }
// ============================================================
const Module = require('module');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');

const fakeExpress = require('./fake-express');
const mem = require('./memory-models');

const SRC = path.join(__dirname, '..', '..', 'src');
let installed = false;

function install() {
  if (installed) return;
  installed = true;

  const replacements = new Map([
    [path.join(SRC, 'models', 'crudModel.js'), { createModel: mem.createModel, D: mem.D }],
    [path.join(SRC, 'models', 'staffModel.js'), mem.StaffModel],
    [path.join(SRC, 'models', 'studentModel.js'), mem.StudentModel],
    [path.join(SRC, 'models', 'sessionModel.js'), mem.SessionModel],
    [path.join(SRC, 'models', 'bloodPressureModel.js'), mem.BloodPressureModel]
  ]);

  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === 'express') return fakeExpress;
    if (request === 'mysql2/promise') return mem.fakeMysql;
    if (request.startsWith('.') && parent) {
      let resolved;
      try {
        resolved = Module._resolveFilename(request, parent, isMain);
      } catch (e) {
        resolved = null;
      }
      if (resolved && replacements.has(resolved)) return replacements.get(resolved);
    }
    return originalLoad.apply(this, arguments);
  };
}

async function startHarness({ env = {} } = {}) {
  install();
  const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'uks-uploads-'));
  Object.assign(process.env, { UPLOAD_ROOT: uploadRoot, NODE_ENV: 'test' }, env);

  const app = require(path.join(SRC, 'app.js'));
  const { hashPassword } = require(path.join(SRC, 'utils', 'password.js'));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  return {
    url,
    uploadRoot,
    mem,
    reset: () => mem.reset(),
    async seed() {
      mem.reset();
      const add = async (nama, username, password, role) =>
        mem.StaffModel.create({ nama, username, email: null, role, password_hash: await hashPassword(password) });
      await add('Admin Uji', 'admin.uji', 'KataSandi-Admin1', 'administrator');
      await add('Petugas Uji', 'petugas.uji', 'KataSandi-Petugas1', 'petugas');
      await mem.StudentModel.create({ nis: '12345', nama: 'Siswa Uji', username: 'siswa.uji', email: null, password_hash: await hashPassword('KataSandi-Siswa1') });
    },
    close: () => new Promise((resolve) => server.close(resolve)),
    cleanup: () => fs.rmSync(uploadRoot, { recursive: true, force: true })
  };
}

module.exports = { startHarness };
