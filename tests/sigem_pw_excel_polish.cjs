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
  { document: code, documentKey: code, canonicalDocument: code, revision: "A", title: "Cronograma", documentClass: "N-1710", status: "EMITIDO" },
  { document: planned, documentKey: planned, canonicalDocument: planned, revision: "0", title: "Plano", documentClass: "N-1710", status: "EM EMISSÃO" },
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
const labels = new Map(plan.sheets.Resumo.map(row => [row[0], row[1]]));
const find = prefix => plan.sheets.Resumo.find(row => String(row[0]).startsWith(prefix));

// Indicadores novos: cadastro e emissão são situações distintas.
assert.equal(find("Constam no SIGEM")[1], 2);
assert.equal(find("A cadastrar no PW — já constam no SIGEM")[1], 0);
assert.equal(find("A cadastrar no PW — não constam no SIGEM")[1], 0);
// Só a revisão 0 é cadastro: documento A (PW 0 e A emitidas; SIGEM em A → o PW emite 0 e A) + documento previsto (rev. 0 cadastrada, a emitir).
assert.equal(find("Cadastradas no PW")[1], 2, "cadastradas = só revisões 0");
assert.equal(find("A emitir no PW")[1], 1);
assert.equal(find("Emitidas no PW")[1], 2, "0 e A do documento emitido");
assert.ok(plan.overviewSections.length === 3, "resumo organizado em seções");
assert.ok(plan.overviewSections.every(row => plan.sheets.Resumo[row - 1][1] === ""));
assert.ok(labels.has("Gerado em") && labels.has("Data da base PW"), "proveniência com datas no resumo");
assert.equal(plan.sheets["Fora das LDs"], undefined, "sem documentos fora das LDs a aba não é criada");
assert.deepEqual(plan.formulas.map(f => f.pwSituation), ["emitted", "notApplicable", "registered"], "a revisão A não é cadastro: a coluna Cadastro não se aplica");
assert.ok(labels.has("Regra do PW") && /Só a revisão 0 é cadastro/.test(labels.get("Regra do PW")), "o resumo do Excel traz a regra do PW");

// Com documentos fora das LDs: aba separada, sem alterar os indicadores principais.
const withOutside = structuredClone(state);
withOutside.sigem.records.push({document:"OUT-SIGEM-1",revision:"0",status:"Postado"});
const outsideCells=rec("OUT-PW-1", "Liberado", "CSG", "A", "Sim", "Fonte externa");
withOutside.pw.sourceRecords.push({document:"OUT-PW-1",revision:"A",state:"Liberado",lastEmission:"Sim",company:"CSG",sourceRow:9,pwRawCells:outsideCells});
const planOutside = coordinatorPlan(withOutside);
assert.deepEqual(Object.keys(planOutside.sheets), ["Resumo", "Conferência Documental", "N-1710", "REL. PW", "Conciliação", "Fora das LDs"]);
assert.equal(planOutside.sheets["Fora das LDs"].length, 3, "cabeçalho + 2 registros (duplicata exata colapsada)");
assert.equal(plan.sheets["Conferência Documental"][2][10], "ABA");
assert.equal(planOutside.sheets["Fora das LDs"][0][3], "MOTIVO");
assert.equal(planOutside.summary.active, plan.summary.active, "fora das LDs não infla os indicadores");
assert.equal(planOutside.sheets["Conferência Documental"].length, plan.sheets["Conferência Documental"].length);

(async () => {
  const logo = { buffer: fs.readFileSync(path.resolve(__dirname, "..", "grcon-logo-report.png")) };
  const { workbook } = buildCoordinatorWorkbook(withOutside, ExcelJS, logo);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.deepEqual(reopened.worksheets.map(s => s.name), ["Resumo", "Conferência Documental", "N-1710", "REL. PW", "Conciliação", "Fora das LDs"]);
  const out = reopened.getWorksheet("Fora das LDs");
  assert.equal(out.getCell("B2").value, "OUT-SIGEM-1");
  assert.equal(out.getCell("A3").value, "PW");
  assert.equal(out.autoFilter, "A1:E3");
  assert.equal(out.views[0].ySplit, 1);
  const control = reopened.getWorksheet("Conferência Documental");
  const argb = cell => cell.fill && cell.fill.fgColor && cell.fill.fgColor.argb;
  assert.equal(argb(control.getCell("J4")), "FFE6F6EE", "emitido: verde discreto");
  assert.equal(argb(control.getCell("J5")), "FFEDF3F8", "revisão A: emissão, a coluna Cadastro não se aplica (cor neutra)");
  assert.equal(control.getCell("J5").value, "Emissão (não é cadastro)");
  assert.equal(argb(control.getCell("J6")), "FFE8F2FF", "revisão 0 cadastrada e não emitida: azul");
  assert.equal(control.pageSetup.orientation, "landscape");
  assert.equal(control.pageSetup.fitToWidth, 1);
  const overview = reopened.getWorksheet("Resumo");
  const row = label => { for (let i = 1; i <= overview.rowCount; i++) if (String(overview.getCell("A" + i).value).startsWith(label)) return i; return 0; };
  assert.equal(overview.getCell("B" + row("A emitir no PW")).value, 1);
  assert.equal(overview.getCell("B" + row("A emitir no PW")).numFmt, "#,##0");
  assert.equal(overview.getCell("A3").value, "VISÃO GERAL");
  assert.equal(argb(overview.getCell("A3")), "FFEDF3F8", "título de seção destacado");
  assert.equal(overview.pageSetup.fitToWidth, 1);
  // Marca GRCON no cabeçalho (faixa branca) das abas Resumo e Conferência Documental.
  assert.equal(overview.getImages().length, 1, "logo no Resumo");
  assert.equal(control.getImages().length, 1, "logo na Conferência Documental");
  assert.equal(argb(control.getCell("A1")), "FFFFFFFF", "faixa da marca em fundo branco");
  assert.ok(control.getRow(1).height >= 50 && overview.getRow(1).height >= 50, "altura suficiente para a logo");
  assert.equal(control.getCell("J1").numFmt, '"PENDÊNCIAS: "0');
  assert.equal(control.getCell("J1").value, plan.summary.pending, "pendências seguem numéricas");
  assert.equal(control.getCell("L1").value, plan.sheets["Conferência Documental"][0][11], "totais de revisão não colidem com os indicadores");
  const plain = new ExcelJS.Workbook();
  await plain.xlsx.load(await buildCoordinatorWorkbook(withOutside, ExcelJS).workbook.xlsx.writeBuffer());
  assert.equal(plain.getWorksheet("Resumo").getImages().length, 0, "sem logo disponível o relatório continua válido");
  // Códigos permanecem texto.
  assert.equal(control.getCell("A4").value, code);
  assert.equal(typeof control.getCell("A4").value, "string");
  console.log("sigem_pw_excel_polish: resumo em seções, KPIs de cadastro/emissão, aba Fora das LDs condicional, cores de status, impressão e texto literal OK");
})().catch(error => { console.error(error); process.exit(1); });
// Os cinco indicadores operacionais são compartilhados com o Excel.
const overviewSource=fs.readFileSync(path.resolve(__dirname,"..","src/react/sigem-pw/components/SigemPwManagerialOverview.tsx"),"utf8");
assert.match(overviewSource,/PW_INDICATORS.map/);
assert.match(overviewSource,/onExport\(filters\)/);
