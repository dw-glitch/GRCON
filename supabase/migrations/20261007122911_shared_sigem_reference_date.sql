begin;
create function private.grcon_sigem_query_set_date(target_workspace uuid,target_snapshot uuid,reference_date date,expected_date text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.grcon_sigem_query_snapshots; old_date text; c uuid;
begin
 if auth.uid() is null or not private.grcon_has_role(target_workspace,array['owner','admin']) then raise exception 'Sem permissão para editar a data.' using errcode='42501'; end if;
 select m.contract_id into c from public.grcon_memberships m where m.workspace_id=target_workspace and m.user_id=auth.uid() and m.active;
 select * into s from private.grcon_sigem_query_snapshots where id=target_snapshot and workspace_id=target_workspace and contract_id=c and status='active' for update;
 if not found then raise exception 'Consulta Geral ativa não localizada.' using errcode='22023'; end if;
 if reference_date is null then raise exception 'Informe a data da Consulta Geral.' using errcode='22023'; end if;
 old_date:=s.metadata->>'referenceDate';
 if old_date is distinct from expected_date then raise exception 'A data foi alterada por outro usuário. Atualize a base.' using errcode='40001'; end if;
 if old_date=reference_date::text then return s.metadata; end if;
 update private.grcon_sigem_query_snapshots set metadata=metadata||jsonb_build_object('referenceDate',reference_date::text,'dateChangedBy',auth.uid(),'dateChangedAt',now()) where id=s.id returning metadata into s.metadata;
 insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata)
 values(target_workspace,c,auth.uid(),'sigem_query_date_changed','sigem_query',s.id::text,jsonb_build_object('previous_date',old_date,'new_date',reference_date,'changed_by',auth.uid(),'changed_at',now()));
 return s.metadata;
end $$;
create function public.grcon_sigem_query_set_date(target_workspace uuid,target_snapshot uuid,reference_date date,expected_date text default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.grcon_sigem_query_set_date(target_workspace,target_snapshot,reference_date,expected_date); $$;
revoke all on function private.grcon_sigem_query_set_date(uuid,uuid,date,text),public.grcon_sigem_query_set_date(uuid,uuid,date,text) from public,anon;
grant execute on function private.grcon_sigem_query_set_date(uuid,uuid,date,text),public.grcon_sigem_query_set_date(uuid,uuid,date,text) to authenticated;
commit;
