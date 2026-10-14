begin;
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

  with wanted as materialized (
    select n,item,private.grcon_master_document_key(item->>'documentCode') as code,
      upper(btrim(coalesce(item->>'revision',''))) as revision
    from jsonb_array_elements(input->'items') with ordinality t(item,n)
  ), candidates as materialized (
    select d.id,d.sequence,d.file_name,d.document_code,d.identity_code,d.revision,d.format,d.size_bytes,d.sha256,d.created_at,d.verified_at,
      private.grcon_master_document_key(d.identity_code) canonical_key
    from private.grcon_document_files d
    where d.workspace_id=target_workspace and d.contract_id=c and d.status='ready'
      and private.grcon_master_document_key(d.identity_code) in (select code from wanted)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'requestId',left(coalesce(w.item->>'requestId',''),64),'input',left(coalesce(w.item->>'input',''),512),
    'documentCode',upper(regexp_replace(btrim(w.item->>'documentCode'),'[[:space:]]+','','g')),'requestedRevision',w.revision,'matches',matched.files
  ) order by w.n),'[]'::jsonb) into results
  from wanted w cross join lateral (
    select coalesce(jsonb_agg(to_jsonb(q)-'canonical_key' order by q.revision,q.sequence),'[]'::jsonb) as files
    from candidates q where q.canonical_key=w.code and (w.revision='' or q.revision=w.revision)
  ) matched;

  return jsonb_build_object('results',results,'contract_id',c,'allocation_source','Controle de Solicitações — Central de alocação','central_snapshot_id',active_central);
end $function$
;

create or replace function private.grcon_vault_enrich(files jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 with file_data as materialized (
  select f.*,private.grcon_master_document_key(f.identity_code) canonical_key
  from private.grcon_document_files f
  where f.id::text in (select value->>'id' from jsonb_array_elements(files))
 ), scopes as (
  select distinct f.workspace_id,f.contract_id
  from jsonb_array_elements(files) e(value) join file_data f on f.id::text=e.value->>'id'
 ), central as (
  select scope.workspace_id,scope.contract_id,s.id snapshot_id
  from scopes scope left join lateral (
   select s.id from private.grcon_allocation_registry_snapshots s
   where s.workspace_id=scope.workspace_id and s.contract_id=scope.contract_id and s.status='active' and upper(regexp_replace(btrim(translate(coalesce(s.metadata->>'sheetName',''),'çãÇÃ','caCA')),'[[:space:]]+',' ','g')) = 'CENTRAL DE ALOCACAO'
   order by s.published_at desc nulls last,s.created_at desc limit 1
  ) s on true
 ), allocations as materialized (
  select central.*,a.* from central
  cross join lateral private.grcon_vault_central_allocations(central.workspace_id,central.contract_id,central.snapshot_id) a
 )
 select coalesce(jsonb_agg(e.value||jsonb_build_object('file_version',f.file_version,'previous_file_id',f.previous_file_id,'is_active',f.is_active,
  'format',f.format,'replaced_at',f.replaced_at,'mime_type',f.mime_type,'source_context',f.source_context,'emissions',coalesce(l.emissions,'[]'::jsonb),
  'allocated',a.allocation_value is not null,'allocation_identified',coalesce(a.central_count,0)>0,
  'allocation_label',case when coalesce(a.central_count,0)=0 then 'Não identificado' when a.allocation_value is null then 'Não informado na Central' else a.allocation_value end,
  'allocation_source','Controle de Solicitações — Central de alocação','central_snapshot_id',central.snapshot_id) order by e.n),'[]'::jsonb)
 from jsonb_array_elements(files) with ordinality e(value,n) join file_data f on f.id::text=e.value->>'id'
 left join central on central.workspace_id=f.workspace_id and central.contract_id=f.contract_id
 left join allocations a on a.workspace_id=f.workspace_id and a.contract_id=f.contract_id and a.identity_code=f.canonical_key
 left join lateral(select jsonb_agg(jsonb_build_object('egrdt_number',egrdt_number,'purpose',purpose,'date',emitted_at) order by emitted_at desc) emissions from private.grcon_vault_emission_links where file_id=f.id) l on true;
$$;
create or replace function private.grcon_document_vault_lookup(target_workspace uuid,actor_id uuid,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; enriched jsonb;
begin
 result:=private.grcon_document_vault_lookup_base(target_workspace,actor_id,input);
 select private.grcon_vault_enrich(coalesce(jsonb_agg(distinct m.value),'[]'::jsonb)) into enriched
 from jsonb_array_elements(result->'results') r(value)
 cross join lateral jsonb_array_elements(r.value->'matches') m(value);
 return result||jsonb_build_object('results',(
  with active_files as materialized (select value from jsonb_array_elements(enriched) where (value->>'is_active')::boolean)
  select coalesce(jsonb_agg(r.value||jsonb_build_object('matches',(
   select coalesce(jsonb_agg(f.value order by m.n),'[]'::jsonb)
   from jsonb_array_elements(r.value->'matches') with ordinality m(value,n)
   join active_files f on f.value->>'id'=m.value->>'id'
  )) order by r.n),'[]'::jsonb)
  from jsonb_array_elements(result->'results') with ordinality r(value,n)
 ));
end $$;
notify pgrst,'reload schema';
commit;
