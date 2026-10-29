'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite'),{DatabaseSync}=require('node:sqlite');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
(async()=>{
 const pg=new PGlite(),sqlite=new DatabaseSync(':memory:'),originalFetch=global.fetch;
 try{
 await pg.exec(`create schema private;create schema auth;create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create table public.grcon_workspaces(id uuid primary key);
 create table public.grcon_contracts(id uuid primary key,workspace_id uuid,active boolean default true);
 create table public.grcon_memberships(workspace_id uuid,contract_id uuid,user_id uuid,active boolean default true,role text);
 create table private.grcon_master_owner(user_id uuid);
 create function private.grcon_operations_service(operation text) returns jsonb language plpgsql as $$declare j record;begin select 'sigem_import'::text kind into j; if operation='noop' then return '{}';elsif operation like 'import_%' and j.kind='sigem_import' then return '{"legacyWrite":true}';end if;return '{}';end$$;
 create function private.grcon_require_master_owner() returns void language plpgsql as $$begin if not exists(select 1 from private.grcon_master_owner where user_id=auth.uid()) then raise exception 'Master only' using errcode='42501';end if;end$$;
 create function private.grcon_has_role(w uuid,roles text[]) returns boolean language sql as $$select exists(select 1 from public.grcon_memberships where workspace_id=w and user_id=auth.uid() and active and role=any(roles))$$;
 create function private.grcon_document_key(v text) returns text language sql as $$select upper(trim(v))$$;
 create function private.grcon_master_document_key(v text) returns text language sql as $$select upper(trim(v))$$;
 create function private.grcon_revision_key(v text) returns text language sql as $$select upper(trim(v))$$;
 create function private.grcon_status_key(v text) returns text language sql as $$select lower(trim(v))$$;
 create table private.grcon_sigem_query_snapshots(id uuid primary key default gen_random_uuid(),workspace_id uuid,contract_id uuid,file_name text,expected_count integer,record_count integer default 0,metadata jsonb,expected_active uuid,status text default 'pending',created_by uuid,created_at timestamptz default now(),published_at timestamptz,version integer,fingerprint text,previous_snapshot_id uuid,comparison_id uuid,deleted_at timestamptz,deleted_by uuid);
 create unique index one_active on private.grcon_sigem_query_snapshots(workspace_id) where status='active';
 create table private.grcon_sigem_query_rows(snapshot_id uuid,row_number integer,payload jsonb,document_key text,revision_key text,status_original text,status_normalized text,title text,discipline text,primary key(snapshot_id,row_number));
 create table private.grcon_document_files(id uuid primary key,workspace_id uuid,size_bytes bigint,multipart_id text,object_key text);
 create table private.grcon_vault_emission_links(file_id uuid references private.grcon_document_files(id) on delete restrict);
 create table public.grcon_audit_events(workspace_id uuid,contract_id uuid,actor_id uuid,action text,entity_type text,entity_id text,metadata jsonb);
 create table private.grcon_sigem_comparisons(id uuid,counts jsonb);
 create table public.grcon_notifications(comparison_id uuid);
 create function private.grcon_run_sigem_comparison(w uuid,a uuid,b uuid,n boolean) returns uuid language plpgsql as $$declare cid uuid:=gen_random_uuid();begin insert into private.grcon_sigem_comparisons values(cid,'{}');insert into public.grcon_notifications values(cid);return cid;end$$;
 create function private.grcon_sigem_query_begin(w uuid,f text,n integer,m jsonb,a uuid) returns uuid language plpgsql security definer as $$declare sid uuid:=gen_random_uuid();begin
 if not private.grcon_has_role(w,array['owner']) or n not between 1 and 100000 then raise exception 'denied' using errcode='42501';end if;
 insert into private.grcon_sigem_query_snapshots(id,workspace_id,contract_id,file_name,expected_count,metadata,expected_active,created_by) select sid,w,contract_id,f,n,m,a,auth.uid() from public.grcon_memberships where workspace_id=w and user_id=auth.uid() and active;return sid;end$$;
 create function private.grcon_sigem_query_chunk(w uuid,s uuid,f integer,r jsonb) returns integer language sql as $$select 0$$;
 revoke all on function private.grcon_sigem_query_begin(uuid,text,integer,jsonb,uuid),private.grcon_sigem_query_chunk(uuid,uuid,integer,jsonb) from public;
 grant usage on schema private,auth to authenticated,service_role;
 grant execute on function private.grcon_sigem_query_begin(uuid,text,integer,jsonb,uuid),private.grcon_sigem_query_chunk(uuid,uuid,integer,jsonb) to authenticated;
 insert into public.grcon_workspaces values('${id(1)}'),('${id(11)}');
 insert into public.grcon_contracts values('${id(2)}','${id(1)}',true),('${id(12)}','${id(11)}',true);
 insert into public.grcon_memberships values('${id(1)}','${id(2)}','${id(9)}',true,'owner'),('${id(1)}','${id(2)}','${id(8)}',true,'operator'),('${id(11)}','${id(12)}','${id(19)}',true,'owner');
 insert into private.grcon_master_owner values('${id(9)}');`);
 await pg.exec(fs.readFileSync('tests/fixtures/sigem-publish-before-turso.sql','utf8'));
 await pg.exec(fs.readFileSync('supabase/migrations/20261029090140_sigem_turso_operational_and_storage_retirement.sql','utf8'));
 await assert.rejects(pg.query("select private.grcon_operations_service('import_chunk')"),/SIGEM_USE_TURSO_IMPORT/,'installed background service blocks obsolete raw imports');
 const claims=()=>pg.exec(`set request.jwt.claims='{"role":"service_role"}';set request.jwt.claim.sub='';`);
 const M=await import('../cloudflare/sigem-live.mjs');let tursoUnavailable=false;
 const db={execute:async(sql,args=[])=>{const stmt=sqlite.prepare(sql);return stmt.columns().length?{rows:stmt.all(...args)}:{rows:[],affected:stmt.run(...args).changes};}};
 global.fetch=async(url,options)=>{
  if(String(url).includes('turso.io')){
   if(tursoUnavailable)return new Response('private-upstream-error',{status:503});
   const stmt=JSON.parse(options.body).requests[0].stmt,args=stmt.args.map(v=>v.type==='null'?null:v.type==='integer'?Number(v.value):v.value),r=await db.execute(stmt.sql,args),keys=r.rows.length?Object.keys(r.rows[0]):[];
   return Response.json({results:[{type:'ok',response:{type:'execute',result:{cols:keys.map(name=>({name})),rows:r.rows.map(row=>keys.map(k=>row[k]===null?{type:'null'}:{type:typeof row[k]==='number'?'integer':'text',value:String(row[k])})),affected_row_count:r.affected||0}}},{type:'ok',response:{type:'close'}}]});
  }
  const args=JSON.parse(options.body);await claims();
  try{const result=await pg.query('select public.grcon_sigem_live_service($1,$2,$3,$4) r',[args.target_workspace,args.actor_id,args.operation,JSON.stringify(args.input)]);return Response.json(result.rows[0].r);}
  catch(error){return Response.json({code:error.code,message:error.message},{status:error.code==='42501'?403:409});}
 };
 const env={SUPABASE_URL:'https://qa.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_qa',TURSO_DATABASE_URL:'libsql://qa.turso.io',TURSO_AUTH_TOKEN:'qa',GRCON_SIGEM_EXTERNAL_STORAGE_AUTHORIZED:'true'};
 const records=Array.from({length:1001},(_,i)=>({document:'DOC-'+i,revision:'0',status:'Em análise',title:"Título O'Brien 漢字 "+i,discipline:'CV',observation:'FULL_PAYLOAD_ONLY_IN_TURSO',extra:{array:[null,false,0,'ç']}}));
 const begin=()=>M.handleLiveImport(env,{id:id(9)},id(1),'import-begin',{fileName:'CG.xlsx',count:records.length,metadata:{checksum:'source'},expectedActive:null});
 const {id:snapshot}=await begin();assert.equal((await begin()).id,snapshot,'a repeated begin does not duplicate the upload');
 await assert.rejects(M.handleLiveImport(env,{id:id(8)},id(1),'import-begin',{fileName:'CG',count:1,metadata:{}}),/ACCESS_DENIED/);
 const put=async(first,rows)=>M.handleLiveImport(env,{id:id(9)},id(1),'import-chunk',{snapshot,first,rows});
 await put(1,records.slice(0,250));await put(1,records.slice(0,250));
 await assert.rejects(put(1,[{...records[0],observation:'changed'},...records.slice(1,250)]),/CONTENT_CONFLICT/);
 await assert.rejects(M.handleLiveImport(env,{id:id(9)},id(1),'import-publish',{snapshot}),/INCOMPLETE/);
 assert.equal((await pg.query("select count(*) n from private.grcon_sigem_query_snapshots where status='active'")).rows[0].n,0,'a partial upload cannot change the active pointer');
 for(let first=251;first<=1001;first+=250)await put(first,records.slice(first-1,first+249));
 assert.equal((await pg.query('select count(*) n from private.grcon_sigem_query_rows')).rows[0].n,0,'new complete payloads never enter the legacy Postgres table');
 assert.ok(!(await pg.query('select content::text c from private.grcon_sigem_projection_contents')).rows.some(r=>r.c.includes('FULL_PAYLOAD_ONLY_IN_TURSO')),'Postgres contains only the operational projection');
 const published=await M.handleLiveImport(env,{id:id(9)},id(1),'import-publish',{snapshot});assert.equal(published.published,true);
 assert.equal((await pg.query("select record_count from private.grcon_sigem_query_snapshots where status='active'")).rows[0].record_count,1001,'the original publication validation reads the complete minimal projection');
 const info=await M.liveRpc(env,id(8),id(1),'metadata',{snapshot});
 const pages=[...await M.externalPage(env,info,0,1000),...await M.externalPage(env,info,1000,1000)];
 assert.deepEqual(pages.map(r=>r.payload),records,'all full payload values are read from Turso without loss');
 assert.deepEqual(await M.externalRowsByNumber(env,info,[122]),[records[121]],'Registro Mestre can hydrate the complete payload');
 await assert.rejects(M.liveRpc(env,id(19),id(11),'metadata',{snapshot}),/IMPORT_REJECTED/,'cross-contract metadata is unavailable');
 tursoUnavailable=true;await assert.rejects(M.externalPage(env,info,0,1000),/TURSO_UNAVAILABLE/);tursoUnavailable=false;
 assert.equal((await M.handleLiveImport(env,{id:id(9)},id(1),'import-publish',{snapshot})).id,snapshot,'a lost successful publish response can be retried');

 await claims();
 const legacy=id(30),legacyRows=records.slice(0,501).map((p,i)=>({snapshot_id:legacy,row_number:i+1,payload:p,document_key:p.document,revision_key:p.revision,status_original:p.status,status_normalized:p.status.toLowerCase(),title:p.title,discipline:p.discipline}));
 await pg.query("insert into private.grcon_sigem_query_snapshots(id,workspace_id,contract_id,file_name,expected_count,record_count,status,created_by,metadata) values($1,$2,$3,'Old.xlsx',501,501,'archived',$4,'{}')",[legacy,id(1),id(2),id(9)]);
 await pg.query('insert into private.grcon_sigem_query_rows select * from jsonb_populate_recordset(null::private.grcon_sigem_query_rows,$1)',[JSON.stringify(legacyRows)]);
 const proof={id:legacy,fullAudit:true,count:501,validatedRecords:501,checksum:'a'.repeat(64),manifestHash:'b'.repeat(64)};
 const release=p=>pg.query('select public.grcon_sigem_release_service($1,$2,$3,$4) r',[id(1),id(9),legacy,JSON.stringify(p)]);
 await assert.rejects(release({...proof,fullAudit:false}),/AUDIT_REQUIRED/);
 assert.equal((await pg.query('select count(*) n from private.grcon_sigem_query_rows')).rows[0].n,501);
 assert.equal((await release(proof)).rows[0].r.removed,501);
 assert.equal((await release(proof)).rows[0].r.removed,0,'a completed release can be retried');
 assert.equal((await pg.query('select count(*) n from private.grcon_sigem_query_rows')).rows[0].n,0);
 assert.equal((await pg.query('select count(*) n from private.grcon_sigem_projection_contents')).rows[0].n,1001,'identical minimal projections are reused across versions');
 const retained=(await pg.query('select * from private.grcon_sigem_operational_rows where snapshot_id=$1 order by row_number',[legacy])).rows;
 assert.deepEqual(retained.map(r=>({document_key:r.document_key,revision_key:r.revision_key,status_original:r.status_original,status_normalized:r.status_normalized,title:r.title,discipline:r.discipline})),legacyRows.map(({document_key,revision_key,status_original,status_normalized,title,discipline})=>({document_key,revision_key,status_original,status_normalized,title,discipline})),'all SQL operational fields remain identical after removing full payloads');
 await pg.exec(`set request.jwt.claim.sub='${id(9)}';set role authenticated;`);
 await assert.rejects(pg.query('select private.grcon_sigem_query_begin($1,$2,$3,$4,$5)',[id(1),'legacy',1,'{}',snapshot]),/permission denied/,'a stale client cannot fall back to full payload writes in Supabase');
 await assert.rejects(pg.query('select public.grcon_storage_admin($1,$2,$3)',[id(1),'delete-base-begin',JSON.stringify({snapshot})]),/base ativa/);
 await pg.exec('reset role');
 await pg.query('insert into private.grcon_document_files values($1,$2,123,null,$3)',[id(90),id(1),'workspaces/'+id(1)+'/documents/test']);
 await pg.query('insert into private.grcon_vault_emission_links values($1)',[id(90)]);
 await pg.exec(`set request.jwt.claim.sub='${id(9)}';set role authenticated;`);
 await pg.query('select public.grcon_storage_admin($1,$2,$3)',[id(1),'document-finish','{}']);
 await pg.exec('reset role');assert.equal((await pg.query('select count(*) n from private.grcon_document_files')).rows[0].n,0);assert.equal((await pg.query('select count(*) n from private.grcon_vault_emission_links')).rows[0].n,0,'retiring documents removes restrictive file links without touching GRDT history');

 await claims();const retiredScope=(await pg.query('select public.grcon_document_retirement_service($1,$2) r',[id(1),'document-scope'])).rows[0].r;
 assert.equal(retiredScope.prefix,'workspaces/'+id(1)+'/documents/');assert.equal(retiredScope.records,0);
 await assert.rejects(pg.query('select public.grcon_document_retirement_service($1,$2)',[id(1),'delete-base-finish']),/API de servidor/);
 await pg.exec('set role authenticated');await assert.rejects(pg.query('select public.grcon_document_retirement_service($1,$2)',[id(1),'document-scope']),/permission denied/);await pg.exec('reset role');
 console.log('sigem_live: full import/read fidelity, minimal Postgres storage, SQL publication gate, replay, conflicts, outage, tenant isolation, active-base protection and blocked legacy writes passed.');
 }finally{global.fetch=originalFetch;sqlite.close();await pg.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
