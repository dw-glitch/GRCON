const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const XLSX = require("../xlsx.full.min.js");
const ExcelJS = require("../exceljs.min.js");
const Registry = require("../allocation_registry_core.js");
const Report = require("../requests_taxonomy_core.js").wrapReport(require("../requests_report.js"));

const headers = ["NomeDocumento", "ALOCAÇÃO", "STATUS DA ALOCAÇÃO", "Comentários da Fiscal 01"];
const original = "Liberado pela fiscalização.\nConferir revisão Á/Ç.";
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
  headers,
  ["DOC-0001", "ALOC-1", "CONCLUÍDA", original],
  ["DOC-0001", "ALOC-2", "CONCLUÍDA", "Outra observação"],
  ["DOC-0001", "ALOC-3", "CONCLUÍDA", original],
  ["DOC-0002", "ALOC-4", "CONCLUÍDA", ""],
]), "Central de alocação");
const parsed = Registry.parseWorkbook(book, XLSX);
assert.equal(parsed.count, 4);
assert.equal(parsed.records[0].fiscalComment, original);
const index = Registry.buildIndex(parsed.records);
assert.deepEqual(Registry.fiscalCommentsForDocument("DOC-0001", index), [original, "Outra observação"]);
assert.deepEqual(Registry.fiscalCommentsForDocument("DOC-0002", index), []);
assert.deepEqual(Registry.fiscalCommentsForDocument("DOC-9999", index), []);
assert.deepEqual(Registry.fiscalCommentsForDocument("NT-DOC-0001", index), [original, "Outra observação"]);
const longComment = "Fiscal 01 — " + "a".repeat(4500);
assert.equal(Registry.cleanRecord({document:"DOC-0003",sourceRow:10,fiscalComment:longComment}).fiscalComment,longComment);
assert.throws(() => Registry.cleanRecord({document:"DOC-0003",sourceRow:10,fiscalComment:"x".repeat(8193)}), /extenso/);

const adapterFile = path.resolve(__dirname, "../src/react/consultas/services/consultasAdapter.ts");
const code = ts.transpileModule(fs.readFileSync(adapterFile, "utf8"), {
  fileName: "consultasAdapter.ts",
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const testModule = { exports: {} };
const w = {
  GrconRequestsCore: {
    lookupDocument: document => ({ chosen: { document } }),
    consultationRow: result => ({ situation: "Localizado", ldDocument: result.chosen.document, allocated: "" }),
    issuedColumns: () => ({}),
  },
  GrconRequestsControl: { find: () => [] },
  GrconPlannedDocumentsCore: {
    applyToRecords: rows => rows.map(row => ({ ...row, allocationStatus: "ALOCADO" })),
  },
  GrconAllocationRegistry: {
    fiscalComments: document => Registry.fiscalCommentsForDocument(document, index),
    refresh: async () => undefined,
  },
  GrconRequestsReport: Report,
};
const sandbox = { module: testModule, exports: testModule.exports, require, console, window: w, Set };
vm.runInNewContext(code, sandbox, { filename: "consultasAdapter.ts" });
const Adapter = testModule.exports.consultasAdapter;
const planned = { id: "planned-test", keys: new Set(["DOC-0001", "DOC-0002"]) };
const lookup = code => Adapter.lookupDocument(code, "", {}, planned);
const first = Adapter.buildExportRow("DOC-0001", lookup("DOC-0001"));
const blank = Adapter.buildExportRow("DOC-0002", lookup("DOC-0002"));
assert.equal(first.fiscalComment, original + "\nOutra observação");
assert.equal(blank.fiscalComment, "");
assert.equal(Report.COLUMNS.filter(item => item.key === "fiscalComment").length, 1);
const template = Report.BUILTIN_EXPORT_TEMPLATES[0];
assert.equal(Report.applyExportTemplate(template,[first]).rows[0][template.columns.findIndex(c => c.key==="fiscalComment")],first.fiscalComment);
assert.equal(Report.importExportTemplate("Oficial", ["Comentários da Fiscal 01"], "consulta").template.columns[0].key,"fiscalComment");

(async () => {
  const out = new ExcelJS.Workbook();
  const sheet = out.addWorksheet("Consulta");
  const positions = Report.writeConsultationSheet(sheet,[first,blank],{columns:template.columns});
  const column = template.columns.findIndex(c => c.key === "fiscalComment") + 1;
  assert.equal(sheet.getCell(positions.dataStart,column).value, first.fiscalComment);
  assert.equal(sheet.getCell(positions.dataStart + 1,column).value, null);
  const buffer = await out.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer);
  assert.equal(reloaded.getWorksheet("Consulta").getCell(positions.dataStart,column).value,first.fiscalComment);
  console.log("Fiscal 01: importação Central, múltiplas ALOCs, linha vazia, acentos, texto longo, React e XLSX validados.");
})().catch(error => {console.error(error); process.exitCode=1;});
