const assert=require('node:assert/strict');
(async()=>{
 const {releaseMaintenance,handleReleaseMaintenance}=await import('../cloudflare/sigem-maintenance.mjs');
 const {canonical,sha256}=await import('../cloudflare/sigem-turso.mjs');
 const w='00000000-0000-4000-8000-000000000001',c='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003',actor='00000000-0000-4000-8000-000000000004';
 const source={id,workspace_id:w,contract_id:c,status:'archived',record_count:501},inventory={snapshots:[source],pendingSnapshots:1};
 const manifest=canonical({source,recordCount:501,checksum:'a'.repeat(64)}),hash=await sha256(manifest);
 const proof={id,count:501,validatedRecords:501,fullAudit:true,checksum:'a'.repeat(64),manifestHash:hash,manifestKey:`sigem-backups/v1/${w}/${c}/${id}/manifest-${hash}.json`};
 const job='b'.repeat(64),grant={id:job,workspace:w,actor,inventoryHash:'changed',completed:[proof],lanes:[]};
 const objects=new Map([[`sigem-migration-jobs/v1/${w}/latest.json`,JSON.stringify({id:job})],[`sigem-migration-jobs/v1/${w}/${job}/grant.json`,JSON.stringify(grant)],[proof.manifestKey,manifest]]);
 const bucket={get:async k=>objects.has(k)?{text:async()=>objects.get(k),json:async()=>JSON.parse(objects.get(k))}:null,put:async(k,v)=>objects.set(k,v)};
 const env={GRCON_DOCUMENTS:bucket,GRCON_SIGEM_RELEASE_ENABLED:'true',GRCON_SIGEM_EXTERNAL_STORAGE_AUTHORIZED:'true',SUPABASE_URL:'https://qa.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_qa',TURSO_DATABASE_URL:'libsql://qa.turso.io',TURSO_AUTH_TOKEN:'private'};
 let steps=0,denied=false,targetChecksum=proof.checksum;const original=global.fetch;
 global.fetch=async(url,options)=>{
 if(String(url).includes('turso.io'))return Response.json({results:[{type:'ok',response:{type:'execute',result:{cols:[{name:'state'},{name:'checksum'},{name:'expected_count'}],rows:[[{type:'text',value:'verified'},{type:'text',value:targetChecksum},{type:'integer',value:'501'}]]}}},{type:'ok',response:{type:'close'}}]});
 const input=JSON.parse(options.body);assert.equal(input.actor_id,actor);
 if(denied)return Response.json({code:'42501'},{status:403});
 if(String(url).endsWith('grcon_sigem_storage_service'))return Response.json(inventory);
 assert.ok(String(url).endsWith('grcon_sigem_release_step'));steps++;return Response.json({released:steps>=2,phase:steps>=2?'complete':'projecting',processed:501,expected:501});
 };
 try{
 targetChecksum='wrong';await assert.rejects(releaseMaintenance(env,w),/DESTINATION_MISMATCH/);assert.equal(steps,0);
 targetChecksum=proof.checksum;denied=true;await assert.rejects(releaseMaintenance(env,w),/ACCESS_DENIED/);assert.equal(steps,0);denied=false;
 const result=await releaseMaintenance(env,w);assert.equal(result.complete,true);assert.equal(steps,2,'new pending import does not block an audited older version');
 assert.equal((await releaseMaintenance(env,w)).complete,true);assert.equal(steps,2,'durable completion skips earlier cleanup');
 assert.equal((await handleReleaseMaintenance(new Request('https://qa/api/sigem-storage/deployment-release',{method:'POST',body:'{}'}),env)).status>=400,true);
 assert.equal(await handleReleaseMaintenance(new Request('https://qa/api/other'),env),null);
 console.log('sigem_maintenance: revoked ownership, destination mismatch, pending import isolation, bounded resume and unauthenticated denial passed');
 }finally{global.fetch=original;}
})().catch(e=>{console.error(e);process.exitCode=1;});
