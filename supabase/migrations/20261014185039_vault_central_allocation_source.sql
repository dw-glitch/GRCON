-- Cofre: a coluna Alocação vem exclusivamente da aba Central de alocação.
-- O snapshot selecionado é completo e pertence ao mesmo workspace/contrato.
begin;
create or replace function private.grcon_vault_central_allocations(
 target_workspace uuid, target_contract uuid, target_snapshot uuid
) returns table(identity_code text, central_count integer, allocation_value text)
language sql stable security invoker set search_path='' as $$
 with central_values as (
  select regexp_replace(upper(regexp_replace(btrim(r.payload->>'document'),'[[:space:]]+','','g')),'^NT-','') identity_code,
   btrim(coalesce(r.payload->>'allocation','')) allocation_value
  from private.grcon_allocation_registry_rows r
  join private.grcon_allocation_registry_snapshots s on s.id=r.snapshot_id
  where s.id=target_snapshot and s.workspace_id=target_workspace and s.contract_id=target_contract
   and s.status in ('active','archived') and upper(regexp_replace(btrim(translate(coalesce(s.metadata->>'sheetName',''),'çãÇÃ','caCA')),'[[:space:]]+',' ','g')) = 'CENTRAL DE ALOCACAO'
 ), usable as (
  select identity_code,case when upper(allocation_value) in
   ('','0','#N/A','N/A','#N/D','N/D','NA','—','-','ALOCADO','NÃO ALOCADO','NAO ALOCADO','NÃO IDENTIFICADO','NAO IDENTIFICADO',
    '#REF!','#VALUE!','#VALOR!','#DIV/0!','#NUM!','#NOME?','#NAME?','#NULL!') then null else allocation_value end allocation_value
  from central_values where identity_code<>''
 )
 select identity_code,count(*)::integer,string_agg(distinct allocation_value,' · ' order by allocation_value)
 from usable group by identity_code;
$$;
revoke all on function private.grcon_vault_central_allocations(uuid,uuid,uuid) from public,anon,authenticated,service_role;

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

  with central_alloc as (
    select * from private.grcon_vault_central_allocations(target_workspace,c,active_central)
  ),
  annotated as (
    select d.id,d.sequence,d.file_name,d.relative_path,d.document_code,d.identity_code,d.revision,d.format,d.size_bytes,d.sha256,d.status,d.identity_conflict,
      d.created_by,(select coalesce(nullif(p.display_name,''),p.email) from public.grcon_profiles p where p.id=d.created_by) as created_by_name,
      d.created_at,d.verified_at,(ra.allocation_value is not null) as allocated,(coalesce(ra.central_count,0)>0) as allocation_identified,
      case when coalesce(ra.central_count,0)=0 then 'Não identificado' when ra.allocation_value is null then 'Não informado na Central' else ra.allocation_value end as allocation_label,
      'Controle de Solicitações — Central de alocação'::text as allocation_source,active_central as central_snapshot_id
    from private.grcon_document_files d left join central_alloc ra on ra.identity_code=d.identity_code
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

  with central_alloc as (
    select * from private.grcon_vault_central_allocations(target_workspace,c,active_central)
  ),
  wanted as (
    select n,item,regexp_replace(upper(regexp_replace(btrim(item->>'documentCode'),'[[:space:]]+','','g')),'^NT-','') as code,
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
      from private.grcon_document_files d left join central_alloc ra on ra.identity_code=d.identity_code
      where d.workspace_id=target_workspace and d.contract_id=c and d.status='ready'
        and d.identity_code=w.code and (w.revision='' or d.revision=w.revision)
    ) q
  ) matched;

  return jsonb_build_object('results',results,'contract_id',c,'allocation_source','Controle de Solicitações — Central de alocação','central_snapshot_id',active_central);
end $function$
;

create or replace function private.grcon_vault_enrich(files jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 with scopes as (
  select distinct f.workspace_id,f.contract_id
  from jsonb_array_elements(files) e(value) join private.grcon_document_files f on f.id::text=e.value->>'id'
 ), central as (
  select scope.workspace_id,scope.contract_id,s.id snapshot_id
  from scopes scope left join lateral (
   select s.id from private.grcon_allocation_registry_snapshots s
   where s.workspace_id=scope.workspace_id and s.contract_id=scope.contract_id and s.status='active' and upper(regexp_replace(btrim(translate(coalesce(s.metadata->>'sheetName',''),'çãÇÃ','caCA')),'[[:space:]]+',' ','g')) = 'CENTRAL DE ALOCACAO'
   order by s.published_at desc nulls last,s.created_at desc limit 1
  ) s on true
 ), allocations as (
  select central.*,a.* from central
  cross join lateral private.grcon_vault_central_allocations(central.workspace_id,central.contract_id,central.snapshot_id) a
 )
 select coalesce(jsonb_agg(e.value||jsonb_build_object('file_version',f.file_version,'previous_file_id',f.previous_file_id,'is_active',f.is_active,
  'format',f.format,'replaced_at',f.replaced_at,'mime_type',f.mime_type,'source_context',f.source_context,'emissions',coalesce(l.emissions,'[]'::jsonb),
  'allocated',a.allocation_value is not null,'allocation_identified',coalesce(a.central_count,0)>0,
  'allocation_label',case when coalesce(a.central_count,0)=0 then 'Não identificado' when a.allocation_value is null then 'Não informado na Central' else a.allocation_value end,
  'allocation_source','Controle de Solicitações — Central de alocação','central_snapshot_id',central.snapshot_id) order by e.n),'[]'::jsonb)
 from jsonb_array_elements(files) with ordinality e(value,n) join private.grcon_document_files f on f.id::text=e.value->>'id'
 left join central on central.workspace_id=f.workspace_id and central.contract_id=f.contract_id
 left join allocations a on a.workspace_id=f.workspace_id and a.contract_id=f.contract_id and a.identity_code=f.identity_code
 left join lateral(select jsonb_agg(jsonb_build_object('egrdt_number',egrdt_number,'purpose',purpose,'date',emitted_at) order by emitted_at desc) emissions from private.grcon_vault_emission_links where file_id=f.id) l on true;
$$;
revoke all on function private.grcon_document_vault_list_base(uuid,uuid,jsonb),private.grcon_document_vault_lookup_base(uuid,uuid,jsonb),private.grcon_vault_enrich(jsonb) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
