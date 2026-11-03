'use strict';
// Motor 1.4.0 — nt- × cadastro de TAGs, ortografia de título, código digitado e caminhos parecidos.
const assert=require('node:assert/strict'),C=require('../allocation_auditor_core.js');
assert.equal(C.VERSION,'1.4.0');
const code=t=>'C1O_RNEST_U32_10.2.1.2_ELE_RIR_'+t;
const filler=Array.from({length:120},(_,i)=>({document:'RL-5290.00-22313-91A-C1O-'+String(1000+i),revision:'0',title:'RELATORIO DE INSPECAO DE RECEBIMENTO DE TRANSFORMADOR DE POTENCIA '+i,source:'LD.xlsx',sheet:'ELE',row:i+2}));
const base=(over={})=>({contract:'qa',versions:{},bases:{appendix:[{tag:'NF-123-BOBINA-121'},{tag:'TR-0001'}],databook:[{databook:'UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR'}],workflows:[{workflow:'RNEST UHDTD U-32 C&M/ELETRICA'}]},ldRecords:filler,history:[],homologated:{},applicability:{},...over});
const audit=(rec,ctx=base())=>{const c={...ctx,records:[rec]};return C.auditRecord({contract:'qa',revision:'0',title:'',levels:[],...rec},c,C.prepare(c));};
const ids=r=>r.findings.map(f=>f.id);

// nt- presente, mas o TAG existe no cadastro → remover nt-
let r=audit({document:code('nt-NF-123-BOBINA-121')});
assert.ok(ids(r).includes('NT-PREFIX-IN-REFERENCE'));
let f=r.findings.find(x=>x.id==='NT-PREFIX-IN-REFERENCE');
assert.equal(f.suggestion.after,code('NF-123-BOBINA-121'));assert.equal(f.severity,'pending','sem base homologada não é erro confirmado');
assert.equal(audit({document:code('nt-NF-123-BOBINA-121')},base({homologated:{appendix:true}})).findings.find(x=>x.id==='NT-PREFIX-IN-REFERENCE').severity,'error');
// nt- presente e TAG realmente fora do cadastro → correto, sem apontamento de nt-
r=audit({document:code('nt-PECA-SOBRESSALENTE-9')});assert.ok(!ids(r).some(i=>i.startsWith('NT-PREFIX')),'nt- legítimo não é apontado');
// coincidência parcial é só sugestão a conferir
r=audit({document:code('nt-NF-123-BOBINA-121-X')});
assert.ok(ids(r).includes('NT-PREFIX-PARTIAL-MATCH')||ids(r).includes('NT-PREFIX-IN-REFERENCE'));
// sem nt- e TAG ausente do cadastro → sugerir nt-
r=audit({document:code('PECA-SOBRESSALENTE-9')});f=r.findings.find(x=>x.id==='TAG-NOT-PROVEN');
assert.ok(f);assert.equal(f.suggestion.after,code('nt-PECA-SOBRESSALENTE-9'));assert.match(f.message,/nt-/);
// sem nt- e TAG existente → nada
r=audit({document:code('TR-0001')});assert.ok(!ids(r).includes('TAG-NOT-PROVEN')&&!ids(r).some(i=>i.startsWith('NT-')));
// cadastro de TAGs indisponível → não afirma nada sobre nt-
r=audit({document:code('PECA-9')},base({bases:{databook:[]}}));assert.ok(!r.findings.some(x=>x.suggestion?.field==='document'));

// ortografia do título por similaridade com a LD
r=audit({document:'RL-5290.00-22313-91A-C1O-900',title:'RELATORIO DE INSPECAO DE RECEBIMENTO DE TRANSFORMDOR DE POTENCIA'});
f=r.findings.find(x=>x.id==='TITLE-TYPO-SUSPECT');assert.ok(f,'erro de digitação detectado');
assert.equal(f.suggestion.after,'RELATORIO DE INSPECAO DE RECEBIMENTO DE TRANSFORMADOR DE POTENCIA');
assert.equal(r.recommendations.find(x=>x.field==='title').after,f.suggestion.after);assert.equal(f.severity,'pending');
// flexão (plural) e palavras corretas NÃO são apontadas
r=audit({document:'RL-5290.00-22313-91A-C1O-901',title:'RELATORIO DE INSPECAO DE RECEBIMENTO DE TRANSFORMADORES DE POTENCIA'});assert.ok(!ids(r).includes('TITLE-TYPO-SUSPECT'),'plural não é erro');
r=audit({document:'RL-5290.00-22313-91A-C1O-902',title:'RELATORIO DE INSPECAO DE RECEBIMENTO DE TRANSFORMADOR DE POTENCIA'});assert.ok(!r.findings.some(x=>x.field==='title'&&x.suggestion),'título correto não gera proposta');
// formatação: espaços e palavra repetida
r=audit({document:'RL-5290.00-22313-91A-C1O-903',title:'RELATORIO  DE INSPECAO DE DE RECEBIMENTO ,'});f=r.findings.find(x=>x.id==='TITLE-FORMAT');
assert.ok(f);assert.equal(f.suggestion.after,'RELATORIO DE INSPECAO DE RECEBIMENTO,');
// vocabulário insuficiente (LD pequena): nenhuma afirmação ortográfica
r=audit({document:'RL-5290.00-22313-91A-C1O-904',title:'RELATORIO DE TRANSFORMDOR'},base({ldRecords:filler.slice(0,10)}));assert.ok(!ids(r).includes('TITLE-TYPO-SUSPECT'));

// código digitado quase igual a um da LD
const typo=audit({document:'RL-5290.00-22313-91A-C1O-1004'.replace('1004','1O04')});
assert.ok(typo.findings.some(x=>x.id==='CODE-TYPO-SUSPECT'&&x.suggestion.after==='RL-5290.00-22313-91A-C1O-1004'),'letra O no lugar do zero');
assert.ok(audit({document:'RL-5290.00-22313-91A-C1O-1004'}).findings.every(x=>x.id!=='CODE-TYPO-SUSPECT'),'código existente não é apontado');

// caminho e workflow quase iguais aos cadastrados
r=audit({document:'RL-5290.00-22313-91A-C1O-1004',databook:'UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIRR',workflow:'RNEST UHDTD U-32 C&M/ELETRICO'});
assert.equal(r.findings.find(x=>x.id==='DATABOOK-NOT-FOUND').suggestion.after,'UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR');
assert.equal(r.findings.find(x=>x.id==='WORKFLOW-UNKNOWN').suggestion.after,'RNEST UHDTD U-32 C&M/ELETRICA');
// nada disso consome numeração nem é correção automática: títulos não entram em regras do servidor
assert.ok(!require('node:fs').readFileSync(require.resolve('../allocation_auditor_assistant.js'),'utf8').includes("field==='title'&&"));
console.log('allocation_auditor_intelligence_phase10: nt-, TAG sem nt-, ortografia de título, formatação, código digitado, caminho/workflow parecidos e limites aprovados');
