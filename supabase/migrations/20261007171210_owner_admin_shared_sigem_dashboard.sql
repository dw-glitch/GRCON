begin;
create or replace function private.grcon_sigem_query_set_date(target_workspace uuid,target_snapshot uuid,reference_date date,expected_date text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.grcon_sigem_query_snapshots; old_date text; c uuid;
begin
 if auth.uid() is null or not private.grcon_has_role(target_workspace,array['owner','admin']) then raise exception 'Sem permissão para editar a data.' using errcode='42501'; end if;
 select m.contract_id into c from public.grcon_memberships m where m.workspace_id=target_workspace and m.user_id=auth.uid() and m.active;
 select * into s from private.grcon_sigem_query_snapshots where id=target_snapshot and workspace_id=target_workspace and contract_id=c and status in ('active','archived') and deleted_at is null for update;
 if not found then raise exception 'Consulta Geral não localizada.' using errcode='22023'; end if;
 if reference_date is null then raise exception 'Informe a data da Consulta Geral.' using errcode='22023'; end if;
 old_date:=s.metadata->>'referenceDate';
 if old_date is distinct from expected_date then raise exception 'A data foi alterada por outro usuário. Atualize a base.' using errcode='40001'; end if;
 if old_date=reference_date::text then return s.metadata; end if;
 update private.grcon_sigem_query_snapshots set metadata=metadata||jsonb_build_object('referenceDate',reference_date::text,'dateChangedBy',auth.uid(),'dateChangedAt',now()) where id=s.id returning metadata into s.metadata;
 insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata)
 values(target_workspace,c,auth.uid(),'sigem_query_date_changed','sigem_query',s.id::text,jsonb_build_object('previous_date',old_date,'new_date',reference_date,'changed_by',auth.uid(),'changed_at',now()));
 return s.metadata;
end $$;
create or replace function public.grcon_sigem_query_set_date(target_workspace uuid,target_snapshot uuid,reference_date date,expected_date text default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.grcon_sigem_query_set_date(target_workspace,target_snapshot,reference_date,expected_date); $$;
revoke all on function private.grcon_sigem_query_set_date(uuid,uuid,date,text),public.grcon_sigem_query_set_date(uuid,uuid,date,text) from public,anon;
grant execute on function private.grcon_sigem_query_set_date(uuid,uuid,date,text),public.grcon_sigem_query_set_date(uuid,uuid,date,text) to authenticated;
create or replace function private.grcon_contract_settings_save(target_contract uuid,input jsonb)
returns jsonb
language plpgsql security definer
set search_path=public,private,pg_temp
as $$
declare c public.grcon_contracts;
begin
  if jsonb_typeof(coalesce(input,'{}'::jsonb))<>'object' or octet_length(input::text)>262144 then
    raise exception 'Configuração de contrato inválida.' using errcode='22023';
  end if;
  select * into c from public.grcon_contracts where id=target_contract for update;
  if not found then raise exception 'Contrato não encontrado.' using errcode='22023'; end if;
  if not private.grcon_is_global_owner() then
    raise exception 'Sem permissão para alterar este contrato.' using errcode='42501';
  end if;
  update public.grcon_contracts set settings=input,updated_at=now() where id=c.id;
  insert into public.grcon_audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  values(c.workspace_id,auth.uid(),'contract_settings_saved','contract',c.id::text,'{}'::jsonb);
  return input;
end $$;


grant execute on function private.grcon_is_global_owner() to authenticated;
drop policy if exists grcon_memberships_insert_admins on public.grcon_memberships;
drop policy if exists grcon_memberships_update_admins on public.grcon_memberships;
drop policy if exists grcon_memberships_delete_admins on public.grcon_memberships;
create policy grcon_memberships_insert_admins on public.grcon_memberships for insert to authenticated with check(private.grcon_is_global_owner());
create policy grcon_memberships_update_admins on public.grcon_memberships for update to authenticated using(private.grcon_is_global_owner()) with check(private.grcon_is_global_owner());
create policy grcon_memberships_delete_admins on public.grcon_memberships for delete to authenticated using(private.grcon_is_global_owner());

-- Metadata only: selecting a Dashboard source never activates or republishes it.
create or replace function private.grcon_sigem_query_versions(target_workspace uuid)
returns table(snapshot_id uuid, version integer, file_name text, record_count integer, published_at timestamptz, created_at timestamptz, created_by uuid, created_by_name text, status text, metadata jsonb)
language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
 if auth.uid() is null or not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
 select contract_id into c from public.grcon_memberships where workspace_id=target_workspace and user_id=auth.uid() and active;
 return query select s.id,s.version,s.file_name,s.record_count,s.published_at,s.created_at,s.created_by,p.display_name,s.status,s.metadata
 from private.grcon_sigem_query_snapshots s left join public.grcon_profiles p on p.id=s.created_by
 where s.workspace_id=target_workspace and s.contract_id=c and s.status in ('active','archived') and s.deleted_at is null
 order by coalesce(nullif(s.metadata->>'referenceDate',''),s.published_at::text,s.created_at::text) desc,s.version desc,s.id;
end $$;
create or replace function public.grcon_sigem_query_versions(target_workspace uuid)
returns table(snapshot_id uuid, version integer, file_name text, record_count integer, published_at timestamptz, created_at timestamptz, created_by uuid, created_by_name text, status text, metadata jsonb)
language sql security invoker set search_path='' as $$ select * from private.grcon_sigem_query_versions(target_workspace); $$;
revoke all on function private.grcon_sigem_query_versions(uuid),public.grcon_sigem_query_versions(uuid) from public,anon;
grant execute on function private.grcon_sigem_query_versions(uuid),public.grcon_sigem_query_versions(uuid) to authenticated;

commit;
