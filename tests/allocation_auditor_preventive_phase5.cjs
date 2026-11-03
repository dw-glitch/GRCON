'use strict';
// Phase 5: preventive, evidence-bound fiscal precedent and normative applicability tests.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const C=require('../allocation_auditor_core.js');
const doc='C1O_RNEST_U32_10.2.1.2_ELE_RIR_nt-NF-123-BOBINA-121';
const databook='UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR';
const draft=(extra={})=>({
 contract:'UHDT-D',document:doc,revision:'0',
 title:'RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO DE CABO',
 databook,workflow:'RNEST UHDTD U-32 C&M/ELETRICA',
 sourceFile:'PREVENTIVA.xlsx',sourceSheet:'GERAL',sourceRow:2,
 allocation:'C1O-ALOC-CM-0372-2026',...extra
});
const context=(row,extra={})=>({
 contract:'UHDT-D',records:[row],history:[],
 bases:{databook:[{databook}]},versions:{databook:'E'},...extra
});
const run=(r,contextOverrides={})=>C.auditRecord(r,context(r,contextOverrides));
const fiscal=(extra={})=>({
 ...draft(),sourceFile:'C1O-ALOC-CM-0302-2026.xlsx',
 allocation:'C1O-ALOC-CM-0302-2026',
 fiscalComment:'Título incompleto. Ajustar descrição técnica.',
 returnedAt:'2026-07-10',fiscalDecision:'aceito-com-ressalvas',
 ...extra
});
const get=(result,id)=>result.findings.find(item=>item.id===id);

test('ET validator recognizes ET_ identifiers and validates confirmed Rev R',()=>{
 const validateDocument=()=>({kind:'rn-report',errors:[{code:'ET_TAG_CHAR',message:'Caractere inválido',source:C.ET+' Rev. R'}],warnings:[]});
 const r=draft();
 const applicability={source:C.ET,contract:'UHDT-D',revision:'R',confirmed:true,evidence:'Cláusula contratual verificada'};
 const yes=run(r,{applicability,validateDocument});
 assert.equal(get(yes,'CATALOG-ET_TAG_CHAR')?.severity,'error');
 assert.equal(get(yes,'ET-REVISION-NEEDS-VALIDATION'),undefined);
 const unconfirmed=run(r,{validateDocument});
 assert.equal(get(unconfirmed,'CATALOG-ET_TAG_CHAR')?.severity,'pending');
 const older=run(r,{applicability:{...applicability,revision:'N'},validateDocument});
 assert.equal(get(older,'CATALOG-ET_TAG_CHAR'),undefined,'Do not apply Rev R error to Rev N');
 assert.equal(get(older,'ET-REVISION-NEEDS-VALIDATION')?.severity,'pending');
});

test('Fiscal 01 old comment is not a current defect unless the cited value remains unchanged',()=>{
 const r=draft();
 const same=run(r,{history:[fiscal()]});
 assert.equal(get(same,'FISCAL-UNCHANGED-PRECEDENT')?.severity,'pending');
 assert.equal(get(same,'FISCAL-UNCHANGED-PRECEDENT')?.normativeProof,false);
 const changed=run(r,{history:[fiscal({title:'RELATÓRIO ANTIGO'})]});
 assert.equal(get(changed,'FISCAL-UNCHANGED-PRECEDENT'),undefined);
 assert.equal(get(changed,'FISCAL-PRECEDENT')?.severity,'suggestion');
 assert.equal(changed.history[0].fiscalComment,'Título incompleto. Ajustar descrição técnica.');
});

test('Fiscal history is isolated to the active contract',()=>{
 const r=draft();
 const other=run(r,{history:[fiscal({contract:'UGH'})]});
 assert.ok(!other.findings.some(f=>f.id.startsWith('FISCAL-')));
 assert.equal(other.history.length,0);
});

test('Family-wide prior comments require 3 distinct documents in the same technical family',()=>{
 const r=draft();
 const distinct=[121,122,123].map(n=>fiscal({
  document:doc.replace(/121$/,String(n)),allocation:'C1O-ALOC-CM-0'+n+'-2026'
 }));
 const out=run(r,{history:distinct});
 const f=get(out,'FISCAL-FAMILY-title');
 assert.equal(f?.severity,'suggestion');
 assert.equal(f?.normativeProof,false);
 assert.equal(f?.humanReview,true);
 assert.equal(f?.evidence[0].distinctDocuments,3);
 assert.equal(f?.evidence[0].samples.length,3);
 const repeated=run(r,{history:distinct.map((h,i)=>({...h,document:doc,allocation:'OLD-'+i,title:'OLD-'+i}))});
 assert.equal(get(repeated,'FISCAL-FAMILY-title'),undefined,'Re-presenting a single document is not recurring across a family');
 const discipline=run(r,{history:distinct.map(h=>({...h,document:h.document.replace('_ELE_RIR_','_TUB_RIR_')}))});
 assert.equal(get(discipline,'FISCAL-FAMILY-title'),undefined);
 const crossContract=run(r,{history:distinct.map(h=>({...h,contract:'UGH'}))});
 assert.equal(get(crossContract,'FISCAL-FAMILY-title'),undefined);
});

