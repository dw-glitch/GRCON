'use strict';
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
(async()=>{
 const M=await import('../cloudflare/sigem-migration-job.mjs'),T=await import('../cloudflare/sigem-turso.mjs');
 const source={id:uuid(3),workspace_id:uuid(1),contract_id:uuid(2),status:'active',record_count:2501,file_name:'LD sintética.xlsx',metadata:{teste:true}};
 const rows=Array.from({length:source.record_count},(_,i)=>({snapshot_id:source.id,row_number:i+1,document_key:'DOC-'+(i+1),revision_key:'0',status_normalized:'em_analise',payload:{document:'DOC-'+(i+1),title:'SENTINEL_CORPORATE_ROW_'+i,extra:'Símbolos 漢字 é'}}));
 const inventory={snapshots:[source],pendingSnapshots:0},objects=new Map();
 const bucket={put:async(k,v)=>{objects.set(k,String(v));return {key:k,writeHttpMetadata(){}};},head:async k=>objects.has(k)?{}:null,get:async k=>objects.has(k)?{text:async()=>objects.get(k),json:async()=>JSON.parse(objects.get(k))}:null,list:async({prefix,limit})=>({objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(key=>({key}))})};
 const engine=new DatabaseSync(':memory:');engine.exec('PRAGMA foreign_keys=ON');
 const db={execute:async(sql,args=[])=>{const q=engine.prepare(sql);return q.columns().length?{rows:q.all(...args)}:{rows:[],affected:q.run(...args).changes};}};
 const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_SYNTHETIC_ONLY',TURSO_DATABASE_URL:'libsql://test-account.turso.io',TURSO_AUTH_TOKEN:'SYNTHETIC',GRCON_DOCUMENTS:bucket,GRCON_MIGRATION_SELF:{},GRCON_TASKS:{create:async x=>({id:x.id})},GRCON_SIGEM_EXTERNAL_STORAGE_AUTHORIZED:'true',GRCON_SIGEM_MIGRATION_PREFLIGHT_APPROVED:'true'};
 const originalFetch=global.fetch;let revoked=false;
 global.fetch=async(url,options)=>{
  const host=new URL(url).hostname;
  if(host==='test.supabase.co'){
   const args=JSON.parse(options.body);assert.equal(args.actor_id,uuid(9));assert.equal(args.target_workspace,uuid(1));
   if(revoked)return Response.json({code:'42501'},{status:403});
   const value=args.operation==='inventory'?inventory:args.operation==='source'?source:{source,rows:rows.slice(args.input.after,args.input.after+250)};
   return Response.json(value);
  }
  assert.equal(host,'test-account.turso.io');
  const input=JSON.parse(options.body),stmt=input.requests[0].stmt,args=stmt.args.map(a=>a.type==='null'?null:a.type==='integer'||a.type==='float'?Number(a.value):a.value);
  const result=await db.execute(stmt.sql,args),cols=result.rows.length?Object.keys(result.rows[0]):[];
  return Response.json({results:[{type:'ok',response:{type:'execute',result:{cols:cols.map(name=>({name})),rows:result.rows.map(r=>cols.map(name=>r[name]===null?{type:'null'}:typeof r[name]==='number'?{type:'integer',value:String(r[name])}:{type:'text',value:String(r[name])})),affected_row_count:result.affected||0}}},{type:'ok',response:{type:'close'}}]});
 };
 try{
  const request=await M.signedJobRequest(env,{workspace:uuid(1),id:'a'.repeat(64),snapshot:source.id,phase:'copy',after:0});
  assert.equal((await M.verifyJobRequest(env,request.clone())).after,0);
  await assert.rejects(M.verifyJobRequest(env,new Request(request.url,{method:'POST',headers:request.headers,body:'{}'})),/AUTH_INVALID/);
  await assert.rejects(M.verifyJobRequest(env,await M.signedJobRequest(env,{},Date.now()-130000)),/AUTH_REQUIRED/);
  const denied=await M.handleJobPage(new Request(request.url,{method:'POST',body:'{}'}),env);assert.equal(denied.status,401);
  const plan=M.planLanes(Array.from({length:36},(_,i)=>({...source,id:uuid(20+i),record_count:23408})));
  assert.equal(plan.length,3);assert.ok(plan.every(l=>l.steps<=1000));assert.ok(plan.reduce((n,l)=>n+l.steps,0)<=2700);
  // Regression: 39 snapshots exceed the Free Workflow 2700-step safety cap.
  const grown=Array.from({length:39},(_,i)=>({...source,id:uuid(100+i),record_count:25000}));
  assert.throws(()=>M.planLanes(grown),/SIGEM_JOB_STEP_LIMIT/);
  const firstWave=M.planWave(grown);
  assert.ok(firstWave.lanes.length>0&&firstWave.deferred.length>0,'oversized history must be split');
  assert.ok(firstWave.lanes.every(l=>l.steps<=1000));
  assert.ok(firstWave.lanes.reduce((n,l)=>n+l.steps,0)<=2700);
  const nextWave=M.planWave(grown.filter(s=>firstWave.deferred.includes(s.id)));
  assert.equal(nextWave.deferred.length,0,'deferred versions must fit a later wave');
  assert.equal(firstWave.lanes.flatMap(l=>l.snapshots).length+nextWave.lanes.flatMap(l=>l.snapshots).length,grown.length);

  await assert.rejects(M.startMigration(env,uuid(1),uuid(9),{...inventory,pendingSnapshots:1}),/INVENTORY_NOT_READY/);
  await assert.rejects(M.startMigration({...env,GRCON_SIGEM_EXTERNAL_STORAGE_AUTHORIZED:'false'},uuid(1),uuid(9),inventory),/AUTHORIZATION_REQUIRED/);
  const started=await M.startMigration(env,uuid(1),uuid(9),inventory);
  assert.equal(started.records,2501);
  const params={workspace:uuid(1),id:started.id,lane:0};
  const outputs=[],steps=[],step={do:async(name,config,fn)=>{if(typeof config==='function')fn=config;steps.push(name);const result=await fn();assert.equal(typeof result?.writeHttpMetadata,'undefined','R2 handles cannot enter Workflow state');outputs.push(result);return result;}};
  let corrupt=true;
  const invoke=async input=>{
   const response=await M.handleJobPage(await M.signedJobRequest(env,{...params,...input}),env),data=await response.json();
   if(!response.ok)throw T.fail(data.error,response.status);
   if(corrupt&&input.phase==='audit'&&input.after===2000)data.checksum='f'.repeat(64);
   return data;
  };
  await assert.rejects(M.runMigration(env,params,step,invoke),/HASH_MISMATCH/);
  let state=await M.migrationStatus(env,uuid(1),inventory);assert.equal(state.complete,false);assert.equal(state.reports[0].status,'failed');
  corrupt=false;assert.equal((await M.runMigration(env,params,step,invoke)).complete,true);
  state=await M.migrationStatus(env,uuid(1),inventory);assert.equal(state.complete,true);assert.equal(state.validated,2501);assert.equal(state.copied,2501);
  // A complete Workflow without source receipts is NOT a complete migration.
  const completedKey='sigem-migration-jobs/v1/'+uuid(1)+'/'+started.id+'/lane-0.json';
  const trustedReport=objects.get(completedKey);
  objects.set(completedKey,JSON.stringify({...JSON.parse(trustedReport),snapshots:[]}));
  const incomplete=await M.migrationStatus(env,uuid(1),inventory);
  assert.equal(incomplete.complete,false);
  assert.equal(incomplete.nextWaveReady,true);
  assert.equal(incomplete.pendingSnapshots,1);
  objects.set(completedKey,trustedReport);

  assert.equal(engine.prepare('select count(*) n from sigem_rows').get().n,2501,'replay cannot duplicate source rows');
  assert.equal(JSON.stringify(outputs).includes('SENTINEL_CORPORATE_ROW'),false,'workflow state must not contain corporate row payloads');
  assert.equal(JSON.stringify(outputs).includes('file_name'),false,'full snapshot metadata stays outside Workflow state');
  assert.equal((await M.migrationStatus(env,uuid(1),{...inventory,pendingSnapshots:1})).complete,false,'changed inventory cannot be approved');
  // A 10k-row snapshot needs more page calls than a Free Workflow permits.
  // Exercise several real SQLite/R2 copy+audit continuations, including a
  // failed child whose completed parent must not be mistaken for success.
  source.id=uuid(6);source.record_count=10001;
  rows.splice(0,rows.length,...Array.from({length:source.record_count},(_,i)=>({snapshot_id:source.id,row_number:i+1,document_key:'DOC-'+(i+1),revision_key:'0',status_normalized:'em_analise',payload:{document:'DOC-'+(i+1),title:'SENTINEL_CORPORATE_ROW_'+i}})));
  const pending=[],instances=new Map();
  env.GRCON_TASKS={create:async entry=>{
   if(instances.has(entry.id))throw new Error('exists');
   instances.set(entry.id,{status:'queued',params:entry.params});pending.push(entry);return {id:entry.id};
  },get:async id=>({status:async()=>({status:(()=>{if(!instances.has(id))throw Error('not found');return instances.get(id).status;})()}),restart:async()=>{
   const entry=instances.get(id);entry.status='queued';pending.push({id,params:entry.params});
  }})};
  const next=await M.startMigration(env,uuid(1),uuid(9),inventory);let segments=0,transient=true,firstRetry=true;
  while(pending.length){
   const entry=pending.shift();instances.get(entry.id).status='running';let calls=0;
   const bounded=async input=>{
    assert.ok(++calls<=M.PAGE_BUDGET,'each continuation stays below the Free subrequest budget');
    if(entry.params.segment===0&&input.phase==='copy'&&input.after===0&&firstRetry){firstRetry=false;throw T.fail('TURSO_TIMEOUT',503);}
    if(entry.params.segment===1&&input.phase==='audit'&&transient){transient=false;throw T.fail('TURSO_TIMEOUT',503);}
    const response=await M.handleJobPage(await M.signedJobRequest(env,{workspace:uuid(1),id:next.id,...input}),env),value=await response.json();
    if(!response.ok)throw T.fail(value.error,response.status);return value;
   };
   try{
    const retryStep=entry.params.segment===0?{do:async(name,config,fn)=>{
     try{return await step.do(name,config,fn);}catch(error){if(error.code!=='TURSO_TIMEOUT')throw error;return step.do(name,config,fn);}
    }}:step;
    const result=await M.runMigration(env,entry.params,retryStep,bounded);instances.get(entry.id).status='complete';segments++;
    if(result.continued){assert.equal(pending.length,0,'a Workflow cannot synchronously dispatch its child');await M.recoverMigrations(env);const progress=await M.migrationStatus(env,uuid(1),inventory);assert.equal(progress.complete,false);assert.equal(progress.reports[0].segment,result.segment);}
   }catch(error){
    assert.equal(error.code,'TURSO_TIMEOUT');instances.get(entry.id).status='errored';
    const progress=await M.migrationStatus(env,uuid(1),inventory);assert.equal(progress.reports[0].status,'failed');
    await M.startMigration(env,uuid(1),uuid(9),inventory);
   }
  }
  state=await M.migrationStatus(env,uuid(1),inventory);assert.equal(state.complete,true);assert.equal(state.copied,10001);assert.equal(state.validated,10001);
  assert.ok(segments>=3);assert.equal(engine.prepare('select count(*) n from sigem_rows where snapshot_id=?').get(source.id).n,10001);
  assert.equal(JSON.stringify(outputs).includes('SENTINEL_CORPORATE_ROW'),false);
  // A dispatch response may be lost after a fast child completes. Recovery
  // cannot replace that child's newer report with its parent's checkpoint.
  const laneKey='sigem-migration-jobs/v1/'+uuid(1)+'/'+next.id+'/lane-0.json';
  const completed=JSON.parse(objects.get(laneKey));
  const replayInvoke=async input=>{
   const response=await M.handleJobPage(await M.signedJobRequest(env,{workspace:uuid(1),id:next.id,...input}),env),value=await response.json();
   if(!response.ok)throw T.fail(value.error,response.status);return value;
  };
  let dispatches=0;
  env.GRCON_TASKS={get:async()=>({status:async()=>{throw Error('not found');}}),create:async()=>{
   dispatches++;objects.set(laneKey,JSON.stringify({...completed,segment:1}));throw Error('response lost');
  }};
  await M.runMigration(env,{workspace:uuid(1),id:next.id,lane:0},step,replayInvoke);
  assert.equal(dispatches,0,'continuations must leave dispatch to a fresh cron invocation');
  await M.recoverMigrations(env);
  assert.equal(dispatches,1);assert.equal(JSON.parse(objects.get(laneKey)).status,'complete');
  assert.equal(JSON.parse(objects.get(laneKey)).validated,10001,'lost dispatch responses cannot roll back a completed child');
  // Reuse requires the exact full-audit receipt, immutable metadata and hash.
  source.status='archived';
  const resumed=await M.startMigration(env,uuid(1),uuid(9),inventory);
  const reused=await M.migrationStatus(env,uuid(1),inventory);
  assert.equal(reused.complete,true);assert.equal(reused.reusedAuditRecords,10001);
  assert.equal(reused.completedSnapshots[0].reusedAudit,true);
  env.GRCON_TASKS={create:async entry=>({id:entry.id})};
  // Growth scenario: reuse yesterday's archived and audited snapshot, and
  // schedule only the newly published active version for incremental copy.
  const fresh={...source,id:uuid(31),status:'active',record_count:2501};
  inventory.snapshots.push(fresh);
  const expanded=await M.startMigration(env,uuid(1),uuid(9),inventory);
  const incremental=await M.migrationStatus(env,uuid(1),inventory);
  assert.equal(expanded.records,12502);
  assert.equal(incremental.reusedAuditRecords,10001,'audited archive must not be copied again');
  assert.equal(incremental.pendingSnapshots,1,'only the new version must be copied');
  assert.equal(incremental.complete,false,'incomplete incremental import cannot permit cutover');
  inventory.snapshots.pop();
  source.metadata={teste:'changed'};
  const changed=await M.startMigration(env,uuid(1),uuid(9),inventory);
  const rejectedReuse=await M.migrationStatus(env,uuid(1),inventory);
  assert.equal(rejectedReuse.reusedAuditRecords,0,'metadata edits invalidate the previous receipt');
  assert.equal(rejectedReuse.complete,false);
  source.metadata={teste:true};source.status='active';
  assert.equal(M.migrationError(new Error('Too many subrequests.')),'SIGEM_SUBREQUEST_LIMIT');
  const service=env.GRCON_MIGRATION_SELF;
  env.GRCON_MIGRATION_SELF={fetch:async()=>new Response('<html>Worker exceeded resource limits: 1102</html>',{status:500})};
  await assert.rejects(M.invokeMigrationPage(env,{}),/SIGEM_CPU_LIMIT/);env.GRCON_MIGRATION_SELF=service;
  revoked=true;
  const refused=await M.handleJobPage(await M.signedJobRequest(env,{workspace:uuid(1),id:next.id,snapshot:source.id,phase:'audit',after:0}),env);
  assert.equal(refused.status,403,'live access revocation must stop each page');
 }finally{global.fetch=originalFetch;engine.close();}
 // Real PostgreSQL ACL and live-master delegation, without production writes.
 const pg=new PGlite();try{
  await pg.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table private.grcon_master_owner(user_id uuid);create table public.grcon_contracts(id uuid,workspace_id uuid,active boolean);
   create table public.grcon_memberships(user_id uuid,workspace_id uuid,contract_id uuid,active boolean,role text);
   insert into private.grcon_master_owner values('${uuid(9)}');insert into public.grcon_contracts values('${uuid(2)}','${uuid(1)}',true);
   insert into public.grcon_memberships values('${uuid(9)}','${uuid(1)}','${uuid(2)}',true,'owner');
   create function private.grcon_sigem_storage_control(target_workspace uuid,operation text,input jsonb) returns jsonb language sql as $$select jsonb_build_object('actor',auth.uid(),'operation',operation)$$;`);
  await pg.exec(fs.readFileSync(require('node:path').join(__dirname,'../supabase/sql/sigem_storage_background.sql'),'utf8'));
  const sql=`select public.grcon_sigem_storage_service('${uuid(1)}','${uuid(9)}','inventory','{}') result`;
  for(const role of ['anon','authenticated']){
   await pg.exec('set role '+role);await assert.rejects(pg.query(sql),/permission denied/);await pg.exec('reset role');
  }
  await pg.exec('set role service_role');assert.equal((await pg.query(sql)).rows[0].result.actor,uuid(9));await pg.exec('reset role');
  await pg.exec('update public.grcon_memberships set active=false;set role service_role');await assert.rejects(pg.query(sql),/revogado/);await pg.exec('reset role');
 }finally{await pg.close();}
 console.log('SIGEM durable copy: signed pages, live Master ACL, full real copy/audit, retry without duplication, integrity failure, changed inventory and payload-free Workflow state passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
