'use strict';
const assert=require('node:assert/strict');
(async()=>{
 const {documentInventory,purgeDocumentBatch,purgeSigemBase}=await import('../cloudflare/storage-retirement.mjs');
 const w='00000000-0000-4000-8000-000000000001',c='00000000-0000-4000-8000-000000000002',s='00000000-0000-4000-8000-000000000003',prefix=`workspaces/${w}/documents/`;
 const objects=new Map(Array.from({length:2607},(_,i)=>[prefix+i,{key:prefix+i,size:100}]));
 const preserved=[`sigem-backups/v1/${w}/${c}/${s}/manifest.json`,`sigem-migration-jobs/v1/${w}/latest.json`,`operations/${w}/result.xlsx`,`workspaces/other/documents/1`];
 for(const key of preserved)objects.set(key,{key,size:200});
 let aborted=0,abortError=false,deleteError=false;
 const bucket={list:async({prefix,limit,cursor})=>{const rows=[...objects.values()].filter(r=>r.key.startsWith(prefix));const start=Number(cursor)||0;return {objects:rows.slice(start,start+limit),truncated:rows.length>start+limit,cursor:String(start+limit)};},delete:async keys=>{if(deleteError)throw Error('delete unavailable');for(const k of keys)objects.delete(k);},resumeMultipartUpload:()=>({abort:async()=>{if(abortError)throw Error('network');if(aborted++)throw Error('NoSuchUpload (10024)');}})};
 assert.deepEqual(await documentInventory(bucket,prefix),{objects:2607,bytes:260700});
 await assert.rejects(purgeDocumentBatch(bucket,{prefix:'sigem-backups/v1/'}),/SCOPE_INVALID/);
 await assert.rejects(purgeDocumentBatch(bucket,{prefix,multipart:[{key:preserved[0],id:'upload'}]}),/SCOPE_INVALID/);
 const scope={prefix,multipart:[{key:prefix+'pending',id:'upload'}]};
 abortError=true;await assert.rejects(purgeDocumentBatch(bucket,scope),/ABORT_FAILED/);assert.equal(objects.size,2611,'failed cancellation prevents deletion');abortError=false;
 deleteError=true;await assert.rejects(purgeDocumentBatch(bucket,scope),/unavailable/);deleteError=false;
 let result,total=0;do{result=await purgeDocumentBatch(bucket,scope);total+=result.deleted;}while(!result.complete);
 assert.equal(total,2607);assert.deepEqual([...objects.keys()],preserved,'purging document storage cannot touch migration backups or unrelated namespaces');
 assert.equal((await purgeDocumentBatch(bucket,scope)).complete,true,'a successful purge can be retried');
 const sql=[];const db={execute:async(statement,args=[])=>{sql.push({statement,args});return {rows:statement.startsWith('SELECT name')?[{name:args[0]||'sigem_live_uploads'}]:[]};}};
 await purgeSigemBase(db,bucket,{workspace_id:w,contract_id:c,id:s});
 assert.ok(sql.filter(q=>q.statement.startsWith('DELETE')).every(q=>q.args.join('/')===[w,c,s].join('/')),'base removal is scoped to all three identity fields');
 assert.ok(!objects.has(preserved[0]));assert.ok(objects.has(preserved[1]));

 const {retireDocuments}=await import('../scripts/retire-document-storage.mjs');
 let rounds=0;
 const retired=await retireDocuments({token:'synthetic',fetcher:async(url,options)=>{
  assert.equal(new URL(url).pathname,'/api/document-vault/retire-legacy-storage');assert.equal(options.headers.authorization,'Bearer synthetic');rounds++;
  return Response.json({ok:true,deleted:rounds===1?1000:607,bytes:rounds===1?100000:60700,complete:rounds===2});
 }});
 assert.deepEqual(retired,{ok:true,complete:true,deletedObjects:1607,deletedBytes:160700});
 await assert.rejects(retireDocuments({token:'synthetic',fetcher:async()=>Response.json({ok:false},{status:403})}),/R2_RETIREMENT_FAILED/);
 console.log('storage_retirement: 2607 objects, exact prefix boundaries, backup preservation, multipart retries, failure handling and scoped base removal passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
