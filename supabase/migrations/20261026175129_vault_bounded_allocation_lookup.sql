begin;
-- Only the key and snapshot are indexed: no duplicate JSON payload in the index.
create index if not exists grcon_vault_central_document_idx on private.grcon_allocation_registry_rows
 (snapshot_id,private.grcon_master_document_key(payload->>'document'));

create or replace function private.grcon_vault_central_for_keys(target_workspace uuid,target_contract uuid,target_snapshot uuid,keys text[])
returns table(identity_code text,central_count integer,allocation_value text)
language sql stable set search_path='' as $$
 with eligible as materialized (
  select s.id from private.grcon_allocation_registry_snapshots s
  where s.id=target_snapshot and s.workspace_id=target_workspace and s.contract_id=target_contract
   and s.status in('active','archived')
   and upper(regexp_replace(btrim(translate(coalesce(s.metadata->>'sheetName',''),'çãÇÃ','caCA')),'[[:space:]]+',' ','g'))='CENTRAL DE ALOCACAO'
 ), requested as materialized (
  select distinct value as identity_code from unnest(keys) value where value<>''
 ), values_for_keys as (
  select k.identity_code,btrim(coalesce(r.payload->>'allocation','')) allocation_value
  from eligible s cross join requested k cross join lateral (
   select r.payload from private.grcon_allocation_registry_rows r
   where r.snapshot_id=s.id and private.grcon_master_document_key(r.payload->>'document')=k.identity_code offset 0
  ) r
 ), usable as (
  select identity_code,case when upper(allocation_value) in
   ('','0','#N/A','N/A','#N/D','N/D','NA','—','-','ALOCADO','NÃO ALOCADO','NAO ALOCADO','NÃO IDENTIFICADO','NAO IDENTIFICADO',
    '#REF!','#VALUE!','#VALOR!','#DIV/0!','#NUM!','#NOME?','#NAME?','#NULL!') then null else allocation_value end allocation_value
  from values_for_keys
 )
 select identity_code,count(*)::integer,string_agg(distinct allocation_value,' · ' order by allocation_value)
 from usable group by identity_code;
