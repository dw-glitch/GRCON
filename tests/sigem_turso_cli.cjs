'use strict';
const assert=require('node:assert/strict');
const {mkdtempSync,writeFileSync,readFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
(async()=>{
 const folder=mkdtempSync(join(tmpdir(),'grcon-turso-cli-'));
 try {
  const preload=join(folder,'service.mjs');
  writeFileSync(preload,`
   import {sha256,ZERO_HASH} from ${JSON.stringify(pathToFileURL(resolve('cloudflare/sigem-turso.mjs')).href)};
   const digest='a'.repeat(64),checksum=await sha256(ZERO_HASH+'\\n'+digest);
   let inventories=0,audits=0;
   globalThis.fetch=async(url,options)=>{
    if(options.headers.authorization!=='Bearer synthetic-session')throw Error('SESSION_MISSING');
    const action=new URL(url).pathname.split('/').pop(),mode=process.env.TEST_AUDIT_CASE;
    const source={id:'00000000-0000-4000-8000-000000000003',record_count:1,status:'active'};
    if(action==='inventory'){
     inventories++;
     return Response.json({ok:true,snapshots:[{...source,...(mode==='changed'&&inventories>1?{status:'archived'}:{})}],pendingSnapshots:mode==='pending'?1:0});
    }
    if(action==='copy')return Response.json({ok:true,after:1,count:1});
    if(action==='seal')return Response.json({ok:true,count:1,checksum});
    if(action==='audit'){audits++;return Response.json({ok:true,after:1,count:1,checksum:mode==='corrupt'?'b'.repeat(64):digest,snapshotChecksum:checksum});}
    throw Error('UNEXPECTED_ACTION');
   };
  `);
  const run=(kind)=>{
   const report=join(folder,kind+'.json');
   const result=spawnSync(process.execPath,['--import',preload,'scripts/migrate-sigem-turso.mjs','copy','00000000-0000-4000-8000-000000000001',report],{encoding:'utf8',env:{...process.env,GRCON_ACCESS_TOKEN:'synthetic-session',TEST_AUDIT_CASE:kind}});
   assert.ok(!result.stdout.includes('synthetic-session'));assert.ok(!result.stderr.includes('synthetic-session'));
   return {result,report};
  };
  const success=run('success');assert.equal(success.result.status,0,success.result.stderr);
  const report=JSON.parse(readFileSync(success.report));assert.equal(report.complete,true);assert.equal(report.validatedRecords,1);assert.equal(report.snapshots[0].fullAudit,true);
  for(const kind of ['pending','changed']){const r=run(kind);assert.equal(r.result.status,2,r.result.stderr);assert.equal(JSON.parse(readFileSync(r.report)).complete,false);}
  const corrupt=run('corrupt');assert.notEqual(corrupt.result.status,0);assert.match(corrupt.result.stderr,/AUDIT_HASH_MISMATCH/);
 } finally {rmSync(folder,{recursive:true,force:true});}
 console.log('SIGEM CLI: full audit, checksum mismatch, pending imports and inventory changes passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
