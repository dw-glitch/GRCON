'use strict';
const assert=require('node:assert/strict');
(async()=>{
 const worker=(await import('../cloudflare/worker-entry.mjs')).default,Core=require('../allocation_generator_core.js'),N=require('../vendor/recon/allocation_normative_rules.js');
 const w='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
 const document='C1O_RNEST_U32_10.2.1.2_TUB_RIR_nt-NF-228452-Tubos',path='UHDT-D|DATA BOOK C&M|TUBULACAO|RELATORIOS DE INSPECAO';
 const bases={databook:[{databook:path,description:'RELATORIO DE INSPECAO DE RECEBIMENTO TUBULACAO'}],eap:[{code:'10.2.1',levels:['UHDTD U-32','10.SUPRIMENTO','10.02.BENS TAG PRAT OU NAO TAG','10.02.01.H.TUBULACAO']}],norms:N.RULES,config:[{unit:'UHDT-D'}]},versions={databook:'db1',eap:'e1',norms:'n1'};
 const row=Core.review(Core.prepare({documents:[{document,discipline:'TUB'}],bases,versions})[0],{title:'RELATORIO DE INSPECAO DE RECEBIMENTO',path,discipline:'TUB'},bases),payload=Core.decisionPayload(row,'Conferência da base oficial');
 let reserved=0,modelCalls=0,decisionCalls=0,allow=true,fail=false,generationCalls=0,generated=null,viewer=false;
 const env={SUPABASE_URL:'https://qa.test',SUPABASE_SECRET_KEY:'sb_secret_qa',GRCON_DOCUMENT_AI_ENABLED:'true',AI:{run:async()=>{modelCalls++;if(fail)throw Error('PRIVATE');return {response:{candidateId:'path:0',reason:'Caminho previsto no mapa vigente.',citations:['ET-R-7.1']}};}}};
 const original=global.fetch;global.fetch=async(url,options)=>{
  if(String(url).endsWith('/auth/v1/user'))return Response.json({id:'verified-user'});
  const body=JSON.parse(options.body||'{}');assert.equal(body.actor_id,'verified-user');
  if(body.target_workspace!==w)return Response.json({message:'Sem acesso ao contrato.',code:'42501'},{status:403});
  if(String(url).endsWith('/grcon_document_ai_budget')){reserved++;return Response.json({allowed:allow});}
  assert.ok(String(url).endsWith('/grcon_allocation'));
  if(body.operation==='context'&&Array.isArray(body.input.eaps)){assert.ok(body.input.candidatePaths.length<=2);return Response.json({complete:true,bases,versions});}
  if(body.operation==='generate'){if(viewer)return Response.json({message:'Operação reservada aos perfis operacionais.',code:'42501'},{status:403});generationCalls++;generated=body.input;return Response.json({runs:body.input.groups});}
  if(body.operation==='context'){assert.equal(typeof body.input.document,'string');assert.equal(body.input.eap,Core.identity(document,{document}).eap,'API deve usar a EAP derivada do código e não do cliente');assert.ok(Array.isArray(body.input.normIds));if(body.input.confirmedPath)assert.equal(typeof body.input.confirmedPath,'string');else assert.ok(Array.isArray(body.input.candidatePaths));return Response.json({complete:true,bases,versions});}
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
  const civil='UHDT-D|DATA BOOK C&M|CIVIL|RELATORIOS DE INSPECAO';bases.databook.push({databook:civil});
  const autoDoc={document,revision:'0',title:row.title,discipline:'TUB',workflow:'TUBULACAO',databook:path,eap:'FORGED',levels:Array(10).fill('FORGED'),warnings:[],observation:'',trusted:true,adjusted:false};
  const automatic={requestId:'00000000-0000-4000-8000-000000000050',versions,observedSequence:0,groups:[{documents:[autoDoc]}]};
  assert.equal((await worker.fetch(request('generate',automatic,''),env)).status,401);
  assert.equal((await worker.fetch(request('generate',{...automatic,workspaceId:other}),env)).status,403);
  const wrong={...automatic,groups:[{documents:[{...autoDoc,databook:civil,discipline:'CIVIL',workflow:'CIVIL'}]}]};
  assert.equal((await worker.fetch(request('generate',wrong),env)).status,409,'a disciplina do código não pode ser forjada para escolher pasta civil');assert.equal(generationCalls,0);
  assert.equal((await worker.fetch(request('generate',automatic),env)).status,200);assert.equal(generationCalls,1);
  assert.deepEqual(generated.groups[0].documents[0].levels,Core.levelsFor({document,discipline:'TUB',workflow:'TUBULACAO'},path,bases).levels);
  assert.equal(generated.groups[0].documents[0].eap,'10.2.1.2');
  assert.equal((await worker.fetch(request('generate',{...automatic,startSequence:200}),env)).status,200);
  assert.equal(generated.startSequence,200,'o Worker deve preservar o número escolhido');
  assert.notEqual((await worker.fetch(request('generate',{...automatic,startSequence:0}),env)).status,200,'numeração fora dos limites não é aceita');assert.equal(generated.groups[0].documents[0].trusted,undefined);
  viewer=true;assert.equal((await worker.fetch(request('generate',automatic),env)).status,403);viewer=false;
  const incomplete={...automatic,groups:[{documents:[{...autoDoc,document:'CODIGO-SEM-BASE',title:'',discipline:'',workflow:'',databook:''}]}]};
  assert.equal((await worker.fetch(request('generate',incomplete),env)).status,200,'ausência de evidência vira observação, sem confirmação');assert.ok(generated.groups[0].documents[0].warnings.length);
  assert.equal((await worker.fetch(request('generate',{...automatic,versions:{}}),env)).status,409);
  assert.equal(modelCalls,2,'geração automática não consome IA nem depende de disponibilidade do modelo');
  assert.equal(reserved,3);
 }finally{global.fetch=original;}
 console.log('Allocation API: verified identity/contract, current sources, code/path validation, server-only trusted confirmation, common per-user quota, bounded AI and deterministic continuity passed.');
})().catch(error=>{console.error(error.stack);process.exitCode=1});
