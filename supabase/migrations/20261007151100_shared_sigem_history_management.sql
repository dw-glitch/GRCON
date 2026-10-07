begin;
create or replace function private.grcon_sigem_query_history(target_workspace uuid)
returns table(snapshot_id uuid,file_name text,record_count integer,published_at timestamptz,created_at timestamptz,created_by uuid,metadata jsonb,status text,is_active boolean)
language plpgsql security definer set search_path=private,public,pg_temp as $$
begin
 if auth.uid() is null or not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso à área de trabalho.' using errcode='42501'; end if;
 return query select s.id,s.file_name,s.record_count,s.published_at,s.created_at,s.created_by,s.metadata,s.status,(s.status='active')
 from private.grcon_sigem_query_snapshots s where s.workspace_id=target_workspace and s.status in ('active','archived')
 order by coalesce(s.published_at,s.created_at) desc,s.created_at desc;
end $$;
create or replace function private.grcon_sigem_query_activate(target_workspace uuid,target_snapshot uuid)
returns uuid language plpgsql security definer set search_path=private,public,pg_temp as $$
declare target private.grcon_sigem_query_snapshots;
begin
 if auth.uid() is null or not private.grcon_has_role(target_workspace,array['owner']) then raise exception 'Somente o proprietário pode selecionar a Consulta Geral ativa.' using errcode='42501'; end if;
 perform 1 from public.grcon_workspaces where id=target_workspace for update;
 select * into target from private.grcon_sigem_query_snapshots where id=target_snapshot and workspace_id=target_workspace and status in ('active','archived') for update;
 if not found then raise exception 'Consulta Geral não localizada.' using errcode='22023'; end if;
 if target.status='active' then return target.id; end if;
 update private.grcon_sigem_query_snapshots set status='archived' where workspace_id=target_workspace and status='active';
 update private.grcon_sigem_query_snapshots set status='active' where id=target.id;
 insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata)
 values(target_workspace,target.contract_id,auth.uid(),'sigem_query_activated','sigem_query',target.id::text,jsonb_build_object('arquivo',target.file_name,'registros',target.record_count,'activated_at',now()));
 return target.id;
end $$;
create or replace function private.grcon_sigem_query_delete(target_workspace uuid,target_snapshot uuid)
returns jsonb language plpgsql security definer set search_path=private,public,pg_temp as $$
declare target private.grcon_sigem_query_snapshots; replacement private.grcon_sigem_query_snapshots; was_active boolean;
begin
 if auth.uid() is null or not private.grcon_has_role(target_workspace,array['owner']) then raise exception 'Somente o proprietário pode excluir Consultas Gerais compartilhadas.' using errcode='42501'; end if;
 perform 1 from public.grcon_workspaces where id=target_workspace for update;
 select * into target from private.grcon_sigem_query_snapshots where id=target_snapshot and workspace_id=target_workspace and status in ('active','archived') for update;
 if not found then raise exception 'Consulta Geral não localizada.' using errcode='22023'; end if;
 was_active:=target.status='active';
 if was_active then
  select * into replacement from private.grcon_sigem_query_snapshots where workspace_id=target_workspace and id<>target.id and status='archived'
  order by coalesce(published_at,created_at) desc,created_at desc limit 1 for update;
  update private.grcon_sigem_query_snapshots set status='archived' where id=target.id;
  if replacement.id is not null then update private.grcon_sigem_query_snapshots set status='active' where id=replacement.id; end if;
 end if;
 delete from private.grcon_sigem_query_snapshots where id=target.id;
 insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata)
 values(target_workspace,target.contract_id,auth.uid(),'sigem_query_deleted','sigem_query',target.id::text,
 jsonb_build_object('arquivo',target.file_name,'registros',target.record_count,'was_active',was_active,'replacement_snapshot_id',replacement.id,'deleted_at',now()));
 return jsonb_build_object('deletedSnapshotId',target.id,'wasActive',was_active,'activeSnapshotId',replacement.id);
end $$;
create or replace function public.grcon_sigem_query_history(target_workspace uuid)
returns table(snapshot_id uuid,file_name text,record_count integer,published_at timestamptz,created_at timestamptz,created_by uuid,metadata jsonb,status text,is_active boolean)
language sql security invoker set search_path=public,private,pg_temp as $$ select * from private.grcon_sigem_query_history(target_workspace); $$;
create or replace function public.grcon_sigem_query_activate(target_workspace uuid,target_snapshot uuid)
returns uuid language sql security invoker set search_path=public,private,pg_temp as $$ select private.grcon_sigem_query_activate(target_workspace,target_snapshot); $$;
create or replace function public.grcon_sigem_query_delete(target_workspace uuid,target_snapshot uuid)
returns jsonb language sql security invoker set search_path=public,private,pg_temp as $$ select private.grcon_sigem_query_delete(target_workspace,target_snapshot); $$;
revoke all on function public.grcon_sigem_query_history(uuid) from public,anon;
revoke all on function private.grcon_sigem_query_history(uuid) from public,anon;
revoke all on function public.grcon_sigem_query_activate(uuid,uuid) from public,anon;
revoke all on function private.grcon_sigem_query_activate(uuid,uuid) from public,anon;
revoke all on function public.grcon_sigem_query_delete(uuid,uuid) from public,anon;
revoke all on function private.grcon_sigem_query_delete(uuid,uuid) from public,anon;
grant execute on function public.grcon_sigem_query_history(uuid) to authenticated;
grant execute on function private.grcon_sigem_query_history(uuid) to authenticated;
grant execute on function public.grcon_sigem_query_activate(uuid,uuid) to authenticated;
grant execute on function private.grcon_sigem_query_activate(uuid,uuid) to authenticated;
grant execute on function public.grcon_sigem_query_delete(uuid,uuid) to authenticated;
grant execute on function private.grcon_sigem_query_delete(uuid,uuid) to authenticated;
commit;