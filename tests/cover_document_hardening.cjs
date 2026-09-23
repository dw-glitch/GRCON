const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const TypeScript = require("typescript");

const root = path.resolve(__dirname, "..");
const Core = require("../core.js");
const JSZip = require("../jszip.min.js");
const PDFLib = require("../pdf-lib.min.js");

function transpile(relative, globals = {}) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const compiled = TypeScript.transpileModule(source, {
    compilerOptions: { module: TypeScript.ModuleKind.CommonJS, target: TypeScript.ScriptTarget.ES2020 },
    fileName: path.basename(relative),
  }).outputText;
  const testModule = { exports: {} };
  const sandbox = {
    module: testModule,
    exports: testModule.exports,
    require,
    console,
    Blob,
    URL,
    setTimeout,
    clearTimeout,
    performance,
    TextEncoder,
    TextDecoder,
    atob: globalThis.atob || ((value) => Buffer.from(value, "base64").toString("binary")),
    btoa: globalThis.btoa || ((value) => Buffer.from(value, "binary").toString("base64")),
    ...globals,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(compiled, sandbox, { filename: relative + ".test.cjs" });
  return testModule.exports;
}

const Ld = transpile("src/react/cover-document/services/ldDocumentService.ts", {
  window: { TriagemCore: Core, XLSX: {} },
});

function record(overrides = {}) {
  return {
    document: "PR-5290.00-22313-91B-C1O-002",
    title: "POP 01 - PROCEDIMENTO DE REFERÊNCIA",
    revision: "0",
    effectiveDate: "2026-09-22",
    discipline: "SMS",
    documentType: "PR",
    tag: "",
    sheet: "LD_003",
    row: 42,
    source: "LD_003.xlsx",
    ldColumns: [
      { header: "TAXONOMIA", value: "RHDD-PEX-SMS-EX-REF-SST-PT-0002" },
      { header: "CODIGO TAXONOMIA", value: "NAO-USAR" },
      { header: "TAXONOMIA INTERNA", value: "NAO-USAR-2" },
      { header: "EAP", value: "1.1.1.1" },
    ],
    ...overrides,
  };
}

const exact = Ld.toCandidate(record());
assert.equal(exact.taxonomy, "RHDD-PEX-SMS-EX-REF-SST-PT-0002");
const missingCanonical = Ld.toCandidate(record({
  ldColumns: [{ header: "TAXONOMIA INTERNA", value: "NAO-USAR" }, { header: "EAP", value: "1.1.1.1" }],
}));
assert.equal(missingCanonical.taxonomy, "");
const duplicateConflict = Ld.toCandidate(record({
  ldColumns: [{ header: "TAXONOMIA", value: "TX-1" }, { header: "Taxonomia", value: "TX-2" }],
}));
assert.equal(duplicateConflict.taxonomy, "");

const indexed = Ld.buildLdSearchIndex([
  record({ row: 10, ldColumns: [{ header: "TAXONOMIA", value: "TX-A" }, { header: "EAP", value: "1.1.1.1" }] }),
  record({ row: 11, ldColumns: [{ header: "TAXONOMIA", value: "TX-B" }, { header: "EAP", value: "2.2.2.2" }] }),
]);
const ambiguous = Ld.searchLdDocuments(indexed, "POP 01 - PROCEDIMENTO DE REFERÊNCIA");
assert.equal(ambiguous.length, 2);
assert.equal(Ld.uniqueExactCandidate(ambiguous, "POP 01 - PROCEDIMENTO DE REFERÊNCIA"), null);

const Validation = transpile("src/react/cover-document/services/coverValidationService.ts", {
  window: { TriagemCore: Core },
});
const sourceStub = { kind: "pdf", pageCountSource: "exact", originalPages: 1, file: { name: "origem.pdf" } };
const baseData = {
  title: exact.title,
  documentNumber: exact.documentNumber,
  taxonomy: exact.taxonomy,
  eap: exact.eap,
  category: exact.category,
  categoryLabel: exact.categoryLabel,
  classification: "",
  internalDocumentCode: "VALOR-LEGADO-IGNORADO",
  revision: "0",
  revisionDescription: "EMISSÃO ORIGINAL",
  revisionDate: "23/09/2026",
  discipline: "SMS",
  tag: "",
  executor: "KAIQUE CAETANO",
  checker: "LEANDRO CALDEIRA",
  approver: "LUCIANA SCIARRA",
};
assert.equal(Validation.validateCover(exact, baseData, sourceStub, 2).some((item) => item.level === "error"), false);
assert.ok(Validation.validateCover(exact, { ...baseData, taxonomy: "" }, sourceStub, 2).some((item) => item.id === "taxonomy" && item.level === "error"));
assert.ok(Validation.validateCover(exact, { ...baseData, revision: "O" }, sourceStub, 2).some((item) => item.id === "revision-rule" && item.level === "error"));
assert.ok(Validation.validateCover(exact, { ...baseData, category: "ZZ" }, sourceStub, 2).some((item) => item.id === "category-rule" && item.level === "error"));

