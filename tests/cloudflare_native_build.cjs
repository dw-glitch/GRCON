'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'grcon-workers-build-'));
try {
  fs.mkdirSync(path.join(temp, 'scripts'));
  for (const name of ['prepare-cloudflare-build.mjs', 'build-cloudflare-package.mjs', 'verify-cloudflare-package.mjs']) {
    fs.copyFileSync(path.join(root, 'scripts', name), path.join(temp, 'scripts', name));
  }
  const script = path.join(temp, 'scripts', 'prepare-cloudflare-build.mjs');
  const env = {...process.env}; delete env.WORKERS_CI;
  const ordinary = spawnSync(process.execPath, [script], {env, encoding:'utf8'});
  assert.equal(ordinary.status, 0, ordinary.stderr);
  assert.equal(fs.existsSync(path.join(temp,'dist-cloudflare')), false, 'Other providers must not produce a Cloudflare package');
  // Native build must propagate packaging errors instead of allowing deployment.
  const failed = spawnSync(process.execPath, [script], {env:{...env,WORKERS_CI:'1'},encoding:'utf8'});
  assert.notEqual(failed.status,0);
  assert.match(failed.stderr,/Diretório obrigatório ausente: assets/);
  assert.match(failed.stderr,/Deploy deve ser interrompido/);
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.equal(pkg.scripts.postbuild,'node scripts/prepare-cloudflare-build.mjs','npm run build must invoke the lifecycle in the native build');
  console.log('Cloudflare native build: other providers unchanged; real packaging failure stops build.');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
