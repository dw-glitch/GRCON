-- Preserve the Central workbook's master hierarchy as a regular versioned EAP
-- base. Publication and hierarchy replacement share the same transaction.
begin;
create or replace function private.grcon_registry_project_levels() returns trigger
language plpgsql security definer set search_path='' as $$
declare entries jsonb; base_id uuid; total integer;
begin
 if new.status <> 'active' then return new; end if;
 if tg_op='UPDATE' and old.status='active' and old.metadata->'projectLevelBase' is not distinct from new.metadata->'projectLevelBase' then return new; end if;
 entries:=coalesce(new.metadata->'projectLevelBase','[]'::jsonb);
 if jsonb_typeof(entries) is distinct from 'array' or jsonb_array_length(entries)>100000 then raise exception 'Hierarquia de pastas inválida.'; end if;
 total:=jsonb_array_length(entries);
 if exists(select 1 from jsonb_array_elements(entries) e where jsonb_typeof(e) is distinct from 'object'
  or coalesce(e->>'code','') !~ '^[0-9]+(\.[0-9]+){0,6}$'
  or jsonb_typeof(e->'levels') is distinct from 'array'
  or jsonb_array_length(e->'levels')<>10
  or exists(select 1 from jsonb_array_elements(e->'levels') l where jsonb_typeof(l)<>'string' or length(l#>>'{}')>500))
 then raise exception 'Linhas de hierarquia de pastas inválidas.'; end if;
 perform 1 from public.grcon_contracts where id=new.contract_id and workspace_id=new.workspace_id for update;
 if not found then raise exception 'Contrato da Central indisponível.'; end if;
 -- Missing sheet retires only hierarchies derived from the old Central.
 update private.grcon_allocation_bases set status='archived' where contract_id=new.contract_id and kind='eap' and status='active'
  and (total>0 or metadata->>'origin'='central-project-levels');
 if total=0 then return new; end if;
 insert into private.grcon_allocation_bases(workspace_id,contract_id,kind,file_name,revision,metadata,expected_count,record_count,status,created_by,published_at)
 values(new.workspace_id,new.contract_id,'eap',new.file_name,'Central '||to_char(coalesce(new.published_at,now()),'YYYY-MM-DD HH24:MI'),
  jsonb_build_object('origin','central-project-levels','snapshotId',new.id,'sheetName',new.metadata->>'projectLevelSheet'),total,total,'active',new.created_by,now()) returning id into base_id;
 insert into private.grcon_allocation_base_rows(base_id,row_number,payload) select base_id,n::integer,e from jsonb_array_elements(entries) with ordinality t(e,n);
 insert into private.grcon_allocation_events(workspace_id,contract_id,actor_id,action,entity_id,details)
 values(new.workspace_id,new.contract_id,new.created_by,'central-project-levels',base_id,jsonb_build_object('snapshotId',new.id,'records',total));
 return new;
end $$;
commit;
