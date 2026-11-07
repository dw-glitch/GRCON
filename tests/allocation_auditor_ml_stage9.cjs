'use strict';
// Etapas 9–10 (RA-12) — infraestrutura de aprendizado. TODOS os dados aqui são SINTÉTICOS e servem só para provar a mecânica;
// nenhum modelo real foi treinado e nenhum acervo corporativo foi usado.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const M=require(path.join(root,'allocation_auditor_ml.js')),C=require(path.join(root,'allocation_auditor_core.js')),Opinion=require(path.join(root,'allocation_auditor_opinion.js'));
const T=M.THRESHOLDS;
// ---------- gerador sintético determinístico (sinal plantado) ----------
function lcg(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function synthetic(n,{seed=7,contract='SYN-1',start=Date.UTC(2024,0,1),days=900}={}){
 const rnd=lcg(seed),events=[];
 const comments={title:'TITULO INCOMPLETO NO DOCUMENTO',workflow:'WORKFLOW INCORRETO PARA A DISCIPLINA',databook:'CAMINHO DATA BOOK ERRADO'};
 for(let i=0;i<n;i++){
  const when=start+Math.floor(i*days/n)*86400000,r=rnd();
  const flexible=rnd()<0.3,oldWf=rnd()<0.25,pendingDb=rnd()<0.2;
  const cats=[];if(flexible&&rnd()<0.9)cats.push('title');if(oldWf&&rnd()<0.9)cats.push('workflow');if(pendingDb&&rnd()<0.85)cats.push('databook');
  const comment=cats.map(c=>comments[c]).join('. ');
  const doc='C1O_RNEST_U32_10.2.1.2_'+(rnd()<0.5?'ELE':'CVL')+'_RIR_nt-DOC-'+String(1000+Math.floor(i/2));  // 2 revisões por documento
  events.push({contract,sourceVersion:'v1',sourceSheet:'GERAL',sourceRow:i+2,document:doc,revision:String(i%2),allocation:'ALOC-'+(1+Math.floor(i/60)),returnedAt:new Date(when).toISOString().slice(0,10),
   fiscalDecision:cats.length?'recusado':'aceito-sem-comentarios',fiscalComment:cats.length?comment:'OK',commentFindings:cats.length?C.classifyComment(comment):[],status:'',
   title:flexible?'CABO FLEXIVEL DE CONTROLE '+i:'RELATORIO DE INSPECAO '+i,workflow:oldWf?'WF ANTIGO RNEST':'WF NOVO RNEST',databook:pendingDb?'DB PENDENTE':'DB|QUALIDADE|ELE|RIR',discipline:'ELE',tag:'',eap:'5.7',levels:['A','B'],ldVersion:'LD-v3',docKind:'ET'});
 }
 return events;
}
const AUTH={id:'AUT-SINTETICA-1',grantedBy:'Responsável Humano (sintético)',grantedAt:'2026-11-01',contracts:['SYN-1'],scope:['treino-local']};
const reviewAll=(candidates,reviewer='Revisor Técnico (sintético)')=>candidates.map(c=>({eventId:c.id,reviewer,reviewedAt:'2026-11-02',decision:'confirmado'}));

// ---------- autorização ----------
assert.equal(M.checkAuthorization(AUTH).valid,true);
for(const [label,bad,issue] of [['nula',null,'SEM-AUTORIZACAO'],['sem responsável',{...AUTH,grantedBy:''},'AUTORIZACAO-SEM-RESPONSAVEL-HUMANO'],['robô autorizando',{...AUTH,grantedBy:'Robô Auditor'},'AUTORIZACAO-SEM-RESPONSAVEL-HUMANO'],['sem escopo',{...AUTH,scope:['producao']},'AUTORIZACAO-SEM-ESCOPO-TREINO-LOCAL'],['sem contratos',{...AUTH,contracts:[]},'AUTORIZACAO-SEM-CONTRATOS'],['sem data',{...AUTH,grantedAt:''},'AUTORIZACAO-SEM-DATA'],['expirada',{...AUTH,expiresAt:'2026-01-01'},'AUTORIZACAO-EXPIRADA'],['sem id',{...AUTH,id:''},'AUTORIZACAO-SEM-IDENTIFICADOR']]){
 const r=M.checkAuthorization(bad,Date.UTC(2026,10,6));assert.equal(r.valid,false,label);assert.ok(r.issues.includes(issue),label+': '+r.issues);
}

// ---------- 1: sem autorização o acervo inteiro é bloqueado ----------
{
 const events=synthetic(50),inv=M.inventory(events,{authorization:null});
 assert.equal(inv.blocked,true);assert.equal(inv.eligible.length,0);assert.equal(inv.excluded.length,50);assert.equal(inv.byReason['SEM-AUTORIZACAO'],50);
 const run=M.run({events,authorization:null});assert.equal(run.status,'BLOQUEADO');assert.ok(run.blockers.includes('SEM-AUTORIZACAO'));assert.equal(run.model,undefined,'nenhum modelo sem autorização');
}
// ---------- 2–4: inventário, vínculo documento×revisão, estado prévio, inválidos e inconclusivos ----------
{
 const base=synthetic(1)[0];
 const ev=(over)=>{ev.n=(ev.n||10)+1;return {...base,sourceRow:ev.n,document:base.document.replace(/\d+$/,'')+ev.n,...over};}; // cada evento num documento próprio, salvo duplicados e rodadas conflitantes montados de propósito
 const list=[ev({}),ev({document:''}),ev({revision:''}),ev({allocation:''}),ev({returnedAt:'não é data'}),ev({fiscalDecision:'nao-comprovado'}),ev({title:''}),ev({ldVersion:'',ld:''}),ev({fiscalDecision:'recusado',fiscalComment:''}),ev({contract:'OUTRO'}),
  ev({fiscalDecision:'recusado',fiscalComment:'ALGO SEM CATEGORIA CONHECIDA',commentFindings:[{category:'unconfirmed'}]}),
  ev({document:'DUP_DOC_1_2_3_4_5_6',sourceRow:900,fiscalDecision:'aceito-sem-comentarios',fiscalComment:'OK'}),ev({document:'DUP_DOC_1_2_3_4_5_6',sourceRow:901,fiscalDecision:'aceito-sem-comentarios',fiscalComment:'OK'}),
  ev({document:'CONF_DOC',sourceRow:950,returnedAt:'2026-05-05',fiscalDecision:'recusado',fiscalComment:'TITULO INCOMPLETO',commentFindings:C.classifyComment('TITULO INCOMPLETO')}),ev({document:'CONF_DOC',sourceRow:951,returnedAt:'2026-05-05',fiscalDecision:'aceito-sem-comentarios',fiscalComment:'OK'})];
 const inv=M.inventory(list,{authorization:AUTH});
 assert.equal(inv.eligible.length,2,'o evento válido e o primeiro dos duplicados');assert.equal(inv.inconclusive.length,3,'comentário sem categoria + rodada conflitante (2)');
 const reasons=Object.keys(inv.byReason).sort();
 for(const r of ['SEM-DOCUMENTO','SEM-REVISAO','SEM-ALOCACAO','DATA-INVALIDA','SEM-DECISAO-COMPROVADA','SEM-ESTADO-PREVIO','SEM-COMENTARIO','CONTRATO-NAO-AUTORIZADO','COMENTARIO-NAO-CLASSIFICADO','RODADA-CONFLITANTE','DUPLICADO'])assert.ok(reasons.includes(r),'faltou o motivo '+r);
 assert.equal(inv.total,list.length);assert.equal(inv.eligible.length+inv.inconclusive.length+inv.excluded.length,list.length,'todo evento é classificado exatamente uma vez');
 assert.ok(inv.excluded.every(e=>e.reasons.length>=1));
 // vínculo exato: o mesmo documento em outra revisão/alocação nunca é "casado" por semelhança
 const id=M.eventId;assert.notEqual(id({...base,revision:'0'}),id({...base,revision:'1'}));
}

// ---------- 5: rótulos — regra é palpite; só revisão humana vira rótulo ----------
{
 const inv=M.inventory(synthetic(40),{authorization:AUTH}),c=inv.eligible;
 const weak=M.weakLabel(c.find(x=>x.event.fiscalDecision==='recusado').event);assert.equal(weak.source,'regra');assert.equal(weak.reviewed,false);
 assert.equal(M.admitLabels(c,[]).examples.length,0,'sem revisão não há rótulo');assert.equal(M.admitLabels(c,[]).pendingReview,c.length);
 const bad=[{eventId:c[0].id,reviewer:'Robô Auditor',reviewedAt:'2026-11-02',decision:'confirmado'},{eventId:c[1].id,reviewer:'Ana',reviewedAt:'',decision:'confirmado'},{eventId:c[2].id,reviewer:'Ana',reviewedAt:'2026-11-02',decision:'rejeitado'},{eventId:c[3].id,reviewer:'Ana',reviewedAt:'2026-11-02',decision:'inconclusivo'},{eventId:c[4].id,reviewer:'Ana',reviewedAt:'2026-11-02',decision:'corrigido',categories:['inventada']},{eventId:c[5].id,reviewer:'Ana',reviewedAt:'2026-11-02',decision:'corrigido',categories:['tag']}];
 const adm=M.admitLabels(c,bad);assert.equal(adm.examples.length,1,'só a correção humana válida entra');assert.deepEqual(adm.examples[0].y,['tag'],'a revisão humana prevalece sobre o palpite da regra');
 assert.deepEqual(adm.rejected.map(r=>r.reasons[0]).sort(),['CATEGORIA-INVALIDA','REVISAO-SEM-DATA','REVISOR-NAO-HUMANO','ROTULO-INCONCLUSIVO','ROTULO-REJEITADO']);
}
// ---------- características: nada do comentário/decisão fiscal ----------
{
 const e=synthetic(1)[0],other={...e,fiscalComment:'TEXTO COMPLETAMENTE DIFERENTE',fiscalDecision:'recusado',status:'RECUSADO',commentFindings:[{category:'tag'}],returnedAt:'2030-01-01'};
 assert.deepEqual(M.features(e),M.features(other),'comentário, decisão, status e data não influenciam as características');
 const src=fs.readFileSync(path.join(root,'allocation_auditor_ml.js'),'utf8'),feat=src.slice(src.indexOf('function features(e)'),src.indexOf('// ---------- 6:'));
 for(const f of M.FORBIDDEN_FEATURE_FIELDS)assert.ok(!new RegExp('\\be\\.'+f+'\\b').test(feat),'features() não pode ler '+f);
 assert.ok(M.features(e).every(t=>/^[a-z0-9]+:/.test(t)));
}
// ---------- 6: divisão sem vazamento documental nem temporal ----------
const events=synthetic(900),inv=M.inventory(events,{authorization:AUTH});
assert.equal(inv.eligible.length,900,'o acervo sintético é todo elegível');
const labeled=M.admitLabels(inv.eligible,reviewAll(inv.eligible));assert.equal(labeled.examples.length,900);
const sp=M.split(labeled.examples);
assert.equal(sp.leakage.ok,true,JSON.stringify(sp.leakage.violations.slice(0,2)));
assert.ok(sp.counts.train>0&&sp.counts.validation>0&&sp.counts.test>=T.minTest,JSON.stringify(sp.counts));
assert.equal(sp.counts.train+sp.counts.validation+sp.counts.test+sp.counts.dropped,900,'nenhum exemplo some sem ser contado');
{ // as duas revisões de um mesmo documento ficam sempre na mesma parte
 const where=new Map();for(const part of ['train','validation','test'])for(const ex of sp[part])where.set(ex.docKey,(where.get(ex.docKey)||new Set()).add(part));
 assert.ok([...where.values()].every(s=>s.size===1));
 const max=p=>Math.max(...sp[p].map(e=>e.time)),min=p=>Math.min(...sp[p].map(e=>e.time));assert.ok(max('train')<min('validation')&&max('validation')<min('test'),'treino < validação < teste, estritamente');
 // o detector pega vazamento introduzido de propósito
 const doc=JSON.parse(JSON.stringify(sp));doc.test.push({...sp.train[0],id:'copia'});assert.ok(M.assertNoLeakage(doc).violations.some(v=>v.type==='documento'),'vazamento documental detectado');
 const tmp=JSON.parse(JSON.stringify(sp));tmp.train.push({...sp.test[0],group:'OUTRO-GRUPO',id:'x'});assert.ok(M.assertNoLeakage(tmp).violations.some(v=>v.type==='temporal'),'vazamento temporal detectado');
}
// grupo que atravessa a fronteira é descartado e informado, não "emprestado"
{
 const ex=(group,time)=>({id:group+time,group,time,x:['a:b'],y:[],commentHash:'h'+time});
 const arr=[];for(let i=0;i<40;i++)arr.push(ex('G'+i,Date.UTC(2025,0,1)+i*86400000*10));arr.push(ex('G0',Date.UTC(2025,0,1)+39*86400000*10+86400000));
 const s2=M.split(arr);assert.equal(s2.leakage.ok,true);assert.ok(s2.dropped.some(d=>d.group==='G0'),'G0 atravessa as fronteiras e é descartado');
}

// documento de vida longa: duas revisões muito distantes no tempo nunca podem cair em partes diferentes (nem vazar pelo outro lado)
{
 const base=synthetic(300,{seed:11}),longo=(rev,date,row)=>({...base[0],sourceRow:5000+row,document:'C1O_RNEST_U32_10.2.1.2_ELE_RIR_nt-DOC-LONGO',revision:rev,returnedAt:date,fiscalDecision:'aceito-sem-comentarios',fiscalComment:'OK',commentFindings:[]});
 const all=[...base,longo('0','2024-02-01',1),longo('1','2026-06-01',2)],invL=M.inventory(all,{authorization:AUTH}),labL=M.admitLabels(invL.eligible,reviewAll(invL.eligible)),spL=M.split(labL.examples);
 const partsOfLongo=['train','validation','test'].filter(p=>spL[p].some(e=>/DOC-LONGO/.test(e.docKey)));
 assert.ok(partsOfLongo.length<=1,'as duas revisões do documento longo ficam juntas: '+partsOfLongo);assert.equal(spL.leakage.ok,true);
 assert.ok(partsOfLongo.length===0?spL.dropped.some(d=>/DOC-LONGO/.test(d.group)):true,'se atravessa fronteiras, é descartado e informado');
}

// ---------- 7–8: classificadores leves, precedentes e avaliação ----------
const nenhum=()=>[];
const run1=M.run({events,authorization:AUTH,reviews:reviewAll(inv.eligible),createdBy:'Treinador Sintético',createdAt:'2026-11-06T10:00:00.000Z',baselines:{'regra-do-motor':ex=>ex.y.length?['history']:[]}});
assert.equal(run1.status,'CONCLUIDO',JSON.stringify(run1.blockers));
const ev1=run1.evaluation;
{ // contas: tp+fn=suporte; tp+fp+tn+fn=exemplos; todas as categorias presentes
 for(const c of M.CATEGORIES){const m=ev1.perCategory[c];assert.equal(m.tp+m.fp+m.tn+m.fn,ev1.examples,c);assert.equal(m.tp+m.fn,m.support,c);}
 assert.ok(ev1.macroF1>=ev1.baselines['nenhuma-categoria'].macroF1+T.minMacroF1Gain&&ev1.macroF1>0.6,'o sinal plantado é aprendido (macroF1='+ev1.macroF1.toFixed(2)+')');
 for(const c of ['title','workflow','databook']){assert.ok(ev1.perCategory[c].support>=T.minTestSupport,c+' tem suporte');assert.ok(ev1.perCategory[c].recall>0.6&&ev1.perCategory[c].precision>0.6,c+' P/R '+ev1.perCategory[c].precision.toFixed(2)+'/'+ev1.perCategory[c].recall.toFixed(2));}
 assert.equal(ev1.perCategory.tag.support,0);assert.equal(ev1.perCategory.tag.sufficient,false,'categoria sem exemplos não é "suficiente"');assert.ok(!run1.model.categories.includes('tag'),'categoria sem suporte de treino fica desabilitada');
 assert.ok(['falsePositiveRate','falseNegativeRate'].every(k=>k in ev1.perCategory.title),'falsos positivos e falsos negativos reportados por categoria');
 assert.ok(run1.retrieval.hitRate>0.6&&run1.retrieval.answered>0,'recuperação de precedentes acerta categoria acima do acaso: '+JSON.stringify(run1.retrieval));
}
{ // avaliação conferida à mão: 4 casos, 1 categoria
 const test=[{y:['title']},{y:['title']},{y:[]},{y:[]}],preds=[['title'],[],['title'],[]];let i=0;
 const r=M.evaluate(test,()=>preds[i++],{categories:['title']}).perCategory.title;
 assert.deepEqual([r.tp,r.fp,r.fn,r.tn],[1,1,1,1]);assert.equal(r.precision,0.5);assert.equal(r.recall,0.5);assert.equal(r.f1,0.5);assert.equal(r.falsePositiveRate,0.5);
}
// o teste nunca participa do treino nem da calibração: embaralhar os RÓTULOS DE TESTE não muda o modelo
{
 const shuffled=labeled.examples.map(e=>sp.test.some(t=>t.id===e.id)?{...e,y:e.y.length?[]:['title']}:e);
 const mapped=new Map(shuffled.map(e=>[e.id,e]));const sp2=M.split(shuffled);
 const m1=M.tuneThresholds(M.trainClassifier(sp.train),sp.validation),m2=M.tuneThresholds(M.trainClassifier(sp2.train),sp2.validation);
 assert.deepEqual(m1.thresholds,m2.thresholds);assert.equal(JSON.stringify(m1.stats.title.delta),JSON.stringify(m2.stats.title.delta));void mapped;
}
// determinismo: mesma entrada → mesma versão, métricas e limiares
{const run2=M.run({events,authorization:AUTH,reviews:reviewAll(inv.eligible),createdBy:'Treinador Sintético',createdAt:'2026-11-06T10:00:00.000Z',baselines:{'regra-do-motor':ex=>ex.y.length?['history']:[]}});
 assert.equal(run2.card.version,run1.card.version);assert.equal(JSON.stringify(run2.card.evaluation),JSON.stringify(run1.card.evaluation));}

// ---------- 9: cartão do modelo — versão, origem, limitações ----------
const card=run1.card;
assert.match(card.version,/^ml-20261106-[0-9a-f]{6}$/);assert.equal(card.origin.authorizationId,AUTH.id);assert.equal(card.origin.authorizedBy,AUTH.grantedBy);assert.deepEqual(card.origin.contracts,['SYN-1']);assert.ok(card.origin.datasetHash);assert.equal(card.origin.labeled,900);assert.deepEqual(card.origin.reviewers,['Revisor Técnico (sintético)']);
assert.equal(card.origin.split.leakage,true);assert.equal(card.evaluation.testUsedForTuning,false);assert.equal(card.evaluation.thresholdsTunedOn,'validation');assert.equal(card.evaluation.independent,true);
assert.ok(card.limitations.length>=5&&card.limitations.some(l=>/nunca cria erro/.test(l)));assert.equal(card.status,'candidato');assert.equal(card.activation.eligible,false,'nasce candidato, nunca ativo');
assert.ok(card.enabledCategories.every(c=>ev1.perCategory[c].precision>=T.minPrecision&&ev1.perCategory[c].sufficient));

// ---------- pipeline bloqueia quando não há rótulos revisados suficientes ----------
{
 const few=M.run({events,authorization:AUTH,reviews:reviewAll(inv.eligible.slice(0,50))});assert.equal(few.status,'BLOQUEADO');assert.match(few.blockers[0],/ROTULOS-INSUFICIENTES: 50 revisados/);assert.equal(few.model,undefined);
 const none=M.run({events,authorization:AUTH,reviews:[]});assert.equal(none.status,'BLOQUEADO');assert.equal(none.labels.pendingReview,900);
 const tiny=M.run({events:synthetic(320),authorization:AUTH,reviews:reviewAll(M.inventory(synthetic(320),{authorization:AUTH}).eligible)});
 assert.ok(tiny.status==='BLOQUEADO'?/TESTE-INSUFICIENTE|ROTULOS/.test(tiny.blockers[0]):tiny.split.counts.test>=T.minTest,'teste pequeno demais bloqueia');
}

// ---------- 10: ativação, desligamento e retorno ----------
{
 const reg=M.createRegistry();reg.register(card,{model:run1.model,retriever:run1.retriever},'Treinador Sintético');
 assert.throws(()=>reg.register(card,{}),/imutáveis/,'versão registrada é imutável');
 const refused=(c,who)=>{const r=M.createRegistry();r.register(c,{model:run1.model,retriever:run1.retriever});return r.activate(c.version,{approvedBy:who});};
 assert.ok(refused(card,'').reasons.includes('SEM-APROVACAO-HUMANA'));assert.ok(refused(card,'Robô Auditor').reasons.includes('SEM-APROVACAO-HUMANA'));
 assert.ok(refused(card,'Treinador Sintético').reasons.includes('APROVADOR-IGUAL-AO-TREINADOR'));
 assert.ok(refused({...card,evaluation:null},'Gestora').reasons.includes('SEM-AVALIACAO'));
 assert.ok(refused({...card,evaluation:{...card.evaluation,independent:false}},'Gestora').reasons.includes('AVALIACAO-NAO-INDEPENDENTE'));
 assert.ok(refused({...card,evaluation:{...card.evaluation,testUsedForTuning:true}},'Gestora').reasons.includes('TESTE-USADO-NA-CALIBRACAO'));
 assert.ok(refused({...card,evaluation:{...card.evaluation,macroF1:0.01}},'Gestora').reasons.includes('NAO-SUPERA-O-PONTO-DE-PARTIDA'));
 assert.ok(refused({...card,enabledCategories:[]},'Gestora').reasons.includes('NENHUMA-CATEGORIA-COM-SUPORTE-E-PRECISAO'));
 assert.equal(reg.activate(card.version,{approvedBy:'Robô Auditor'}).activated,false);assert.equal(reg.active(),null,'nada ativo sem aprovação humana');
 assert.deepEqual(reg.activate(card.version,{approvedBy:'Gestora da Qualidade'}),{activated:true,reasons:[]});assert.equal(reg.active().card.version,card.version);assert.equal(reg.active().card.status,'ativo');
 // segunda versão, melhor que o ponto de partida, para testar retorno
 const card2={...card,version:'ml-20261107-aaaaaa',createdAt:'2026-11-07T10:00:00.000Z'};reg.register(card2,{model:run1.model,retriever:run1.retriever},'Treinador Sintético');
 assert.equal(reg.activate(card2.version,{approvedBy:'Gestora da Qualidade'}).activated,true);assert.equal(reg.active().card.version,card2.version);
 assert.deepEqual(reg.rollback('Gestora da Qualidade'),{rolledBack:true,version:card.version});assert.equal(reg.active().card.version,card.version,'retorno à versão anterior');
 assert.equal(reg.deactivate('Gestora da Qualidade','teste de desligamento'),true);assert.equal(reg.active(),null,'modelo desligado');
 assert.equal(M.createRegistry().rollback('x').rolledBack,false);
 const actions=reg.history().map(h=>h.action);for(const a of ['registrar','ativar','ativacao-recusada','reverter','desligar'])assert.ok(actions.includes(a),'histórico registra '+a);
 assert.ok(reg.history().every(h=>h.actor!==undefined&&h.at),'toda ação tem responsável e horário');
 const restored=M.createRegistry(reg.toJSON());assert.equal(restored.list().length,2,'o registro é serializável e preserva versões anteriores');
}

// ---------- 10: aprendizado contínuo controlado ----------
{
 const good={id:'ex1',contract:'SYN-1',source:'humano',lifecycleState:'resolvida-comprovada',reauditProof:true,humanDecision:{actor:'Marina',evidence:['LD.xlsx linha 7'],decision:'accepted'}};
 const ledger=M.createLedger();
 assert.equal(ledger.submit(good,{authorization:AUTH}).admitted,true);
 assert.equal(ledger.submit({...good,id:'g1',source:'robo'},{authorization:AUTH}).admitted,false,'palpite do robô nunca vira exemplo');
 assert.ok(ledger.submit({...good,id:'g2',humanDecision:{actor:'Modelo',evidence:['x']}},{authorization:AUTH}).reasons.includes('SEM-DECISAO-HUMANA'));
 assert.equal(ledger.submit({...good,id:'p1',lifecycleState:'pendente',reauditProof:false},{authorization:AUTH}).pool,'pendente','caso não resolvido fica em pool separado');
 assert.equal(ledger.submit({...good,id:'p2',lifecycleState:'aplicada-sem-reauditoria',reauditProof:false},{authorization:AUTH}).admitted,false);
 assert.ok(ledger.submit({...good,id:'c1',contract:'OUTRO'},{authorization:AUTH}).reasons.includes('CONTRATO-NAO-AUTORIZADO'),'sem aprendizado cruzado entre contratos');
 assert.ok(ledger.submit({...good,id:'a1'},{authorization:null}).reasons.includes('SEM-AUTORIZACAO'));
 assert.ok(ledger.submit({...good,id:'e1',humanDecision:{actor:'Marina',evidence:[]}},{authorization:AUTH}).reasons.includes('SEM-EVIDENCIA'));
 assert.deepEqual(ledger.counts(),{resolved:1,pending:2,refused:5},JSON.stringify(ledger.counts()));assert.equal(ledger.resolved('SYN-1').length,1);assert.equal(ledger.resolved('OUTRO').length,0);
 assert.equal(ledger.readyForUpdate(1),true);assert.equal(ledger.readyForUpdate(50),false);
}

// ---------- integração: somente como SUGESTÃO; regras determinísticas independentes ----------
{
 const reg=M.createRegistry();reg.register(card,{model:run1.model,retriever:run1.retriever},'Treinador Sintético');
 const row={contract:'SYN-1',document:'C1O_RNEST_U32_10.2.1.2_ELE_RIR_nt-DOC-1',revision:'0',allocation:'ALOC-9',title:'CABO FLEXIVEL DE CONTROLE 99',workflow:'WF ANTIGO RNEST',databook:'DB PENDENTE',discipline:'ELE',eap:'5.7',levels:['A','B'],ldVersion:'LD-v3',docKind:'ET'};
 assert.deepEqual(M.suggest(reg.active(),row),[],'sem modelo ativo, nenhuma sugestão');
 reg.activate(card.version,{approvedBy:'Gestora da Qualidade'});
 const s=M.suggest(reg.active(),row);assert.ok(s.length>=1);
 for(const x of s){assert.equal(x.severity,'suggestion');assert.equal(x.origin,'modelo');assert.equal(x.modelSuggestion,true);assert.ok(/não normativa/.test(x.message));assert.ok(x.evidence[0].modelVersion===card.version&&x.evidence[0].limitations.length>=5);}
 assert.ok(s.some(x=>x.id==='ML-TITLE'),'o padrão plantado aparece');assert.ok(s.every(x=>!('after' in x)),'sugestão do modelo não traz valor novo');
 assert.deepEqual(M.suggest(reg.active(),row,{enabled:false}),[],'desligado');assert.deepEqual(M.suggest(reg.active(),{...row,contract:'OUTRO'}),[],'outro contrato não recebe sugestão');
 // no motor: opcional e sem alterar o resultado determinístico
 const ctx={contract:'SYN-1',records:[row],versions:{},bases:{},ldRecords:[],history:[],homologated:{},applicability:{}};
 const plain=C.auditRecord(row,ctx,C.prepare(ctx)),withMl=C.auditRecord(row,{...ctx,mlModel:reg.active()},C.prepare(ctx));
 const noMl=f=>f.filter(x=>!x.modelSuggestion);
 assert.deepEqual(noMl(withMl.findings).map(f=>[f.id,f.severity]),plain.findings.map(f=>[f.id,f.severity]),'achados determinísticos idênticos com e sem modelo');
 assert.ok(withMl.findings.some(f=>f.modelSuggestion&&f.severity==='suggestion'));assert.deepEqual(withMl.recommendations,plain.recommendations,'o modelo não cria propostas');
 const off=C.auditRecord(row,{...ctx,mlModel:reg.active(),mlEnabled:false},C.prepare(ctx));assert.equal(off.findings.length,plain.findings.length,'mlEnabled:false desliga');
 const broken=C.auditRecord(row,{...ctx,mlModel:{card:{status:'ativo',origin:{contracts:['SYN-1']}},payload:{}}},C.prepare(ctx));assert.equal(broken.findings.length,plain.findings.length,'modelo corrompido não derruba a auditoria');
 // parecer: sugestão do modelo não bloqueia nem muda o estado final
 const clean={...row,title:'T',workflow:'',databook:''};
 const a=Opinion.build({rows:[{...plain,findings:[],lineage:'L1'}]}),b=Opinion.build({rows:[{...plain,findings:s,lineage:'L1'}]});
 assert.equal(a.state,'ready');assert.equal(b.state,'ready','sugestão do modelo nunca impede nem muda o estado');void clean;
}

// ---------- local e sem serviço externo ----------
{
 const src=fs.readFileSync(path.join(root,'allocation_auditor_ml.js'),'utf8').replace(/\/\/[^\n]*/g,'');
 for(const forbidden of [/\bfetch\s*\(/,/XMLHttpRequest/,/WebSocket/,/importScripts/,/require\(['"](?:https?|net|child_process|dns)/,/\bMath\.random\b/,/navigator\.sendBeacon/,/\bimport\(/])assert.ok(!forbidden.test(src),'módulo não pode usar '+forbidden);
}
// ---------- CLI local: bloqueia sem autorização; com tudo (sintético) grava candidato sem ativar e sem vazar conteúdo ----------
{
 const {spawnSync}=require('node:child_process'),os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ml9-'));
 const w=(n,v)=>{const f=path.join(dir,n);fs.writeFileSync(f,JSON.stringify(v));return f;};
 const cli=(...a)=>spawnSync(process.execPath,[path.join(root,'scripts','allocation-auditor-ml.cjs'),...a],{encoding:'utf8'});
 const evFile=w('ev.json',events.slice(0,400));
 const blocked=cli('--events',evFile,'--out',path.join(dir,'o1'));assert.equal(blocked.status,2,'sem autorização: código 2');
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'o1','TRAINING_STATUS.json'),'utf8')).status,'BLOQUEADO');assert.ok(!fs.existsSync(path.join(dir,'o1','model.json')),'nenhum modelo gravado');
 const all=events,invAll=M.inventory(all,{authorization:AUTH});
 const ok=cli('--events',w('ev2.json',all),'--authorization',w('auth.json',AUTH),'--reviews',w('rev.json',reviewAll(invAll.eligible)),'--out',path.join(dir,'o2'),'--created-by','Treinador Sintético');
 assert.equal(ok.status,0,ok.stderr);const summary=JSON.parse(ok.stdout);assert.equal(summary.status,'CONCLUIDO');assert.match(summary.activation,/NÃO ativado/);assert.ok(summary.pendingActivationChecks.includes('SEM-APROVACAO-HUMANA'));
 for(const f of ['TRAINING_STATUS.json','model-card.json','evaluation.json','model.json'])assert.ok(fs.existsSync(path.join(dir,'o2',f)),f);
 const status=fs.readFileSync(path.join(dir,'o2','TRAINING_STATUS.json'),'utf8');assert.ok(!/TITULO INCOMPLETO|CABO FLEXIVEL|C1O_RNEST/.test(status+ok.stdout),'o resumo não traz conteúdo de documentos');
 fs.rmSync(dir,{recursive:true,force:true});
}
console.log('allocation_auditor_ml_stage9: authorization gate, inventory, human-reviewed labels, leak-free split, lightweight models, per-category metrics, model card, registry (activate/disable/rollback), controlled learning ledger and suggestion-only integration passed (synthetic data only)');
