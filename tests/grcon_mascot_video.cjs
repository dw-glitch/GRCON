const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file, encoding = "utf8") => fs.readFileSync(path.join(root, file), encoding);
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

const entrypoint = read("grcon_mascot_controller.js");
const controller = read("grcon_mascot_controller_v5.js");
const compat = read("grcon_mascot_compat_media.js");
const sw = read("sw-v6.js");
const bootstrap = read("grcon_service_worker.js");
const vercel = read("vercel.json");
const app = read("app.js");
const dashboard = read("sigem_pw_dashboard_app.js");
const conference = read("posting_conference_app.js");
const fixture = read("tests/fixtures/grcon-mascot-video.html");
const sprite = read("grcon-mascot-sprite.png", null);
const processing = read("assets/mascot/video/grcon-mascot-processing-alpha.webm", null);
const wave = read("assets/mascot/video/grcon-mascot-wave-alpha.webm", null);

function assertWebm(bytes, name) {
  assert.deepEqual([...bytes.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], `${name} precisa ser WebM/EBML válido`);
  assert.ok(bytes.length > 300_000, `${name} não pode ser placeholder`);
}
function rebuildCompat(prefix) {
  const chunks = [1, 2, 3, 4].map((part) => read(`assets/mascot/compat/${prefix}.part${part}.b64`).trim());
  chunks.forEach((chunk) => assert.match(chunk, /^[A-Za-z0-9+/=]+$/));
  return Buffer.from(chunks.join(""), "base64");
}
function assertMp4(bytes, expectedHash, name) {
  assert.equal(bytes.subarray(4, 8).toString("ascii"), "ftyp", `${name} precisa ser MP4 válido`);
  assert.equal(hash(bytes), expectedHash, `${name} deve manter o binário H.264 validado`);
}

assert.equal(sprite.readUInt32BE(16), 1254);
assert.equal(sprite.readUInt32BE(20), 1254);
assert.equal(hash(sprite), "cae28d23b527eb36359d9bada0bb8701f72232853875741fd0717f3256f73bc5");
assertWebm(processing, "processamento");
assertWebm(wave, "aceno");
assert.notEqual(hash(processing), hash(wave));
assertMp4(rebuildCompat("wave-h264-144"), "dc04bcf83409106ccd6a7f324a82a02a7eccc68e7c534dbd484b0fa5bf0a15f1", "fallback de aceno");
assertMp4(rebuildCompat("processing-h264-128"), "c28a8615c8ef0a128e2fbdbadf55fc67f59d59463adb355a5f8896e64a6ab998", "fallback de processamento");

assert.match(entrypoint, /grcon_mascot_controller_v5\.js\?v=5\.0\.0-20260916\.3/);
assert.match(entrypoint, /official-png-static-fallback/);
assert.doesNotMatch(entrypoint, /grcon_mascot_controller_v4\.js/);

for (const state of ["idle", "welcome", "hover", "analyzing", "searching-files", "checking-document", "confused", "success", "warning", "error", "uploading", "generating-grdt", "checking-ld", "sigem-pw-analysis", "loading"])
  assert.ok(controller.includes(`"${state}"`), `estado ${state} ausente`);

assert.match(controller, /official-video-v5-multiformat/);
assert.match(controller, /ASSET_REVISION\s*=\s*"20260916\.3"/);
assert.match(controller, /grcon-mascot-processing-alpha\.webm/);
assert.match(controller, /grcon-mascot-wave-alpha\.webm/);
assert.match(controller, /compat:\s*"processing"/);
assert.match(controller, /compat:\s*"wave"/);
assert.match(controller, /attempt\(record, animationName, 1, token\)/);
assert.match(controller, /hideMedia\(record, "png-/);
assert.match(controller, /AUTOPLAY_BLOCKED/);
assert.match(controller, /CODEC_UNSUPPORTED/);
assert.match(controller, /NETWORK_BLOCKED/);
assert.match(controller, /VIDEO_NOT_FOUND/);
assert.match(controller, /MEDIA_DECODE_ERROR/);
assert.match(controller, /PLAY_TIMEOUT/);
assert.match(controller, /REDUCED_MOTION/);
assert.match(controller, /NotAllowedError/);
assert.match(controller, /NotSupportedError/);
assert.match(controller, /loadedmetadata/);
assert.match(controller, /loadeddata/);
assert.match(controller, /canplay/);
assert.match(controller, /onplaying/);
assert.match(controller, /onstalled/);
assert.match(controller, /onabort/);
assert.match(controller, /video\.muted\s*=\s*true/);
assert.match(controller, /video\.playsInline\s*=\s*true/);
assert.match(controller, /PREF_KEY/);
assert.match(controller, /prefers-reduced-motion: reduce/);
assert.match(controller, /explicit === "on"/);
assert.match(controller, /explicit === "off"/);
assert.match(controller, /Animações do mascote/);
assert.match(controller, /localStorage/);
assert.match(controller, /sessionStorage/);
assert.match(controller, /operationActive && \(state === "welcome" \|\| state === "hover"\)/);
assert.match(controller, /requestVideoFrameCallback/);
assert.match(controller, /getImageData/);
assert.match(controller, /GRCONMascotCompatMedia/);
assert.match(controller, /diagnostics/);
assert.match(controller, /oldServiceWorker/);
assert.match(controller, /oldCaches/);
assert.doesNotMatch(controller, /https?:\/\//i);

assert.match(compat, /video\/mp4/);
assert.match(compat, /URL\.createObjectURL/);
assert.match(compat, /cache:\s*"no-store"/);
assert.match(compat, /response\.ok/);
assert.match(compat, /revokeObjectURL/);
assert.doesNotMatch(compat, /https?:\/\//i);

assert.match(sw, /grcon-v5\.40\.11-mascot-multiformat-v2/);
assert.match(sw, /key\.startsWith\(CACHE_PREFIX\)/);
assert.match(sw, /self\.skipWaiting\(\)/);
assert.match(sw, /self\.clients\.claim\(\)/);
assert.match(sw, /request\.headers\.has\("range"\)/);
assert.match(sw, /event\.respondWith\(fetch\(request\)\)/);
assert.match(sw, /mascotVideo \|\| mascotCompat/);
assert.match(sw, /networkFirst\(request\)/);
assert.match(sw, /response\.status === 200/);
assert.match(sw, /response\.type !== "opaque"/);
assert.doesNotMatch(sw, /cache\.put\([^\n]*206/);

assert.match(bootstrap, /sw-v6\.js\?v=20260916\.3/);
assert.match(bootstrap, /updateViaCache:\s*"none"/);
assert.match(bootstrap, /controllerchange/);
assert.match(bootstrap, /RELOAD_GUARD/);
assert.match(bootstrap, /sessionStorage\.removeItem\(RELOAD_GUARD\)/);
assert.match(bootstrap, /registration\.update/);

assert.match(vercel, /\/sw-v6\.js/);
assert.match(vercel, /Accept-Ranges/);
assert.match(vercel, /video\/webm/);
assert.match(vercel, /assets\/mascot\/compat/);
assert.match(vercel, /media-src 'self' blob:/);

assert.match(app, /grcon:processing-state/);
assert.match(dashboard, /grcon:mascot-operation/);
assert.match(dashboard, /state: "sigem-pw-analysis"/);
assert.match(conference, /grcon:mascot-operation/);
assert.match(conference, /state: "checking-document"/);
assert.match(fixture, /grcon_mascot_controller\.js/);

console.log("grcon_mascot_video: OK — WebM -> H.264/MP4 -> PNG, acessibilidade, diagnóstico e SW v6 validados.");
