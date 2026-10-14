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
