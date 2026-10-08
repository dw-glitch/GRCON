-- Central de alocação única por workspace. Dados imutáveis, ativação atômica e leitura paginada.
begin;
do $$ begin
 if to_regclass('public.grcon_workspaces') is null or to_regclass('public.grcon_audit_events') is null
    or to_regprocedure('private.grcon_is_member(uuid)') is null
    or to_regprocedure('private.grcon_has_role(uuid,text[])') is null then
  raise exception 'Schema GRCON incompatível. Conferir as migrations de autenticação antes de aplicar esta migration.';
 end if;
end; $$;
create table if not exists private.grcon_allocation_registry_snapshots (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
 file_name text not null,
 expected_count integer not null check (expected_count between 1 and 100000),
 record_count integer not null default 0,
 metadata jsonb not null default '{}'::jsonb,
 expected_active uuid,
 status text not null default 'pending' check (status in ('pending','active','archived')),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 published_at timestamptz
);
create unique index if not exists grcon_allocation_registry_one_active on private.grcon_allocation_registry_snapshots(workspace_id) where status='active';
create table if not exists private.grcon_allocation_registry_rows (
 snapshot_id uuid not null references private.grcon_allocation_registry_snapshots(id) on delete cascade,
 row_number integer not null check (row_number between 1 and 100000),
 payload jsonb not null check (jsonb_typeof(payload)='object'),
 primary key(snapshot_id,row_number)
);
-- Whole snapshots are downloaded once. The primary key serves the actual keyset query.
alter table private.grcon_allocation_registry_snapshots enable row level security;
alter table private.grcon_allocation_registry_rows enable row level security;
revoke all on table private.grcon_allocation_registry_snapshots from public, anon, authenticated;
revoke all on table private.grcon_allocation_registry_rows from public, anon, authenticated;

create or replace function private.grcon_allocation_registry_current(target_workspace uuid)
returns table(snapshot_id uuid,file_name text,record_count integer,published_at timestamptz,metadata jsonb)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso à área de trabalho.' using errcode='42501'; end if;
 return query select s.id,s.file_name,s.record_count,s.published_at,s.metadata from private.grcon_allocation_registry_snapshots s where s.workspace_id=target_workspace and s.status='active';
end; $$;

create or replace function private.grcon_allocation_registry_page(target_workspace uuid,target_snapshot uuid,after_row integer default 0,page_size integer default 1000)
returns table(row_number integer,payload jsonb)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso à área de trabalho.' using errcode='42501'; end if;
 if not exists(select 1 from private.grcon_allocation_registry_snapshots s where s.id=target_snapshot and s.workspace_id=target_workspace and s.status in ('active','archived')) then raise exception 'Versão indisponível.' using errcode='22023'; end if;
 return query select r.row_number,r.payload from private.grcon_allocation_registry_rows r where r.snapshot_id=target_snapshot and r.row_number>coalesce(after_row,0) order by r.row_number limit least(greatest(coalesce(page_size,1000),1),1000);
end; $$;

