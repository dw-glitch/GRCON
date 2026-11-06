'use strict';
// Etapa 6 (RA-13) — modelo de visualização do chat: pendências individuais, filtros, etapas, próxima ação e mensagens de recuperação.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const file=path.resolve(__dirname,'..','src/react/allocation-auditor/chatView.ts');
const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};new Function('module','exports',code)(mod,mod.exports);
const V=mod.exports,O=require(path.resolve(__dirname,'..','allocation_auditor_opinion.js'));
const finding=(id,severity,field,extra={})=>({id,severity,field,message:'Mensagem '+id,source:'Fonte '+id,origin:'LD',evidence:[{file:'LD.xlsx',sheet:'ELE',row:3}],...extra});
const rec=(field,before,after)=>({field,before,after,evidence:[{file:'LD.xlsx',row:3}]});
const row=(n,findings=[],recommendations=[],extra={})=>({document:'DOC-'+n,revision:'0',lineage:'L'+n,allocation:'ALOC-1',title:'T'+n,workflow:'WF-ANTIGO',findings,recommendations,...extra});
const rows=[row(1,[finding('E1','error','title'),finding('P1','pending','workflow'),finding('S1','suggestion','title')],[rec('workflow','WF-ANTIGO','WF-NOVO')]),row(2),row(3,[finding('X','pending','ld')])];
const opinion=O.build({rows,events:[]});

