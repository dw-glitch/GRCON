-- Shared Consulta Geral history management: auditable list, activation and soft deletion.
begin;

alter table private.grcon_sigem_query_snapshots
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;


create or replace function private.grcon_sigem_query_history(target_workspace uuid)
returns table(
  snapshot_id uuid,
  file_name text,
  record_count integer,
  unique_document_count bigint,
  et_count bigint,
  n1710_count bigint,
  published_at timestamptz,
  created_at timestamptz,
  status text,
  is_current boolean,
  created_by uuid,
  created_by_name text,
  created_by_email text,
  metadata jsonb
)
language plpgsql security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not private.grcon_is_member(target_workspace) then
    raise exception 'Sem acesso à área de trabalho.' using errcode='42501';
  end if;

  return query
  select
    s.id,
    s.file_name,
    s.record_count,
    count(distinct r.document_key) filter (where coalesce(r.document_key,'') <> ''),
    count(distinct (r.document_key,r.revision_key)) filter (
      where coalesce(r.document_key,'') <> ''
        and coalesce(r.payload->>'document','') ~* '^[A-Z0-9]{3}[-_]RNEST[-_]'
    ),
    count(distinct (r.document_key,r.revision_key)) filter (
      where coalesce(r.document_key,'') <> ''
        and coalesce(r.payload->>'document','') ~* '^(?:[IAFLED]-)?[A-Z0-9]{2,3}-5290[.]00-22313-[A-Z0-9]{3}-C1O-[0-9]{3,4}$'
    ),
    s.published_at,
    s.created_at,
    s.status,
    s.status='active',
    s.created_by,
    p.display_name,
    p.email,
    s.metadata
  from private.grcon_sigem_query_snapshots s
  left join private.grcon_sigem_query_rows r on r.snapshot_id=s.id
  left join public.grcon_profiles p on p.id=s.created_by
  where s.workspace_id=target_workspace
    and s.status in ('active','archived')
    and s.deleted_at is null
  group by s.id,p.display_name,p.email
  order by (s.status='active') desc, coalesce(s.published_at,s.created_at) desc, s.id desc;
end $$;

create or replace function public.grcon_sigem_query_history(target_workspace uuid)
returns table(
  snapshot_id uuid,
  file_name text,
  record_count integer,
  unique_document_count bigint,
  et_count bigint,
  n1710_count bigint,
  published_at timestamptz,
  created_at timestamptz,
  status text,
  is_current boolean,
  created_by uuid,
  created_by_name text,
  created_by_email text,
  metadata jsonb
)
language sql security invoker
set search_path=''
as $$ select * from private.grcon_sigem_query_history(target_workspace); $$;

revoke all on function private.grcon_sigem_query_history(uuid) from public,anon;
revoke all on function public.grcon_sigem_query_history(uuid) from public,anon;
grant execute on function private.grcon_sigem_query_history(uuid) to authenticated;
grant execute on function public.grcon_sigem_query_history(uuid) to authenticated;

create or replace function private.grcon_sigem_query_activate(target_workspace uuid,target_snapshot uuid)
returns uuid
language plpgsql security definer
set search_path=''
as $$
declare
  target private.grcon_sigem_query_snapshots;
begin
  if auth.uid() is null or not private.grcon_has_role(target_workspace,array['owner']) then
    raise exception 'Somente o proprietário pode selecionar a Consulta Geral atual.' using errcode='42501';
  end if;

  perform 1 from public.grcon_workspaces where id=target_workspace for update;
  select * into target
  from private.grcon_sigem_query_snapshots
  where id=target_snapshot and workspace_id=target_workspace and status in ('active','archived') and deleted_at is null
  for update;

  if not found then raise exception 'Base indisponível.' using errcode='22023'; end if;
  if target.status='active' then return target.id; end if;

  update private.grcon_sigem_query_snapshots
  set status='archived'
  where workspace_id=target_workspace and status='active';

  update private.grcon_sigem_query_snapshots
  set status='active'
  where id=target.id;

  insert into public.grcon_audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_workspace,auth.uid(),'sigem_query_activated','sigem_query',target.id::text,
    jsonb_build_object('arquivo',target.file_name,'registros',target.record_count));

  return target.id;
end $$;

create or replace function public.grcon_sigem_query_activate(target_workspace uuid,target_snapshot uuid)
returns uuid
language sql security invoker
set search_path=''
as $$ select private.grcon_sigem_query_activate(target_workspace,target_snapshot); $$;

