begin;

create index if not exists grcon_requests_rows_document_identity_idx
on private.grcon_requests_rows (
  base_id,
  (regexp_replace(upper(regexp_replace(btrim(payload->>'document'),'\\s+','','g')),'^NT-',''))
);

create or replace function private.grcon_document_vault_list(
  target_workspace uuid, actor_id uuid, input jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c uuid; member_role text; cursor_value bigint := 0; page_limit integer := 100;
  wanted text := ''; allocation_filter text := 'all'; active_requests uuid;
  result_rows jsonb := '[]'::jsonb; has_more boolean := false; next_cursor bigint := null;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Somente a API de servidor pode consultar o Cofre.' using errcode='42501'; end if;
  if actor_id is null or target_workspace is null then raise exception 'Sessão não identificada.' using errcode='42501'; end if;
  select m.contract_id,m.role into c,member_role
  from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
  where m.workspace_id=target_workspace and m.user_id=actor_id and m.active;
  if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(input,'{}'::jsonb)) is distinct from 'object' then raise exception 'Consulta inválida.' using errcode='22023'; end if;
  cursor_value := greatest(0,coalesce((input->>'after')::bigint,0));
  page_limit := least(200,greatest(1,coalesce((input->>'limit')::integer,100)));
  wanted := lower(btrim(coalesce(input->>'q','')));
  if length(wanted)>160 then raise exception 'Busca muito longa.' using errcode='22023'; end if;
  allocation_filter := lower(btrim(coalesce(input->>'allocation','all')));
  if allocation_filter not in ('all','allocated','not_allocated','not_identified') then raise exception 'Filtro de alocação inválido.' using errcode='22023'; end if;

  select b.id into active_requests from private.grcon_requests_bases b
  where b.workspace_id=target_workspace and b.contract_id=c and b.status='active'
  order by b.published_at desc nulls last,b.created_at desc limit 1;

  with request_values as (
    select regexp_replace(upper(regexp_replace(btrim(r.payload->>'document'),'\\s+','','g')),'^NT-','') as identity_code,
      btrim(coalesce(r.payload->'data'->>'Alocação',r.payload->'data'->>'ALOCAÇÃO',r.payload->'data'->>'Alocacao',r.payload->'data'->>'ALOCACAO','')) as allocation_value
    from private.grcon_requests_rows r where r.base_id=active_requests
  ),
  request_alloc as (
    select identity_code,count(*)::integer as request_count,
      string_agg(distinct allocation_value,' · ' order by allocation_value) filter(where allocation_value<>'') as allocation_value
    from request_values group by identity_code
  ),
  annotated as (
    select d.id,d.sequence,d.file_name,d.relative_path,d.document_code,d.identity_code,d.revision,d.format,d.size_bytes,d.sha256,d.status,d.identity_conflict,
      d.created_by,(select coalesce(nullif(p.display_name,''),p.email) from public.grcon_profiles p where p.id=d.created_by) as created_by_name,
      d.created_at,d.verified_at,(ra.allocation_value is not null) as allocated,(coalesce(ra.request_count,0)>0) as allocation_identified,
      case when coalesce(ra.request_count,0)=0 then 'Não identificado' when ra.allocation_value is null then 'Não informado no Controle' else ra.allocation_value end as allocation_label,
      'Controle de Solicitações'::text as allocation_source,active_requests as requests_base_id
    from private.grcon_document_files d left join request_alloc ra on ra.identity_code=d.identity_code
    where d.workspace_id=target_workspace and d.contract_id=c and d.status in ('ready','deleting','delete_failed') and d.sequence>cursor_value
  ),
  filtered as (
    select * from annotated
    where (wanted='' or position(wanted in lower(file_name))>0 or position(wanted in lower(document_code))>0 or position(wanted in lower(identity_code))>0 or position(wanted in lower(revision))>0 or position(wanted in lower(allocation_label))>0)
      and (
        allocation_filter='all'
        or (allocation_filter='allocated' and allocated)
        or (allocation_filter='not_allocated' and allocation_identified and not allocated)
        or (allocation_filter='not_identified' and not allocation_identified)
      )
    order by sequence limit page_limit+1
  ),
  page as (select * from filtered order by sequence limit page_limit)
  select coalesce(jsonb_agg(to_jsonb(page) order by sequence),'[]'::jsonb),exists(select 1 from filtered offset page_limit),(select max(sequence) from page)
  into result_rows,has_more,next_cursor from page;

  return jsonb_build_object('files',result_rows,'next',case when has_more then next_cursor else null end,'has_more',has_more,
    'allocation_source','Controle de Solicitações','requests_base_id',active_requests);
end $$;