// 1. Itens: um por ocorrência e por proposta, com a orientação completa; erros primeiro.
const items=V.buildItems(rows,opinion,[]);
assert.deepEqual(items.map(i=>i.kind),['erro','pendencia','pendencia','proposta','sugestao']);
for(const it of items){for(const k of ['document','title','why','action','where','verify','status','fieldLabel'])assert.ok(String(it[k]).length>0,it.kind+' sem '+k);}
const error=items[0];assert.equal(error.document,'DOC-1');assert.equal(error.revision,'0');assert.equal(error.allocation,'ALOC-1');assert.equal(error.found,'T1');assert.equal(error.status,'Aberta');assert.equal(error.open,true);
assert.match(error.reference,/Fonte E1.*LD\.xlsx.*aba ELE.*linha 3/);assert.match(error.where,/LD/);
// 2. Proposta: valor sugerido separado do encontrado; nunca apresentada como correção feita.
const proposal=items.find(i=>i.kind==='proposta');assert.equal(proposal.found,'WF-ANTIGO');assert.equal(proposal.proposed,'WF-NOVO');assert.equal(proposal.status,'Aguardando decisão');assert.match(proposal.action,/não é correção realizada/i);
// 3. Sugestão preventiva não conta como aberta e não aceita decisão.
const suggestion=items.find(i=>i.kind==='sugestao');assert.equal(suggestion.open,false);assert.equal(suggestion.canDecide,false);
// 4. Campo sem regra de revisão (ld) não oferece decisão; campo revisável oferece.
assert.equal(items.find(i=>i.ruleId==='X').canDecide,false);assert.equal(proposal.canDecide,true);
// 5. Filtros e contagens.
const counts=V.countKinds(items);assert.deepEqual([counts.todas,counts.erro,counts.pendencia,counts.proposta,counts.sugestao,counts.abertas],[5,1,2,1,1,4]);
assert.equal(V.filterItems(items,{kind:'erro',query:'',onlyOpen:true}).length,1);
assert.equal(V.filterItems(items,{kind:'todas',query:'',onlyOpen:true}).length,4,'somente em aberto oculta a sugestão');
assert.equal(V.filterItems(items,{kind:'todas',query:'',onlyOpen:false}).length,5);
assert.equal(V.filterItems(items,{kind:'todas',query:'doc-3',onlyOpen:false}).length,1);
assert.equal(V.filterItems(items,{kind:'todas',query:'zzz',onlyOpen:false}).length,0);
// 5b. Ciclo de vida do parecer reflete na lista: exceção e correção verificada saem de "em aberto".
{
 const events=[{lineage:'L1',field:'workflow',after:'WF-NOVO',decision:'accepted',at:'2026-11-06T10:00:00Z'}];
 const files=[{name:'c.xlsx',changes:[{lineage:'L1',field:'workflow',after:'WF-NOVO',verified:true,cell:'C2'}]}];
 const op=O.build({rows,events,files});const next=V.buildItems(rows,op,events);
 const p=next.find(i=>i.kind==='proposta');assert.equal(p.statusCode,'aplicada');assert.equal(p.open,false);assert.equal(p.decision,'accepted');
}
// 5c. Reauditoria: o que persiste ou surgiu depois da correção ganha o rótulo da comparação.
{
 const cmp={items:[{kind:'ocorrencia',status:'persiste',allocation:'ALOC-1',document:'DOC-1',revision:'0',id:'E1',field:'title'},{kind:'ocorrencia',status:'nova',allocation:'ALOC-1',document:'DOC-1',revision:'0',id:'P1',field:'workflow'}]};
 const labelled=V.buildItems(rows,opinion,[],cmp);
 assert.equal(labelled.find(i=>i.ruleId==='E1').status,'Persiste após a correção');assert.equal(labelled.find(i=>i.ruleId==='P1').status,'Nova após a correção');
 assert.equal(labelled.find(i=>i.ruleId==='X').status,'Pendente de verificação','itens fora da comparação mantêm o status do parecer');
}
// 6. Próxima ação: ordem de prioridade, sem declarar prontidão sem parecer.
const base={records:[],rows:[],progress:0,total:0,busy:false,sources:[],pendingSheets:0,pendingAllocations:0,opinion:null};
assert.equal(V.nextAction({...base,pendingSheets:1}).id,'confirm-sheets');
assert.equal(V.nextAction({...base,pendingAllocations:1}).id,'confirm-identity');
assert.equal(V.nextAction({...base,busy:true,records:[1]}).id,'busy');
assert.equal(V.nextAction(base).id,'start');
assert.equal(V.nextAction({...base,records:[1]}).id,'audit');
assert.equal(V.nextAction({...base,records:[1],rows:[{}],total:5,progress:2}).id,'resume');
assert.equal(V.nextAction({...base,records:[1,2],rows:[],total:2,progress:0}).id,'audit','nada analisado (ex.: prazo no primeiro lote): auditar de novo, não retomar');
assert.equal(V.nextAction({...base,records:[1],rows:rows,total:3,progress:3,opinion}).id,'review','com impedimentos: ver pendências');
assert.equal(V.nextAction({...base,records:[1],rows:[row(2)],total:1,progress:1,opinion:O.build({rows:[row(2)]})}).id,'report');
assert.equal(V.nextAction({...base,records:[1],rows:rows,total:3,progress:3,opinion:null}).id,'review','sem parecer nunca vira "pronto"');
// 7. Etapas.
const st=V.buildStages({...base,records:[1],rows:rows,total:3,progress:3,sources:[{kind:'allocation'}],opinion});
assert.deepEqual(st.map(s=>s.id),['alocacao','fontes','auditoria','diagnostico','correcoes','relatorio']);
assert.equal(st[0].state,'done');assert.equal(st[1].state,'attention','sem LD é limitação, não sucesso');assert.equal(st[2].state,'done');assert.equal(st[4].state,'attention');assert.equal(st[5].state,'todo');
const clean=V.buildStages({...base,records:[1],rows:[row(2)],total:1,progress:1,sources:[{kind:'ld'}],opinion:O.build({rows:[row(2)]})});
assert.equal(clean[4].state,'done');assert.equal(clean[5].state,'current');
assert.equal(V.buildStages({...base,records:[1],rows:rows,total:3,progress:3,opinion:null})[4].state,'attention','sem parecer: atenção');
assert.equal(V.buildStages(base)[0].state,'current');
// 8. Mensagens de recuperação: vêm do catálogo compartilhado; sem ele, mensagem genérica (nunca quebra).
{
 const generic=V.friendlyError('Erro qualquer');assert.equal(generic.code,'UNKNOWN');assert.ok(generic.compromised.length>15&&generic.todo.length>15);
 globalThis.GrconAllocationAuditorErrors=require(path.resolve(__dirname,'..','allocation_auditor_errors.js'));
 const cases=[['Falha ao salvar a análise','','SAVE_FAILED',/Tentar salvar/],['Tempo esgotado na leitura','','TIMEOUT',/Retomar/],['Sessão expirada','','AUTH',/Entre novamente/],['Arquivo XLSX inválido ou corrompido','','FILE_INVALID',/\.xlsx/],['O motor mudou. Inicie uma nova auditoria','','RESUME_INCOMPATIBLE',/nova auditoria/i],['qualquer coisa','AI_FAILED','AI_FAILED',/orientação por item/]];
 for(const [m,code,expected,todo] of cases){const r=V.friendlyError(m,code);assert.equal(r.code,expected,m);assert.match(r.todo,todo,m);assert.equal(r.detail,m);}
 delete globalThis.GrconAllocationAuditorErrors;
}
console.log('allocation_auditor_chat_view_stage6: items, guidance, filters, lifecycle, next action, stages and recovery messages passed');
