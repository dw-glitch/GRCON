'use strict';
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),fs=require('node:fs');
(async()=>{
 const T=await import('../cloudflare/sigem-turso.mjs'),{verifyRecovery}=await import('../scripts/verify-sigem-r2-recovery.mjs');
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const source={id:id(3),workspace_id:id(1),contract_id:id(2),file_name:'Base sintética.xlsx',expected_count:501,record_count:501,metadata:{description:'Símbolos 漢字'},expected_active:null,status:'archived',created_by:id(4),created_at:'2026-10-23T10:00:00+00:00',published_at:'2026-10-23T10:01:00+00:00',version:1,fingerprint:'synthetic',previous_snapshot_id:null,comparison_id:null,deleted_at:null,deleted_by:null};
 const rows=Array.from({length:501},(_,i)=>({snapshot_id:source.id,row_number:i+1,document_key:'DOC'+i,revision_key:'0',status_original:'Em análise',status_normalized:'em_analise',title:'SENTINEL_PRIVATE_CONTENT_'+i,discipline:'CV',payload:{document:'DOC-'+i,revision:'0',title:'Texto é 漢字',observation:"Aspas ' SQL; --"}}));
 const objects=new Map(),bucket={put:async(k,v)=>objects.set(k,String(v)),get:async k=>objects.has(k)?{text:async()=>objects.get(k)}:null,head:async k=>objects.has(k)?{}:null};
 const sqlite=new DatabaseSync(':memory:');
 const db={execute:async(sql,args=[])=>{const q=sqlite.prepare(sql);return q.columns().length?{rows:q.all(...args)}:{rows:[],affected:q.run(...args).changes};}};
 try{
  await T.initialize(db);await T.beginSnapshot(db,source);
  for(let after=0;after<501;after+=250)await T.copyPage(db,bucket,source,after,rows.slice(after,after+250));
  const sealed=await T.sealSnapshot(db,bucket,source),config={account:'a'.repeat(32),token:'SYNTHETIC_TOKEN_NOT_LOGGED',workspace:source.workspace_id,contract:source.contract_id,snapshot:source.id,manifestHash:sealed.manifestHash};
  const requests=[];let corrupt=false;
  const fetcher=async(url,options)=>{
   const target=new URL(url);assert.equal(target.origin,'https://api.cloudflare.com');assert.doesNotMatch(target.pathname,/%2f/i,'R2 object path separators must remain literal');assert.equal(options.redirect,'manual');assert.equal(options.headers.authorization,'Bearer '+config.token);
   const key=decodeURIComponent(target.pathname.split('/objects/')[1]);requests.push(key);let body=objects.get(key);
   if(corrupt&&key.includes('/rows-'))body+=' ';
   return new Response(body,{status:body?200:404});
  };
  const result=await verifyRecovery(config,fetcher);assert.equal(result.records,501);assert.equal(result.postgresRowsCompared,501);assert.equal(result.sourceMetadataPreserved,true);assert.equal(result.liveDatabaseModified,false);
  assert.equal(JSON.stringify(result).includes('SENTINEL_PRIVATE_CONTENT'),false);assert.equal(JSON.stringify(result).includes(config.token),false);
  assert.equal(requests.length,4,'one manifest and three complete batches');
  const compatibility=await verifyRecovery({...config,verifyCompatibility:true},fetcher);assert.equal(compatibility.sqlProjectionValidated,true);assert.equal(compatibility.compatibilityRowsCompared,501);assert.equal(compatibility.operationalRollbackValidated,true);assert.equal(compatibility.liveDatabaseModified,false);
  corrupt=true;await assert.rejects(verifyRecovery(config,fetcher),/RECOVERY_BATCH_HASH_MISMATCH/);corrupt=false;
  await assert.rejects(verifyRecovery({...config,account:'https://evil.example'},fetcher),/CONFIGURATION_INVALID/);
  await assert.rejects(verifyRecovery(config,async()=>new Response('access denied',{status:403})),/RECOVERY_R2_ACCESS_DENIED/);
  let redirects=0;await assert.rejects(verifyRecovery(config,async()=>{redirects++;return new Response(null,{status:302,headers:{location:'https://evil.example'}});}),/RECOVERY_R2_UNAVAILABLE/);assert.equal(redirects,1);
  const manifest=JSON.parse(objects.get(sealed.manifestKey));manifest.batches[0].key='../outside.json';
  const bytes=T.canonical(manifest),manifestHash=await T.sha256(bytes),newKey=sealed.manifestKey.replace(sealed.manifestHash,manifestHash);objects.set(newKey,bytes);
  await assert.rejects(verifyRecovery({...config,manifestHash},fetcher),/RECOVERY_BATCH_INVALID/);
  const workflow=fs.readFileSync(require('node:path').join(__dirname,'../.github/workflows/verify-sigem-recovery.yml'),'utf8');
  assert.match(workflow,/workflow_dispatch:/);assert.match(workflow,/path: artifacts\/sigem-recovery\/summary.json/);assert.doesNotMatch(workflow,/pull_request:|path:.*(?:sqlite|restore.sql)/);
 }finally{sqlite.close();}
 console.log('SIGEM recovery drill: real SQLite and PostgreSQL restoration, full row/metadata comparison, scoped R2 reads, corrupt backup, redirects, permissions and summary-only artifact passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
