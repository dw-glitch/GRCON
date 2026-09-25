const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file, encoding = "utf8") => fs.readFileSync(path.join(root, file), encoding);

const runner = read("grcon_mascot_runner.js");
const controller = read("grcon_mascot_controller_v4.js");
const index = read("index.html");
const sw = read("sw.js");
const asset = read("assets/mascot/video/grcon-mascot-running-alpha.webm", null);

assert.deepEqual([...asset.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], "corrida aprovada precisa continuar sendo WebM/EBML válido");
assert.ok(asset.length > 300_000 && asset.length < 1_500_000, "vídeo original de corrida precisa permanecer real e comprimido para web");

assert.match(runner, /grcon-mascot-running-alpha\.webm/);
assert.match(runner, /grcon-mascot-activity-strip/);
assert.match(runner, /RUN_DURATION_MS = 5_040/);
assert.match(runner, /insertBefore\(strip, shell\)/);
assert.match(runner, /pointer-events:none/);
assert.match(runner, /prefers-reduced-motion: reduce/);
assert.match(runner, /video\.loop = true/);
assert.match(runner, /video\.play\(\)/);
assert.match(runner, /video\.pause\(\)/);
assert.match(runner, /currentTime = 0/);
assert.match(runner, /@keyframes grcon-mascot-strip-run/);
assert.doesNotMatch(runner, /position:fixed/, "a faixa de corrida não pode ser overlay fixo sobre o workspace");
assert.doesNotMatch(runner, /grcon-mascot-run-alpha\.webm/, "runner deve usar o vídeo original aprovado, não o substituto recente");

assert.match(controller, /HEADER_SLOT_ID = "grcon-mascot-header-slot"/);
assert.match(controller, /grcon-mascot-running-alpha\.webm/);
assert.match(controller, /root\.GrconMascotRunner\?\.stop/);
assert.match(controller, /runner\.run/);
assert.doesNotMatch(controller, /grcon-mascot-runtime-run/, "runtime contextual não pode mais atravessar a viewport");
assert.doesNotMatch(controller, /position:fixed/, "mascote contextual não pode permanecer fixo em canto da área operacional");
assert.doesNotMatch(controller, /grcon-mascot-fallback-running/, "PNG não pode simular corrida corporal");
assert.doesNotMatch(controller, /vp\.width - size\.width - gap/, "runtime não pode escolher cantos da viewport para o mascote");

const slotIndex = index.indexOf('id="grcon-mascot-header-slot"');
const runtimeStatusIndex = index.indexOf('class="runtime-status"');
const stripIndex = index.indexOf('id="grcon-mascot-activity-strip"');
const shellIndex = index.indexOf('class="app-shell grdt-only"');
assert.ok(slotIndex >= 0 && slotIndex < runtimeStatusIndex, "slot do mascote deve fazer parte da topbar");
assert.ok(stripIndex >= 0 && stripIndex < shellIndex, "faixa da corrida deve ficar antes do app-shell/workspace");
assert.match(index, /grcon_mascot_controller\.js[\s\S]*grcon_mascot_runner\.js/, "runner deve carregar depois do controlador e antes das operações do app");

assert.match(sw, /grcon-mascot-running-alpha\.webm/);
assert.match(sw, /mascot-shell-runner1/);

console.log("grcon_mascot_runner: OK — vídeo original restaurado em faixa estrutural fora do workspace; mascote contextual preso à topbar.");
