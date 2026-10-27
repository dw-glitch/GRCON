-- Lossless SQL compatibility cache. Applying this migration removes no rows.
-- Corporate raw rows can be removed only in the separate, admin-only function
-- after full Turso/R2 audit and operational validation.
begin;
alter table private.grcon_sigem_query_rows rename to grcon_sigem_raw_rows;

create table private.grcon_sigem_row_contents(
 id bigint generated always as identity primary key,
 workspace_id uuid not null,
 contract_id uuid not null,
 content_hash bytea not null check(octet_length(content_hash)=32),
 row_content jsonb not null check(jsonb_typeof(row_content)='object'),
 unique(workspace_id,contract_id,content_hash)
) with (toast_tuple_target=256);
create table private.grcon_sigem_row_map(
 snapshot_id uuid not null references private.grcon_sigem_query_snapshots(id) on delete cascade,
 row_number integer not null check(row_number between 1 and 100000),
 content_id bigint not null references private.grcon_sigem_row_contents(id),
 source_row integer,
 identity_payload jsonb,
 check(source_row is not null or identity_payload is not null),
 primary key(snapshot_id,row_number)
);
create index grcon_sigem_map_content_idx on private.grcon_sigem_row_map(content_id);
create table private.grcon_sigem_cache_catalog(
 snapshot_id uuid primary key references private.grcon_sigem_query_snapshots(id) on delete cascade,
 source_json jsonb not null,
 after_row integer not null default 0 check(after_row between 0 and 100000),
 ready boolean not null default false,
 audit_proof jsonb,
 raw_removed_at timestamptz
);
alter table private.grcon_sigem_row_contents enable row level security;
alter table private.grcon_sigem_row_map enable row level security;
alter table private.grcon_sigem_cache_catalog enable row level security;
create policy grcon_sigem_contents_internal on private.grcon_sigem_row_contents for all using(false) with check(false);
create policy grcon_sigem_map_internal on private.grcon_sigem_row_map for all using(false) with check(false);
create policy grcon_sigem_cache_internal on private.grcon_sigem_cache_catalog for all using(false) with check(false);
revoke all on private.grcon_sigem_row_contents,private.grcon_sigem_row_map,private.grcon_sigem_cache_catalog from public,anon,authenticated,service_role;

create function private.grcon_sigem_cache_payload(content jsonb,source_row integer,identity_payload jsonb)
returns jsonb language sql immutable set search_path='' as $$
 select (content->'payload')||coalesce(identity_payload,jsonb_build_object(
  'id',(content->'payload'->>'document')||'|'||(content->'payload'->>'revision')||'|'||source_row,
  'sourceRow',source_row));
$$;
revoke all on function private.grcon_sigem_cache_payload(jsonb,integer,jsonb) from public,anon,authenticated,service_role;

create view private.grcon_sigem_cached_rows with(security_invoker=true) as
select m.snapshot_id,m.row_number,
 private.grcon_sigem_cache_payload(d.row_content,m.source_row,m.identity_payload) payload,
 d.row_content->>'document_key' document_key,d.row_content->>'revision_key' revision_key,
 d.row_content->>'status_original' status_original,d.row_content->>'status_normalized' status_normalized,
 d.row_content->>'title' title,d.row_content->>'discipline' discipline
from private.grcon_sigem_row_map m
join private.grcon_sigem_query_snapshots s on s.id=m.snapshot_id
join private.grcon_sigem_row_contents d on d.id=m.content_id and d.workspace_id=s.workspace_id and d.contract_id=s.contract_id;

create view private.grcon_sigem_query_rows with(security_invoker=true) as
select r.* from private.grcon_sigem_raw_rows r
where not exists(select 1 from private.grcon_sigem_cache_catalog c where c.snapshot_id=r.snapshot_id and c.ready)
union all
select r.* from private.grcon_sigem_cached_rows r
join private.grcon_sigem_cache_catalog c on c.snapshot_id=r.snapshot_id and c.ready;
revoke all on private.grcon_sigem_cached_rows,private.grcon_sigem_query_rows from public,anon,authenticated,service_role;

-- Preparation uses small ordered batches and compares all original columns.
-- Hash equality alone never proves equality or merges different contracts.
create function private.grcon_sigem_cache_batch(target_snapshot uuid,expected_after integer,batch_size integer default 1000)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s private.grcon_sigem_query_snapshots;c private.grcon_sigem_cache_catalog;r private.grcon_sigem_raw_rows;
 content jsonb;identity_part jsonb;digest bytea;cid bigint;stored jsonb;source_row_value integer;last_row integer;prepared integer:=0;
