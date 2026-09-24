const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file, encoding = "utf8") => fs.readFileSync(path.join(root, file), encoding);
const controller = read("grcon_mascot_controller_v4.js");
const entrypoint = read("grcon_mascot_controller.js");
const header = read("grcon_mascot_header.js");
const runner = read("grcon_mascot_runner.js");
const successPilot = read("grcon_mascot_success_pilot.js");
const sw = read("sw.js");
const pdfHook = read("src/react/pdf-tools/hooks/usePdfMerge.ts");
const coverHook = read("src/react/cover-document/hooks/useCoverDocument.ts");
const bridge = read("src/react/shared/mascot/mascotController.ts");
const types = read("src/react/shared/mascot/mascot.types.ts");
const source = JSON.parse(read("assets/mascot/video/higgsfield-source.json"));
const sprite = read("grcon-mascot-sprite.png", null);

const states = ["idle", "hello", "analyzing", "warning", "success", "run"];
const assets = Object.fromEntries(states.map((state) => {
  const file = `assets/mascot/video/grcon-mascot-${state}-alpha.webm`;
  return [state, read(file, null)];
}));

function hash(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
function assertWebm(bytes, state) {
  assert.deepEqual([...bytes.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], `${state}: WebM/EBML inválido`);
  assert.ok(bytes.length > 100_000, `${state}: asset não pode ser placeholder`);
  assert.ok(bytes.length < 1_500_000, `${state}: asset precisa permanecer apropriado para web`);
}

assert.equal(sprite.readUInt32BE(16), 1254);
assert.equal(sprite.readUInt32BE(20), 1254);
for (const [state, bytes] of Object.entries(assets)) assertWebm(bytes, state);
assert.equal(new Set(Object.values(assets).map(hash)).size, 6, "os seis estados precisam ter mídias independentes");

assert.equal(source.assetRevision, "20260924.1");
assert.equal(source.officialElement.id, "5d684379-9c43-47db-913a-6af9d779e8b2");
for (const state of states) assert.ok(source.jobs[state], `job Higgsfield ausente para ${state}`);

assert.match(entrypoint, /grcon_mascot_controller_v4\.js\?v=5\.0\.0-20260924\.1/);
assert.match(controller, /official-contextual-v5/);
assert.match(controller, /ASSET_REVISION = "20260924\.1"/);
assert.match(controller, /const PRIORITY/);
assert.match(controller, /warning: 6/);
assert.match(controller, /function begin\(/);
assert.match(controller, /let warningTimer = 0/);
assert.match(controller, /operation-begin-queued-during-warning/);
assert.match(controller, /grcon:processing-pulse/);
assert.match(controller, /function handlePulse\(/);
assert.match(controller, /function initAuthObserver\(/);
assert.match(controller, /session-reset/);
assert.match(controller, /stale-operation/);
assert.match(controller, /contextGeneration/);
assert.match(controller, /getBoundingClientRect\(\)/);
assert.match(controller, /pointer-events:none/);
assert.match(controller, /prefers-reduced-motion:reduce/);
assert.match(controller, /grcon:mascot:animations/);
assert.match(controller, /Animações do mascote/);
assert.match(controller, /requestIdleCallback/);
assert.match(controller, /grcon-mascot-idle-alpha\.webm/);
assert.match(controller, /grcon-mascot-hello-alpha\.webm/);
assert.match(controller, /grcon-mascot-analyzing-alpha\.webm/);
assert.match(controller, /grcon-mascot-warning-alpha\.webm/);
assert.match(controller, /grcon-mascot-success-alpha\.webm/);
assert.match(controller, /grcon-mascot-run-alpha\.webm/);
assert.match(controller, /video\.preload = "none"/);
assert.match(controller, /instances: overlay\?\.isConnected \? 1 : 0/);
assert.doesNotMatch(controller, /https?:\/\//i, "runtime não pode depender de CDN");
assert.doesNotMatch(controller, /canvas|iframe|sprite sheet|requestVideoFrameCallback/i);
assert.doesNotMatch(controller, /root\.gsap|gsap\./i, "GSAP não existe no projeto atual e não deve ser inventado");

assert.match(header, /bridge de compatibilidade/);
assert.doesNotMatch(header, /createElement\("video"\)|MutationObserver/);
assert.match(runner, /GrconMascot\?\.run/);
assert.doesNotMatch(runner, /createElement\(|addEventListener\(/);
assert.match(successPilot, /GrconMascot\?\.success/);
assert.doesNotMatch(successPilot, /createElement\(|addEventListener\(/);

assert.match(types, /"hidden" \| "hello" \| "idle" \| "analyzing" \| "warning" \| "success" \| "running"/);
assert.match(bridge, /beginMascotOperation/);
assert.match(pdfHook, /beginMascotOperation/);
assert.match(pdfHook, /state: "running"/);
assert.match(coverHook, /beginMascotOperation/);
assert.match(coverHook, /Conferindo LD/);
assert.match(coverHook, /Gerando arquivo com capa/);

const precache = sw.slice(sw.indexOf("const ASSETS"), sw.indexOf("const CRITICAL_ASSETS"));
assert.match(precache, /grcon-mascot-idle-alpha\.webm/);
assert.match(precache, /grcon-mascot-hello-alpha\.webm/);
for (const state of ["analyzing", "warning", "success", "run"]) {
  assert.doesNotMatch(precache, new RegExp("grcon-mascot-" + state + "-alpha\\.webm"), state + " deve continuar lazy");
  assert.match(sw, new RegExp('"grcon-mascot-' + state + '-alpha\\.webm"'), state + " precisa estar na estratégia HEAVY");
}
assert.match(sw, /mascot-runtime5/);

console.log("grcon_mascot_video: OK — runtime único, 6 estados Higgsfield, state machine, React bridge, lazy loading e fallback validados.");
