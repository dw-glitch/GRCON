begin;

create or replace function private.grcon_master_register_lookup(
  target_workspace uuid,
  actor_id uuid,
  input_code text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  active_contract uuid;
  canonical text;
  active_sigem uuid;
  active_requests uuid;
  active_planned uuid;
  sigem_meta jsonb := '{}'::jsonb;
  requests_meta jsonb := '{}'::jsonb;
  planned_meta jsonb := '{}'::jsonb;
  sigem_rows jsonb := '[]'::jsonb;
  request_rows jsonb := '[]'::jsonb;
  planned_allocated boolean := false;
  vault_rows jsonb := '[]'::jsonb;
  history_rows jsonb := '[]'::jsonb;
  monitoring_rows jsonb := '[]'::jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Somente a API de servidor pode consultar o Registro Mestre.' using errcode='42501';
  end if;

  select m.contract_id into active_contract
  from public.grcon_memberships m
  join public.grcon_contracts c
    on c.id=m.contract_id and c.workspace_id=m.workspace_id and c.active
  where m.workspace_id=target_workspace and m.user_id=actor_id and m.active
  limit 1;

  if active_contract is null then
    raise exception 'Sem acesso ao contrato.' using errcode='42501';
  end if;

  canonical := regexp_replace(
    upper(regexp_replace(btrim(coalesce(input_code,'')),'\s+','','g')),
    '^NT-',''
  );
  if canonical='' or length(canonical)>255 then
    raise exception 'Código documental inválido.' using errcode='22023';
  end if;

  select s.id,
         jsonb_build_object(
           'snapshotId',s.id,'version',s.version,'fileName',s.file_name,
           'publishedAt',s.published_at,'referenceDate',s.metadata->>'referenceDate'
         )
    into active_sigem,sigem_meta
  from private.grcon_sigem_query_snapshots s
  where s.workspace_id=target_workspace and s.contract_id=active_contract
    and s.status='active' and s.deleted_at is null
  order by s.published_at desc nulls last,s.created_at desc
  limit 1;

  if active_sigem is not null then
    select coalesce(jsonb_agg(to_jsonb(q) order by q.revision,q.row_number),'[]'::jsonb)
      into sigem_rows
    from (
      select r.row_number,
             coalesce(nullif(r.payload->>'document',''),r.document_key) as document,
             r.revision_key as revision,
             r.status_original as status,
             r.status_normalized as status_normalized,
             r.title,
             r.discipline
      from private.grcon_sigem_query_rows r
      where r.snapshot_id=active_sigem
        and regexp_replace(upper(regexp_replace(coalesce(r.document_key,''),'\s+','','g')),'^NT-','')=canonical
      order by r.row_number
      limit 100
    ) q;
  end if;

  select b.id,
         jsonb_build_object('baseId',b.id,'fileName',b.file_name,'publishedAt',b.published_at)
    into active_requests,requests_meta
  from private.grcon_requests_bases b
  where b.workspace_id=target_workspace and b.contract_id=active_contract and b.status='active'
  order by b.published_at desc nulls last,b.created_at desc
  limit 1;

  if active_requests is not null then
    select coalesce(jsonb_agg(to_jsonb(q) order by q.row_number),'[]'::jsonb)
      into request_rows
    from (
      select r.row_number,
             r.payload->>'document' as document,
             btrim(coalesce(
               r.payload->'data'->>'Alocação',r.payload->'data'->>'ALOCAÇÃO',
               r.payload->'data'->>'Alocacao',r.payload->'data'->>'ALOCACAO',''
             )) as allocation,
             btrim(coalesce(
               r.payload->'data'->>'Status',r.payload->'data'->>'STATUS',
               r.payload->'data'->>'Status da Alocação',r.payload->'data'->>'STATUS DA ALOCAÇÃO',''
             )) as status,
             btrim(coalesce(
               r.payload->'data'->>'Workflow',r.payload->'data'->>'WORKFLOW',
               r.payload->'data'->>'Fluxo',r.payload->'data'->>'FLUXO',''
             )) as workflow
      from private.grcon_requests_rows r
      where r.base_id=active_requests
        and regexp_replace(
          upper(regexp_replace(btrim(coalesce(r.payload->>'document','')),'\s+','','g')),
          '^NT-',''
        )=canonical
      order by r.row_number
      limit 100
    ) q;
  end if;

  select s.id,
         jsonb_build_object('snapshotId',s.id,'fileName',s.file_name,'publishedAt',s.published_at)
    into active_planned,planned_meta
  from private.grcon_planned_document_snapshots s
  where s.workspace_id=target_workspace and s.contract_id=active_contract and s.status='active'
  order by s.published_at desc nulls last,s.created_at desc
  limit 1;

  if active_planned is not null then
    select exists(
      select 1
      from private.grcon_planned_document_items i
      where i.snapshot_id=active_planned
        and regexp_replace(upper(regexp_replace(coalesce(i.document_key,''),'\s+','','g')),'^NT-','')=canonical
    ) into planned_allocated;
  end if;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.revision,q.sequence),'[]'::jsonb)
    into vault_rows
  from (
    select d.id,d.sequence,d.file_name,d.document_code,d.revision,d.format,d.size_bytes,d.sha256,d.created_at,d.verified_at
    from private.grcon_document_files d
    where d.workspace_id=target_workspace and d.contract_id=active_contract and d.status='ready'
      and regexp_replace(upper(regexp_replace(coalesce(d.identity_code,''),'\s+','','g')),'^NT-','')=canonical
    order by d.revision,d.sequence
    limit 100
  ) q;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.generated_at desc),'[]'::jsonb)
    into history_rows
  from (
    select h.id,h.egrdt_number,h.generated_at,h.output_type,
           f->>'document' as document,
           f->>'revision' as revision,
           f->>'finalName' as final_name,
           f->>'purpose' as purpose,
           f->>'grdt' as grdt,
           f->'fileProvenance' as file_provenance
    from public.grcon_history h
    cross join lateral jsonb_array_elements(coalesce(h.payload->'files','[]'::jsonb)) f
    where h.workspace_id=target_workspace and h.contract_id=active_contract and h.deleted_at is null
      and regexp_replace(
        upper(regexp_replace(btrim(coalesce(f->>'document','')),'\s+','','g')),
        '^NT-',''
      )=canonical
    order by h.generated_at desc
    limit 100
  ) q;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc),'[]'::jsonb)
    into monitoring_rows
  from (
    select m.id,m.document_code,m.description,m.note,m.priority,m.active,m.created_at,m.updated_at
    from private.grcon_monitored_documents m
    where m.workspace_id=target_workspace and m.contract_id=active_contract
      and m.created_by=actor_id
      and regexp_replace(upper(regexp_replace(coalesce(m.document_key,''),'\s+','','g')),'^NT-','')=canonical
    order by m.updated_at desc
    limit 20
  ) q;

  return jsonb_build_object(
    'documentCode',upper(regexp_replace(btrim(input_code),'\s+','','g')),
    'normalizedCode',canonical,
    'contractId',active_contract,
    'plannedDocuments',jsonb_build_object(
      'sourceAvailable',active_planned is not null,
      'allocated',case when active_planned is null then null else planned_allocated end,
      'source',planned_meta
    ),
    'requestsControl',jsonb_build_object(
      'sourceAvailable',active_requests is not null,
      'source',requests_meta,
      'rows',request_rows
    ),
    'sigem',jsonb_build_object(
      'sourceAvailable',active_sigem is not null,
      'source',sigem_meta,
      'rows',sigem_rows
    ),
    'vault',jsonb_build_object('rows',vault_rows),
    'grdtHistory',jsonb_build_object('rows',history_rows),
    'monitoring',jsonb_build_object('rows',monitoring_rows)
  );
end $$;

create or replace function public.grcon_master_register_lookup(
  target_workspace uuid,
  actor_id uuid,
  input_code text
) returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.grcon_master_register_lookup(target_workspace,actor_id,input_code);
$$;

revoke all on function public.grcon_master_register_lookup(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.grcon_master_register_lookup(uuid,uuid,text) to service_role;

commit;
