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
  const records=[{id:"d",egrdtNumber:"GRDT-X",generatedAt:dt,files:[
    {document:"DOC-1",revision:"B"},{document:"DOC-2",revision:"A"},
    {document:"DOC-3",revision:"C"}]}];
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
  assert.ok(csv.includes('"Conferência";"Documento"'));
  assert.match(csv,/'=1\+2/);
});

test("last sent revision remains pending even when older revision is present",()=>{
  const data=Q.build([
    h("g1","GRDT-ONE","DOC-90","A","2026-10-01T12:00:00Z"),
    h("g2","GRDT-TWO","DOC-90","B","2026-10-12T12:00:00Z")
  ],{records:[b("DOC-90","A","Emitido")],meta:{referenceDate:"2026-10-13"}},{},
  {now:"2026-10-13T16:00:00Z"});
  const doc=data.documents.find(r=>r.document==="DOC-90");
  assert.equal(doc.revisionSent,"B");
  assert.equal(doc.revisionCount,2);
  assert.notEqual(doc.status,C.STATUSES.CONFIRMED);
  assert.equal(doc.repostCount,0);
});
test("same revision resent is a repost, not another revision",()=>{
  const data=Q.build([
    h("g1","GRDT-ONE","DOC-91","B","2026-10-01T12:00:00Z"),
    h("g2","GRDT-TWO","DOC-91","B","2026-10-12T12:00:00Z")
  ],{records:[b("DOC-91","B","Em análise")],meta:{referenceDate:"2026-10-13"}},{});
  const doc=data.documents.find(r=>r.document==="DOC-91");
  assert.equal(doc.revisionCount,1);
  assert.equal(doc.repostCount,1);
  assert.equal(doc.sendCount,2);
});
test("searching list of document codes inside GRDT checks member rows",()=>{
  const data=Q.build([{
    id:"gx",egrdtNumber:"GRDT-99",generatedAt:dt,files:[
      {document:"DOC-101",revision:"0"},
      {document:"DOC-102",revision:"0"}]
  }],{records:[b("DOC-101","0","Emitido"),b("DOC-102","0","Emitido")],meta:{}},{});
  const found=Q.filter(data,"grdts","DOC-101\nDOC-102\nDOC-999",{});
  assert.equal(found.rows.length,1);
  assert.deepEqual(found.missing,["DOC-999"]);
});
test("sort document revisions by official revision rank and preserve source order",()=>{
  const rows=[
    {revisionSent:"B",document:"Z",generatedAt:"2026-10-12"},
    {revisionSent:"0",document:"A",generatedAt:"2026-10-10"},
    {revisionSent:"A",document:"X",generatedAt:"2026-10-11"}
  ];
  assert.deepEqual(Q.sortRows(rows,{key:"revisionSent",dir:"asc"}).map(x=>x.revisionSent),["0","A","B"]);
  assert.equal(rows[0].revisionSent,"B");
});
test("advanced filters intersect rather than expand results",()=>{
  const data=Q.build([h("g1","GRDT-01","DOC-01","0")],
    {records:[b("DOC-01","0","Emitido")],meta:{}},{});
  data.documents[0].allocationState="Alocado";
  data.documents[0].discipline="MEC";
  data.documents[0].fiscalComment="Fiscal 01: ok";
  assert.equal(Q.filter(data,"documentos","",{allocationState:"Alocado",discipline:"MEC",fiscal:"Fiscal 01"}).rows.length,1);
  assert.equal(Q.filter(data,"documentos","",{allocationState:"Não alocado",discipline:"MEC"}).rows.length,0);
});
test('GRDT filters must match the same member, including revision and status',()=>{
 const data=Q.build([{id:'combo',egrdtNumber:'GRDT-COMBO',generatedAt:dt,files:[
  {document:'DOC-C1',revision:'A',discipline:'MEC'},
  {document:'DOC-C2',revision:'B',discipline:'TUB'}]}],
  {records:[b('DOC-C1','A','Emitido')],meta:{referenceDate:'2026-10-13'}},{});
 assert.equal(Q.filter(data,'grdts','',{revision:'A',discipline:'TUB'}).rows.length,0);
 assert.equal(Q.filter(data,'grdts','',{revision:'B',status:C.STATUSES.CONFIRMED}).rows.length,0);
 assert.equal(Q.filter(data,'grdts','',{revision:'A',discipline:'MEC'}).rows.length,1);
});
test('batch preserves input order and handles a single missing code',()=>{
 const data=Q.build([h('a','GRDT-1','DOC-1','0'),h('b','GRDT-2','DOC-2','0')],
 {records:[b('DOC-1','0','Emitido'),b('DOC-2','0','Emitido')],meta:{}},{});
 assert.deepEqual(Q.filter(data,'documentos','DOC-2\nDOC-1',{}).rows.map(r=>r.document),['DOC-2','DOC-1']);
 assert.deepEqual(Q.filter(data,'documentos','DOC-999',{listMode:true}).missing,['DOC-999']);
});
test('no-date records excluded from period and BR dates sorted chronologically',()=>{
 const data=Q.build([],{records:[b('DOC-1','0','Emitido')],meta:{}},{});
 assert.equal(Q.filter(data,'documentos','',{end:'2026-10-13'}).rows.length,0);
 const rows=[{generatedAt:'13/10/2026'},{generatedAt:'02/09/2026'},{generatedAt:''}];
 assert.deepEqual(Q.sortRows(rows,{key:'generatedAt',dir:'desc'}).map(r=>r.generatedAt),['13/10/2026','02/09/2026','']);
});
test('search historical GRDT and column filters, without losing revision evidence',()=>{
 const data=Q.build([h('a','GRDT-OLD','DOC-10','A','2026-10-01T10:00:00Z'),h('b','GRDT-NEW','DOC-10','B')],
  {records:[b('DOC-10','A','Emitido')],meta:{referenceDate:'2026-10-13'}},{});
 assert.equal(Q.filter(data,'documentos','GRDT-OLD',{}).rows.length,1);
 assert.equal(Q.filter(data,'documentos','',{columns:{revisionSent:'B'}}).rows.length,1);
 assert.equal(Q.filter(data,'documentos','',{columns:{revisionSent:'C'}}).rows.length,0);
 assert.equal(data.documents[0].revisionSent,'B');
 assert.notEqual(data.documents[0].status,C.STATUSES.CONFIRMED);
});
test('base-only uses highest revision when timestamps absent',()=>{
 const data=Q.build([],{records:[b('DOC-11','0','Emitido'),b('DOC-11','B','Em análise')],meta:{}},{});
 assert.equal(data.documents[0].revisionFound,'B');
});

test('historical confirmation never becomes a new current confirmation',()=>{
 const history=[h('persisted','GRDT-HIST','DOC-HIST','A')];
 const first=Q.build(history,{records:[b('DOC-HIST','A','Emitido')],meta:{referenceDate:'2026-10-13'}},{},{now:'2026-10-13T12:00:00Z'});
 const next=Q.build(history,{records:[b('DOC-OTHER','0','Emitido')],meta:{referenceDate:'2026-10-14'}},first.confirmationState,{now:'2026-10-14T12:00:00Z'});
 assert.equal(next.documents[0].historicalPreserved,true);
 assert.notEqual(next.documents[0].status,C.STATUSES.CONFIRMED);
 assert.equal(C.repostEligibility(next.documents[0]).eligible,false);
});
