'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{
 const {MODEL,evidenceFor,modelInput,generateExplanation}=await import('../cloudflare/document-ai.mjs');
 const data={queriedAt:'2026-10-20',sigem:[{revision:'0',status:'Em análise',title:'PRIVATE',email:'PRIVATE'}],pw:[{revision:'A'}],history:[],vault:[{id:'PRIVATE',object_key:'PRIVATE',revision:'B',file_version:2}],requests:[],sources:{sigem:{available:true},pw:{available:true},history:{available:true},vault:{available:true},requests:{available:false}},pages:{}};
 const evidence=evidenceFor(data);assert.ok(!JSON.stringify(evidence).includes('PRIVATE'));assert.equal(evidence.find(r=>r.id==='requests').available,false);
 assert.throws(()=>modelInput('invent',evidence),/INTENT/);
 assert.throws(()=>modelInput('sources',[{id:'large',value:'x'.repeat(6500)}]),/TOO_LARGE/);
 const fixture={run:async(model,input)=>{assert.equal(model,MODEL);assert.equal(input.max_completion_tokens,384);assert.equal(input.chat_template_kwargs.enable_thinking,false);assert.equal(input.store,false);assert.ok(!input.tools&&!input.gateway);return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:[{text:'A fonte SIGEM registra revisão 0.',citations:['sigem:0']}]})}}]};}};
 assert.equal((await generateExplanation(fixture,'revision',data)).items[0].citations[0].source,'sigem');
 await assert.rejects(generateExplanation({run:async()=>({response:{items:[{text:'Inventado',citations:['OTHER']}]}})},'sources',data),/CITATION/);
 await assert.rejects(generateExplanation({run:async()=>({choices:[{finish_reason:'length',message:{content:'{}'}}]})},'sources',data),/INCOMPLETE/);
 const db=new PGlite(),w='00000000-0000-4000-8000-000000000001',c='00000000-0000-4000-8000-000000000002';
 try{
  await db.exec(`create schema private;create schema auth;create role anon;create role authenticated;create role service_role;grant usage on schema public,auth,private to service_role;create function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('role',current_setting('request.jwt.claim.role',true)) $$;create table public.grcon_contracts(id uuid,workspace_id uuid,active boolean);create table public.grcon_memberships(workspace_id uuid,contract_id uuid,user_id uuid,active boolean);insert into public.grcon_contracts values('${c}','${w}',true);`);
  const sql=fs.readFileSync('supabase/migrations/20261020182534_document_ai_daily_budget.sql','utf8');await db.exec(sql);
  const call=(operation,actor=null,workspace=w)=>db.query('select public.grcon_document_ai_budget($1,$2,$3) as r',[operation,workspace,actor]).then(r=>r.rows[0].r);
  const actor=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
  for(let i=10;i<17;i++)await db.query('insert into public.grcon_memberships values($1,$2,$3,true)',[w,c,actor(i)]);
  await db.exec("set role authenticated;set request.jwt.claim.role='authenticated'");await assert.rejects(call('reserve',actor(10)),/permission denied/);
  await db.exec("reset role;set role service_role;set request.jwt.claim.role='service_role'");
  await assert.rejects(call('reserve',actor(99)),/Sem acesso/);await assert.rejects(call('reserve',actor(10),c),/Sem acesso/);
  assert.equal((await call('probe')).allowed,true);assert.equal((await call('probe')).allowed,false);
  assert.equal((await call('reserve',actor(10))).allowed,true);assert.equal((await call('reserve',actor(10))).reason,'cooldown');
  await db.exec('reset role');await db.exec(sql);await db.exec("set role service_role");assert.equal((await call('status',actor(10))).remaining,30,'reapply preserves consumed slots');
  for(let i=0;i<35;i++){
   await db.exec('reset role;update private.grcon_ai_actor_daily set last_at=now()-interval \'1 minute\';set role service_role');
   await call('reserve',actor(10+Math.floor(i/6)));
  }
  assert.equal((await call('status',actor(10))).remaining,0);assert.equal((await call('reserve',actor(16))).allowed,false);
  await db.exec('reset role');assert.equal((await db.query('select requests from private.grcon_ai_daily')).rows[0].requests,32);
  await db.exec('update public.grcon_contracts set active=false;set role service_role');await assert.rejects(call('status',actor(10)),/Sem acesso/);
 }finally{await db.close();}
 const {verifyGithubToken}=await import('../cloudflare/teams-github.mjs');
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'ai-test',use:'sig',alg:'RS256'},clock=Math.floor(Date.now()/1000);
 const cfg={repository:'dw-glitch/GRCON',repositoryId:'1322072089',ownerId:'202873892',audience:'grcon-document-ai-probe',visibility:'private',workflow:'dw-glitch/GRCON/.github/workflows/deploy-cloudflare.yml@refs/heads/main',allowedEvents:['push','workflow_dispatch']};
 const claims={iss:'https://token.actions.githubusercontent.com',aud:cfg.audience,sub:'repo:dw-glitch/GRCON:ref:refs/heads/main',iat:clock,nbf:clock-1,exp:clock+300,repository:cfg.repository,repository_id:cfg.repositoryId,repository_owner_id:cfg.ownerId,repository_visibility:cfg.visibility,actor_id:cfg.ownerId,ref:'refs/heads/main',workflow_ref:cfg.workflow,event_name:'push'};
 const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const sign=async change=>{const plain=b64({alg:'RS256',typ:'JWT',kid:jwk.kid})+'.'+b64({...claims,...change});return plain+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,Buffer.from(plain))).toString('base64url');};
 const verification={useCache:false,fetchImpl:async(url,options)=>{if(options.redirect==='error')throw TypeError('Workers does not support redirect:error');assert.equal(options.redirect,'manual');return Response.json({keys:[jwk]});}};
 assert.equal((await verifyGithubToken(await sign({}),cfg,verification)).event_name,'push');
 await assert.rejects(verifyGithubToken(await sign({}),cfg,{useCache:false,fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://untrusted.test'}})}),/OIDC_KEYS_UNAVAILABLE/);
 for(const change of [{repository_visibility:'public'},{aud:'other'},{actor_id:'other'},{repository_id:'other'},{ref:'refs/heads/other'},{workflow_ref:'other'},{event_name:'pull_request'}])await assert.rejects(verifyGithubToken(await sign(change),cfg,verification));
 const worker=(await import('../cloudflare/worker-entry.mjs')).default,originalFetch=global.fetch;let modelCalls=0,reserved=0,allow=true,rev='v1';
 // Exercise the actual Worker probe configuration, not only a copied verifier config.
 let probeBudgetCalls=0;
 global.fetch=async(url)=>{
  if(String(url).includes('token.actions.githubusercontent.com'))return Response.json({keys:[jwk]});
  if(String(url).endsWith('/grcon_document_ai_budget')){probeBudgetCalls++;return Response.json({allowed:false,reason:'daily_limit'});}
  throw Error('Unexpected probe request: '+url);
 };
 try{
  const probeEnv={SUPABASE_URL:'https://qa.test',SUPABASE_SECRET_KEY:'sb_secret_qa',GRCON_DOCUMENT_AI_ENABLED:'true',AI:{run(){throw Error('Probe quota must prevent inference');}}};
  const probeRequest=token=>new Request('https://qa.test/api/document-vault/ai-probe',{method:'POST',headers:{authorization:'Bearer '+token}});
  const accepted=await worker.fetch(probeRequest(await sign({})),probeEnv,{});
  assert.equal(accepted.status,200);assert.deepEqual(await accepted.json(),{ok:true,skipped:true,reason:'daily_limit'});
  assert.equal(probeBudgetCalls,1);
  const publicToken=await worker.fetch(probeRequest(await sign({repository_visibility:'public'})),probeEnv,{});
  assert.equal(publicToken.status,403);assert.equal(probeBudgetCalls,1,'wrong source cannot reach the service budget');
 }finally{global.fetch=originalFetch;}
 const env={SUPABASE_URL:'https://qa.test',SUPABASE_SECRET_KEY:'sb_secret_qa',GRCON_DOCUMENT_AI_ENABLED:'true',AI:{run:async(...args)=>{modelCalls++;return fixture.run(...args);}}};
 const view={...data,pages:Object.fromEntries(['sigem','pw','history','vault','requests'].map(k=>[k,{revision:'v1',after:0}]))};
 global.fetch=async(url,options)=>{
  if(String(url).endsWith('/auth/v1/user'))return Response.json({id:'actor'});
  const body=JSON.parse(options.body||'{}');
  if(String(url).endsWith('/grcon_document_ai_budget')){assert.equal(body.actor_id,'actor');assert.equal(body.target_workspace,w);if(body.operation==='reserve')reserved++;return Response.json(body.operation==='status'?{available:true}:{allowed:allow});}
  if(String(url).endsWith('/grcon_master_query')){assert.equal(body.actor_id,'actor');assert.equal(body.target_workspace,w);return Response.json({...view,pages:{...view.pages,sigem:{revision:rev}}});}
  throw Error('Unexpected fetch');
 };
 const payload={workspaceId:w,code:'DOC-001',intent:'revision',revisions:Object.fromEntries(Object.keys(view.pages).map(k=>[k,'v1']))};
 const request=(body=payload,token='qa')=>new Request('https://grcon.test/api/document-vault/ai-explain',{method:'POST',headers:token?{authorization:'Bearer '+token}:{},body:JSON.stringify(body)});
 try{
  assert.equal((await worker.fetch(request(payload,''),env)).status,401);assert.equal(modelCalls,0);
  assert.equal((await worker.fetch(request({...payload,revisions:{}}),env)).status,409);assert.equal(reserved,0);
  rev='v2';assert.equal((await worker.fetch(request(),env)).status,409);assert.equal(modelCalls,0);rev='v1';
  allow=false;assert.equal((await worker.fetch(request(),env)).status,429);assert.equal(modelCalls,0);allow=true;
  const response=await worker.fetch(request(),env);assert.equal(response.status,200);assert.equal((await response.json()).mode,'workers-ai');assert.equal(modelCalls,1);
  env.AI.run=async()=>{throw Error('PRIVATE FAILURE');};const failure=await worker.fetch(request(),env);assert.equal(failure.status,503);assert.ok(!(await failure.text()).includes('PRIVATE'));
  assert.equal((await worker.fetch(new Request('https://grcon.test/api/document-vault/ai-probe',{method:'POST'}),env)).status,401);
 }finally{global.fetch=originalFetch;}
 console.log('Workers AI: bounded sources/output, citations, private metadata, SQL roles/contract/cooldown/global quota/idempotence, Worker auth/source drift/failure approved.');
})().catch(e=>{console.error(e);process.exitCode=1;});
