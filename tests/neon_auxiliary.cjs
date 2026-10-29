const assert=require('node:assert/strict');
(async()=>{
 const {neonStatus}=await import('../cloudflare/neon-auxiliary.mjs');let calls=0;
 const connect=()=>{calls++;return async()=>[{ready:true}];};
 assert.equal((await neonStatus({},connect)).error,'NEON_NOT_CONFIGURED');
 assert.equal((await neonStatus({NEON_DATABASE_URL:'postgresql://user:secret@evil.test/db'},connect)).error,'NEON_CONFIGURATION_INVALID');assert.equal(calls,0);
 const env={NEON_DATABASE_URL:'postgresql://user:secret@ep-test-123.sa-east-1.aws.neon.tech/db?sslmode=require'};
 assert.deepEqual(await neonStatus(env,connect),{configured:true,connected:true,ready:true});
 const result=await neonStatus(env,()=>async()=>{throw Error('postgresql://secret');});assert.equal(result.error,'NEON_UNAVAILABLE');assert.ok(!JSON.stringify(result).includes('secret'));
 console.log('neon_auxiliary: optional server-only integration, host validation, schema readiness and redacted failures passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
