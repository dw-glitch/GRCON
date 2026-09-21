const assert = require("assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.join(__dirname, "..");
const sprite = fs.readFileSync(path.join(root, "grcon-mascot-sprite.png"));

assert.deepStrictEqual([...sprite.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "sprite deve ser um PNG válido");
assert.ok(sprite.readUInt32BE(16) >= 1024, "sprite deve ter largura HD");
assert.ok(sprite.readUInt32BE(20) >= 1024, "sprite deve ter altura HD");

const idat = [];
for (let offset = 8; offset + 12 <= sprite.length;) {
  const length = sprite.readUInt32BE(offset);
  const type = sprite.toString("ascii", offset + 4, offset + 8);
  if (type === "IDAT") idat.push(sprite.subarray(offset + 8, offset + 8 + length));
  offset += 12 + length;
  if (type === "IEND") break;
}
assert.ok(idat.length, "sprite deve possuir conteúdo de imagem");
assert.ok(zlib.inflateSync(Buffer.concat(idat)).length > 1_000_000, "conteúdo PNG HD deve estar íntegro");

const loader = fs.readFileSync(path.join(root, "grcon_mascot_asset_fix.js"), "utf8");
assert.match(loader, /grcon-mascot-sprite\.png\?v=4\.0\.0-hd/);
assert.match(loader, /MIN_HD_SIDE\s*=\s*1024/);
assert.match(loader, /naturalWidth\s*<\s*MIN_HD_SIDE/);
assert.match(loader, /image-rendering:auto/);
assert.doesNotMatch(loader, /assets\/mascot\/grcon-mascot-sprite\.png|grcon-mascot\.png/);

const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
assert.match(sw, /grcon-mascot-sprite\.png/);
assert.match(sw, /mascot-pilot1/);
assert.doesNotMatch(sw, /assets\/mascot\/grcon-mascot-default\.png/);

console.log("grcon_mascot_hd: OK — sprite 1254×1254 íntegro, carregamento HD e renovação de cache validados.");
