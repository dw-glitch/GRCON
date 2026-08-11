#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "vendor-manifest.json"), "utf8"));
const failures = [];

for (const library of manifest.libraries || []) {
  const file = path.join(root, library.file);
  if (!fs.existsSync(file)) {
    failures.push(`${library.file}: ausente`);
    continue;
  }
  const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (hash !== library.sha256) failures.push(`${library.file}: hash mudou; revise a origem e atualize o manifesto conscientemente`);
  else console.log(`✓ ${library.name} ${library.version} — SHA-256 conferido`);
}

if (failures.length) {
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("OK — dependências vendorizadas conferidas.");
