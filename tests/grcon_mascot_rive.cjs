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
      assert.equal(data[8], 8, "PNG deve usar 8 bits");
      assert.equal(data[9], 6, "PNG deve ser RGBA");
      assert.equal(data[12], 0, "PNG não deve ser entrelaçado");
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") break;
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

const mascotHeader = read("grcon_mascot_header.js");
const greeting = read("grcon_mascot_greeting.js");
const controller = read("grcon_mascot_rive.js");
const rml = read("assets/mascot/rive/scene.rml");
const index = read("index.html");
const sw = read("sw.js");
const vercel = read("vercel.json");
const workflow = read(".github/workflows/rive-authoring.yml");
const browserSmoke = read("scripts/validar-mascote-rive-browser.cjs");
const inspectCheck = read("scripts/verificar-mascote-rive-inspect.cjs");
const browserFixture = read("tests/fixtures/grcon-mascot-rive.html");
const sprite = read("grcon-mascot-sprite.png", null);
const riv = read("assets/mascot/rive/build/grcon-mascot.riv", null);
const official = decodeRgbaPng(read("assets/mascot/rive/source/grcon-mascot-official-default.png", null));
const layers = ["body", "head", "right-arm"].map((name) => decodeRgbaPng(read(`assets/mascot/rive/source/grcon-mascot-${name}.png`, null)));

assert.equal(sprite.readUInt32BE(16), 1254, "sprite oficial deve manter 1254 px de largura");
assert.equal(sprite.readUInt32BE(20), 1254, "sprite oficial deve manter 1254 px de altura");
assert.equal(hash(sprite), "cae28d23b527eb36359d9bada0bb8701f72232853875741fd0717f3256f73bc5", "o PNG HD oficial não pode ser alterado");
assert.equal(hash(read("assets/mascot/rive/source/grcon-mascot-official-default.png", null)), "c48c9f040bca94cfef8df010de16e819e030fd38082f5c4afa3ad9b4d23f7f2b", "o frame raster deve ser o recorte oficial");
assert.equal(official.width, 314);
assert.equal(official.height, 314);
for (const layer of layers) {
  assert.equal(layer.width, official.width);
  assert.equal(layer.height, official.height);
}
const recomposed = Buffer.alloc(official.rgba.length);
for (let pixel = 0; pixel < official.rgba.length; pixel += 4) {
  const source = [...layers].reverse().find((layer) => layer.rgba[pixel + 3] > 0);
  if (source) source.rgba.copy(recomposed, pixel, pixel, pixel + 4);
}
assert.deepEqual(recomposed, official.rgba, "as camadas Rive devem recompor o PNG oficial sem diferença de pixels");

