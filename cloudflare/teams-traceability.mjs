// Shared runtime for Cloudflare and the compatible Node API. All secrets stay server-side.
const PREFIX = '/api/egrdt-teams/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (data, status = 200) => Response.json(data, {status, headers:{'cache-control':'no-store'}});
const error = (message, status = 400) => Object.assign(new Error(message), {status});
export const enabled = env => env.GRCON_TEAMS_TRACEABILITY_ENABLED === 'true';
function config(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw error('Persistência do Teams indisponível.',503);
  return {url:env.SUPABASE_URL.replace(/\/$/,''), key:env.SUPABASE_SECRET_KEY};
}
export async function traceRpc(env, workspace, actor, operation, input) {
  const {url,key} = config(env);
  const headers = {'content-type':'application/json',apikey:key};
  if (!key.startsWith('sb_secret_')) headers.authorization = `Bearer ${key}`;
  const response = await fetch(`${url}/rest/v1/rpc/grcon_teams_operation`, {method:'POST', headers,
    body:JSON.stringify({target_workspace:workspace,actor_id:actor,operation,input}),signal:AbortSignal.timeout(10000)});
  const result = await response.json().catch(()=>({}));
  if (!response.ok) throw error(result.message || 'Falha na rastreabilidade do Teams.',response.status>=500?503:result.code === '42501'?403:400);
  return result;
}
async function actor(request,env) {
  const token = request.headers.get('authorization');
  if (!/^Bearer\s+\S+$/i.test(token || '')) throw error('Sessão obrigatória.',401);
  const {url,key} = config(env);
  const response = await fetch(`${url}/auth/v1/user`,{headers:{apikey:key,authorization:token},signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw error('Sessão inválida.',401);
  const user = await response.json();
  if (!user.id) throw error('Sessão inválida.',401);
  return user.id;
}
async function body(request) {
  if (Number(request.headers.get('content-length'))>128000) throw error('Corpo excede o limite.',413);
  const reader=request.body?.getReader();
  if (!reader) throw error('JSON obrigatório.');
  let size=0; const chunks=[];
  while(true) {const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>128000){await reader.cancel();throw error('Corpo excede o limite.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw error('JSON inválido.');}
}
function workspace(value){if(!UUID.test(value || ''))throw error('Contrato inválido.');return value;}
async function trustedFlow(request, env) {
  const secret=env.GRCON_TEAMS_CALLBACK_SECRET;
  if (!secret || secret.length<32 || !UUID.test(env.GRCON_MICROSOFT_TENANT_ID || '')) throw error('Retorno do Teams não configurado.',503);
  const supplied=(request.headers.get('authorization') || '').replace(/^Bearer\s+/i,'');
  const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  const [a,b]=await Promise.all([digest(secret),digest(supplied)]);let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];
  if(difference)throw error('Origem não autorizada.',401);
}
export function interactiveCard(payload, attempt) {
  const card=structuredClone(payload.message.adaptiveCard);
  const data={attemptId:attempt.id,workspaceId:attempt.workspace_id};
  let documentIndex=0;
  card.body=card.body.map(block=>{
    if(block.type!=='Container')return block;
    const d=attempt.documents[documentIndex++];
    return {type:'TextBlock',text:block.items.map(item=>item.text).join(' · ')+(d?.purpose?' · '+d.purpose:''),wrap:true,spacing:'Small'};
  });
  card.body.push({type:'TextBlock',text:`Contrato: ${attempt.contract_code} · Válido até ${new Date(attempt.expires_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}. A confirmação declara a execução; a Consulta Geral comprova o registro no SIGEM.`,wrap:true,isSubtle:true,size:'Small'});
  card.actions=[
    {type:'Action.Submit',title:'✅ Postado',data:{...data,type:'total'}},
    {type:'Action.ShowCard',title:'Postagem parcial',card:{type:'AdaptiveCard',version:'1.2',body:[
      {type:'TextBlock',text:'Selecione somente os documentos postados. Os demais permanecerão pendentes.',wrap:true},
      {type:'Input.ChoiceSet',id:'selection',isMultiSelect:true,style:'expanded',choices:attempt.documents.map((d,i)=>({title:`${d.document} · Rev. ${d.revision}`,value:String(i)}))}
    ],actions:[{type:'Action.Submit',title:'Confirmar postagem parcial',data:{...data,type:'partial'}}]}}
  ];
  if(new TextEncoder().encode(JSON.stringify(card)).byteLength>26000)throw error('Cartão excede o limite do Teams. Reduza os documentos por eGRDT antes de enviar.',413);
  return card;
}
export async function prepareTrace(payload, env) {
  if (!UUID.test(payload.attemptId || '')) throw error('Identificador da tentativa obrigatório.');
  const result=await traceRpc(env,payload.source.workspaceId,payload.requester.id,'start',{
    attemptId:payload.attemptId,historyRecordId:payload.source.historyRecordId,clientRecordId:payload.source.clientRecordId
  });
  const a=result.attempt;
  // Canonical history replaces untrusted browser-supplied documents/number.
  payload.egrdt.number=a.egrdt_number;payload.egrdt.items=a.documents;payload.egrdt.documentCount=a.documents.length;
  payload.traceability={attemptId:a.id,workspaceId:a.workspace_id,contractId:a.contract_id,contractCode:a.contract_code,expiresAt:a.expires_at};
  return result;
}
export async function handleTraceRoute(request,env) {
  const url=new URL(request.url);
  if(!url.pathname.startsWith(PREFIX))return null;
  try {
    const route=url.pathname.slice(PREFIX.length);
    if(route==='callback' && request.method==='POST') {
      await trustedFlow(request,env);
      const data=await body(request);workspace(data.workspaceId);
      if(!UUID.test(data.attemptId || '') || !['confirm','delivered','expired','claim_notice','notice_sent','notice_uncertain','card_updated'].includes(data.event))throw error('Evento inválido.');
      const input={...data};
      if(data.event==='confirm') {
        // Responder must be mapped from authenticated Teams connector output,
        // never from Action.Submit.data. Tenant is checked at the trust boundary.
        if(data.responder?.tenantId?.toLowerCase()!==env.GRCON_MICROSOFT_TENANT_ID.toLowerCase() || !UUID.test(data.responder?.objectId || '') || !data.responder?.displayName)throw error('Identidade Microsoft inválida.',403);
        if(data.type==='partial') {
          const indices=String(data.selection ?? '').split(',').filter(Boolean);
          if(!indices.length || new Set(indices).size!==indices.length || indices.some(i=>!/^\d+$/.test(i)))throw error('Seleção parcial inválida.');
          input.selectedIndices=indices;
        }
      }
      if(data.messageUrl && (!data.messageUrl.startsWith('https://teams.microsoft.com/') && !data.messageUrl.startsWith('https://teams.cloud.microsoft/')))throw error('Link do Teams inválido.');
      const result=await traceRpc(env,data.workspaceId,null,data.event,input);
      const a=result.attempt;
      if (!a) return json({ok:true,...result});
      const card={type:'AdaptiveCard',version:'1.2',body:[{type:'TextBlock',text:`${a.egrdt_number} · ${a.contract_code}`,weight:'Bolder',wrap:true},{type:'TextBlock',text:a.confirmed_at ? `✅ Postagem ${a.confirmation_type==='partial'?'parcial':'total'} declarada por ${a.confirmed_by_name} em ${new Date(a.confirmed_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}. ${a.confirmed_documents.length} de ${a.documents.length} documentos confirmados. Acompanhar conferência no SIGEM.` : 'Solicitação enviada. Aguardar confirmação.',wrap:true},
        {type:'TextBlock',text:'Revisões enviadas na GRDT',weight:'Bolder',wrap:true},
        ...a.documents.map(d=>({type:'TextBlock',text:[`${d.document} · Rev. ${d.revision}`,d.discipline || 'Não informada',d.purpose].filter(Boolean).join(' · '),wrap:true,spacing:'Small'})),
        {type:'TextBlock',text:'Enviado pelo GRCON',isSubtle:true,size:'Small',wrap:true}
      ]};
      return json({ok:true,...result,updatedCard:card,confirmationText:a.confirmed_at ? `✅ POSTAGEM CONFIRMADA — GRCON\neGRDT: ${a.egrdt_number}\nContrato: ${a.contract_code}\nDocumentos: ${a.confirmed_documents.length}/${a.documents.length}\nConfirmado por: ${a.confirmed_by_name}\nData/hora: ${new Date(a.confirmed_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}\nOrigem: Microsoft Teams\nPostagem declarada pelo funcionário. Acompanhar conferência no SIGEM.` : null});
    }
    if(['page','detail'].includes(route) && request.method==='GET') {
      const user=await actor(request,env),w=workspace(url.searchParams.get('workspace'));
      const input=route==='page'?{afterTime:url.searchParams.get('afterTime'),afterId:url.searchParams.get('afterId')}:{attemptId:url.searchParams.get('attemptId')};
      return json({ok:true,enabled:enabled(env),data:await traceRpc(env,w,user,route,input)});
    }
    return json({ok:false,message:'Método ou rota inválidos.'},405);
  }catch(e){console.error('GRCON Teams trace',e.status || 500);return json({ok:false,message:e.status && e.status<500?e.message:'Rastreabilidade indisponível.'},e.status || 500);}
}
