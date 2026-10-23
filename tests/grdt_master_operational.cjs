"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const Q = require("../grdt_triage_query.js"), C = require("../history_classification.js");
const row = { document: "DOC-001", name: "DOC-001_0.pdf", revision: "A", record: { revision: "0", allocation: "ALOC-17" },
  fileOrigin: "Cofre", files: [{name:"DOC-001_0.pdf"}, {name:"DOC-001_0.dwg"}] };
const issued = C.classify(row.document, row.revision, C.buildIndex([{id:"1",egrdtNumber:"GRDT-123",files:[{document:row.document,revision:"0"}]}]));
assert.ok(Q.matches(row, { origin:"COFRE",extension:"PDF",revision:"changed",history:"new-revision",allocation:"known" }, issued,{complete:true}));
for (const filters of [{origin:"PASTA LOCAL"},{extension:"XLSX"},{history:"never"},{allocation:"unknown"}]) assert.equal(Q.matches(row,filters,issued,{complete:true}),false);
assert.ok(Q.matches(row,{extension:"DWG"},issued,{complete:true}));
assert.equal(Q.historyKind({}, {complete:false}), "unconfirmed");
assert.equal(Q.historyKind({}, {complete:true}), "never");
assert.equal(Q.historyKind(issued, {complete:false}), "issued");
assert.equal(Q.origin({name:"D.pdf"}),"Relação sem arquivo físico");
assert.match(Q.searchText(row,"LD-001","GRDT-123"), /GRDT-123/);
assert.match(Q.searchText(row,"LD-001","GRDT-123"), /COFRE/);

// Regressão da seleção automática por status SIGEM na Central de GRDT.
const Core = require("../core.js");
const policy = (status, extra={}) => Q.selectionPolicy({
  document: "PR-5290.00-22313-175-C1O-013", revision: "B",
  decision: Core.READY, status, ...extra,
});
for (const status of ["Em Análise", "Em Analise", "Em Workflow", " em workflow ", "EM ANÁLISE"]) {
  const result = policy(status);
  assert.equal(result.kind, "analysis", status);
  assert.equal(result.autoEligible, false, status);
  assert.equal(result.manualOnly, true, status);
  assert.equal(result.label, "Em análise", status);
}
for (const status of ["Não Postado", "Recusado", "Para Construção"]) {
  assert.equal(policy(status).autoEligible, true, status);
}
for (const status of ["", "Sem status", "Pendente Certificação", "Cancelado"]) {
  assert.equal(policy(status).autoEligible, false, status);
}
const inherited = {document:"PR-5290.00-22313-175-C1O-013",revision:"C",
  status:"Em Análise",sigemRevisionStatus:"Não Postado",blockingRevision:"B",
  blockingRevisionStatus:"Em Workflow",decision:Core.DISCARD,hardBlock:false};
