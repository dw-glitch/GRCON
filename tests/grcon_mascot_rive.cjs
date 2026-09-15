const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file, encoding = "utf8") => fs.readFileSync(path.join(root, file), encoding);
const mascot = read("grcon_mascot_header.js");
const greeting = read("grcon_mascot_greeting.js");
const index = read("index.html");
const sw = read("sw.js");
const vercel = read("vercel.json");
const sprite = read("grcon-mascot-sprite.png", null);

assert.equal(sprite.readUInt32BE(16), 1254, "sprite oficial deve manter 1254 px de largura");
assert.equal(sprite.readUInt32BE(20), 1254, "sprite oficial deve manter 1254 px de altura");
assert.match(mascot, /const POSES=Object\.freeze\(\{/);

const expectedPoses = {
  default: [0, 0], analysis: [1, 0], search: [2, 0], check: [3, 0],
  history: [0, 1], dashboard: [1, 1], "sigem-pw": [2, 1], egrdt: [3, 1],
  import: [0, 2], report: [1, 2], warning: [2, 2], success: [3, 2],
  pending: [0, 3], empty: [1, 3], quality: [2, 3],
};
for (const [pose, [x, y]] of Object.entries(expectedPoses)) {
  const name = pose === "sigem-pw" ? `"${pose}"` : pose;
  assert.match(mascot, new RegExp(`${name}:\\{x:${x},y:${y},label:`), `${pose} deve preservar a célula oficial`);
}

assert.doesNotMatch(index, /vendor\/rive|grcon_mascot_rive\.js|data-grcon-rive/);
assert.doesNotMatch(sw, /vendor\/rive|assets\/mascot\/rive|grcon_mascot_rive\.js/);
assert.doesNotMatch(index, /wasm-unsafe-eval|unsafe-eval/);
assert.doesNotMatch(vercel, /wasm-unsafe-eval|unsafe-eval/);
for (const csp of [index, vercel]) assert.match(csp, /script-src 'self' blob:/);

for (const asset of [
  "grcon-mascot-sprite.png",
  "assets/mascot/animated/grcon-mascot-wave.png",
  "assets/mascot/animated/grcon-mascot-analyze.png",
  "assets/mascot/animated/grcon-mascot-success.png",
]) {
  assert.ok(sw.includes(`"${asset}"`), `${asset} deve permanecer disponível offline`);
}

assert.match(greeting, /official-png-css-v1/);
assert.doesNotMatch(greeting, /root\.rive|new runtime\.Rive|\.riv"|\.wasm"/);
assert.doesNotMatch(greeting, /run-sprite|frame-run|step-end|steps\s*\(/);
for (const asset of ["wave", "analyze", "success"]) {
  assert.match(greeting, new RegExp(`grcon-mascot-${asset}\\.png`));
}
for (const animation of ["idle", "observe", "work", "processing", "wave", "analyze", "success"]) {
  assert.match(greeting, new RegExp(`@keyframes grcon-mascot-official-${animation}`));
}
for (const pose of Object.keys(expectedPoses)) {
  assert.ok(mascot.includes(pose), `${pose} deve continuar definido no mascote oficial`);
}
assert.match(greeting, /prefers-reduced-motion: reduce/);
assert.match(greeting, /animation: grcon-mascot-orb-spin 820ms linear infinite/);
assert.match(sw, /official-fluid1/);

console.log("grcon_mascot_official: OK — somente o Mascote da Qualidade oficial é exibido e animado sem Rive.");
