"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");
const ExcelJS = require("../exceljs.min.js");
const Core = require("../sigem_pw_dashboard_core.js");
const cache = new Map();
function importTs(file) {
  const resolved = path.resolve(__dirname, "..", file);
  if (cache.has(resolved)) return cache.get(resolved).exports;
  const target = { exports: {} };
  cache.set(resolved, target);
  const javascript = ts.transpileModule(fs.readFileSync(resolved, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: resolved,
  }).outputText;
  const customRequire = name => name.startsWith(".")
    ? importTs(path.join(path.dirname(file), name + ".ts")) : require(name);
  new Function("require", "module", "exports", javascript)(customRequire, target, target.exports);
  return target.exports;
}
const exported = importTs("src/react/sigem-pw/services/sigemPwCoordinatorWorkbook.ts");
const { coordinatorPlan, coordinatorSheets, buildCoordinatorWorkbook } = exported;
const code = "CR-5290.00-22313-911-C1O-001";
const planned = "PR-5290.00-22313-955-C1O-002";
const outside = "PR-5290.00-22313-955-C1O-099";
const refs = [
  { document: code, documentKey: code, canonicalDocument: code, revision: "A", title: "Cronograma", status: "EMITIDO" },
  { document: planned, documentKey: planned, canonicalDocument: planned, revision: "0", title: "Plano", status: "EM EMISSÃO" },
];
const headers = Array.from({length:70},(_,i) => "Atributo " + i);
headers[0] = "NumeroDocumentoCliente";
headers[1] = "o_statename";
headers[2] = "Sigla da Empresa";
headers[3] = "Revisao";
headers[4] = "Última emissão";
headers[69] = "Extra 70";
const rec = (document, state, company, revision, emitted, raw) => {
  const row = Array(70).fill("");
  row[0] = document; row[1] = state; row[2] = company; row[3] = revision; row[4] = emitted;
  row[69] = raw;
  return row;
};
const quoted = '=HYPERLINK("https://example.invalid","NÃO EXECUTAR")';
const rawRows = [
  rec(code, "Cadastrado", "CSG", "0", "Não", "R0"),
  rec(code, "Liberado", "CSG", "A", "Sim", quoted),
  rec(planned, "Previsto", "QTM", "0", "Previsto", "Em preparação"),
  rec(outside, "Externo", "ABC", "0", "Sim", "Outro contrato"),
  rec("", "Linha sem código", "CSG", "", "Não", "Preservar atributos; não contar como documento"),
];
const encode = v => /[;"\r\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
const csv = [headers, ...rawRows].map(line => line.map(encode).join(";")).join("\n");
const parsed = Core.parsePwCsv(csv, {fileName:"PW_70.csv", importedAt:"2026-10-30T11:00:00Z"});
const pw = Core.sanitizePwBase(parsed, {meta:{fileName:"LD.xlsx"},records:refs});
const sigemRecords = [
  {document:code,revision:"A",status:"Sem Comentários"},
  {document:planned,revision:"0",status:"Em análise"}
];
const model = Core.createModel(sigemRecords,pw.records,refs,{
  requireN1710Ld:true, requireDocumentReference:true, ldAvailable:true, sigemAvailable:true, pwAvailable:true
});
const state = {
  ld:{meta:{fileName:"LD.xlsx"},records:refs},
  pw, sigem:{meta:{fileName:"Consulta Geral"},records:sigemRecords},
  model,result:{lists:{sigemN1710OutsideLd:[],pwN1710OutsideLd:[]}},
};
const plan = coordinatorPlan(state);
assert.deepEqual(Object.keys(coordinatorSheets(state)),["Resumo","N-1710","REL. PW"]);
assert.equal(plan.sheets["N-1710"].length,5);
assert.equal(plan.sheets["N-1710"][2].length,32);
assert.equal(plan.sheets["N-1710"][3].length,32);
assert.equal(plan.sheets["REL. PW"][0].length,70);
assert.equal(plan.sheets["REL. PW"].length,6,"linha inválida também deve estar na aba fonte");
assert.deepEqual(plan.sheets["REL. PW"][2],rawRows[1]);
assert.ok(plan.sheets.Resumo.length >= 16, "resumo gerencial deve explicar indicadores e fontes");
assert.equal(plan.sheets["N-1710"][3][9],"Sem ação necessária");
assert.equal(plan.sheets["N-1710"][4][10],"Cadastrado");
assert.equal(plan.sheets["N-1710"][0][2],plan.summary.active);
assert.equal(plan.sheets["N-1710"][0][4],plan.summary.registered);
assert.equal(plan.sheets["N-1710"][0][6],plan.summary.emitted);
assert.equal(plan.sheets["N-1710"][0][8],plan.summary.posted);
assert.equal(plan.sheets["N-1710"][0][10],plan.summary.pending);
assert.equal(plan.summary.active,2);
assert.equal(plan.summary.registered,2);
assert.equal(plan.summary.emitted,1);
assert.equal(plan.summary.posted,2);
assert.equal(plan.summary.compliant,1);
assert.equal(plan.summary.pending,1);
assert.ok(plan.formulas[0].f.includes("'REL. PW'!$D$3"),"matching revision should reference A's original row");
assert.ok(plan.formulas[0].h.includes("'REL. PW'!$B$3"));
assert.ok(plan.formulas[0].i.includes("'REL. PW'!$E$3"));
assert.equal(plan.formulas[0].results[1],"VERDADEIRO");
const { workbook } = buildCoordinatorWorkbook(state, ExcelJS);
(async () => {
  const bytes = await workbook.xlsx.writeBuffer();
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(bytes);
  assert.deepEqual(reopened.worksheets.map(s=>s.name), ["Resumo","N-1710","REL. PW"]);
  const control = reopened.getWorksheet("N-1710");
  assert.equal(control.getCell("A3").value,"DOCUMENTO");
  assert.equal(control.getCell("AF3").value,"Rev. U");
  assert.equal(control.getCell("F4").formula,plan.formulas[0].f);
  assert.equal(control.getCell("G4").formula,plan.formulas[0].g);
  assert.equal(control.getCell("H4").formula,plan.formulas[0].h);
  assert.equal(control.getCell("I4").formula,plan.formulas[0].i);
  assert.equal(control.getCell("G4").result,"VERDADEIRO");
  assert.equal(control.getCell("J4").value,"Sem ação necessária");
  assert.equal(control.getCell("K5").value,"Cadastrado");
  assert.equal(control.getCell("A1").value,"CONTROLE DOCUMENTAL • GRCON");
  assert.ok(control.getCell("A3").font.bold);
  assert.equal(control.views[0].ySplit,3);
  assert.equal(control.autoFilter,"A3:AF5");
  const source = reopened.getWorksheet("REL. PW");
  assert.equal(source.getCell("BR3").value,quoted,"raw formula-like PW text stays literal");
  assert.equal(source.getCell("C5").value,"ABC");
  assert.equal(source.getCell("BR6").value,"Preservar atributos; não contar como documento");
  assert.ok(["",null].includes(source.getCell("A6").value),"linha sem código preservada sem inventar documento");
  assert.equal(source.getCell("A1").value,"NumeroDocumentoCliente");
  assert.equal(source.views[0].ySplit,1);
  assert.equal(reopened.getWorksheet("Resumo").getCell("A1").value,"GRCON | SIGEM × PW");
  assert.equal(reopened.worksheets.length,3);
  const legacy = structuredClone(state);
  legacy.pw.meta.pwRawHeaders = undefined;
  assert.throws(()=>coordinatorPlan(legacy),/Reimporte o CSV/);
  const widthMismatch = structuredClone(state);
  widthMismatch.pw.meta.pwRawColumnCount = 69;
  widthMismatch.pw.meta.pwRawHeaders = widthMismatch.pw.meta.pwRawHeaders.slice(0,69);
  widthMismatch.pw.sourceRecords.forEach(row=>row.pwRawCells.pop());
  assert.throws(()=>coordinatorPlan(widthMismatch),/70 colunas/);
  console.log("SIGEM × PW Fase 5: 3 abas, A–AF/A–BR, fórmulas F:I, dados PW, texto literal e estilo GRCON OK");
})().catch(error=>{console.error(error);process.exitCode=1;});
