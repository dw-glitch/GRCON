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
const { coordinatorPlan, buildCoordinatorWorkbook, MAIN_SHEET } = importTs("src/react/sigem-pw/services/sigemPwCoordinatorWorkbook.ts");
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
const count = (s, expected) => assert.deepEqual(run(s).totals, expected);
// Só a revisão 0 é cadastro: "registered" = revisões 0 já cadastradas no PW (a emitir + emitidas DA REVISÃO 0).
// Sem o 6º argumento, o teste só tem revisão 0 e portanto registered = issue + issued.
const t = (sigem=0, registerSigem=0, registerAbsent=0, issue=0, issued=0, registered=issue + issued) => ({ sigem, registerSigem, registerAbsent, registered, issue, issued });
// 1/2: mutually exclusive registration groups, faithfully based on the active query.
count(state([ref(1)], [sig(1)], []), t(1,1));
count(state([ref(1)], [], []), t(0,0,1));
// 3/4/5: planned is registered; emitted revision is never marked as pending.
count(state([ref(1)], [sig(1)], [pw(1)]), t(1,0,0,1));
count(state([ref(1)], [sig(1)], [pw(1,"0","Sim")]), t(1,0,0,0,1));
const blank = state([ref(1)], [sig(1)], [pw(1, "", "Previsto")]);
count(blank, t(1,0,0,1));
const blankIssued = state([ref(1)], [sig(1)], [pw(1, "", "Sim")]);
count(blankIssued, t(1,0,0,1)); // unknown revision cannot prove emission.
// 6: outside documents remain in the raw reconciliation, never become PW work.
const outside = run(state([ref(1)], [sig(1),sig(99)], []));
assert.deepEqual(outside.totals,t(1,1));
assert.deepEqual(outside.reconciliation,{ records:2,documents:2,pairs:2,inScopePairs:1,outsidePairs:1,duplicates:0,invalid:0,omitted:0,revision0:{ pairs:2,inScopePairs:1,outsidePairs:1 } });
assert.equal(outside.outside.length,1);
// Cadastradas no PW (= só revisões 0, a emitir + emitidas) e a conferência da Consulta Geral seguem o filtro de revisão 0.
{
  const mixedRev = state([ref(1,"0"),ref(2,"A")], [sig(1,"0"),sig(1,"A"),sig(2,"A"),sig(77,"0")], [pw(1,"0","Sim"),pw(2,"A","Previsto")]);
  const all = run(mixedRev), rev0 = filter(all,{ revisionScope:"revision0" });
  // Sequência: LD pede A no doc 2 → o PW precisa de 0 e A; SIGEM 0/A no doc 1 → 0 e A. Revisão A nunca é "cadastrar".
  assert.deepEqual(all.rows.map(row => [row.code.slice(-3), row.revision, row.action]), [["001","0","Concluído"],["001","A","Emitir no PW"],["002","0","Cadastrar no PW"],["002","A","Emitir no PW"]]);
  const rev0Registered = all.rows.filter(row => row.revision === "0" && row.action !== "Cadastrar no PW").length;
  assert.equal(all.totals.registered, rev0Registered, "Cadastradas = só revisões 0 com cadastro no PW");
  assert.equal(filter(all,{ indicator:"registered" }).rows.length, all.totals.registered);
  assert.ok(filter(all,{ indicator:"registered" }).rows.every(row => row.revision === "0"), "revisão A nunca conta como cadastro");
  assert.equal(rev0.rows.every(row=>row.revision==="0"), true);
  assert.equal(rev0.totals.registered, rev0.totals.issue + rev0.totals.issued);
  assert.equal(rev0.totals.registered, all.totals.registered, "cadastro é só revisão 0: o número é o mesmo nos dois escopos");
  // pares da Consulta Geral: integral x revisão 0
  assert.equal(all.reconciliation.pairs, 4);
  assert.equal(all.reconciliation.revision0.pairs, 2);
  assert.equal(all.reconciliation.revision0.inScopePairs, 1);
  assert.equal(all.reconciliation.revision0.outsidePairs, 1);
}
// 7/12: LD B, SIGEM 0/A/B, PW 0 emitted + A planned. Só a revisão 0 é cadastro; A e B são emissões, em sequência.
const revisions = state([ref(1,"B")], [sig(1,"0"),sig(1,"A"),sig(1,"B")], [pw(1,"0","Sim"),pw(1,"A")]);
count(revisions,t(3,0,0,2,1,1));
assert.deepEqual(run(revisions).rows.map(row => [row.revision,row.action]), [["0","Concluído"],["A","Emitir no PW"],["B","Emitir no PW"]]);
// Sequência: SIGEM em B, PW sem nada → o PW cadastra a 0 e emite 0, A e B (a revisão A não consta no SIGEM, mas precisa ser emitida).
const sequence = run(state([ref(1,"B")], [sig(1,"B")], []));
assert.deepEqual(sequence.rows.map(row => [row.revision,row.action,row.inSigem]), [["0","Cadastrar no PW",false],["A","Emitir no PW",false],["B","Emitir no PW",true]]);
assert.deepEqual(sequence.totals, t(1,0,1,2,0,0));
// Nenhuma revisão A em diante vira "Cadastrar no PW", mesmo sem nenhuma linha no PW.
assert.ok(run(state([ref(1,"C")], [sig(1,"C")], [pw(1,"0","Sim")])).rows.filter(row => row.revision !== "0").every(row => row.action === "Emitir no PW"));
// Fora de sequência: B emitida com A pendente é sinalizada (só informa; as contagens não mudam).
const outOfOrder = run(state([ref(1,"B")], [sig(1,"B")], [pw(1,"0","Sim"), pw(1,"B","Sim")]));
assert.deepEqual(outOfOrder.rows.map(row => [row.revision,row.missingBefore]), [["0",[]],["A",[]],["B",["A"]]]);
// Em sequência (0, A, B emitidas) e nenhuma emitida: nada é sinalizado.
assert.ok(run(state([ref(1,"B")], [sig(1,"B")], [pw(1,"0","Sim"), pw(1,"A","Sim"), pw(1,"B","Sim")])).rows.every(row => !row.missingBefore.length));
// O Excel do coordenador acompanha a tela: a coluna Cadastro da linha B informa que falta a A.
{
  const planOut = coordinatorPlan(state([ref(1,"B")], [sig(1,"B")], [pw(1,"0","Sim"), pw(1,"B","Sim")]));
  const master = planOut.sheets[MAIN_SHEET].flat().map(String);
  assert.ok(master.some(cell => /FORA DE SEQUÊNCIA: falta A/.test(cell)), "Excel marca a revisão emitida fora de sequência");
  assert.equal(master.filter(cell => /FORA DE SEQUÊNCIA/.test(cell)).length, 1, "só a revisão B é marcada");
  // Coluna STATUS SIGEM (L): status do código na Consulta Geral; sem a revisão no SIGEM, mostra o das outras revisões.
  const statusPlan = coordinatorPlan(state([ref(1,"B")], [{ ...sig(1,"B"), status: "Postado" }], [pw(1,"0","Sim")]));
  const statusRows = statusPlan.sheets[MAIN_SHEET];
  assert.equal(statusRows[2][11], "STATUS SIGEM");
  const byRevision = Object.fromEntries(statusRows.slice(3).map(row => [row[1], row[11]]));
  assert.equal(byRevision.B, "Postado");
  assert.equal(byRevision.A, "Revisão não consta no SIGEM · Rev. B: Postado");
  assert.equal(byRevision["0"], "Revisão não consta no SIGEM · Rev. B: Postado");
  assert.equal(statusRows[2][12], "Rev. 0", "as colunas de revisão começam depois do STATUS SIGEM");
  // Revisão presente no SIGEM mas sem status: não pode dizer que não consta (a coluna E diz que consta).
  const noStatus = coordinatorPlan(state([ref(1,"0")], [{ ...sig(1,"0"), status: "" }], [pw(1,"0","Sim")])).sheets[MAIN_SHEET].slice(3)[0];
  assert.equal(noStatus[4], "Consta no SIGEM");
  assert.equal(noStatus[11], "Consta no SIGEM, sem status informado");
  const absent = coordinatorPlan(state([ref(1,"0")], [], [pw(1,"0","Sim")])).sheets[MAIN_SHEET].slice(3)[0];
  assert.equal(absent[11], "Não consta no SIGEM");
}

