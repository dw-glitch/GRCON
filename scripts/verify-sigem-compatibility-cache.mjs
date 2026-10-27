// Isolated PostgreSQL recovery only. The caller supplies the local recovered DB;
// this module has no network, production credentials or production connection.
import {readFile} from 'node:fs/promises';
import {canonical} from '../cloudflare/sigem-turso.mjs';
export async function verifyCompatibilityCache(pg,source,readRows,proof){
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
  ALTER SCHEMA grcon_sigem_restore_drill RENAME TO private;`);
 const rawBytes=Number((await pg.query("select pg_total_relation_size('private.grcon_sigem_query_rows') n")).rows[0].n);
 await pg.exec(await readFile(new URL('../supabase/migrations/20261027144306_sigem_lossless_compatibility_cache.sql',import.meta.url),'utf8'));
 let after=0;
 while(after<source.record_count){
  const result=(await pg.query('select private.grcon_sigem_cache_batch($1,$2,1000) r',[source.id,after])).rows[0].r;
  if(result.after<=after||result.after>source.record_count)throw Error('RECOVERY_CACHE_CURSOR_INVALID');after=result.after;
 }
 await pg.query('select private.grcon_sigem_cache_release_raw($1,$2)',[source.id,JSON.stringify({id:source.id,count:after,validatedRecords:after,fullAudit:true,checksum:proof.checksum,manifestHash:proof.manifestHash})]);
 let compared=0;
 while(compared<source.record_count){
  const expected=await readRows(compared),actual=(await pg.query('select to_jsonb(r) item from private.grcon_sigem_query_rows r where snapshot_id=$1 and row_number>$2 order by row_number limit 250',[source.id,compared])).rows.map(r=>r.item);
  if(!expected.length||canonical(actual)!==canonical(expected))throw Error('RECOVERY_CACHE_CONTENT_MISMATCH');compared+=expected.length;
 }
 const restored=Number((await pg.query('select private.grcon_sigem_cache_restore_raw($1) n',[source.id])).rows[0].n);
 if(restored!==source.record_count)throw Error('RECOVERY_CACHE_ROLLBACK_MISMATCH');
 return {sqlProjectionValidated:true,compatibilityRowsCompared:compared,operationalRollbackValidated:true,recoveredRawBytes:rawBytes};
}
