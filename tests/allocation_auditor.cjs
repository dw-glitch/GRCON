'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../allocation_auditor_core.js');
const doc='C1O_RNEST_U32_10.2.1.2_ELE_RIR_nt-NF-123-BOBINA-121';
const base={contract:'contract-a',bases:{databook:[{databook:'UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR'}]},versions:{databook:'map-E'},records:[]};
const row=(extra={})=>({document:doc,revision:'0',title:'RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO DE CABO',databook:base.bases.databook[0].databook,workflow:'WF',sourceFile:'ALOC.xlsx',allocation:'ALOC-1',...extra});
const audit=(r,c={})=>C.auditRecord(r,{...base,...c,records:[r]});
test('Central maps date and fiscal response independently, preserving all submissions',()=>{const parsed=C.parseRows([[],['ABA','VERSÃO \nDA LD','Retorno da Fiscal 01\n (Renata)','Resposta da Fiscal 01\n (Renata)','ALOCAÇÃO','NomeDocumento','STATUS DA ALOCAÇÃO'],['ET_LD_004','E','27/10/2026','Título incompleto. Ajustar CAM DB.','A1',doc,'CONCLUÍDA'],['ET_LD_004','E','28/10/2026','Aceito sem comentários','A2',doc,'CONCLUÍDA']],{contract:'contract-a'});assert.equal(parsed.records.length,2);const r=parsed.records[0];assert.equal(r.returnedAt,'27/10/2026');assert.equal(r.fiscalComment,'Título incompleto. Ajustar CAM DB.');assert.deepEqual(r.commentFindings.map(x=>x.category),['title','databook']);assert.equal(r.revision,'');assert.equal(r.fiscalDecision,'aceito-com-ressalvas');});
test('121 and 122 use exact documentary identities',()=>{const a=row(),b=row({document:doc.replace(/121$/,'122')});assert.notEqual(C.key(a),C.key(b));const r=audit(a,{history:[{...b,fiscalComment:'Título incompleto'}]});assert.equal(r.history.length,0);});
test('legitimate resubmission across allocations is not duplicate',()=>{const r=row();const out=C.auditRecord(r,{...base,records:[r,{...r,allocation:'ALOC-2'}],history:[{...r,allocation:'ALOC-OLD',fiscalComment:'Ajustar CAM DB'}]});assert.ok(!out.findings.some(x=>x.id==='DUPLICATE-IN-BATCH'));assert.equal(out.state,'Aberto');assert.equal(out.history.length,1);});
test('duplicate within a lot is detected across LD sheets and not deleted',()=>{const r=row();const context={...base,records:[r,{...r,ldSheet:'OTHER'}]};const out=C.auditRecord(r,context);assert.equal(context.records.length,2);assert.equal(out.findings.find(x=>x.id==='DUPLICATE-IN-BATCH').severity,'error');});
test('unknown revision is never defaulted to zero',()=>{const r=audit(row({revision:''}));assert.equal(r.revision,'');assert.ok(r.findings.some(x=>x.id==='REVISION-UNKNOWN'));});
test('unique exact LD supplies revision with provenance, while conflicting LDs stay pending',()=>{let r=audit(row({revision:'',title:''}),{ldRecords:[{document:doc,revision:'B',title:'TITLE',source:'LD.xlsx',sheet:'ELE',row:12,ldColumns:[{header:'TÍTULO',column:4}]}]});assert.equal(r.revision,'B');assert.equal(r.origin.titleColumn,4);r=audit(row({revision:''}),{ldRecords:[{document:doc,revision:'A'},{document:doc,revision:'B'}]});assert.ok(r.findings.some(f=>f.id==='LD-AMBIGUOUS'));});
test('ET evidence is contract-specific and uppercase NT is not silently normalized',()=>{const r=row({document:doc.replace('nt-','NT-')});let out=audit(r);assert.equal(out.findings.find(x=>x.id==='ET-7173-NT').severity,'pending');out=audit(r,{applicability:{source:C.ET,contract:'contract-a',revision:'R',confirmed:true,evidence:'Contract clause 7'}});assert.equal(out.findings.find(x=>x.id==='ET-7173-NT').severity,'error');assert.equal(out.document,r.document);out=audit(r,{applicability:{source:C.ET,contract:'other',revision:'R',confirmed:true,evidence:'Contract clause 7'}});assert.equal(out.findings.find(x=>x.id==='ET-7173-NT').severity,'pending');});
test('TAG absent from appendix remains inconclusive; other authorized reference can prove exact TAG',()=>{const r=row({document:doc.replace('nt-NF-123-BOBINA-121','M-320121')});let out=audit(r);assert.equal(out.findings.find(x=>x.id==='TAG-NOT-PROVEN').severity,'pending');out=audit(r,{bases:{...base.bases,li:[{tag:'M-320121',source:'LI'}]}});assert.ok(!out.findings.some(x=>x.id==='TAG-NOT-PROVEN'));out=audit(r,{bases:{...base.bases,li:[{tag:'M-320122'}]}});assert.ok(out.findings.some(x=>x.id==='TAG-NOT-PROVEN'));});
test('missing EAP and nonhomologated paths never become invented official classifications',()=>{let out=audit(row({databook:'OTHER|DATA BOOK|PATH'}));assert.equal(out.findings.find(x=>x.id==='DATABOOK-NOT-FOUND').severity,'pending');assert.ok(out.findings.some(x=>x.id==='EAP-BASE-MISSING'));assert.equal(out.eap,'10.2.1.2');});
test('parent hierarchy has stable version-scoped identity and true parent references',()=>{const t=C.buildTree(base.bases.databook,'E');assert.equal(t.size,4);assert.equal(t.get(base.bases.databook[0].databook).parent,JSON.stringify(['E','UHDTD U-32|DATA BOOK C&M|ELÉTRICA']));});
test('comparison marks unknown fields and never resolves by later submission',()=>{const c=C.compare({title:'A',tag:''},{title:'B',tag:'T'});assert.equal(c.resolved,false);assert.deepEqual(c.changes,[{field:'title',before:'A',after:'B'}]);assert.ok(c.unknown.includes('tag'));});
test('acceptance with comments does not equal full compliance',()=>{assert.equal(C.decision('Aceito com comentários','CONCLUÍDA'),'aceito-com-ressalvas');assert.equal(C.decision('','CONCLUÍDA'),'nao-comprovado');assert.equal(C.classifyComment('ok').length,0);assert.ok(C.classifyComment('Rever situação não explicada')[0].humanReview);});
test('review decisions require evidence for critical changes and closure',()=>{const r=audit(row());assert.throws(()=>C.reviewEvent(r,{state:'Resolvido com evidência',justification:'Corrigido'},'actor'),/evidência/);assert.throws(()=>C.reviewEvent(r,{state:'Correção proposta',field:'tag',decision:'accepted',value:'T',justification:'Conferido'},'actor'),/evidência/);const e=C.reviewEvent(r,{state:'Correção proposta',field:'title',decision:'rejected',value:'NEW',justification:'Sem comprovação'},'actor');assert.equal(e.decision,'rejected');assert.equal(r.title,row().title);});
test('lineage split groups revisions and allocations of the same full code',()=>{const a=row({contract:'contract-a'});assert.equal(C.splitGroup(a),C.splitGroup({...a,revision:'B',allocation:'OTHER'}));});
test('cable title checks ask for technical evidence without inventing conductor details',()=>{const r=audit(row());const f=r.findings.find(f=>f.id==='CABLE-DETAILS');assert.ok(f);assert.match(f.message,/Não completar/);assert.ok(!f.suggestion);});
test('cable section units adjacent to numbers are recognized without approving the document',()=>{
 for(const section of ['12X2,5MM²','1x35mm2','1 × 6 mm²','2.5MM²']){
  const out=audit(row({title:'RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO - CABO PVC - '+section+' - 0,6/1KV'}));
  assert.ok(!out.findings.some(f=>f.id==='CABLE-DETAILS'),section);
  assert.ok(out.findings.some(f=>f.id==='EAP-BASE-MISSING'),'Other unproven requirements remain pending');
 }
 const out=audit(row({title:'RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO - CABO PVC - BOBINA 195M - 0,6/1KV'}));
 assert.deepEqual(out.findings.find(f=>f.id==='CABLE-DETAILS').evidence[0].missing,['configuração / seção'],'Length in metres does not supply conductor section');
});
test('N1710 sequence letters are flagged with an explicit reference',()=>{const out=audit(row({document:'PR-5290.00-22313-91A-C1O-12A'}));assert.equal(out.findings.find(f=>f.id==='N1710-SEQUENCE').source,'N-1710 Rev. N §6.7');});
test('other contract cannot enter an audit',()=>{assert.throws(()=>audit(row({contract:'OTHER'})),/outro contrato/);});
test('model output can only reference supplied evidence and never establish normative proof',async()=>{const {prepareAuditPrompt,validateAuditAnswer}=await import('../cloudflare/allocation-audit-ai.mjs');const p=prepareAuditPrompt({document:doc,title:'T',findings:[{id:'finding:0',field:'title',message:'Conferir',evidence:[]}]});assert.throws(()=>validateAuditAnswer({findingIds:['invented'],rationale:'X',missingEvidence:[]},p),/INVALID/);const a=validateAuditAnswer({findingIds:['finding:0'],rationale:'Falta evidência técnica.',missingEvidence:['Classe de tensão']},p);assert.equal(a.normativeProof,false);assert.equal(a.humanReview,true);});

