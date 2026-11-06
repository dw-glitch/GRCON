#!/usr/bin/env node
'use strict';
// Pipeline LOCAL de aprendizado do Robô Auditor (Etapas 9–10). Roda sobre arquivos exportados, sem rede e sem serviço externo.
// Não treina sem (1) autorização humana do acervo e (2) rótulos revisados por humanos; nesse caso grava o status BLOQUEADO e sai com código 2.
// Nunca ativa o modelo: a ativação exige avaliação independente e aprovação humana (registro de versões).
//
//   node scripts/allocation-auditor-ml.cjs --events eventos.json [--authorization autorizacao.json] [--reviews revisoes.json]
//        [--out pasta] [--created-by "Nome de quem treina"]
//
// eventos.json     lista de eventos históricos exportados (documento, revisão, alocação, data de retorno, decisão e comentário fiscal,
//                  estado enviado: título, workflow, Data Book, versão da LD…)
// autorizacao.json {id, grantedBy, grantedAt, contracts:[...], scope:["treino-local"], expiresAt?} — assinada por um RESPONSÁVEL HUMANO
// revisoes.json    [{eventId, reviewer, reviewedAt, decision:"confirmado"|"corrigido"|"rejeitado"|"inconclusivo", categories?}]
const fs=require('node:fs'),path=require('node:path');
const Ml=require(path.resolve(__dirname,'..','allocation_auditor_ml.js'));
const args=Object.fromEntries(process.argv.slice(2).reduce((a,x,i,all)=>x.startsWith('--')?[...a,[x.slice(2),all[i+1]&&!all[i+1].startsWith('--')?all[i+1]:'true']]:a,[]));
const readJson=f=>JSON.parse(fs.readFileSync(path.resolve(f),'utf8'));
if(!args.events){console.error('Informe --events eventos.json (veja o cabeçalho deste arquivo).');process.exit(1);}
const out=path.resolve(args.out||'allocation-auditor-ml-out');fs.mkdirSync(out,{recursive:true});
const events=readJson(args.events),authorization=args.authorization?readJson(args.authorization):null,reviews=args.reviews?readJson(args.reviews):[];
const result=Ml.run({events,authorization,reviews,createdBy:args['created-by']||'',createdAt:new Date().toISOString()});
// Resumo SEM conteúdo de documentos: só contagens, motivos e datas.
const status={engineMl:Ml.VERSION,generatedAt:new Date().toISOString(),status:result.status,blockers:result.blockers,
 inventory:{total:result.inventory.total,authorized:result.inventory.authorized,authorizationIssues:result.inventory.authorizationIssues,eligible:result.inventory.eligible,inconclusive:result.inventory.inconclusive,excluded:result.inventory.excluded,byReason:result.inventory.byReason,byContract:result.inventory.byContract,dateRange:result.inventory.dateRange},
 labels:result.labels?{reviewed:result.labels.reviewed,rejected:result.labels.rejected.length,pendingReview:result.labels.pendingReview}:null,split:result.split||null,
 note:'Treinamento BLOQUEADO sem acervo autorizado e rótulos revisados. Nenhum modelo foi ativado.'};
fs.writeFileSync(path.join(out,'TRAINING_STATUS.json'),JSON.stringify(status,null,2));
if(result.status!=='CONCLUIDO'){console.log(JSON.stringify(status,null,2));process.exit(2);}
fs.writeFileSync(path.join(out,'model-card.json'),JSON.stringify(result.card,null,2));
fs.writeFileSync(path.join(out,'evaluation.json'),JSON.stringify({evaluation:result.evaluation,retrieval:result.retrieval},null,2));
fs.writeFileSync(path.join(out,'model.json'),JSON.stringify({model:result.model,retriever:result.retriever}));
const check=Ml.activationCheck(result.card,{approvedBy:''});
console.log(JSON.stringify({status:'CONCLUIDO',version:result.card.version,macroF1:result.evaluation.macroF1,enabledCategories:result.card.enabledCategories,activation:'NÃO ativado — aguarda aprovação humana',pendingActivationChecks:check.reasons},null,2));
