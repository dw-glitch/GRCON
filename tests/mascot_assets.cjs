const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');

function inspectAvifTransport(label, rels) {
  const files = rels.map((rel) => path.join(ROOT, rel));
  if (!files.every((f) => fs.existsSync(f))) return;
  const text = files.map((f) => fs.readFileSync(f, 'utf8').trim()).join('');
  let buf;
  try { buf = Buffer.from(text, 'base64'); } catch (_) { return; }
  const boxes = [];
  let off = 0, complete = true;
  while (off + 8 <= buf.length) {
    let size = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    let header = 8;
    if (size === 1 && off + 16 <= buf.length) {
      const big = buf.readBigUInt64BE(off + 8);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) break;
      size = Number(big); header = 16;
    } else if (size === 0) size = buf.length - off;
    if (size < header || off + size > buf.length) {
      boxes.push(`${type}:declared=${size}:available=${buf.length - off}`);
      complete = false; break;
    }
    boxes.push(`${type}:${size}`);
    off += size;
  }
  const ispe = [];
  for (let i = 0; i + 20 <= buf.length; i++) {
    if (buf.toString('ascii', i + 4, i + 8) === 'ispe') {
      ispe.push(`${buf.readUInt32BE(i + 12)}x${buf.readUInt32BE(i + 16)}`);
    }
  }
  console.log(`[mascot-transport] ${label}: bytes=${buf.length}; complete=${complete && off === buf.length}; boxes=${boxes.join(',')}; ispe=${ispe.join(',')}`);
}
inspectAvifTransport('v4-sprite', ['.mascot_hd_tmp/v4-sprite.000','.mascot_hd_tmp/v4-sprite.001']);
inspectAvifTransport('sprite-parts', ['.mascot_hd_tmp/sprite.part000','.mascot_hd_tmp/sprite.part001']);

function readPng(rel) {
  const file = path.join(ROOT, rel);
  const buf = fs.readFileSync(file);
  assert.deepStrictEqual([...buf.subarray(0, 8)], [137,80,78,71,13,10,26,10], `${rel}: assinatura PNG inválida`);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];
  return { file, buf, width, height, bitDepth, colorType, interlace };
}

function chunks(buf) {
  const out = [];
  let off = 8;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    out.push({ type, data });
    off += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}

function decodeRgba(png) {
  assert.strictEqual(png.bitDepth, 8, 'sprite deve usar 8 bits por canal');
  assert.strictEqual(png.colorType, 6, 'sprite deve ser RGBA (PNG color type 6)');
  assert.strictEqual(png.interlace, 0, 'sprite deve ser PNG não entrelaçado');
  const idat = Buffer.concat(chunks(png.buf).filter(c => c.type === 'IDAT').map(c => c.data));
  const raw = zlib.inflateSync(idat);
  const bpp = 4;
  const stride = png.width * bpp;
  assert.strictEqual(raw.length, (stride + 1) * png.height, 'tamanho descompactado inesperado');
  const pixels = Buffer.alloc(stride * png.height);
  let src = 0;
  for (let y = 0; y < png.height; y++) {
    const filter = raw[src++];
    const rowOff = y * stride;
    for (let x = 0; x < stride; x++) {
      const val = raw[src++];
      const a = x >= bpp ? pixels[rowOff + x - bpp] : 0;
      const b = y > 0 ? pixels[rowOff - stride + x] : 0;
      const c = (y > 0 && x >= bpp) ? pixels[rowOff - stride + x - bpp] : 0;
      let recon;
      if (filter === 0) recon = val;
      else if (filter === 1) recon = (val + a) & 255;
      else if (filter === 2) recon = (val + b) & 255;
      else if (filter === 3) recon = (val + Math.floor((a + b) / 2)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
        recon = (val + pr) & 255;
      } else throw new Error(`Filtro PNG não suportado: ${filter}`);
      pixels[rowOff + x] = recon;
    }
  }
  return pixels;
}

const sprite = readPng('assets/mascot/grcon-mascot-sprite.png');
const fallback = readPng('assets/mascot/grcon-mascot-default.png');
for (const [name, png] of [['sprite', sprite], ['fallback', fallback]]) {
  assert.ok(png.width >= 2048 && png.height >= 2048, `${name} deve ter pelo menos 2048×2048; encontrado ${png.width}×${png.height}`);
  assert.strictEqual(png.width, png.height, `${name} deve ser quadrado`);
  assert.strictEqual(png.width % 4, 0, `${name} deve ser divisível em grid 4×4`);
  assert.strictEqual(png.colorType, 6, `${name} deve ser RGBA`);
}

const pixels = decodeRgba(sprite);
const cellW = sprite.width / 4;
const cellH = sprite.height / 4;
function alphaCount(cx, cy) {
  let count = 0;
  for (let y = cy * cellH; y < (cy + 1) * cellH; y++) {
    for (let x = cx * cellW; x < (cx + 1) * cellW; x++) {
      if (pixels[(y * sprite.width + x) * 4 + 3] !== 0) count++;
    }
  }
  return count;
}
for (let i = 0; i < 15; i++) {
  const cx = i % 4, cy = Math.floor(i / 4);
  assert.ok(alphaCount(cx, cy) > 100, `célula ${i + 1} deveria conter a pose`);
}
assert.strictEqual(alphaCount(3, 3), 0, '16ª célula deve permanecer totalmente transparente');

const header = fs.readFileSync(path.join(ROOT, 'grcon_mascot_header.js'), 'utf8');
const loader = fs.readFileSync(path.join(ROOT, 'grcon_service_worker.js'), 'utf8');
assert.ok(!header.includes('data:image/png;base64'), 'Base64 legado não pode permanecer no runtime do mascote');
assert.ok(header.includes('assets/mascot/grcon-mascot-sprite.png?v=4.0.0'));
assert.ok(header.includes('assets/mascot/grcon-mascot-default.png?v=4.0.0'));
assert.ok(!loader.includes('grcon_mascot_asset_fix.js'), 'loader não deve depender do patch legado');

console.log(`Mascote HD validado: sprite ${sprite.width}×${sprite.height} RGBA; fallback ${fallback.width}×${fallback.height} RGBA; grid 4×4 com 15 poses + célula 16 transparente.`);
