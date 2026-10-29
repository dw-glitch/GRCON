import { _internal as Teams } from './worker.mjs';
import { enabled, prepareTrace, interactiveCard, traceRpc } from './teams-traceability.mjs';
const PREFIX='/api/background-jobs/';
const MAX_INPUT=24*1024*1024;
const terminal=new Set(['succeeded','failed','needs_review','cancelled']);
const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const fail=(code,status=400)=>Object.assign(new Error(code),{code,status});
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value||'');
export async function operations(env,operation,input={},actorId=null,workspace=null){
 const key=env.SUPABASE_SECRET_KEY,url=env.SUPABASE_URL?.replace(/\/$/,'');
 if(!key||!url)throw fail('OPERATIONS_NOT_CONFIGURED',503);
 const headers={apikey:key,'content-type':'application/json'};
 if(!key.startsWith('sb_secret_'))headers.authorization=`Bearer ${key}`;
 const response=await fetch(`${url}/rest/v1/rpc/grcon_operations_service`,{method:'POST',headers,body:JSON.stringify({operation,actor_id:actorId,target_workspace:workspace,input}),signal:AbortSignal.timeout(45000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw fail(data.code==='42501'?'ACCESS_DENIED':data.code==='40001'?'BASE_CHANGED':data.code==='22023'?'INVALID_JOB':'OPERATIONS_UNAVAILABLE',data.code==='42501'?403:response.status>=500?503:409);
 return data;
}
async function user(request,env){
 const bearer=request.headers.get('authorization');if(!/^Bearer \S+$/i.test(bearer||''))throw fail('AUTH_REQUIRED',401);
 const response=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:env.SUPABASE_SECRET_KEY,authorization:bearer},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw fail('AUTH_INVALID',401);const result=await response.json();if(!uuid(result.id))throw fail('AUTH_INVALID',401);return result;
}
async function body(request){
 if(Number(request.headers.get('content-length'))>MAX_INPUT)throw fail('INPUT_TOO_LARGE',413);
 const reader=request.body?.getReader();if(!reader)throw fail('INPUT_REQUIRED');
 let size=0;const chunks=[];while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_INPUT){await reader.cancel();throw fail('INPUT_TOO_LARGE',413);}chunks.push(part.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw fail('INVALID_JSON');}
}
const publicJob=j=>({id:j.id,kind:j.kind,title:j.title,status:j.status,progress:j.progress,stage:j.stage,attempts:j.attempts,error_code:j.error_code,output_name:j.output_name,created_at:j.created_at,updated_at:j.updated_at,generation:j.generation});
export async function startWorkflow(env,job){
 if(!env.GRCON_TASKS)throw fail('WORKFLOW_NOT_CONFIGURED',503);
 const id=`${job.id}-${job.generation}`;
 try{await env.GRCON_TASKS.create({id,params:{id:job.id,generation:job.generation}});}
 catch(error){
  // Only an actual existing instance proves that a duplicate create is harmless.
  const instance=await env.GRCON_TASKS.get(id);const state=await instance.status();
  if(!state?.status||state.status==='unknown')throw error;
 }
}
async function createJob(env,actorId,workspace,kind,key,title,input){
 const bytes=JSON.stringify(input);const fingerprintSource=kind==='teams_notice'?JSON.stringify({eventId:input.eventId,workspaceId:workspace,historyRecordId:input.source.historyRecordId,clientRecordId:input.source.clientRecordId,egrdt:input.egrdt}):bytes;const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fingerprintSource))),b=>b.toString(16).padStart(2,'0')).join('');
 const created=await operations(env,'create',{kind,key,title,fingerprint},actorId,workspace);
 if(created.fresh){
  await env.GRCON_DOCUMENTS.put(created.job.input_key,bytes,{httpMetadata:{contentType:'application/json'}});
  created.job=await operations(env,'ready',{id:created.job.id},actorId,workspace);
 }
 if(created.job.status==='queued')await startWorkflow(env,created.job).catch(()=>{}); // the scheduled outbox retries startup
 return created.job;
}
async function createStreamJob(request,env,actorId,workspace){
 const kind=request.headers.get('x-grcon-kind'),key=request.headers.get('x-grcon-key'),fingerprint=request.headers.get('x-grcon-fingerprint');
 const length=Number(request.headers.get('content-length'));
 if(!['conference_report'].includes(kind)||!key||key.length>240||!/^[a-f0-9]{64}$/.test(fingerprint||''))throw fail('INVALID_KIND');
 if(!request.body||!Number.isInteger(length)||length<1||length>MAX_INPUT)throw fail('INPUT_TOO_LARGE',413);
 const title=kind==='conference_report'?'Relatório de conferência SIGEM':'Publicação da Consulta Geral';
 const created=await operations(env,'create',{kind,key,title,fingerprint},actorId,workspace);
 if(created.fresh){
  // Stream directly to R2: parsing a large JSON payload would exceed Workers Free CPU limits.
  await env.GRCON_DOCUMENTS.put(created.job.input_key,request.body,{httpMetadata:{contentType:'application/json'}});
  created.job=await operations(env,'ready',{id:created.job.id},actorId,workspace);
 }else await request.body.cancel();
 if(created.job.status==='queued')await startWorkflow(env,created.job).catch(()=>{});
 return created.job;
}
async function enqueueTeams(request,env){
 const token=request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
 if(!token)throw fail('MISSING_SESSION',401);
 const raw=await body(request);
 const payload=Teams.normalizePayload(raw,env);payload.attemptId=raw.attemptId;
 payload.requester=await Teams.verifyUserAndMembership(token,payload.source.workspaceId,env);
 // Keep the legacy schema. Trace mode canonicalizes against shared history when enabled.
 const job=await createJob(env,payload.requester.id,payload.source.workspaceId,'teams_notice',payload.eventId,`Aviso Teams · ${payload.egrdt.number}`,payload);
 return reply({ok:true,queued:true,jobId:job.id,eventId:payload.eventId,receiptOnly:true,status:job.status},202);
}
export async function handleJobsRoute(request,env){
 const url=new URL(request.url);
 const teams=url.pathname==='/api/egrdt-teams-notification'&&request.method==='POST';
 if(!teams&&!url.pathname.startsWith(PREFIX))return null;
 try{
  if(!env.GRCON_TASKS||!env.GRCON_DOCUMENTS)throw fail('WORKFLOW_NOT_CONFIGURED',503);
  if(teams)return await enqueueTeams(request,env);
  const actor=await user(request,env),action=url.pathname.slice(PREFIX.length),workspace=url.searchParams.get('workspace');
  if(action==='technical'&&request.method==='GET'){
   const data=await operations(env,'technical',{},actor.id);
   return reply({ok:true,...data,services:{workflows:true,r2:true,supabase:true,teamsConfigured:Teams.isAllowedFlowUrl(env.POWER_AUTOMATE_EGRDT_WEBHOOK_URL),traceability:enabled(env)}});
  }
  if(action==='list'&&request.method==='GET'){
   if(!uuid(workspace))throw fail('WORKSPACE_REQUIRED');
   const jobs=await operations(env,'list',{},actor.id,workspace);return reply({ok:true,jobs});
  }
  if(action==='submit'&&request.method==='POST'){
   if(!uuid(workspace))throw fail('WORKSPACE_REQUIRED');
   const job=await createStreamJob(request,env,actor.id,workspace);
   return reply({ok:true,job:publicJob(job)},202);
  }
  const id=url.searchParams.get('id');if(!uuid(id))throw fail('JOB_REQUIRED');
  if(action==='retry'&&request.method==='POST'){
   const job=await operations(env,'retry',{id},actor.id);await startWorkflow(env,job).catch(()=>{});return reply({ok:true,job:publicJob(job)},202);
  }
  if(['detail','download'].includes(action)&&request.method==='GET'){
   const job=await operations(env,'get',{id},actor.id);
   if(action==='detail')return reply({ok:true,job:publicJob(job)});
   if(job.status!=='succeeded'||!job.output_key)throw fail('RESULT_NOT_READY',409);
   const file=await env.GRCON_DOCUMENTS.get(job.output_key);if(!file)throw fail('RESULT_NOT_FOUND',404);
   return new Response(file.body,{headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':`attachment; filename="${job.output_name}"`,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  }
  throw fail('NOT_FOUND',404);
 }catch(error){return reply({ok:false,code:error.code||'OPERATIONS_UNAVAILABLE',message:messages[error.code]||'Não foi possível concluir esta operação. Consulte suas tarefas.'},error.status||503);}
}
const messages={ACCESS_DENIED:'Acesso não permitido.',AUTH_REQUIRED:'Entre no GRCON para continuar.',AUTH_INVALID:'Sua sessão expirou.',REPORT_ROW_LIMIT:'Use filtros para limitar o relatório em segundo plano a 10.000 linhas.',INPUT_TOO_LARGE:'O lote excedeu 24 MB. Divida os dados em lotes menores.',BASE_CHANGED:'Uma nova base já foi publicada. Atualize antes de tentar novamente.',WORKFLOW_NOT_CONFIGURED:'O processamento em segundo plano está indisponível.',RESULT_NOT_READY:'O resultado ainda está sendo preparado.'};
export async function recoverJobs(env){
 const pending=await operations(env,'recover');
 for(const job of pending){try{if(job.status==='queued')await startWorkflow(env,job);else{const status=await(await env.GRCON_TASKS.get(`${job.id}-${job.generation}`)).status();if(['errored','terminated','unknown'].includes(status.status))await operations(env,'update',{id:job.id,generation:job.generation,status:job.kind==='teams_notice'?'needs_review':'failed',stage:'Execução interrompida: verifique a tarefa',errorCode:'WORKFLOW_INTERRUPTED',progress:0});}}catch{ /* another cron retries inspection */ }}
}
export async function recordMetric(env,path,status,duration){
 const route=path.startsWith('/api/background-jobs/')?'jobs':path.includes('teams')?'teams':path.includes('document-vault')?'vault':'other';
 await operations(env,'metric',{route,status,duration:Math.round(duration),code:`HTTP_${status}`});
}
export async function runJob(env,params,step,buildReport){
 const args={id:params.id,generation:params.generation};
 const update=(status,stage,progress,extra={})=>operations(env,'update',{...args,status,stage,progress,...extra});
 const authorize=()=>operations(env,'execute',args);
 const retries={retries:{limit:4,delay:'15 seconds',backoff:'exponential'},timeout:'5 minutes'};
 let kind=null,deliveryStarted=false;
 try{
  const job=await step.do('authorize',retries,authorize);
  kind=job.kind;
  if(terminal.has(job.status))return {status:job.status};
  await step.do('start',retries,()=>update('running','Preparando tarefa',10,{increment:true}));
  // Large payloads stay in R2, never in the Workflow event or step return value.
  const load=async()=>{const object=await env.GRCON_DOCUMENTS.get(job.input_key);if(!object)throw fail('INPUT_NOT_FOUND');return object.json();};
  if(job.kind==='conference_report'){
   await step.do('report',retries,async()=>{
    await authorize();await update('running','Gerando relatório Excel',35);
    const object=await env.GRCON_DOCUMENTS.get(job.input_key);if(!object)throw fail('INPUT_NOT_FOUND');const response=await buildReport(object,env,job);const bytes=response instanceof Response?response.body:response;
    await authorize();await env.GRCON_DOCUMENTS.put(`operations/${job.workspace_id}/${job.id}/result.xlsx`,bytes,{httpMetadata:{contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
    return {written:true};
   });
   await step.do('complete',retries,()=>update('succeeded','Relatório pronto para baixar',100,{output:true}));
  }else if(job.kind==='sigem_import'){
   await step.do('import-and-publish',retries,async()=>{
    await authorize();const object=await env.GRCON_DOCUMENTS.get(job.input_key);if(!object)throw fail('INPUT_NOT_FOUND');
    const response=await buildReport(object,env,job);
    if(response instanceof Response)await response.arrayBuffer();return true;
   });
   await step.do('complete',retries,()=>update('succeeded','Consulta Geral publicada para a equipe',100));
  }else if(job.kind==='teams_notice'){
   const prepared=await step.do('prepare-teams',retries,async()=>{
    await authorize();const payload=await load();
    if(enabled(env)){
     const trace=await prepareTrace(payload,env);
     if(!trace.shouldSend&&['accepted','delivered'].includes(trace.attempt.delivery_status))return {alreadySent:true};
     if(!trace.shouldSend)throw fail('DELIVERY_UNCERTAIN');
     payload.message.tableHtml=Teams.buildTableHtml(payload.egrdt.number,payload.egrdt.items);
     payload.message.adaptiveCard=interactiveCard({...payload,message:{...payload.message,adaptiveCard:Teams.buildAdaptiveCard(payload,Teams.resolveMascotUrl(env))}},trace.attempt);
    }
    await env.GRCON_DOCUMENTS.put(`operations/${job.workspace_id}/${job.id}/delivery.json`,JSON.stringify(payload));return {alreadySent:false};
   });
   if(!prepared.alreadySent){
    let sent=false;deliveryStarted=true;
    for(let attempt=0;attempt<5;attempt++){
     const result=await step.do(`deliver-${attempt}`,{retries:{limit:0,delay:'1 second',backoff:'constant'},timeout:'1 minute'},async()=>{
      await authorize();
      const flow=env.POWER_AUTOMATE_EGRDT_WEBHOOK_URL;
      if(!Teams.isAllowedFlowUrl(flow))return {retry:true,code:'FLOW_UNAVAILABLE'};
      const payload=await (await env.GRCON_DOCUMENTS.get(`operations/${job.workspace_id}/${job.id}/delivery.json`)).json();
      // Persist an intent before sending. A crash after this point must never blindly resend.
      const intentKey=`operations/${job.workspace_id}/${job.id}/dispatch-${job.generation}-${attempt}.json`;
      if(await env.GRCON_DOCUMENTS.head(intentKey))return {uncertain:true,code:'DELIVERY_UNCERTAIN'};
      await env.GRCON_DOCUMENTS.put(intentKey,JSON.stringify({at:new Date().toISOString(),attempt}));
      try{
       const response=await fetch(flow,{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':payload.attemptId||payload.eventId},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
       if(response.ok)return {sent:true};
       if(response.status===429)return {retry:true,code:'FLOW_RATE_LIMITED'};
       if(response.status>=500)return {uncertain:true,code:'DELIVERY_UNCERTAIN'};
       return {failed:true,code:'FLOW_REJECTED'};
      }catch{return {uncertain:true,code:'DELIVERY_UNCERTAIN'};}
     });
     if(result.sent){sent=true;break;}
     if(result.uncertain){await step.do('uncertain',retries,()=>update('needs_review','Entrega incerta: confira o Teams antes de reenviar',80,{errorCode:result.code}));return result;}
     if(!result.retry||attempt===4)throw fail(result.code);
     await step.do(`wait-${attempt}`,retries,()=>update('retry_wait','Aguardando nova tentativa do Teams',30,{increment:true,errorCode:result.code}));
     await step.sleep(`backoff-${attempt}`,`${Math.min(15,2**attempt)} minutes`);
     await step.do(`resume-${attempt}`,retries,()=>update('running','Tentando enviar ao Teams',50));
    }
    if(!sent)throw fail('FLOW_UNAVAILABLE');
    if(enabled(env))await step.do('record-teams-receipt',retries,async()=>{const payload=await load();await traceRpc(env,job.workspace_id,null,'accepted',{attemptId:payload.attemptId});return true;});
   }
   await step.do('complete',retries,()=>update('succeeded','Aviso recebido pelo fluxo do Teams',100));
  }
  return {status:'succeeded'};
 }catch(error){
  const code=/^[A-Z0-9_]{1,80}$/.test(error.code||'')?error.code:'TASK_FAILED';
  const uncertain=code==='DELIVERY_UNCERTAIN'||(kind==='teams_notice'&&deliveryStarted);
  await step.do('record-failure',{retries:{limit:4,delay:'10 seconds',backoff:'exponential'}},()=>update(uncertain?'needs_review':'failed',code==='ACCESS_DENIED'?'Acesso do solicitante revogado':code==='REPORT_ROW_LIMIT'?'Aplique filtros para limitar o relatório a 10.000 linhas':code==='BASE_CHANGED'?'Outra base foi publicada; atualize antes de tentar novamente':'A tarefa não foi concluída',0,{errorCode:code}));
  return {status:'failed',code};
 }
}
