const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const app = read("document_vault_app.js");
const css = read("document-vault.css");
const sw = read("sw.js");

assert.match(app, /id="vault-dropzone"/);
assert.match(app, /aria-describedby="vault-dropzone-description"/);
assert.match(app, /id="vault-dropzone-description"/);
assert.match(app, /role="button"/);
assert.match(app, /vault-dropzone-icon/);
assert.match(app, /event\.key === "Enter" \|\| event\.key === " "/);
assert.match(app, /vault-storage-used/);
assert.match(app, /vault-storage-objects/);
assert.match(app, /vault-storage-integrity/);
assert.match(app, /vault-storage-refresh/);
assert.match(app, /vault-export/);
assert.match(app, /vault-allocation/);

for (const rule of [
  ".document-vault-module .vault-dropzone:focus-visible",
  ".document-vault-module .vault-storage-card > div:first-child > strong",
  ".document-vault-module .vault-allocation.yes",
  ".document-vault-module .vault-allocation.no",
  ".document-vault-module .vault-allocation.unknown",
]) assert.ok(css.includes(rule), "CSS ausente: " + rule);
for (const token of ["--brand-strong", "--success-700", "--danger-700", "--warning-800", "--text-2", "--surface-3"]) {
  assert.ok(css.includes(token), "Token corporativo ausente: " + token);
}
assert.match(css, /prefers-reduced-motion: reduce/);
assert.match(sw, /document_vault_app\.js/);
assert.match(sw, /document-vault\.css/);
console.log("vault_visual_parity: ok — acessibilidade, tokens e componentes originais");
