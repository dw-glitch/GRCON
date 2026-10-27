// Real PostgreSQL semantics: complete row fidelity, tenant boundaries, interrupted
// preparation, collision handling, authorization and existing page RPC behavior.
const assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
(async()=>{const pg=new PGlite();try{
 await pg.exec(`create schema private;create schema auth;create role anon;create role authenticated;create role service_role;
 grant usage on schema private,auth to authenticated,service_role;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function private.grcon_is_member(w uuid) returns boolean language sql as $$select w='${id(1)}'::uuid and auth.uid()='${id(9)}'::uuid$$;
 create table private.grcon_sigem_query_snapshots(id uuid primary key,workspace_id uuid,contract_id uuid,status text,record_count integer,deleted_at timestamptz,metadata jsonb default '{}');
 create table private.grcon_sigem_query_rows(snapshot_id uuid references private.grcon_sigem_query_snapshots(id),row_number integer,payload jsonb,document_key text,revision_key text,status_original text,status_normalized text,title text,discipline text,primary key(snapshot_id,row_number));
 alter table private.grcon_sigem_query_rows enable row level security;
 create function private.grcon_sigem_query_chunk(target_workspace uuid,upload_id uuid,first_row integer,rows jsonb) returns integer language plpgsql security definer set search_path='' as $$begin
  insert into private.grcon_sigem_query_rows(snapshot_id,row_number,payload) select upload_id,first_row+n::int-1,r from jsonb_array_elements(rows) with ordinality t(r,n) on conflict(snapshot_id,row_number) do update set payload=excluded.payload;
  return (select count(*)::integer from private.grcon_sigem_query_rows where snapshot_id=upload_id);
 end$$;
 create function private.grcon_sigem_storage_control() returns bigint language sql as $$select pg_total_relation_size('private.grcon_sigem_query_rows')$$;
 insert into private.grcon_sigem_query_snapshots values('${id(3)}','${id(1)}','${id(2)}','archived',513,null,'{}'),('${id(4)}','${id(1)}','${id(2)}','active',513,null,'{}'),('${id(5)}','${id(11)}','${id(12)}','archived',513,null,'{}');`);
 await pg.exec(fs.readFileSync(require('node:path').join(__dirname,'fixtures/sigem-page-before-cache.sql'),'utf8'));
 await pg.exec(`grant execute on function private.grcon_sigem_query_page(uuid,uuid,integer,integer) to authenticated;`);
 const payloads=Array.from({length:513},(_,i)=>({document:'DOC-'+i,revision:'0',status:'Em workflow',title:"Título O'Brien 漢字",sourceRow:i+6,id:'DOC-'+i+'|0|'+(i+6),extra:{keep:[null,false,0,'']}}));
 Object.assign(payloads[501],{id:null,sourceRow:null});delete payloads[502].id;delete payloads[502].sourceRow;
 payloads[503].id='CUSTOM';payloads[504].sourceRow='509';payloads[505].sourceRow=-1;
 payloads[506].sourceRow=1.25;payloads[507].sourceRow=99999999999;
 payloads[508].id={nested:'keep'};payloads[509].sourceRow={nested:'keep'};
 payloads[510].observation=';DROP SCHEMA private; --';payloads[511].sourceRow=0;payloads[511].id='DOC-511|0|0';
 const originals=new Map();
 for(const snapshot of [id(3),id(4),id(5)]){
  const rows=payloads.map((p,i)=>({snapshot_id:snapshot,row_number:i+1,payload:{...p,sourceRow:typeof p.sourceRow==='number'&&p.sourceRow>=6&&Number.isInteger(p.sourceRow)?p.sourceRow+(snapshot===id(4)?100:0):p.sourceRow},document_key:'DOC-'+i,revision_key:'0',status_original:'Em workflow',status_normalized:'em_analise',title:p.title,discipline:i===512?null:'CV'}));
  for(let i=0;i<rows.length;i++){if(!Object.hasOwn(payloads[i],'sourceRow'))delete rows[i].payload.sourceRow;if(snapshot===id(4)&&i<501)rows[i].payload.id='DOC-'+i+'|0|'+rows[i].payload.sourceRow;}
  originals.set(snapshot,rows);
  await pg.query('insert into private.grcon_sigem_query_rows select * from jsonb_populate_recordset(null::private.grcon_sigem_query_rows,$1)',[JSON.stringify(rows)]);
 }
 await pg.exec(fs.readFileSync('supabase/migrations/20261027144306_sigem_lossless_compatibility_cache.sql','utf8'));
 const viewRows=async snapshot=>(await pg.query('select * from private.grcon_sigem_query_rows where snapshot_id=$1 order by row_number',[snapshot])).rows;
 const batch=(snapshot,after,size=100)=>(pg.query('select private.grcon_sigem_cache_batch($1,$2,$3) r',[snapshot,after,size])).then(r=>r.rows[0].r);
 assert.deepEqual(await viewRows(id(3)),originals.get(id(3)),'DDL alone preserves every original row');
 for(const role of ['anon','authenticated','service_role']){
  await pg.exec('set role '+role);
  await assert.rejects(batch(id(3),0),/permission denied/);
  await assert.rejects(pg.query('select * from private.grcon_sigem_query_rows'),/permission denied/);
  await pg.exec('reset role');
 }
 await batch(id(3),0);assert.deepEqual(await viewRows(id(3)),originals.get(id(3)),'incomplete preparation keeps original reads');
 assert.equal((await batch(id(3),0)).after,100,'replayed batch cannot duplicate rows');
 await assert.rejects(batch(id(3),200),/CURSOR_INVALID/);
 for(const snapshot of [id(3),id(4),id(5)]){
  let after=snapshot===id(3)?100:0;while(after<513)after=(await batch(snapshot,after)).after;
  assert.deepEqual(await viewRows(snapshot),originals.get(snapshot),'projection reconstructs every original field and JSON value');
 }
 const n=(await pg.query('select count(*)::integer n from private.grcon_sigem_row_contents')).rows[0].n;
 assert.equal(n,1026,'same-contract content is reused while different contracts stay separate');
 const proof={id:id(3),count:513,validatedRecords:513,fullAudit:true,checksum:'a'.repeat(64),manifestHash:'b'.repeat(64)};
 const release=proof=>pg.query('select private.grcon_sigem_cache_release_raw($1,$2) n',[id(3),JSON.stringify(proof)]);
 await assert.rejects(release({...proof,fullAudit:false}),/AUDIT_REQUIRED/);
 assert.equal((await release(proof)).rows[0].n,513);
 assert.deepEqual(await viewRows(id(3)),originals.get(id(3)),'raw removal cannot change any legacy SQL read');
 assert.equal((await pg.query('select private.grcon_sigem_cache_restore_raw($1) n',[id(3)])).rows[0].n,513);
 assert.deepEqual(await viewRows(id(3)),originals.get(id(3)),'operational rollback reconstructs the original raw representation');
 await pg.exec(`set request.jwt.claim.sub='${id(9)}';set role authenticated;`);
 const page=(await pg.query('select * from private.grcon_sigem_query_page($1,$2,500,1000)',[id(1),id(3)])).rows;
 assert.deepEqual(page,originals.get(id(3)).slice(500).map(r=>({row_number:r.row_number,payload:r.payload})));
 await assert.rejects(pg.query('select * from private.grcon_sigem_query_page($1,$2,0,1000)',[id(1),id(5)]),/indisponível/);
 await pg.exec('reset role');
 // Existing pending-upload writer must still support ON CONFLICT against a table.
 await pg.exec(`insert into private.grcon_sigem_query_snapshots values('${id(6)}','${id(1)}','${id(2)}','pending',0,null,'{}');`);
 const chunk="select private.grcon_sigem_query_chunk($1,$2,1,$3) n";
 assert.equal((await pg.query(chunk,[id(1),id(6),'[{"document":"DOC-PENDING"}]'])).rows[0].n,1);
 assert.equal((await pg.query(chunk,[id(1),id(6),'[{"document":"DOC-UPDATED"}]'])).rows[0].n,1);
 assert.equal((await viewRows(id(6)))[0].payload.document,'DOC-UPDATED');
 // A deliberately forged digest entry must never merge unequal rows.
 await pg.exec(`insert into private.grcon_sigem_query_snapshots values('${id(7)}','${id(1)}','${id(2)}','archived',1,null,'{}');
  insert into private.grcon_sigem_raw_rows select '${id(7)}'::uuid,row_number,payload,document_key,revision_key,status_original,status_normalized,title,discipline from private.grcon_sigem_raw_rows where snapshot_id='${id(3)}' and row_number=1;
  update private.grcon_sigem_row_contents set row_content=jsonb_set(row_content,'{title}','"CORRUPT"') where id=(select content_id from private.grcon_sigem_row_map where snapshot_id='${id(3)}' and row_number=1);`);
 await assert.rejects(batch(id(7),0),/HASH_COLLISION/);
 assert.equal((await pg.query('select count(*)::integer n from private.grcon_sigem_row_map where snapshot_id=$1',[id(7)])).rows[0].n,0);
 // A changed raw row or a forged cached row must fail before raw removal.
 await pg.exec(`update private.grcon_sigem_raw_rows set title='CHANGED' where snapshot_id='${id(4)}' and row_number=1`);
 await assert.rejects(pg.query('select private.grcon_sigem_cache_release_raw($1,$2)',[id(4),JSON.stringify({...proof,id:id(4)})]),/CONTENT_MISMATCH/);
 assert.equal((await pg.query('select count(*)::integer n from private.grcon_sigem_raw_rows where snapshot_id=$1',[id(4)])).rows[0].n,513);
 console.log('SIGEM compatibility cache: PostgreSQL lossless projection, 1539 complete rows, JSON edge values, tenant isolation, replay, existing page/write RPCs and guarded raw release passed.');
}finally{await pg.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
