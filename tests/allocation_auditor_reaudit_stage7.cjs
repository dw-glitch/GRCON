'use strict';
// Etapa 7 — reauditoria: comparação entre o resultado anterior e o posterior; só ela comprova resolução.
const assert=require('node:assert/strict'),path=require('node:path');
const R=require(path.resolve(__dirname,'..','allocation_auditor_reaudit.js')),O=require(path.resolve(__dirname,'..','allocation_auditor_opinion.js'));
const f=(id,field,severity='error',message='Mensagem '+id)=>({id,field,severity,message});
const p=(field,before,after)=>({field,before,after});
const row=(n,findings=[],recommendations=[],extra={})=>({allocation:'ALOC-1',document:'DOC-'+n,revision:'0',lineage:'L'+n,findings,recommendations,...extra});

const before=[row(1,[f('E1','title'),f('P1','workflow','pending')],[p('workflow','OLD','NEW')]),row(2,[f('E2','tag')]),row(3,[f('S1','title','suggestion')]),row(4,[f('E4','title')])];
const after=[row(1,[f('P1','workflow','pending')],[]),row(2,[f('E2','tag'),f('E9','databook')]),row(3),row(5,[f('E5','tag')])];
const c=R.compare(before,after);
const byId=id=>c.items.filter(i=>i.id===id);
assert.equal(byId('E1')[0].status,'resolvida');assert.equal(byId('P1')[0].status,'persiste');
assert.equal(byId('PROPOSTA')[0].status,'resolvida','proposta que sumiu = resolvida');
assert.equal(byId('E2')[0].status,'persiste');assert.equal(byId('E9')[0].status,'nova','regressão é identificada');
assert.equal(c.items.some(i=>i.id==='S1'),false,'sugestão preventiva não entra na comparação de apontamentos');
assert.deepEqual([c.summary.documentsCompared,c.summary.documentsOnlyBefore,c.summary.documentsOnlyAfter],[3,1,1],'DOC-4 só antes, DOC-5 só depois: fora da comparação');
assert.equal(c.items.some(i=>i.document==='DOC-4'||i.document==='DOC-5'),false,'documento que não existe nos dois lados não vira "resolvido"');
assert.deepEqual([c.summary.resolved,c.summary.persisting,c.summary.introduced,c.summary.errorsResolved,c.summary.errorsPersisting,c.summary.errorsIntroduced],[2,2,1,1,1,1]);
assert.equal(c.regressions,true);assert.equal(c.summary.documentsFullyResolved,0,'DOC-1 ainda tem a pendência P1');
assert.match(R.describe(c),/3 documento\(s\).*2 apontamento\(s\) resolvido.*2 persistente.*1 novo/);
assert.equal(R.compare([],[]).comparable,false);assert.match(R.describe(R.compare([row(1)],[row(9)])),/Sem resultado anterior comparável/);
// Mesmo documento em alocações diferentes não se confunde.
assert.equal(R.compare([row(1,[f('E1','title')],[],{allocation:'A'})],[row(1,[],[],{allocation:'B'})]).comparable,false);
// Documento totalmente resolvido.
assert.equal(R.compare([row(1,[f('E1','title')])],[row(1)]).summary.documentsFullyResolved,1);

// Integração com o parecer: a reauditoria é a prova; ausente nela = comprovada; presente = contradita; linha ausente = sem reauditoria.
const files=[{name:'03_x.xlsx',changes:[{lineage:'L1',field:'title',after:'NOVO',verified:true,cell:'C2'},{lineage:'L2',field:'tag',after:'T',verified:true,cell:'D3'}]}];
const reaudit=R.asReaudit(before,after);
assert.deepEqual(reaudit.map(x=>x.lineage).sort(),['L1','L2','L3']);
const o=O.build({rows:before,files,reaudit});
const state=(lineage,id)=>o.lifecycle.find(x=>x.lineage===lineage&&x.id===id).state;
assert.equal(state('L1','E1'),'resolvida-comprovada');assert.equal(state('L2','E2'),'resolucao-contradita');
assert.equal(o.state,'fix','erro persistente e erros sem reauditoria bloqueiam');
console.log('allocation_auditor_reaudit_stage7: before/after comparison, regressions, unmatched documents and opinion integration passed');
