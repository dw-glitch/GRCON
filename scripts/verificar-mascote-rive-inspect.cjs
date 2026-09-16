const assert = require("node:assert/strict");
const fs = require("node:fs");

const inspectPath = process.argv[2] || "assets/mascot/rive/build/inspect.json";
const inspect = JSON.parse(fs.readFileSync(inspectPath, "utf8"));
const keyframes = [];

function visit(value) {
  if (!value || typeof value !== "object") return;
  if (value.type === "KeyFrameDouble") keyframes.push(value);
  Object.values(value).forEach(visit);
}

visit(inspect);
assert.ok(keyframes.length > 0, "o relatório Rive deve conter keyframes numéricos");
const invalid = keyframes.filter((keyframe) => keyframe.enums?.interpolationType !== "linear");
assert.equal(invalid.length, 0, `${invalid.length} keyframe(s) sem interpolação linear`);
console.log(`Rive inspect: ${keyframes.length} keyframes com interpolação linear.`);
