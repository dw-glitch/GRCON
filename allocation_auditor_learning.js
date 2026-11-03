(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.GrconAllocationLearning=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // Fase 8 — aprendizado controlado, catálogo de regras e retomada segura.
 // Módulo puro: nunca ativa regra, nunca grava e nunca altera comentário fiscal.
 const VERSION='1.0.0';
 const text=v=>v==null?'':String(v).trim();
 const LEVELS=Object.freeze({
  observed:{id:'precedente-observado',label:'Precedente observado',automatic:false,note:'Caso histórico específico; não prova defeito em nova alocação.'},
  recurrent:{id:'padrao-recorrente',label:'Padrão recorrente',automatic:false,note:'Mesmo tipo de apontamento em documentos tecnicamente comparáveis; continua sendo sugestão.'},
  confirmed:{id:'criterio-tecnico-confirmado',label:'Critério técnico confirmado',automatic:false,note:'Validado por evidência e fonte autorizada; ainda sem uso automático.'},
  homologated:{id:'regra-operacional-homologada',label:'Regra operacional homologada',automatic:true,note:'Aprovada pelo Proprietário ADM para uso automático no escopo autorizado.'}
 });
 // Nunca promove por recorrência: só evidências externas (fonte autorizada, homologação) elevam o nível.
 function precedentLevel(entry){
  const e=entry||{};
  if(e.ruleState==='active'&&text(e.homologation).length>=10&&e.validation?.passed===true)return LEVELS.homologated;
  if(text(e.authorizedSource)&&text(e.evidence)&&e.confirmedBy)return LEVELS.confirmed;
  if(Number(e.distinctDocuments)>=3)return LEVELS.recurrent;
  return LEVELS.observed;
 }
 // Proposta de ajuste ao catálogo: nasce inativa e exige homologação administrativa.
 function proposeRuleAdjustment(entry,origin={}){
  const level=precedentLevel(entry);
  return {
   state:'proposta',activatesAutomatically:false,requiresAdminApproval:true,
   level:level.id,category:text(entry.category),field:text(entry.field),
   origin:{file:text(origin.file),sheet:text(origin.sheet),row:origin.row??'',allocation:text(origin.allocation),document:text(origin.document),comment:text(origin.comment)},
   comparedCases:Number(entry.distinctDocuments)||0,
   note:level.id===LEVELS.homologated.id?'Já homologada.':'Encaminhar ao Proprietário ADM com casos positivos e negativos; comentários fiscais e saídas de IA não ativam regras.'
  };
 }
 // Normaliza uma versão de regra do servidor para os campos do catálogo.
 function catalogEntry(rule){
  const p=rule?.payload||{},v=rule?.validation||{};
  return {
   id:rule?.id,name:text(p.instruction).slice(0,80)||('Correção de '+text(p.field)+' em '+text(p.document)),category:'correção determinística de '+text(p.field),
   source:text(p.source)||'Linha exata da LD de origem',revision:text(p.revision),contract:text(p.contract||rule?.contract_id),
   activation:{document:p.document,discipline:p.discipline,field:p.field,before:p.before,after:p.after,sourceHash:p.sourceHash,ldHash:p.ldHash},
   evidence:p.evidence||[],severity:'proposta de correção',verification:'comparação exata com a LD e bases versionadas',correctable:true,
   authorizationPolicy:'somente regra ativa, homologada pelo Proprietário ADM, em escopo exato',
   version:rule?.version,state:rule?.state,approvedBy:rule?.created_by||'',changedAt:rule?.created_at||'',
   homologation:text(v.homologation),validation:{positives:v.positives||0,negatives:v.negatives||0,passed:v.passed===true},
   level:precedentLevel({ruleState:rule?.state,homologation:v.homologation,validation:v}).id
  };
 }
 // Retomada: só reaproveita resultado se contrato, fontes, hashes e versões continuam compatíveis.
 function resumeCheck(saved,current){
  const reasons=[],reattach=[];
  const s=saved||{},c=current||{};
  if(text(s.contract)!==text(c.contract))reasons.push('Contrato diferente do da análise salva.');
  if(!c.permitted)reasons.push('Perfil sem permissão para continuar esta análise.');
  if(text(s.engine)&&text(c.engine)&&s.engine!==c.engine)reasons.push('O motor foi atualizado ('+s.engine+' → '+c.engine+'); resultados anteriores seriam obsoletos.');
  for(const src of s.sources||[]){
   const available=(c.availableSources||{})[src.sha256];
   if(!available){reattach.push(src.name);continue;}
   if(text(available)!==text(src.sha256))reasons.push('Hash divergente em '+src.name+'.');
  }
  const sv=s.versions||{},cv=c.versions||{};
  for(const key of new Set([...Object.keys(sv),...Object.keys(cv)]))if(text(sv[key])!==text(cv[key]))reasons.push('A base "'+key+'" mudou ('+text(sv[key])+' → '+text(cv[key])+').');
  if(text(s.rulesVersion)&&text(c.rulesVersion)&&s.rulesVersion!==c.rulesVersion)reasons.push('O catálogo de regras mudou.');
  const action=reasons.length?'reanalyze':reattach.length?'reattach':'resume';
  return {ok:action==='resume',action,reasons,reattach,
   message:action==='resume'?'Fontes, hashes e versões compatíveis: a análise pode continuar.':action==='reattach'?'Reanexe as fontes originais para continuar: '+reattach.join(', ')+'.':'Reanálise necessária: '+reasons.join(' ')};
 }
 // Mudança de regra invalida automações que dependiam da versão anterior.
 function invalidatedByRuleChange(events,rules){
  const latest=new Map((rules||[]).map(r=>[r.id,r]));
  return (events||[]).filter(e=>e.ruleId&&e.decision==='accepted'&&(()=>{const r=latest.get(e.ruleId);return !r||r.state!=='active'||(e.ruleVersion&&r.version!==e.ruleVersion);})()).map(e=>({lineage:e.lineage,field:e.field,ruleId:e.ruleId,ruleVersion:e.ruleVersion||0,reason:'A regra foi alterada, suspensa ou revogada depois desta autorização.'}));
 }
 return Object.freeze({VERSION,LEVELS,precedentLevel,proposeRuleAdjustment,catalogEntry,resumeCheck,invalidatedByRuleChange});
});
