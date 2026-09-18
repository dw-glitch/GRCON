const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file, encoding = "utf8") => fs.readFileSync(path.join(root, file), encoding);
const exists = (file) => fs.existsSync(path.join(root, file));
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

const entrypoint = read("grcon_mascot_controller.js");
const controller = read("grcon_mascot_controller_v4.js");
const index = read("index.html");
const sw = read("sw.js");
const bootstrap = read("grcon_service_worker.js");
const vercel = read("vercel.json");
const app = read("app.js");
const dashboard = read("sigem_pw_dashboard_app.js");
const conference = read("posting_conference_app.js");
const fixture = read("tests/fixtures/grcon-mascot-video.html");
const browser = read("scripts/validar-mascote-video-browser.cjs");
const manifest = JSON.parse(read("vendor-manifest.json"));
const sprite = read("grcon-mascot-sprite.png", null);

const processingPath = "assets/mascot/video/grcon-mascot-processing-alpha.webm";
const wavePath = "assets/mascot/video/grcon-mascot-wave-alpha.webm";
const processing = read(processingPath, null);
const wave = read(wavePath, null);

function assertWebm(bytes, name, minimumBytes) {
  assert.deepEqual([...bytes.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], `${name} precisa ser WebM/EBML válido`);
  assert.ok(bytes.length >= minimumBytes, `${name} não pode ser um placeholder vazio`);
}

assert.equal(sprite.readUInt32BE(16), 1254);
assert.equal(sprite.readUInt32BE(20), 1254);
assert.equal(hash(sprite), "cae28d23b527eb36359d9bada0bb8701f72232853875741fd0717f3256f73bc5", "PNG HD oficial não pode mudar");
assertWebm(processing, "vídeo de processamento", 300_000);
assertWebm(wave, "vídeo de aceno", 300_000);
assert.notEqual(hash(processing), hash(wave), "os dois comportamentos precisam ter mídias independentes");

assert.match(entrypoint, /grcon_mascot_controller_v4\.js\?v=4\.1\.0-20260916\.2/);
assert.match(entrypoint, /official-png-static-fallback/);
assert.doesNotMatch(entrypoint, /gsap|\.riv/i);

const requiredStates = [
  "idle", "welcome", "hover", "analyzing", "searching-files", "checking-document",
  "confused", "success", "warning", "error", "uploading", "generating-grdt",
  "checking-ld", "sigem-pw-analysis", "loading",
];
for (const state of requiredStates) assert.ok(controller.includes(`"${state}"`), `estado ${state} ausente`);