begin
 if expected_after is null or expected_after<0 or batch_size is null or batch_size not between 1 and 5000 then raise exception 'SIGEM_CACHE_INPUT_INVALID';end if;
 select * into strict s from private.grcon_sigem_query_snapshots where id=target_snapshot for key share;
 if s.status not in('active','archived') or s.record_count<1 then raise exception 'SIGEM_CACHE_SOURCE_INVALID';end if;
 insert into private.grcon_sigem_cache_catalog(snapshot_id,source_json) values(s.id,to_jsonb(s)) on conflict do nothing;
 select * into strict c from private.grcon_sigem_cache_catalog where snapshot_id=s.id for update;
 if (c.source_json-'status')<>(to_jsonb(s)-'status') then raise exception 'SIGEM_CACHE_SOURCE_CHANGED';end if;
 if c.ready or expected_after<c.after_row then return jsonb_build_object('after',c.after_row,'ready',c.ready);end if;
 if expected_after<>c.after_row then raise exception 'SIGEM_CACHE_CURSOR_INVALID';end if;
 last_row:=expected_after;
 for r in select * from private.grcon_sigem_raw_rows where snapshot_id=s.id and row_number>expected_after order by row_number limit batch_size loop
  if r.row_number<>last_row+1 then raise exception 'SIGEM_CACHE_SOURCE_GAP';end if;
  content:=(to_jsonb(r)-'snapshot_id'-'row_number')||jsonb_build_object('payload',r.payload-'id'-'sourceRow');
  digest:=sha256(convert_to(content::text,'UTF8'));
  cid:=null;
  insert into private.grcon_sigem_row_contents(workspace_id,contract_id,content_hash,row_content)
  values(s.workspace_id,s.contract_id,digest,content) on conflict do nothing returning id into cid;
  if cid is null then
   select id,row_content into strict cid,stored from private.grcon_sigem_row_contents where workspace_id=s.workspace_id and contract_id=s.contract_id and content_hash=digest;
   if stored<>content then raise exception 'SIGEM_CACHE_HASH_COLLISION';end if;
  end if;
  identity_part:=(case when r.payload?'id' then jsonb_build_object('id',r.payload->'id') else '{}'::jsonb end)||
    (case when r.payload?'sourceRow' then jsonb_build_object('sourceRow',r.payload->'sourceRow') else '{}'::jsonb end);
  source_row_value:=null;
  if jsonb_typeof(r.payload->'sourceRow')='number' and (r.payload->>'sourceRow')~'^[0-9]{1,9}$'
   and r.payload->'id'=to_jsonb((r.payload->>'document')||'|'||(r.payload->>'revision')||'|'||(r.payload->>'sourceRow')) then
   source_row_value:=(r.payload->>'sourceRow')::integer;identity_part:=null;
  end if;
  insert into private.grcon_sigem_row_map(snapshot_id,row_number,content_id,source_row,identity_payload)
   values(s.id,r.row_number,cid,source_row_value,identity_part) on conflict do nothing;
  if not exists(select 1 from private.grcon_sigem_cached_rows saved where saved.snapshot_id=s.id and saved.row_number=r.row_number and to_jsonb(saved)=to_jsonb(r)) then raise exception 'SIGEM_CACHE_CONTENT_MISMATCH';end if;
  prepared:=prepared+1;last_row:=r.row_number;
 end loop;
 if prepared=0 and last_row<s.record_count then raise exception 'SIGEM_CACHE_SOURCE_INCOMPLETE';end if;
 if last_row=s.record_count then
  if (select count(*) from private.grcon_sigem_row_map where snapshot_id=s.id)<>s.record_count then raise exception 'SIGEM_CACHE_COUNT_MISMATCH';end if;
  update private.grcon_sigem_cache_catalog set ready=true,after_row=last_row where snapshot_id=s.id;
 else update private.grcon_sigem_cache_catalog set after_row=last_row where snapshot_id=s.id;end if;
 return jsonb_build_object('after',last_row,'ready',last_row=s.record_count,'prepared',prepared);
end $$;
revoke all on function private.grcon_sigem_cache_batch(uuid,integer,integer) from public,anon,authenticated,service_role;

