"use strict";
/* Regressão estrutural da fase 2 — somente apresentação e sem regressão documental. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const css = read("grcon-version-c-phase2.css");
const versionC = read("grcon-version-c.css");
const cloudBuild = read("scripts/build-cloudflare-package.mjs");
const vault = read("document_vault_app.js");
const consultas = read("src/react/consultas/components/consultasComponents.tsx");
const stepper = read("grdt-stage-progress.js");
const pkg = JSON.parse(read("package.json"));

assert.match(html, /<link href="grcon-version-c-phase2\.css" rel="stylesheet"\/>/);
assert.ok(
  html.indexOf('href="grcon-version-c.css"') < html.indexOf('href="grcon-version-c-phase2.css"'),
  "Fase 2 deve sobrepor a Fase 1, não substituí-la."
);
assert.match(cloudBuild, /"\.html", "\.css", "\.js"/);
assert.match(pkg.scripts.test, /tests\/ux_version_c_phase2\.cjs/);
assert.match(versionC, /grid-template-columns: minmax\(206px, 218px\)/);
assert.match(stepper, /data-grdt-stage/);
assert.match(stepper, /aria-current/);
assert.match(html, /id="results-scroll"/);
assert.match(html, /id="results-table"/);
assert.match(html, /id="export-egrdt"/);
assert.match(html, /id="batch-egrdt"/);
assert.match(html, /id="egrdt-teams-ready"/);
assert.match(css, /#grdt-module \.grdt-stages-list/);
assert.match(css, /#results-section \.summary-bar/);
assert.match(css, /#results-section \.results-toolbar/);
assert.match(css, /#results-scroll/);
assert.match(css, /#results-table thead th/);
assert.match(css, /#results-section \.egrdt-teams-ready/);

assert.match(vault, /class="vault-browser-card"/);
assert.match(vault, /class="vault-storage-card"/);
assert.match(vault, /id="vault-storage-used"/);
assert.match(vault, /id="vault-allocation"/);
assert.match(vault, /class="vault-table-wrap vault-list-wrap"/);
assert.match(vault, /id="vault-export"/);
assert.match(vault, /id="vault-list-body"/);
assert.match(css, /#document-vault-module \.vault-storage-card/);
assert.match(css, /#document-vault-module \.vault-toolbar/);
assert.match(css, /#document-vault-module \.vault-list-wrap/);
assert.match(css, /#document-vault-module \.vault-row-actions button/);

assert.match(consultas, /className="requests-commandbar"/);
assert.match(consultas, /className="requests-filterbar"/);
assert.match(consultas, /className="requests-table-wrap"/);
assert.match(consultas, /className="requests-table"/);
assert.match(consultas, /className="requests-summary"/);
assert.match(css, /#requests-module \.requests-commandbar/);
assert.match(css, /#requests-module \.requests-summary/);
assert.match(css, /#requests-module \.requests-filterbar/);
assert.match(css, /#requests-module \.requests-table-wrap/);
assert.match(css, /#requests-module \.requests-table thead th/);
assert.match(css, /position: sticky/);
assert.match(css, /overflow: auto/);
assert.match(css, /prefers-reduced-motion: reduce/);
assert.doesNotMatch(css, /display\s*:\s*none\s*!important/);
assert.doesNotMatch(css, /pointer-events\s*:\s*none/);
assert.doesNotMatch(css, /content:\s*["'](?:[0-9]{3,}|Emiti|Postad)/i);
assert.doesNotMatch(css, /@import\s/i);

let depth = 0;
for (const char of css.replace(/\/\*[\s\S]*?\*\//g, "")) {
  if (char === "{") depth++;
  if (char === "}") depth--;
  assert.ok(depth >= 0, "CSS fechou uma chave sem abri-la.");
}
assert.equal(depth, 0, "CSS deve manter todas as chaves balanceadas.");
console.log("OK — Versão C fase 2: GRDT/Cofre/Consultas presentes, sem ocultar controles.");
