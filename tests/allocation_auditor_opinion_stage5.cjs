'use strict';
// Etapa 5 (RA-03, RA-14) — parecer canônico: unidades separadas, ciclo de vida de ocorrências e propostas, reauditoria como única prova.
const assert=require('node:assert/strict'),path=require('node:path');
const O=require(path.resolve(__dirname,'..','allocation_auditor_opinion.js'));
const finding=(id,severity,field)=>({id,severity,field,message:id});
const rec=(field,before,after)=>({field,before,after,evidence:[{file:'LD.xlsx',row:3}]});
const row=(n,findings=[],recommendations=[],extra={})=>({document:'DOC-'+n,revision:'0',lineage:'L'+n,findings,recommendations,...extra});
const change=(lineage,field,after,extra={})=>({lineage,field,after,before:'x',cell:'C5',verified:true,...extra});
const ev=(lineage,field,after,decision,at,extra={})=>({lineage,field,after,decision,at,actor:'u1',...extra});
const state=r=>O.build(r).state;

// 1. Unidades distintas: 1 documento pode ter 3 ocorrências e 2 propostas; nenhum número substitui o outro.
{
 const rows=[row(1,[finding('A','error','title'),finding('B','error','tag'),finding('C','pending','workflow')],[rec('title','a','A'),rec('tag','b','B')]),row(2),row(3,[finding('S','suggestion','title')])];
 const o=O.build({rows});
 assert.equal(o.counts.rows,3);assert.equal(o.counts.documents,3);assert.equal(o.counts.documentsClear,1,'só DOC-2 está limpo; DOC-3 tem sugestão');
 assert.equal(o.counts.documentsWithErrors,1);assert.equal(o.counts.documentsWithPending,1);
 assert.deepEqual([o.counts.occurrences.total,o.counts.occurrences.errors,o.counts.occurrences.pending,o.counts.occurrences.suggestions],[4,2,1,1]);
 assert.equal(o.counts.proposals.total,2);assert.equal(o.counts.proposals.suggested,2);
 const d=O.describe(o.counts);
 assert.match(d.documents,/3 linha\(s\).*3 documento\(s\) distinto\(s\).*1 sem apontamentos/);
 assert.match(d.occurrences,/4 ocorrência\(s\): 2 erro\(s\).*1 pendência\(s\).*1 sugestão/);
 assert.match(d.proposals,/2 proposta\(s\) de correção: 2 sugerida\(s\)/);
 assert.equal(o.state,'fix');
}
// 2. Sugestão preventiva sozinha não bloqueia; documento limpo → pronta.
assert.equal(state({rows:[row(1,[finding('S','suggestion','title')]),row(2)]}),'ready');
assert.equal(state({rows:[row(1,[finding('P','pending','tag')])]}),'verify');

