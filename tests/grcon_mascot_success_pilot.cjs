const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file, encoding = "utf8") => fs.readFileSync(path.join(root, file), encoding);

const pilot = read("grcon_mascot_success_pilot.js");
const controller = read("grcon_mascot_controller_v4.js");
const asset = read("assets/mascot/video/grcon-mascot-success-alpha.webm", null);

assert.deepEqual([...asset.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3]);
assert.ok(asset.length > 100_000 && asset.length < 1_500_000);
assert.match(pilot, /delegado ao Mascot Runtime único/);
assert.match(pilot, /GrconMascot\?\.success/);
assert.match(pilot, /anchor \|\| config\.target/);
assert.doesNotMatch(pilot, /createElement|addEventListener|getBoundingClientRect/);
assert.match(controller, /grcon-mascot-success-alpha\.webm/);
assert.match(controller, /pendingSuccess/);
assert.match(controller, /warningUntil/);
console.log("grcon_mascot_success_pilot: OK — sucesso contextual delegado, sem overlay ou player paralelo.");
