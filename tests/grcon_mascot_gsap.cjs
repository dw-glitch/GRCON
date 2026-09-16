const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const read = (file, encoding = "utf8") => fs.readFileSync(path.join(root, file), encoding);
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function decodeRgbaPng(bytes) {
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG", "asset deve ser PNG");
  const idat = [];
  let width = 0;
  let height = 0;
  let offset = 8;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8);
      assert.equal(data[9], 6);
      assert.equal(data[12], 0);
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += length + 12;
  }
  const packed = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rgba = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const estimate = a + b - c;
    const da = Math.abs(estimate - a);
    const db = Math.abs(estimate - b);
    const dc = Math.abs(estimate - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const packedStart = y * (stride + 1);
    const filter = packed[packedStart];
    for (let x = 0; x < stride; x += 1) {
      const raw = packed[packedStart + 1 + x];
      const destination = y * stride + x;
      const left = x >= 4 ? rgba[destination - 4] : 0;
      const up = y > 0 ? rgba[destination - stride] : 0;
      const upLeft = y > 0 && x >= 4 ? rgba[destination - stride - 4] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? up
            : filter === 3 ? Math.floor((left + up) / 2)
              : filter === 4 ? paeth(left, up, upLeft)
                : NaN;
      assert.ok(Number.isFinite(predictor), `filtro PNG inválido: ${filter}`);
      rgba[destination] = (raw + predictor) & 255;
    }
  }
  return { width, height, rgba };
}

const controller = read("grcon_mascot_controller.js");
const index = read("index.html");
const sw = read("sw.js");
const app = read("app.js");
const dashboard = read("sigem_pw_dashboard_app.js");
const conference = read("posting_conference_app.js");
const manifest = JSON.parse(read("vendor-manifest.json"));
const fixture = read("tests/fixtures/grcon-mascot-gsap.html");
const browser = read("scripts/validar-mascote-gsap-browser.cjs");
const sprite = read("grcon-mascot-sprite.png", null);
const official = decodeRgbaPng(read("assets/mascot/layers/grcon-mascot-official-default.png", null));
const layers = ["body", "head", "right-arm"].map((name) => decodeRgbaPng(read(`assets/mascot/layers/grcon-mascot-${name}.png`, null)));

assert.equal(sprite.readUInt32BE(16), 1254);
assert.equal(sprite.readUInt32BE(20), 1254);
assert.equal(hash(sprite), "cae28d23b527eb36359d9bada0bb8701f72232853875741fd0717f3256f73bc5", "PNG HD oficial não pode mudar");
assert.equal(hash(read("assets/mascot/layers/grcon-mascot-official-default.png", null)), "c48c9f040bca94cfef8df010de16e819e030fd38082f5c4afa3ad9b4d23f7f2b");
for (const layer of layers) {
  assert.equal(layer.width, official.width);
  assert.equal(layer.height, official.height);
}
const recomposed = Buffer.alloc(official.rgba.length);
for (let pixel = 0; pixel < official.rgba.length; pixel += 4) {
  const source = [...layers].reverse().find((layer) => layer.rgba[pixel + 3] > 0);
  if (source) source.rgba.copy(recomposed, pixel, pixel, pixel + 4);
}
assert.deepEqual(recomposed, official.rgba, "camadas precisam recompor exatamente o frame oficial");

const requiredStates = [
  "idle", "welcome", "hover", "analyzing", "searching-files", "checking-document",
  "confused", "success", "warning", "error", "uploading", "generating-grdt",
  "checking-ld", "sigem-pw-analysis", "loading",
];
for (const state of requiredStates) assert.ok(controller.includes(`"${state}"`), `estado ${state} ausente`);
assert.match(controller, /const gsap = root\.gsap/);
assert.match(controller, /gsap\.context\(/);
assert.match(controller, /record\.context\?\.revert\(\)/);
assert.match(controller, /record\.timeline\?\.kill\(\)/);
assert.match(controller, /pagehide/);
assert.match(controller, /visibilitychange/);
assert.match(controller, /prefers-reduced-motion: reduce/);
assert.match(controller, /official-png-static-fallback/);
assert.match(controller, /grcon-mascot-sprite/);
assert.match(controller, /assets\/mascot\/layers\/grcon-mascot-body\.png/);
assert.match(controller, /searchingTimeline/);
assert.match(controller, /repeat: -1/);
assert.match(controller, /SIGEM/);
assert.match(controller, /ProjectWise|PW/);
assert.match(controller, /root\.GrconMascot = Object\.freeze/);
assert.match(controller, /play,/);
assert.match(controller, /stop,/);
assert.match(controller, /reset:/);
assert.match(controller, /diagnostics/);
assert.doesNotMatch(controller, /https?:\/\//, "controlador não pode buscar recursos externos");
assert.doesNotMatch(controller, /steps\s*\(|sprite-sheet|frame[-_ ]?by[-_ ]?frame/i, "não pode haver animação quadro a quadro");

const gsapEntry = manifest.libraries.find((entry) => entry.file === "vendor/gsap/gsap.min.js");
assert.ok(gsapEntry, "GSAP local precisa constar no manifesto");
assert.equal(gsapEntry.version, "3.13.0");
assert.equal(hash(read(gsapEntry.file, null)), gsapEntry.sha256);

const headerIndex = index.indexOf('src="grcon_mascot_header.js"');
const gsapIndex = index.indexOf('src="vendor/gsap/gsap.min.js"');
const controllerIndex = index.indexOf('src="grcon_mascot_controller.js"');
const appIndex = index.indexOf('src="app.js"');
assert.ok(headerIndex >= 0 && headerIndex < gsapIndex && gsapIndex < controllerIndex && controllerIndex < appIndex);
assert.doesNotMatch(index, /vendor\/rive|grcon_mascot_rive|\.riv["']/i);
assert.doesNotMatch(sw, /vendor\/rive|grcon_mascot_rive|grcon-mascot\.riv/i);
for (const asset of [
  "vendor/gsap/gsap.min.js", "grcon_mascot_controller.js",
  "assets/mascot/layers/grcon-mascot-official-default.png",
  "assets/mascot/layers/grcon-mascot-body.png",
  "assets/mascot/layers/grcon-mascot-head.png",
  "assets/mascot/layers/grcon-mascot-right-arm.png",
]) assert.ok(sw.includes(`"${asset}"`), `${asset} precisa funcionar offline`);

assert.match(app, /grcon:notification/);
assert.match(app, /grcon:processing-state/);
assert.match(dashboard, /grcon:mascot-operation/);
assert.match(dashboard, /state: "sigem-pw-analysis"/);
assert.match(conference, /grcon:mascot-operation/);
assert.match(conference, /state: "checking-document"/);
assert.match(fixture, /vendor\/gsap\/gsap\.min\.js/);
assert.match(fixture, /grcon_mascot_controller\.js/);
assert.match(browser, /searching-files/);
assert.match(browser, /fallback/);
assert.match(browser, /timelines/);

console.log("grcon_mascot_gsap: OK — PNG oficial idêntico, GSAP local, estados, lifecycle e fallback validados.");
