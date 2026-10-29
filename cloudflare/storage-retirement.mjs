import {fail} from './sigem-turso.mjs';
export async function documentInventory(bucket,prefix){
 if(!/^workspaces\/[a-f0-9-]{36}\/documents\/$/i.test(prefix)||!bucket)throw fail('DOCUMENT_RETIREMENT_SCOPE_INVALID');
 let cursor,objects=0,bytes=0;
 for(let page=0;page<100;page++){
  const result=await bucket.list({prefix,limit:1000,...(cursor?{cursor}:{})});
  for(const item of result.objects){if(!item.key.startsWith(prefix))throw fail('DOCUMENT_RETIREMENT_SCOPE_INVALID');objects++;bytes+=item.size;}
  if(!result.truncated)return {objects,bytes};cursor=result.cursor;
 }
 throw fail('DOCUMENT_RETIREMENT_INVENTORY_LIMIT');
}
export async function purgeDocumentBatch(bucket,scope){
 const prefix=scope.prefix;
 if(!/^workspaces\/[a-f0-9-]{36}\/documents\/$/i.test(prefix)||!bucket)throw fail('DOCUMENT_RETIREMENT_SCOPE_INVALID');
 // Only the former vault prefix is addressable. No caller-supplied object keys,
 // bucket-wide deletion, migration backup or operation-journal deletion.
 for(const upload of scope.multipart||[]){
  if(!upload.key.startsWith(prefix)||!upload.id)throw fail('DOCUMENT_RETIREMENT_SCOPE_INVALID');
  try { await bucket.resumeMultipartUpload(upload.key,upload.id).abort(); }
  catch(error) { if(!/\b10024\b|\bNoSuchUpload\b/.test(String(error?.message||'')))throw fail('DOCUMENT_MULTIPART_ABORT_FAILED',503); }
 }
 const result=await bucket.list({prefix,limit:1000});
 const keys=result.objects.map(o=>o.key);
 if(keys.some(key=>!key.startsWith(prefix)))throw fail('DOCUMENT_RETIREMENT_SCOPE_INVALID');
 if(keys.length)await bucket.delete(keys);
 const check=await bucket.list({prefix,limit:1});
 return {deleted:keys.length,bytes:result.objects.reduce((n,o)=>n+o.size,0),complete:check.objects.length===0};
}
export async function purgeSigemBase(db,bucket,source){
 const args=[source.workspace_id,source.contract_id,source.id];
 // All stores are idempotently removed after Postgres has tombstoned the base.
 // The active-base guard lives inside the serialized Postgres operation.
 for(const [table,idColumn] of [['sigem_rows','snapshot_id'],['sigem_import_jobs','snapshot_id'],['sigem_snapshots','id'],['sigem_live_rows','snapshot_id'],['sigem_live_batches','snapshot_id'],['sigem_live_uploads','id']]){
  const present=(await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?",[table])).rows.length;
  if(present)await db.execute(`DELETE FROM ${table} WHERE workspace_id=? AND contract_id=? AND ${idColumn}=?`,args);
 }
 const prefix=`sigem-backups/v1/${args.join('/')}/`;
 for(let i=0;i<5;i++){
  const page=await bucket.list({prefix,limit:1000});
  if(page.objects.some(o=>!o.key.startsWith(prefix)))throw fail('SIGEM_RETIREMENT_SCOPE_INVALID');
  if(page.objects.length)await bucket.delete(page.objects.map(o=>o.key));
  if(!page.truncated)return {complete:true};
 }
 return {complete:false};
}
