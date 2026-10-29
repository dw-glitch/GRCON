begin;
-- Full Consulta Geral payloads live in Turso. Postgres keeps only the fields
-- consumed by its transactional comparisons, notifications and deadline jobs.
create table private.grcon_sigem_external_snapshots(
 snapshot_id uuid primary key references private.grcon_sigem_query_snapshots(id) on delete cascade,
 storage_kind text not null check(storage_kind in('legacy','live')),
 ready boolean not null default false,
 projected boolean not null default false,
 receipt jsonb,
 request_key text unique,
 created_at timestamptz not null default now()
);
create table private.grcon_sigem_projection_contents(
 id bigint generated always as identity primary key,
 workspace_id uuid not null, contract_id uuid not null,
 digest bytea not null check(octet_length(digest)=32),
 content jsonb not null check(jsonb_typeof(content)='object'),
 unique(workspace_id,contract_id,digest)
);
create table private.grcon_sigem_projection_map(
 snapshot_id uuid not null references private.grcon_sigem_query_snapshots(id) on delete cascade,
 row_number integer not null check(row_number between 1 and 100000),
 content_id bigint not null references private.grcon_sigem_projection_contents(id),
 primary key(snapshot_id,row_number)
);
create index grcon_sigem_projection_content_idx on private.grcon_sigem_projection_map(content_id);
alter table private.grcon_sigem_external_snapshots enable row level security;
alter table private.grcon_sigem_projection_contents enable row level security;
alter table private.grcon_sigem_projection_map enable row level security;
revoke all on private.grcon_sigem_external_snapshots,private.grcon_sigem_projection_contents,private.grcon_sigem_projection_map from public,anon,authenticated,service_role;
create view private.grcon_sigem_operational_rows with(security_invoker=true) as
 select r.* from private.grcon_sigem_query_rows r
 where not exists(select 1 from private.grcon_sigem_external_snapshots e where e.snapshot_id=r.snapshot_id and e.projected)
 union all
 select m.snapshot_id,m.row_number,(d.content->'payload')||jsonb_build_object('status',d.content->>'status_original','title',d.content->>'title','discipline',d.content->>'discipline') payload,
 d.content->>'document_key' document_key,d.content->>'revision_key' revision_key,
 d.content->>'status_original' status_original,d.content->>'status_normalized' status_normalized,
 d.content->>'title' title,d.content->>'discipline' discipline
 from private.grcon_sigem_projection_map m
 join private.grcon_sigem_query_snapshots s on s.id=m.snapshot_id
 join private.grcon_sigem_projection_contents d on d.id=m.content_id and d.workspace_id=s.workspace_id and d.contract_id=s.contract_id
 join private.grcon_sigem_external_snapshots e on e.snapshot_id=m.snapshot_id and e.projected;
revoke all on private.grcon_sigem_operational_rows from public,anon,authenticated,service_role;

