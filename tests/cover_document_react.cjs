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
assert.doesNotMatch(html, /data-grcon-view="cover"/);
assert.match(html, /id="cover-document-module"/);
assert.doesNotMatch(html, /id="cover-module"/);
assert.match(html, /id="grcon-cover-document-root"/);
assert.match(html, /cover-document\.css/);
assert.doesNotMatch(html, /cover-tool\.css/);

assert.match(loader, /"cover-document"/);
assert.match(loader, /react-dist\/cover-document-app\.js/);
assert.match(loader, /GrconCoverDocumentUi/);
assert.doesNotMatch(loader, /GrconCoverUi/);

assert.match(sw, /cover-document\.css/);
assert.match(sw, /CAPA_PAGE1_TEMPLATE\.docx\.b64\.001/);
assert.match(sw, /CAPA_PAGE1_BASE\.pdf\.b64\.001/);
assert.doesNotMatch(sw, /capa-documento\.docx\.b64/);
assert.doesNotMatch(sw, /capa-documento-base\.pdf\.b64\.[123]/);
assert.match(sw, /CAPA_PAGE1_BASE\.pdf\.b64\.005/);
assert.match(sw, /CAPA_PAGE1_TEMPLATE\.docx\.b64\.002/);

assert.match(vite, /src\/react\/cover-document\/index\.tsx/);
assert.match(vite, /cover-document-app\.js/);
assert.doesNotMatch(vite, /src\/react\/cover\/index\.tsx/);
assert.match(packageJson, /vite build --mode cover-document/);
assert.doesNotMatch(packageJson, /vite build --mode cover(?:\s|"|$)/);
assert.match(packageJson, /tests\/cover_document_react\.cjs/);
assert.doesNotMatch(packageJson, /tests\/cover_tool\.cjs/);

assert.match(app, /Adicionar Capa/);
assert.match(app, /Processamento local/);
assert.match(hook, /loadLdRecords/);
assert.match(hook, /uniqueExactCandidate/);
assert.match(hook, /createCoverPreview/);
assert.match(app, /cover\.generate\("pdf"\)/);
assert.match(ld, /TriagemCore\.parseWorkbook/);
assert.match(ld, /const TAXONOMY_HEADER = "TAXONOMIA"/);
assert.doesNotMatch(ld, /TAXONOMIA INTERNA|CODIGO DA TAXONOMIA|CODIGO TAXONOMIA|TAXONOMIA DOCUMENTAL/);
assert.match(ld, /EAP/);
assert.match(ld, /SEARCH_INDEX_CACHE/);
assert.match(ld, /GrconPerformance\.loadLd/);
assert.match(ld, /GrconLdMemory/);
assert.match(hook, /160/);
assert.match(loader, /"performance", "ld_memory\.js"/);

assert.match(service, /CAPA_PAGE1_TEMPLATE\.docx\.b64\.001/);
assert.match(service, /CAPA_PAGE1_BASE\.pdf\.b64\.005/);
assert.match(service, /copyPages/);
assert.match(service, /mergeCoverStyles/);
assert.match(service, /remapCoverRelationships/);
assert.match(service, /sectionBreak/);
assert.match(service, /NÃO INFORMADO NA LD/);
assert.match(service, /coverFieldValues/);
assert.match(service, /fields\.taxonomy/);
assert.match(service, /TEMPLATE_BYTES_CACHE/);
assert.match(service, /cache: "force-cache"/);
assert.doesNotMatch(service, /w:altChunk|aFChunk|rIdGrconSourceDocument/);
assert.doesNotMatch(validation, /altChunk/);
assert.match(validation, /validateDocumentCode/);
assert.match(validation, /coluna TAXONOMIA/);
assert.match(validation, /revisionInfo/);
assert.match(validation, /EGRDT_OPTIONS/);
assert.match(css, /@media\(max-width:980px\)/);

const reactSource = [app, hook, ld, service, validation].join("\n");
assert.doesNotMatch(reactSource, /innerHTML\s*=|insertAdjacentHTML|document\.write/);
assert.doesNotMatch(reactSource, /https?:\/\//, "A ferramenta não deve enviar documentos a serviços externos.");

const docxParts = ["001", "002"].map((part) => read("assets/templates/CAPA_PAGE1_TEMPLATE.docx.b64." + part).trim()).join("");
const docxBytes = Buffer.from(docxParts, "base64");
assert.ok(docxBytes.length > 8000, "O template DOCX oficial deve conter conteúdo real.");
assert.equal(docxBytes.subarray(0, 2).toString("ascii"), "PK");

const pdfParts = ["001", "002", "003", "004", "005"].map((part) => read("assets/templates/CAPA_PAGE1_BASE.pdf.b64." + part).trim()).join("");
const pdfBytes = Buffer.from(pdfParts, "base64");
assert.ok(pdfBytes.length > 20000, "O template PDF oficial deve conter conteúdo real.");
assert.equal(pdfBytes.subarray(0, 5).toString("ascii"), "%PDF-");

console.log("cover_document_react: ok");