assert.ok(sequence.rows.every(row => !row.missingBefore.length));
// Revisões sem ordem conhecida (numéricas, #1…) não são preenchidas: só existem as informadas.
assert.deepEqual(run(state([ref(1,"#1")], [sig(1,"#1")], [pw(1,"0","Sim")])).rows.map(row => row.revision), ["#1"]);
// PR #403: Não = historical emission. Both 0/A are issued; neither needs an X.
const historical = state([ref(1,"A")], [sig(1,"0"),sig(1,"A")], [pw(1,"0","Não"),pw(1,"A","Sim")]);
count(historical,t(2,0,0,0,2,1));
assert.ok(run(historical).rows.every(row=>row.action==="Concluído"));
for (const flag of ["Não","Nao","NAO"," não "]) count(state([ref(1)],[sig(1)],[pw(1,"0",flag)]),t(1,0,0,0,1));
const historicalChoice=state([ref(1)],[sig(1)],[pw(1),pw(1,"0","Não")]);
assert.equal(run(historicalChoice).rows[0].pwEvidence.lastEmission,"Não","historical evidence must be selected over a planned duplicate");
const currentChoice=state([ref(1)],[sig(1)],[pw(1,"0","Não"),pw(1,"0","Sim")]);
assert.equal(run(currentChoice).rows[0].pwEvidence.lastEmission,"Sim","current evidence wins when both issued flags exist");
for (const flag of ["","Desconhecido"]) count(state([ref(1)],[sig(1)],[pw(1,"0",flag)]),t(1,0,0,1));
count(state([ref(1)],[sig(1)],[pw(1,"","Não")]),t(1,0,0,1));
// 8/9: duplicate LD and query entries never duplicate a pending pair.
const duplicates = state([ref(1),ref(1,"0",{referenceSources:["LD2.xlsx"]})], [sig(1),sig(1)], [pw(1),pw(1)]);
count(duplicates,t(1,0,0,1));
assert.deepEqual(run(duplicates).rows[0].sources,["LD1.xlsx","LD2.xlsx"]);
assert.equal(run(duplicates).reconciliation.duplicates,1);
assert.ok(run(duplicates).diagnostics.some(row=>row.source==="PW"));
// 11: only column C companies CSG/QTM prove registration.
count(state([ref(1),ref(2),ref(3),ref(4)],[],[pw(1,"0","Previsto","QTM"),pw(2,"0","Sim","CSG"),pw(3,"0","Sim","ABC"),pw(4,"0","Sim","")]),t(0,0,2,1,1));
// Typographic variants use the existing central identity function.
const variants=state([ref(1)], [sig(1,"REV. 0",{document:doc(1).replaceAll("-","‑")})], [pw(1)]);
count(variants,t(1,0,0,1));
// Unknown query revision cannot prove absence; no invented X or false negative.
const unknown=run(state([ref(1,"B")],[sig(1,""),sig(1,"0")],[]));
assert.equal(unknown.rows.length,1);
assert.equal(unknown.rows[0].revision,"0");
assert.equal(unknown.totals.registerAbsent,0);
// CV, cancellation, conflicting references and missing revisions stay diagnostic.
for(const extra of [{documentClass:"CV"},{status:"CANCELADO"},{referenceConflict:true},{revision:""}]) {
  const r=run(state([ref(1,"0",extra)],[],[])); assert.equal(r.rows.length,0); assert.ok(r.diagnostics.length);
}
// 13: missing sources and parsing failure never expose confirmed zeros or export.
for (const patch of [{model:null},{analysisError:"Arquivo inválido"},{pw:{meta:null,records:[]}},{sigem:{meta:null,records:[]}}]) {
  const broken={...state([ref(1)],[sig(1)],[]),...patch};
  assert.equal(run(broken).ready,false); assert.throws(()=>coordinatorPlan(broken));
}
for (const broken of [state([{}],[sig(1)],[]), state([ref(1)],[{}],[])]) {
  assert.equal(run(broken).ready,false,"base não vazia sem pares interpretáveis não pode exibir zeros confirmados");
  assert.throws(()=>coordinatorPlan(broken));
}
// 14: replacement imports invalidate the cache, leave the prior snapshot untouched.
const before=state([ref(1)],[sig(1)],[]); const prior=run(before);
assert.equal(run(before),prior);
const after={...before,pw:state([ref(1)],[sig(1)],[pw(1,"0","Sim")]).pw,model:{...before.model}};
count(after,t(1,0,0,0,1)); assert.equal(prior.rows[0].action,"Cadastrar no PW");
// 10: indicators, class totals, XLSX and filtered exports must agree exactly.
(async()=>{
  const historicalBook=buildCoordinatorWorkbook(historical,ExcelJS);
  const reopenedHistorical=new ExcelJS.Workbook(); await reopenedHistorical.xlsx.load(await historicalBook.workbook.xlsx.writeBuffer());
  const historicalMain=reopenedHistorical.getWorksheet(MAIN_SHEET);
  for (const number of [4,5]) {
    assert.equal(historicalMain.getCell(`I${number}`).value,"Concluído");
    assert.ok(!historicalMain.getRow(number).values.includes("X"),"issued historical revisions must not create X markers");
  }
  assert.equal(historicalMain.getCell("H4").result,"Não");
  const historicalSummary=new Map(historicalBook.plan.sheets.Resumo.map(row=>[row[0],row[1]]));
  assert.equal(historicalSummary.get("A emitir no PW"),0);
  assert.equal(historicalSummary.get("Emitidas no PW"),2);
  const mixed=state([ref(1,"B"),ref(2),ref(3,"I",{documentClass:"ET",sheetName:"ET"}),ref(4,"AA")],[sig(1,"0"),sig(1,"A"),sig(1,"B"),sig(3,"I"),sig(99)],[pw(1,"0","Sim"),pw(1,"A"),pw(3,"I")]);
  const original=run(mixed);
  for(const filters of [{},{revisionScope:"revision0"},{documentClass:"ET"},{indicator:"registerAbsent"},{action:"Emitir no PW"},{query:"001"},{sigem:"Consta no SIGEM"}]) {
    const projected=filter(original,filters);
    const {workbook,plan}=buildCoordinatorWorkbook(mixed,ExcelJS,undefined,filters);
    assert.deepEqual(plan.report.totals,projected.totals);
    const labels=new Map(plan.sheets.Resumo.map(row=>[row[0],row[1]]));
    for(const item of PW_INDICATORS) {
      assert.equal(labels.get(item.label),projected.totals[item.key]);
      assert.equal(projected.byClass.reduce((sum,row)=>sum+row[item.key],0),projected.totals[item.key]);
    }
    const reopened=new ExcelJS.Workbook(); await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
    const control=reopened.getWorksheet(MAIN_SHEET);
    assert.equal(control.rowCount,projected.rows.length+3);
    assert.equal(control.views[0].ySplit,3);
    const headers=plan.sheets[MAIN_SHEET][2];
    projected.rows.forEach((row,i)=>{
      const number=i+4;
      assert.equal(control.getCell(`I${number}`).value,row.action);
      assert.equal(control.getCell(`E${number}`).value,row.sigemSituation);
      const xs=headers.flatMap((header,col)=>control.getRow(number).getCell(col+1).value==="X" ? [header] : []);
      assert.deepEqual(xs,row.pwEmitted?[]:["Rev. "+row.revision]);
      assert.equal(control.getCell(`F${number}`).result ?? "",String(row.pwEvidence?.revisionComplete||row.pwEvidence?.revision||""));
      assert.equal(control.getCell(`A${number}`).type,ExcelJS.ValueType.String);
    });
    for(const name of plan.classSheets) {
      const sheet=reopened.getWorksheet(name);
      assert.equal(sheet.rowCount,plan.sheets[name].length);
      assert.equal(sheet.getCell("K4").value,name);
      for(const formula of plan.classFormulas[name]) assert.equal(sheet.getCell(`F${formula.excelRow}`).formula,formula.f);
    }
    assert.equal(reopened.getWorksheet("REL. PW").getCell("BR2").value,'=HYPERLINK("https://example.invalid","literal")');
    assert.ok(reopened.getWorksheet("Fora das LDs"));
  }
  // Mount the real React component and interact with filters/export using jsdom.
  const {JSDOM}=require("jsdom"); const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost/"});
  global.window=dom.window;global.document=dom.window.document;window.GrconSigemPwDashboard=Core;
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const React=require("react"); const {createRoot}=require("react-dom/client");
  const {SigemPwManagerialOverview}=importTs("src/react/sigem-pw/components/SigemPwManagerialOverview.tsx");
  const mount=createRoot(document.getElementById("root")); let exportFilters;
  await React.act(async()=>mount.render(React.createElement(SigemPwManagerialOverview,{state:mixed,onExport:value=>exportFilters=value})));
  assert.equal(document.querySelectorAll(".spw-operation-kpi").length,6,"cinco indicadores originais + Cadastradas no PW");
  const registration=document.querySelector('[data-indicator="registerAbsent"]');
  await React.act(async()=>registration.click());
  assert.equal(registration.getAttribute("aria-pressed"),"true");
  const exportButton=[...document.querySelectorAll("button")].find(el=>el.textContent==="Exportar este escopo");
  await React.act(async()=>exportButton.click());
  assert.equal(exportFilters.indicator,"registerAbsent");
  assert.deepEqual(coordinatorPlan(mixed,exportFilters).report.totals,filter(original,exportFilters).totals);
  await React.act(async()=>mount.render(React.createElement(SigemPwManagerialOverview,{state:{...mixed,model:null},onExport:()=>{}})));
  assert.ok([...document.querySelectorAll(".spw-operation-kpi strong")].every(el=>el.textContent==="—"));
  await React.act(async()=>mount.unmount()); dom.window.close();
  console.log("SIGEM × PW: 14 cenários operacionais, X por revisão, paridade XLSX/filtros/classes, reimportação e interação React aprovados.");
})().catch(error=>{console.error(error);process.exitCode=1;});
