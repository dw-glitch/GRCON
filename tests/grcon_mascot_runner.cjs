const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const runner = read("grcon_mascot_runner.js");
const css = read("grcon_mascot_runner.css");
const bootstrap = read("grcon_service_worker.js");
const sw = read("sw-v6.js");
const vercel = read("vercel.json");
const app = read("app.js");
const dashboard = read("sigem_pw_dashboard_app.js");
const conference = read("posting_conference_app.js");
const metadata = JSON.parse(read("assets/mascot/video/grcon-mascot-running-metadata.json"));

for (const asset of [
  "assets/mascot/video/grcon-mascot-running-alpha.webm",
  "assets/mascot/video/grcon-mascot-running-compat.mp4",
  "assets/mascot/video/grcon-mascot-running-poster.png",
]) assert.equal(exists(asset), true, `${asset} precisa existir`);

assert.equal(metadata.alpha.streams[0].codec_name, "vp9");
assert.equal(metadata.alpha.streams[0].width, 480);
assert.equal(metadata.alpha.streams[0].height, 480);
assert.equal(metadata.alpha.streams[0].r_frame_rate, "24/1");
assert.equal(metadata.alpha.streams[0].tags.ALPHA_MODE, "1");
assert.equal(metadata.compat.streams[0].codec_name, "h264");
assert.equal(metadata.compat.streams[0].pix_fmt, "yuv420p");
assert.equal(metadata.source.audio, false);

assert.match(runner, /const LANE_ID = "grcon-mascot-run-lane"/);
assert.match(runner, /document\.getElementById\("app-main"\)/);
assert.match(runner, /tabs\.insertAdjacentElement\("afterend", lane\)/);
assert.match(runner, /workspace\.prepend\(lane\)/);
assert.match(runner, /grcon:processing-state/);
assert.match(runner, /grcon:mascot-operation/);
assert.match(runner, /sigem-pw-analysis/);
assert.match(runner, /generating-grdt/);
assert.match(runner, /detail\?\.context === "control"/);
assert.match(runner, /RUN_DELAY_MS = 220/);
assert.match(runner, /translate3d/);
assert.match(runner, /laneWidth \+ SAFETY_MARGIN/);
assert.match(runner, /runnerWidth \+ SAFETY_MARGIN/);
assert.doesNotMatch(runner, /translateX\(1500px\)/);
assert.doesNotMatch(runner, /setInterval\s*\(/);
assert.doesNotMatch(runner, /preventDefault\s*\(/);
assert.doesNotMatch(runner, /stopPropagation\s*\(/);
assert.match(runner, /prefers-reduced-motion: reduce/);
assert.match(runner, /grcon-mascot-running-alpha\.webm/);
assert.match(runner, /grcon-mascot-running-compat\.mp4/);
assert.match(runner, /grcon-mascot-running-poster\.png/);
assert.match(runner, /mp4-canvas/);
assert.match(runner, /root\.GrconMascot\?\.stop/);
assert.match(runner, /root\.GrconMascot\.play\(currentOperationState/);

assert.match(css, /#grcon-mascot-run-lane/);
assert.match(css, /pointer-events:\s*none/);
assert.match(css, /overflow:\s*clip/);
assert.match(css, /height:\s*0/);
assert.match(css, /will-change:\s*transform/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(css, /html\s*\{[^}]*overflow\s*:\s*hidden/i);
assert.doesNotMatch(css, /body\s*\{[^}]*overflow\s*:\s*hidden/i);

assert.match(bootstrap, /grcon_mascot_runner\.css\?v=20260916\.4/);
assert.match(bootstrap, /grcon_mascot_runner\.js\?v=20260916\.4/);
assert.match(bootstrap, /sw-v6\.js\?v=20260916\.4/);
assert.match(sw, /grcon-v5\.40\.11-mascot-running-v3/);
assert.match(sw, /grcon_mascot_runner\.js/);
assert.match(sw, /grcon_mascot_runner\.css/);
assert.match(sw, /mascotVideo \|\| mascotCompat/);
assert.match(vercel, /video\/mp4/);
assert.match(vercel, /video\/webm/);
assert.match(vercel, /media-src 'self' blob:/);

assert.match(app, /grcon:processing-state/);
assert.match(app, /context: "control"/);
assert.match(dashboard, /grcon:mascot-operation/);
assert.match(dashboard, /state: "sigem-pw-analysis"/);
assert.match(conference, /grcon:mascot-operation/);
assert.match(conference, /state: "checking-document"/);

console.log("grcon_mascot_runner: OK — assets, pista, responsividade, eventos, acessibilidade, fallbacks e cache validados.");
