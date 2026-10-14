const assert = require("node:assert/strict");
const History = require("../history_core.js");
const Report = require("../history_report.js");

const doc = "RL-5290.00-22313-911-C1O-001";
const current = History.cleanRecord({
  egrdtNumber: "GRDT-2026-100",
  generatedAt: "2026-10-14T12:20:00Z",
  files: [
    { document: doc, grdtRevision: "A", finalName: doc + "_A.pdf", ldPrazo: "E31" },
    { document: doc, grdtRevision: "A", finalName: doc + "_A.xlsx", ldPrazo: "E31" },
    { document: doc, grdtRevision: "B", ldPrazo: "E32" },
    { document: "DOC-SEM-PRAZO", revision: "0", ldVersion: "Revisão E" },
  ],
});
const previous = History.cleanRecord({
  egrdtNumber: "GRDT-2026-090",
  generatedAt: "2026-10-13T10:00:00Z",
  files: [{ document: doc, revision: "0", ldPrazo: "0" }],
});
const rows = Report.colarGrconRows([current, previous]);
assert.equal(rows.length, 4, "PDF e XLSX da mesma revisão são um único documento");
assert.deepEqual(Object.keys(rows[0]), Report.COLAR_GRCON_COLUMNS_V1);
assert.deepEqual([...Report.COLAR_GRCON_COLUMNS_V1], [
  "DATA DA GERAÇÃO / POSTAGEM", "EGRDT", "DOCUMENTO",
  "REVISÃO ENVIADA NA GRDT", "VERSÃO DA LD ENVIADA",
]);
assert.equal(rows[0]["EGRDT"], "GRDT-2026-100");
assert.equal(rows[0]["DOCUMENTO"], doc);
assert.equal(rows[0]["REVISÃO ENVIADA NA GRDT"], "A");
assert.equal(rows[0]["VERSÃO DA LD ENVIADA"], "E31");
assert.equal(rows[1]["VERSÃO DA LD ENVIADA"], "E32");
assert.equal(rows[2]["VERSÃO DA LD ENVIADA"], "", "histórico legado não é preenchido por suposição");
assert.equal(rows[3]["VERSÃO DA LD ENVIADA"], "0", "valor literal zero permanece versão válida");
const copy = History.cleanRecord({ ...current, files: [
  { document: "DOC-COPIA", revision: "0", ldPrazo: "" },
  { document: "DOC-COPIA", revision: "0", ldPrazo: "Primeiras versões" },
]});
assert.equal(Report.colarGrconRows([copy])[0]["VERSÃO DA LD ENVIADA"], "Primeiras versões");
(async () => {
  const buffer = await Report.buildWorkbook([current, previous], {});
  const ExcelJS = require("../exceljs.min.js");
  const excel = new ExcelJS.Workbook();
  await excel.xlsx.load(buffer);
  assert.deepEqual(excel.worksheets.map(sheet => sheet.name), ["Resumo", "eGRDTs", "Documentos", "Colar GRCON"]);
  const paste = excel.getWorksheet("Colar GRCON");
  assert.equal(paste.getCell("A2").value, "DATA DA GERAÇÃO / POSTAGEM");
  assert.equal(paste.getCell("E2").value, "VERSÃO DA LD ENVIADA");
  assert.equal(paste.getCell("C3").value, doc);
  assert.equal(paste.getCell("E3").value, "E31");
  assert.equal(paste.getCell("E6").value, "0");
  assert.equal(paste.columnCount, 5, "nenhuma coluna extra será inserida nesta versão");
  assert.equal(paste.views[0].ySplit, 2);
  assert.equal(excel.getWorksheet("Documentos").getCell("W6").value, "VERSÃO DA LD ENVIADA");
  console.log("OK — layout imutável v1, 5 colunas, cópia A2:E, deduplicação e histórico.");
})().catch(error => { console.error(error); process.exitCode = 1; });