const fetchCounts = new Map();
function localFetch(url) {
  const relative = String(url).replace(/^\/+/, "");
  fetchCounts.set(relative, (fetchCounts.get(relative) || 0) + 1);
  const filePath = path.join(root, relative);
  if (!fs.existsSync(filePath)) return Promise.resolve({ ok: false, status: 404, text: async () => "" });
  return Promise.resolve({ ok: true, status: 200, text: async () => fs.readFileSync(filePath, "utf8") });
}
const Service = transpile("src/react/cover-document/services/coverDocumentService.ts", {
  window: { PDFLib, JSZip, setTimeout },
  fetch: localFetch,
  document: {},
});

function fileLike(name, type, bytes) {
  const buffer = Buffer.from(bytes);
  return {
    name, type, size: buffer.length, lastModified: 1,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
}

async function generatedFiles() {
  const sourcePdf = await PDFLib.PDFDocument.create();
  sourcePdf.addPage([595, 842]);
  const sourcePdfBytes = await sourcePdf.save();
  const sourcePdfInfo = {
    file: fileLike("origem.pdf", "application/pdf", sourcePdfBytes),
    kind: "pdf", originalPages: 1, pageCountSource: "exact",
  };

  const firstPdf = await Service.generatePdf(baseData, sourcePdfInfo);
  const secondPdf = await Service.generatePdf(baseData, sourcePdfInfo);
  assert.match(firstPdf.fileName, /REV 0\.pdf$/);
  assert.match(secondPdf.fileName, /REV 0\.pdf$/);
  const reopenedPdf = await PDFLib.PDFDocument.load(new Uint8Array(await firstPdf.blob.arrayBuffer()));
  assert.equal(reopenedPdf.getPageCount(), 2);
  for (const part of ["001","002","003","004","005"]) {
    assert.equal(fetchCounts.get("assets/templates/CAPA_PAGE1_BASE.pdf.b64." + part), 1, "Template PDF deve ser reutilizado do cache em memória.");
  }

  const sourceZip = new JSZip();
  sourceZip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
  sourceZip.file("word/document.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>ORIGINAL-DOCX-BODY</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>');
  sourceZip.file("word/styles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:styles>');
  sourceZip.file("word/_rels/document.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  sourceZip.file("docProps/app.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Pages>2</Pages></Properties>');
  const sourceDocxBytes = await sourceZip.generateAsync({ type: "uint8array" });

  const docx = await Service.generateDocx(baseData, {
    file: fileLike("origem.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sourceDocxBytes),
    kind: "docx", originalPages: 2, pageCountSource: "metadata",
  }, 3);
  assert.match(docx.fileName, /REV 0\.docx$/);
  const reopenedDocx = await JSZip.loadAsync(new Uint8Array(await docx.blob.arrayBuffer()));
  const documentXml = await reopenedDocx.file("word/document.xml").async("string");
  const appXml = await reopenedDocx.file("docProps/app.xml").async("string");
  assert.match(documentXml, /ORIGINAL-DOCX-BODY/);
  assert.match(documentXml, /POP 01 - PROCEDIMENTO DE REFERÊNCIA/);
  assert.match(documentXml, /PR-5290\.00-22313-91B-C1O-002/);
  assert.match(documentXml, /RHDD-PEX-SMS-EX-REF-SST-PT-0002/);
  assert.doesNotMatch(documentXml, /VALOR-LEGADO-IGNORADO/);
  assert.doesNotMatch(documentXml, /\{\{[A-Z_]+\}\}/);
  assert.doesNotMatch(documentXml, /w:altChunk|aFChunk/);
  assert.match(appXml, /<Pages>3<\/Pages>/);
  console.log("cover_document_hardening: ok");
}

generatedFiles().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
