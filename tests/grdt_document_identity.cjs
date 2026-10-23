'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const Raw=require('../core.js');require('../grcon_utils.js');require('../core.js');
const Wrapped=globalThis.TriagemCore;const E=require('../emission.js'),Q=require('../grdt_triage_query.js');
const code=n=>'PR-5290.00-22313-955-C1O-'+n;
const et=n=>'C1O_RNEST_U32_3.1.1.1_INS_RIR_VM-'+n;
const rec=(document,extra={})=>({document,revision:'A',sheet:document.includes('_RNEST_')?'ET':'N-1710',source:'LD_001.xlsx',row:2,title:'Mesmo título para documentos vizinhos',discipline:'QUALIDADE',format:'A4',documentType:'PR',purpose:'Para Informação',allocationStatus:'ALOCADO',...extra});
for(const C of [Raw,Wrapped])for(const family of [code,et]){
 const d121=family('121'),d122=family('122'),source=d122+'_0001_A.pdf';
 const index=C.buildIndex([rec(d121)],[rec(d121,{sigemStatus:'Em Workflow',status:'Em Workflow'})]);
 assert.equal(C.matchDocumentsForGrdt(source,index).length,0,'122 may not inherit 121 from one-edit matching');
 const row=C.triageOne({id:source,name:source,documentLookupHint:{matched:true,ldDocument:d121,inputDocument:d122}},index);
 assert.equal(row.document,d122,'missing LD must preserve the real 122 identifier');assert.equal(row.documentLookup.matched,false);assert.deepEqual(Object.keys(row.record),[]);assert.deepEqual(Object.keys(row.egrdt),[]);assert.equal(Q.selectionPolicy(row).autoEligible,false);
 for(const neighbour of ['120','123','112','212','1210','0121','12I','12L','I21'])assert.equal(C.fileDocumentIdentity(family(neighbour)+'_0001_A.pdf',d121).valid,false,neighbour);
 for(const suffix of ['', '_0001','_A','_0001_A','_0','_REV_A'])assert.equal(C.fileDocumentIdentity(d122+suffix+'.pdf',d122).valid,true,suffix);
 assert.equal(C.matchDocumentsForGrdt(source,C.buildIndex([rec(d121),rec(d122)],[]))[0].document,d122);
 for(const extension of ['microstation','custom-extension-long','12345']){assert.equal(C.fileDocumentIdentity(d122+'.'+extension,d122).valid,true,'long or custom extensions preserve the full code');assert.equal(C.fileRevisionEvidence(d122+'.'+extension,d122).revision,'0','extension is also removed consistently for physical revision');assert.equal(C.matchDocumentsForGrdt(d122+'.'+extension,C.buildIndex([rec(d122)],[]))[0].document,d122);}
 for(const tagSuffix of ['-A','-B','-0','-RIR']){assert.equal(C.fileDocumentIdentity(d122+tagSuffix+'.pdf',d122).valid,false,'TAG suffix is never stripped as an implicit revision');assert.equal(C.matchDocumentsForGrdt(d122+tagSuffix+'.pdf',C.buildIndex([rec(d122)],[])).length,0);}
 assert.equal(C.matchDocumentsForGrdt('/pasta/'+d121+'/'+source,index).length,0,'parent folder is not document identity');
 assert.equal(C.matchDocumentsForGrdt(d122+' - título cita '+d121+'.pdf',index).length,0,'a reference in a title is not identity');
 const forged=C.triageOne({id:'forged',name:source,document:d121},index);assert.equal(forged.hardBlock,true);assert.equal(forged.blockCode,'document_identity_mismatch');assert.deepEqual(Object.keys(forged.record),[]);
}
for(const C of [Raw,Wrapped]){
 const base=et('122'),nt=base.replace('_VM-','_nt-VM-');
 assert.equal(C.matchDocumentsForGrdt(nt+'_A.pdf',C.buildIndex([rec(base)],[]))[0].document,base,'explicit ET nt alias retained');
 for(const other of [base.replace('U32','U39S'),base.replace('3.1.1.1','3.1.1.2'),base.replace('_RIR_','_REP_'),base.replace('VM-','VM'),base.replace('122','12Z')])assert.equal(C.matchDocumentsForGrdt(other+'_A.pdf',C.buildIndex([rec(base)],[])).length,0,'every complete identity group is checked');
}
// Hyphen suffixes belong to TAG identity, not an implicit file revision.
for(const C of [Raw,Wrapped]){
 const tagIndex=C.buildIndex([rec('P-101')],[]);
 const tag=C.triageOne({id:'tag',name:'P-101-A.pdf'},tagIndex);
 assert.equal(tag.document,'P-101-A','the final TAG letter cannot be discarded');
 assert.equal(tag.revision,'0','a code-ending letter is not revision evidence');
 assert.equal(tag.documentLookup.matched,false);
 assert.equal(C.matchDocumentsForGrdt('P-101-A.pdf',tagIndex).length,0);
 assert.equal(C.fileDocumentIdentity('P-101-A.pdf','P-101-A').valid,true);
 assert.equal(C.fileDocumentIdentity('P-101-A.pdf','P-101').valid,false);
 const ambiguousIndex=C.buildIndex([rec('TAG-101'),rec('TAG-101_A')],[]);
 const candidates=C.matchDocumentsForGrdt('TAG-101_A.pdf',ambiguousIndex);
 assert.equal(candidates.length,2,'two complete LD identities must not resolve to the first');
 const ambiguous=C.triageOne({id:'ambiguous',name:'TAG-101_A.pdf'},ambiguousIndex);
 assert.equal(ambiguous.decision,C.REVIEW);
 assert.equal(ambiguous.status,'Código ambíguo no nome');
 assert.deepEqual(Object.keys(ambiguous.record),[]);
 assert.equal(Q.selectionPolicy(ambiguous).autoEligible,false);
}
const bad={document:code('121'),revision:'A',sheet:'N-1710',decision:Raw.READY,record:rec(code('121')),egrdt:Raw.buildEgrdtData(code('121'),'A',code('121')+'_0001_A.pdf',rec(code('121')),'N-1710','A4'),files:[{name:code('122')+'_0001_A.pdf',file:{name:code('122')+'_0001_A.pdf',size:1}}]};
const plan=E.createPlan([bad],new Set([0]),{manualForceIndices:new Set([0])});assert.equal(plan.entries.length,0);assert.ok(plan.errors.some(e=>/identidade divergente/i.test(e)),'manual revision override cannot authorize another document');
bad.files[0].name=code('121')+'_0001_A.pdf';const spoofed=E.createPlan([bad],new Set([0]),{manualForceIndices:new Set([0])});assert.equal(spoofed.entries.length,0,'actual File.name takes precedence over edited labels');
for(const status of ['Não localizado','Não encontrado','Sem status','Status não identificado','']){
 const row={decision:Raw.READY,status};assert.equal(Q.unresolvedStatus(row),true);assert.equal(Q.selectionPolicy(row).autoEligible,false);
}
const noAllocationAndUnknown=Q.selectionPolicy({decision:Raw.REVIEW,status:'Sem status',allocationStatus:'Não Alocado'});
assert.equal(noAllocationAndUnknown.unresolved,true);
assert.equal(noAllocationAndUnknown.allocation,'not_allocated');
assert.equal(noAllocationAndUnknown.label,'Não Alocado','missing allocation must remain explicit when SIGEM status is unknown');
assert.equal(noAllocationAndUnknown.autoEligible,false);
assert.equal(Q.unresolvedStatus({decision:Raw.READY,status:'Não Postado'}),false,'absence of an exact revision in a loaded SIGEM base remains a different operational state');
assert.equal(Q.unresolvedStatus({decision:Raw.READY,status:'Não Postado',documentLookup:{matched:false}}),true,'unmatched document cannot be ready');

