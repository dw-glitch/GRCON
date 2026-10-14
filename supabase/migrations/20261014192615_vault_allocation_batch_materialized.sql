begin;
CREATE OR REPLACE FUNCTION private.grcon_document_vault_list_base(target_workspace uuid, actor_id uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c uuid; member_role text; cursor_value bigint := 0; page_limit integer := 100;
  wanted text := ''; allocation_filter text := 'all'; active_central uuid;
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

  select s.id into active_central from private.grcon_allocation_registry_snapshots s
  where s.workspace_id=target_workspace and s.contract_id=c and s.status='active' and upper(regexp_replace(btrim(translate(coalesce(s.metadata->>'sheetName',''),'çãÇÃ','caCA')),'[[:space:]]+',' ','g')) = 'CENTRAL DE ALOCACAO'
  order by s.published_at desc nulls last,s.created_at desc limit 1;

  with central_alloc as materialized (
    select * from private.grcon_vault_central_allocations(target_workspace,c,active_central)
  ),
  annotated as (
    select d.id,d.sequence,d.file_name,d.relative_path,d.document_code,d.identity_code,d.revision,d.format,d.size_bytes,d.sha256,d.status,d.identity_conflict,
      d.created_by,(select coalesce(nullif(p.display_name,''),p.email) from public.grcon_profiles p where p.id=d.created_by) as created_by_name,
      d.created_at,d.verified_at,(ra.allocation_value is not null) as allocated,(coalesce(ra.central_count,0)>0) as allocation_identified,
      case when coalesce(ra.central_count,0)=0 then 'Não identificado' when ra.allocation_value is null then 'Não informado na Central' else ra.allocation_value end as allocation_label,
      'Controle de Solicitações — Central de alocação'::text as allocation_source,active_central as central_snapshot_id
    from private.grcon_document_files d left join central_alloc ra on ra.identity_code=private.grcon_master_document_key(d.identity_code)
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
    'allocation_source','Controle de Solicitações — Central de alocação','central_snapshot_id',active_central);
end $function$
;

CREATE OR REPLACE FUNCTION private.grcon_document_vault_lookup_base(target_workspace uuid, actor_id uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c uuid; active_central uuid; results jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Somente a API de servidor pode consultar o Cofre.' using errcode='42501'; end if;
  select m.contract_id into c from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
  where m.workspace_id=target_workspace and m.user_id=actor_id and m.active;
  if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
  if jsonb_typeof(input->'items') is distinct from 'array' or jsonb_array_length(input->'items') not between 1 and 500 then raise exception 'Consulta em lote inválida.'; end if;
  if exists(select 1 from jsonb_array_elements(input->'items') item where jsonb_typeof(item) is distinct from 'object'
    or length(btrim(coalesce(item->>'documentCode',''))) not between 1 and 255 or length(coalesce(item->>'revision',''))>40) then raise exception 'Código ou revisão inválido.'; end if;

  select s.id into active_central from private.grcon_allocation_registry_snapshots s
  where s.workspace_id=target_workspace and s.contract_id=c and s.status='active' and upper(regexp_replace(btrim(translate(coalesce(s.metadata->>'sheetName',''),'çãÇÃ','caCA')),'[[:space:]]+',' ','g')) = 'CENTRAL DE ALOCACAO'
  order by s.published_at desc nulls last,s.created_at desc limit 1;

  with central_alloc as materialized (
    select * from private.grcon_vault_central_allocations(target_workspace,c,active_central)
  ),
  wanted as (
    select n,item,private.grcon_master_document_key(item->>'documentCode') as code,
      upper(btrim(coalesce(item->>'revision',''))) as revision
    from jsonb_array_elements(input->'items') with ordinality t(item,n)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'requestId',left(coalesce(w.item->>'requestId',''),64),'input',left(coalesce(w.item->>'input',''),512),
    'documentCode',upper(regexp_replace(btrim(w.item->>'documentCode'),'[[:space:]]+','','g')),'requestedRevision',w.revision,'matches',matched.files
  ) order by w.n),'[]'::jsonb) into results
  from wanted w cross join lateral (
    select coalesce(jsonb_agg(to_jsonb(q) order by q.revision,q.sequence),'[]'::jsonb) as files from (
      select d.id,d.sequence,d.file_name,d.document_code,d.identity_code,d.revision,d.format,d.size_bytes,d.sha256,d.created_at,d.verified_at,
        (ra.allocation_value is not null) as allocated,(coalesce(ra.central_count,0)>0) as allocation_identified,
        case when coalesce(ra.central_count,0)=0 then 'Não identificado' when ra.allocation_value is null then 'Não informado na Central' else ra.allocation_value end as allocation_label,
        'Controle de Solicitações — Central de alocação'::text as allocation_source,active_central as central_snapshot_id
      from private.grcon_document_files d left join central_alloc ra on ra.identity_code=private.grcon_master_document_key(d.identity_code)
      where d.workspace_id=target_workspace and d.contract_id=c and d.status='ready'
        and private.grcon_master_document_key(d.identity_code)=w.code and (w.revision='' or d.revision=w.revision)
    ) q
  ) matched;

  return jsonb_build_object('results',results,'contract_id',c,'allocation_source','Controle de Solicitações — Central de alocação','central_snapshot_id',active_central);
end $function$
;

notify pgrst,'reload schema';
commit;