assert.equal(Q.selectionPolicy(inherited).label,"Em análise (rev. B)");
assert.equal(Q.selectionPolicy(inherited).autoEligible,false);
assert.equal(Q.selectionPolicy(inherited).manualOnly,true);
const inheritedSelected = new Set([0]), inheritedManual = new Set([0]);
assert.equal(Q.selectionAuthorized(inherited,0,inheritedSelected,inheritedManual),false);
inherited.manualSigemSelection = {revision:"C",kind:"analysis",statusKey:"EM ANALISE",blockingRevision:"B"};
assert.equal(Q.selectionAuthorized(inherited,0,inheritedSelected,inheritedManual),true,"exceção marcada conscientemente");
inherited.blockingRevision = "A";
assert.equal(Q.selectionAuthorized(inherited,0,inheritedSelected,inheritedManual),false,"mudança da revisão bloqueadora exige nova exceção");
// A alocação negativa é a pendência principal mesmo quando o SIGEM está Em Análise.
for (const status of ["Não Postado", "Em Análise", "Em Workflow"]) {
  for (const [kind, record] of [
    ["not_allocated", {allocationStatus:"NÃO ALOCADO"}],
    ["not_allocated", {record:{allocationStatus:"Não alocado"}}],
    ["not_allocated", {allocationFinding:{kind:"not_allocated",label:"Não Alocado"}}],
    ["conflict", {allocationFinding:{kind:"conflict"}}],
    ["conflict", {blockCode:"not_allocated_conflict"}],
  ]) {
    const row = {document:"PR-5290.00-22313-175-C1O-013",revision:"B",
      status,decision:Core.READY,hardBlock:false,...record};
    const result=Q.selectionPolicy(row);
    assert.equal(Q.allocationAlert(row),kind);
    assert.equal(result.allocation,kind);
    assert.equal(result.autoEligible,false,`${status} / ${kind}`);
    assert.equal(result.manualOnly,true);
    assert.equal(result.label,kind==="conflict"?"Conflito de alocação":"Não Alocado");
    assert.equal(Q.selectionAuthorized(row,0,new Set([0]),new Set()),false);
  }
}
const nonAllocatedManual = {document:"DOC-NEG",revision:"B",status:"Não Postado",decision:Core.READY,
  allocationStatus:"NÃO ALOCADO"};
const nonAllocatedSelected=new Set([0]),nonAllocatedManualIndices=new Set([0]);
assert.equal(Q.selectionAuthorized(nonAllocatedManual,0,nonAllocatedSelected,nonAllocatedManualIndices),false);
nonAllocatedManual.manualSigemSelection={kind:"not_posted",revision:"B",statusKey:"NAO POSTADO"};
assert.equal(Q.selectionAuthorized(nonAllocatedManual,0,nonAllocatedSelected,nonAllocatedManualIndices),true,
  "inclusão individual excepcional deve continuar disponível");
assert.equal(Q.allocationAlert({allocationStatus:"ALOCADO"}),"");
assert.equal(Q.selectionPolicy({status:"Não Postado",decision:Core.READY,allocationStatus:"ALOCADO"}).autoEligible,true);
assert.equal(Q.allocationAlert({allocationStatus:""}),"",
  "célula vazia não representa automaticamente Não Alocado");
assert.equal(policy("Em análise", {decision: Core.REVIEW}).autoEligible, false);
assert.equal(policy("Recusado", {hardBlock: true}).autoEligible, false);
// "Repostagem" informa histórico, mas não autoriza selecionar item em análise.
const repro = { document: "PR-5290.00-22313-175-C1O-013", revision: "B",
  decision: Core.READY, status: "Em análise", emissionKind: "REPOST" };
