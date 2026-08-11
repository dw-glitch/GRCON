#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
const checks = [
  ["grcon_config.js", new RegExp(`APP_VERSION:\\s*["']${version.replaceAll(".", "\\.")}["']`)],
  ["app.js", new RegExp(`const APP_VERSION = ["']${version.replaceAll(".", "\\.")}["']`)],
  ["sw.js", new RegExp(`grcon-v${version.replaceAll(".", "\\.")}`)],
  ["index.html", new RegExp(`data-version=["']${version.replaceAll(".", "\\.")}["']`)],
  ["LEIA-ME_PUBLICACAO.txt", new RegExp(`GRCON ${version.replaceAll(".", "\\.")}`)],
];
const failures = checks
  .filter(([file, pattern]) => !pattern.test(fs.readFileSync(path.join(root, file), "utf8")))
  .map(([file]) => `${file} não declara a versão ${version}`);

if (failures.length) {
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`OK — versão ${version} consistente em ${checks.length} pontos de publicação.`);
