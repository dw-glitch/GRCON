-- GRCON: retirada lógica e restauração de arquivos de uma eGRDT.
-- Não modifica confirmações Teams, arquivo emitido, numeração, Cofre ou SIGEM.
create or replace function private.grcon_history_file_action(
  target_workspace uuid,
  target_history_id uuid,
  operation text,
  target_index integer default null,
  target_removal_id uuid default null,
  reason_text text default null,
  expected_updated_at timestamptz default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  h public.grcon_history;
  active_files jsonb;
  removed_files jsonb;
  selected_file jsonb;
  selected_removal jsonb;
  restored_index integer;
  removal_id uuid;
  trimmed_reason text := btrim(coalesce(reason_text,''));
  event_name text;
  file_count_now integer;
  document_count_now integer;
  active_allocations text[];
  payload_now jsonb;
begin
  if auth.uid() is null or not private.grcon_has_role(target_workspace, array['owner','admin']) then
    raise exception 'Somente proprietário ou administrador pode alterar documentos do histórico.' using errcode='42501';
  end if;
  if operation not in ('remove', 'restore') then
    raise exception 'Operação inválida.' using errcode='22023';
  end if;
  if expected_updated_at is null then
    raise exception 'Atualize o histórico antes de realizar esta operação.' using errcode='22023';
  end if;
  select * into h from public.grcon_history
   where id=target_history_id and workspace_id=target_workspace and deleted_at is null
   for update;
  if not found then
    raise exception 'eGRDT não encontrada neste contrato.' using errcode='22023';
  end if;
  if h.updated_at is distinct from expected_updated_at then
    raise exception 'Histórico modificado por outro usuário. Atualize a tela e tente novamente.' using errcode='40001';
  end if;
  active_files := coalesce(h.payload->'files','[]'::jsonb);
  removed_files := coalesce(h.payload->'removedFiles','[]'::jsonb);
  if jsonb_typeof(active_files)<>'array' or jsonb_typeof(removed_files)<>'array' then
    raise exception 'Estrutura do histórico inválida.' using errcode='22023';
  end if;

  if operation='remove' then
    if target_index is null or target_index<0 or target_index>=jsonb_array_length(active_files) then
      raise exception 'Documento não localizado na versão atual da GRDT.' using errcode='22023';
    end if;
    if length(trimmed_reason)<3 or length(trimmed_reason)>500 then
      raise exception 'Informe uma justificativa de 3 a 500 caracteres.' using errcode='22023';
    end if;
    selected_file := active_files->target_index;
    removal_id := gen_random_uuid();
    selected_removal := jsonb_build_object(
      'id',removal_id::text,'file',selected_file,'reason',trimmed_reason,
      'removedAt',clock_timestamp(),'removedBy',auth.uid()::text
    );
    active_files := active_files - target_index;
    removed_files := removed_files || jsonb_build_array(selected_removal);
    event_name := 'history_file_removed';
  else
    if target_removal_id is null then
      raise exception 'Identificação da remoção obrigatória.' using errcode='22023';
    end if;
    select (r.ordinality-1)::integer, r.value
      into restored_index, selected_removal
      from jsonb_array_elements(removed_files) with ordinality r(value,ordinality)
     where r.value->>'id'=target_removal_id::text limit 1;
    if not found then
      raise exception 'Registro removido não localizado.' using errcode='22023';
    end if;
    removal_id := target_removal_id;
    selected_file := selected_removal->'file';
    active_files := active_files || jsonb_build_array(selected_file);
    removed_files := removed_files - restored_index;
    trimmed_reason := coalesce(selected_removal->>'reason','');
    event_name := 'history_file_restored';
  end if;
  payload_now := jsonb_set(jsonb_set(coalesce(h.payload,'{}'::jsonb),'{files}',active_files,true),'{removedFiles}',removed_files,true);
  file_count_now := jsonb_array_length(active_files);
  select count(distinct upper(btrim(f.value->>'document'))) filter (where nullif(btrim(f.value->>'document'),'') is not null)
    into document_count_now from jsonb_array_elements(active_files) f(value);
  select coalesce(array_agg(distinct btrim(f.value->>'allocation'))
    filter (where nullif(btrim(f.value->>'allocation'),'') is not null),'{}'::text[])
    into active_allocations from jsonb_array_elements(active_files) f(value);
  update public.grcon_history
     set payload=payload_now,
         file_count=file_count_now,
         document_count=coalesce(document_count_now,0),
         allocations=active_allocations,
         updated_by=auth.uid(),
         updated_at=clock_timestamp()
   where id=h.id
   returning * into h;
  insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata)
    values(h.workspace_id,h.contract_id,auth.uid(),event_name,'history_document',h.id::text,
      jsonb_build_object('removalId',removal_id,'document',selected_file->>'document',
        'revision',coalesce(selected_file->>'grdtRevision',selected_file->>'revision','0'),
        'egrdtNumber',h.egrdt_number,'reason',trimmed_reason,'fileSnapshot',selected_file));
  return jsonb_build_object('record',to_jsonb(h),'removalId',removal_id::text,'operation',operation);
end;
$$;

revoke all on function private.grcon_history_file_action(uuid,uuid,text,integer,uuid,text,timestamptz) from public,anon;
grant execute on function private.grcon_history_file_action(uuid,uuid,text,integer,uuid,text,timestamptz) to authenticated;
create or replace function public.grcon_history_file_action(
  target_workspace uuid,
  target_history_id uuid,
  operation text,
  target_index integer default null,
  target_removal_id uuid default null,
  reason_text text default null,
  expected_updated_at timestamptz default null
) returns jsonb
language sql security invoker set search_path=public,private,pg_temp
as $$ select private.grcon_history_file_action(target_workspace,target_history_id,operation,target_index,target_removal_id,reason_text,expected_updated_at); $$;
revoke all on function public.grcon_history_file_action(uuid,uuid,text,integer,uuid,text,timestamptz) from public,anon;
grant execute on function public.grcon_history_file_action(uuid,uuid,text,integer,uuid,text,timestamptz) to authenticated;
