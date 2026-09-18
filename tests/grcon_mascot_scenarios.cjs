const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file, encoding = "utf8") => fs.readFileSync(path.join(root, file), encoding);
const exists = (file) => fs.existsSync(path.join(root, file));
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

const scenarios = read("grcon_mascot_scenarios.js");
const controller = read("grcon_mascot_controller_v4.js");
const runner = read("grcon_mascot_runner.js");
const index = read("index.html");
const sw = read("sw.js");
const vercel = read("vercel.json");
const teams = read("egrdt_teams_notification_app.js");

const names = [
  "import-bases",
  "long-processing",
  "sleep",
  "curious",
  "grdt-stamp",
  "teams-send",
  "grdt-to-teams",
  "paperwork",
  "review-coffee",
];
const videoPaths = names.map((name) => `assets/mascot/video/grcon-mascot-${name}.mp4`);
const posterPaths = names.map((name) => `assets/mascot/poster/grcon-mascot-${name}-poster.webp`);

function assertMp4(bytes, label) {
  assert.ok(bytes.length > 70_000, `${label} precisa ser mídia real, não placeholder`);
  assert.equal(bytes.subarray(4, 8).toString("ascii"), "ftyp", `${label} precisa conter atom ftyp de MP4`);
}
function assertWebp(bytes, label) {
  assert.ok(bytes.length > 5_000, `${label} precisa ser poster real`);
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
}

const videoHashes = new Set();
for (const file of videoPaths) {
  assert.ok(exists(file), `${file} ausente`);
  const bytes = read(file, null);
  assertMp4(bytes, file);
  videoHashes.add(hash(bytes));
}
assert.equal(videoHashes.size, videoPaths.length, "cada cenário precisa de mídia independente");
for (const file of posterPaths) {
  assert.ok(exists(file), `${file} ausente`);
  assertWebp(read(file, null), file);
}

assert.match(scenarios, /ASSET_REVISION\s*=\s*"20260918\.3"/);
assert.match(scenarios, /wide-stage/);
assert.match(scenarios, /medium-stage/);
assert.match(scenarios, /event-stage/);
assert.match(scenarios, /idle-stage/);
assert.match(scenarios, /importBases:[\s\S]*width:\s*0\.68[\s\S]*maxWidth:\s*880/);
assert.match(scenarios, /paperwork:[\s\S]*width:\s*0\.78[\s\S]*maxWidth:\s*960/);
assert.match(scenarios, /longProcessing:[\s\S]*width:\s*0\.38[\s\S]*maxWidth:\s*560/);
assert.match(scenarios, /reviewCoffee:[\s\S]*width:\s*0\.40[\s\S]*maxWidth:\s*560/);
assert.match(scenarios, /grdtStamp:[\s\S]*width:\s*0\.32[\s\S]*maxWidth:\s*460/);
assert.match(scenarios, /teamsSend:[\s\S]*width:\s*0\.34[\s\S]*maxWidth:\s*500/);
assert.match(scenarios, /grdtToTeams:[\s\S]*width:\s*0\.26[\s\S]*maxWidth:\s*400/);
assert.match(scenarios, /sleepy:[\s\S]*width:\s*0\.18[\s\S]*maxWidth:\s*300/);
assert.match(scenarios, /curious:[\s\S]*width:\s*0\.14[\s\S]*maxWidth:\s*240/);
assert.match(scenarios, /IDLE_DELAY_MS\s*=\s*80_000/);
assert.match(scenarios, /IDLE_COOLDOWN_MS\s*=\s*150_000/);
assert.match(scenarios, /preload\s*=\s*"none"/);
assert.match(scenarios, /prepare\("importBases",\s*"metadata"\)/);
assert.match(scenarios, /prepare\("paperwork",\s*"metadata"\)/);
assert.match(scenarios, /loadeddata/);
assert.match(scenarios, /canplaythrough/);
assert.match(scenarios, /media-waiting/);
assert.match(scenarios, /media-stalled/);
assert.match(scenarios, /LOAD_TIMEOUT_MS\s*=\s*9_000/);
assert.match(scenarios, /prefers-reduced-motion: reduce/);
assert.match(scenarios, /grcon:egrdt-generated/);
assert.match(scenarios, /grcon:egrdt-teams-send/);
assert.match(scenarios, /grcon:egrdt-teams-notified/);
assert.match(scenarios, /grcon:processing-state/);
assert.match(scenarios, /grcon:mascot-operation/);
assert.match(scenarios, /setGlobalPlaybackSuppressed/);
assert.match(scenarios, /GrconMascotRunner\?\.setSuppressed/);
assert.match(scenarios, /root\.location\.origin/);
assert.doesNotMatch(scenarios, /https?:\/\//, "cenários precisam ser same-origin");
assert.doesNotMatch(scenarios, /mix-blend-mode|chroma|unsafe-eval/i);

const controllerIndex = index.indexOf('src="grcon_mascot_controller.js"');
const runnerIndex = index.indexOf('src="grcon_mascot_runner.js"');
const scenariosIndex = index.indexOf('src="grcon_mascot_scenarios.js"');
const appIndex = index.indexOf('src="app.js"');
assert.ok(controllerIndex >= 0 && controllerIndex < runnerIndex && runnerIndex < scenariosIndex && scenariosIndex < appIndex,
  "orquestrador contextual precisa carregar depois do controlador/runner e antes do app");

assert.match(controller, /setGlobalPlaybackSuppressed/);
assert.match(controller, /globalPlaybackSuppressed/);
assert.match(runner, /setSuppressed/);
assert.match(runner, /suppressed/);
assert.match(teams, /grcon:egrdt-teams-send/);
assert.match(teams, /active:\s*true/);
assert.match(teams, /active:\s*false,\s*outcome:\s*sendOutcome/);

const precacheBlock = sw.slice(sw.indexOf("const ASSETS"), sw.indexOf("const CRITICAL_ASSETS"));
for (const file of [...videoPaths, ...posterPaths]) {
  assert.doesNotMatch(precacheBlock, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${file} não deve entrar no precache inicial`);
  assert.ok(sw.includes(`"${path.basename(file)}"`), `${file} deve participar do cache runtime`);
}
assert.match(sw, /cachedRangeResponse/);
assert.match(sw, /headers\.has\("range"\)/);
assert.match(sw, /mascot-context9/);
assert.match(sw, /grcon_mascot_scenarios\.js/);

assert.match(vercel, /video\/mp4/);
assert.match(vercel, /image\/webp/);
assert.match(vercel, /max-age=31536000, immutable/);
assert.match(vercel, /media-src 'self' blob:/);
assert.doesNotMatch(vercel, /media-src\s+[^;]*https?:\/\//);

console.log("grcon_mascot_scenarios: OK — 9 assets, 4 layouts, eventos, preload progressivo, cache runtime, range e fallback estático validados.");