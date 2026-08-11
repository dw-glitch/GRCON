#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const failures = [];
const check = (file, source) => {
  if (/^(?:https?:|data:|blob:|#)/i.test(file)) return;
  const clean = file.split(/[?#]/)[0].replace(/^\.\//, "");
  if (clean && !fs.existsSync(path.join(root, clean))) failures.push(`${source} aponta para arquivo inexistente: ${file}`);
};

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const match of html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))(?:[?#][^"']*)?["']/gi)) check(match[1], "index.html");

const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const assetBlock = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
for (const match of (assetBlock && assetBlock[1] || "").matchAll(/["']([^"']+)["']/g)) check(match[1], "sw.js");

if (failures.length) {
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("OK — referências do HTML e do Service Worker existem no pacote.");