create or replace function private.grcon_allocation_registry_begin(target_workspace uuid,source_file text,expected_count integer,source_metadata jsonb,expected_active uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare upload_id uuid;
begin
 if auth.uid() is null or not private.grcon_has_role(target_workspace,array['owner']) then raise exception 'Somente o proprietário pode publicar.' using errcode='42501'; end if;
 if expected_count is null or expected_count not between 1 and 100000 or length(btrim(coalesce(source_file,''))) not between 1 and 255 or jsonb_typeof(source_metadata) is distinct from 'object' or octet_length(source_metadata::text)>65536 then raise exception 'Arquivo ou metadados inválidos.' using errcode='22023'; end if;
 insert into private.grcon_allocation_registry_snapshots(workspace_id,file_name,expected_count,metadata,expected_active,created_by) values(target_workspace,source_file,expected_count,source_metadata,expected_active,auth.uid()) returning id into upload_id;
 return upload_id;
end; $$;

create or replace function private.grcon_allocation_registry_chunk(target_workspace uuid,upload_id uuid,first_row integer,rows jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare s private.grcon_allocation_registry_snapshots; total integer;
begin
 if auth.uid() is null or not private.grcon_has_role(target_workspace,array['owner']) then raise exception 'Sem permissão para publicar.' using errcode='42501'; end if;
 select * into s from private.grcon_allocation_registry_snapshots where id=upload_id and workspace_id=target_workspace and status='pending' and created_by=auth.uid() for update;
 if not found then raise exception 'Envio indisponível.' using errcode='22023'; end if;
 if jsonb_typeof(rows) is distinct from 'array' then raise exception 'Lote inválido.' using errcode='22023'; end if;
 if first_row is null or first_row<1 or jsonb_array_length(rows) not between 1 and 500 or first_row+jsonb_array_length(rows)-1>s.expected_count or octet_length(rows::text)>4000000 then raise exception 'Lote ou contagem inválida.' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(rows) r
   where jsonb_typeof(r) is distinct from 'object'
      or length(btrim(coalesce(r->>'document',''))) not between 7 and 255
      or coalesce(r->>'document','') !~ '[0-9]'
      or jsonb_typeof(r->'sourceRow') is distinct from 'number'
      or coalesce(r->>'sourceRow','') !~ '^[1-9][0-9]{0,6}$'
      or case when coalesce(r->>'sourceRow','') ~ '^[1-9][0-9]{0,6}$' then (r->>'sourceRow')::integer > 1048576 else false end
      or r - array['document','allocation','allocationStatus','workflow','active','databook','ldSheet','ldVersion','sentAt','sourceRow'] <> '{}'::jsonb
      or exists(select 1 from jsonb_each(r) f
        where f.key <> 'sourceRow' and (jsonb_typeof(f.value) is distinct from 'string'
          or length(f.value#>>'{}') > case when f.key='databook' then 2048 when f.key='allocationStatus' then 1024 else 255 end)))
 then raise exception 'Vínculo documental ou campos inválidos.' using errcode='22023'; end if;
 insert into private.grcon_allocation_registry_rows(snapshot_id,row_number,payload) select upload_id,first_row+n::integer-1,r from jsonb_array_elements(rows) with ordinality as t(r,n) on conflict(snapshot_id,row_number) do update set payload=excluded.payload;
 select count(*) into total from private.grcon_allocation_registry_rows where snapshot_id=upload_id;
 return total;
end; $$;

create or replace function private.grcon_allocation_registry_publish(target_workspace uuid,upload_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare s private.grcon_allocation_registry_snapshots; active_id uuid; total integer;
begin
 if auth.uid() is null or not private.grcon_has_role(target_workspace,array['owner']) then raise exception 'Sem permissão para publicar.' using errcode='42501'; end if;
 perform 1 from public.grcon_workspaces where id=target_workspace for update;
 select * into s from private.grcon_allocation_registry_snapshots where id=upload_id and workspace_id=target_workspace and status in ('pending','active') and created_by=auth.uid() for update;
 if not found then raise exception 'Envio indisponível.' using errcode='22023'; end if;
 if s.status='active' then return upload_id; end if;
 select id into active_id from private.grcon_allocation_registry_snapshots where workspace_id=target_workspace and status='active';
 if active_id is distinct from s.expected_active then raise exception 'Outro usuário publicou uma nova Central de alocação. Recarregue e revise sua prévia antes de publicar novamente.' using errcode='40001'; end if;
 select count(*) into total from private.grcon_allocation_registry_rows where snapshot_id=upload_id;
 if total<>s.expected_count then raise exception 'Carga incompleta: % de % registros.',total,s.expected_count using errcode='22023'; end if;
 if not exists(select 1 from private.grcon_allocation_registry_rows where snapshot_id=upload_id and length(btrim(coalesce(payload->>'allocationStatus','')))>0) then raise exception 'Central de alocação sem status registrado.' using errcode='22023'; end if;
 update private.grcon_allocation_registry_snapshots set status='archived' where workspace_id=target_workspace and status='active';
 update private.grcon_allocation_registry_snapshots set status='active',record_count=total,published_at=now() where id=upload_id;
 insert into public.grcon_audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata) values(target_workspace,auth.uid(),'allocation_registry_published','allocation_registry',upload_id::text,jsonb_build_object('arquivo',s.file_name,'registros',total,'checksum',s.metadata->>'checksum'));
 delete from private.grcon_allocation_registry_snapshots where workspace_id=target_workspace and ((status='archived' and published_at<now()-interval '7 days') or (status='pending' and created_at<now()-interval '1 day'));
 return upload_id;
end; $$;

create or replace function public.grcon_allocation_registry_current(target_workspace uuid) returns table(snapshot_id uuid,file_name text,record_count integer,published_at timestamptz,metadata jsonb)
language sql security invoker set search_path='' as $$ select * from private.grcon_allocation_registry_current(target_workspace); $$;
revoke all on function public.grcon_allocation_registry_current(uuid) from public,anon;
revoke all on function private.grcon_allocation_registry_current(uuid) from public,anon;
grant execute on function public.grcon_allocation_registry_current(uuid) to authenticated;
grant execute on function private.grcon_allocation_registry_current(uuid) to authenticated;

create or replace function public.grcon_allocation_registry_page(target_workspace uuid,target_snapshot uuid,after_row integer default 0,page_size integer default 1000) returns table(row_number integer,payload jsonb)
language sql security invoker set search_path='' as $$ select * from private.grcon_allocation_registry_page(target_workspace,target_snapshot,after_row,page_size); $$;
revoke all on function public.grcon_allocation_registry_page(uuid,uuid,integer,integer) from public,anon;
revoke all on function private.grcon_allocation_registry_page(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.grcon_allocation_registry_page(uuid,uuid,integer,integer) to authenticated;
grant execute on function private.grcon_allocation_registry_page(uuid,uuid,integer,integer) to authenticated;

create or replace function public.grcon_allocation_registry_begin(target_workspace uuid,source_file text,expected_count integer,source_metadata jsonb,expected_active uuid) returns uuid
language sql security invoker set search_path='' as $$ select private.grcon_allocation_registry_begin(target_workspace,source_file,expected_count,source_metadata,expected_active); $$;
revoke all on function public.grcon_allocation_registry_begin(uuid,text,integer,jsonb,uuid) from public,anon;
revoke all on function private.grcon_allocation_registry_begin(uuid,text,integer,jsonb,uuid) from public,anon;
grant execute on function public.grcon_allocation_registry_begin(uuid,text,integer,jsonb,uuid) to authenticated;
grant execute on function private.grcon_allocation_registry_begin(uuid,text,integer,jsonb,uuid) to authenticated;

create or replace function public.grcon_allocation_registry_chunk(target_workspace uuid,upload_id uuid,first_row integer,rows jsonb) returns integer
language sql security invoker set search_path='' as $$ select private.grcon_allocation_registry_chunk(target_workspace,upload_id,first_row,rows); $$;
revoke all on function public.grcon_allocation_registry_chunk(uuid,uuid,integer,jsonb) from public,anon;
revoke all on function private.grcon_allocation_registry_chunk(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.grcon_allocation_registry_chunk(uuid,uuid,integer,jsonb) to authenticated;
grant execute on function private.grcon_allocation_registry_chunk(uuid,uuid,integer,jsonb) to authenticated;

create or replace function public.grcon_allocation_registry_publish(target_workspace uuid,upload_id uuid) returns uuid
language sql security invoker set search_path='' as $$ select private.grcon_allocation_registry_publish(target_workspace,upload_id); $$;
revoke all on function public.grcon_allocation_registry_publish(uuid,uuid) from public,anon;
revoke all on function private.grcon_allocation_registry_publish(uuid,uuid) from public,anon;
grant execute on function public.grcon_allocation_registry_publish(uuid,uuid) to authenticated;
grant execute on function private.grcon_allocation_registry_publish(uuid,uuid) to authenticated;

commit;
