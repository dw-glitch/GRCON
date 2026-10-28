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
  const fixture = path.join(temp,'package.json');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const npmOptions = {cwd:temp,env:{...env,WORKERS_CI:'1',NPM_CONFIG_IGNORE_SCRIPTS:'true'},encoding:'utf8',shell:process.platform==='win32'};
  fs.rmSync(path.join(temp,'dist-cloudflare'),{recursive:true,force:true});
  fs.writeFileSync(fixture,JSON.stringify({scripts:{build:'node -e "process.exit(0)"',postbuild:'node scripts/prepare-cloudflare-build.mjs'}}));
  const skippedHook=spawnSync(npm,['--ignore-scripts','run','build'],npmOptions);
  assert.equal(skippedHook.status,0,skippedHook.stderr);
  assert.equal(fs.existsSync(path.join(temp,'dist-cloudflare')),false,'Reproduce successful build with ignored postbuild and missing assets');
  fs.writeFileSync(fixture,JSON.stringify({scripts:{build:'node scripts/prepare-cloudflare-build.mjs'}}));
  const direct=spawnSync(npm,['--ignore-scripts','run','build'],npmOptions);
  assert.notEqual(direct.status,0,'Direct packaging failure must fail the build even with ignore-scripts');
  assert.match(direct.stderr,/Diretório obrigatório ausente: assets/);
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.match(pkg.scripts.build,/&& node scripts\/prepare-cloudflare-build\.mjs$/,'Packaging must be called directly by the build command');
  assert.equal(pkg.scripts.postbuild,undefined,'Do not rely on a lifecycle skipped by ignore-scripts');
  console.log('Cloudflare native build: ignored postbuild reproduced; direct packaging fails safely with ignore-scripts; other providers unchanged.');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
