#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const directory = path.join(root, "assets", "mascot", "video");
const files = fs.readdirSync(directory).filter((name) => name.endsWith("-alpha.webm")).sort();

assert.ok(files.length >= 8, "a coleção do mascote precisa manter os vídeos transparentes esperados");

for (const file of files) {
  const fullPath = path.join(directory, file);
  const result = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-c:v", "libvpx-vp9", "-i", fullPath,
    "-vf", "select='eq(n,8)+eq(n,48)+eq(n,88)',format=rgba,alphaextract,signalstats,metadata=print:file=-",
    "-vsync", "0", "-f", "null", "-",
  ], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, `${file}: ffmpeg precisa decodificar o VP9 com alfa`);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const averages = [...output.matchAll(/lavfi\.signalstats\.YAVG=([0-9.]+)/g)].map((match) => Number(match[1]));
  const minimums = [...output.matchAll(/lavfi\.signalstats\.YMIN=([0-9.]+)/g)].map((match) => Number(match[1]));
  const maximums = [...output.matchAll(/lavfi\.signalstats\.YMAX=([0-9.]+)/g)].map((match) => Number(match[1]));
  assert.ok(averages.length >= 2, `${file}: faltam quadros de amostragem do canal alfa`);
  assert.ok(Math.max(...averages) < 110, `${file}: fundo continua opaco (alfa médio ${Math.max(...averages).toFixed(2)}/255)`);
  assert.ok(Math.min(...minimums) === 0, `${file}: precisa haver área totalmente transparente`);
  assert.ok(Math.max(...maximums) >= 250, `${file}: o robô precisa permanecer opaco`);
  console.log(`${file}: alfa real OK (${averages.map((value) => value.toFixed(1)).join(", ")})`);
}

