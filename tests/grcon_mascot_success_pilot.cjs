const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file, encoding = "utf8") => fs.readFileSync(path.join(root, file), encoding);
const script = read("grcon_mascot_success_pilot.js");
const index = read("index.html");
const sw = read("sw.js");
const asset = read("assets/mascot/video/grcon-mascot-success-pilot-alpha.webm", null);

assert.deepEqual([...asset.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], "piloto deve ser WebM/EBML válido");
assert.ok(asset.length > 60_000, "piloto não pode ser placeholder");
assert.ok(asset.length < 500_000, "piloto deve permanecer leve para uso contextual");

assert.match(script, /grcon-mascot-success-pilot-alpha\.webm/);
assert.match(script, /#egrdt-teams-ready/);
assert.match(script, /getBoundingClientRect\(\)/);
assert.match(script, /pointer-events:none/);
assert.match(script, /prefers-reduced-motion:reduce/);
assert.match(script, /videoLoaded/);
assert.match(script, /showFallback\(1200, "reduced-motion"\)/);
assert.match(script, /translate3d/);
assert.match(script, /requestAnimationFrame/);
assert.match(script, /preload = "none"/);
assert.match(script, /grcon:egrdt-teams-notified/);
assert.match(script, /background:transparent/);
assert.doesNotMatch(script, /grcon_mascot_scenarios|wide-stage|medium-stage|event-stage/);

const runnerIndex = index.indexOf('src="grcon_mascot_runner.js"');
const pilotIndex = index.indexOf('src="grcon_mascot_success_pilot.js"');
const appIndex = index.indexOf('src="app.js"');
assert.ok(runnerIndex >= 0 && runnerIndex < pilotIndex && pilotIndex < appIndex, "piloto deve carregar entre runner e app");

assert.ok(sw.includes('"grcon_mascot_success_pilot.js"'));
assert.ok(sw.includes('"grcon-mascot-success-pilot-alpha.webm"'));
const precache = sw.slice(sw.indexOf("const ASSETS"), sw.indexOf("const CRITICAL_ASSETS"));
assert.doesNotMatch(precache, /grcon-mascot-success-pilot-alpha\.webm/, "piloto deve continuar lazy e fora do precache inicial");
assert.doesNotMatch(sw, /grcon_mascot_scenarios\.js/);

console.log("grcon_mascot_success_pilot: OK — microinteração ancorada, lazy, transparente e sem bloqueio de UI.");
