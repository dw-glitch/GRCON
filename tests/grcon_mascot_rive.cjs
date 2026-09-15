const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file, encoding = "utf8") => fs.readFileSync(path.join(root, file), encoding);
const rml = read("assets/mascot/rive/scene.rml");
const adapter = read("grcon_mascot_rive.js");
const greeting = read("grcon_mascot_greeting.js");
const index = read("index.html");
const sw = read("sw.js");
const vercel = read("vercel.json");
const riv = read("assets/mascot/rive/build/grcon-mascot.riv", null);

assert.ok(riv.length > 4_000, "arquivo Rive compilado deve acompanhar o aplicativo");
assert.match(rml, /<StateMachine name="Mascot State"/);
assert.match(rml, /<StateMachineNumber value="0" name="mode"/);
for (const animation of ["Idle", "Greeting", "Analyzing", "Running", "Success"]) {
  assert.match(rml, new RegExp(`<LinearAnimation[^>]+name="${animation}"`));
}
assert.match(rml, /name="Right Shoulder" id="0:40"/);
assert.match(rml, /name="Right Elbow" id="0:41"/);
assert.match(rml, /name="Left Hip" id="0:50"/);
assert.match(rml, /name="Right Knee" id="0:61"/);
assert.match(rml, /name="Running"[\s\S]+objectId="0:30"[\s\S]+objectId="0:40"[\s\S]+objectId="0:50"[\s\S]+objectId="0:60"/);
assert.match(rml, /CubicEaseInterpolator/);
assert.doesNotMatch(rml, /ImageAsset|ImageContents|\.png|\.gif|\.webp/);

assert.match(adapter, /stateMachine:\s*STATE_MACHINE/);
assert.match(adapter, /stateMachineInputs\(STATE_MACHINE\)/);
assert.match(adapter, /mascot\.classList\.contains\("is-processing"\)\) return 3/);
assert.match(adapter, /mascot\.classList\.contains\("is-greeting-active"\)\) return 1/);
assert.match(adapter, /\["analysis", "pending", "search", "import"\]/);
assert.match(adapter, /resizeDrawingSurfaceToCanvas\(ratio\)/);
assert.match(adapter, /devicePixelRatio/);
assert.match(adapter, /prefers-reduced-motion: reduce/);
assert.match(adapter, /animação vetorial indisponível; usando fallback PNG animado/);
assert.match(adapter, /enableRiveAssetCDN:\s*false/);
assert.match(adapter, /png-animated-fallback-v2/);
assert.match(adapter, /function disableEngine\(error\)/);
assert.match(adapter, /if \(engineDisabled\) return/);
assert.match(adapter, /canvas\.width <= 1 \|\| record\.canvas\.height <= 1/);
assert.match(adapter, /requestAnimationFrame\(\(\) => \{[\s\S]+requestAnimationFrame\(\(\) => activate\(record\)\)/);
assert.match(adapter, /tempo limite ao iniciar o WebAssembly do Rive/);
assert.match(adapter, /webglcontextlost/);
assert.match(adapter, /unhandledrejection/);
assert.match(adapter, /using fallback PNG animado|usando fallback PNG animado/);
assert.doesNotMatch(greeting, /if \(poseMotion && !root\.rive\?\.Rive\)/);
assert.match(greeting, /if \(poseMotion\) \{[\s\S]+grcon-mascot-generated-/);
assert.doesNotMatch(greeting, /if \(!root\.rive\?\.Rive\) \{\s*Object\.values\(GENERATED_ASSETS\)/);
for (const csp of [index, vercel]) {
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval' blob:/);
  assert.doesNotMatch(csp, /script-src 'self' 'unsafe-eval'/);
}
assert.doesNotMatch(adapter, /pointermove|mousemove|requestAnimationFrame\([^)]*requestAnimationFrame/);

const runtimeIndex = index.indexOf('src="vendor/rive/rive.js"');
const adapterIndex = index.indexOf('src="grcon_mascot_rive.js"');
const greetingIndex = index.indexOf('src="grcon_mascot_greeting.js"');
const appIndex = index.indexOf('src="app.js"');
assert.ok(runtimeIndex >= 0 && runtimeIndex < greetingIndex && greetingIndex < adapterIndex && adapterIndex < appIndex);
for (const asset of [
  "assets/mascot/rive/build/grcon-mascot.riv",
  "vendor/rive/rive.js",
  "vendor/rive/rive.wasm",
  "vendor/rive/rive_fallback.wasm",
  "grcon_mascot_rive.js",
]) {
  assert.ok(sw.includes(`"${asset}"`), `${asset} precisa estar disponível offline`);
}

assert.match(sw, /rive2-dual/);

console.log("grcon_mascot_rive: OK — Rive, CSP WebAssembly, ativação segura e fallback PNG duplo validados.");