create function private.grcon_sigem_project_rows(target_snapshot uuid,first_row integer,rows jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare s private.grcon_sigem_query_snapshots;r jsonb;content jsonb;h bytea;cid bigint;saved jsonb;rn integer:=first_row;n integer;
begin
 select * into strict s from private.grcon_sigem_query_snapshots where id=target_snapshot for update;
 if first_row<1 or jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) not between 1 and 500
 or first_row+jsonb_array_length(rows)-1>s.expected_count then raise exception 'SIGEM_PROJECTION_INPUT_INVALID';end if;
 for r in select value from jsonb_array_elements(rows) loop
  if jsonb_typeof(r) is distinct from 'object' or length(btrim(coalesce(r->>'document',''))) not between 1 and 255
  or length(btrim(coalesce(r->>'revision',''))) not between 1 and 16 or length(coalesce(r->>'status',''))>1024
  or length(coalesce(r->>'title',''))>10000 or length(coalesce(r->>'discipline',''))>1024 then raise exception 'SIGEM_PROJECTION_ROW_INVALID';end if;
  content:=jsonb_build_object('payload',jsonb_build_object('document',r->>'document','revision',r->>'revision'),
   'document_key',private.grcon_document_key(r->>'document'),'revision_key',private.grcon_revision_key(r->>'revision'),
   'status_original',coalesce(r->>'status',''),'status_normalized',private.grcon_status_key(r->>'status'),
   'title',coalesce(r->>'title',''),'discipline',coalesce(r->>'discipline',''));
  h:=sha256(convert_to(content::text,'UTF8'));cid:=null;
  insert into private.grcon_sigem_projection_contents(workspace_id,contract_id,digest,content)
   values(s.workspace_id,s.contract_id,h,content) on conflict do nothing returning id into cid;
  if cid is null then
   select id,d.content into strict cid,saved from private.grcon_sigem_projection_contents d where workspace_id=s.workspace_id and contract_id=s.contract_id and digest=h;
   if saved<>content then raise exception 'SIGEM_PROJECTION_HASH_COLLISION';end if;
  end if;
  insert into private.grcon_sigem_projection_map values(s.id,rn,cid) on conflict do nothing;
  if not exists(select 1 from private.grcon_sigem_projection_map where snapshot_id=s.id and row_number=rn and content_id=cid) then raise exception 'SIGEM_PROJECTION_CONFLICT';end if;
  rn:=rn+1;
 end loop;
 select count(*)::integer into n from private.grcon_sigem_projection_map where snapshot_id=s.id;
 return n;
end $$;
revoke all on function private.grcon_sigem_project_rows(uuid,integer,jsonb) from public,anon,authenticated,service_role;

-- Retain the installed authorization/CAS/notification code. Only readers use
-- the minimal projection; legacy import writers remain blocked at their RPC.
do $$ declare f record;definition text;begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.prokind='f' and p.proname in('grcon_sigem_comparison_rows','grcon_master_query',
 'grcon_document_task_deadlines','grcon_sigem_query_page','grcon_run_sigem_comparison','grcon_sigem_query_publish',
 'grcon_monitored_documents_list','grcon_sigem_query_history','grcon_vault_operations') loop
 definition:=replace(pg_get_functiondef(f.oid),'private.grcon_sigem_query_rows','private.grcon_sigem_operational_rows');
 if f.proname='grcon_sigem_query_page' then definition:=replace(definition,' return query',E' if exists(select 1 from private.grcon_sigem_external_snapshots where snapshot_id=target_snapshot) then raise exception ''SIGEM_USE_TURSO_PAGE'' using errcode=''55000'';end if;\n return query');end if;
 execute definition;
 end loop;
end $$;

