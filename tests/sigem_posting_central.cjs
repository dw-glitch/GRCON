const assert=require("node:assert/strict");
const test=require("node:test");
const text=v=>String(v==null?"":v).trim();
const key=v=>text(v).toUpperCase();
globalThis.TriagemCore={
  key,normalizeRevision:key,revisionRank:v=>key(v)==="0"?0:key(v).charCodeAt(0)*1000,
  documentSearchKeys:v=>[key(v)],displayDocumentCode:text
};
globalThis.GrconHistory={
  text,norm:key,cleanRecord:r=>r,generatedRevision:f=>f.grdtRevision||f.revision,
  documentFamily:f=>f.sheet||"ET"
};
const C=require("../posting_conference_core.js");
const A=require("../sigem_posting_central_core.js");
const Q=require("../sigem_posting_central_query.js");
const dt="2026-10-12T10:00:00Z";
function h(id,grdt,doc,rev,date){
  return {id,egrdtNumber:grdt,generatedAt:date||dt,
    files:[{document:doc,revision:rev,grdtRevision:rev,title:"Teste",purpose:"Construção",allocation:"A1"}]};
}
function b(doc,rev,status){
  return {document:doc,revision:rev,status,documentIdentity:C.documentIdentity(doc),searchKeys:C.documentKeys(doc)};
}
test("one document, different revisions and repeated emissions",()=>{
  const source=[h("a","GRDT-01","DOC-A","0","2026-10-09T10:00:00Z"),
    h("b","GRDT-02","DOC-A","A","2026-10-10T10:00:00Z"),
    h("c","GRDT-03","DOC-A","A","2026-10-11T10:00:00Z")];
  const data=Q.build(source,{records:[b("DOC-A","0","Emitido"),b("DOC-A","A","Em análise")],
    meta:{referenceDate:"2026-10-13"}},{},{now:"2026-10-13T10:00:00Z"});
  assert.equal(data.documents.length,1);
  assert.equal(data.documents[0].sendCount,3);
  assert.equal(data.documents[0].revisionCount,2);
  assert.equal(data.documents[0].status,C.STATUSES.CONFIRMED);
  assert.equal(data.documents[0].sigemStatus,"Em análise");
  assert.equal(data.grdts.length,3);
  assert.equal(Q.filter(data,"grdts","GRDT-02",{}).rows.length,1);
  assert.equal(Q.filter(data,"revisoes","DOC-A",{}).rows.length,3);
});
test("partial GRDT with two confirmations, one absent revision",()=>{
  const records=[h("d","GRDT-X","DOC-1","B"),h("e","GRDT-X","DOC-2","A"),h("f","GRDT-X","DOC-3","C")];
  const base={records:[b("DOC-1","B","Emitido"),b("DOC-2","A","Emitido"),b("DOC-3","B","Emitido")],
    meta:{referenceDate:"2026-10-13"}};
  const data=Q.build(records,base,{}, {now:"2026-10-13T10:00:00Z"});
  assert.equal(data.grdts[0].confirmed,2);
  assert.equal(data.grdts[0].divergent,1);
  assert.equal(Q.filter(data,"pendencias","",{}).rows.length,1);
});
test("no valid Consulta Geral stays unverified",()=>{
  const data=Q.build([h("a","GRDT-01","DOC-Z","B")],null,{});
  assert.equal(data.documents[0].status,C.STATUSES.NOT_VERIFIED);
});
test("base-only document does not claim emission",()=>{
  const data=Q.build([],{records:[b("DOC-NOVO","A","Emitido")],meta:{}},{});
  assert.equal(data.documents[0].status,"SEM_ENVIO");
  assert.equal(data.documents[0].sendCount,0);
});
test("batch normalizes duplicates and reports missing",()=>{
  const data=Q.build([h("a","GRDT-A","DOC-1","0")],
    {records:[b("DOC-1","0","Emitido")],meta:{}},{});
  const results=Q.filter(data,"documentos","DOC-1\nDOC-2\nDOC-1",{});
  assert.equal(results.rows.length,1);
  assert.deepEqual(results.missing,["DOC-2"]);
});
test("CSV neutralizes formulas and preserves column order",()=>{
  const csv=Q.csv([{document:"=1+2",statusLabel:"Emitido"}],["statusLabel","document"]);
  assert.match(csv,/Conferência;Documento/);
  assert.match(csv,/'=1\+2/);
});