assert.match(controller, /official-video-v4/);
assert.match(controller, /ASSET_REVISION\s*=\s*"20260916\.2"/);
assert.match(controller, /MASCOT_ANIMATIONS/);
assert.match(controller, /grcon-mascot-processing-alpha\.webm/);
assert.match(controller, /grcon-mascot-wave-alpha\.webm/);
assert.match(controller, /url\.searchParams\.set\("v", ASSET_REVISION\)/);
assert.match(controller, /root\.location\.origin/);
assert.match(controller, /video\.muted\s*=\s*true/);
assert.match(controller, /video\.playsInline\s*=\s*true/);
assert.match(controller, /video\.preload\s*=\s*"auto"/);
assert.match(controller, /PROCESSING_STATES/);
assert.match(controller, /result\?\.catch/);
assert.match(controller, /canplaythrough/);
assert.match(controller, /media-stalled/);
assert.match(controller, /media-waiting/);
assert.match(controller, /MediaError/);
assert.match(controller, /is-video-active/);
assert.match(controller, /prefers-reduced-motion:reduce/);
assert.match(controller, /visibilitychange/);
assert.match(controller, /pagehide/);
assert.match(controller, /root\.sessionStorage/);
assert.match(controller, /SESSION_PREFIX/);
assert.match(controller, /greetingAlreadyPlayed/);
assert.match(controller, /markGreetingPlayed/);
assert.match(controller, /clearGreetingFor/);
assert.match(controller, /grcon-cloud-pending/);
assert.match(controller, /session-reset/);
assert.match(controller, /operationActive && \(state === "welcome" \|\| state === "hover"\)/);
assert.match(controller, /root\.GrconMascot = Object\.freeze/);
assert.doesNotMatch(controller, /root\.gsap|gsap\.|assets\/mascot\/layers|https?:\/\//i);
assert.doesNotMatch(controller, /canvas|webassembly|\.riv/i);

const headerIndex = index.indexOf('src="grcon_mascot_header.js"');
const controllerIndex = index.indexOf('src="grcon_mascot_controller.js"');
const appIndex = index.indexOf('src="app.js"');
assert.ok(headerIndex >= 0 && headerIndex < controllerIndex && controllerIndex < appIndex);
assert.match(index, /data-grcon-mascot-controller="video"/);
assert.doesNotMatch(index, /vendor\/gsap|data-grcon-gsap|mascot-controller="gsap"|vendor\/rive|\.riv["']/i);
assert.match(bootstrap, /mascot-controller="video"/);
assert.doesNotMatch(bootstrap, /installGsap|vendor\/gsap|window\.gsap/i);

for (const asset of [processingPath, wavePath, "grcon_mascot_controller.js"]) {
  assert.ok(sw.includes(`"${asset}"`), `${asset} precisa continuar disponível no cache offline existente`);
}
assert.match(sw, /mascot-context9/);
assert.doesNotMatch(sw, /vendor\/gsap|assets\/mascot\/layers|grcon-mascot-(?:body|head|right-arm|official-default)\.png/i);

assert.match(vercel, /\/assets\/mascot\/video/);
assert.match(vercel, /video\/webm/);
assert.match(vercel, /max-age=31536000, immutable/);
assert.match(vercel, /media-src 'self' blob:/);
assert.match(vercel, /grcon_mascot_controller\.js/);
assert.match(vercel, /no-cache, no-store, must-revalidate/);

assert.equal(manifest.libraries.some((entry) => /gsap/i.test(entry.name) || /gsap/i.test(entry.file)), false);
for (const obsolete of [
  "vendor/gsap/gsap.min.js",
  "assets/mascot/layers/grcon-mascot-official-default.png",
  "assets/mascot/layers/grcon-mascot-body.png",
  "assets/mascot/layers/grcon-mascot-head.png",
  "assets/mascot/layers/grcon-mascot-right-arm.png",
  "docs/mascote-gsap.md",
  "tests/fixtures/grcon-mascot-gsap.html",
  "scripts/validar-mascote-gsap-browser.cjs",
  ".github/workflows/mascot-gsap.yml",
  "assets/mascot/grcon-mascot-default.png",
  "assets/mascot/grcon-mascot-sprite.png",
  "grcon-mascot.png",
]) assert.equal(exists(obsolete), false, `${obsolete} deveria ter sido removido`);

assert.match(app, /grcon:notification/);
assert.match(app, /grcon:processing-state/);
assert.match(app, /pulseMascotProcessing\(\)/);
assert.match(dashboard, /grcon:mascot-operation/);
assert.match(dashboard, /state: "sigem-pw-analysis"/);
assert.match(conference, /grcon:mascot-operation/);
assert.match(conference, /state: "checking-document"/);
assert.match(fixture, /grcon_mascot_controller\.js/);
assert.doesNotMatch(fixture, /gsap/i);
assert.ok(browser.includes("grcon-mascot-processing-alpha"), "teste visual precisa validar o vídeo de processamento");
assert.ok(browser.includes("grcon-mascot-wave-alpha"), "teste visual precisa validar o vídeo de aceno");
assert.match(browser, /fallback/);

console.log("grcon_mascot_video: OK — cache versionado, saudação por sessão, prioridade operacional e fallback PNG validados.");