const selected = new Set([0]), manual = new Set();
assert.equal(Q.selectionAuthorized(repro,0,selected,manual),false);
manual.add(0); // Índice manual por si só não vale sem registro de ação explícita.
assert.equal(Q.selectionAuthorized(repro,0,selected,manual),false);
repro.manualSigemSelection = {revision:"B",kind:"analysis",statusKey:"EM ANALISE",selectedAt:"2026-10-21T12:00:00.000Z"};
assert.equal(Q.selectionAuthorized(repro,0,selected,manual),true);
repro.status = "Em Workflow";
assert.equal(Q.selectionAuthorized(repro,0,selected,manual),true,"aliases workflow/análise mantêm decisão explícita");
repro.revision = "C";
assert.equal(Q.selectionAuthorized(repro,0,selected,manual),false,"uma aprovação não autoriza revisão diferente");
repro.revision = "B"; repro.status = "Sem status";
assert.equal(Q.selectionAuthorized(repro,0,selected,manual),false,"status mudou: precisa nova decisão explícita");
manual.clear();
assert.equal(Q.selectionAuthorized(repro,0,selected,manual),false);
selected.clear();
assert.equal(Q.selectionAuthorized(repro,0,selected,manual),false);
const appSource = fs.readFileSync(require.resolve("../app.js"), "utf8");
assert.match(appSource,/if \(rowCanAutoInclude\(row\)\) state\.selected\.add\(index\);/);
assert.match(appSource,/if \(!setRowSelected\(index, event\.target\.checked\)\)/);
assert.match(appSource,/function guardedSelectedIndices/);
assert.match(appSource,/E\.createPlan\(state\.results, guardedSelectedIndices\(\)/);
assert.match(appSource,/const physicalSelection = guardedSelectedIndices\(true\);/);
assert.match(appSource,/row\.manualSigemSelection = \{/);
assert.match(appSource,/rowStatusPolicy\(row\)\.manualOnly/);
assert.match(appSource,/allocation-blocked/);
assert.match(appSource,/const allocationClass = allocationAlert/);
assert.match(appSource,/allocationAlert\(row\) === "not_allocated"\) return "bloqueado"/);
assert.match(fs.readFileSync(require("node:path").join(__dirname,"..","grdt-central-ux.css"),"utf8"),
  /--grdt-blocked-ink: #8b3a46/);
assert.doesNotMatch(appSource,/if \(row\.decision === C\.READY && !row\.hardBlock && rowOutputSources\(row\)\.length\) state\.selected\.add\(index\);/);
console.log("GRDT SIGEM: análise excluída automaticamente, seleção individual, aliases, revisão, repostagem e proteção dos downloads OK.");

// Executa os mesmos helpers e listener usados pela tela, com a política real.
// A lista filtrada pode conter linhas fora da janela virtual e índices reordenados.
function selectionHarness(rows, visible = rows.map((_, index) => index)) {
  const events = new Map(), audits = [], notices = [];
  const state = { results: rows, selected: new Set(), manualForceInclude: new Set(), resultVersion: 0 };
  const checkbox = { addEventListener: (name, listener) => events.set(name, listener) };
  const headerStart = appSource.indexOf("    const filtered = filteredResults();", appSource.indexOf("  function renderAll()"));
  const headerIndices = appSource.slice(headerStart, appSource.indexOf("    const physicalSelected = [];", headerStart));
  const headerState = appSource.match(/    els\.selectAllReady\.disabled = [^\n]+\n    els\.selectAllReady\.checked = [^\n]+\n    els\.selectAllReady\.indeterminate = [^\n]+/)[0];
  const ctx = vm.createContext({ state, C: Core, TriageQuery: Q, Date, Set,
    els: { selectAllReady: checkbox },
    window: { GrconCloud: { state: { session: { user: { id: "QA-operator" } } } } },
    resultIndex: item => rows.indexOf(item),
    rowOutputSources: item => item.files || [],
    filteredResultIndices: () => [...visible],
    filteredResults: () => visible.map(index => rows[index]),
    resolveRowSigemStatus: item => ({ status: item.sigemStatus || item.status }),
    applyRowSigemStatus: (item, resolved) => { item.status = resolved.status; },
    auditManualGrdtChange: (...args) => audits.push(args),
    showToast: (...args) => notices.push(args),
    renderAll: () => vm.runInContext(`reconcileSelectedRows(); { ${headerIndices} ${headerState} }`, ctx),
  });
  vm.runInContext(appSource.slice(appSource.indexOf("  function manualAllocationOverrideAllowed("),
    appSource.indexOf("  function refreshPendingAllocationBundle(")), ctx);
  const handlerStart = appSource.indexOf('  els.selectAllReady.addEventListener("change"');
  vm.runInContext(appSource.slice(handlerStart, appSource.indexOf("  if (els.resultsScroll)", handlerStart)), ctx);
  const render = () => ctx.renderAll();
  render();
  return { state, checkbox, audits, notices, render,
    filter: indices => { visible = indices; render(); },
    toggle: checked => { checkbox.checked = checked; events.get("change")({ target: checkbox }); },
    individual: (index, checked) => vm.runInContext(`setRowSelected(${index}, ${checked}); renderAll();`, ctx),
    output: () => [...vm.runInContext("guardedSelectedIndices()", ctx)],
  };
}
const selectionRow = (status, extra = {}) => ({ document: "DOC", revision: "B", status,
  decision: Core.READY, files: [{ name: "DOC_B.pdf" }], ...extra });
const manualRows = [
  selectionRow("Em Análise"),
  selectionRow("Em Workflow", { blockingRevision: "A", decision: Core.DISCARD }),
  selectionRow("Não Alocado", { sigemStatus: "Não Postado", hardBlock: true,
    blockCode: "not_allocated", allocationStatus: "NÃO ALOCADO" }),
  selectionRow("Sem status", { decision: Core.REVIEW }),
];
const allManual = selectionHarness(manualRows);
assert.equal(allManual.checkbox.disabled, false, "cabeçalho habilitado mesmo sem elegíveis automáticos");
allManual.toggle(true);
assert.deepEqual([...allManual.state.selected], [0, 1, 2, 3]);
assert.deepEqual(allManual.output(), [0, 1, 2, 3], "inclusão manual permanece autorizada após reconciliar a seleção");
assert.deepEqual([...allManual.state.manualForceInclude], [0, 1, 2, 3]);
assert.equal(allManual.checkbox.checked, true);
assert.equal(allManual.checkbox.indeterminate, false);
assert.equal(manualRows[1].manualSigemSelection.blockingRevision, "A");
assert.equal(manualRows[2].manualSigemSelection.kind, "not_posted", "registra o status real após resolver Não Alocado");
assert.equal(manualRows[2].allocationStatus, "NÃO ALOCADO", "preserva alerta da LD");
assert.equal(allManual.audits.length, 4);
assert.equal(allManual.notices.length, 1, "um aviso agregado para o lote");
for (const item of manualRows) {
  assert.equal(item.manualSigemSelection.selectedBy, "QA-operator");
  assert.ok(item.manualSigemSelection.selectedAt);
  assert.equal(Q.selectionPolicy(item).autoEligible, false, "seleção manual não muda a elegibilidade automática");
}
allManual.toggle(true);
assert.equal(allManual.audits.length, 4, "não duplica auditoria de itens já selecionados");
allManual.toggle(false);
assert.equal(allManual.state.selected.size, 0);
assert.equal(allManual.state.manualForceInclude.size, 0);
assert.ok(manualRows.every(item => item.manualSigemSelection === null), "desmarcar tudo revoga exceções manuais");

const mixed = selectionHarness([
  selectionRow("Não Postado"), selectionRow("Em Análise"),
  selectionRow("Recusado", { hardBlock: true, blockCode: "invalid_file" }),
  selectionRow("Em Análise"),
]);
mixed.individual(3, true);
mixed.filter([2, 1, 0]);
mixed.toggle(true);
assert.deepEqual([...mixed.state.selected].sort(), [0, 1, 3], "seleciona por índice-fonte e preserva itens fora do filtro");
assert.deepEqual([...mixed.state.manualForceInclude].sort(), [1, 3]);
assert.equal(mixed.state.results[2].manualSigemSelection, undefined, "bloqueio técnico não recebe autorização");
assert.equal(mixed.checkbox.checked, true, "itens bloqueados não impedem marcar o cabeçalho");
mixed.individual(1, false);
assert.equal(mixed.checkbox.indeterminate, true);
assert.equal(mixed.checkbox.checked, false);
mixed.toggle(true);
assert.equal(mixed.checkbox.checked, true);
mixed.toggle(false);
assert.deepEqual([...mixed.state.selected], [3], "desmarca só os resultados do filtro");
assert.equal(mixed.state.results[1].manualSigemSelection, null);
mixed.filter([2]);
assert.equal(mixed.checkbox.disabled, true, "somente bloqueados técnicos");
mixed.filter([]);
assert.equal(mixed.checkbox.disabled, true, "nenhum resultado");
mixed.filter([1, 0]);
mixed.state.downloadPreparing = true;
mixed.render();
assert.equal(mixed.checkbox.disabled, true);
mixed.toggle(true);
assert.deepEqual([...mixed.state.selected], [3], "download em andamento não permite alterar a seleção");
const virtual = selectionHarness(Array.from({ length: 550 }, () => selectionRow("Em Análise")));
virtual.toggle(true);
assert.equal(virtual.output().length, 550, "seleciona a lista inteira, inclusive fora da janela virtual");
virtual.toggle(false);
assert.equal(virtual.state.selected.size, 0);
console.log("GRDT selecionar tudo: manuais, lote misto, filtros, índices, virtualização, cabeçalho e auditoria OK.");

// A cor acompanha o problema real e o rótulo mantém a pendência após seleção.
const visualRows = [
  selectionRow("Não Postado"),
  selectionRow("Não Postado", { allocationStatus: "NÃO ALOCADO" }),
  selectionRow("Em Workflow", { blockingRevision: "A" }),
  selectionRow("Não Postado", { decision: Core.REVIEW }),
  selectionRow("Sem status"),
  selectionRow("Não Postado", { blockCode: "not_allocated_conflict" }),
  selectionRow("Não Postado", { hardBlock: true, blockCode: "invalid_file" }),
  selectionRow("Não Postado"),
];
const visualState = { results: visualRows, selected: new Set([0, 1, 2, 3, 4, 5]), manualForceInclude: new Set([1, 2, 3, 4, 5]) };
for (const index of visualState.manualForceInclude) {
  const item = visualRows[index], policy = Q.selectionPolicy(item);
  item.manualSigemSelection = { revision: "B", kind: policy.kind,
    statusKey: Core.normalizeSigemStatus(policy.status).key, blockingRevision: item.blockingRevision || "" };
}
const visualCtx = vm.createContext({ state: visualState, C: Core, TriageQuery: Q,
  resultIndex: item => visualRows.indexOf(item) });
vm.runInContext(appSource.slice(appSource.indexOf("  function manualAllocationOverrideAllowed("),
  appSource.indexOf("  function rowCanBeEdited(")), visualCtx);
vm.runInContext(appSource.slice(appSource.indexOf("  function rowStatusPolicy("),
  appSource.indexOf("  // Ação explícita do operador")), visualCtx);
vm.runInContext(appSource.slice(appSource.indexOf("  function rowIncludedForGeneration("),
  appSource.indexOf("  function guardedSelectedIndices(")), visualCtx);
vm.runInContext(appSource.slice(appSource.indexOf("  function compactDecisionLabel("),
  appSource.indexOf("  function decisionGroupKey(")), visualCtx);
const expectedVisualClasses = ["ready", "allocation-blocked", "in-analysis", "review", "unresolved", "allocation-conflict", "technical-blocked", "excluded"];
for (let index = 0; index < visualRows.length; index += 1) {
  assert.equal(vm.runInContext(`selectionSituationClass(state.results[${index}], ${index})`, visualCtx), expectedVisualClasses[index]);
}
assert.equal(vm.runInContext("selectionSituationLabel(state.results[0], 0)", visualCtx), "Pronto");
assert.match(vm.runInContext("selectionSituationLabel(state.results[1], 1)", visualCtx), /Não Alocado · incluído manualmente/);
assert.match(vm.runInContext("selectionSituationLabel(state.results[2], 2)", visualCtx), /Em análise \(rev\. A\) · incluído manualmente/);
assert.equal(vm.runInContext("selectionSituationLabel(state.results[6], 6)", visualCtx), "Bloqueado");
const statusCss = fs.readFileSync(require.resolve("../grdt-central-ux.css"), "utf8");
const palettes = [...statusCss.matchAll(/--grdt-status-bg:\s*(#[a-f\d]+);\s*--grdt-status-ink:\s*(#[a-f\d]+);\s*--grdt-status-border:\s*(#[a-f\d]+);/gi)];
assert.equal(palettes.length, 8);
assert.equal(new Set(palettes.map(match => match[1])).size, 8, "oito fundos distintos");
assert.equal(new Set(palettes.map(match => match[2])).size, 8, "oito cores de texto distintas");
const luminance = hex => hex.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255)
  .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
for (const [, background, ink] of palettes) {
  const values = [luminance(background), luminance(ink)];
  assert.ok((Math.max(...values) + 0.05) / (Math.min(...values) + 0.05) >= 4.5,
    `contraste de texto legível: ${ink} sobre ${background}`);
}
assert.match(statusCss, /tr\.result-row\.manually-included:hover > td\s*\{\s*background: var\(--grdt-status-surface\) !important;/);
for (const key of ["pronto", "bloqueado", "descartar", "revisar", "nao_localizado"]) {
  assert.ok(statusCss.includes(`.summary-item[data-filter="${key}"]`), `resumo com a mesma paleta: ${key}`);
}
const allocationVisualSource = appSource.match(/const allocationClass = allocationAlert[\s\S]*?;/)[0];
assert.equal(vm.runInNewContext(`${allocationVisualSource} allocationClass;`, {
  allocationAlert: "", allocationVisual: { kind: "allocated" }, row: { hardBlock: true },
}), "allocated", "bloqueio técnico não pinta de vermelho uma alocação confirmada");
console.log("GRDT cores: pronto, não alocado, análise, conferência, não identificado, conflito, bloqueado e excluído distintos OK.");

function harness() {
  const events=new Map(), pending=[];
  const root={GrconHistoryClassification:C,GrconPostingBatchPlanner:require("../posting_batch_planner.js"),
    GrconCloud:{state:{membership:{workspace_id:"W1"},session:{user:{id:"U1"}}}, loadClassificationHistory:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))},
    GrconHistory:{read:()=>[]},addEventListener:(name,fn)=>events.set(name,fn),dispatchEvent:()=>{}};
  const ctx={window:root,document:{addEventListener:()=>{}},localStorage:{getItem:()=>null},CustomEvent:class {},console};
  vm.runInNewContext(fs.readFileSync(require.resolve("../posting_flow.js"),"utf8"),ctx);
  return {root,pending,events,flow:root.GrconPostingFlow};
}
(async()=>{
  const h=harness();
  const first=h.flow.refresh();await Promise.resolve();
  assert.equal(h.pending.length,1);
  h.root.GrconCloud.state.membership.workspace_id="W2";
  h.events.get("grcon:cloud-state")();
  const second=h.flow.refresh();await Promise.resolve();
  assert.equal(h.pending.length,2,"A nova sessão não deve aguardar a consulta antiga");
  h.pending[1].resolve([{id:"new",workspaceId:"W2",egrdtNumber:"NEW",files:[{document:"D",revision:"A"}]}]);await second;
  h.pending[0].resolve([{id:"old",workspaceId:"W1",egrdtNumber:"OLD",files:[{document:"D",revision:"B"}]}]);await first;
  assert.equal(h.flow.lookup("D","A").latestEmission.grdt,"NEW");
  assert.equal(h.flow.status().complete,true);
  h.root.GrconCloud.state.session.user.id="U2";h.events.get("grcon:cloud-state")();
  assert.equal(h.flow.status().complete,false,"Troca de usuário invalida o índice mesmo no mesmo contrato");
  const failing=h.flow.refresh();await Promise.resolve();h.pending[2].reject(new Error("offline"));await failing;
  assert.equal(h.flow.status().error,"Não foi possível consultar o histórico.");
  assert.equal(h.flow.lookup("NEW-DOC","0").emissionKind, "");
  const retry=h.flow.refresh(true);await Promise.resolve();h.pending[3].resolve([]);await retry;
  assert.equal(h.flow.status().error,"");assert.equal(h.flow.status().complete,true);
  assert.equal(h.flow.lookup("NEW-DOC","0").emissionKind,"FIRST_POSTING");
  console.log("GRDT master: filtros combinados, história incompleta, concorrência, conta/contrato e retry aprovados.");
})().catch(error=>{console.error(error);process.exitCode=1;});