create function private.grcon_sigem_live_service(target_workspace uuid,actor_id uuid,operation text,input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare c uuid;member_role text;s private.grcon_sigem_query_snapshots;e private.grcon_sigem_external_snapshots;sid uuid;n integer;result jsonb;old_claims text;old_sub text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Somente API de servidor.' using errcode='42501';end if;
 select m.contract_id,m.role into c,member_role from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
 where m.workspace_id=target_workspace and m.user_id=actor_id and m.active;
 if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501';end if;
 if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>4000000 then raise exception 'Consulta inválida.' using errcode='22023';end if;
 if operation='begin' then
  if member_role<>'owner' then raise exception 'Somente proprietário.' using errcode='42501';end if;
  if coalesce(input->>'requestKey','')!~'^[a-f0-9]{64}$' then raise exception 'SIGEM_REQUEST_KEY_INVALID';end if;
  select qs.id into sid from private.grcon_sigem_external_snapshots es join private.grcon_sigem_query_snapshots qs on qs.id=es.snapshot_id
   where es.request_key=input->>'requestKey' and qs.workspace_id=target_workspace and qs.contract_id=c and qs.created_by=actor_id and qs.deleted_at is null;
  if sid is null then
   old_claims:=current_setting('request.jwt.claims',true);old_sub:=current_setting('request.jwt.claim.sub',true);
   perform set_config('request.jwt.claim.sub',actor_id::text,true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_id,'role','authenticated')::text,true);
   sid:=private.grcon_sigem_query_begin(target_workspace,input->>'fileName',(input->>'count')::integer,input->'metadata',(input->>'expectedActive')::uuid);
   perform set_config('request.jwt.claims',coalesce(old_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
   insert into private.grcon_sigem_external_snapshots(snapshot_id,storage_kind,projected,request_key) values(sid,'live',true,input->>'requestKey');
  end if;
  select * into strict s from private.grcon_sigem_query_snapshots where id=sid;
  return jsonb_build_object('snapshot',to_jsonb(s),'kind','live');
 end if;
 select * into s from private.grcon_sigem_query_snapshots where id=(input->>'snapshot')::uuid and workspace_id=target_workspace and contract_id=c for update;
 if not found or s.deleted_at is not null then raise exception 'Base indisponível.' using errcode='22023';end if;
 select * into e from private.grcon_sigem_external_snapshots where snapshot_id=s.id;
 if operation in('metadata','lookup') then
  if s.status='pending' and (s.created_by<>actor_id or member_role<>'owner') then raise exception 'Base indisponível.' using errcode='42501';end if;
  if operation='lookup' then
   select coalesce(jsonb_agg(row_number order by row_number),'[]') into result from private.grcon_sigem_operational_rows
   where snapshot_id=s.id and private.grcon_master_document_key(payload->>'document')=private.grcon_master_document_key(input->>'code');
   return jsonb_build_object('rows',result);
  end if;
  return jsonb_build_object('snapshot',to_jsonb(s),'kind',e.storage_kind,'ready',coalesce(e.ready,false));
 end if;
 if member_role<>'owner' or s.created_by<>actor_id or e.storage_kind is distinct from 'live' then raise exception 'Sem acesso ao envio.' using errcode='42501';end if;
 if operation='chunk' then
  if s.status<>'pending' or e.ready then raise exception 'SIGEM_IMPORT_ALREADY_SEALED';end if;
  n:=private.grcon_sigem_project_rows(s.id,(input->>'first')::integer,input->'rows');
  return jsonb_build_object('count',n);
 elsif operation='publish' then
  if s.status in('active','archived') and e.ready then return jsonb_build_object('id',s.id,'published',true);end if;
  if s.status<>'pending' or (input->>'count')::integer is distinct from s.expected_count or coalesce(input->>'checksum','')!~'^[a-f0-9]{64}$' then raise exception 'SIGEM_IMPORT_NOT_VERIFIED';end if;
  update private.grcon_sigem_external_snapshots set ready=true,receipt=input-'snapshot' where snapshot_id=s.id;
  old_claims:=current_setting('request.jwt.claims',true);old_sub:=current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub',actor_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_id,'role','authenticated')::text,true);
  sid:=private.grcon_sigem_query_publish(target_workspace,s.id);
  perform set_config('request.jwt.claims',coalesce(old_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
  return jsonb_build_object('id',sid,'published',true);
 end if;
 raise exception 'Operação inválida.' using errcode='22023';
end $$;
create function public.grcon_sigem_live_service(target_workspace uuid,actor_id uuid,operation text,input jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.grcon_sigem_live_service(target_workspace,actor_id,operation,input)$$;
revoke all on function private.grcon_sigem_live_service(uuid,uuid,text,jsonb),public.grcon_sigem_live_service(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.grcon_sigem_live_service(uuid,uuid,text,jsonb),public.grcon_sigem_live_service(uuid,uuid,text,jsonb) to service_role;
-- A stale frontend or the old background processor must fail closed, rather
-- than silently storing the next complete workbook in Postgres again.
revoke execute on function private.grcon_sigem_query_begin(uuid,text,integer,jsonb,uuid),private.grcon_sigem_query_chunk(uuid,uuid,integer,jsonb),private.grcon_sigem_query_publish(uuid,uuid) from authenticated;

-- Reject jobs created by obsolete frontends before they can call legacy writers.
do $$ declare f record;definition text;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.prokind='f' and p.proname='grcon_operations_service' loop
  definition:=replace(pg_get_functiondef(f.oid),"elsif operation like 'import_%' and j.kind='sigem_import' then", "elsif operation like 'import_%' and j.kind='sigem_import' then raise exception 'SIGEM_USE_TURSO_IMPORT';");
  execute definition;
 end loop;
end $$;

create table private.grcon_sigem_retirements(snapshot_id uuid primary key references private.grcon_sigem_query_snapshots(id),finished boolean not null default false,requested_by uuid not null,requested_at timestamptz not null default now());
alter table private.grcon_sigem_retirements enable row level security;
revoke all on private.grcon_sigem_retirements from public,anon,authenticated,service_role;
create function private.grcon_storage_admin(target_workspace uuid,operation text,input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid;s private.grcon_sigem_query_snapshots;result jsonb;n bigint;
begin
 perform private.grcon_require_master_owner();
 select m.contract_id into c from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active where m.workspace_id=target_workspace and m.user_id=auth.uid() and m.active;
 if c is null then raise exception 'Sem acesso ao contrato.' using errcode='42501';end if;
 if operation='bases' then
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'version',s.version,'fileName',s.file_name,'records',s.record_count,'date',coalesce(s.metadata->>'referenceDate',s.published_at::text),'status',s.status,'deletedAt',s.deleted_at,'deletionPending',r.snapshot_id is not null and not r.finished,'storage',e.storage_kind) order by s.version desc),'[]') into result
  from private.grcon_sigem_query_snapshots s left join private.grcon_sigem_external_snapshots e on e.snapshot_id=s.id left join private.grcon_sigem_retirements r on r.snapshot_id=s.id
  where s.workspace_id=target_workspace and s.contract_id=c and s.status in('active','archived') and not coalesce(r.finished,false);
  return jsonb_build_object('bases',result);
 elsif operation in('document-scope','document-finish') then
  if operation='document-finish' then
   delete from private.grcon_vault_emission_links l using private.grcon_document_files f where l.file_id=f.id and f.workspace_id=target_workspace;
   delete from private.grcon_document_files where workspace_id=target_workspace;
   get diagnostics n=row_count;
   insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata) values(target_workspace,c,auth.uid(),'document_storage_retired','storage',target_workspace::text,jsonb_build_object('catalogRowsRemoved',n));
  end if;
  return jsonb_build_object('prefix','workspaces/'||target_workspace::text||'/documents/','records',(select count(*) from private.grcon_document_files where workspace_id=target_workspace),'catalogBytes',(select coalesce(sum(size_bytes),0) from private.grcon_document_files where workspace_id=target_workspace),'multipart',(select coalesce(jsonb_agg(jsonb_build_object('key',object_key,'id',multipart_id)),'[]') from private.grcon_document_files where workspace_id=target_workspace and multipart_id is not null));
 elsif operation in('delete-base-begin','delete-base-finish','base-source') then
  perform 1 from public.grcon_workspaces where id=target_workspace for update;
  select * into s from private.grcon_sigem_query_snapshots where id=(input->>'snapshot')::uuid and workspace_id=target_workspace and contract_id=c for update;
  if not found then raise exception 'Base indisponível.' using errcode='22023';end if;
  if operation='base-source' then return to_jsonb(s);end if;
  if s.status<>'archived' then raise exception 'A base ativa não pode ser excluída.' using errcode='22023';end if;
  if operation='delete-base-begin' then
   update private.grcon_sigem_query_snapshots set deleted_at=coalesce(deleted_at,now()),deleted_by=auth.uid() where id=s.id;
   insert into private.grcon_sigem_retirements(snapshot_id,requested_by) values(s.id,auth.uid()) on conflict do nothing;
  else
   if not exists(select 1 from private.grcon_sigem_retirements where snapshot_id=s.id) then raise exception 'Exclusão não iniciada.';end if;
   delete from private.grcon_sigem_query_rows where snapshot_id=s.id;
   delete from private.grcon_sigem_projection_map where snapshot_id=s.id;
   delete from private.grcon_sigem_projection_contents d where not exists(select 1 from private.grcon_sigem_projection_map m where m.content_id=d.id);
   update private.grcon_sigem_retirements set finished=true where snapshot_id=s.id;
   insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata) values(target_workspace,c,auth.uid(),'sigem_base_permanently_deleted','sigem_query',s.id::text,jsonb_build_object('version',s.version,'records',s.record_count));
  end if;
  return jsonb_build_object('snapshot',to_jsonb(s),'kind',(select storage_kind from private.grcon_sigem_external_snapshots where snapshot_id=s.id));
 end if;
 raise exception 'Operação inválida.' using errcode='22023';
end $$;
create function public.grcon_storage_admin(target_workspace uuid,operation text,input jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.grcon_storage_admin(target_workspace,operation,input)$$;
revoke all on function private.grcon_storage_admin(uuid,text,jsonb),public.grcon_storage_admin(uuid,text,jsonb) from public,anon,service_role;
grant execute on function private.grcon_storage_admin(uuid,text,jsonb),public.grcon_storage_admin(uuid,text,jsonb) to authenticated;

create function private.grcon_sigem_release_service(target_workspace uuid,actor_id uuid,target_snapshot uuid,proof jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.grcon_sigem_query_snapshots;batch jsonb;cursor integer:=0;old_claims text;old_sub text;n bigint;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or not exists(select 1 from private.grcon_master_owner g join public.grcon_memberships m on m.user_id=g.user_id and m.active and m.role='owner' join public.grcon_contracts ct on ct.id=m.contract_id and ct.active where g.user_id=actor_id and m.workspace_id=target_workspace) then raise exception 'Somente API Master.' using errcode='42501';end if;
 perform 1 from public.grcon_workspaces where id=target_workspace for update;
 select qs.* into strict s from private.grcon_sigem_query_snapshots qs join public.grcon_memberships m on m.workspace_id=qs.workspace_id and m.contract_id=qs.contract_id and m.user_id=actor_id and m.active where qs.id=target_snapshot and qs.workspace_id=target_workspace for update of qs;
 if exists(select 1 from private.grcon_sigem_external_snapshots where snapshot_id=s.id and projected and ready) then return jsonb_build_object('released',true,'removed',0);end if;
 if s.status not in('active','archived') or proof->>'id' is distinct from s.id::text or proof->'fullAudit' is distinct from 'true'::jsonb
 or proof->>'count' is distinct from s.record_count::text or proof->>'validatedRecords' is distinct from s.record_count::text
 or coalesce(proof->>'checksum','')!~'^[a-f0-9]{64}$' or coalesce(proof->>'manifestHash','')!~'^[a-f0-9]{64}$' then raise exception 'SIGEM_RELEASE_AUDIT_REQUIRED';end if;
 if (select count(*) from private.grcon_sigem_query_rows where snapshot_id=s.id)<>s.record_count then raise exception 'SIGEM_RELEASE_SOURCE_INCOMPLETE';end if;
 while cursor<s.record_count loop
  select jsonb_agg(jsonb_build_object('document',r.payload->>'document','revision',r.payload->>'revision','status',r.status_original,'title',r.title,'discipline',r.discipline) order by r.row_number) into batch
  from(select * from private.grcon_sigem_query_rows where snapshot_id=s.id and row_number>cursor order by row_number limit 500)r;
  perform private.grcon_sigem_project_rows(s.id,cursor+1,batch);cursor:=cursor+jsonb_array_length(batch);
 end loop;
 if (select count(*) from private.grcon_sigem_projection_map where snapshot_id=s.id)<>s.record_count or exists(
  select 1 from private.grcon_sigem_query_rows r left join private.grcon_sigem_projection_map m on m.snapshot_id=r.snapshot_id and m.row_number=r.row_number
  left join private.grcon_sigem_projection_contents d on d.id=m.content_id where r.snapshot_id=s.id and
  (r.document_key is distinct from d.content->>'document_key' or r.revision_key is distinct from d.content->>'revision_key'
  or r.status_original is distinct from d.content->>'status_original' or r.status_normalized is distinct from d.content->>'status_normalized'
  or r.title is distinct from d.content->>'title' or r.discipline is distinct from d.content->>'discipline'
  or r.payload->>'document' is distinct from d.content->'payload'->>'document' or r.payload->>'revision' is distinct from d.content->'payload'->>'revision')) then raise exception 'SIGEM_RELEASE_PROJECTION_MISMATCH';end if;
 insert into private.grcon_sigem_external_snapshots(snapshot_id,storage_kind,ready,projected,receipt) values(s.id,'legacy',true,true,proof)
 on conflict(snapshot_id) do update set ready=true,projected=true,receipt=excluded.receipt;
 delete from private.grcon_sigem_query_rows where snapshot_id=s.id;get diagnostics n=row_count;
 insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata) values(target_workspace,s.contract_id,actor_id,'sigem_payload_moved_to_turso','sigem_query',s.id::text,jsonb_build_object('removedRawRows',n,'checksum',proof->>'checksum'));
 return jsonb_build_object('released',true,'removed',n);
end $$;
create function public.grcon_sigem_release_service(target_workspace uuid,actor_id uuid,target_snapshot uuid,proof jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.grcon_sigem_release_service(target_workspace,actor_id,target_snapshot,proof)$$;
revoke all on function private.grcon_sigem_release_service(uuid,uuid,uuid,jsonb),public.grcon_sigem_release_service(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.grcon_sigem_release_service(uuid,uuid,uuid,jsonb),public.grcon_sigem_release_service(uuid,uuid,uuid,jsonb) to service_role;

do $$ declare definition text;begin
 select pg_get_functiondef(p.oid) into definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='grcon_sigem_storage_control';
 if definition is not null then
  definition:=replace(definition,'from private.grcon_sigem_query_snapshots t where workspace_id=target_workspace and contract_id=c and status in(''active'',''archived'')', 'from private.grcon_sigem_query_snapshots t where workspace_id=target_workspace and contract_id=c and status in(''active'',''archived'') and not exists(select 1 from private.grcon_sigem_retirements rt where rt.snapshot_id=t.id) and not exists(select 1 from private.grcon_sigem_external_snapshots es where es.snapshot_id=t.id and es.storage_kind=''live'')');
  definition:=replace(definition,'if operation=''source'' then','if exists(select 1 from private.grcon_sigem_retirements rt where rt.snapshot_id=s.id) then raise exception ''SIGEM_BASE_RETIRED'';end if; if operation=''source'' then');
  definition:=replace(definition,'return result;',E'return result||case when operation=''status'' then jsonb_build_object(''newImportsTarget'',''turso'',''payloadSource'',case when exists(select 1 from private.grcon_sigem_query_snapshots qs left join private.grcon_sigem_external_snapshots e on e.snapshot_id=qs.id where qs.workspace_id=target_workspace and qs.contract_id=c and qs.status in(''active'',''archived'') and qs.deleted_at is null and not coalesce(e.ready,false)) then ''hybrid'' else ''turso'' end) else ''{}''::jsonb end;');
  definition:=replace(definition,'pg_total_relation_size(''private.grcon_sigem_query_rows'')','(pg_total_relation_size(''private.grcon_sigem_query_rows'')+pg_total_relation_size(''private.grcon_sigem_projection_map'')+pg_total_relation_size(''private.grcon_sigem_projection_contents''))');
  execute definition;
 end if;
end $$;
commit;
