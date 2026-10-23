'use strict';
const assert=require('node:assert/strict');
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
(async()=>{
 const {handleSigemStorage:route}=await import('../cloudflare/sigem-storage.mjs');
 const original=global.fetch;
 let role='master',calls=[],mode='supabase';
 const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SECRET_KEY:'secret',TURSO_DATABASE_URL:'libsql://db-org.turso.io',TURSO_AUTH_TOKEN:'never-log'};
 const source={id:uuid(3),workspace_id:uuid(1),contract_id:uuid(2),record_count:1};
 const rows=[{row_number:1,payload:{document:'DOC-122',revision:'0',status:'Em workflow'}}];
 function httpResult(row){return Response.json({results:[{type:'ok',response:{type:'execute',result:{cols:Object.keys(row).map(name=>({name})),rows:[Object.values(row).map(value=>({type:typeof value==='number'?'integer':'text',value:String(value)}))],affected_row_count:0}}},{type:'ok',response:{type:'close'}}]});}
 global.fetch=async(url,opts)=>{
  calls.push(String(url));
  if(String(url).endsWith('/auth/v1/user'))return Response.json({id:uuid(10)});
  if(String(url).includes('turso.io')){
   const sql=JSON.parse(opts.body).requests[0].stmt.sql;
   if(sql.includes('SELECT state,checksum'))return httpResult({state:'verified',checksum:'hash',expected_count:1});
   if(sql.includes('SELECT row_number,row_json'))return httpResult({row_number:1,row_json:JSON.stringify({...rows[0],payload:{...rows[0].payload,document:mode==='diverge'?'DOC-121':'DOC-122'}})});
   return httpResult({connected:1});
  }
  const p=JSON.parse(opts.body);
  assert.equal(opts.headers.authorization,'Bearer session','RPC must retain user authorization');
  if(String(url).endsWith('grcon_sigem_query_page'))return Response.json(rows);
  if(p.operation==='authorize-page')return Response.json(source);
  if(role!=='master')return Response.json({code:'42501'},{status:403});
  if(p.operation==='status')return Response.json({contractId:uuid(2),snapshots:1,records:1});
  if(p.operation==='inventory')return Response.json({snapshots:[source]});
  return Response.json(source);
 };
 const req=(action,data,token=true)=>new Request('https://grcon.test/api/sigem-storage/'+action+(data?'':'?workspace='+uuid(1)),{method:data?'POST':'GET',headers:{...(token?{authorization:'Bearer session'}:{}),...(data?{'content-type':'application/json'}:{})},...(data?{body:JSON.stringify({workspace:uuid(1),...data})}:{})});
 try{
  assert.equal((await route(req('status',null,false),env)).status,401);
  role='operator';assert.equal((await route(req('status'),env)).status,403);assert.ok(!calls.some(x=>x.includes('turso.io')));
  calls=[];const input={snapshot:uuid(3),after:0,size:1000};
  const response=await route(req('page',input),env);assert.deepEqual((await response.json()).rows,rows);assert.ok(!calls.some(x=>x.includes('turso.io')));
  assert.equal((await route(req('copy',{snapshot:uuid(3),after:0}),env)).status,403);
  role='master';calls=[];assert.equal((await route(req('copy',{snapshot:uuid(3),after:0}),env)).status,403);assert.ok(!calls.some(x=>x.includes('turso.io')),'corporate consent precedes external data access');
  env.GRCON_SIGEM_STORAGE_MODE='shadow';env.GRCON_SIGEM_EXTERNAL_STORAGE_AUTHORIZED='true';
  calls=[];assert.equal((await route(req('copy',{snapshot:uuid(3),after:0}),env)).status,409);assert.ok(!calls.some(x=>x.includes('turso.io')),'capacity preflight blocks external writes');
  assert.equal((await (await route(req('page',input),env)).json()).shadow,'matched');
  mode='diverge';const shadow=await (await route(req('page',input),env)).json();assert.equal(shadow.shadow,'diverged');assert.deepEqual(shadow.rows,rows,'a shadow discrepancy never replaces official data');
  env.GRCON_SIGEM_STORAGE_MODE='turso';calls=[];assert.equal((await route(req('page',input),env)).status,503);assert.ok(!calls.some(x=>x.includes('turso.io')));
  env.GRCON_SIGEM_STORAGE_MODE='invalid';assert.equal((await route(req('status'),env)).status,503);
  assert.equal(await route(new Request('https://grcon.test/other'),env),null);
 }finally{global.fetch=original;}
 console.log('SIGEM storage routes: session, master, contract RPC, corporate consent, official fallback in shadow, and blocked cutover passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
