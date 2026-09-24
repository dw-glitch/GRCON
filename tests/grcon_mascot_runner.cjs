const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file, encoding = "utf8") => fs.readFileSync(path.join(root, file), encoding);

const runner = read("grcon_mascot_runner.js");
const controller = read("grcon_mascot_controller_v4.js");
const index = read("index.html");
const asset = read("assets/mascot/video/grcon-mascot-run-alpha.webm", null);

assert.deepEqual([...asset.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3]);
assert.ok(asset.length > 100_000 && asset.length < 1_500_000);
assert.match(runner, /delegada ao Mascot Runtime único/);
assert.match(runner, /GrconMascot\?\.run/);
assert.doesNotMatch(runner, /createElement|addEventListener|grcon:processing-state/);
assert.match(controller, /grcon-mascot-run-alpha\.webm/);
assert.match(controller, /@keyframes grcon-mascot-runtime-run/);
assert.match(controller, /isMobile\(\) \|\| reducedMotion\(\)/);
const controllerIndex = index.indexOf('src="grcon_mascot_controller.js"');
const runnerIndex = index.indexOf('src="grcon_mascot_runner.js"');
assert.ok(controllerIndex >= 0 && runnerIndex > controllerIndex);
console.log("grcon_mascot_runner: OK — wrapper legado sem segunda instância; corrida pertence ao runtime central.");
