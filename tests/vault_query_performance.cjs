'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PGlite}=require('@electric-sql/pglite');
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
(async()=>{
 const pg=new PGlite(),fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/vault-functions-before-20261026.json'),'utf8'));
 try{
  await pg.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
   create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;
   select set_config('request.jwt.claims','{"role":"service_role"}',false);
   create table public.grcon_memberships(workspace_id uuid,user_id uuid,contract_id uuid,role text,active boolean);
   create table public.grcon_contracts(id uuid,workspace_id uuid,active boolean);
   create table public.grcon_profiles(id uuid,display_name text,email text);
   create table private.grcon_allocation_registry_snapshots(id uuid primary key,workspace_id uuid,contract_id uuid,status text,metadata jsonb,published_at timestamptz,created_at timestamptz);
   create table private.grcon_allocation_registry_rows(snapshot_id uuid,row_number integer,payload jsonb,primary key(snapshot_id,row_number));
   create table private.grcon_document_files(id uuid primary key,workspace_id uuid,contract_id uuid,sequence bigint,file_name text,relative_path text,document_code text,identity_code text,revision text,format text,size_bytes bigint,sha256 text,status text,identity_conflict boolean,created_by uuid,created_at timestamptz,verified_at timestamptz,object_key text,file_version integer,previous_file_id uuid,is_active boolean,replaced_at timestamptz,mime_type text,source_context jsonb);
   create table private.grcon_vault_emission_links(file_id uuid,history_id uuid,egrdt_number text,purpose text,emitted_at timestamptz);
   insert into public.grcon_contracts values('${uuid(2)}','${uuid(1)}',true),('${uuid(12)}','${uuid(11)}',true);
   insert into public.grcon_memberships values('${uuid(1)}','${uuid(9)}','${uuid(2)}','owner',true);
   insert into public.grcon_profiles values('${uuid(9)}','Teste','teste@example.invalid');
   insert into private.grcon_allocation_registry_snapshots values('${uuid(3)}','${uuid(1)}','${uuid(2)}','active','{"sheetName":"Central de Alocação"}','2026-10-26','2026-10-26'),('${uuid(13)}','${uuid(11)}','${uuid(12)}','active','{"sheetName":"Central de Alocação"}','2026-10-26','2026-10-26');`);
  const definitions=fixture.map(x=>x.definition);
  for(const name of ['grcon_master_document_key','grcon_vault_central_allocations','grcon_document_vault_list_base','grcon_vault_enrich','grcon_document_vault_list','grcon_document_vault_storage_catalog_base','grcon_document_vault_storage_catalog']){
   await pg.exec(fixture.find(x=>x.name===name).definition);
  }
  for(let i=1;i<=5;i++)await pg.query(`insert into private.grcon_document_files values($1,$2,$3,$4,$5,$5,$6,$6,'0','pdf',1024,'sha','ready',false,$7,'2026-10-26','2026-10-26',$8,1,null,true,null,'application/pdf','{}')`,[uuid(100+i),uuid(1),uuid(2),i,'DOC-'+i+'.pdf','DOC-'+i,uuid(9),'workspaces/'+uuid(1)+'/documents/'+uuid(100+i)]);
  await pg.exec(`insert into private.grcon_allocation_registry_rows values
   ('${uuid(3)}',1,'{"document":"DOC-1","allocation":"ALOC-20"}'),('${uuid(3)}',2,'{"document":"DOC-1","allocation":"ALOC-21"}'),
   ('${uuid(3)}',3,'{"document":"DOC-2","allocation":"NÃO ALOCADO"}'),('${uuid(3)}',4,'{"document":"DOC-3","allocation":"ALOC-23"}'),
   ('${uuid(13)}',1,'{"document":"DOC-1","allocation":"NÃO PODE VAZAR"}');
   insert into private.grcon_vault_emission_links values('${uuid(101)}','${uuid(50)}','1953/2026','Postagem','2026-10-26');`);
  const call=async input=>(await pg.query('select private.grcon_document_vault_list($1,$2,$3) value',[uuid(1),uuid(9),input])).rows[0].value;
  const inputs=[{limit:2},{limit:2,after:2},{allocation:'allocated'},{allocation:'not_allocated'},{allocation:'not_identified'},{q:'ALOC-21'},{q:'DOC-3'},{q:'0'}];
  const before=[];for(const input of inputs)before.push(await call(input));
  const beforeStorage=(await pg.query('select private.grcon_document_vault_storage_catalog_base($1,$2) value',[uuid(1),uuid(9)])).rows[0].value;
  await pg.exec(fs.readFileSync(path.join(__dirname,'../supabase/sql/vault_bounded_allocation_lookup.sql'),'utf8'));
  for(let i=0;i<inputs.length;i++)assert.deepEqual(await call(inputs[i]),before[i],'page, allocation labels, filters, emissions and order must remain identical');
  assert.deepEqual((await pg.query('select private.grcon_document_vault_storage_catalog($1,$2) value',[uuid(1),uuid(9)])).rows[0].value,beforeStorage);
  assert.equal((await pg.query('select * from private.grcon_vault_central_for_keys($1,$2,$3,$4)',[uuid(1),uuid(2),uuid(13),['DOC-1']])).rows.length,0,'other-contract central snapshot must be rejected');
  await assert.rejects(pg.query('select private.grcon_document_vault_list($1,$2,$3)',[uuid(1),uuid(99),{}]),/Sem acesso/);
  // A realistic large Central with a small Cofre page must use the bounded key
  // lookup. A match beyond the first page must still be found by filters.
  await pg.exec(`insert into private.grcon_allocation_registry_rows select '${uuid(3)}',n+100,jsonb_build_object('document','DOC-'||n,'allocation','ALOC-'||n) from generate_series(10,15365)n;
   insert into private.grcon_document_files select md5('file-'||n)::uuid,'${uuid(1)}','${uuid(2)}',n,'DOC-'||n||'.pdf','DOC-'||n||'.pdf','DOC-'||n,'DOC-'||n,'0','pdf',1024,'sha','ready',false,'${uuid(9)}','2026-10-26','2026-10-26','object-'||n,1,null,true,null,'application/pdf','{}' from generate_series(10,1650)n;
   analyze private.grcon_allocation_registry_rows;analyze private.grcon_document_files;`);
  const started=performance.now(),page=await call({limit:50});assert.equal(page.files.length,50);assert.equal(page.has_more,true);assert.equal(page.files[0].emissions.length,1);
  const later=await call({q:'ALOC-1650',limit:50});assert.equal(later.files.length,1);assert.equal(later.files[0].document_code,'DOC-1650');
  assert.equal((await call({allocation:'not_allocated'})).files.length,1);
  console.log('Cofre bounded lookup: 15k Central / 1.6k files, first page and late allocation filter in '+Math.round(performance.now()-started)+' ms (synthetic).');
  await pg.exec(`create or replace function private.grcon_vault_enrich(files jsonb) returns jsonb language plpgsql as $$begin raise exception 'STORAGE_MUST_NOT_ENRICH';end$$;`);
  assert.equal((await pg.query('select jsonb_array_length(private.grcon_document_vault_storage_catalog($1,$2)->\'files\') n',[uuid(1),uuid(9)])).rows[0].n,1646);
 }finally{await pg.close();}
 // Verify the real Worker route uses the light storage RPC, reports SQL timeout
 // as a transient server error, and preserves authentication failures as 401.
 const worker=(await import('../cloudflare/worker-entry.mjs')).default,originalFetch=global.fetch;
 let timeout=false,unauthorized=false;const names=[];
 global.fetch=async(url,options)=>{
  if(String(url).endsWith('/auth/v1/user'))return Response.json(unauthorized?{}:{id:uuid(9)},{status:unauthorized?401:200});
  const name=String(url).split('/').pop();names.push(name);
  if(timeout)return Response.json({code:'57014',message:'private SQL must not leak'},{status:500});
  if(name==='grcon_document_vault_storage_usage')return Response.json({used_bytes:2048,file_count:2,catalog_documents:2,pending_objects:[]});
  if(name==='grcon_vault_operations')return Response.json({active:2,historical:0,unlinked:0});
  throw Error('Unexpected heavy RPC: '+name);
 };
 try{
  const request=path=>new Request('https://app.test/api/document-vault/'+path+'?workspace='+uuid(1),{headers:{authorization:'Bearer synthetic-session'}}),env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_SYNTHETIC'};
  let response=await worker.fetch(request('usage'),env,{});assert.equal(response.status,200);assert.equal((await response.json()).storage.usedBytes,2048);assert.ok(!names.includes('grcon_document_vault_storage_catalog'));
  timeout=true;response=await worker.fetch(request('list'),env,{});assert.equal(response.status,503);assert.equal((await response.json()).error,'VAULT_QUERY_TIMEOUT');
  unauthorized=true;response=await worker.fetch(request('usage'),env,{});assert.equal(response.status,401);assert.equal((await response.json()).error,'AUTH_INVALID');
 }finally{global.fetch=originalFetch;}
 console.log('Cofre: allocation equivalence, pagination, scope, storage isolation, real Worker light usage and HTTP error classification passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
