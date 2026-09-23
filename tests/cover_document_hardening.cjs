const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");
const TypeScript = require("typescript");

const root = path.resolve(__dirname, "..");
const Core = require("../core.js");
const JSZip = require("../jszip.min.js");
const PDFLib = require("../pdf-lib.min.js");

function transpile(relative, globals = {}) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const compiled = TypeScript.transpileModule(source, {
    compilerOptions: {
      module: TypeScript.ModuleKind.CommonJS,
      target: TypeScript.ScriptTarget.ES2020,
    },
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
  return { exports: testModule.exports, sandbox };
}

const ldRuntime = transpile("src/react/cover-document/services/ldDocumentService.ts", {
  window: {
    TriagemCore: Core,
    XLSX: {},
  },
});
const Ld = ldRuntime.exports;

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
      { header: "CODIGO TAXONOMIA", value: "VALOR-QUE-NAO-DEVE-SER-USADO" },
      { header: "TAXONOMIA INTERNA", value: "OUTRA-TAXONOMIA-QUE-NAO-DEVE-SER-USADA" },
      { header: "EAP", value: "1.1.1.1" },
    ],
    ...overrides,
  };
}

const exact = Ld.toCandidate(record());
assert.equal(exact.title, "POP 01 - PROCEDIMENTO DE REFERÊNCIA");
assert.equal(exact.documentNumber, "PR-5290.00-22313-91B-C1O-002");
assert.equal(exact.taxonomy, "RHDD-PEX-SMS-EX-REF-SST-PT-0002");
assert.equal(exact.internalDocumentCode, exact.taxonomy, "CÓD. DOCUMENTO INTERNO deve receber a TAXONOMIA da LD.");
assert.equal(exact.category, "PR");

const noCanonicalTaxonomy = Ld.toCandidate(record({
  ldColumns: [
    { header: "CODIGO TAXONOMIA", value: "NAO-USAR" },
    { header: "TAXONOMIA INTERNA", value: "NAO-USAR-2" },
  ],
}));
assert.equal(noCanonicalTaxonomy.taxonomy, "", "Sem a coluna TAXONOMIA, o valor não pode ser inferido por aliases.");

const duplicateConflict = Ld.toCandidate(record({
  ldColumns: [
    { header: "TAXONOMIA", value: "TX-1" },
    { header: "Taxonomia", value: "TX-2" },
  ],
}));
assert.equal(duplicateConflict.taxonomy, "", "Duas colunas TAXONOMIA conflitantes devem bloquear escolha arbitrária.");

const sameTitleDifferentEap = [
  record({ row: 10, ldColumns: [{ header: "TAXONOMIA", value: "TX-A" }, { header: "EAP", value: "1.1.1.1" }] }),
  record({ row: 11, ldColumns: [{ header: "TAXONOMIA", value: "TX-B" }, { header: "EAP", value: "2.2.2.2" }] }),
];
const ambiguous = Ld.searchLdDocuments(sameTitleDifferentEap, "POP 01 - PROCEDIMENTO DE REFERÊNCIA");
assert.equal(ambiguous.length, 2);
assert.equal(Ld.uniqueExactCandidate(ambiguous, "POP 01 - PROCEDIMENTO DE REFERÊNCIA"), null);

const accent = Ld.searchLdDocuments(
  [record({ title: "PROCEDIMENTO DE INSPEÇÃO E MANUTENÇÃO" })],
  "procedimento de inspecao e manutencao",
);
assert.equal(accent.length, 1);

const scaleMeasurements = {};
for (const size of [1000, 5000, 20000, 50000]) {
  const records = Array.from({ length: size }, (_, index) => record({
    title: "Documento controlado ZXQ" + index,
    row: index + 2,
    ldColumns: [{ header: "TAXONOMIA", value: "TX-" + index }],
  }));
  const started = performance.now();
  const found = Ld.searchLdDocuments(records, "ZXQ" + (size - 1));
  scaleMeasurements[size] = Math.round(performance.now() - started);
  assert.ok(found.some((item) => item.title.endsWith("ZXQ" + (size - 1))), "Busca deve localizar o alvo em " + size + " registros.");
}
assert.ok(scaleMeasurements[50000] < 5000, "Busca em 50 mil registros excedeu 5 s: " + JSON.stringify(scaleMeasurements));

const validationRuntime = transpile("src/react/cover-document/services/coverValidationService.ts", {
  window: { TriagemCore: Core },
});
const Validation = validationRuntime.exports;
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
  revisionDate: "22/09/2026",
  discipline: "SMS",
  tag: "",
  executor: "KAIQUE CAETANO",
  checker: "LEANDRO CALDEIRA",
  approver: "LUCIANA SCIARRA",
};

