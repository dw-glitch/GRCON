// Offline recovery artifact only. Never connects to PostgreSQL or changes the
// operational pointer. Execute the reviewed SQL only in an isolated database.
import {open, link, unlink, mkdtemp, rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {restoreBackup} from './restore-sigem-backup.mjs';
import {canonical} from '../cloudflare/sigem-turso.mjs';

const snapshotColumns = {
 id:'uuid PRIMARY KEY', workspace_id:'uuid NOT NULL', file_name:'text NOT NULL',
 expected_count:'integer NOT NULL', record_count:'integer NOT NULL', metadata:'jsonb NOT NULL',
 expected_active:'uuid', status:'text NOT NULL', created_by:'uuid NOT NULL',
 created_at:'timestamptz NOT NULL', published_at:'timestamptz', contract_id:'uuid NOT NULL',
 version:'integer', fingerprint:'text', previous_snapshot_id:'uuid', comparison_id:'uuid',
 deleted_at:'timestamptz', deleted_by:'uuid',
};
const rowColumns = {
 snapshot_id:'uuid NOT NULL', row_number:'integer NOT NULL CHECK(row_number > 0)', payload:'jsonb NOT NULL',
 document_key:'text', revision_key:'text', status_original:'text', status_normalized:'text', title:'text', discipline:'text',
};
function knownFields(value, columns) {
 if(Object.keys(value).some(key=>!Object.hasOwn(columns,key)))throw Error('POSTGRES_SCHEMA_CHANGED');
 for(const [key,type] of Object.entries(columns)) {
  if((type.includes('NOT NULL')||type.includes('PRIMARY KEY'))&&value[key]==null)throw Error('POSTGRES_REQUIRED_FIELD_MISSING');
 }
}
function jsonLiteral(value) {
 const body=canonical(value);let delimiter;
 do {delimiter='$grcon_'+crypto.randomUUID().replaceAll('-','')+'$';} while(body.includes(delimiter));
 return delimiter+body+delimiter+'::jsonb';
}
function ddl(columns) {return Object.entries(columns).map(([key,type])=>key+' '+type).join(',\n');}

export async function exportPostgresBackup(root, manifestKey, manifestHash, output, schema='grcon_sigem_restore') {
 if(!/^grcon_sigem_restore(?:_[a-z0-9_]{1,32})?$/.test(schema))throw Error('POSTGRES_SCHEMA_INVALID');
 const folder=await mkdtemp(join(tmpdir(),'grcon-sigem-pg-')),destination=resolve(output);
 const partial=destination+'.partial-'+crypto.randomUUID();let db,handle;
 try {
  const restored=await restoreBackup(root,manifestKey,manifestHash,join(folder,'verified.sqlite'));
  db=new DatabaseSync(join(folder,'verified.sqlite'),{readOnly:true});
  const snapshot=db.prepare('SELECT source_json FROM sigem_snapshots').get();
  const source=JSON.parse(snapshot.source_json);knownFields(source,snapshotColumns);
  // wx and link both refuse an existing destination, including concurrent runs.
  handle=await open(partial,'wx',0o600);
  await handle.writeFile(`-- GRCON verified SIGEM recovery. Isolated database only.\n-- Creates a NEW private schema; never replaces live rows or changes active pointers.\nBEGIN;\nSET LOCAL search_path = pg_catalog;\nCREATE SCHEMA ${schema};\nREVOKE ALL ON SCHEMA ${schema} FROM PUBLIC;\nCREATE TABLE ${schema}.grcon_sigem_query_snapshots (${ddl(snapshotColumns)});\nCREATE TABLE ${schema}.grcon_sigem_query_rows (${ddl(rowColumns)}, PRIMARY KEY(snapshot_id,row_number), FOREIGN KEY(snapshot_id) REFERENCES ${schema}.grcon_sigem_query_snapshots(id));\nCREATE TABLE ${schema}.recovery_manifest (manifest_sha256 text NOT NULL, snapshot_checksum text NOT NULL, source_json jsonb NOT NULL, record_count integer NOT NULL);\nREVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM PUBLIC;\nALTER TABLE ${schema}.grcon_sigem_query_snapshots ENABLE ROW LEVEL SECURITY;\nALTER TABLE ${schema}.grcon_sigem_query_rows ENABLE ROW LEVEL SECURITY;\nALTER TABLE ${schema}.recovery_manifest ENABLE ROW LEVEL SECURITY;\nINSERT INTO ${schema}.grcon_sigem_query_snapshots SELECT * FROM jsonb_populate_record(NULL::${schema}.grcon_sigem_query_snapshots, ${jsonLiteral(source)});\n`);
  let after=0;
  while(after<source.record_count) {
   const rows=db.prepare('SELECT row_json FROM sigem_rows WHERE row_number>? ORDER BY row_number LIMIT 250').all(after).map(row=>JSON.parse(row.row_json));
   for(const row of rows)knownFields(row,rowColumns);
   await handle.writeFile(`INSERT INTO ${schema}.grcon_sigem_query_rows SELECT * FROM jsonb_populate_recordset(NULL::${schema}.grcon_sigem_query_rows, ${jsonLiteral(rows)});\n`);
   after+=rows.length;
  }
  await handle.writeFile(`INSERT INTO ${schema}.recovery_manifest VALUES ('${manifestHash}','${restored.checksum}',${jsonLiteral(source)},${restored.records});\nDO $grcon_verify$ BEGIN\n IF (SELECT count(*) FROM ${schema}.grcon_sigem_query_rows) <> ${restored.records} OR (SELECT min(row_number) FROM ${schema}.grcon_sigem_query_rows) <> 1 OR (SELECT max(row_number) FROM ${schema}.grcon_sigem_query_rows) <> ${restored.records} THEN RAISE EXCEPTION 'RECOVERY_COUNT_MISMATCH'; END IF;\nEND $grcon_verify$;\nCOMMIT;\n`);
  await handle.sync();await handle.close();handle=null;db.close();db=null;
  await link(partial,destination);await unlink(partial);
  return {...restored,schema,manifestHash,liveDatabaseModified:false};
 } finally {
  if(handle)await handle.close();if(db)db.close();
  await unlink(partial).catch(()=>{});await rm(folder,{recursive:true,force:true});
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 if(process.argv.length<6||process.argv.length>7)throw Error('Usage: node scripts/restore-sigem-postgres.mjs <backup-root> <manifest-key> <manifest-sha256> <new-output.sql> [grcon_sigem_restore_suffix]');
 console.log(JSON.stringify(await exportPostgresBackup(...process.argv.slice(2))));
}
