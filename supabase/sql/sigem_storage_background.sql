-- Server-only delegated execution for a Master-authorized copy job. No new
-- data tables or source mutations: live access is checked for every batch.
begin;
create or replace function private.grcon_sigem_storage_service(target_workspace uuid,actor_id uuid,operation text,input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if operation not in ('inventory','source','source-page') or operation is null
  or actor_id is null or target_workspace is null then
  raise exception 'Operação inválida.' using errcode='22023';
 end if;
 if not exists(select 1 from private.grcon_master_owner g
  join public.grcon_memberships m on m.user_id=g.user_id and m.active and m.role='owner'
  join public.grcon_contracts c on c.id=m.contract_id and c.workspace_id=m.workspace_id and c.active
  where g.user_id=actor_id and m.workspace_id=target_workspace) then
  raise exception 'Acesso Master revogado.' using errcode='42501';
 end if;
 -- Same delegation pattern as grcon_operations_service; caller identity is
 -- supplied only by the server after Auth.getUser, never by browser JSON.
 perform set_config('request.jwt.claim.sub',actor_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_id,'role','authenticated')::text,true);
 return private.grcon_sigem_storage_control(target_workspace,operation,input);
end $$;
revoke all on function private.grcon_sigem_storage_service(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.grcon_sigem_storage_service(uuid,uuid,text,jsonb) to service_role;
create or replace function public.grcon_sigem_storage_service(target_workspace uuid,actor_id uuid,operation text,input jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select private.grcon_sigem_storage_service(target_workspace,actor_id,operation,input);$$;
revoke all on function public.grcon_sigem_storage_service(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.grcon_sigem_storage_service(uuid,uuid,text,jsonb) to service_role;
commit;