assert.ok(riv.length > 200000, "o .riv deve conter as imagens raster incorporadas");
assert.match(rml, /<Artboard[^>]+name="GRCON Mascot"/);
assert.match(rml, /<StateMachine[^>]+name="GRCON Mascot State"/);
assert.match(rml, /<StateMachineNumber value="0" name="state"/);
for (const state of ["idle", "hover", "hello", "processing", "analyzing", "success", "warning"]) {
  assert.match(rml, new RegExp(`<AnimationState[^>]+stateName="${state}"`), `estado ${state} deve existir`);
  assert.match(rml, new RegExp(`<LinearAnimation[^>]+name="${state}"`), `animação interpolada ${state} deve existir`);
}
assert.equal((rml.match(/<KeyFrameDouble /g) || []).length, (rml.match(/interpolationType="linear"/g) || []).length, "todo keyframe deve usar interpolação linear fluida");
assert.doesNotMatch(rml, /interpolationType="hold"/, "animação não pode usar saltos entre quadros");
assert.equal((rml.match(/<ImageAsset /g) || []).length, 3, "somente os três recortes oficiais devem ser incorporados");
for (const asset of ["grcon-mascot-body.png", "grcon-mascot-head.png", "grcon-mascot-right-arm.png"]) assert.ok(rml.includes(asset));
assert.doesNotMatch(rml, /<(?:Shape|Path|Ellipse|Rectangle|Star|Polygon)\b/, "o mascote não pode ser redesenhado em vetor");
assert.doesNotMatch(rml, /sprite|steps\s*\(|frame[-_ ]?by[-_ ]?frame/i, "a animação não pode ser quadro a quadro");

assert.match(controller, /const HOST_SELECTOR = "\.grcon-brand-mascot"/);
assert.doesNotMatch(controller, /HOST_SELECTOR\s*=.*grcon-mascot-context/);
assert.match(controller, /instances: record \? 1 : 0/);
assert.match(controller, /onAdvance: function/);
assert.match(controller, /REQUIRED_ADVANCED_FRAMES = 2/);
assert.match(controller, /data-grcon-rive-ready/);
assert.match(controller, /official-png-fallback-v1/);
assert.match(controller, /enableRiveAssetCDN: false/);
assert.match(controller, /player\?\.cleanup\?\.\(\)/);
assert.match(controller, /canvas\.addEventListener\("webglcontextlost", current\.onContextLost\)/);
assert.match(controller, /canvas\.addEventListener\("contextlost", current\.onContextLost\)/);
assert.match(controller, /canvas\.removeEventListener\("webglcontextlost", current\.onContextLost\)/);
assert.match(controller, /canvas\.removeEventListener\("contextlost", current\.onContextLost\)/);
assert.match(controller, /fail\(`contexto gráfico perdido/);
assert.match(controller, /ACTIVATION_TIMEOUT_MS = 30000/);
assert.doesNotMatch(controller, /getImageData|canvasHasVisibleFrame/, "a ativação não pode depender de leitura de pixels WebGL");
assert.match(controller, /if \(!failureReported/);
assert.match(controller, /root\.GrconMascot = Object\.freeze/);
for (const [state, value] of Object.entries({ idle: 0, hover: 1, hello: 2, processing: 3, analyzing: 4, success: 5, warning: 6 })) {
  assert.match(controller, new RegExp(`${state}: ${value}`));
}
assert.doesNotMatch(controller, /https?:\/\//, "runtime e assets devem ser locais");

assert.match(index, /src="vendor\/rive\/rive\.js"/);
assert.match(index, /src="grcon_mascot_rive\.js"/);
assert.ok(index.indexOf('src="grcon_mascot_greeting.js"') < index.indexOf('src="vendor/rive/rive.js"'));
assert.ok(index.indexOf('src="vendor/rive/rive.js"') < index.indexOf('src="grcon_mascot_rive.js"'));
assert.ok(index.indexOf('src="grcon_mascot_rive.js"') < index.indexOf('src="app.js"'));
for (const csp of [index, vercel]) assert.match(csp, /script-src 'self' 'wasm-unsafe-eval' blob:/);
for (const asset of [
  "grcon-mascot-sprite.png",
  "grcon_mascot_rive.js",
  "vendor/rive/rive.js",
  "vendor/rive/rive.wasm",
  "vendor/rive/rive_fallback.wasm",
  "assets/mascot/rive/build/grcon-mascot.riv",
]) assert.ok(sw.includes(`"${asset}"`), `${asset} deve funcionar offline`);

assert.match(workflow, /Rive CLI oficial/);
assert.match(workflow, /assets\/mascot\/rive --verify/);
assert.match(workflow, /validar-mascote-rive-browser\.cjs/);
assert.match(workflow, /verificar-mascote-rive-inspect\.cjs/);
assert.match(workflow, /git diff --exit-code -- assets\/mascot\/rive\/build\/grcon-mascot\.riv/);
assert.match(inspectCheck, /value\.type === "KeyFrameDouble"/);
assert.match(inspectCheck, /interpolationType !== "linear"/);
assert.match(browserSmoke, /tests\/fixtures\/grcon-mascot-rive\.html/);
assert.match(browserFixture, /src="vendor\/rive\/rive\.js"/);
assert.match(browserFixture, /src="grcon_mascot_rive\.js"/);
for (const scenario of ["idle", "hover", "processing", "fallback"]) assert.match(browserSmoke, new RegExp(scenario));
assert.match(browserSmoke, /assert\.equal\(diagnostics\.instances, 1/);
assert.match(browserSmoke, /spriteVisible/);
assert.match(browserSmoke, /fallbackErrors/);

assert.match(mascotHeader, /const POSES=Object\.freeze\(\{/);
assert.match(greeting, /official-png-css-v1/);
assert.doesNotMatch(greeting, /run-sprite|frame-run|step-end|steps\s*\(/);

console.log("grcon_mascot_rive: OK — mesmo PNG oficial, Rive raster interpolado, instância única e fallback validados.");
