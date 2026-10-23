begin;
-- Additive preparation only: no source table, pointer, role or existing RPC changes.
create or replace function private.grcon_sigem_storage_control(target_workspace uuid, operation text, input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare c uuid; s private.grcon_sigem_query_snapshots; result jsonb; after_row integer;
begin
 if auth.uid() is null then raise exception 'Sessão obrigatória.' using errcode='42501'; end if;
 select m.contract_id into c from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
 where m.workspace_id=target_workspace and m.user_id=auth.uid() and m.active;
 if c is null then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
 if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>16384 then raise exception 'Consulta inválida.' using errcode='22023'; end if;
 if operation='authorize-page' then
  select * into s from private.grcon_sigem_query_snapshots where id=(input->>'snapshot')::uuid and workspace_id=target_workspace and contract_id=c and status in('active','archived') and deleted_at is null;
  if not found then raise exception 'Base indisponível.' using errcode='22023'; end if;
  return to_jsonb(s);
 end if;
 perform private.grcon_require_master_owner();
 if operation='status' then
  select jsonb_build_object('databaseBytes',pg_database_size(current_database()),'sourceBytes',pg_total_relation_size('private.grcon_sigem_query_rows'),
   'snapshots',count(*),'records',coalesce(sum(record_count),0),'activeRecords',coalesce(sum(record_count) filter(where status='active' and deleted_at is null),0),
   'contractId',c,'source','supabase','cutoverReady',false,'cleanupAllowed',false) into result
  from private.grcon_sigem_query_snapshots where workspace_id=target_workspace and contract_id=c and status in('active','archived');
  return result;
 elsif operation='inventory' then
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]') into result from private.grcon_sigem_query_snapshots t where workspace_id=target_workspace and contract_id=c and status in('active','archived');
  return jsonb_build_object('snapshots',result,'pendingSnapshots',(select count(*) from private.grcon_sigem_query_snapshots where workspace_id=target_workspace and contract_id=c and status='pending'));
 elsif operation in('source','source-page') then
  select * into s from private.grcon_sigem_query_snapshots where id=(input->>'snapshot')::uuid and workspace_id=target_workspace and contract_id=c and status in('active','archived');
  if not found then raise exception 'Base indisponível.' using errcode='22023'; end if;
  if operation='source' then
   if (select count(*) from private.grcon_sigem_query_rows where snapshot_id=s.id)<>s.record_count then raise exception 'Contagem de origem divergente.' using errcode='22023'; end if;
   return to_jsonb(s);
  end if;
  after_row:=coalesce((input->>'after')::integer,0);
  if after_row<0 or after_row>=s.record_count or after_row%250<>0 then raise exception 'Página inválida.' using errcode='22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.row_number),'[]') into result from (select * from private.grcon_sigem_query_rows where snapshot_id=s.id and row_number>after_row order by row_number limit 250)t;
  return jsonb_build_object('source',to_jsonb(s),'rows',result);
 end if;
 raise exception 'Operação inválida.' using errcode='22023';
end $$;
revoke all on function private.grcon_sigem_storage_control(uuid,text,jsonb) from public,anon,service_role;
grant execute on function private.grcon_sigem_storage_control(uuid,text,jsonb) to authenticated;
create or replace function public.grcon_sigem_storage_control(target_workspace uuid,operation text,input jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select private.grcon_sigem_storage_control(target_workspace,operation,input);$$;
revoke all on function public.grcon_sigem_storage_control(uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.grcon_sigem_storage_control(uuid,text,jsonb) to authenticated;
commit;
