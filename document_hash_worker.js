"use strict";

const K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);

function rotr(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}

class Sha256 {
  constructor() {
    this.state = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    this.buffer = new Uint8Array(64);
    this.bufferLength = 0;
    this.bytesHashed = 0;
    this.finished = false;
    this.words = new Uint32Array(64);
  }

  update(data) {
    if (this.finished) throw new Error("Hash já finalizado.");
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    this.bytesHashed += bytes.length;
    let position = 0;

    if (this.bufferLength) {
      while (this.bufferLength < 64 && position < bytes.length) this.buffer[this.bufferLength++] = bytes[position++];
      if (this.bufferLength === 64) {
        this.compress(this.buffer);
        this.bufferLength = 0;
      }
    }

    while (position + 64 <= bytes.length) {
      this.compress(bytes.subarray(position, position + 64));
      position += 64;
    }
    while (position < bytes.length) this.buffer[this.bufferLength++] = bytes[position++];
    return this;
  }

  compress(chunk) {
    const w = this.words;
    for (let index = 0; index < 16; index += 1) {
      const offset = index * 4;
      w[index] = ((chunk[offset] << 24) | (chunk[offset + 1] << 16) | (chunk[offset + 2] << 8) | chunk[offset + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const a = w[index - 15];
      const b = w[index - 2];
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[index] = (w[index - 16] + s0 + w[index - 7] + s1) >>> 0;
    }

    let a = this.state[0], b = this.state[1], c = this.state[2], d = this.state[3];
    let e = this.state[4], f = this.state[5], g = this.state[6], h = this.state[7];
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + s1 + ch + K[index] + w[index]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    this.state[0] = (this.state[0] + a) >>> 0;
    this.state[1] = (this.state[1] + b) >>> 0;
    this.state[2] = (this.state[2] + c) >>> 0;
    this.state[3] = (this.state[3] + d) >>> 0;
    this.state[4] = (this.state[4] + e) >>> 0;
    this.state[5] = (this.state[5] + f) >>> 0;
    this.state[6] = (this.state[6] + g) >>> 0;
    this.state[7] = (this.state[7] + h) >>> 0;
  }

  digestHex() {
    if (!this.finished) {
      const bytesHashed = this.bytesHashed;
      this.buffer[this.bufferLength++] = 0x80;
      if (this.bufferLength > 56) {
        this.buffer.fill(0, this.bufferLength, 64);
        this.compress(this.buffer);
        this.bufferLength = 0;
      }
      this.buffer.fill(0, this.bufferLength, 56);
      const bitHigh = Math.floor(bytesHashed / 0x20000000);
      const bitLow = (bytesHashed << 3) >>> 0;
      this.buffer[56] = (bitHigh >>> 24) & 0xff;
      this.buffer[57] = (bitHigh >>> 16) & 0xff;
      this.buffer[58] = (bitHigh >>> 8) & 0xff;
      this.buffer[59] = bitHigh & 0xff;
      this.buffer[60] = (bitLow >>> 24) & 0xff;
      this.buffer[61] = (bitLow >>> 16) & 0xff;
      this.buffer[62] = (bitLow >>> 8) & 0xff;
      this.buffer[63] = bitLow & 0xff;
      this.compress(this.buffer);
      this.finished = true;
    }
    return [...this.state].map((value) => value.toString(16).padStart(8, "0")).join("");
  }
}

self.addEventListener("message", async (event) => {
  const message = event.data || {};
  if (message.type !== "hash" || !message.file) return;
  const file = message.file;
  const chunkSize = Math.max(1024 * 1024, Math.min(16 * 1024 * 1024, Number(message.chunkSize) || 4 * 1024 * 1024));
  const sha = new Sha256();
  try {
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const bytes = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + chunkSize)).arrayBuffer());
      sha.update(bytes);
      self.postMessage({ type: "progress", id: message.id, loaded: Math.min(file.size, offset + bytes.length), total: file.size });
    }
    self.postMessage({ type: "done", id: message.id, sha256: sha.digestHex(), size: file.size });
  } catch (error) {
    self.postMessage({ type: "error", id: message.id, message: error && error.message || "Falha ao calcular SHA-256." });
  }
});
