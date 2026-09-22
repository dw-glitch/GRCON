const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const html = read("index.html");
const loader = read("grcon_module_loader.js");
const sw = read("sw.js");
const vite = read("vite.config.ts");
const packageJson = read("package.json");
const app = read("src/react/cover-document/CoverDocumentApp.tsx");
const hook = read("src/react/cover-document/hooks/useCoverDocument.ts");
const ld = read("src/react/cover-document/services/ldDocumentService.ts");
const service = read("src/react/cover-document/services/coverDocumentService.ts");
const validation = read("src/react/cover-document/services/coverValidationService.ts");
const css = read("cover-document.css");

assert.match(html, /data-grcon-view="cover-document"/);
assert.match(html, /id="cover-document-module"/);
assert.match(html, /id="grcon-cover-document-root"/);
assert.match(html, /cover-document\.css/);
assert.match(loader, /"cover-document"/);
assert.match(loader, /react-dist\/cover-document-app\.js/);
assert.match(loader, /GrconCoverDocumentUi/);
assert.match(sw, /cover-document\.css/);
assert.match(sw, /capa-documento\.docx\.b64\.1/);
assert.match(sw, /capa-documento-base\.pdf\.b64\.1/);
assert.match(vite, /src\/react\/cover-document\/index\.tsx/);
assert.match(vite, /cover-document-app\.js/);
assert.match(packageJson, /vite build --mode cover-document/);
assert.match(packageJson, /tests\/cover_document_react\.cjs/);

assert.match(app, /Adicionar Capa/);
assert.match(app, /Processamento local/);
assert.match(hook, /loadLdRecords/);
assert.match(hook, /uniqueExactCandidate/);
assert.match(hook, /createCoverPreview/);
assert.match(hook, /generate\("pdf"\)/);
assert.match(ld, /TriagemCore\.parseWorkbook/);
assert.match(ld, /TAXONOMIA/);
assert.match(ld, /EAP/);
assert.match(ld, /scoreTitle/);
assert.match(service, /copyPages/);
assert.match(service, /w:altChunk/);
assert.match(service, /rIdGrconSourceDocument/);
assert.match(service, /NÃO INFORMADO NA LD/);
assert.match(validation, /validateDocumentCode/);
assert.match(validation, /Taxonomia não encontrada/);
assert.match(css, /@media\(max-width:980px\)/);

const reactSource = [app, hook, ld, service, validation].join("\n");
assert.doesNotMatch(reactSource, /innerHTML\s*=|insertAdjacentHTML|document\.write/);
assert.doesNotMatch(reactSource, /https?:\/\//, "A ferramenta não deve enviar documentos a serviços externos.");

for (const base of ["capa-documento.docx", "capa-documento-base.pdf"]) {
  const parts = [1, 2, 3].map((index) => read(`assets/templates/${base}.b64.${index}`).trim()).join("");
  const bytes = Buffer.from(parts, "base64");
  assert.ok(bytes.length > 30000, `${base} deve conter o template real, não um placeholder vazio.`);
  if (base.endsWith(".docx")) assert.equal(bytes.subarray(0, 2).toString("ascii"), "PK");
  else assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");
}

console.log("cover_document_react: ok");