revoke all on function private.grcon_sigem_query_activate(uuid,uuid) from public,anon;
revoke all on function public.grcon_sigem_query_activate(uuid,uuid) from public,anon;
grant execute on function private.grcon_sigem_query_activate(uuid,uuid) to authenticated;
grant execute on function public.grcon_sigem_query_activate(uuid,uuid) to authenticated;

create or replace function private.grcon_sigem_query_delete(target_workspace uuid,target_snapshot uuid)
returns jsonb
language plpgsql security definer
set search_path=''
as $$
declare
  target private.grcon_sigem_query_snapshots;
  replacement uuid;
begin
  if auth.uid() is null or not private.grcon_has_role(target_workspace,array['owner']) then
    raise exception 'Somente o proprietário pode excluir bases da Consulta Geral.' using errcode='42501';
  end if;

  perform 1 from public.grcon_workspaces where id=target_workspace for update;
  select * into target
  from private.grcon_sigem_query_snapshots
  where id=target_snapshot and workspace_id=target_workspace and status in ('active','archived') and deleted_at is null
  for update;

  if not found then raise exception 'Base indisponível ou já removida.' using errcode='22023'; end if;

  if target.status='active' then
    select s.id into replacement
    from private.grcon_sigem_query_snapshots s
    where s.workspace_id=target_workspace
      and s.status='archived'
      and s.deleted_at is null
      and s.id<>target_snapshot
    order by coalesce(s.published_at,s.created_at) desc,s.id desc
    limit 1;
  end if;

  update private.grcon_sigem_query_snapshots
  set status=case when status='active' then 'archived' else status end,
      deleted_at=now(),deleted_by=auth.uid()
  where id=target_snapshot;

  if replacement is not null then
    update private.grcon_sigem_query_snapshots set status='active' where id=replacement;
  end if;

  insert into public.grcon_audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_workspace,auth.uid(),'sigem_query_deleted','sigem_query',target.id::text,
    jsonb_build_object(
      'arquivo',target.file_name,
      'registros',target.record_count,
      'eraAtual',target.status='active',
      'novaAtual',replacement
    ));

  return jsonb_build_object(
    'removedSnapshotId',target_snapshot,
    'removedWasCurrent',target.status='active',
    'activeSnapshotId',replacement
  );
end $$;

create or replace function public.grcon_sigem_query_delete(target_workspace uuid,target_snapshot uuid)
returns jsonb
language sql security invoker
set search_path=''
as $$ select private.grcon_sigem_query_delete(target_workspace,target_snapshot); $$;

revoke all on function private.grcon_sigem_query_delete(uuid,uuid) from public,anon;
revoke all on function public.grcon_sigem_query_delete(uuid,uuid) from public,anon;
grant execute on function private.grcon_sigem_query_delete(uuid,uuid) to authenticated;
grant execute on function public.grcon_sigem_query_delete(uuid,uuid) to authenticated;


create or replace function private.grcon_sigem_query_page(target_workspace uuid,target_snapshot uuid,after_row integer default 0,page_size integer default 1000)
returns table(row_number integer,payload jsonb)
language plpgsql security definer set search_path=''
as $page$
begin
 if auth.uid() is null or not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso à área de trabalho.' using errcode='42501'; end if;
 if not exists(
   select 1 from private.grcon_sigem_query_snapshots s
   where s.id=target_snapshot and s.workspace_id=target_workspace
     and s.status in ('active','archived') and s.deleted_at is null
 ) then raise exception 'Versão indisponível.' using errcode='22023'; end if;
 return query
 select r.row_number,r.payload
 from private.grcon_sigem_query_rows r
 where r.snapshot_id=target_snapshot and r.row_number>coalesce(after_row,0)
 order by r.row_number
 limit least(greatest(coalesce(page_size,1000),1),1000);
end $page$;

create or replace function public.grcon_sigem_query_page(target_workspace uuid,target_snapshot uuid,after_row integer default 0,page_size integer default 1000)
returns table(row_number integer,payload jsonb)
language sql security invoker set search_path=''
as $page_public$ select * from private.grcon_sigem_query_page(target_workspace,target_snapshot,after_row,page_size); $page_public$;

revoke all on function private.grcon_sigem_query_page(uuid,uuid,integer,integer) from public,anon;
revoke all on function public.grcon_sigem_query_page(uuid,uuid,integer,integer) from public,anon;
grant execute on function private.grcon_sigem_query_page(uuid,uuid,integer,integer) to authenticated;
grant execute on function public.grcon_sigem_query_page(uuid,uuid,integer,integer) to authenticated;

commit;
