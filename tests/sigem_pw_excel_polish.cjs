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
const labels = new Map(plan.sheets.Resumo.map(row => [row[0], row[1]]));
const find = prefix => plan.sheets.Resumo.find(row => String(row[0]).startsWith(prefix));

// Indicadores novos: cadastro e emissão são situações distintas.
assert.equal(find("Documentos controlados")[1], 2);
assert.equal(find("Aguardando cadastro no PW")[1], 0);
assert.equal(find("Cadastrados, não emitidos")[1], 1);
assert.equal(find("Atendimento — cadastrados")[1], 1);
assert.equal(find("Atendimento — emitidos")[1], 0.5);
assert.ok(plan.overviewSections.length >= 4, "resumo organizado em seções");
assert.ok(plan.overviewSections.every(row => plan.sheets.Resumo[row - 1][1] === ""));
assert.ok(labels.has("Gerado em") && labels.has("Data da base PW"), "proveniência com datas no resumo");
assert.equal(plan.sheets["Fora das LDs"], undefined, "sem documentos fora das LDs a aba não é criada");
assert.deepEqual(plan.formulas.map(f => f.pwSituation), ["emitted", "registered"]);

// Com documentos fora das LDs: aba separada, sem alterar os indicadores principais.
const withOutside = structuredClone(state);
withOutside.aggregates = { "all:all": { lists: {
  sigemN1710OutsideLd: [{ document: "OUT-SIGEM-1", revision: "0", sigemStatus: "Postado", situation: "Documento fora das referências vigentes" }],
  pwN1710OutsideLd: [
    { document: "OUT-PW-1", revision: "A", pwStatus: "Liberado", pwEmission: "Sim", pwCompany: "CSG", pwSourceRow: 7, situation: "Documento fora das referências vigentes" },
    { document: "OUT-PW-1", revision: "A", pwStatus: "Liberado", pwEmission: "Sim", pwCompany: "CSG", pwSourceRow: 7, situation: "duplicado" },
  ],
} } };
const planOutside = coordinatorPlan(withOutside);
assert.deepEqual(Object.keys(planOutside.sheets), ["Resumo", "Conferência Documental", "REL. PW", "Fora das LDs"]);
assert.equal(planOutside.sheets["Fora das LDs"].length, 3, "cabeçalho + 2 registros (duplicata exata colapsada)");
assert.equal(plan.sheets["Conferência Documental"][2][10], "ABA");
assert.equal(planOutside.sheets["Fora das LDs"][0][9], "CLASSE");
assert.equal(planOutside.summary.active, plan.summary.active, "fora das LDs não infla os indicadores");
assert.equal(planOutside.sheets["Conferência Documental"].length, plan.sheets["Conferência Documental"].length);

(async () => {
  const logo = { buffer: fs.readFileSync(path.resolve(__dirname, "..", "grcon-logo-report.png")) };
  const { workbook } = buildCoordinatorWorkbook(withOutside, ExcelJS, logo);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.deepEqual(reopened.worksheets.map(s => s.name), ["Resumo", "Conferência Documental", "REL. PW", "Fora das LDs"]);
  const out = reopened.getWorksheet("Fora das LDs");
  assert.equal(out.getCell("B2").value, "OUT-SIGEM-1");
  assert.equal(out.getCell("A3").value, "PW");
  assert.equal(out.autoFilter, "A1:J3");
  assert.equal(out.views[0].ySplit, 1);
  const control = reopened.getWorksheet("Conferência Documental");
  const argb = cell => cell.fill && cell.fill.fgColor && cell.fill.fgColor.argb;
  assert.equal(argb(control.getCell("J4")), "FFE6F6EE", "emitido: verde discreto");
  assert.equal(argb(control.getCell("J5")), "FFFFF4DF", "cadastrado e não emitido: âmbar");
  assert.equal(control.pageSetup.orientation, "landscape");
  assert.equal(control.pageSetup.fitToWidth, 1);
  const overview = reopened.getWorksheet("Resumo");
  const row = label => { for (let i = 1; i <= overview.rowCount; i++) if (String(overview.getCell("A" + i).value).startsWith(label)) return i; return 0; };
  assert.equal(overview.getCell("B" + row("Atendimento — emitidos")).value, 0.5);
  assert.equal(overview.getCell("B" + row("Atendimento — emitidos")).numFmt, "0.0%");
  assert.equal(overview.getCell("B" + row("Documentos controlados")).numFmt, "#,##0");
  assert.equal(overview.getCell("A3").value, "DOCUMENTOS CONTROLADOS E CADASTRO NO PW");
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
// Contrato do painel gráfico (fonte): barras empilhadas clicáveis que filtram a relação.
{
  const chart = fs.readFileSync(path.resolve(__dirname, "..", "src/react/sigem-pw/components/SigemPwKpiCharts.tsx"), "utf8");
  assert.match(chart, /spw-chart-bar/);
  assert.match(chart, /aria-label=\{`\$\{item\.label\}: \$\{nf\(item\.value\)\}/, "segmentos acessíveis com texto, não só cor");
  for (const key of ["emitted", "notEmitted", "awaiting", "compliant", "pending", "posted", "other", "active"]) assert.ok(chart.includes(`"${key}"`), key);
  const overview = fs.readFileSync(path.resolve(__dirname, "..", "src/react/sigem-pw/components/SigemPwManagerialOverview.tsx"), "utf8");
  assert.match(overview, /<SigemPwKpiCharts /);
}
