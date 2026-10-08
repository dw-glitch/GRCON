const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const sql = fs.readFileSync(require.resolve('../supabase/migrations/20261006143737_shared_allocation_registry.sql'),'utf8');
const fiscalSql = fs.readFileSync(require.resolve('../supabase/migrations/20261008123900_consultas_fiscal01_comments.sql'),'utf8');
const workspace='00000000-0000-0000-0000-000000000001', other='00000000-0000-0000-0000-000000000002';
const owner='00000000-0000-0000-0000-000000000010', operator='00000000-0000-0000-0000-000000000011';
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema private; create schema auth; create role anon; create role authenticated;
   grant usage on schema private,public,auth to authenticated;
   create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create table public.grcon_workspaces(id uuid primary key);
   create table public.grcon_audit_events(workspace_id uuid,actor_id uuid,action text,entity_type text,entity_id text,metadata jsonb);
   create function private.grcon_is_member(w uuid) returns boolean language sql as $$ select w='${workspace}'::uuid and auth.uid() in ('${owner}'::uuid,'${operator}'::uuid) $$;
   create function private.grcon_has_role(w uuid,roles text[]) returns boolean language sql as $$ select w='${workspace}'::uuid and auth.uid()='${owner}'::uuid and 'owner'=any(roles) $$;
   insert into public.grcon_workspaces values('${workspace}'),('${other}');`);
  await db.exec(sql);await db.exec(sql); // Migration may be safely re-applied.
  await db.exec(fiscalSql);await db.exec(fiscalSql); // Aditiva e idempotente.
  async function as(user,role='authenticated'){await db.exec(`reset role; set request.jwt.claim.sub='${user}'; set role ${role};`);}
  const current=()=>db.query('select * from public.grcon_allocation_registry_current($1)',[workspace]);
  const begin=(count,active=null)=>db.query('select public.grcon_allocation_registry_begin($1,$2,$3,$4,$5) as id',[workspace,'Controle-QA.xlsx',count,{version:'1.0.0',sheetName:'Central de alocação'},active]).then(r=>r.rows[0].id);
  const record=n=>({document:'DOC-000'+n,allocation:'QA-ALOC-'+n,allocationStatus:'CONCLUÍDA',sourceRow:7+n});
  const chunk=(id,first,rows)=>db.query('select public.grcon_allocation_registry_chunk($1,$2,$3,$4)',[workspace,id,first,rows]);
  const publish=id=>db.query('select public.grcon_allocation_registry_publish($1,$2) as id',[workspace,id]);
  await as(owner);assert.equal((await current()).rows.length,0);
  const id=await begin(2);await chunk(id,1,[record(1)]);
  await assert.rejects(publish(id),/Carga incompleta/);assert.equal((await current()).rows.length,0);
  await chunk(id,1,[{...record(1),fiscalComment:'Liberado pela fiscalização.\\nRevisão Á'}]); // Retry replaces the same pending position.
  await assert.rejects(chunk(id,2,[{...record(2),unexpected:'data'}]),/campos inválidos/);
  await assert.rejects(chunk(id,2,[{...record(2),fiscalComment:'x'.repeat(8193)}]),/campos inválidos/);
  await assert.rejects(chunk(id,2,[{...record(2),sourceRow:1.2}]),/campos inválidos/);
  await assert.rejects(chunk(id,2,[{...record(2),sourceRow:1048577}]),/campos inválidos/);
  await chunk(id,2,[record(2)]);await publish(id);assert.equal((await current()).rows[0].record_count,2);
  assert.equal((await publish(id)).rows[0].id,id,'publication retry is idempotent');
  const conflict=await begin(1,null);await chunk(conflict,1,[record(3)]);await assert.rejects(publish(conflict),/Outro usuário publicou/);
  assert.equal((await current()).rows[0].snapshot_id,id,'failed CAS keeps the previous snapshot');
  await as(operator);await assert.rejects(begin(1,id),/proprietário/);
  assert.equal((await current()).rows[0].snapshot_id,id);
  const page=await db.query('select * from public.grcon_allocation_registry_page($1,$2,$3,$4)',[workspace,id,0,1]);assert.equal(page.rows.length,1);assert.equal(page.rows[0].row_number,1);
  await assert.rejects(db.query('select * from public.grcon_allocation_registry_current($1)',[other]),/Sem acesso/);
  await assert.rejects(db.query('select * from private.grcon_allocation_registry_rows'),/permission denied/);
  await as('', 'anon');await assert.rejects(current(),/permission denied/);
  await as('');await assert.rejects(current(),/Sem acesso/);
  await as(owner);const replacement=await begin(1,id);await chunk(replacement,1,[record(3)]);await publish(replacement);
  assert.equal((await current()).rows[0].snapshot_id,replacement);
  const retained=await db.query('select * from public.grcon_allocation_registry_page($1,$2,$3,$4)',[workspace,id,0,1000]);assert.equal(retained.rows.length,2,'an in-flight reader can finish the previous snapshot');
  await db.exec('reset role');assert.equal((await db.query('select count(*)::integer as count from public.grcon_audit_events')).rows[0].count,2);
  console.log('Allocation registry database: private tables, member reads, owner publishing, partial loads, retries, CAS, atomic replacement and audit passed.');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
