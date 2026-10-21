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
assert.match(appSource,/if \(!rowCanAutoInclude\(row\)\) return;/);
assert.match(appSource,/function guardedSelectedIndices/);
assert.match(appSource,/E\.createPlan\(state\.results, guardedSelectedIndices\(\)/);
assert.match(appSource,/const physicalSelection = guardedSelectedIndices\(true\);/);
assert.match(appSource,/row\.manualSigemSelection = \{/);
assert.match(appSource,/rowStatusPolicy\(row\)\.manualOnly/);
assert.match(appSource,/allocation-blocked/);
assert.match(appSource,/const allocationClass = allocationAlert/);
assert.match(appSource,/TriageQuery\.allocationAlert\(row\)\) return "bloqueado"/);
assert.match(fs.readFileSync(require("node:path").join(__dirname,"..","grdt-central-ux.css"),"utf8"),
  /status-chip\.allocation-blocked[\s\S]*#991b1b/);
assert.doesNotMatch(appSource,/if \(row\.decision === C\.READY && !row\.hardBlock && rowOutputSources\(row\)\.length\) state\.selected\.add\(index\);/);
console.log("GRDT SIGEM: análise excluída automaticamente, seleção individual, aliases, revisão, repostagem e proteção dos downloads OK.");

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