create or replace function private.grcon_document_vault_lookup(
  target_workspace uuid, actor_id uuid, input jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare c uuid; active_requests uuid; results jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Somente a API de servidor pode consultar o Cofre.' using errcode='42501'; end if;
  select m.contract_id into c from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
  where m.workspace_id=target_workspace and m.user_id=actor_id and m.active;
  if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
  if jsonb_typeof(input->'items') is distinct from 'array' or jsonb_array_length(input->'items') not between 1 and 500 then raise exception 'Consulta em lote inválida.'; end if;
  if exists(select 1 from jsonb_array_elements(input->'items') item where jsonb_typeof(item) is distinct from 'object'
    or length(btrim(coalesce(item->>'documentCode',''))) not between 1 and 255 or length(coalesce(item->>'revision',''))>40) then raise exception 'Código ou revisão inválido.'; end if;

  select b.id into active_requests from private.grcon_requests_bases b
  where b.workspace_id=target_workspace and b.contract_id=c and b.status='active'
  order by b.published_at desc nulls last,b.created_at desc limit 1;

  with request_values as (
    select regexp_replace(upper(regexp_replace(btrim(r.payload->>'document'),'\\s+','','g')),'^NT-','') as identity_code,
      btrim(coalesce(r.payload->'data'->>'Alocação',r.payload->'data'->>'ALOCAÇÃO',r.payload->'data'->>'Alocacao',r.payload->'data'->>'ALOCACAO','')) as allocation_value
    from private.grcon_requests_rows r where r.base_id=active_requests
  ),
  request_alloc as (
    select identity_code,count(*)::integer as request_count,
      string_agg(distinct allocation_value,' · ' order by allocation_value) filter(where allocation_value<>'') as allocation_value
    from request_values group by identity_code
  ),
  wanted as (
    select n,item,regexp_replace(upper(regexp_replace(btrim(item->>'documentCode'),'\\s+','','g')),'^NT-','') as code,
      upper(btrim(coalesce(item->>'revision',''))) as revision
    from jsonb_array_elements(input->'items') with ordinality t(item,n)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'requestId',left(coalesce(w.item->>'requestId',''),64),'input',left(coalesce(w.item->>'input',''),512),
    'documentCode',upper(regexp_replace(btrim(w.item->>'documentCode'),'\\s+','','g')),'requestedRevision',w.revision,'matches',matched.files
  ) order by w.n),'[]'::jsonb) into results
  from wanted w cross join lateral (
    select coalesce(jsonb_agg(to_jsonb(q) order by q.revision,q.sequence),'[]'::jsonb) as files from (
      select d.id,d.sequence,d.file_name,d.document_code,d.identity_code,d.revision,d.format,d.size_bytes,d.sha256,d.created_at,d.verified_at,
        (ra.allocation_value is not null) as allocated,(coalesce(ra.request_count,0)>0) as allocation_identified,
        case when coalesce(ra.request_count,0)=0 then 'Não identificado' when ra.allocation_value is null then 'Não informado no Controle' else ra.allocation_value end as allocation_label,
        'Controle de Solicitações'::text as allocation_source,active_requests as requests_base_id
      from private.grcon_document_files d left join request_alloc ra on ra.identity_code=d.identity_code
      where d.workspace_id=target_workspace and d.contract_id=c and d.status='ready'
        and d.identity_code=w.code and (w.revision='' or d.revision=w.revision)
    ) q
  ) matched;

  return jsonb_build_object('results',results,'contract_id',c,'allocation_source','Controle de Solicitações','requests_base_id',active_requests);
end $$;

create or replace function private.grcon_document_vault_storage_usage(
  target_workspace uuid, actor_id uuid
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare c uuid; used_bytes bigint := 0; file_count integer := 0; catalog_documents integer := 0;
  pending_objects jsonb := '[]'::jsonb; last_reconciled_at timestamptz;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Somente a API de servidor pode consultar o armazenamento.' using errcode='42501'; end if;
  select m.contract_id into c
  from public.grcon_memberships m
  join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
  where m.workspace_id=target_workspace and m.user_id=actor_id and m.active;
  if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;

  with objects as (
    select d.object_key,max(d.size_bytes)::bigint as size_bytes,
      bool_or(d.status in ('deleting','delete_failed')) as pending_delete
    from private.grcon_document_files d
    where d.workspace_id=target_workspace and d.contract_id=c
      and d.status in ('ready','deleting','delete_failed')
      and nullif(d.object_key,'') is not null
    group by d.object_key
  )
  select coalesce(sum(size_bytes),0)::bigint,count(*)::integer,
    coalesce(jsonb_agg(jsonb_build_object('object_key',object_key,'size_bytes',size_bytes))
      filter(where pending_delete),'[]'::jsonb)
  into used_bytes,file_count,pending_objects
  from objects;

  select count(*)::integer into catalog_documents
  from private.grcon_document_files d
  where d.workspace_id=target_workspace and d.contract_id=c
    and d.status in ('ready','deleting','delete_failed');

  select max(a.created_at) into last_reconciled_at
  from public.grcon_audit_events a
  where a.workspace_id=target_workspace and a.contract_id=c
    and a.action='document_vault_storage_reconciled';

  return jsonb_build_object(
    'used_bytes',used_bytes,
    'file_count',file_count,
    'catalog_documents',catalog_documents,
    'pending_objects',pending_objects,
    'last_reconciled_at',last_reconciled_at,
    'contract_id',c
  );
end $$;

create or replace function public.grcon_document_vault_storage_usage(
  target_workspace uuid, actor_id uuid
) returns jsonb language sql security invoker set search_path=''
as $$ select private.grcon_document_vault_storage_usage(target_workspace,actor_id); $$;

create or replace function private.grcon_document_vault_storage_catalog(
  target_workspace uuid, actor_id uuid
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare c uuid; files jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Somente a API de servidor pode consultar o armazenamento.' using errcode='42501'; end if;
  select m.contract_id into c
  from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
  where m.workspace_id=target_workspace and m.user_id=actor_id and m.active;
  if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'object_key',d.object_key,'size_bytes',d.size_bytes,'status',d.status,
    'document_code',d.document_code,'revision',d.revision
  ) order by d.sequence),'[]'::jsonb)
  into files
  from private.grcon_document_files d
  where d.workspace_id=target_workspace and d.contract_id=c
    and d.status in ('ready','deleting','delete_failed');
  return jsonb_build_object('files',files,'contract_id',c);
