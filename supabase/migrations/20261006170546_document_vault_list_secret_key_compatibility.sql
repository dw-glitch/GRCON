create or replace function private.grcon_document_vault_list(target_workspace uuid, actor_id uuid, input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
  member_role text;
  cursor_value bigint := 0;
  page_limit integer := 100;
  wanted text := '';
  allocation_filter text := 'all';
  active_snapshot uuid;
  result_rows jsonb := '[]'::jsonb;
  has_more boolean := false;
  next_cursor bigint := null;
begin
  if actor_id is null or target_workspace is null then
    raise exception 'Sessão não identificada.' using errcode='42501';
  end if;
  select m.role into member_role
  from public.grcon_memberships m
  where m.workspace_id = target_workspace and m.user_id = actor_id and m.active;
  if not found then
    raise exception 'Sem acesso à área de trabalho.' using errcode='42501';
  end if;
  if jsonb_typeof(coalesce(input,'{}'::jsonb)) is distinct from 'object' then
    raise exception 'Consulta inválida.' using errcode='22023';
  end if;

  cursor_value := greatest(0, coalesce((input->>'after')::bigint,0));
  page_limit := least(200, greatest(1, coalesce((input->>'limit')::integer,100)));
  wanted := lower(btrim(coalesce(input->>'q','')));
  if length(wanted) > 160 then raise exception 'Busca muito longa.' using errcode='22023'; end if;
  allocation_filter := lower(btrim(coalesce(input->>'allocation','all')));
  if allocation_filter not in ('all','allocated','not_allocated') then
    raise exception 'Filtro de alocação inválido.' using errcode='22023';
  end if;

  select s.id into active_snapshot
  from private.grcon_planned_document_snapshots s
  where s.workspace_id = target_workspace and s.status = 'active'
  order by s.published_at desc nulls last, s.created_at desc
  limit 1;

  with annotated as (
    select
      d.id, d.sequence, d.file_name, d.relative_path, d.document_code, d.identity_code,
      d.revision, d.format, d.size_bytes, d.sha256, d.status, d.identity_conflict,
      d.created_by, d.created_at, d.verified_at,
      case when active_snapshot is null then false else exists (
        select 1
        from private.grcon_planned_document_items p
        where p.snapshot_id = active_snapshot
          and p.document_key in (d.identity_code, d.document_code)
      ) end as allocated
    from private.grcon_document_files d
    where d.workspace_id = target_workspace
      and d.status = 'ready'
      and d.sequence > cursor_value
      and (
        wanted = ''
        or position(wanted in lower(d.file_name)) > 0
        or position(wanted in lower(d.document_code)) > 0
        or position(wanted in lower(d.identity_code)) > 0
        or position(wanted in lower(d.revision)) > 0
      )
  ),
  filtered as (
    select *
    from annotated
    where allocation_filter = 'all'
       or (allocation_filter = 'allocated' and allocated)
       or (allocation_filter = 'not_allocated' and not allocated)
    order by sequence
    limit page_limit + 1
  ),
  page as (
    select * from filtered order by sequence limit page_limit
  )
  select
    coalesce(jsonb_agg(to_jsonb(page) order by sequence),'[]'::jsonb),
    exists(select 1 from filtered offset page_limit),
    (select max(sequence) from page)
  into result_rows, has_more, next_cursor
  from page;

  return jsonb_build_object(
    'files', result_rows,
    'next', case when has_more then next_cursor else null end,
    'has_more', has_more,
    'allocation_snapshot', active_snapshot
  );
end
$fn$;
revoke all on function private.grcon_document_vault_list(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function private.grcon_document_vault_list(uuid,uuid,jsonb) to service_role;