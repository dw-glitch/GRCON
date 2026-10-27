// Read-only recovery drill. Corporate bytes remain in a private temporary
// directory and are never included in logs or GitHub artifacts.
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {canonical,sha256} from '../cloudflare/sigem-turso.mjs';
import {restoreBackup} from './restore-sigem-backup.mjs';
import {exportPostgresBackup} from './restore-sigem-postgres.mjs';
const uuid=v=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v||'');
const hash=v=>/^[a-f0-9]{64}$/.test(v||'');
export async function verifyRecovery(config,fetcher=fetch){
 if(!/^[a-f0-9]{32}$/.test(config.account||'')||!config.token||!uuid(config.workspace)||!uuid(config.contract)||!uuid(config.snapshot)||!hash(config.manifestHash))throw Error('RECOVERY_CONFIGURATION_INVALID');
 const prefix=`sigem-backups/v1/${config.workspace}/${config.contract}/${config.snapshot}/`;
 const manifestKey=prefix+'manifest-'+config.manifestHash+'.json';
 const folder=await mkdtemp(join(tmpdir(),'grcon-real-recovery-'));let total=0,db,pg;
 const get=async(key,limit)=>{
  if(!key.startsWith(prefix))throw Error('RECOVERY_SCOPE_INVALID');
  const url=`https://api.cloudflare.com/client/v4/accounts/${config.account}/r2/buckets/grcon-documents/objects/${encodeURIComponent(key)}`;
  const response=await fetcher(url,{headers:{authorization:'Bearer '+config.token},redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(response.status===401||response.status===403?'RECOVERY_R2_ACCESS_DENIED':response.status===404?'RECOVERY_BACKUP_NOT_FOUND':'RECOVERY_R2_UNAVAILABLE');
  const reader=response.body.getReader();const chunks=[];let size=0;
  for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;total+=next.value.byteLength;if(size>limit||total>512*1024*1024){await reader.cancel();throw Error('RECOVERY_SIZE_LIMIT');}chunks.push(next.value);}
  const data=Buffer.concat(chunks),path=join(folder,key);await mkdir(resolve(path,'..'),{recursive:true,mode:0o700});await writeFile(path,data,{flag:'wx',mode:0o600});return data.toString('utf8');
 };
 try{
  const body=await get(manifestKey,1024*1024);
  if(await sha256(body)!==config.manifestHash)throw Error('RECOVERY_MANIFEST_HASH_MISMATCH');
  const manifest=JSON.parse(body),source=manifest.source;
  if(manifest.format!=='grcon-sigem-backup-v1'||manifest.canonicalization!=='sorted-keys-json-v1'||manifest.batchSize!==250||source?.id!==config.snapshot||source.workspace_id!==config.workspace||source.contract_id!==config.contract||!Number.isSafeInteger(source.record_count)||source.record_count<1||source.record_count>100000||manifest.recordCount!==source.record_count||!Array.isArray(manifest.batches)||manifest.batches.length!==Math.ceil(source.record_count/250))throw Error('RECOVERY_MANIFEST_INVALID');
  let after=0;
  for(const batch of manifest.batches){
   const last=after+Math.min(250,source.record_count-after);
   if(batch.after!==after||batch.last!==last||!hash(batch.checksum)||batch.key!==prefix+`rows-${after+1}-${last}-${batch.checksum}.json`)throw Error('RECOVERY_BATCH_INVALID');
   const bytes=await get(batch.key,16*1024*1024);
   if(await sha256(bytes)!==batch.checksum)throw Error('RECOVERY_BATCH_HASH_MISMATCH');after=last;
  }
  const restored=await restoreBackup(folder,manifestKey,config.manifestHash,join(folder,'restored.sqlite'));
  await exportPostgresBackup(folder,manifestKey,config.manifestHash,join(folder,'restore.sql'),'grcon_sigem_restore_drill');
  pg=new PGlite();await pg.exec(await readFile(join(folder,'restore.sql'),'utf8'));
  const recovered=(await pg.query('select source_json from grcon_sigem_restore_drill.recovery_manifest')).rows[0];
  if(canonical(recovered?.source_json)!==canonical(source))throw Error('RECOVERY_METADATA_MISMATCH');
  const typed=(await pg.query('select to_jsonb(s) item from grcon_sigem_restore_drill.grcon_sigem_query_snapshots s')).rows[0]?.item;
  for(const key of Object.keys(source)){
   const expected=source[key],actual=typed?.[key];
   if(['created_at','published_at','deleted_at'].includes(key)&&expected!==null){if(new Date(actual).toISOString()!==new Date(expected).toISOString())throw Error('RECOVERY_METADATA_MISMATCH');}
   else if(canonical(actual)!==canonical(expected))throw Error('RECOVERY_METADATA_MISMATCH');
  }
  db=new DatabaseSync(join(folder,'restored.sqlite'),{readOnly:true});let compared=0;
  while(compared<source.record_count){
   const rows=db.prepare('select row_json from sigem_rows where row_number>? order by row_number limit 250').all(compared).map(r=>JSON.parse(r.row_json));
   const actual=(await pg.query('select to_jsonb(r) item from grcon_sigem_restore_drill.grcon_sigem_query_rows r where row_number>$1 order by row_number limit 250',[compared])).rows.map(r=>r.item);
   if(!rows.length||canonical(actual)!==canonical(rows))throw Error('RECOVERY_POSTGRES_CONTENT_MISMATCH');compared+=rows.length;
  }
  return {ok:true,snapshot:config.snapshot,records:restored.records,checksum:restored.checksum,manifestHash:config.manifestHash,postgresRowsCompared:compared,sourceMetadataPreserved:true,liveDatabaseModified:false};
 }finally{if(db)db.close();if(pg)await pg.close();await rm(folder,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const result=await verifyRecovery({account:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN,workspace:process.env.GRCON_RECOVERY_WORKSPACE,contract:process.env.GRCON_RECOVERY_CONTRACT,snapshot:process.env.GRCON_RECOVERY_SNAPSHOT,manifestHash:process.env.GRCON_RECOVERY_MANIFEST_HASH});
  await mkdir('artifacts/sigem-recovery',{recursive:true});await writeFile('artifacts/sigem-recovery/summary.json',JSON.stringify({...result,verifiedAt:new Date().toISOString()},null,2),{mode:0o600});console.log(JSON.stringify(result));
 }catch(error){console.error(/^[A-Z0-9_]{1,80}$/.test(error.message)?error.message:'RECOVERY_FAILED');process.exitCode=1;}
}