end $$;

create or replace function public.grcon_document_vault_storage_catalog(
  target_workspace uuid, actor_id uuid
) returns jsonb language sql security invoker set search_path=''
as $$ select private.grcon_document_vault_storage_catalog(target_workspace,actor_id); $$;

create or replace function private.grcon_document_vault_reconcile_log(
  target_workspace uuid, actor_id uuid, input jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare c uuid; member_role text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Somente a API de servidor pode registrar a conferência.' using errcode='42501'; end if;
  select m.contract_id,m.role into c,member_role
  from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
  where m.workspace_id=target_workspace and m.user_id=actor_id and m.active;
  if not found or member_role not in ('owner','admin') then raise exception 'Sem permissão para conferir o armazenamento.' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(input,'{}'::jsonb)) is distinct from 'object' or octet_length(input::text)>65536 then raise exception 'Resultado de conferência inválido.' using errcode='22023'; end if;
  insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_workspace,c,actor_id,'document_vault_storage_reconciled','document_vault',c::text,jsonb_build_object(
    'checked_at',coalesce(input->>'checkedAt',now()::text),
    'physical_objects',greatest(0,coalesce((input->>'physicalObjects')::integer,0)),
    'physical_bytes',greatest(0,coalesce((input->>'physicalBytes')::bigint,0)),
    'catalog_objects',greatest(0,coalesce((input->>'catalogObjects')::integer,0)),
    'missing_objects',greatest(0,coalesce((input->>'missingObjects')::integer,0)),
    'size_mismatches',greatest(0,coalesce((input->>'sizeMismatches')::integer,0)),
    'orphan_objects',greatest(0,coalesce((input->>'orphanObjects')::integer,0)),
    'removed_pending_finalization',greatest(0,coalesce((input->>'removedPendingFinalization')::integer,0))
  ));
  return jsonb_build_object('ok',true,'contract_id',c);
end $$;

create or replace function public.grcon_document_vault_reconcile_log(
  target_workspace uuid, actor_id uuid, input jsonb
) returns jsonb language sql security invoker set search_path=''
as $$ select private.grcon_document_vault_reconcile_log(target_workspace,actor_id,input); $$;

revoke all on function private.grcon_document_vault_list(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function private.grcon_document_vault_lookup(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function private.grcon_document_vault_storage_usage(uuid,uuid) from public,anon,authenticated;
revoke all on function public.grcon_document_vault_storage_usage(uuid,uuid) from public,anon,authenticated;
revoke all on function private.grcon_document_vault_storage_catalog(uuid,uuid) from public,anon,authenticated;
revoke all on function public.grcon_document_vault_storage_catalog(uuid,uuid) from public,anon,authenticated;
revoke all on function private.grcon_document_vault_reconcile_log(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.grcon_document_vault_reconcile_log(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.grcon_document_vault_list(uuid,uuid,jsonb) to service_role;
grant execute on function private.grcon_document_vault_lookup(uuid,uuid,jsonb) to service_role;
grant execute on function private.grcon_document_vault_storage_usage(uuid,uuid) to service_role;
grant execute on function public.grcon_document_vault_storage_usage(uuid,uuid) to service_role;
grant execute on function private.grcon_document_vault_storage_catalog(uuid,uuid) to service_role;
grant execute on function public.grcon_document_vault_storage_catalog(uuid,uuid) to service_role;
grant execute on function private.grcon_document_vault_reconcile_log(uuid,uuid,jsonb) to service_role;
grant execute on function public.grcon_document_vault_reconcile_log(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
