(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.GrconTeamsTraceCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const text=v=>String(v??'').trim();
 const norm=v=>text(v).toUpperCase();
 const revision=v=>norm(v)||'0';
 const headers=['Enviado ao Teams?','Data/hora do envio ao Teams','Postagem confirmada?','Tipo de confirmação','Confirmado por','Data/hora da confirmação','Origem da confirmação','Quantidade de documentos confirmados','Quantidade de documentos pendentes','Conferência no SIGEM','Link do cartão original no Teams','Documento declarado como postado?'];
 function index(attempts){
  const byRecord=new Map();
  for(const a of attempts||[]){for(const id of new Set([a.history_id,a.client_record_id].filter(Boolean))){const key=a.workspace_id+'|'+id;if(!byRecord.has(key))byRecord.set(key,[]);byRecord.get(key).push(a);}}
  for(const list of byRecord.values())list.sort((a,b)=>Date.parse(b.requested_at)-Date.parse(a.requested_at)||text(b.id).localeCompare(text(a.id)));
  return byRecord;
 }
 function attemptsFor(record,attempts,workspaceId){
  const map=attempts instanceof Map?attempts:index(attempts),w=record?.workspaceId||workspaceId;
  if(!w)return [];
  for(const id of [record?.cloudId,record?.historyRecordId,record?.clientRecordId,record?.id,record?.historyId].filter(Boolean)){const list=map.get(w+'|'+id);if(list)return list;}
  return [];
 }
 function label(a){
  if(!a)return 'Sem registro de envio ao Teams';
  if(a.confirmed_at)return `Postagem ${a.confirmation_type==='partial'?'parcial':'total'} declarada por ${a.confirmed_by_name}`;
  return ({requested:'Envio solicitado',accepted:'Recebido pelo fluxo; entrega no Teams não confirmada',delivered:'Enviado ao Teams; postagem não confirmada',failed:'Falha ou envio incerto; conferir o fluxo',expired:'Cartão expirado; postagem não confirmada'})[a.delivery_status]||'Não informado';
 }
 function confirmed(a,file){if(!a?.confirmed_at)return 'Não informado';if(!file)return 'Não se aplica';const doc=norm(file.document),rev=revision(file.grdtRevision||file.revisionSent||file.revision);return (a.confirmed_documents||[]).some(d=>norm(d.document)===doc&&revision(d.revision)===rev)?'Sim':'Não';}
 function values(a,file,sigem){
  const date=value=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'';
  const sigemText=sigem||'Verificar na Consulta Geral';
  const count=a?.confirmed_at?a.confirmed_documents.length:'';
  return [a?.delivered_at?'Sim':a?'Entrega não confirmada':'Sem registro de envio ao Teams',a?.teams_created_at?date(a.teams_created_at):a?.delivered_at?'Não informado pelo Teams':'',a?.confirmed_at?'Sim':a?'Não confirmada':'Não informado',a?.confirmation_type==='total'?'Total':a?.confirmation_type==='partial'?'Parcial':'',a?.confirmed_by_name||'',date(a?.confirmed_at),a?.confirmed_at?'Microsoft Teams':'',count,a?.confirmed_at?a.documents.length-count:'',sigemText,a?.message_url||'',confirmed(a,file)];
 }
 function columns(a,file,sigem){const row=values(a,file,sigem);return Object.fromEntries(headers.map((h,i)=>[h,row[i]]));}
 function conference(row,a){
  const base=row?.conferenceLabel||row?.statusLabel||row?.status||'Verificar na Consulta Geral';
  if(!a?.confirmed_at)return base;
  return confirmed(a,row)==='Sim'&&row.status!=='CONFIRMADO'&&row.status!=='NAO_VERIFICADO'?`Postagem declarada; documento ainda não confirmado no SIGEM (${base})`:base;
 }
 return Object.freeze({headers,index,attemptsFor,label,confirmed,values,columns,conference});
});
