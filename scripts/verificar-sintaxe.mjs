#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const ignored = new Set([".git", "node_modules"]);
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (/\.(?:m?js)$/.test(entry.name)) files.push(target);
  }
}

walk(root);
const failures = [];
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) failures.push(`${path.relative(root, file)}\n${result.stderr.trim()}`);
}

if (failures.length) {
  console.error(`Falha de sintaxe em ${failures.length} arquivo(s):\n${failures.join("\n\n")}`);
  process.exit(1);
}
console.log(`OK — ${files.length} arquivos JavaScript verificados.`);
