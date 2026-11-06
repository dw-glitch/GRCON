(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.GrconAllocationAuditorMl=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // Infraestrutura de aprendizado do Robô Auditor (Etapas 9 e 10, RA-12). 100% local: nenhum dado sai deste módulo, não há chamada de rede
 // nem serviço pago. Não treina nada sozinho: exige acervo AUTORIZADO por um responsável e rótulos REVISADOS por humanos. Sem isso, o
 // treinamento fica BLOQUEADO. O modelo só produz SUGESTÃO (severidade "suggestion"); as regras determinísticas são independentes dele.
 const VERSION='1.0.0';
 const text=v=>v==null?'':String(v).trim();
 const norm=v=>text(v).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ');
 // Categorias = taxonomia do motor (menos "não classificado", que nunca é rótulo de treino).
 const CATEGORIES=Object.freeze(['title','code','tag','databook','hierarchy','workflow','scope','history']);
 const THRESHOLDS=Object.freeze({minLabeled:300,minTest:60,minTrainPositives:10,minTestSupport:20,minPrecision:0.6,minMacroF1Gain:0.05,testFraction:0.2,validationFraction:0.15});
 // Só estes campos do estado documental ANTERIOR à fiscalização alimentam o modelo. O comentário/decisão fiscal nunca é característica (vazamento).
 const STATE_FIELDS=Object.freeze(['document','title','discipline','workflow','databook','tag','eap','levels','docKind','ldVersion','ld']);
 const FORBIDDEN_FEATURE_FIELDS=Object.freeze(['fiscalComment','fiscalDecision','status','commentFindings','returnedAt']);

 // ---------- utilidades determinísticas ----------
 function fnv(str){let h=0x811c9dc5;const s=String(str);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h.toString(16).padStart(8,'0');}
 const stable=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(key=>[key,x[key]])):x);
 function toTime(v){
  if(v instanceof Date)return Number.isNaN(v.getTime())?NaN:v.getTime();
  if(typeof v==='number'&&v>30000&&v<80000)return Math.round((v-25569)*86400000);
  const t=text(v);if(!t)return NaN;
  let m=t.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return Date.UTC(+m[1],+m[2]-1,+m[3]);
  m=t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(m)return Date.UTC(+m[3],+m[2]-1,+m[1]);
  return NaN;
 }
 const iso=t=>Number.isFinite(t)?new Date(t).toISOString().slice(0,10):'';
 const eventId=e=>fnv([e.contract,e.sourceVersion||e.sourceHash||e.sourceFile,e.sourceSheet,e.sourceRow,e.document,e.revision].map(text).join('|'));
 const groupOf=e=>text(e.contract)+'|'+norm(e.document);

 // Quem decide, revisa ou aprova precisa ser uma pessoa: nomes de robô, modelo, regra ou sistema são recusados (comparação sem acento, por palavra).
 const ROBOT=/\b(ROBO|ROBOT|BOT|AUTOMATICO|AUTOMATICA|MODELO|CLAUDE|SISTEMA|REGRA)\b/;
 const isRobot=v=>ROBOT.test(norm(v));
 // ---------- autorização ----------
 // Um humano responsável precisa autorizar o uso local dos dados. O robô nunca autoriza a si mesmo.
 function checkAuthorization(auth,now=Date.now()){
  const issues=[];
  if(!auth||typeof auth!=='object')return {valid:false,issues:['SEM-AUTORIZACAO']};
  if(!text(auth.id))issues.push('AUTORIZACAO-SEM-IDENTIFICADOR');
  if(!text(auth.grantedBy)||isRobot(auth.grantedBy))issues.push('AUTORIZACAO-SEM-RESPONSAVEL-HUMANO');
  if(!Number.isFinite(toTime(auth.grantedAt)))issues.push('AUTORIZACAO-SEM-DATA');
  if(!Array.isArray(auth.contracts)||!auth.contracts.length)issues.push('AUTORIZACAO-SEM-CONTRATOS');
  if(!Array.isArray(auth.scope)||!auth.scope.includes('treino-local'))issues.push('AUTORIZACAO-SEM-ESCOPO-TREINO-LOCAL');
  if(auth.expiresAt&&Number.isFinite(toTime(auth.expiresAt))&&toTime(auth.expiresAt)<now)issues.push('AUTORIZACAO-EXPIRADA');
  return {valid:!issues.length,issues};
 }

 // ---------- 1–4: inventário, vínculo e estado prévio ----------
 function inventory(events,{authorization,now}={}){
  const auth=checkAuthorization(authorization,now);
  const list=Array.isArray(events)?events:[];
  const out={version:VERSION,total:list.length,authorized:auth.valid,authorizationIssues:auth.issues,eligible:[],inconclusive:[],excluded:[],byReason:{},byContract:{},dateRange:{min:'',max:''},blocked:false,blockers:[]};
  const bump=(code)=>{out.byReason[code]=(out.byReason[code]||0)+1;};
  if(!auth.valid){out.blocked=true;out.blockers=auth.issues.slice();for(const e of list){out.excluded.push({id:eventId(e),reasons:['SEM-AUTORIZACAO']});}out.byReason['SEM-AUTORIZACAO']=list.length;return out;}
  const allowed=new Set(authorization.contracts.map(text));
  const seen=new Map(),rounds=new Map();let min=Infinity,max=-Infinity;
  for(const e of list){const t=toTime(e.returnedAt);if(Number.isFinite(t)){min=Math.min(min,t);max=Math.max(max,t);}}
  out.dateRange={min:iso(min),max:iso(max)};
  // possível conflito: mesma rodada (doc+rev+alocação+data) com decisões diferentes
  for(const e of list){const k=[groupOf(e),text(e.revision),text(e.allocation),text(e.returnedAt)].join('|');(rounds.get(k)||rounds.set(k,new Set()).get(k)).add(text(e.fiscalDecision)+'|'+norm(e.fiscalComment));}
  for(const e of list){
   const id=eventId(e),reasons=[],inconclusive=[];
   out.byContract[text(e.contract)||'(sem contrato)']=(out.byContract[text(e.contract)||'(sem contrato)']||0)+1;
   if(!allowed.has(text(e.contract)))reasons.push('CONTRATO-NAO-AUTORIZADO');
   if(!text(e.document))reasons.push('SEM-DOCUMENTO');
   if(!text(e.revision))reasons.push('SEM-REVISAO');
   if(!text(e.allocation))reasons.push('SEM-ALOCACAO');
   const t=toTime(e.returnedAt);if(!Number.isFinite(t))reasons.push('DATA-INVALIDA');
   const decision=text(e.fiscalDecision);
   if(!['recusado','aceito-com-ressalvas','aceito-sem-comentarios'].includes(decision))reasons.push('SEM-DECISAO-COMPROVADA');
   // estado documental existente ANTES da fiscalização: título e a LD/versão usadas no envio
   if(!text(e.title)||!(text(e.ldVersion)||text(e.ld)))reasons.push('SEM-ESTADO-PREVIO');
   if(decision!=='aceito-sem-comentarios'&&decision&&!text(e.fiscalComment))reasons.push('SEM-COMENTARIO');
   const kinds=(Array.isArray(e.commentFindings)?e.commentFindings:[]).map(f=>f.category);
   if(decision&&decision!=='aceito-sem-comentarios'&&text(e.fiscalComment)&&kinds.length&&kinds.every(k=>!CATEGORIES.includes(k)))inconclusive.push('COMENTARIO-NAO-CLASSIFICADO');
   const round=rounds.get([groupOf(e),text(e.revision),text(e.allocation),text(e.returnedAt)].join('|'));
   if(round&&round.size>1)inconclusive.push('RODADA-CONFLITANTE');
   const dup=[groupOf(e),text(e.revision),text(e.allocation),norm(e.fiscalComment),decision].join('|');
   if(!reasons.length&&seen.has(dup))reasons.push('DUPLICADO');else if(!reasons.length)seen.set(dup,id);
   if(reasons.length){out.excluded.push({id,reasons});reasons.forEach(bump);}
   else if(inconclusive.length){out.inconclusive.push({id,reasons:inconclusive,event:e});inconclusive.forEach(bump);}
   else out.eligible.push({id,event:e});
  }
  return out;
 }

 // ---------- 5: rótulos (regra = palpite; só revisão humana vira rótulo) ----------
 function weakLabel(event){
  const cats=[...new Set((Array.isArray(event.commentFindings)?event.commentFindings:[]).map(f=>f.category).filter(c=>CATEGORIES.includes(c)))].sort();
  return {id:eventId(event),categories:text(event.fiscalDecision)==='aceito-sem-comentarios'?[]:cats,source:'regra',reviewed:false};
 }
 function admitLabels(candidates,reviews){
  const byId=new Map((reviews||[]).map(r=>[r.eventId,r]));
  const examples=[],rejected=[];let pendingReview=0;
  for(const c of candidates||[]){
   const id=c.id,ev=c.event,r=byId.get(id);
   if(!r){pendingReview++;continue;}
   const reasons=[];
   if(!text(r.reviewer)||isRobot(r.reviewer))reasons.push('REVISOR-NAO-HUMANO');
   if(!Number.isFinite(toTime(r.reviewedAt)))reasons.push('REVISAO-SEM-DATA');
   if(!['confirmado','corrigido'].includes(r.decision))reasons.push(r.decision==='rejeitado'?'ROTULO-REJEITADO':'ROTULO-INCONCLUSIVO');
   const cats=r.decision==='corrigido'?r.categories:weakLabel(ev).categories;
   if(!Array.isArray(cats)||cats.some(x=>!CATEGORIES.includes(x)))reasons.push('CATEGORIA-INVALIDA');
   if(reasons.length){rejected.push({id,reasons});continue;}
   examples.push({id,group:groupOf(ev),docKey:text(ev.contract)+'|'+norm(ev.document),time:toTime(ev.returnedAt),x:features(ev),y:[...new Set(cats)].sort(),contract:text(ev.contract),revision:text(ev.revision),reviewer:text(r.reviewer),commentHash:fnv(norm(ev.fiscalComment)),ref:{allocation:text(ev.allocation),returnedAt:iso(toTime(ev.returnedAt)),comment:text(ev.fiscalComment).slice(0,300)}});
  }
  return {examples,rejected,pendingReview};
 }

 // ---------- características: somente o estado documental anterior à fiscalização ----------
 const tokens=v=>norm(v).replace(/[^A-Z0-9]+/g,' ').split(' ').filter(t=>t.length>1&&t.length<=24);
 function features(e){
  const f=new Set();
  for(const t of tokens(e.title))f.add('title:'+t);
  const bucket=n=>n<20?'curto':n<50?'medio':n<100?'longo':'muito-longo';f.add('titlelen:'+bucket(text(e.title).length));
  const groups=text(e.document).split('_');
  if(groups.length>=6){f.add('disc:'+norm(groups[4]));f.add('g6:'+norm(groups[5]));if(groups[6])f.add('g7:'+(/^nt-/i.test(groups[6])?'nt':'tag'));}
  if(text(e.discipline))f.add('disc:'+norm(e.discipline));
  if(text(e.docKind))f.add('kind:'+text(e.docKind));
  for(const t of tokens(e.workflow))f.add('wf:'+t);
  for(const t of tokens(e.databook))f.add('db:'+t);
  f.add('tag:'+(text(e.tag)?'sim':'nao'));f.add('eap:'+(text(e.eap)?'sim':'nao'));
  const levels=Array.isArray(e.levels)?e.levels.filter(x=>text(x)).length:0;f.add('niveis:'+levels);
  if(text(e.ldVersion))f.add('ldv:'+norm(e.ldVersion));
  return [...f].sort();
 }

 // ---------- 6: divisão sem vazamento documental nem temporal ----------
 function split(examples,{testFraction=THRESHOLDS.testFraction,validationFraction=THRESHOLDS.validationFraction}={}){
  const groups=new Map();
  for(const ex of examples){const g=groups.get(ex.group)||{key:ex.group,min:Infinity,max:-Infinity,items:[]};g.min=Math.min(g.min,ex.time);g.max=Math.max(g.max,ex.time);g.items.push(ex);groups.set(ex.group,g);}
  const ordered=[...groups.values()].sort((a,b)=>a.min-b.min||(a.key<b.key?-1:1));
  const total=examples.length,trainTarget=Math.round(total*(1-testFraction-validationFraction)),valTarget=Math.round(total*(1-testFraction));
  // fronteiras por data: todo o treino é estritamente anterior à validação, que é estritamente anterior ao teste
  const sortedTimes=examples.map(e=>e.time).sort((a,b)=>a-b);
  const b1=sortedTimes[Math.max(0,Math.min(total-1,trainTarget))],b2=sortedTimes[Math.max(0,Math.min(total-1,valTarget))];
  const parts={train:[],validation:[],test:[]},dropped=[];
  for(const g of ordered){
   if(g.max<b1)parts.train.push(...g.items);
   else if(g.min>=b1&&g.max<b2)parts.validation.push(...g.items);
   else if(g.min>=b2)parts.test.push(...g.items);
   else dropped.push({group:g.key,examples:g.items.length,reason:'grupo atravessa uma fronteira temporal'});
  }
  const result={...parts,boundaries:{trainBefore:iso(b1),validationBefore:iso(b2)},dropped,counts:{train:parts.train.length,validation:parts.validation.length,test:parts.test.length,dropped:dropped.reduce((n,d)=>n+d.examples,0)}};
  result.leakage=assertNoLeakage(result);return result;
 }
 function assertNoLeakage(s){
  const violations=[];const docs={train:new Set(),validation:new Set(),test:new Set()},hashes={train:new Set(),validation:new Set(),test:new Set()};
  for(const part of ['train','validation','test'])for(const ex of s[part]||[]){docs[part].add(ex.docKey||ex.group);hashes[part].add(ex.commentHash+'|'+ex.group);}
  const pairs=[['train','validation'],['train','test'],['validation','test']];
  for(const [a,b] of pairs){for(const g of docs[a])if(docs[b].has(g))violations.push({type:'documento',between:a+'×'+b,group:g});}
  const range=p=>{const t=(s[p]||[]).map(e=>e.time);return t.length?[Math.min(...t),Math.max(...t)]:null;};
  const [tr,va,te]=[range('train'),range('validation'),range('test')];
  if(tr&&va&&!(tr[1]<va[0]))violations.push({type:'temporal',between:'train×validation'});
  if(va&&te&&!(va[1]<te[0]))violations.push({type:'temporal',between:'validation×test'});
  if(tr&&te&&!(tr[1]<te[0]))violations.push({type:'temporal',between:'train×test'});
  return {ok:!violations.length,violations};
 }

 // ---------- 7: classificadores leves ----------
 // Naive Bayes de Bernoulli, um classificador por categoria (multirrótulo). Característica ausente também conta; tokens vistos em menos de
 // 2 exemplos de treino são ignorados (ruído, como números únicos de título).
 function trainClassifier(train,{categories=CATEGORIES,alpha=1,minDf=2}={}){
  const df={};for(const ex of train)for(const t of ex.x)df[t]=(df[t]||0)+1;
  const vocab=Object.keys(df).filter(t=>df[t]>=minDf).sort();
  const model={type:'bernoulli-nb-ovr',alpha,minDf,categories:[],vocabSize:vocab.length,thresholds:{},stats:{}};
  for(const c of categories){
   const pos=train.filter(e=>e.y.includes(c)),neg=train.filter(e=>!e.y.includes(c));
   if(pos.length<THRESHOLDS.minTrainPositives||!neg.length){model.stats[c]={positives:pos.length,negatives:neg.length,enabled:false,reason:'SUPORTE-INSUFICIENTE'};continue;}
   const count=list=>{const m={};for(const ex of list)for(const t of ex.x)if(df[t]>=minDf)m[t]=(m[t]||0)+1;return m;};
   const cp=count(pos),cn=count(neg);let base=Math.log(pos.length/neg.length);const delta={};
   for(const t of vocab){
    const pp=((cp[t]||0)+alpha)/(pos.length+2*alpha),pn=((cn[t]||0)+alpha)/(neg.length+2*alpha);
    const absent=Math.log((1-pp)/(1-pn));base+=absent;delta[t]=Math.log(pp/pn)-absent;
   }
   model.categories.push(c);model.thresholds[c]=0.5;
   model.stats[c]={positives:pos.length,negatives:neg.length,enabled:true,base,delta};
  }
  return model;
 }
 const sigmoid=z=>1/(1+Math.exp(-z));
 function scoreOf(model,x,c){const s=model.stats[c];if(!s||!s.enabled)return 0;let z=s.base;for(const t of x)if(s.delta[t]!==undefined)z+=s.delta[t];return sigmoid(z);}
 function predict(model,x){return model.categories.map(c=>({category:c,score:scoreOf(model,x,c)})).filter(p=>p.score>=model.thresholds[p.category]).sort((a,b)=>b.score-a.score||(a.category<b.category?-1:1));}
 // O limiar de cada categoria é escolhido SOMENTE na validação (o teste nunca participa).
 function tuneThresholds(model,validation){
  for(const c of model.categories){
   let best={t:0.5,f1:-1};
   for(const t of [0.3,0.4,0.5,0.6,0.7,0.8,0.9]){
    let tp=0,fp=0,fn=0;for(const ex of validation){const p=scoreOf(model,ex.x,c)>=t,y=ex.y.includes(c);if(p&&y)tp++;else if(p)fp++;else if(y)fn++;}
    const f1=tp?2*tp/(2*tp+fp+fn):0;if(f1>best.f1||(f1===best.f1&&t>best.t))best={t,f1};
   }
   model.thresholds[c]=best.t;model.stats[c].validationF1=best.f1;
  }
  return model;
 }
 // Recuperação de precedentes: documentos parecidos do passado e o que a fiscalização apontou. Nunca é veredito.
 function buildRetriever(train){
  const df={};for(const ex of train)for(const t of ex.x)df[t]=(df[t]||0)+1;
  const N=Math.max(1,train.length),idf=t=>Math.log((N+1)/((df[t]||0)+1))+1;
  const docs=train.map(ex=>{const w={};let n2=0;for(const t of ex.x){w[t]=idf(t);n2+=w[t]*w[t];}return {id:ex.id,y:ex.y,w,norm:Math.sqrt(n2)||1,ref:ex.ref};});
  return {type:'tfidf-cosine',idf:Object.fromEntries(Object.keys(df).sort().map(t=>[t,idf(t)])),docs};
 }
 function queryRetriever(index,x,{k=3,minSimilarity=0.35}={}){
  const q={};let n2=0;for(const t of x)if(index.idf[t]!==undefined){q[t]=index.idf[t];n2+=q[t]*q[t];}
  const qn=Math.sqrt(n2);if(!qn)return [];
  return index.docs.map(d=>{let dot=0;for(const t in q)if(d.w[t])dot+=q[t]*d.w[t];return {id:d.id,similarity:dot/(qn*d.norm),categories:d.y,ref:d.ref};})
   .filter(r=>r.similarity>=minSimilarity&&r.categories.length).sort((a,b)=>b.similarity-a.similarity||(a.id<b.id?-1:1)).slice(0,k);
 }

 // ---------- 8: avaliação (falsos positivos/negativos por categoria) ----------
 function evaluate(test,predictFn,{categories=CATEGORIES,baselines={}}={}){
  const per={};for(const c of categories)per[c]={tp:0,fp:0,fn:0,tn:0};
  const base={};for(const name of Object.keys(baselines))base[name]=Object.fromEntries(categories.map(c=>[c,{tp:0,fp:0,fn:0,tn:0}]));
  let exact=0;
  for(const ex of test){
   const pred=new Set(predictFn(ex));if(pred.size===ex.y.length&&ex.y.every(c=>pred.has(c)))exact++;
   for(const c of categories){const y=ex.y.includes(c),p=pred.has(c);per[c][y?(p?'tp':'fn'):(p?'fp':'tn')]++;}
   for(const name of Object.keys(baselines)){const bp=new Set(baselines[name](ex));for(const c of categories){const y=ex.y.includes(c),p=bp.has(c);base[name][c][y?(p?'tp':'fn'):(p?'fp':'tn')]++;}}
  }
  const finish=(m)=>{
   const out={};let sumF1=0,counted=0,TP=0,FP=0,FN=0;
   for(const c of categories){const {tp,fp,fn,tn}=m[c],support=tp+fn;const precision=tp+fp?tp/(tp+fp):0,recall=support?tp/support:0,f1=precision+recall?2*precision*recall/(precision+recall):0;
    out[c]={tp,fp,fn,tn,support,precision,recall,f1,falsePositiveRate:fp+tn?fp/(fp+tn):0,falseNegativeRate:support?fn/support:0,sufficient:support>=THRESHOLDS.minTestSupport};
    if(support){sumF1+=f1;counted++;}TP+=tp;FP+=fp;FN+=fn;}
   const microP=TP+FP?TP/(TP+FP):0,microR=TP+FN?TP/(TP+FN):0;
   return {perCategory:out,macroF1:counted?sumF1/counted:0,microF1:microP+microR?2*microP*microR/(microP+microR):0};
  };
  const main=finish(per),baselineResults=Object.fromEntries(Object.keys(base).map(n=>[n,finish(base[n])]));
  return {...main,examples:test.length,exactMatch:test.length?exact/test.length:0,baselines:baselineResults};
 }
 // Precedentes: em quantos casos de teste ao menos um dos k precedentes recuperados compartilha uma categoria real (vs. acaso).
 function evaluateRetriever(index,test,{k=3,minSimilarity=0.35}={}){
  let answered=0,hit=0;const prevalence={};let labeled=0;
  for(const ex of test)if(ex.y.length){labeled++;for(const c of ex.y)prevalence[c]=(prevalence[c]||0)+1;}
  for(const ex of test){if(!ex.y.length)continue;const r=queryRetriever(index,ex.x,{k,minSimilarity});if(!r.length)continue;answered++;if(r.some(p=>p.categories.some(c=>ex.y.includes(c))))hit++;}
  return {k,minSimilarity,labeledCases:labeled,answered,coverage:labeled?answered/labeled:0,hitRate:answered?hit/answered:0};
 }

 // ---------- 9: versão, origem e limitações ----------
 const LIMITATIONS=Object.freeze([
  'O modelo aprende associações do passado; não conhece a norma e não prova defeito em nenhum documento.',
  'Só produz sugestão (severidade "suggestion"); nunca cria erro, pendência, proposta, TAG, revisão, EAP ou valor.',
  'Vale apenas para os contratos autorizados e para o período de treino; fora disso o desempenho é desconhecido.',
  'Categorias com pouco suporte de teste ficam desabilitadas; métricas de categorias raras são instáveis.',
  'Comentários fiscais históricos são precedentes, não regras; a fiscalização pode mudar de critério.'
 ]);
 function modelCard({model,retriever,split:sp,evaluation,retrieval,authorization,inventory:inv,createdBy,createdAt,examples}){
  const datasetHash=fnv(stable((examples||[]).map(e=>[e.id,e.y]).sort()));
  const trainedAt=createdAt||new Date().toISOString();
  const version='ml-'+trainedAt.slice(0,10).replace(/-/g,'')+'-'+fnv(datasetHash+stable(model.thresholds)+VERSION).slice(0,6);
  const enabled=model.categories.filter(c=>evaluation.perCategory[c]&&evaluation.perCategory[c].sufficient&&evaluation.perCategory[c].precision>=THRESHOLDS.minPrecision);
  return {version,type:model.type,engineMl:VERSION,createdAt:trainedAt,createdBy:text(createdBy),status:'candidato',
   origin:{authorizationId:text(authorization&&authorization.id),authorizedBy:text(authorization&&authorization.grantedBy),contracts:(authorization&&authorization.contracts)||[],datasetHash,
    inventory:{total:inv.total,eligible:inv.eligible.length,inconclusive:inv.inconclusive.length,excluded:inv.excluded.length,byReason:inv.byReason,dateRange:inv.dateRange},
    labeled:(examples||[]).length,reviewers:[...new Set((examples||[]).map(e=>e.reviewer))].sort(),split:{counts:sp.counts,boundaries:sp.boundaries,leakage:sp.leakage.ok}},
   hyperparameters:{alpha:model.alpha,thresholds:model.thresholds},evaluation:{macroF1:evaluation.macroF1,microF1:evaluation.microF1,exactMatch:evaluation.exactMatch,examples:evaluation.examples,perCategory:evaluation.perCategory,baselines:Object.fromEntries(Object.entries(evaluation.baselines).map(([n,b])=>[n,{macroF1:b.macroF1,microF1:b.microF1}])),
    independent:sp.leakage.ok&&sp.counts.test>=THRESHOLDS.minTest,thresholdsTunedOn:'validation',testUsedForTuning:false},
   retrieval:retrieval||null,enabledCategories:enabled,limitations:LIMITATIONS.slice(),activation:{eligible:false,reasons:[]}};
 }

 // ---------- pipeline completo (bloqueia na ausência de autorização ou de rótulos revisados) ----------
 function run({events,authorization,reviews,baselines={},createdBy,createdAt,now}={}){
  const inv=inventory(events,{authorization,now});
  const result={status:'BLOQUEADO',blockers:[],inventory:{...inv,eligible:inv.eligible.length,inconclusive:inv.inconclusive.length,excluded:inv.excluded.length},candidates:0};
  if(inv.blocked){result.blockers=inv.blockers;return result;}
  const candidates=inv.eligible;result.candidates=candidates.length;
  const labeled=admitLabels(candidates,reviews);
  result.labels={reviewed:labeled.examples.length,rejected:labeled.rejected,pendingReview:labeled.pendingReview};
  if(labeled.examples.length<THRESHOLDS.minLabeled){result.blockers=['ROTULOS-INSUFICIENTES: '+labeled.examples.length+' revisados (mínimo '+THRESHOLDS.minLabeled+')'];return result;}
  const sp=split(labeled.examples);result.split={counts:sp.counts,boundaries:sp.boundaries,leakage:sp.leakage};
  if(!sp.leakage.ok){result.blockers=['VAZAMENTO-NA-DIVISAO'];return result;}
  if(sp.counts.test<THRESHOLDS.minTest){result.blockers=['TESTE-INSUFICIENTE: '+sp.counts.test+' (mínimo '+THRESHOLDS.minTest+')'];return result;}
  const model=tuneThresholds(trainClassifier(sp.train),sp.validation),retriever=buildRetriever(sp.train);
  // Pontos de partida que o modelo precisa superar: não prever nada, repetir a categoria mais comum e o vizinho mais próximo (precedente).
  const prevalence=Object.fromEntries(CATEGORIES.map(c=>[c,sp.train.filter(e=>e.y.includes(c)).length/Math.max(1,sp.train.length)]));
  const evaluation=evaluate(sp.test,ex=>predict(model,ex.x).map(p=>p.category),{baselines:{'nenhuma-categoria':()=>[],'categoria-mais-comum':()=>CATEGORIES.filter(c=>prevalence[c]>=0.5),'vizinho-mais-proximo':ex=>{const r=queryRetriever(retriever,ex.x,{k:1,minSimilarity:0});return r.length?r[0].categories:[];},...baselines}});
  const retrieval=evaluateRetriever(retriever,sp.test);
  const card=modelCard({model,retriever,split:sp,evaluation,retrieval,authorization,inventory:inv,createdBy,createdAt,examples:labeled.examples});
  return {...result,status:'CONCLUIDO',blockers:[],model,retriever,evaluation,retrieval,card};
 }

 // ---------- 10: ativação, desligamento e retorno (registro de versões) ----------
 // Só ativa modelo AVALIADO, de forma independente, melhor que o ponto de partida e aprovado por um humano diferente de quem treinou.
 function activationCheck(card,{approvedBy}={}){
  const reasons=[];
  if(!card||!card.evaluation)reasons.push('SEM-AVALIACAO');
  else{
   if(!card.evaluation.independent)reasons.push('AVALIACAO-NAO-INDEPENDENTE');
   if(card.evaluation.testUsedForTuning)reasons.push('TESTE-USADO-NA-CALIBRACAO');
   const baseMacro=Math.max(0,...Object.values(card.evaluation.baselines||{}).map(b=>b.macroF1||0));
   if(!(card.evaluation.macroF1>=baseMacro+THRESHOLDS.minMacroF1Gain))reasons.push('NAO-SUPERA-O-PONTO-DE-PARTIDA');
   if(!(card.enabledCategories&&card.enabledCategories.length))reasons.push('NENHUMA-CATEGORIA-COM-SUPORTE-E-PRECISAO');
  }
  if(!text(approvedBy)||isRobot(approvedBy))reasons.push('SEM-APROVACAO-HUMANA');
  else if(card&&text(card.createdBy)&&norm(approvedBy)===norm(card.createdBy))reasons.push('APROVADOR-IGUAL-AO-TREINADOR');
  return {ok:!reasons.length,reasons};
 }
 function createRegistry(initial){
  const state=initial?JSON.parse(JSON.stringify(initial)):{versions:[],active:null,previous:null,history:[]};
  const log=(action,version,actor,reason='')=>state.history.push({at:new Date().toISOString(),action,version:version||null,actor:text(actor),reason});
  const find=v=>state.versions.find(x=>x.card.version===v);
  return {
   register(card,payload,actor){if(find(card.version))throw Error('Versão já registrada: versões são imutáveis.');state.versions.push({card:{...card,status:'candidato'},payload:payload||null});log('registrar',card.version,actor);return card.version;},
   activate(version,{approvedBy}={}){const v=find(version);if(!v)throw Error('Versão desconhecida.');const check=activationCheck(v.card,{approvedBy});if(!check.ok){log('ativacao-recusada',version,approvedBy,check.reasons.join(','));return {activated:false,reasons:check.reasons};}
    if(state.active)state.previous=state.active;state.active=version;v.card.status='ativo';v.card.activation={eligible:true,approvedBy:text(approvedBy),at:new Date().toISOString()};log('ativar',version,approvedBy);return {activated:true,reasons:[]};},
   deactivate(actor,reason=''){if(!state.active)return false;const was=state.active;const v=find(was);if(v)v.card.status='desligado';state.previous=was;state.active=null;log('desligar',was,actor,reason);return true;},
   rollback(actor){if(!state.previous)return {rolledBack:false,reason:'SEM-VERSAO-ANTERIOR'};const target=state.previous;const cur=state.active;if(cur){const c=find(cur);if(c)c.card.status='revertido';}state.active=target;state.previous=cur||null;const t=find(target);if(t)t.card.status='ativo';log('reverter',target,actor);return {rolledBack:true,version:target};},
   active(){const v=state.active&&find(state.active);return v||null;},
   list(){return state.versions.map(v=>({...v.card}));},history(){return state.history.slice();},toJSON(){return JSON.parse(JSON.stringify(state));}
  };
 }

 // ---------- 10: ciclo de melhoria controlado ----------
 // Exemplo novo só entra se: decisão HUMANA, correção comprovada e reauditoria que comprova a resolução; contrato autorizado.
 // Palpite do robô nunca vira exemplo; caso pendente fica em pool separado e nunca treina.
 function admitLearningExample(candidate,{authorization,now}={}){
  const reasons=[];const auth=checkAuthorization(authorization,now);
  if(!auth.valid)reasons.push('SEM-AUTORIZACAO');
  else if(!authorization.contracts.map(text).includes(text(candidate&&candidate.contract)))reasons.push('CONTRATO-NAO-AUTORIZADO');
  const d=candidate&&candidate.humanDecision;
  if(!d||!text(d.actor)||isRobot(d.actor))reasons.push('SEM-DECISAO-HUMANA');
  if(!candidate||candidate.source==='robo'||candidate.source==='modelo'||candidate.source==='regra')reasons.push('ORIGEM-NAO-HUMANA');
  const pending=!candidate||candidate.lifecycleState!=='resolvida-comprovada';
  if(pending)reasons.push('SEM-RESOLUCAO-COMPROVADA');
  if(!candidate||!candidate.reauditProof)reasons.push('SEM-REAUDITORIA');
  if(!d||!Array.isArray(d.evidence)||!d.evidence.some(x=>text(x)))reasons.push('SEM-EVIDENCIA');
  return {admitted:!reasons.length,pool:reasons.length?(reasons.every(r=>['SEM-RESOLUCAO-COMPROVADA','SEM-REAUDITORIA'].includes(r))?'pendente':'recusado'):'resolvido',reasons};
 }
 function createLedger(initial){
  const state=initial?JSON.parse(JSON.stringify(initial)):{resolved:[],pending:[],refused:[]};
  return {
   submit(candidate,opts){const r=admitLearningExample(candidate,opts),entry={id:text(candidate&&candidate.id)||fnv(stable(candidate)),at:new Date().toISOString(),contract:text(candidate&&candidate.contract),reasons:r.reasons};
    (r.pool==='resolvido'?state.resolved:r.pool==='pendente'?state.pending:state.refused).push(r.pool==='resolvido'?{...entry,candidate}:entry);return r;},
   counts(){return {resolved:state.resolved.length,pending:state.pending.length,refused:state.refused.length};},
   resolved(contract){return state.resolved.filter(e=>!contract||e.contract===contract).map(e=>e.candidate);},
   readyForUpdate(minNew=THRESHOLDS.minLabeled/10){return state.resolved.length>=minNew;},
   toJSON(){return JSON.parse(JSON.stringify(state));}
  };
 }

 // ---------- 9/10: integração como SUGESTÃO ----------
 // Devolve achados de severidade "suggestion"; nunca erro, pendência ou valor. Retorna [] se o modelo estiver desligado, sem categoria
 // habilitada ou fora dos contratos autorizados. As regras determinísticas não dependem desta função.
 function suggest(active,row,{enabled=true,topK=3}={}){
  if(!enabled||!active||!active.payload||!active.card)return [];
  const {card,payload}=active;if(card.status!=='ativo')return [];
  if(!(card.origin.contracts||[]).map(text).includes(text(row&&row.contract)))return [];
  const x=features(row),model=payload.model,out=[];
  for(const p of predict(model,x)){
   if(!card.enabledCategories.includes(p.category))continue;
   const precedents=queryRetriever(payload.retriever,x,{k:topK}).filter(r=>r.categories.includes(p.category));
   out.push({id:'ML-'+p.category.toUpperCase(),category:'history',field:fieldOfCategory(p.category),severity:'suggestion',origin:'modelo',
    message:'Padrão aprendido (modelo '+card.version+'; sugestão não normativa): documentos parecidos já foram apontados pela fiscalização em "'+p.category+'". Confira este item antes do envio.',
    source:'Modelo local '+card.version+' · não é norma',evidence:[{modelVersion:card.version,score:Math.round(p.score*100)/100,precedents:precedents.map(r=>({similarity:Math.round(r.similarity*100)/100,allocation:r.ref.allocation,date:r.ref.returnedAt,comment:r.ref.comment})),limitations:card.limitations}],
    ruleVersion:VERSION,humanReview:true,modelSuggestion:true});
  }
  return out;
 }
 const FIELD={title:'title',code:'document',tag:'tag',databook:'databook',hierarchy:'levels',workflow:'workflow',scope:'discipline',history:'allocation'};
 const fieldOfCategory=c=>FIELD[c]||'allocation';

 return Object.freeze({VERSION,CATEGORIES,THRESHOLDS,STATE_FIELDS,FORBIDDEN_FEATURE_FIELDS,LIMITATIONS,checkAuthorization,inventory,weakLabel,admitLabels,features,split,assertNoLeakage,trainClassifier,tuneThresholds,predict,buildRetriever,queryRetriever,evaluate,evaluateRetriever,modelCard,run,activationCheck,createRegistry,admitLearningExample,createLedger,suggest,eventId,toTime,fnv});
});
