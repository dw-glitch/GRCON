'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {randomUUID}=require('node:crypto');
(async()=>{
 const db=new PGlite();
 const w=randomUUID(),other=randomUUID(),master=randomUUID(),owner=randomUUID(),operator=randomUUID(),stranger=randomUUID();
 try{
 await db.exec(`create schema private;create schema auth;create role anon;create role authenticated;create role service_role;grant usage on schema public,private,auth to service_role;
 create table auth.users(id uuid primary key);create table public.grcon_workspaces(id uuid primary key);create table public.grcon_contracts(workspace_id uuid,active boolean);
 create table public.grcon_memberships(user_id uuid,workspace_id uuid,role text,active boolean);
 create table private.grcon_master_owner(user_id uuid);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table private.grcon_sigem_query_snapshots(id uuid primary key,workspace_id uuid,status text,created_by uuid);
 create function private.grcon_sigem_query_begin(w uuid,f text,n integer,m jsonb,e uuid) returns uuid language plpgsql as $$declare v uuid:=gen_random_uuid();begin insert into private.grcon_sigem_query_snapshots values(v,w,'pending',auth.uid());return v;end$$;
 create function private.grcon_sigem_query_chunk(w uuid,u uuid,f integer,r jsonb) returns integer language sql as $$select jsonb_array_length(r)$$;
 create function private.grcon_sigem_query_publish(w uuid,u uuid) returns uuid language plpgsql as $$begin update private.grcon_sigem_query_snapshots set status='active' where id=u;return u;end$$;
 insert into auth.users values('${master}'),('${owner}'),('${operator}'),('${stranger}');insert into public.grcon_workspaces values('${w}'),('${other}');insert into public.grcon_contracts values('${w}',true),('${other}',true);
 insert into public.grcon_memberships values('${master}','${w}','owner',true),('${owner}','${w}','owner',true),('${operator}','${w}','operator',true),('${stranger}','${other}','owner',true);insert into private.grcon_master_owner values('${master}');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261016111711_cloudflare_background_operations.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261016114942_background_processor_checkpoints.sql','utf8'));
 const as=role=>db.exec('reset role;set role '+role);
 const rpc=(op,input={},actor=null,target=null)=>db.query('select public.grcon_operations_service($1,$2,$3,$4) data',[op,actor,target,input]).then(r=>r.rows[0].data);
 await as('anon');await assert.rejects(rpc('technical',{},master),/permission denied/);
 await as('authenticated');await assert.rejects(rpc('create',{},master,w),/permission denied/);await assert.rejects(db.query('select * from private.grcon_background_jobs'),/permission denied/);
 await as('service_role');
 await assert.rejects(rpc('technical',{},owner),/master/);
 await assert.rejects(rpc('create',{kind:'sigem_import',key:'a',fingerprint:'x',title:'base'},operator,w),/proprietário/);
 const create=()=>rpc('create',{kind:'conference_report',key:'idempotent',fingerprint:'hash',title:'Relatório'},operator,w);
 const first=await create(),duplicate=await create();assert.equal(first.fresh,true);assert.equal(duplicate.fresh,false);assert.equal(first.job.id,duplicate.job.id);
 await assert.rejects(rpc('create',{kind:'conference_report',key:'idempotent',fingerprint:'different',title:'Relatório'},operator,w),/outros dados/);
 const id=first.job.id,args={id,generation:0};
 await assert.rejects(rpc('get',{id},stranger),/Sem acesso/);
 await assert.rejects(rpc('get',{id},owner),/Sem acesso/);
 await rpc('ready',{id},operator);assert.equal((await rpc('list',{},operator,w)).length,1);
 await rpc('update',{...args,status:'running',stage:'Gerando',progress:20,increment:true});
 assert.equal((await rpc('get',{id},operator)).attempts,1);
 await assert.rejects(rpc('update',{id,generation:1,status:'succeeded',progress:100,stage:'done'}),/substituída/);
 await rpc('update',{...args,status:'failed',stage:'Falha',errorCode:'TEST_FAILURE'});
 const retry=await rpc('retry',{id},operator);assert.equal(retry.generation,1);
 await assert.rejects(rpc('execute',args),/substituída/);
 await rpc('update',{id,generation:1,status:'succeeded',progress:100,stage:'Pronto',output:true});
 assert.match((await rpc('get',{id},operator)).output_key,/result.xlsx$/);
 const metrics=await rpc('technical',{},master);assert.equal(metrics.jobs.length,1);assert.equal(metrics.counts.succeeded,1);
 const imp=await rpc('create',{kind:'sigem_import',key:'base1',fingerprint:'x',title:'base'},owner,w),impArgs={id:imp.job.id,generation:0};
 await rpc('ready',{id:imp.job.id},owner);
 const begun=await rpc('import_begin',{...impArgs,count:1,fileName:'base.xlsx',meta:{}});assert.ok(begun.import_snapshot);
 assert.equal((await rpc('import_begin',{...impArgs,count:1,fileName:'base.xlsx',meta:{}})).import_snapshot,begun.import_snapshot);
 await rpc('import_chunk',{...impArgs,first:1,rows:[{document:'DOC1',revision:'0',status:'Emitido'}]});
 await rpc('import_publish',impArgs);await rpc('import_publish',impArgs);assert.equal((await rpc('import_begin',{...impArgs,count:1,fileName:'base.xlsx',meta:{}})).context.published,true);
 await as('postgres');await db.query('update public.grcon_memberships set active=false where user_id=$1',[operator]);await as('service_role');
 await assert.rejects(rpc('execute',{id,generation:1}),/revogado/);
 await rpc('metric',{route:'vault',status:500,duration:120,code:'HTTP_500'});await rpc('metric',{route:'vault',status:200,duration:80});
 const technical=await rpc('technical',{},master);assert.equal(technical.metrics[0].requests,2);assert.equal(technical.metrics[0].errors,1);assert.equal(technical.metrics[0].average_ms,100);
 await rpc('recover');assert.ok((await rpc('technical',{},master)).scheduler);
 // Real engine + R2 fixture: one report, a rate-limit retry, an uncertain delivery and re-entry protection.
 const {runJob}=await import('../cloudflare/background-jobs.mjs');
 const realFetch=global.fetch;
 async function engine(kind,delivery){
  const objects=new Map(),changes=[],job={id:randomUUID(),workspace_id:w,actor_id:owner,kind,status:'queued',generation:0,input_key:'input'};
  objects.set('input',JSON.stringify(kind==='teams_notice'?{eventId:'egrdt-ready:test',source:{workspaceId:w},requester:{id:owner},egrdt:{number:'G-1',items:[]}}:{rows:[{document:'D'}]}));
  let sends=0,sleeps=0;
  global.fetch=async(url,options)=>{
   if(url.endsWith('/rpc/grcon_operations_service')){const p=JSON.parse(options.body);if(p.operation==='update')changes.push(p.input);return Response.json({...job,...p.input});}
   sends++;return delivery(sends);
  };
  const env={SUPABASE_URL:'https://db.test',SUPABASE_SECRET_KEY:'sb_secret_test',POWER_AUTOMATE_EGRDT_WEBHOOK_URL:'https://test.logic.azure.com/webhook',GRCON_DOCUMENTS:{get:async k=>objects.has(k)?{json:async()=>JSON.parse(objects.get(k))}:null,head:async k=>objects.has(k)?{}:null,put:async(k,v)=>objects.set(k,v)}};
  // Production validates StepConfig before registering the step. Local Miniflare
  // fills a missing retry delay, which previously hid this rejection in tests.
  const step={do:async(name,options,fn)=>{if(options?.retries)assert.notEqual(options.retries.delay,undefined,'Cloudflare WorkflowStepConfig.retries.delay is required, including limit:0');return (fn||options)();},sleep:async()=>sleeps++};
  const result=await runJob(env,{id:job.id,generation:0},step,async()=>new Uint8Array([1,2,3]));return {result,changes,sends,sleeps,objects};
 }
 try{
  let r=await engine('conference_report');assert.equal(r.result.status,'succeeded');assert.equal(r.changes.at(-1).output,true);
  r=await engine('teams_notice',n=>new Response('',{status:n===1?429:202}));assert.equal(r.sends,2);assert.equal(r.sleeps,1);assert.equal(r.changes.at(-1).status,'succeeded');
  r=await engine('teams_notice',()=>{throw Error('timeout')});assert.equal(r.sends,1);assert.equal(r.changes.at(-1).status,'needs_review');
  r=await engine('teams_notice',()=>new Response('',{status:503}));assert.equal(r.sends,1);assert.equal(r.changes.at(-1).status,'needs_review');
 }finally{global.fetch=realFetch;}
 console.log('Background operations: database authorization, master-only diagnostics, idempotency, generation leases, import checkpoints, metrics, report artifact and safe Teams retries passed.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
