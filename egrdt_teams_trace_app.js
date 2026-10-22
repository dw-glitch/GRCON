(function(root){
 'use strict';
 const Core=root.GrconTeamsTraceCore;
 let scope='',token='',attempts=new Map(),byRecord=new Map(),cursor={},request=null,timer=null,generation=0;
 let lastSuccessfulSync=null,failures=0,retryAfter=0,disabledUntil=0,traceDisabled=false;
 const cloud=()=>root.GrconCloud?.state;
 function latest(record){return Core.attemptsFor(record,byRecord,scope)[0]||null;}
 function list(record){return Core.attemptsFor(record,byRecord,scope);}
 function snapshot(){return [...attempts.values()];}
 async function refresh(){
  const state=cloud(),w=state?.membership?.workspace_id;
  if(!w||!state.session?.access_token)return [];
  if(scope!==w){scope=w;attempts=new Map();byRecord=new Map();cursor={};request=null;generation++;lastSuccessfulSync=null;failures=0;retryAfter=0;disabledUntil=0;traceDisabled=false;}
  token=state.session.access_token;
  if(request)return request;
  if(traceDisabled && Date.now()<disabledUntil)return [];
  if(Date.now()<retryAfter)throw Error('Rastreabilidade temporariamente indisponível.');
  const epoch=generation;
  const task=(async()=>{
   const next=new Map(attempts);let checkpoint={...cursor},changed=false;
   while(true){
    const params=new URLSearchParams({workspace:w,...checkpoint});
    const response=await fetch('/api/egrdt-teams/page?'+params,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
    const result=await response.json();if(!response.ok||!result.ok)throw Error(result.message||'Rastreabilidade indisponível.');
    if(epoch!==generation||w!==cloud()?.membership?.workspace_id)return [];
    if(result.enabled===false){traceDisabled=true;disabledUntil=Date.now()+300000;attempts=new Map();byRecord=new Map();cursor={};lastSuccessfulSync=null;return [];}
    traceDisabled=false;disabledUntil=0;
    const rows=result.data||[];
    for(const a of rows){if(JSON.stringify(next.get(a.id))!==JSON.stringify(a))changed=true;next.set(a.id,a);}
    if(rows.length){const last=rows[rows.length-1];checkpoint={afterTime:last.updated_at,afterId:last.id};}
    if(rows.length<500)break;
   }
   if(epoch!==generation||w!==cloud()?.membership?.workspace_id)return [];
   failures=0;retryAfter=0;lastSuccessfulSync=new Date().toISOString();
   attempts=next;cursor=checkpoint.afterTime?{afterTime:new Date(Date.parse(checkpoint.afterTime)-300000).toISOString(),afterId:'00000000-0000-0000-0000-000000000000'}:{};byRecord=Core.index(snapshot());
   if(changed){root.dispatchEvent(new CustomEvent('grcon:teams-trace-updated'));root.dispatchEvent(new CustomEvent('grcon:egrdt-teams-state'));}
   return snapshot();
  })().catch(error=>{
   if(epoch===generation){failures++;retryAfter=Date.now()+Math.min(60000*Math.pow(2,Math.min(failures-1,4)),900000);}
   throw error;
  });
  request=task;try{return await task;}finally{if(request===task)request=null;}
 }
 async function forExport(){
  try{return await refresh();}catch(error){
   // Do not quietly export stale confirmations as current facts.
   throw Error('Não foi possível atualizar a rastreabilidade do Teams para o relatório. '+error.message);
  }
 }
 async function forReport(){
  const state=cloud(),w=state?.membership?.workspace_id;
  if(!w||!state?.session?.access_token)return {attempts:[],status:'unavailable',lastSuccessfulSync:null,errorCode:'SESSION_UNAVAILABLE'};
  try{
   await refresh();
   if(scope!==w||cloud()?.membership?.workspace_id!==w||!cloud()?.session?.access_token)return {attempts:[],status:'unavailable',lastSuccessfulSync:null,errorCode:'WORKSPACE_CHANGED'};
   if(traceDisabled)return {attempts:[],status:'disabled',lastSuccessfulSync:null,errorCode:'TRACE_DISABLED'};
   return {attempts:snapshot(),status:'fresh',lastSuccessfulSync,errorCode:null};
  }catch(error){
   // Never label absent/unreachable Teams evidence as "not sent" or "not posted".
   if(scope!==w||cloud()?.membership?.workspace_id!==w||!cloud()?.session?.access_token)return {attempts:[],status:'unavailable',lastSuccessfulSync:null,errorCode:'WORKSPACE_CHANGED'};
   return {attempts:snapshot(),status:lastSuccessfulSync?'stale':'unavailable',lastSuccessfulSync,errorCode:'TRACE_UNAVAILABLE'};
  }
 }
 function start(){
  if(timer)root.clearInterval(timer);
  if(cloud()?.membership?.workspace_id){void refresh().catch(()=>{});timer=root.setInterval(()=>{if(!document.hidden&&navigator.onLine)void refresh().catch(()=>{});},15000);}
 }
 function clear(){generation++;scope='';token='';attempts=new Map();byRecord=new Map();cursor={};request=null;lastSuccessfulSync=null;failures=0;retryAfter=0;disabledUntil=0;traceDisabled=false;if(timer)root.clearInterval(timer);timer=null;root.dispatchEvent(new CustomEvent('grcon:teams-trace-updated'));}
 async function openHistory(id){
  await root.GRCONModuleLoader?.ensureModule?.('history');
  const record=(root.GrconHistory?.read?.()||[]).find(r=>r.id===id||r.cloudId===id||r.clientRecordId===id);
  if(record)root.GrconHistoryUi?.select?.(record.id);
 }
 function sigemEvidence(records){
  const index=root.GrconPostingConference?.readHistoryIndex?.();
  const result={};
  if(!index)return result;
  for(const record of records||[]){
   if(record.workspaceId&&record.workspaceId!==scope)continue;
   const summary=index.byId?.[record.clientRecordId||record.id] || index.byId?.[record.id];
   if(summary)result[record.id]=`${summary.confirmed} de ${summary.total} documentos/revisões confirmados na conferência SIGEM · Base: ${index.baseUpdatedAt||'não informada'}`;
  }
  return result;
 }
 async function consultationRows(rows){
  const trace=await forReport();
  const index=new Map();
  for(const record of root.GrconHistory?.read?.()||[]){for(const file of record.files||[]){
   const doc=String(file.document||'').trim().toUpperCase();
   const id=record.egrdtNumber+'|'+doc+'|'+String(file.grdtRevision||file.revision||'0').toUpperCase();
   index.set(id,{record,file});
  }}
  return rows.map(row=>{
   const doc=String(row.ldDocument||row.document||'').trim().toUpperCase();
   const id=row.issuedEgrdt+'|'+doc+'|'+String(row.issuedRevision||'0').toUpperCase();
   const found=index.get(id),a=found?latest(found.record):null;
   return {...row,...(found?Core.columns(a,found.file,row.sigemStatus,trace):{})};
  });
 }
 root.GrconTeamsTrace=Object.freeze({latest,list,snapshot,refresh,forExport,forReport,openHistory,consultationRows,sigemEvidence});
 root.addEventListener('grcon:cloud-ready',start);root.addEventListener('grcon:contract-context-changed',()=>{clear();start();});root.addEventListener('grcon:cloud-signed-out',clear);
 root.addEventListener('grcon:notifications-updated',()=>void refresh().catch(()=>{}));
 root.addEventListener('online',()=>void refresh().catch(()=>{}));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh().catch(()=>{});});
 start();
})(globalThis);