$$;
revoke all on function private.grcon_vault_central_for_keys(uuid,uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function private.grcon_vault_central_for_keys(uuid,uuid,uuid,text[]) to service_role;

create or replace function private.grcon_document_vault_list_base(target_workspace uuid,actor_id uuid,input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c uuid; member_role text; cursor_value bigint:=0; page_limit integer:=100;
 wanted text:=''; allocation_filter text:='all'; active_central uuid;
 result_rows jsonb:='[]';has_more boolean:=false;next_cursor bigint;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Somente a API de servidor pode consultar o Cofre.' using errcode='42501';end if;
 if actor_id is null or target_workspace is null then raise exception 'Sessão não identificada.' using errcode='42501';end if;
 select m.contract_id,m.role into c,member_role from public.grcon_memberships m
 join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
 where m.workspace_id=target_workspace and m.user_id=actor_id and m.active;
 if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501';end if;
 if jsonb_typeof(coalesce(input,'{}'::jsonb)) is distinct from 'object' then raise exception 'Consulta inválida.' using errcode='22023';end if;
 cursor_value:=greatest(0,coalesce((input->>'after')::bigint,0));page_limit:=least(200,greatest(1,coalesce((input->>'limit')::integer,100)));
 wanted:=lower(btrim(coalesce(input->>'q','')));if length(wanted)>160 then raise exception 'Busca muito longa.' using errcode='22023';end if;
 allocation_filter:=lower(btrim(coalesce(input->>'allocation','all')));
 if allocation_filter not in('all','allocated','not_allocated','not_identified') then raise exception 'Filtro de alocação inválido.' using errcode='22023';end if;
 select s.id into active_central from private.grcon_allocation_registry_snapshots s
 where s.workspace_id=target_workspace and s.contract_id=c and s.status='active'
  and upper(regexp_replace(btrim(translate(coalesce(s.metadata->>'sheetName',''),'çãÇÃ','caCA')),'[[:space:]]+',' ','g'))='CENTRAL DE ALOCACAO'
 order by s.published_at desc nulls last,s.created_at desc limit 1;
 with file_data as materialized (
  select d.*,private.grcon_master_document_key(d.identity_code) canonical_key
  from private.grcon_document_files d
  where d.workspace_id=target_workspace and d.contract_id=c and d.status in('ready','deleting','delete_failed') and d.sequence>cursor_value
  order by d.sequence limit case when wanted='' and allocation_filter='all' then page_limit+1 else null end
 ), central_alloc as materialized (
  select * from private.grcon_vault_central_for_keys(target_workspace,c,active_central,
    (select coalesce(array_agg(distinct canonical_key),'{}'::text[]) from file_data))
 ), annotated as (
  select d.id,d.sequence,d.file_name,d.relative_path,d.document_code,d.identity_code,d.revision,d.format,d.size_bytes,d.sha256,d.status,d.identity_conflict,
   d.created_by,coalesce(nullif(p.display_name,''),p.email) created_by_name,d.created_at,d.verified_at,
   (ra.allocation_value is not null) allocated,(coalesce(ra.central_count,0)>0) allocation_identified,
   case when coalesce(ra.central_count,0)=0 then 'Não identificado' when ra.allocation_value is null then 'Não informado na Central' else ra.allocation_value end allocation_label,
   'Controle de Solicitações — Central de alocação'::text allocation_source,active_central central_snapshot_id
  from file_data d left join central_alloc ra on ra.identity_code=d.canonical_key left join public.grcon_profiles p on p.id=d.created_by
 ), filtered as materialized (
  select * from annotated
  where (wanted='' or position(wanted in lower(file_name))>0 or position(wanted in lower(document_code))>0 or position(wanted in lower(identity_code))>0 or position(wanted in lower(revision))>0 or position(wanted in lower(allocation_label))>0)
   and(allocation_filter='all' or allocation_filter='allocated' and allocated or allocation_filter='not_allocated' and allocation_identified and not allocated or allocation_filter='not_identified' and not allocation_identified)
  order by sequence limit page_limit+1
 ), page as(select * from filtered order by sequence limit page_limit)
 select coalesce(jsonb_agg(to_jsonb(page) order by sequence),'[]'),exists(select 1 from filtered offset page_limit),(select max(sequence) from page)
 into result_rows,has_more,next_cursor from page;
 return jsonb_build_object('files',result_rows,'next',case when has_more then next_cursor else null end,'has_more',has_more,'allocation_source','Controle de Solicitações — Central de alocação','central_snapshot_id',active_central);
end $$;

create or replace function private.grcon_vault_enrich(files jsonb)
returns jsonb language sql stable security definer set search_path='' as $$
 with file_data as materialized (
  select f.*,private.grcon_master_document_key(f.identity_code) canonical_key from private.grcon_document_files f
  where f.id::text in(select value->>'id' from jsonb_array_elements(files))
 ), scopes as(select distinct workspace_id,contract_id from file_data), central as materialized (
  select scope.workspace_id,scope.contract_id,s.id snapshot_id from scopes scope left join lateral (
   select s.id from private.grcon_allocation_registry_snapshots s
   where s.workspace_id=scope.workspace_id and s.contract_id=scope.contract_id and s.status='active'
    and upper(regexp_replace(btrim(translate(coalesce(s.metadata->>'sheetName',''),'çãÇÃ','caCA')),'[[:space:]]+',' ','g'))='CENTRAL DE ALOCACAO'
   order by s.published_at desc nulls last,s.created_at desc limit 1
  )s on true
 ), allocations as materialized (
  select central.*,a.* from central cross join lateral private.grcon_vault_central_for_keys(central.workspace_id,central.contract_id,central.snapshot_id,
   (select coalesce(array_agg(distinct f.canonical_key),'{}'::text[]) from file_data f where f.workspace_id=central.workspace_id and f.contract_id=central.contract_id))a
 ), emissions as materialized (
  select file_id,jsonb_agg(jsonb_build_object('egrdt_number',egrdt_number,'purpose',purpose,'date',emitted_at) order by emitted_at desc) emissions
  from private.grcon_vault_emission_links where file_id in(select id from file_data) group by file_id
 )
 select coalesce(jsonb_agg(e.value||jsonb_build_object('file_version',f.file_version,'previous_file_id',f.previous_file_id,'is_active',f.is_active,
  'format',f.format,'replaced_at',f.replaced_at,'mime_type',f.mime_type,'source_context',f.source_context,'emissions',coalesce(l.emissions,'[]'::jsonb),
  'allocated',a.allocation_value is not null,'allocation_identified',coalesce(a.central_count,0)>0,
  'allocation_label',case when coalesce(a.central_count,0)=0 then 'Não identificado' when a.allocation_value is null then 'Não informado na Central' else a.allocation_value end,
  'allocation_source','Controle de Solicitações — Central de alocação','central_snapshot_id',central.snapshot_id) order by e.n),'[]')
 from jsonb_array_elements(files) with ordinality e(value,n) join file_data f on f.id::text=e.value->>'id'
 left join central on central.workspace_id=f.workspace_id and central.contract_id=f.contract_id
 left join allocations a on a.workspace_id=f.workspace_id and a.contract_id=f.contract_id and a.identity_code=f.canonical_key
 left join emissions l on l.file_id=f.id;
$$;
-- Storage reconciliation needs object keys, sizes and statuses, not allocation
-- or emission enrichment for every object in the bucket.
create or replace function private.grcon_document_vault_storage_catalog(target_workspace uuid,actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin return private.grcon_document_vault_storage_catalog_base(target_workspace,actor_id);end $$;
commit;