test('Workflow disagrees with code discipline only as evidence-based warning',()=>{
 const consistent=run(draft());
 assert.equal(get(consistent,'WORKFLOW-DISCIPLINE-CONFLICT'),undefined);
 const inconsistent=draft({workflow:'RNEST UHDTD U-32 C&M/TUBULACAO'});
 const unapproved=run(inconsistent);
 assert.equal(get(unapproved,'WORKFLOW-DISCIPLINE-CONFLICT')?.severity,'suggestion');
 const approved=run(inconsistent,{homologated:{workflows:true}});
 assert.equal(get(approved,'WORKFLOW-DISCIPLINE-CONFLICT')?.severity,'pending');
 assert.equal(get(approved,'WORKFLOW-DISCIPLINE-CONFLICT')?.normativeProof,false);
});

test('EAP 3.9.2.1 accepts registered ancestors and ignores levels absent from its base',()=>{
 const r=draft({
  document:doc.replace('10.2.1.2','3.9.2.1'),
  workflow:'RNEST UHDTD U-32 C&M/CIVIL',
  levels:['U32','03.REPARO','03.09.ESTRUTURA','SUBNÍVEL NÃO CADASTRADO','','','','','','']
 });
 const out=run(r,{bases:{databook:[{databook}],eap:[
  {code:'3',levels:['U32','03.REPARO']},
  {code:'3.9',levels:['U32','03.REPARO','03.09.ESTRUTURA']}
 ]}});
 assert.equal(out.eapMatch.matchedCode,'3.9');
 assert.equal(get(out,'EAP-LEVEL-MISMATCH'),undefined);
 assert.ok(!out.recommendations.some(x=>x.field==='N4'));
});

test('EAP 10.2.1.2 stays ambiguous without a uniquely matching Workflow discipline',()=>{
 const bases={databook:[{databook}],eap:[
  {code:'10.2.1',levels:['U32','10.SUPRIMENTO','10.02.BENS','10.02.01.B.ELÉTRICA']},
  {code:'10.2.1',levels:['U32','10.SUPRIMENTO','10.02.BENS','10.02.01.H.TUBULAÇÃO']}
 ]};
 const expected=draft({officialAllocation:true,levels:['U32','10.SUPRIMENTO','10.02.BENS','10.02.01.B.ELÉTRICA']});
 const unique=run(expected,{bases});
 assert.equal(unique.eapMatch.ambiguous,false);
 assert.equal(get(unique,'EAP-DISCIPLINE-AMBIGUOUS'),undefined);
 const unknown=run({...expected,workflow:'WF'},{bases});
 assert.equal(unknown.eapMatch.ambiguous,true);
 assert.equal(get(unknown,'EAP-DISCIPLINE-AMBIGUOUS')?.severity,'pending');
 assert.equal(get(unknown,'EAP-LEVEL-MISMATCH'),undefined);
});

test('Worker clears cached findings whenever bases or fiscal history changes',()=>{
 const worker=fs.readFileSync(path.join(__dirname,'../workers/allocation-auditor.worker.js'),'utf8');
 assert.match(worker,/if\(op==='context'\)\{cache\.clear\(\)/);
});

test('Large histories are preaggregated rather than scanned per each of 500 documents',()=>{
 const seed=draft();
 const histories=Array.from({length:1200},(_,i)=>fiscal({
  document:doc.replace(/121$/,String(i+1000)),
  sourceFile:'HIST-'+i+'.xlsx',
  allocation:'A-'+i
 }));
 const ctx=context(seed,{history:histories});
 const indexed=C.prepare(ctx);
 const records=Array.from({length:500},(_,i)=>draft({document:doc.replace(/121$/,String(i+3000)),sourceRow:i+2}));
 assert.ok(indexed.byFamilyCategory.get('ELE|RIR|title')?.distinctDocuments>=1200);
 for(const r of records)assert.equal(get(C.auditRecord(r,ctx,indexed),'FISCAL-FAMILY-title')?.severity,'suggestion');
 assert.equal(histories[0].fiscalComment,'Título incompleto. Ajustar descrição técnica.');
});
