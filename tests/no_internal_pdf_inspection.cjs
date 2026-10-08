"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const runtimeTargets = [
  "posting_conference_app.js",
  "grcon_module_loader.js",
  "vite.config.ts",
  "package.json",
  "sw.js",
  "src/react/cover-document",
];

const forbidden = [
  "getTextContent(",
  "GrconPdfDocument.inspect",
  "GrconPdfConcordanceUi",
  "Conferência interna do PDF",
  "Extraindo texto localmente",
  "n381_concordance.js",
  "react-dist/pdf-document-app.js",
  "pdfjs-dist",
];

function filesUnder(target) {
  const absolute = path.join(root, target);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return [absolute];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(target, entry.name);
    return entry.isDirectory() ? filesUnder(rel) : [path.join(root, rel)];
  });
}

for (const removed of [
  "src/react/pdf-document",
  "n381_concordance.js",
  "scripts/copy-pdf-worker.mjs",
  "scripts/validar-n381-browser.cjs",
  "tests/n381_concordance.cjs",
  "src/react/cover-document/services/coverConcordanceService.ts",
]) {
  assert.equal(fs.existsSync(path.join(root, removed)), false, `Infraestrutura de inspeção interna não pode existir: ${removed}`);
}

for (const target of runtimeTargets) {
  for (const file of filesUnder(target)) {
    if (!/\.(?:js|cjs|mjs|ts|tsx|json)$/.test(file)) continue;
    const source = fs.readFileSync(file, "utf8");
    for (const marker of forbidden) {
      assert.equal(source.includes(marker), false, `${path.relative(root, file)} reintroduziu marcador proibido: ${marker}`);
    }
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert.equal(Boolean(pkg.dependencies && pkg.dependencies["pdfjs-dist"]), false, "pdfjs-dist não deve ser dependência do runtime");
assert.ok(pkg.dependencies?.react, "React deve permanecer");
assert.ok(fs.existsSync(path.join(root, "pdf_merge_core.js")), "Combinar PDFs deve permanecer");
assert.ok(fs.existsSync(path.join(root, "src/react/cover-document")), "Adicionar Capa deve permanecer");
assert.ok(fs.existsSync(path.join(root, "n1710_parser.js")), "Parser N-1710/código deve permanecer");

console.log("OK: inspeção interna de PDF removida; ferramentas estruturais e validação de código preservadas.");
