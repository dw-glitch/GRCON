const assert=require('node:assert/strict');
(async()=>{
 const {releaseFetch}=await import('../scripts/release-sigem-production.mjs');let calls=0,waits=[];
 const result=await releaseFetch('https://qa',{},async()=>{calls++;if(calls===1)throw Error('ECONNRESET');if(calls===2)return new Response('',{status:503});return Response.json({ok:true});},async n=>waits.push(n));
 assert.equal(result.status,200);assert.equal(calls,3);assert.deepEqual(waits,[1000,2000]);
 for(const status of [401,403,409]){calls=0;assert.equal((await releaseFetch('https://qa',{},async()=>{calls++;return new Response('',{status});},async()=>{})).status,status);assert.equal(calls,1,'access/integrity failure cannot be retried');}
 calls=0;await assert.rejects(releaseFetch('https://qa',{},async()=>{calls++;throw Error('secret upstream');},async()=>{}),/SIGEM_RELEASE_TRANSPORT_FAILED/);assert.equal(calls,5);
 console.log('sigem_release_transport: network/503 retry, bounded exhaustion, redacted errors and no retries on authorization/integrity failure passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
