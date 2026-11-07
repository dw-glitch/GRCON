(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.GrconAllocationAuditorFields=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // Contrato de campos compartilhado entre o motor, o cliente e a API de explicações (Etapa 8, RA-08).
 // A API valida contra ESTA lista; o motor nunca emite um campo fora dela (teste de varredura). Campo desconhecido não derruba a
 // consulta: o cliente o omite e diz que omitiu. O cálculo determinístico nunca depende da IA.
 const ENGINE_FIELDS=['document','title','tag','eap','levels','discipline','databook','workflow','revision','fiscalComment','ld','allocation','plannedDate','action','purpose'];
 const LEVEL_FIELDS=['N1','N2','N3','N4','N5','N6'];
 // Campos que já eram aceitos pela API antes do contrato (mantidos para não quebrar chamadas existentes).
 const LEGACY_FIELDS=['unit','category','installation','activity','service','reportCode','sequence','origin'];
 const FIELDS=Object.freeze([...new Set([...ENGINE_FIELDS,...LEVEL_FIELDS,...LEGACY_FIELDS])]);
 const FIELD_SET=new Set(FIELDS);
 // contextBytes: limite da API para o conjunto de mensagens; promptBytes: reserva conservadora para o prompt de sistema (o teste confere que cobre o real).
 const LIMITS=Object.freeze({document:255,title:2000,question:2000,message:800,value:2000,evidence:2,findings:8,proposals:8,contextBytes:7000,promptBytes:1700});
 const isField=f=>FIELD_SET.has(f);
 const text=v=>v==null?'':typeof v==='string'?v:typeof v==='number'||typeof v==='boolean'?String(v):'';
 const clip=(v,n)=>text(v).slice(0,n);
 // Evidência vai como dado opaco; o cliente garante só o formato aceito (lista de até 2 itens string/objeto simples).
 const evidenceOf=list=>(Array.isArray(list)?list:[]).slice(0,LIMITS.evidence).map(e=>typeof e==='string'?e.slice(0,600):e&&typeof e==='object'?JSON.parse(JSON.stringify(e,(k,v)=>typeof v==='string'?v.slice(0,300):v)):String(e??'').slice(0,600));

 // Monta o corpo da consulta a partir de uma linha auditada. Nunca lança por causa do conteúdo do motor:
 // o que não cabe no contrato é omitido e listado em `omitted`, para a tela dizer isso ao usuário.
 function buildAuditRequest(row,question=''){
  const omitted=[];
  const findings=[];
  for(const f of (row&&row.findings)||[]){
   if(findings.length>=LIMITS.findings){omitted.push({kind:'finding',id:f&&f.id,reason:'limite de '+LIMITS.findings+' achados por consulta'});continue;}
   if(!f||!isField(f.field)){omitted.push({kind:'finding',id:f&&f.id,reason:'campo fora do contrato: '+(f&&f.field)});continue;}
   findings.push({id:'finding:'+findings.length,sourceId:text(f.id),field:f.field,message:clip(f.message,LIMITS.message),evidence:evidenceOf(f.evidence)});
  }
  const proposals=[];
  for(const p of (row&&row.recommendations)||[]){
   if(proposals.length>=LIMITS.proposals){omitted.push({kind:'proposal',reason:'limite de '+LIMITS.proposals+' propostas por consulta'});continue;}
   if(!p||!isField(p.field)){omitted.push({kind:'proposal',reason:'campo fora do contrato: '+(p&&p.field)});continue;}
   proposals.push({id:'proposal:'+proposals.length,field:p.field,before:clip(p.before,LIMITS.value),after:clip(p.after,LIMITS.value),evidence:evidenceOf(p.evidence)});
  }
  const body={document:clip(row&&row.document,LIMITS.document),title:clip(row&&row.title,LIMITS.title),question:clip(question,LIMITS.question),
   findings:findings.map(({sourceId,...f})=>f),proposals:proposals.map(p=>({...p}))};
  const sourceIds=findings.map(f=>f.sourceId);
  // Orçamento de tamanho: a API recusa o conjunto acima de contextBytes. O cliente reduz o que for preciso, na ordem do menos importante, e informa.
  const userBytes=()=>new TextEncoder().encode(JSON.stringify(JSON.stringify(body))).length;
  const budget=LIMITS.contextBytes-LIMITS.promptBytes,note=reason=>{if(!omitted.some(o=>o.kind==='budget'&&o.reason===reason))omitted.push({kind:'budget',reason});};
  if(userBytes()>budget){note('evidências encurtadas para caber no limite da consulta');for(const x of [...body.findings,...body.proposals])x.evidence=evidenceOf(x.evidence).map(e=>typeof e==='string'?e.slice(0,120):'(resumida)');}
  if(userBytes()>budget){note('evidências omitidas para caber no limite da consulta');for(const x of [...body.findings,...body.proposals])x.evidence=[];}
  if(userBytes()>budget){note('mensagens encurtadas para caber no limite da consulta');for(const f of body.findings)f.message=f.message.slice(0,240);for(const p of body.proposals){p.before=p.before.slice(0,240);p.after=p.after.slice(0,240);}}
  while(userBytes()>budget&&body.proposals.length){const d=body.proposals.pop();note('proposta(s) omitida(s) para caber no limite da consulta');void d;}
  while(userBytes()>budget&&body.findings.length>1){body.findings.pop();sourceIds.pop();note('achado(s) omitido(s) para caber no limite da consulta');}
  if(userBytes()>budget){note('título e pergunta encurtados para caber no limite da consulta');body.title=body.title.slice(0,300);body.question=body.question.slice(0,300);body.findings.forEach(f=>{f.message=f.message.slice(0,120);});}
  return {body,omitted,usable:body.findings.length>0&&userBytes()<=budget,sourceIds};
 }
 return Object.freeze({FIELDS,ENGINE_FIELDS,LEVEL_FIELDS,LEGACY_FIELDS,LIMITS,isField,buildAuditRequest});
});
