const assert=require('node:assert/strict');
(async()=>{
 const {diagnoseWorkflow,classifyWorkflowError}=await import('../scripts/diagnose-sigem-workflow.mjs');
 const workspace='00000000-0000-4000-8000-000000000001',id='a'.repeat(64),token='SYNTHETIC_PRIVATE_TOKEN';let calls=0;
 const fetcher=async(url,options)=>{
  assert.equal(options.redirect,'manual');assert.equal(options.method,undefined);assert.equal(options.headers.authorization,'Bearer '+token);
  const u=new URL(url);assert.equal(u.origin,'https://api.cloudflare.com');assert.doesNotMatch(u.pathname,/%2f/i);calls++;
  if(u.pathname.endsWith('latest.json'))return Response.json({id});
  if(u.pathname.endsWith('grant.json'))return Response.json({id,workspace,lanes:[{}]});
  if(u.pathname.endsWith('lane-0.json'))return Response.json({segment:17});
  assert.ok(u.pathname.endsWith('sigem-'+id.slice(0,40)+'-0-s17'));
  return Response.json({success:true,result:{status:'errored',params:{secret:token},output:{title:'PRIVATE_CORPORATE_ROW'},error:{name:'Error',message:'Worker exceeded CPU time limit'},steps:[{type:'step',name:'grant',finished:false,output:token,attempts:[{error:{message:'Too many subrequests'}}]}]}});
 };
 const report=await diagnoseWorkflow({workspace,account:'b'.repeat(32),token},fetcher);
 assert.equal(calls,4);assert.equal(report.instances[0].error,'SIGEM_CPU_LIMIT');assert.equal(report.instances[0].lastSteps[0].attempts[0].error,'SIGEM_SUBREQUEST_LIMIT');
 assert.doesNotMatch(JSON.stringify(report),/SYNTHETIC_PRIVATE_TOKEN|PRIVATE_CORPORATE_ROW|params|output/);
 assert.equal(classifyWorkflowError({message:'daily steps limit reached'}),'SIGEM_DAILY_STEP_LIMIT');
 assert.equal(classifyWorkflowError({message:'unknown private data'}),'SIGEM_WORKFLOW_UNCLASSIFIED');
 await assert.rejects(diagnoseWorkflow({workspace:'https://evil.test',account:'b'.repeat(32),token},fetcher),/CONFIGURATION_INVALID/);
 await assert.rejects(diagnoseWorkflow({workspace,account:'b'.repeat(32),token},async()=>new Response(null,{status:302})),/DIAG_UNAVAILABLE/);
 const missing=await diagnoseWorkflow({workspace,account:'b'.repeat(32),token},async()=>new Response(null,{status:404}));
 assert.equal(missing.started,false,'standalone backups need no background job');
 const waiting=await diagnoseWorkflow({workspace,account:'b'.repeat(32),token},async(url,opts)=>url.includes('/workflows/')?new Response(null,{status:404}):fetcher(url,opts));
 assert.equal(waiting.instances[0].status,'not-created','cron outbox is a normal pending state');
 console.log('SIGEM workflow diagnosis: read-only API requests, bounded scopes, safe error classification and no token/payload output passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
