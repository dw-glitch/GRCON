
create or replace function private.grcon_document_vault_lookup(
  target_workspace uuid,
  actor_id uuid,
  input jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  member_role text;
  active_snapshot uuid;
  item jsonb;
  result_rows jsonb := '[]'::jsonb;
  matches jsonb;
  request_id text;
  original_input text;
  requested_code text;
  normalized_code text;
  requested_revision text;
  item_count integer;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Somente a API de servidor pode consultar o Cofre.' using errcode='42501';
  end if;
  if actor_id is null or target_workspace is null then
    raise exception 'Sessão não identificada.' using errcode='42501';
  end if;
  select m.role into member_role
  from public.grcon_memberships m
  where m.workspace_id=target_workspace and m.user_id=actor_id and m.active;
  if not found then raise exception 'Sem acesso à área de trabalho.' using errcode='42501'; end if;

  if jsonb_typeof(coalesce(input,'{}'::jsonb)) is distinct from 'object'
     or jsonb_typeof(input->'items') is distinct from 'array' then
    raise exception 'Consulta em lote inválida.' using errcode='22023';
  end if;
  item_count := jsonb_array_length(input->'items');
  if item_count not between 1 and 500 then
    raise exception 'A consulta deve conter entre 1 e 500 documentos.' using errcode='22023';
  end if;

  select s.id into active_snapshot
  from private.grcon_planned_document_snapshots s
  where s.workspace_id=target_workspace and s.status='active'
  order by s.published_at desc nulls last, s.created_at desc
  limit 1;

  for item in select value from jsonb_array_elements(input->'items') loop
    request_id := left(btrim(coalesce(item->>'requestId','')),64);
    original_input := left(btrim(coalesce(item->>'input','')),512);
    requested_code := upper(regexp_replace(btrim(coalesce(item->>'documentCode','')), '\s+', '', 'g'));
    normalized_code := regexp_replace(requested_code,'^NT-','','i');
    requested_revision := upper(btrim(coalesce(item->>'revision','')));
    if requested_code='' or length(requested_code)>255 or length(requested_revision)>40 then
      raise exception 'Identidade documental inválida na consulta em lote.' using errcode='22023';
    end if;

    select coalesce(jsonb_agg(to_jsonb(q) order by q.revision,q.sequence),'[]'::jsonb)
    into matches
    from (
      select d.id,d.sequence,d.file_name,d.relative_path,d.document_code,d.identity_code,
             d.revision,d.format,d.size_bytes,d.sha256,d.created_at,d.verified_at,
             case when active_snapshot is null then false else exists(
               select 1 from private.grcon_planned_document_items p
               where p.snapshot_id=active_snapshot
                 and p.document_key in (d.identity_code,d.document_code)
             ) end as allocated
      from private.grcon_document_files d
      where d.workspace_id=target_workspace and d.status='ready'
        and d.identity_code=normalized_code
        and (requested_revision='' or d.revision=requested_revision)
      order by d.revision,d.sequence
    ) q;

    result_rows := result_rows || jsonb_build_array(jsonb_build_object(
      'requestId',request_id,'input',original_input,'documentCode',requested_code,
      'requestedRevision',requested_revision,'matches',matches
    ));
  end loop;

  return jsonb_build_object('results',result_rows,'allocation_snapshot',active_snapshot);
end
$fn$;

create or replace function public.grcon_document_vault_lookup(
  target_workspace uuid,
  actor_id uuid,
  input jsonb
) returns jsonb
language sql
security definer
set search_path = ''
as $fn$
  select private.grcon_document_vault_lookup(target_workspace,actor_id,input);
$fn$;

revoke all on function private.grcon_document_vault_lookup(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.grcon_document_vault_lookup(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.grcon_document_vault_lookup(uuid,uuid,jsonb) to service_role;
grant execute on function public.grcon_document_vault_lookup(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
