// Durable orchestration stores only cursors/checksums; corporate rows stay in
// the existing copy/audit Worker and the authorized Turso/R2 destinations.
import {canonical,sha256,ZERO_HASH,fail,initialize,beginSnapshot,copyPage,sealSnapshot,auditPage,tursoClient} from './sigem-turso.mjs';
const ROOT='sigem-migration-jobs/v1/';
const WATCH='sigem-migration-watch/v1/';
const hex=v=>/^[a-f0-9]{64}$/.test(v||'');
const uuid=v=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v||'');
const WIDTH=3,GROUP=8;
// Free Workflows have a per-instance subrequest budget as well as a step limit.
// A lane continues in a fresh instance before exhausting that budget.
export const PAGE_BUDGET=32;
const instanceId=(id,lane,segment=0)=>'sigem-'+id.slice(0,40)+'-'+lane+(segment?'-s'+segment:'');
const retry={retries:{limit:4,delay:'10 seconds',backoff:'exponential'},timeout:'5 minutes'};
function ready(env){
 if(env.GRCON_SIGEM_EXTERNAL_STORAGE_AUTHORIZED!=='true')throw fail('SIGEM_STORAGE_AUTHORIZATION_REQUIRED',403);
 if(env.GRCON_SIGEM_MIGRATION_PREFLIGHT_APPROVED!=='true')throw fail('SIGEM_CAPACITY_CHECK_REQUIRED');
 if(!env.GRCON_DOCUMENTS||!env.GRCON_TASKS||!env.GRCON_MIGRATION_SELF||!env.SUPABASE_SECRET_KEY)throw fail('SIGEM_BACKGROUND_NOT_CONFIGURED',503);
}
async function rpc(env,grant,operation,input={}){
 const key=env.SUPABASE_SECRET_KEY,headers={apikey:key,'content-type':'application/json'};
 if(!key.startsWith('sb_secret_'))headers.authorization='Bearer '+key;
 const response=await fetch(env.SUPABASE_URL+'/rest/v1/rpc/grcon_sigem_storage_service',{method:'POST',headers,
  body:JSON.stringify({target_workspace:grant.workspace,actor_id:grant.actor,operation,input}),signal:AbortSignal.timeout(30000)});
 const result=await response.json().catch(()=>null);
 if(!response.ok)throw fail(result?.code==='42501'?'SIGEM_ACCESS_DENIED':'SIGEM_SOURCE_REJECTED',result?.code==='42501'?403:409);
 return result;
}
const path=(workspace,id)=>ROOT+workspace+'/'+id;
async function readGrant(env,workspace,id){
 if(!uuid(workspace)||!hex(id))throw fail('SIGEM_JOB_INVALID',400);
 const value=await env.GRCON_DOCUMENTS.get(path(workspace,id)+'/grant.json');
 if(!value)throw fail('SIGEM_JOB_NOT_FOUND',404);
 const grant=await value.json();
 if(grant.workspace!==workspace||grant.id!==id||!uuid(grant.actor))throw fail('SIGEM_JOB_INVALID');
 return grant;
}
export function planLanes(snapshots){
 const lanes=Array.from({length:WIDTH},()=>({steps:2,snapshots:[]}));
 for(const source of [...snapshots].sort((a,b)=>b.record_count-a.record_count)){
  if(!uuid(source.id)||!Number.isSafeInteger(source.record_count)||source.record_count<1||source.record_count>100000)throw fail('SIGEM_JOB_LIMIT');
  const lane=lanes.reduce((a,b)=>a.steps<=b.steps?a:b);
  const pages=Math.ceil(source.record_count/250);
  lane.steps+=4*Math.ceil(pages/GROUP)+3+3*Math.ceil((2*pages+1)/PAGE_BUDGET);lane.snapshots.push(source);
 }
 if(lanes.some(l=>l.steps>1000)||lanes.reduce((n,l)=>n+l.steps,0)>2700)throw fail('SIGEM_JOB_STEP_LIMIT');
 return lanes.filter(l=>l.snapshots.length);
}
// Keep each launch under the conservative Free Workflow step budget. A growing
// SIGEM history is processed in successive durable waves, never by increasing
// paid limits or skipping the integrity audit.
export function planWave(snapshots){
 const selected=[],deferred=[];
 for(const source of [...snapshots].sort((a,b)=>b.record_count-a.record_count)){
  try{planLanes([...selected,source]);selected.push(source);}
  catch(error){if(error?.code!=='SIGEM_JOB_STEP_LIMIT')throw error;deferred.push(source.id);}
 }
 if(snapshots.length&&!selected.length)throw fail('SIGEM_JOB_STEP_LIMIT');
 return {lanes:planLanes(selected),deferred};
}
export async function startMigration(env,workspace,actor,inventory){
 ready(env);
 if(!uuid(workspace)||!uuid(actor)||!Array.isArray(inventory.snapshots)||!inventory.snapshots.length||inventory.pendingSnapshots!==0)throw fail('SIGEM_INVENTORY_NOT_READY');
 const inventoryHash=await sha256(canonical(inventory));
 // Master authorization and the live source are rechecked before any job is
 // created, resumed or advanced to a new wave.
 if(await sha256(canonical(await rpc(env,{workspace,actor},'inventory')))!==inventoryHash)throw fail('SIGEM_SOURCE_CHANGED');
 const latestObject=await env.GRCON_DOCUMENTS.get(ROOT+workspace+'/latest.json');
 const previous=latestObject?await readGrant(env,workspace,(await latestObject.json()).id):null;
 const sameInventory=previous?.inventoryHash===inventoryHash&&previous.actor===actor;
 let grant,id;
 if(sameInventory){
  const states=await Promise.all(previous.lanes.map(async(_,lane)=>{
   const saved=await env.GRCON_DOCUMENTS.get(path(workspace,previous.id)+'/lane-'+lane+'.json');
   return saved?(await saved.json()).status:null;
  }));
  // Restart an unfinished wave; a new click must not create parallel copies.
  if(states.some(state=>state!=='complete')){grant=previous;id=previous.id;}
 }
 if(!grant){
  // Verify all reusable receipts against the current Turso rows and R2
  // manifest. Never trust the previous progress counters alone.
  const completed=await reusableAudits(env,workspace,inventory);
  const remaining=inventory.snapshots.filter(s=>!completed.some(c=>c.id===s.id));
  if(!remaining.length&&sameInventory){grant=previous;id=previous.id;}
  else{
   const {lanes,deferred}=planWave(remaining);
   const wave=sameInventory?(Number.isSafeInteger(previous.wave)?previous.wave+1:1):0;
   id=await sha256(canonical({workspace,actor,inventoryHash,runner:4,wave}));
   grant={format:'grcon-sigem-migration-job-v2',id,workspace,actor,inventoryHash,wave,
    records:inventory.snapshots.reduce((n,s)=>n+s.record_count,0),completed,deferred,
    createdAt:new Date().toISOString(),lanes};
   const key=path(workspace,id),existing=await env.GRCON_DOCUMENTS.get(key+'/grant.json');
   if(existing){
    const stored=await existing.json();
    if(stored.inventoryHash!==inventoryHash||stored.actor!==actor||stored.wave!==wave)throw fail('SIGEM_JOB_CONFLICT');
    grant=stored;
   }else await env.GRCON_DOCUMENTS.put(key+'/grant.json',canonical(grant));
  }
 }
 if(await sha256(canonical(await rpc(env,grant,'inventory')))!==inventoryHash)throw fail('SIGEM_SOURCE_CHANGED');
 const key=path(workspace,id);
 for(let lane=0;lane<grant.lanes.length;lane++){
  const last=await env.GRCON_DOCUMENTS.get(key+'/lane-'+lane+'.json');
  const report=last?await last.json():null,segment=Number.isSafeInteger(report?.segment)?report.segment:0;
  if(report?.status==='complete')continue;
  const currentId=instanceId(id,lane,segment);
  try{await env.GRCON_TASKS.create({id:currentId,params:{kind:'sigem-migration',workspace,id,lane,segment}});}
  catch{
   const instance=await env.GRCON_TASKS.get(currentId),status=await instance.status();
   if(['errored','terminated'].includes(status.status))await instance.restart();
   else if(!['running','queued','waiting','paused','complete'].includes(status.status))throw fail('SIGEM_WORKFLOW_UNAVAILABLE',503);
  }
 }
 await env.GRCON_DOCUMENTS.put(ROOT+workspace+'/latest.json',canonical({id}));
 await env.GRCON_DOCUMENTS.put(WATCH+workspace+'.json',canonical({workspace,id}));
 return {id,wave:grant.wave||0,lanes:grant.lanes.length,deferredSnapshots:grant.deferred?.length||0,
  records:inventory.snapshots.reduce((n,s)=>n+s.record_count,0)};
}
async function reusableAudits(env,workspace,inventory){
 const latest=await env.GRCON_DOCUMENTS.get(ROOT+workspace+'/latest.json');
 if(!latest)return [];
 const {id}=await latest.json(),prior=await readGrant(env,workspace,id),proofs=[...(prior.completed||[])];
 for(let lane=0;lane<prior.lanes.length;lane++){
  const saved=await env.GRCON_DOCUMENTS.get(path(workspace,id)+'/lane-'+lane+'.json');
  if(saved)proofs.push(...((await saved.json()).snapshots||[]));
 }
 if(!proofs.some(p=>p.fullAudit===true&&inventory.snapshots.some(s=>s.id===p.id)))return [];
 const result=[],seen=new Set(),contract=inventory.snapshots[0].contract_id;
 if(!uuid(contract)||inventory.snapshots.some(s=>s.workspace_id!==workspace||s.contract_id!==contract))throw fail('SIGEM_INVENTORY_NOT_READY');
 const targets=(await tursoClient(env).execute('SELECT id,state,expected_count,checksum,source_json FROM sigem_snapshots WHERE workspace_id=? AND contract_id=?',[workspace,contract])).rows;
 for(const proof of proofs){
  const source=inventory.snapshots.find(s=>s.id===proof.id);
  if(!source||seen.has(proof.id)||proof.fullAudit!==true||proof.validatedRecords!==source.record_count||proof.count!==source.record_count||!hex(proof.checksum)||!hex(proof.manifestHash))continue;
  const key=`sigem-backups/v1/${source.workspace_id}/${source.contract_id}/${source.id}/manifest-${proof.manifestHash}.json`;
  if(proof.manifestKey!==key)continue;
  const object=await env.GRCON_DOCUMENTS.get(key);if(!object)continue;
  const body=await object.text();if(await sha256(body)!==proof.manifestHash)continue;
  const manifest=JSON.parse(body),savedSource=manifest.source;
  // Published rows are immutable. Only the legitimate active -> archived
  // lifecycle transition can reuse an audit; dates/metadata changes cannot.
  if(manifest.recordCount!==source.record_count||manifest.checksum!==proof.checksum||!savedSource||
   !(savedSource.status===source.status||(savedSource.status==='active'&&source.status==='archived'))||
   canonical({...savedSource,status:source.status})!==canonical(source))continue;
  const target=targets.find(t=>t.id===source.id);
  if(target?.state!=='verified'||target.expected_count!==source.record_count||target.checksum!==proof.checksum)continue;
  const destinationSource=JSON.parse(target.source_json);
  if(!(destinationSource.status===source.status||(destinationSource.status==='active'&&source.status==='archived'))||canonical({...destinationSource,status:source.status})!==canonical(source))continue;
  seen.add(proof.id);result.push({...proof,reusedAudit:true});
 }
 return result;
}
// Creating a child from inside a Workflow can inherit the subrequest chain.
// Cron consumes the durable outbox in a fresh invocation after the parent exits.
export async function recoverMigrations(env){
 ready(env);if(!env.GRCON_DOCUMENTS.list)return;
 const cursorKey='sigem-migration-control/v1/watch-cursor.json';
 const savedCursor=await env.GRCON_DOCUMENTS.get(cursorKey),cursor=savedCursor?(await savedCursor.json()).cursor:null;
 const listing=await env.GRCON_DOCUMENTS.list({prefix:WATCH,limit:5,...(cursor?{cursor}:{})});
 for(const item of listing.objects||[]){
  try{
   const watch=await (await env.GRCON_DOCUMENTS.get(item.key)).json();
   const grant=await readGrant(env,watch.workspace,watch.id);
   if(await sha256(canonical(await rpc(env,grant,'inventory')))!==grant.inventoryHash)continue;
   for(let lane=0;lane<grant.lanes.length;lane++){
    const saved=await env.GRCON_DOCUMENTS.get(path(grant.workspace,grant.id)+'/lane-'+lane+'.json');
    if(!saved)continue;
    const report=await saved.json();if(report.status==='complete')continue;
    const segment=report.segment||0,id=instanceId(grant.id,lane,segment);
    let existing;
    try{existing=await env.GRCON_TASKS.get(id);const state=await existing.status();
     if(!['errored','terminated'].includes(state.status))continue;
    }catch{if(!report.dispatchPending)continue;existing=null;}
    const retryKey=path(grant.workspace,grant.id)+'/recovery-'+lane+'-'+segment+'.json';
    const previous=await env.GRCON_DOCUMENTS.get(retryKey),tries=previous?(await previous.json()).attempts:0;
    if(tries>=3)continue;
    // Separate attempt record must never overwrite a running child's progress.
    await env.GRCON_DOCUMENTS.put(retryKey,canonical({attempts:tries+1,at:new Date().toISOString()}));
    if(existing)await existing.restart();
    else try{await env.GRCON_TASKS.create({id,params:{kind:'sigem-migration',workspace:grant.workspace,id:grant.id,lane,segment}});}catch{/* next cron verifies existence; no child head is rewritten */}
   }
  }catch(error){console.warn('SIGEM_RECOVERY_DEFERRED',migrationError(error));}
 }
 await env.GRCON_DOCUMENTS.put(cursorKey,canonical({cursor:listing.truncated?listing.cursor:null}));
}
export async function migrationStatus(env,workspace,inventory){
 const latest=await env.GRCON_DOCUMENTS.get(ROOT+workspace+'/latest.json');
 if(!latest)return {started:false};
 const {id}=await latest.json(),grant=await readGrant(env,workspace,id);
 const reports=await Promise.all(grant.lanes.map(async(_,lane)=>{
  const object=await env.GRCON_DOCUMENTS.get(path(workspace,id)+'/lane-'+lane+'.json');
  const report=object?await object.json():{lane,status:'queued',copied:0,validated:0,snapshots:[]};
  if(env.GRCON_TASKS?.get){
   try{
    const state=await(await env.GRCON_TASKS.get(instanceId(id,lane,report.segment||0))).status();
    if(['errored','terminated'].includes(state.status))return {...report,status:'failed',error:report.error||'SIGEM_WORKFLOW_INTERRUPTED'};
    if(report.status==='failed'&&['queued','running','waiting'].includes(state.status))return {...report,status:'running',error:undefined};
   }catch{
    if(report.dispatchPending&&report.dispatch==='cron')return {...report,status:'waiting'};
    if(report.dispatchPending)return {...report,status:'failed',error:'SIGEM_DISPATCH_UNCONFIRMED'};
    /* R2 still provides durable progress if a started child's status is unavailable. */
   }
  }
  return report;
 }));
 const stable=await sha256(canonical(inventory))===grant.inventoryHash;
 const reused=(grant.completed||[]).reduce((n,s)=>n+s.validatedRecords,0);
 const receipts=[...(grant.completed||[]),...reports.flatMap(r=>r.snapshots||[])];
 const expected=new Map(inventory.snapshots.map(s=>[s.id,s.record_count])),verified=new Set();
 for(const proof of receipts){
  if(expected.has(proof.id)&&!verified.has(proof.id)&&proof.fullAudit===true&&proof.validatedRecords===expected.get(proof.id)&&proof.count===expected.get(proof.id)&&hex(proof.checksum)&&hex(proof.manifestHash))verified.add(proof.id);
 }
 const pendingSnapshots=inventory.snapshots.filter(s=>!verified.has(s.id)).length;
 const waveFinished=reports.every(r=>r.status==='complete');
 return {started:true,id,wave:grant.wave||0,createdAt:grant.createdAt,records:grant.records||grant.lanes.flatMap(l=>l.snapshots).reduce((n,s)=>n+s.record_count,0),reusedAuditRecords:reused,completedSnapshots:grant.completed||[],
  copied:reused+reports.reduce((n,r)=>n+(r.copied||0),0),validated:reused+reports.reduce((n,r)=>n+(r.validated||0),0),
  pendingSnapshots,plannedNextWave:grant.deferred?.length||0,nextWaveReady:stable&&waveFinished&&pendingSnapshots>0,
  reconciliationReady:!stable&&waveFinished&&inventory.pendingSnapshots===0,
  inventoryStable:stable,complete:stable&&waveFinished&&pendingSnapshots===0,reports};
}
async function hmacKey(env){return crypto.subtle.importKey('raw',new TextEncoder().encode('grcon-sigem-job-v1\n'+env.SUPABASE_SECRET_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function signedJobRequest(env,input,at=Date.now()){
 const body=canonical(input),time=String(at),signature=new Uint8Array(await crypto.subtle.sign('HMAC',await hmacKey(env),new TextEncoder().encode(time+'\n'+body)));
 return new Request('https://grcon.internal/api/sigem-storage/job-page',{method:'POST',headers:{'content-type':'application/json','x-grcon-job-time':time,'x-grcon-job-signature':Array.from(signature,n=>n.toString(16).padStart(2,'0')).join('')},body});
}
export async function verifyJobRequest(env,request,now=Date.now()){
 const time=request.headers.get('x-grcon-job-time'),sig=request.headers.get('x-grcon-job-signature');
 if(!/^\d{13}$/.test(time||'')||Math.abs(now-Number(time))>120000||!hex(sig)||!env.SUPABASE_SECRET_KEY)throw fail('AUTH_REQUIRED',401);
 const reader=request.body?.getReader();if(!reader)throw fail('SIGEM_INPUT_INVALID',400);
 let raw='',size=0;const decoder=new TextDecoder();
 for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2000){await reader.cancel();throw fail('SIGEM_INPUT_TOO_LARGE',413);}raw+=decoder.decode(part.value,{stream:true});}
 raw+=decoder.decode();
 const bytes=new Uint8Array(sig.match(/../g).map(x=>parseInt(x,16)));
 if(!await crypto.subtle.verify('HMAC',await hmacKey(env),bytes,new TextEncoder().encode(time+'\n'+raw)))throw fail('AUTH_INVALID',401);
 try{return JSON.parse(raw);}catch{throw fail('SIGEM_INPUT_INVALID',400);}
}
export async function handleJobPage(request,env){
 try{
  ready(env);const input=await verifyJobRequest(env,request),grant=await readGrant(env,input.workspace,input.id);
  const source=grant.lanes.flatMap(l=>l.snapshots).find(s=>s.id===input.snapshot);
  if(!source)throw fail('SIGEM_SNAPSHOT_INVALID');
  const current=await rpc(env,grant,'source',{snapshot:source.id});
  if(canonical(current)!==canonical(source))throw fail('SIGEM_SOURCE_CHANGED');
  const db=tursoClient(env),bucket=env.GRCON_DOCUMENTS;
  let result;
  if(input.phase==='seal'){
   await initialize(db);await beginSnapshot(db,source);result=await sealSnapshot(db,bucket,source);
  }else{
   if(!['copy','audit'].includes(input.phase)||!Number.isInteger(input.after)||input.after<0||input.after>=source.record_count||input.after%250!==0)throw fail('SIGEM_PAGE_INVALID',400);
   if(input.phase==='copy'&&input.after===0){await initialize(db);await beginSnapshot(db,source);}
   const page=await rpc(env,grant,'source-page',{snapshot:source.id,after:input.after});
   if(canonical(page.source)!==canonical(source))throw fail('SIGEM_SOURCE_CHANGED');
   result=await(input.phase==='copy'?copyPage(db,bucket,source,input.after,page.rows):auditPage(db,bucket,source,input.after,page.rows));
  }
  // Never send corporate rows or bearer credentials back into Workflow state.
  return Response.json({ok:true,...result},{headers:{'cache-control':'no-store'}});
 }catch(error){return Response.json({ok:false,error:/^[A-Z0-9_]{1,80}$/.test(error.code||'')?error.code:'SIGEM_JOB_UNAVAILABLE'},{status:error.status||503,headers:{'cache-control':'no-store'}});}
}
export function migrationError(error) {
 if(/^[A-Z0-9_]{1,80}$/.test(error?.code||''))return error.code;
 if(/too many subrequests|subrequest limit/i.test(error?.message||''))return 'SIGEM_SUBREQUEST_LIMIT';
 if(/exceeded CPU|CPU time limit/i.test(error?.message||''))return 'SIGEM_CPU_LIMIT';
 return 'SIGEM_JOB_UNAVAILABLE';
}
export async function invokeMigrationPage(env,input){
 const response=await env.GRCON_MIGRATION_SELF.fetch(await signedJobRequest(env,input));
 const raw=await response.text();let value;
 try{value=JSON.parse(raw);}catch{
  if(/1102|Worker exceeded resource limits/i.test(raw))throw fail('SIGEM_CPU_LIMIT',503);
  if(/too many subrequests/i.test(raw))throw fail('SIGEM_SUBREQUEST_LIMIT',503);
  throw fail('SIGEM_WORKER_RESPONSE_INVALID',503);
 }
 if(!response.ok||!value?.ok)throw fail(/^[A-Z0-9_]{1,80}$/.test(value?.error||'')?value.error:'SIGEM_WORKER_REJECTED',response.status||503);
 return value;
}
export async function runMigration(env,params,step,invoke){
 ready(env);
 const segment=params.segment??0;
 if(!Number.isSafeInteger(segment)||segment<0||segment>10000)throw fail('SIGEM_JOB_INVALID');
 const loaded=await step.do('grant',retry,async()=>{
  const value=await readGrant(env,params.workspace,params.id);
  if(!Number.isInteger(params.lane)||!value.lanes[params.lane])throw fail('SIGEM_JOB_INVALID');
  let cursor=null;
  if(segment){
   const object=await env.GRCON_DOCUMENTS.get(path(value.workspace,value.id)+'/cursor-'+params.lane+'-'+segment+'.json');
   if(!object)throw fail('SIGEM_CONTINUATION_NOT_FOUND');
   cursor=await object.json();
   if(cursor.segment!==segment||cursor.lane!==params.lane)throw fail('SIGEM_JOB_INVALID');
  }
  return {grant:{...value,lanes:value.lanes.map(l=>({snapshots:l.snapshots.map(s=>({id:s.id,record_count:s.record_count}))}))},cursor};
 });
 const grant=loaded.grant,lane=grant.lanes[params.lane];
 const report=loaded.cursor?.report||{lane:params.lane,status:'running',copied:0,validated:0,snapshots:[]};
 report.segment=segment;report.status='running';delete report.error;delete report.dispatchPending;delete report.dispatch;
 let index=loaded.cursor?.index||0,phase=loaded.cursor?.phase||'copy',after=loaded.cursor?.after||0;
 let sealed=loaded.cursor?.sealed||null,digest=loaded.cursor?.digest||ZERO_HASH,count=loaded.cursor?.count||0,used=0,attempts=0,handoffPrepared=false;
 const save=async()=>{await env.GRCON_DOCUMENTS.put(path(grant.workspace,grant.id)+'/lane-'+params.lane+'.json',canonical({...report,updatedAt:new Date().toISOString()}));return {saved:true};};
 const send=invoke||(input=>invokeMigrationPage(env,{workspace:grant.workspace,id:grant.id,...input}));
 const call=input=>{
  if(attempts>=PAGE_BUDGET)throw fail('SIGEM_SEGMENT_REQUEST_LIMIT');
  attempts++;return send(input);
 };
 const parallel=async inputs=>{
  const settled=await Promise.allSettled(inputs.map(async input=>call(input)));
  const rejected=settled.find(value=>value.status==='rejected');
  if(rejected)throw rejected.reason;
  return settled.map(value=>value.value);
 };
 const advance=async()=>{
  const nextSegment=segment+1,nextReport={...report,segment:nextSegment,status:'waiting',dispatchPending:true,dispatch:'cron'};
  await step.do('checkpoint',retry,async()=>{
   // Save the checkpoint and visible head before dispatch. A fast child must
   // never have its newer progress overwritten by its parent.
   const cursor={segment:nextSegment,lane:params.lane,index,phase,after,sealed,digest,count,report:nextReport};
   await env.GRCON_DOCUMENTS.put(path(grant.workspace,grant.id)+'/cursor-'+params.lane+'-'+nextSegment+'.json',canonical(cursor));
   await env.GRCON_DOCUMENTS.put(path(grant.workspace,grant.id)+'/lane-'+params.lane+'.json',canonical({...nextReport,updatedAt:new Date().toISOString()}));
   return {prepared:true};
  });
  handoffPrepared=true;
  return {continued:true,segment:nextSegment,dispatch:'cron'};
 };
 try{
  while(index<lane.snapshots.length){
   const source=lane.snapshots[index];
   if(used>=PAGE_BUDGET||attempts>=PAGE_BUDGET)return await advance();
   if(phase==='copy'){
    const start=after,amount=Math.min(GROUP,PAGE_BUDGET-used,Math.ceil((source.record_count-after)/250));
    const pages=await step.do('copy-'+index+'-'+after,retry,async()=>{
     const offsets=Array.from({length:amount},(_,i)=>start+i*250);
     const first=await call({phase:'copy',snapshot:source.id,after:offsets[0]});
     return [first,...await parallel(offsets.slice(1).map(cursor=>({phase:'copy',snapshot:source.id,after:cursor})))];
    });
    for(let i=0;i<pages.length;i++){
     const expected=Math.min(250,source.record_count-start-i*250);
     if(pages[i].count!==expected||pages[i].after!==start+i*250+expected)throw fail('SIGEM_COPY_INCOMPLETE');
     report.copied+=expected;after+=expected;
    }
    used+=pages.length;if(after===source.record_count){phase='seal';after=0;}
    await step.do('copy-progress-'+index+'-'+start,retry,save);
   }else if(phase==='seal'){
    sealed=await step.do('seal-'+index,retry,()=>call({phase:'seal',snapshot:source.id}));used++;
    phase='audit';after=0;digest=ZERO_HASH;count=0;
   }else if(phase==='audit'){
    const auditIndex=index,start=after,amount=Math.min(GROUP,PAGE_BUDGET-used,Math.ceil((source.record_count-after)/250));
    const pages=await step.do('audit-'+index+'-'+after,retry,()=>parallel(Array.from({length:amount},(_,i)=>({phase:'audit',snapshot:source.id,after:start+i*250}))));
    for(let i=0;i<pages.length;i++){
     const page=pages[i],cursor=start+i*250,expected=Math.min(250,source.record_count-cursor);
     if(page.count!==expected||page.after!==cursor+expected||page.snapshotChecksum!==sealed.checksum||!hex(page.checksum))throw fail('SIGEM_AUDIT_INCOMPLETE');
     digest=await sha256(digest+'\n'+page.checksum);count+=page.count;after+=page.count;
    }
    used+=pages.length;report.validated=report.snapshots.reduce((n,s)=>n+s.validatedRecords,0)+count;
    if(after===source.record_count){
     if(count!==source.record_count||digest!==sealed.checksum)throw fail('SIGEM_AUDIT_HASH_MISMATCH');
     report.snapshots.push({id:source.id,...sealed,validatedRecords:count,fullAudit:true});
     index++;phase='copy';after=0;sealed=null;digest=ZERO_HASH;count=0;
    }
    await step.do('audit-progress-'+auditIndex+'-'+start,retry,save);
   }else throw fail('SIGEM_JOB_INVALID');
  }
  await step.do('final-inventory',retry,async()=>{if(await sha256(canonical(await rpc(env,grant,'inventory')))!==grant.inventoryHash)throw fail('SIGEM_SOURCE_CHANGED');return true;});
  report.status='complete';await step.do('complete',retry,save);return {complete:true};
 }catch(error){
  if(handoffPrepared)throw fail(migrationError(error));
  // Retry attempts consume subrequests too. Continue from the last complete
  // group; any partial writes are read back by the idempotent page operation.
  if(error.code==='SIGEM_SEGMENT_REQUEST_LIMIT'||String(error.message).includes('SIGEM_SEGMENT_REQUEST_LIMIT'))return await advance();
  report.status='failed';report.error=migrationError(error);
  await step.do('failure',{retries:{limit:2,delay:'10 seconds',backoff:'exponential'}},save);throw fail(report.error);
 }
}
