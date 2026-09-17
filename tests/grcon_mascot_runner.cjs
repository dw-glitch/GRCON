const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file, encoding = "utf8") => fs.readFileSync(path.join(root, file), encoding);
const runner = read("grcon_mascot_runner.js");
const index = read("index.html");
const sw = read("sw.js");
const asset = read("assets/mascot/video/grcon-mascot-running-alpha.webm", null);

assert.deepEqual([...asset.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], "corrida precisa ser WebM/EBML válido");
assert.ok(asset.length >= 300_000, "corrida não pode ser placeholder vazio");
assert.ok(asset.length < 1_500_000, "corrida precisa estar comprimida para uso web");

assert.match(runner, /grcon-mascot-running-alpha\.webm/);
assert.match(runner, /grcon:processing-state/);
assert.match(runner, /grcon:mascot-operation/);
assert.match(runner, /grcon:notification/);
assert.match(runner, /kind === "success"/);
assert.match(runner, /completedSuccessfully/);
assert.match(runner, /prefers-reduced-motion: reduce/);
assert.match(runner, /pointer-events:none/);
assert.match(runner, /aria-hidden/);
assert.match(runner, /sessionStorage/);
assert.match(runner, /COOLDOWN_MS/);
assert.match(runner, /grconMascotRun/);
assert.doesNotMatch(runner, /https?:\/\//, "a mídia deve permanecer same-origin");

const controllerIndex = index.indexOf('src="grcon_mascot_controller.js"');
const runnerIndex = index.indexOf('src="grcon_mascot_runner.js"');
const appIndex = index.indexOf('src="app.js"');
assert.ok(controllerIndex >= 0 && controllerIndex < runnerIndex && runnerIndex < appIndex, "runner deve carregar entre controlador e app");

for (const assetPath of ["grcon_mascot_runner.js", "assets/mascot/video/grcon-mascot-running-alpha.webm"]) {
  assert.ok(sw.includes(`"${assetPath}"`), `${assetPath} precisa estar no cache offline`);
}

console.log("grcon_mascot_runner: OK — corrida pós-operação, acessibilidade, cache e mídia validados.");
