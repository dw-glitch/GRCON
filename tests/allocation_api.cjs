'use strict';
const assert=require('node:assert/strict');
(async()=>{
 const worker=(await import('../cloudflare/worker-entry.mjs')).default,Core=require('../allocation_generator_core.js'),N=require('../vendor/recon/allocation_normative_rules.js');
 const w='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
 const document='C1O_RNEST_U32_10.2.1.2_TUB_RIR_nt-NF-228452-Tubos',path='UHDT-D|DATA BOOK C&M|TUBULACAO|RELATORIOS DE INSPECAO';
 const bases={databook:[{databook:path,description:'RELATORIO DE INSPECAO DE RECEBIMENTO TUBULACAO'}],eap:[{code:'10.2.1',levels:['UHDTD U-32','10.SUPRIMENTO','10.02.BENS TAG PRAT OU NAO TAG','10.02.01.H.TUBULACAO']}],norms:N.RULES,config:[{unit:'UHDT-D'}]},versions={databook:'db1',eap:'e1',norms:'n1'};
 const row=Core.review(Core.prepare({documents:[{document,discipline:'TUB'}],bases,versions})[0],{title:'RELATORIO DE INSPECAO DE RECEBIMENTO',path,discipline:'TUB'},bases),payload=Core.decisionPayload(row,'Conferência da base oficial');
 let reserved=0,modelCalls=0,decisionCalls=0,allow=true,fail=false;
 const env={SUPABASE_URL:'https://qa.test',SUPABASE_SECRET_KEY:'sb_secret_qa',GRCON_DOCUMENT_AI_ENABLED:'true',AI:{run:async()=>{modelCalls++;if(fail)throw Error('PRIVATE');return {response:{candidateId:'path:0',reason:'Caminho previsto no mapa vigente.',citations:['ET-R-7.1']}};}}};
 const original=global.fetch;global.fetch=async(url,options)=>{
  if(String(url).endsWith('/auth/v1/user'))return Response.json({id:'verified-user'});
  const body=JSON.parse(options.body||'{}');assert.equal(body.actor_id,'verified-user');
  if(body.target_workspace!==w)return Response.json({message:'Sem acesso ao contrato.',code:'42501'},{status:403});
  if(String(url).endsWith('/grcon_document_ai_budget')){reserved++;return Response.json({allowed:allow});}
  assert.ok(String(url).endsWith('/grcon_allocation'));
  if(body.operation==='context'){assert.equal(body.input.document,document);assert.equal(body.input.eap,'10.2.1');assert.ok(Array.isArray(body.input.normIds));if(body.input.confirmedPath)assert.equal(body.input.confirmedPath,path);else assert.ok(Array.isArray(body.input.candidatePaths));return Response.json({complete:true,bases,versions});}
  if(body.operation==='decision'){decisionCalls++;assert.equal(body.input.validated,true);assert.equal(body.input.family,row.identity.family);return Response.json({id:'confirmed'});}
  if(body.operation==='experiences')return Response.json({decisions:[]});
  throw Error('Unexpected '+body.operation);
 };
 const request=(action,input,token='qa')=>new Request('https://grcon.test/api/document-vault/allocation-'+action,{method:'POST',headers:token?{authorization:'Bearer '+token}:{},body:JSON.stringify({workspaceId:w,...input})});
 try{
  assert.equal((await worker.fetch(request('confirm',payload,''),env)).status,401);
  assert.equal((await worker.fetch(request('confirm',{...payload,workspaceId:other}),env)).status,403);
  assert.equal((await worker.fetch(request('confirm',{...payload,confirmedPath:'INVENTADO'}),env)).status,409);assert.equal(decisionCalls,0);
  assert.equal((await worker.fetch(request('confirm',{...payload,document:document.replace('_TUB_','_XXX_')}),env)).status,409);
  const confirmed=await worker.fetch(request('confirm',payload),env);assert.equal(confirmed.status,200);assert.equal((await confirmed.json()).trusted,true);assert.equal(modelCalls,0,'confirmation never consumes AI');
  const input={document,title:row.title,discipline:'TUB',versions};
  allow=false;assert.equal((await worker.fetch(request('ai',input),env)).status,429);assert.equal(modelCalls,0);allow=true;
  assert.equal((await worker.fetch(request('ai',input),env)).status,200);assert.equal(modelCalls,1);
  fail=true;const unavailable=await worker.fetch(request('ai',input),env);assert.equal(unavailable.status,503);assert.ok(!(await unavailable.text()).includes('PRIVATE'));
  assert.equal((await worker.fetch(request('confirm',payload),env)).status,200,'deterministic confirmation remains available with AI failure');
  assert.equal((await worker.fetch(request('ai',{...input,versions:{}}),env)).status,409);
  assert.equal((await worker.fetch(request('confirm',{...payload,title:'x'.repeat(17000)}),env)).status,413);
  assert.equal(reserved,3);
 }finally{global.fetch=original;}
 console.log('Allocation API: verified identity/contract, current sources, code/path validation, server-only trusted confirmation, common per-user quota, bounded AI and deterministic continuity passed.');
})().catch(error=>{console.error(error.stack);process.exitCode=1});
