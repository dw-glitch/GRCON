import {readFile,stat,realpath,link,unlink,chmod} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {canonical,sha256,ZERO_HASH,chainHash,SCHEMA} from '../cloudflare/sigem-turso.mjs';
export async function restoreBackup(root, manifestKey, manifestHash, output) {
 const base=await realpath(resolve(root)),destination=resolve(output);
 const safe=async key=>{const path=resolve(base,key);if(!path.startsWith(base+sep))throw Error('BACKUP_PATH_INVALID');const physical=await realpath(path);if(!physical.startsWith(base+sep))throw Error('BACKUP_PATH_INVALID');return physical;};
 const body=await readFile(await safe(manifestKey),'utf8');
 if (!/^[a-f0-9]{64}$/.test(manifestHash)||await sha256(body)!==manifestHash)throw Error('MANIFEST_HASH_MISMATCH');
 const manifest=JSON.parse(body),source=manifest.source;
 if(manifest.format!=='grcon-sigem-backup-v1'||manifest.canonicalization!=='sorted-keys-json-v1'||manifest.batchSize!==250||manifest.recordCount!==source.record_count||!Array.isArray(manifest.batches))throw Error('MANIFEST_FORMAT_INVALID');
 try {await stat(destination);throw Error('OUTPUT_EXISTS');}catch(error){if(error.code!=='ENOENT')throw error;}
 const partial=destination+'.partial-'+crypto.randomUUID(),db=new DatabaseSync(partial);
 let closed=false;
 try {
  await chmod(partial,0o600);
  db.exec('PRAGMA foreign_keys=ON');for(const sql of SCHEMA)db.exec(sql);
  db.prepare('INSERT INTO sigem_snapshots(workspace_id,contract_id,id,source_json,expected_count) VALUES(?,?,?,?,?)').run(source.workspace_id,source.contract_id,source.id,canonical(source),source.record_count);
  const insert=db.prepare('INSERT INTO sigem_rows(workspace_id,contract_id,snapshot_id,row_number,document_key,revision_key,status_normalized,row_json) VALUES(?,?,?,?,?,?,?,?)');
  let after=0,digest=ZERO_HASH;
  for(const batch of manifest.batches){
   if(batch.after!==after||batch.last!==after+Math.min(250,source.record_count-after)||!batch.key.startsWith(`sigem-backups/v1/${source.workspace_id}/${source.contract_id}/${source.id}/`))throw Error('BACKUP_SEQUENCE_INVALID');
   const bytes=await readFile(await safe(batch.key),'utf8');if(await sha256(bytes)!==batch.checksum)throw Error('BACKUP_HASH_MISMATCH');
   const rows=JSON.parse(bytes);if(rows.length!==batch.last-after||canonical(rows)!==bytes)throw Error('BACKUP_CONTENT_INVALID');
   db.exec('BEGIN');
   for(const row of rows){if(row.snapshot_id!==source.id||row.row_number!==++after)throw Error('BACKUP_ROW_INVALID');insert.run(source.workspace_id,source.contract_id,source.id,row.row_number,row.document_key,row.revision_key,row.status_normalized,canonical(row));}
   db.exec('COMMIT');digest=await chainHash(digest,rows);
  }
  if(after!==source.record_count||digest!==manifest.checksum)throw Error('SNAPSHOT_HASH_MISMATCH');
  db.prepare("UPDATE sigem_snapshots SET state='verified',checksum=?,verified_at=?").run(digest,new Date().toISOString());
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('SQLITE_INTEGRITY_FAILED');
  db.close();closed=true;await link(partial,destination);await unlink(partial);return {records:after,checksum:digest};
 }catch(error){if(!closed)db.close();await unlink(partial).catch(()=>{});throw error;}
}
if(process.argv[1]&&import.meta.url===new URL('file://'+resolve(process.argv[1])).href){
 if(process.argv.length!==6)throw Error('Usage: node scripts/restore-sigem-backup.mjs <backup-root> <manifest-key> <manifest-sha256> <new-output.sqlite>');
 console.log(JSON.stringify(await restoreBackup(...process.argv.slice(2))));
}