// 3. T13: proposta em aberto impede "pronta"; alteração do mesmo valor a cobre; de outro valor, não.
{
 const rows=[row(1,[],[rec('title','a','NOVO')])];
 assert.equal(state({rows}),'verify');assert.equal(O.build({rows}).blockers[0].code,'PROPOSTA-ABERTA');
 assert.equal(state({rows,files:[{name:'c.xlsx',changes:[change('L1','title','OUTRO')]}]}),'verify','alteração de outro valor não comprova a proposta');
 assert.equal(state({rows,files:[{name:'c.xlsx',changes:[change('L1','title','NOVO')]}]}),'ready');
 // autorizada continua aberta até existir alteração verificada
 const o=O.build({rows,events:[ev('L1','title','NOVO','accepted','2026-11-06T10:00:00Z')]});
 assert.equal(o.counts.proposals.authorized,1);assert.equal(o.state,'verify');
}
// 4. T14: uma alteração resolve no máximo UM erro do campo, salvo se cita os achados.
{
 const rows=[row(1,[finding('E1','error','title'),finding('E2','error','title')])];
 const one=O.build({rows,files:[{name:'c.xlsx',changes:[change('L1','title','N')]}]});
 assert.equal(one.uncorrectedErrors,1);assert.equal(one.state,'fix');
 const both=O.build({rows,files:[{name:'c.xlsx',changes:[change('L1','title','N',{findingIds:['E1','E2']})]}]});
 assert.equal(both.uncorrectedErrors,0);assert.equal(both.state,'ready');
 const unverified=O.build({rows,files:[{name:'c.xlsx',changes:[change('L1','title','N',{verified:false,findingIds:['E1','E2']})]}]});
 assert.equal(unverified.uncorrectedErrors,2,'alteração não verificada nunca resolve');
}
// 5. Erro + proposta do mesmo campo e mesma alteração: ambos cobertos (a proposta não gasta a cota do erro).
{
 const rows=[row(1,[finding('E1','error','title')],[rec('title','a','NOVO')])];
 const o=O.build({rows,files:[{name:'c.xlsx',changes:[change('L1','title','NOVO')]}]});
 assert.equal(o.uncorrectedErrors,0);assert.equal(o.counts.proposals.applied,1);assert.equal(o.state,'ready');
}
// 6. T15: vale a última decisão; recusar ou revogar depois de autorizar remove a autorização (mesmo fora de ordem no array).
{
 const rows=[row(1,[],[rec('title','a','NOVO')])];
 const accepted=ev('L1','title','NOVO','accepted','2026-11-06T10:00:00Z'),rejected=ev('L1','title','NOVO','rejected','2026-11-06T11:00:00Z');
 assert.equal(O.build({rows,events:[accepted]}).counts.proposals.authorized,1);
 const after=O.build({rows,events:[rejected,accepted]}); // array fora de ordem: decide o horário
 assert.equal(after.counts.proposals.authorized,0);assert.equal(after.counts.proposals.rejected,1);
 const reaccepted=O.build({rows,events:[accepted,rejected,ev('L1','title','NOVO','accepted','2026-11-06T12:00:00Z')]});
 assert.equal(reaccepted.counts.proposals.authorized,1);assert.equal(reaccepted.counts.proposals.rejected,0);
 // decisão sobre outro valor não vale para este
 assert.equal(O.build({rows,events:[ev('L1','title','OUTRO','accepted','2026-11-06T10:00:00Z')]}).counts.proposals.authorized,0);
}
// 7. Reauditoria é a única prova: sem ela, "aplicada sem reauditoria"; com o achado ainda presente, "resolução contradita".
{
 const rows=[row(1,[finding('E1','error','title')],[rec('title','a','NOVO')])];
 const files=[{name:'c.xlsx',changes:[change('L1','title','NOVO')]}];
 const noSecond=O.build({rows,files,reaudit:[]});
 assert.equal(noSecond.counts.occurrences.appliedUnproven,1);assert.equal(noSecond.state,'verify');
 assert.ok(noSecond.blockers.some(b=>b.code==='SEM-REAUDITORIA'));
 const still=O.build({rows,files,reaudit:[{lineage:'L1',findings:[finding('E1','error','title')],recommendations:[rec('title','a','NOVO')]}]});
 assert.equal(still.counts.occurrences.contradicted,1);assert.equal(still.counts.proposals.contradicted,1);assert.equal(still.state,'fix');
 const clean=O.build({rows,files,reaudit:[{lineage:'L1',findings:[],recommendations:[]}]});
 assert.equal(clean.counts.occurrences.resolvedProven,1);assert.equal(clean.counts.proposals.resolvedProven,1);assert.equal(clean.state,'ready');
 assert.ok(clean.lifecycle.every(x=>x.state==='resolvida-comprovada'));
}
// 8. Exceção só vale com justificativa e evidência humanas; mesmo válida, exige conferência final (nunca "pronta").
{
 const rows=[row(1,[finding('E1','error','title')])];
 const weak=ev('L1','title',undefined,'accepted','2026-11-06T10:00:00Z',{state:'Exceção justificada',justification:'ok',evidence:[]});
 assert.equal(O.build({rows,events:[weak]}).counts.occurrences.exceptions,0);
 const good={...weak,justification:'Título aprovado pela fiscal em reunião',evidence:['Ata 12/2026']};
 const o=O.build({rows,events:[good]});
 assert.equal(o.counts.occurrences.exceptions,1);assert.equal(o.uncorrectedErrors,0);assert.equal(o.state,'verify');
 assert.ok(o.blockers.some(b=>b.code==='EXCECAO-JUSTIFICADA'));
}
// 9. Arquivo não produzido e contexto limitado também impedem "pronta".
{
 const rows=[row(1)];
 assert.ok(O.build({rows,exceptions:['x.xlsx: falhou']}).blockers.some(b=>b.code==='ARQUIVO-NAO-PRODUZIDO'));
 assert.ok(O.build({rows,contextWarning:'LD indisponível'}).blockers.some(b=>b.code==='CONTEXTO-LIMITADO'));
 assert.equal(state({rows}),'ready');
}
// 10. Pacote: finalState usa o parecer canônico; manifesto/Resumo/chat com os mesmos números.
{
 require(path.resolve(__dirname,'..','allocation_auditor_package.js'));const P=globalThis.GrconAllocationAuditPackage;
 const rows=[row(1,[finding('E1','error','title')],[rec('title','a','NOVO')]),row(2)];
 const fs1=P.finalState(rows,[],[],'',[],undefined);
 const direct=O.build({rows});
 assert.deepEqual(fs1.counts,direct.counts);assert.equal(fs1.uncorrectedErrors,direct.uncorrectedErrors);assert.equal(fs1.openProposals,1);
 assert.equal(fs1.state,P.STATES.fix);
 const ready=P.finalState([row(2)],[],[],'',[],undefined);
 assert.equal(ready.state,P.STATES.ready);
}
console.log('allocation_auditor_opinion_stage5: units, lifecycle, latest decision, reaudit proof, exceptions and package integration passed');