test('later rejection supersedes earlier approval for the same field',()=>{const a={lineage:'L',field:'title',decision:'accepted'};assert.equal(C.approvedChanges([a,{...a,decision:'rejected'}]).length,0);assert.equal(C.approvedChanges([{...a,decision:'rejected'},a]).length,1);});
test('Central ET_LD_004 matches sheet ET in the correct LD and excludes LD003',()=>{const a={ld:'LD-5290.00-22313-91A-C1O-004_0001_A.xlsx',ldSheet:'ET'};assert.equal(C.ldIdentity(a).id,'004');assert.equal(C.sameLd(a,{ldSheet:'ET_LD_004'}),true);assert.equal(C.sameLd(a,{ldSheet:'ET_LD_003'}),false);});

test('EAP aceita ancestral mais específico disponível sem exigir níveis futuros',()=>{
 const r=row({officialAllocation:true,document:doc.replace('10.2.1.2','3.9.2.1'),workflow:'RNEST UHDTD U-32 C&M/CIVIL',levels:['UHDTD U-32','03.REPARO','03.09.ESTRUTURA METÁLICA','SUBLEVEL NÃO CADASTRADO','','','','','','']});
 const out=audit(r,{bases:{...base.bases,eap:[{code:'3',levels:['UHDTD U-32','03.REPARO']},{code:'3.9',levels:['UHDTD U-32','03.REPARO','03.09.ESTRUTURA METÁLICA']}]}});
 assert.equal(out.eapMatch.matchedCode,'3.9');
 assert.ok(!out.findings.some(f=>f.id==='EAP-NOT-FOUND'||f.id==='EAP-LEVEL-MISMATCH'));
 assert.ok(!out.recommendations.some(x=>x.field==='N4'));
});
test('EAP 10.2.1 escolhe a única folha pela disciplina do Workflow',()=>{
 const rows=[
 {code:'10.2.1',levels:['UHDTD U-32','10.SUPRIMENTO','10.02.BENS','10.02.01.B.ELÉTRICA']},
 {code:'10.2.1',levels:['UHDTD U-32','10.SUPRIMENTO','10.02.BENS','10.02.01.H.TUBULAÇÃO']},
 {code:'10.2.1',levels:['UHDTD U-32','10.SUPRIMENTO','10.02.BENS','10.02.01.J.HVAC']}
 ];
 const row1=row({officialAllocation:true,workflow:'RNEST UHDTD U-32 C&M/ELETRICA',levels:['UHDTD U-32','10.SUPRIMENTO','10.02.BENS','10.02.01.B.ELÉTRICA','','','','','','']});
 const out=audit(row1,{bases:{...base.bases,eap:rows}});
 assert.equal(out.eapMatch.matchedCode,'10.2.1');
 assert.equal(out.eapMatch.discipline,'ELETRICA');
 assert.equal(out.eapMatch.candidates,3);
 assert.equal(out.eapMatch.ambiguous,false);
 assert.ok(!out.findings.some(f=>f.id==='EAP-DISCIPLINE-AMBIGUOUS'||f.id==='EAP-LEVEL-MISMATCH'||f.id==='EAP-NOT-FOUND'));
 const wrong=audit({...row1,levels:['UHDTD U-32','10.SUPRIMENTO','10.02.BENS','10.02.01.H.TUBULAÇÃO']},{bases:{...base.bases,eap:rows}});
 assert.ok(wrong.findings.some(f=>f.id==='EAP-LEVEL-MISMATCH'));
 const unknown=audit({...row1,workflow:'WF'},{bases:{...base.bases,eap:rows}});
 assert.ok(unknown.findings.some(f=>f.id==='EAP-DISCIPLINE-AMBIGUOUS'));
 assert.ok(!unknown.findings.some(f=>f.id==='EAP-LEVEL-MISMATCH'));
});

test('official 16-column header wins over decorative document labels',()=>{
 const h=['NomeDocumento','Data Prevista','Workflow','Documento Ativo','Ação','Data da Linha Base','Propósito de Emissão Original','Documento Crítico','Observação','Caminho Data Book','N1','N2','N3','N4','N5','N6'];
 const out=C.parseRows([['Documento'],[],h,[doc,'01/01/2026','WF','','INCLUSÃO','','PARA CONSTRUÇÃO','','','UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR','U32','','','','','']],{contract:'contract-a'});
 assert.equal(out.headerRow,3);
 assert.equal(out.model,'official-16');
 assert.equal(out.records.length,1);
 assert.equal(out.records[0].document,doc);
});
test('header variants with punctuation preserve code and revision',()=>{
 const out=C.parseRows([['Nº Documento','Título do Documento','Revisão'],[doc,'Relatório de inspeção','0']],{contract:'contract-a'});
 assert.equal(out.records.length,1);
 assert.equal(out.records[0].document,doc);
 assert.equal(out.records[0].title,'Relatório de inspeção');
 assert.equal(out.records[0].revision,'0');
});
