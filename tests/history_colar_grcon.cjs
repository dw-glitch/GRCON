const assert = require("node:assert/strict");
const History = require("../history_core.js");
const Report = require("../history_report.js");
const ExcelJS = require("../exceljs.min.js");

const HEADERS = [
  "DATA DA GERAÇÃO / POSTAGEM",
  "EGRDT",
  "DOCUMENTO",
  "REVISÃO ENVIADA NA GRDT",
  "VERSÃO DA LD ENVIADA",
];

(async () => {
  assert.deepEqual(Report.COLAR_GRCON_HEADERS_V1, HEADERS, "layout v1 é imutável");
  assert.equal(Object.isFrozen(Report.COLAR_GRCON_HEADERS_V1), true);
  const source = [
    History.cleanRecord({
      id: "emissao-2", egrdtNumber: "GR-002",
      generatedAt: "2026-10-14T12:59:00Z", outputType: "Arquivos + eGRDT",
      files: [
        { document: "RL-5290.00-22313-911-C1O-002", revision: "0", grdtRevision: "B", ldVersion: "F", ldPrazo: "E31" },
        { document: "RL-5290.00-22313-911-C1O-003", revision: "0", ldVersion: "E", ldPrazo: "Primeiras versões" },
        { document: "RL-5290.00-22313-911-C1O-004", revision: "0", ldVersion: "E", ldPrazo: "0" },
      ],
      removedFiles: [{ id: "removed", file: { document: "REMOVIDO", ldPrazo: "E88" }, reason: "Cancelado" }],
    }),
    History.cleanRecord({
      id: "emissao-1", egrdtNumber: "GR-001",
      generatedAt: "2026-10-13T11:21:00Z",
      files: [
        { document: "RL-5290.00-22313-911-C1O-002", revision: "A", ldVersion: "E", ldPrazo: "A01" },
        { document: "RL-5290.00-22313-911-C1O-005", revision: "A", ldVersion: "E" },
      ],
    }),
  ];

  const rows = Report.colarGrconRows(source);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].length, 5);
  assert.ok(rows[0][0] instanceof Date, "data precisa ser data real do Excel, não texto");
  assert.deepEqual(rows.map(r => r.slice(1)), [
    ["GR-002", "RL-5290.00-22313-911-C1O-002", "B", "E31"],
    ["GR-002", "RL-5290.00-22313-911-C1O-003", "0", "Primeiras versões"],
    ["GR-002", "RL-5290.00-22313-911-C1O-004", "0", "0"],
    ["GR-001", "RL-5290.00-22313-911-C1O-002", "A", "A01"],
    ["GR-001", "RL-5290.00-22313-911-C1O-005", "A", ""],
  ]);
  const detailed = Report.documentRows(source);
  assert.equal(detailed.length, rows.length, "não perder nem duplicar documentos");
  assert.deepEqual(detailed.map(x => x["VERSÃO DA LD ENVIADA"]), rows.map(x => x[4]));
  assert.ok(!rows.some(r => r.includes("REMOVIDO")), "não exportar documento removido");

  const buffer = await Report.buildWorkbook(source);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  assert.deepEqual(book.worksheets.map(sheet => sheet.name), ["Resumo", "eGRDTs", "Documentos", "Colar GRCON"]);
  const sheet = book.getWorksheet("Colar GRCON");
  assert.equal(sheet.getCell("A1").value, "COLAR GRCON");
  assert.deepEqual(HEADERS.map((_, i) => sheet.getCell(2, i + 1).value), HEADERS);
  assert.equal(sheet.columnCount, 5, "NUNCA expandir esquema de 5 colunas");
  assert.equal(sheet.rowCount, 7);
  assert.ok(sheet.getCell("A3").value instanceof Date, "Excel precisa guardar serial date");
  assert.equal(sheet.getCell("A3").numFmt, "dd/mm/yyyy hh:mm:ss");
  assert.equal(sheet.getCell("B3").value, "GR-002");
  assert.equal(sheet.getCell("C3").value, "RL-5290.00-22313-911-C1O-002");
  assert.equal(sheet.getCell("D3").value, "B");
  assert.equal(sheet.getCell("E3").value, "E31");
  assert.equal(sheet.getCell("E6").value, "A01");
  assert.equal(sheet.getCell("E7").value, null, "falta de prazo nunca vira revisão da LD");
  assert.equal(sheet.getCell("F2").value, null, "F fica disponível para chave auxiliar no Controle");
  assert.equal(book.getWorksheet("Documentos").getCell("W6").value !== undefined, true, "detalhado preservado");

  console.log("OK — Colar GRCON v1: 5 colunas fixas, datas Excel, múltiplas GRDTs/LDs, legado, removidos, relatório original.");
})().catch(error => { console.error(error); process.exitCode = 1; });
