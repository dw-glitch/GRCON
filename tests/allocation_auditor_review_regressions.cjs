'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Ref=require('../allocation_auditor_references.js'),C=require('../allocation_auditor_core.js'),A=require('../allocation_auditor_corrections.js'),R=require('../allocation_auditor_reaudit.js'),Report=require('../allocation_auditor_report.js'),Opinion=require('../allocation_auditor_opinion.js');

test('registered homologation reaches EAP findings and correction gates; flags alone remain blocked',()=>{
 const proof={kind:'anexo-iii-apendice-a',by:'Revisora QA',at:'07/11/2026',evidence:'Ata sintética QA'};
 const references=Ref.buildCatalog({loadedBases:{eap:true},validations:[proof],homologations:[proof]});
 const row={contract:'QA',document:'IS-5290.00-22313-955-C1O-001',revision:'0',title:'TITULO QA',allocation:'0001',eap:'5.7.3.1',workflow:'WF',levels:['ERRADO'],officialAllocation:true,sourceHash:'a'.repeat(64),sourceFile:'QA.xlsx',sourceSheet:'GERAL',sourceRow:2};
 const context={contract:'QA',records:[row],ldRecords:[{...row,source:'LD.xlsx',sheet:'ELE',row:2}],bases:{eap:[{code:'5.7.3.1',levels:['CORRETO'],source:'EAP-QA'}]},versions:{},homologated:{},references};
 const result=C.auditRecord(row,context);
 assert.equal(result.findings.some(f=>f.id==='EAP-APPLICABILITY'),false);
 assert.equal(result.findings.find(f=>f.id==='EAP-LEVEL-MISMATCH').severity,'error');
 assert.equal(result.recommendations.find(p=>p.field==='N1').confidence,'EAP homologada');
 const rec={field:'N1',before:'ERRADO',after:'CORRETO',confidence:'EAP homologada',evidence:['LD exata e EAP contratual homologada'],humanReview:true};
 const rules=[{state:'active',id:'QA-RULE',version:1,payload:{document:row.document,revision:'0',...rec}}];
 assert.equal(A.classifyProposal({...row,origin:{revision:'0'}},rec,{...context,rules},null).klass,'A');
 const unproven=Ref.buildCatalog({loadedBases:{eap:true},homologated:{eap:true}});
 const pending=C.auditRecord(row,{...context,references:unproven,homologated:{eap:true}});
 assert.ok(pending.findings.some(f=>f.id==='EAP-APPLICABILITY'));
 assert.notEqual(A.classifyProposal({...row,origin:{revision:'0'}},rec,{...context,references:unproven,homologated:{eap:true},rules},null).klass,'A');
});

test('reaudit keeps both repeated occurrences and never exports a surviving error as resolved',()=>{
 const error={id:'TITLE-ERR',field:'title',severity:'error',message:'Título divergente'};
 const row=n=>({contract:'QA',allocation:'0001',document:'DOC-QA',revision:'0',lineage:'L'+n,sourceFile:'QA.xlsx',sourceSheet:'GERAL',sourceRow:n,findings:[error],recommendations:[]});
 const before=[row(2),row(3)],after=[{...row(2),lineage:'NEW2'}, {...row(3),lineage:'NEW3',findings:[]}];
 const comparison=R.compare(before,after);
 assert.equal(comparison.items.filter(i=>i.status==='persiste').length,1);
 assert.equal(comparison.items.filter(i=>i.status==='resolvida').length,1);
 assert.equal(comparison.summary.documentsFullyResolved,0);
 const proof=R.asReaudit(before,after);assert.equal(proof.length,2);assert.equal(proof.find(r=>r.lineage==='L2').findings.length,1);
 const report=Report.build({rows:after,comparison,opinion:Opinion.build({rows:after})});
 assert.equal(report.verified.length,1,'only the corrected occurrence can be exported as proven');
 const missing=R.compare(before,[after[1]]);assert.equal(missing.items.length,1,'a removed occurrence is not declared resolved');
 assert.equal(missing.summary.documentsFullyResolved,0);
 const noIdentity=before.map(r=>({...r,sourceFile:'',sourceSheet:'',sourceRow:undefined,lineage:''}));
 assert.equal(R.compare(noIdentity,noIdentity.map(r=>({...r,findings:[]}))).items.length,0,'ambiguous occurrences cannot prove resolution');
 const duplicateLocation=[row(2),{...row(2)}];assert.equal(R.asReaudit(duplicateLocation,[{...row(2),findings:[]}]).length,0);
});

test('newest active validation and homologation win independently of input order',()=>{
 const base={kind:'et-codificacao',revision:'R',responsible:'Revisora QA',validated_on:'2026-11-07'};
 const old={...base,id:'old',record_type:'validacao',created_at:'2026-11-06T12:00:00Z',evidence:'Anterior',effective_date:'01/12/2026',effective_evidence:'Data anterior'};
 const recent={...base,id:'recent',record_type:'validacao',created_at:'2026-11-07T12:00:00Z',evidence:'Retificada',effective_date:'01/11/2026',effective_evidence:'Vigência retificada'};
 const hOld={...base,id:'ho',record_type:'homologacao',created_at:'2026-11-06T12:00:00Z',evidence:'Homologação anterior'},hNew={...base,id:'hn',record_type:'homologacao',created_at:'2026-11-07T12:00:00Z',evidence:'Homologação atual'};
 for(const records of [[recent,hNew,old,hOld],[old,hOld,recent,hNew]]){
  const options=Ref.fromRecords(records),catalog=Ref.buildCatalog({...options,referenceDate:'2026-11-07'}),entry=catalog.entries.find(e=>e.id==='et-codificacao@R');
  assert.equal(entry.validated.evidence,'Retificada');assert.equal(entry.effective.date,'01/11/2026');assert.equal(entry.homologated.evidence,'Homologação atual');
  assert.equal(entry.blockers.some(b=>b.code==='REF-FORA-VIGENCIA'),false);
 }
});