assert.equal(
  Validation.validateCover(exact, baseData, sourceStub, 2).some((item) => item.level === "error"),
  false,
  "Registro válido com TAXONOMIA e revisão 0 não deve ser bloqueado.",
);
assert.ok(
  Validation.validateCover(exact, { ...baseData, taxonomy: "" }, sourceStub, 2)
    .some((item) => item.id === "taxonomy" && item.level === "error"),
  "TAXONOMIA ausente deve bloquear a geração.",
);
assert.ok(
  Validation.validateCover(exact, { ...baseData, revision: "O" }, sourceStub, 2)
    .some((item) => item.id === "revision-rule" && item.level === "error"),
  "Revisão inválida deve ser rejeitada por TriagemCore.revisionInfo.",
);
assert.ok(
  Validation.validateCover(exact, { ...baseData, category: "ZZ" }, sourceStub, 2)
    .some((item) => item.id === "category-rule" && item.level === "error"),
  "Categoria fora do catálogo oficial deve ser bloqueada.",
);

function localFetch(url) {
  const relative = String(url).replace(/^\/+/, "");
  const filePath = path.join(root, relative);
  if (!fs.existsSync(filePath)) return Promise.resolve({ ok: false, status: 404, text: async () => "" });
  return Promise.resolve({ ok: true, status: 200, text: async () => fs.readFileSync(filePath, "utf8") });
}

const serviceRuntime = transpile("src/react/cover-document/services/coverDocumentService.ts", {
  window: { PDFLib, JSZip },
  fetch: localFetch,
  document: {},
});
const Service = serviceRuntime.exports;
const fields = Service.coverFieldValues(baseData, 3);
assert.equal(fields.taxonomy, "RHDD-PEX-SMS-EX-REF-SST-PT-0002");
assert.notEqual(fields.taxonomy, baseData.internalDocumentCode);

function fileLike(name, type, bytes) {
  const buffer = Buffer.from(bytes);
  return {
    name,
    type,
    size: buffer.length,
    lastModified: 1,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
}

function decodedPdfStreams(bytes) {
  const buffer = Buffer.from(bytes);
  const texts = [buffer.toString("latin1")];
  let cursor = 0;
  while (cursor < buffer.length) {
    const marker = buffer.indexOf(Buffer.from("stream"), cursor);
    if (marker < 0) break;
    let start = marker + 6;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;
    else if (buffer[start] === 10 || buffer[start] === 13) start += 1;
    const end = buffer.indexOf(Buffer.from("endstream"), start);
    if (end < 0) break;
    let chunk = buffer.subarray(start, end);
    while (chunk.length && (chunk[chunk.length - 1] === 10 || chunk[chunk.length - 1] === 13)) chunk = chunk.subarray(0, -1);
    try { texts.push(zlib.inflateSync(chunk).toString("latin1")); } catch (_) {}
    cursor = end + 9;
  }
  return texts.join("\n");
}

async function runGeneratedFileTests() {
  const sourcePdf = await PDFLib.PDFDocument.create();
  const sourcePage = sourcePdf.addPage([595, 842]);
  sourcePage.drawText("ORIGINAL-PDF-BODY", { x: 50, y: 780, size: 12 });
  const sourcePdfBytes = await sourcePdf.save();

  const pdfGenerated = await Service.generatePdf(baseData, {
    file: fileLike("origem.pdf", "application/pdf", sourcePdfBytes),
    kind: "pdf",
    originalPages: 1,
    pageCountSource: "exact",
  });
  assert.match(pdfGenerated.fileName, /PR-5290\.00-22313-91B-C1O-002/);
  assert.match(pdfGenerated.fileName, /REV 0\.pdf$/);
  const pdfBytes = new Uint8Array(await pdfGenerated.blob.arrayBuffer());
  const reopenedPdf = await PDFLib.PDFDocument.load(pdfBytes);
  assert.equal(reopenedPdf.getPageCount(), 2, "PDF final deve reabrir com capa + página original.");

  const pdfText = decodedPdfStreams(pdfBytes);
  const taxonomyHex = Buffer.from(baseData.taxonomy, "latin1").toString("hex").toUpperCase();
  const documentHex = Buffer.from(baseData.documentNumber, "latin1").toString("hex").toUpperCase();
  assert.ok(
    pdfText.includes(baseData.taxonomy) || pdfText.toUpperCase().includes(taxonomyHex),
    "PDF gerado deve carregar a TAXONOMIA da LD no conteúdo da capa.",
  );
  assert.ok(
    pdfText.includes(baseData.documentNumber) || pdfText.toUpperCase().includes(documentHex),
    "PDF gerado deve carregar o código documental da LD.",
  );

  const sourceZip = new JSZip();
  sourceZip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
  sourceZip.file("word/document.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>ORIGINAL-DOCX-BODY</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>');
  sourceZip.file("word/styles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:styles>');
  sourceZip.file("word/_rels/document.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  sourceZip.file("docProps/app.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Pages>2</Pages></Properties>');
  const sourceDocxBytes = await sourceZip.generateAsync({ type: "uint8array" });

  const docxGenerated = await Service.generateDocx(baseData, {
    file: fileLike("origem.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sourceDocxBytes),
    kind: "docx",
    originalPages: 2,
    pageCountSource: "metadata",
  }, 3);
  assert.match(docxGenerated.fileName, /REV 0\.docx$/);
  const docxBytes = new Uint8Array(await docxGenerated.blob.arrayBuffer());
  const reopenedDocx = await JSZip.loadAsync(docxBytes);
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

  console.log("cover_document_hardening: ok", JSON.stringify({ scaleMeasurements }));
}

runGeneratedFileTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