-- Explicit administrator operation, never called by the client or a schedule.
-- The caller must independently verify the supplied Turso/R2 audit receipt.
create function private.grcon_sigem_cache_release_raw(target_snapshot uuid,verified_audit jsonb)
returns bigint language plpgsql security invoker set search_path='' as $$
declare s private.grcon_sigem_query_snapshots;c private.grcon_sigem_cache_catalog;n bigint;
begin
 select * into strict s from private.grcon_sigem_query_snapshots where id=target_snapshot for key share;
 select * into strict c from private.grcon_sigem_cache_catalog where snapshot_id=s.id for update;
 if not c.ready or c.after_row<>s.record_count or verified_audit->>'id' is distinct from s.id::text
  or verified_audit->'fullAudit' is distinct from 'true'::jsonb
  or verified_audit->>'validatedRecords' is distinct from s.record_count::text
  or verified_audit->>'count' is distinct from s.record_count::text
  or coalesce(verified_audit->>'checksum','')!~'^[a-f0-9]{64}$'
  or coalesce(verified_audit->>'manifestHash','')!~'^[a-f0-9]{64}$'
 then raise exception 'SIGEM_CACHE_AUDIT_REQUIRED';end if;
 if (select count(*) from private.grcon_sigem_cached_rows where snapshot_id=s.id)<>s.record_count
 or exists(select 1 from private.grcon_sigem_raw_rows r left join private.grcon_sigem_cached_rows saved using(snapshot_id,row_number)
  where r.snapshot_id=s.id and to_jsonb(r) is distinct from to_jsonb(saved)) then raise exception 'SIGEM_CACHE_CONTENT_MISMATCH';end if;
 delete from private.grcon_sigem_raw_rows where snapshot_id=s.id;get diagnostics n=row_count;
 update private.grcon_sigem_cache_catalog set audit_proof=verified_audit,raw_removed_at=now() where snapshot_id=s.id;
 return n;
end $$;
revoke all on function private.grcon_sigem_cache_release_raw(uuid,jsonb) from public,anon,authenticated,service_role;

-- Operational rollback is a local, lossless reconstruction, independent of
-- external availability. Readers see either representation in one transaction.
create function private.grcon_sigem_cache_restore_raw(target_snapshot uuid)
returns bigint language plpgsql security invoker set search_path='' as $$
declare s private.grcon_sigem_query_snapshots;c private.grcon_sigem_cache_catalog;n bigint;
begin
 select * into strict s from private.grcon_sigem_query_snapshots where id=target_snapshot for key share;
 select * into strict c from private.grcon_sigem_cache_catalog where snapshot_id=s.id for update;
 if not c.ready then raise exception 'SIGEM_CACHE_NOT_READY';end if;
 insert into private.grcon_sigem_raw_rows select * from private.grcon_sigem_cached_rows where snapshot_id=s.id on conflict do nothing;
 get diagnostics n=row_count;
 if (select count(*) from private.grcon_sigem_raw_rows where snapshot_id=s.id)<>s.record_count
 or exists(select 1 from private.grcon_sigem_cached_rows saved left join private.grcon_sigem_raw_rows r using(snapshot_id,row_number)
  where saved.snapshot_id=s.id and to_jsonb(r) is distinct from to_jsonb(saved)) then raise exception 'SIGEM_CACHE_CONTENT_MISMATCH';end if;
 update private.grcon_sigem_cache_catalog set ready=false,after_row=0,raw_removed_at=null where snapshot_id=s.id;
 return n;
end $$;
revoke all on function private.grcon_sigem_cache_restore_raw(uuid) from public,anon,authenticated,service_role;

create function private.grcon_sigem_storage_bytes() returns bigint language sql stable set search_path='' as $$
 select pg_total_relation_size('private.grcon_sigem_raw_rows')+pg_total_relation_size('private.grcon_sigem_row_contents')+
 pg_total_relation_size('private.grcon_sigem_row_map')+pg_total_relation_size('private.grcon_sigem_cache_catalog');
$$;
revoke all on function private.grcon_sigem_storage_bytes() from public,anon,authenticated,service_role;

-- Preserve the installed authorization/publication logic and reset cached plans
-- against the compatibility view. Only the pending-upload writer uses raw rows.
do $$ declare f record;definition text;begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.prokind='f' and p.proname in('grcon_sigem_comparison_rows','grcon_master_query',
   'grcon_document_task_deadlines','grcon_sigem_storage_control','grcon_sigem_query_page','grcon_run_sigem_comparison',
   'grcon_sigem_query_chunk','grcon_sigem_query_publish','grcon_monitored_documents_list','grcon_sigem_query_history','grcon_vault_operations') loop
  definition:=pg_get_functiondef(f.oid);
  if f.proname='grcon_sigem_query_chunk' then definition:=replace(definition,'private.grcon_sigem_query_rows','private.grcon_sigem_raw_rows');
  elsif f.proname='grcon_sigem_storage_control' then definition:=replace(definition,'pg_total_relation_size(''private.grcon_sigem_query_rows'')','private.grcon_sigem_storage_bytes()');end if;
  execute definition;
 end loop;
end $$;
commit;
