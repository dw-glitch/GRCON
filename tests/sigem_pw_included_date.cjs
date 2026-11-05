"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Core = require("../sigem_pw_dashboard_core.js");
const ExcelJS = require("../exceljs.min.js");
const cache = new Map();
function importTs(file) {
  const resolved = path.resolve(__dirname, "..", file);
  if (cache.has(resolved)) return cache.get(resolved).exports;
  const module = { exports: {} }; cache.set(resolved, module);
  const code = ts.transpileModule(fs.readFileSync(resolved, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: resolved }).outputText;
  new Function("require", "module", "exports", code)(name => name.startsWith(".") ? importTs(path.join(path.dirname(file), name + (/(?:Overview|KpiCharts)$/.test(name) ? ".tsx" : ".ts"))) : require(name), module, module.exports);
  return module.exports;
}
global.window = { GrconSigemPwDashboard: Core };
const { reconcilePwOperations: run, filterPwOperations: filter, PW_INDICATORS } = importTs("src/react/sigem-pw/services/sigemPwOperations.ts");
const { coordinatorPlan, buildCoordinatorWorkbook, MAIN_SHEET, SIGEM_INCLUDED_DATE_HEADER } = importTs("src/react/sigem-pw/services/sigemPwCoordinatorWorkbook.ts");
const doc = n => `CR-5290.00-22313-911-C1O-${String(n).padStart(3, "0")}`;
const ref = (n, rev = "0", extra = {}) => ({ document: doc(n), revision: rev, status: "EMITIDO", documentClass: "N-1710", title: `Documento ${n}`, referenceSources: ["LD1.xlsx"], ...extra });
const sig = (n, rev = "0", extra = {}) => ({ document: doc(n), revision: rev, status: "Em análise", ...extra });
const pw = (n, rev = "0", emitted = "Previsto", company = "CSG") => ({ document: doc(n), revision: rev, lastEmission: emitted, state: emitted === "Previsto" ? "Previsto" : "Liberado", company });
function state(refs, sigem, pwRows) {
  const headers = Array.from({ length: 70 }, (_, i) => `Coluna ${i + 1}`);
  [headers[0], headers[1], headers[2], headers[3], headers[4]] = ["NumeroDocumentoCliente", "o_statename", "SiglaEmpresa", "RevisaoCompleta", "Última emissão"];
  const rows = pwRows.map(row => { const cells = Array(70).fill(""); [cells[0], cells[1], cells[2], cells[3], cells[4]] = [row.document, row.state, row.company, row.revision, row.lastEmission]; cells[69] = '=HYPERLINK("https://example.invalid","literal")'; return cells; });
  const quote = x => '"' + String(x).replace(/"/g, '""') + '"';
  const base = Core.parsePwCsv([headers, ...rows].map(row => row.map(quote).join(";")).join("\n"), { fileName: "PW.csv" });
  return { ld: { meta: { fileName: "LDs ativas" }, records: refs }, sigem: { meta: { fileName: "Consulta Geral", sourceRowCount: sigem.length }, records: sigem }, pw: base, model: { normalizedPw: base.records, normalizedSigem: sigem }, analysisError: "", busy: false };
}

(async () => {
  const sample = state([ref(1,"B"), ref(2)], [
    sig(1,"0",{includedAt:"01/11/2026 08:10", modifiedAt:"05/11/2026"}),
    sig(1,"0",{includedAt:"01/11/2026 08:10"}),
    sig(1,"A",{includedAt:"03/11/2026 09:20"}),
    sig(2,"0",{modifiedAt:"05/11/2026"}),
  ], [pw(1,"0","Sim")]);
  sample.sigem.meta.importedAt="2026-11-05T12:00:00Z";
  const report=run(sample);
  const get=(revision)=>report.rows.find(row=>row.code===doc(1)&&row.revision===revision);
  assert.equal(get("0").sigemIncludedAt,"01/11/2026 08:10");
  assert.equal(get("A").sigemIncludedAt,"03/11/2026 09:20");
  assert.equal(get("B").sigemIncludedAt, "", "não usar data de outra revisão");
  assert.equal(report.rows.find(row=>row.code===doc(2)).sigemIncludedAt,"", "não usar modificação nem data da base");
  const filters={revision:"A"};
  const plan=coordinatorPlan(sample,filters), dateColumn=plan.sheets[MAIN_SHEET][2].indexOf(SIGEM_INCLUDED_DATE_HEADER);
  assert.equal(plan.sheets[MAIN_SHEET][3][dateColumn],"03/11/2026 09:20");
  assert.equal(plan.sheets[MAIN_SHEET][3][13],"X", "a coluna X da revisão A permanece no mesmo lugar");
  const {workbook}=buildCoordinatorWorkbook(sample,ExcelJS,undefined,filters);
  const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  for(const name of [MAIN_SHEET,...plan.classSheets]) {
    const sheet=reopened.getWorksheet(name);
    assert.equal(sheet.getCell(4,dateColumn+1).value,"03/11/2026 09:20");
    assert.ok(sheet.autoFilter.endsWith("4"));
    assert.equal(sheet.getColumn(dateColumn+1).width,25);
  }
  sample.sigem.records.push(sig(1,"A",{includedAt:"04/11/2026 10:00"}));
  const changed={...sample,sigem:{...sample.sigem,records:[...sample.sigem.records]}};
  assert.equal(run(changed).rows.find(row=>row.revision==="A").sigemIncludedAt,"03/11/2026 09:20 | 04/11/2026 10:00", "preservar datas divergentes sem escolher arbitrariamente");
  console.log("Data de inclusão SIGEM: própria revisão, duplicidades, ausências, filtros, abas por classe e XLSX reaberto OK.");
})().catch(error=>{console.error(error);process.exitCode=1;});