const ui=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
assert.match(ui,/TriageQuery\.unresolvedStatus\(row\)\) return 'nao_localizado'/);
assert.match(ui,/TriageQuery\.unresolvedStatus\(row\)\) return 'review'/);
const groupSource=ui.slice(ui.indexOf('  function decisionGroupKey(row) {'),ui.indexOf('  function decisionGroupLabel(row) {'));
assert.ok(groupSource.includes('allocationAlert(row) === "not_allocated"'));
assert.ok(groupSource.indexOf('allocationAlert(row) === "not_allocated"')<groupSource.indexOf('unresolvedStatus(row)'),'não alocado antes de não localizado');
const decisionGroupKey=vm.runInNewContext(groupSource+';decisionGroupKey',{TriageQuery:Q,rowStatusPolicy:row=>Q.selectionPolicy(row),C:Raw});
const scenario=(status,extra={})=>({status,decision:Raw.READY,...extra});
assert.equal(decisionGroupKey(scenario('Sem status',{allocationStatus:'NÃO ALOCADO',documentLookup:{matched:false}})),'bloqueado');
assert.equal(decisionGroupKey(scenario('Em Workflow',{record:{allocationStatus:'Não alocado'}})),'bloqueado');
assert.equal(decisionGroupKey(scenario('Não Postado',{allocationFinding:{kind:'not_allocated'}})),'bloqueado');
assert.equal(decisionGroupKey(scenario('Sem status',{allocationFinding:{kind:'conflict'}})),'revisar');
assert.equal(decisionGroupKey(scenario('Sem status',{documentLookup:{matched:false}})),'nao_localizado');
assert.equal(decisionGroupKey(scenario('Em Análise')),'descartar');
assert.equal(decisionGroupKey(scenario('Não Postado')),'pronto');
const labelsSource=ui.slice(ui.indexOf('  function selectionSituationLabel(row, index) {'),ui.indexOf('  function decisionClass(value, row) {'));
const selectionSituationLabel=vm.runInNewContext(labelsSource+';selectionSituationLabel',{
  rowStatusPolicy:row=>Q.selectionPolicy(row),
  rowIncludedForGeneration:row=>Boolean(row.manualSelected),
  rowCanBeSelected:()=>true,
  compactDecisionLabel:()=> 'Conferir'
});
assert.equal(selectionSituationLabel(scenario('Sem status',{allocationStatus:'NÃO ALOCADO'}),0),'Não incluir');
assert.equal(selectionSituationLabel(scenario('Não Postado',{allocationStatus:'NÃO ALOCADO',manualSelected:true}),0),'Não incluir · inclusão manual');
assert.equal(selectionSituationLabel(scenario('Não Postado',{allocationFinding:{kind:'conflict'}}),0),'Conferir');
assert.match(ui,/grdt-status-reason">Não alocado/,'motivo operacional visível ao lado do badge');
const css=fs.readFileSync(path.join(__dirname,'../grdt-central-ux.css'),'utf8');
assert.match(css,/--grdt-blocked-bg: #f9ecee/);
assert.match(css,/--grdt-ready-bg: #eaf5ee/);
assert.doesNotMatch(css,/box-shadow: inset 4px 0/,'não colorir faixa de todas as linhas');
assert.doesNotMatch(css,/--grdt-status-symbol/,'retirar símbolos decorativos recorrentes');
const rgb=hex=>[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
const luminance=hex=>rgb(hex).reduce((sum,c,index)=>sum+c*[.2126,.7152,.0722][index],0);
const contrast=(a,b)=>{const [x,y]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (x+.05)/(y+.05);};
for (const pair of [['#eaf5ee','#216343'],['#f9ecee','#8b3a46'],['#edf2f8','#395a7a'],['#f1f3f6','#475569'],['#f8f2e8','#846326']]) {
  assert.ok(contrast(...pair)>=4.5,'badges devem atender contraste WCAG AA: '+pair.join('/'));
}

console.log('GRDT identity: raw+guarded core, 121/122, unmatched code preservation, P-101-A, ambiguous candidates, complete codes, false hints, folder/title references, nt aliases, physical file guard, manual override and unresolved status separation passed.');
