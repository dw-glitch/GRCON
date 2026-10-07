'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname,'..');
const owner='00000000-0000-4000-8000-000000000010', admin='00000000-0000-4000-8000-000000000011', viewer='00000000-0000-4000-8000-000000000012';
const workspace='00000000-0000-4000-8000-000000000001';
(async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create schema private; create schema auth; create role anon; create role authenticated; create role service_role; grant usage on schema private,public,auth to service_role;
   create function auth.jwt() returns jsonb language sql as $$ select '{"role":"service_role"}'::jsonb $$;
   grant usage on schema private,public,auth to authenticated;
   create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create table public.grcon_workspaces(id uuid primary key default gen_random_uuid(),name text,created_by uuid,created_at timestamptz default now());
   create table public.grcon_memberships(workspace_id uuid,user_id uuid,role text,active boolean default true,invited_by uuid,joined_at timestamptz default now(),primary key(workspace_id,user_id));
   alter table public.grcon_memberships enable row level security;
   grant select,insert,update,delete on public.grcon_memberships to authenticated;
   create function private.grcon_is_member(w uuid) returns boolean language sql security definer set search_path=public as $$ select auth.uid() is not null and exists(select 1 from grcon_memberships where workspace_id=w and user_id=auth.uid() and active) $$;
   create function private.grcon_has_role(w uuid,roles text[]) returns boolean language sql security definer set search_path=public as $$ select auth.uid() is not null and exists(select 1 from grcon_memberships where workspace_id=w and user_id=auth.uid() and active and role=any(roles)) $$;
   create policy members_select on public.grcon_memberships for select to authenticated using(private.grcon_is_member(workspace_id));
   create table public.grcon_history(id uuid primary key default gen_random_uuid(),workspace_id uuid,generated_at timestamptz,deleted_at timestamptz);
   create table public.grcon_audit_events(workspace_id uuid,actor_id uuid,action text,entity_type text,entity_id text,metadata jsonb,created_at timestamptz default now());
   insert into public.grcon_workspaces(id,name) values('${workspace}','GRCON');
   insert into public.grcon_memberships(workspace_id,user_id,role) values('${workspace}','${owner}','owner'),('${workspace}','${admin}','admin'),('${workspace}','${viewer}','viewer');`);
  await db.exec(`create table private.grcon_planned_document_snapshots(id uuid primary key default gen_random_uuid(),workspace_id uuid,status text,published_at timestamptz,created_at timestamptz default now());
    create table private.grcon_planned_document_items(snapshot_id uuid,document_key text);
    create table public.grcon_profiles(id uuid primary key,display_name text,email text);
    insert into public.grcon_profiles values('${owner}','Owner QA','owner@example.test');`);
  for (const file of ['20260929223549_shared_sigem_query.sql','20261006163921_document_vault_catalog.sql','20261006170344_document_vault_search_allocation.sql','20261006170405_document_vault_filter_pagination_fix.sql','20261006170533_document_vault_secret_key_compatibility.sql','20261006170546_document_vault_list_secret_key_compatibility.sql','20261006183921_multi_contract_foundation.sql','20261006184001_sigem_status_monitoring_schema.sql','20261006184118_sigem_status_monitoring_engine.sql','20261006184204_sigem_status_monitoring_api.sql','20261006185349_document_vault_batch_lookup.sql','20261006185728_document_vault_lookup_secret_key_compatibility.sql','20261007122636_document_vault_deletion.sql','20261007122911_shared_sigem_reference_date.sql','20261007122913_requests_control_base.sql','20261007122915_document_vault_set_lookup.sql','20261007143000_document_vault_requests_allocation_storage_audit.sql','20261007144040_shared_sigem_history_management.sql','20261007171210_owner_admin_shared_sigem_dashboard.sql']) await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
  const as = (id, role='authenticated') => db.exec(`reset role; set request.jwt.claim.sub='${id}'; set role ${role};`);
  const rpc = (name,args) => db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as data',args).then(r=>r.rows[0].data);
  await as(owner);
  const contract = (await db.query('select contract_id from public.grcon_memberships where workspace_id=$1 and user_id=$2',[workspace,owner])).rows[0].contract_id;
  const other = (await db.query("select workspace_id from public.grcon_contract_context() where code='UGH'")).rows[0].workspace_id;
  const request = (op,input={},target=workspace)=>rpc('grcon_requests_base',[target,op,input]);
  const row = {document:'DOC-001',sheet:'Solicitações',sourceRow:2,data:{Documento:'DOC-001',Título:'Ação solicitada',Responsável:'Vinício',Alocação:'C1O-ALOC-QA-0001'}};
  const begun=await request('begin',{fileName:'Controle.xlsx',count:2,expectedActive:null});
  await request('chunk',{id:begun.id,first:1,rows:[row]});
  await assert.rejects(request('publish',{id:begun.id}),/incompleta/);
  await request('chunk',{id:begun.id,first:2,rows:[{...row,document:'DOC-002',data:{...row.data,Documento:'DOC-002',Alocação:''}}]});
  await request('publish',{id:begun.id});
  assert.equal((await request('current')).expected_count,2);
  assert.deepEqual((await request('page',{id:begun.id}))[0].payload.data,row.data);
  assert.equal(await request('current',{},other),null,'another contract does not inherit the request base');
  await as(viewer); await assert.rejects(request('begin',{fileName:'Denied.xlsx',count:1}),/permissão/);
  await assert.rejects(request('page',{id:begun.id},other),/acesso/);
  await assert.rejects(db.query('select * from private.grcon_requests_rows'),/permission denied/);
  await as(owner);
  const id=await rpc('grcon_sigem_query_begin',[workspace,'Consulta.xlsx',1,{importedAt:'2026-10-07T12:00:00Z',referenceDate:'2026-10-03'},null]);
  await rpc('grcon_sigem_query_chunk',[workspace,id,1,[{document:'DOC-001',revision:'0',status:'Em análise'}]]);
  await rpc('grcon_sigem_query_publish',[workspace,id]);
  await db.exec('reset role');
  const counts=()=>db.query(`select (select count(*) from private.grcon_sigem_query_snapshots) snapshots,(select count(*) from private.grcon_sigem_comparisons) comparisons,(select count(*) from public.grcon_notifications) notifications`).then(r=>r.rows[0]);
  const before=await counts();
  await as(admin);
  await rpc('grcon_sigem_query_set_date',[workspace,id,'2026-10-02','2026-10-03']);
  await assert.rejects(rpc('grcon_sigem_query_set_date',[workspace,id,'2026-10-01','2026-10-03']),/outro usuário/);
  await assert.rejects(rpc('grcon_sigem_query_set_date',[other,id,'2026-10-02',null]),/permissão/);
  await as(viewer);await assert.rejects(rpc('grcon_sigem_query_set_date',[workspace,id,'2026-10-01','2026-10-02']),/permissão/);
  await db.exec('reset role');assert.deepEqual(await counts(),before,'metadata edit never creates snapshots, comparisons or notifications');
  assert.equal((await db.query('select payload from private.grcon_sigem_query_rows where snapshot_id=$1',[id])).rows[0].payload.status,'Em análise');
  await as(owner);
  const next=await rpc('grcon_sigem_query_begin',[workspace,'Consulta-2.xlsx',1,{importedAt:'2026-10-07T13:00:00Z',referenceDate:'2026-10-06'},id]);
  await rpc('grcon_sigem_query_chunk',[workspace,next,1,[{document:'DOC-002',revision:'0',status:'Emitido'}]]);
  await rpc('grcon_sigem_query_publish',[workspace,next]);
  await db.exec('reset role'); const historicalBefore=await counts();
  await as(admin);
  await rpc('grcon_sigem_query_set_date',[workspace,id,'2026-10-01','2026-10-02']);
  await assert.rejects(db.query("update public.grcon_memberships set role='viewer' where workspace_id=$1 and user_id=$2 returning *",[workspace,viewer]).then(r=>{if(!r.rows.length)throw Error('owner-only');}),/owner-only|row-level/);
  await assert.rejects(db.query('insert into public.grcon_memberships(workspace_id,user_id,role) values($1,$2,$3)',[workspace,'00000000-0000-4000-8000-000000000099','operator']),/row-level/);
  await assert.rejects(rpc('grcon_contract_settings_save',[contract,{}]),/permissão/);
  await as(viewer);
  const versions=(await db.query('select * from public.grcon_sigem_query_versions($1)',[workspace])).rows;
  assert.equal(versions.length,2); assert.equal(versions.find(v=>v.snapshot_id===id).metadata.referenceDate,'2026-10-01');
  assert.equal((await db.query('select * from public.grcon_sigem_query_page($1,$2,0,1000)',[workspace,id])).rows[0].payload.document,'DOC-001');
  assert.equal((await db.query('select * from public.grcon_sigem_query_current($1)',[workspace])).rows[0].snapshot_id,next,'historical reads never activate a base');
  await assert.rejects(db.query('select * from public.grcon_sigem_query_versions($1)',[other]),/acesso/);
  await db.exec('reset role'); assert.deepEqual(await counts(),historicalBefore,'date edit and selection never create versions, comparisons or notifications');
  const technical=(await db.query('select metadata,version from private.grcon_sigem_query_snapshots where id=$1',[id])).rows[0];
  assert.equal(technical.metadata.importedAt,'2026-10-07T12:00:00Z'); assert.equal(technical.version,1);
  await as('', 'anon'); await assert.rejects(db.query('select * from public.grcon_sigem_query_versions($1)',[workspace]),/permission denied/);
  await db.exec('reset role');
  const fileId='00000000-0000-4000-8000-000000000100', aliasId='00000000-0000-4000-8000-000000000101';
  const key='workspaces/'+workspace+'/documents/test';
  await db.query(`insert into private.grcon_document_files(id,workspace_id,contract_id,created_by,file_name,relative_path,document_code,identity_code,revision,format,size_bytes,sha256,object_key,status)
    values($1,$2,$3,$4,'DOC-001.pdf','DOC-001.pdf','DOC-001','DOC-001','0','pdf',3,$5,$6,'ready'),($7,$2,$3,$4,'DOC-002.pdf','DOC-002.pdf','DOC-002','DOC-002','0','pdf',3,$5,$6,'ready')`,[fileId,workspace,contract,owner,'a'.repeat(64),key,aliasId]);
  await db.query('insert into public.grcon_history(workspace_id,generated_at) values($1,now())',[workspace]);
  const worker=(await import('../cloudflare/worker-entry.mjs')).default;
  const originalFetch=global.fetch, objects=new Map([[key,Buffer.from('PDF')]]); let deleted=0, failDelete=true, failFinish=false;
  const bucket={
    async head(k){return objects.has(k)?{size:objects.get(k).length}:null;},
    async get(k){return objects.has(k)?{body:new Response(objects.get(k)).body}:null;},
    async put(k,body){objects.set(k,Buffer.from(await new Response(body).arrayBuffer()));},
    async delete(k){if(failDelete)throw Error('R2 offline');deleted++;objects.delete(k);},
    async list({prefix}){return {objects:[...objects.entries()].filter(([k])=>k.startsWith(prefix)).map(([key,value])=>({key,size:value.length})),truncated:false};},
  };
  global.fetch=async(url,options={})=>{
    if(url.includes('/auth/v1/user')) return Response.json({id:options.headers.authorization.slice(7)});
    const name=url.split('/').pop(),body=JSON.parse(options.body);
    await as('', 'service_role');
    try {
      if(failFinish && name==='grcon_document_delete' && body.operation==='finish') throw Error('Database temporarily unavailable');
      let data;
      if(name==='grcon_document_vault_storage_catalog' || name==='grcon_document_vault_storage_usage') data=await rpc(name,[body.target_workspace,body.actor_id]);
      else if(name==='grcon_document_vault_reconcile_log') data=await rpc(name,[body.target_workspace,body.actor_id,body.input]);
      else data=await rpc(name,[body.target_workspace,body.actor_id,body.operation,body.input]);
      return Response.json(data);
    }catch(error){return Response.json({message:error.message,code:'42501'},{status:403});}
  };
  const env={SUPABASE_URL:'https://database.test',SUPABASE_SECRET_KEY:'sb_secret_qa',GRCON_DOCUMENTS:bucket};
  const deleteFile=(actor=owner,target=workspace,id=fileId)=>worker.fetch(new Request('https://grcon.test/api/document-vault/delete',{method:'POST',headers:{authorization:'Bearer '+actor,'content-type':'application/json'},body:JSON.stringify({workspaceId:target,id})}),env);
  try {
    assert.equal((await deleteFile(viewer)).status,403);assert.equal(deleted,0);
    assert.equal((await deleteFile(owner,other)).status,403);assert.equal(deleted,0);
    const failed=await deleteFile(admin);assert.equal(failed.status,409);assert.equal(deleted,0);
    await db.exec('reset role');assert.equal((await db.query('select status from private.grcon_document_files where id=$1',[fileId])).rows[0].status,'delete_failed');
    assert.ok(objects.has(key));assert.equal((await db.query('select object_key from private.grcon_document_files where id=$1',[aliasId])).rows[0].object_key,key+'.retained-'+fileId);
    failDelete=false;failFinish=true;assert.equal((await deleteFile()).status,409);assert.equal(objects.has(key),false,'partial database failure does not pretend success');
    const usageResponse=await worker.fetch(new Request('https://grcon.test/api/document-vault/usage?workspace='+workspace,{headers:{authorization:'Bearer '+owner}}),env);
    assert.equal(usageResponse.status,200);const usage=(await usageResponse.json()).storage;
    assert.equal(usage.usedBytes,3,'operational usage stops counting a pending object already removed from R2');
    assert.equal(usage.fileCount,1,'only the retained physical object remains counted');
    assert.equal(usage.pendingChecked,1,'normal usage checks only pending deletions in R2 instead of listing the bucket');
    assert.equal(usage.source,'catalog');
    failFinish=false;assert.equal((await deleteFile()).status,200);assert.equal((await deleteFile()).status,200,'retry after success is idempotent');
    await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from private.grcon_document_files where id=$1',[fileId])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from public.grcon_history')).rows[0].n,1,'old GRDT history is untouched');
    assert.equal((await db.query("select count(*)::int n from public.grcon_audit_events where action='document_vault_delete_finish'")).rows[0].n,1);
    const deniedReconcile=await worker.fetch(new Request('https://grcon.test/api/document-vault/reconcile',{method:'POST',headers:{authorization:'Bearer '+viewer,'content-type':'application/json'},body:JSON.stringify({workspaceId:workspace})}),env);assert.equal(deniedReconcile.status,403);
    const reconciled=await worker.fetch(new Request('https://grcon.test/api/document-vault/reconcile',{method:'POST',headers:{authorization:'Bearer '+owner,'content-type':'application/json'},body:JSON.stringify({workspaceId:workspace})}),env);assert.equal(reconciled.status,200);
    await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from public.grcon_audit_events where action='document_vault_storage_reconciled'")).rows[0].n,1);
    assert.ok(objects.has(key+'.retained-'+fileId),'reused binary is preserved for another document');
    await as('', 'service_role');const result=await rpc('grcon_document_vault_lookup',[workspace,owner,{items:[{requestId:'1',documentCode:'DOC-001'},{requestId:'2',documentCode:'DOC-002'}]}]);
    assert.equal(result.results[0].matches.length,0);assert.equal(result.results[1].matches.length,1);
    const list=await rpc('grcon_document_vault_list',[workspace,owner,{q:'DOC-002',allocation:'all'}]);assert.equal(list.files.length,1);assert.equal(list.files[0].created_by_name,'Owner QA');
    assert.equal(list.allocation_source,'Controle de Solicitações');
    assert.equal(list.files[0].allocation_label,'Não informado no Controle');
    assert.equal(list.files[0].allocation_identified,true);
    const allocatedPage=await rpc('grcon_document_vault_list',[workspace,owner,{allocation:'allocated',limit:1}]);
    assert.equal(allocatedPage.files.length,0,'DOC-001 was deleted before this check and cannot leak from history');
    const notAllocatedPage=await rpc('grcon_document_vault_list',[workspace,owner,{allocation:'not_allocated',limit:1}]);
    assert.equal(notAllocatedPage.files.length,1,'allocation filter is applied before pagination');
    assert.equal(notAllocatedPage.files[0].document_code,'DOC-002');
    await db.exec('reset role');
    const unidentifiedId='00000000-0000-4000-8000-000000000103', unidentifiedKey='workspaces/'+workspace+'/documents/unidentified';
    await db.query(`insert into private.grcon_document_files(id,workspace_id,contract_id,created_by,file_name,relative_path,document_code,identity_code,revision,format,size_bytes,sha256,object_key,status)
      values($1,$2,$3,$4,'DOC-003.pdf','DOC-003.pdf','DOC-003','DOC-003','0','pdf',4,$5,$6,'ready')`,[unidentifiedId,workspace,contract,owner,'b'.repeat(64),unidentifiedKey]);
    objects.set(unidentifiedKey,Buffer.from('PDF3'));
    await as('', 'service_role');
    const unidentifiedPage=await rpc('grcon_document_vault_list',[workspace,owner,{allocation:'not_identified',limit:10}]);
    assert.equal(unidentifiedPage.files.length,1,'não identificados are separate from not allocated');
    assert.equal(unidentifiedPage.files[0].document_code,'DOC-003');
    assert.equal(unidentifiedPage.files[0].allocation_label,'Não identificado');
    const notAllocatedAfterUnknown=await rpc('grcon_document_vault_list',[workspace,owner,{allocation:'not_allocated',limit:10}]);
    assert.equal(notAllocatedAfterUnknown.files.some(file=>file.document_code==='DOC-003'),false,'unknown allocation never leaks into not allocated');
    await as(owner);
    const currentRequests=await request('current');
    const changed=await request('begin',{fileName:'Controle atualizado.xlsx',count:1,expectedActive:currentRequests.id});
    await request('chunk',{id:changed.id,first:1,rows:[{...row,document:'DOC-002',data:{...row.data,Documento:'DOC-002',Alocação:'C1O-ALOC-QA-0099'}}]});
    await request('publish',{id:changed.id});
    await as('', 'service_role');
    const refreshedAllocation=await rpc('grcon_document_vault_list',[workspace,owner,{q:'DOC-002',allocation:'allocated'}]);
    assert.equal(refreshedAllocation.files.length,1,'allocation changes without reuploading the vault file');
    assert.equal(refreshedAllocation.files[0].allocation_label,'C1O-ALOC-QA-0099');
    const isolated=await rpc('grcon_document_vault_list',[other,owner,{allocation:'all'}]);
    assert.equal(isolated.files.length,0,'vault data remains isolated by contract');
    for(const size of [10,50,100]) {const start=performance.now();await rpc('grcon_document_vault_lookup',[workspace,owner,{items:Array.from({length:size},(_,i)=>({requestId:String(i),documentCode:i%2?'DOC-001':'DOC-002'}))}]);console.log('Lookup '+size+' codes: '+(performance.now()-start).toFixed(1)+'ms (local Postgres)');}
  }finally{global.fetch=originalFetch;}
  console.log('Document workflows database + Worker: roles, contracts, actual bucket calls, shared binary, R2/database failures, retry, history/audit, date metadata and request base passed.');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
