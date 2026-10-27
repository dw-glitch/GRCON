begin;
-- Authoritative preview. A reservation is an active generation guard, never the last published GRDT.
create or replace function private.grcon_egrdt_sequence_status(target_workspace uuid,target_year integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare last_confirmed integer := 0; next_candidate integer := 1; active_count integer := 0;
begin
 if auth.uid() is null or not private.grcon_has_role(target_workspace,array['owner','admin','operator']) then
    raise exception 'Sem permissao para consultar a numeracao do historico.';
 end if;
 if target_year is null or target_year not between 2000 and 9999 then
    raise exception 'Ano operacional invalido.';
 end if;
 select coalesce(max(parsed[1]::int),0) into last_confirmed
 from public.grcon_history h
 cross join lateral regexp_match(h.egrdt_number,'G-([0-9]{1,4})-([0-9]{4})[[:space:]]*-[[:space:]]*eGRDT','i') as parsed
 where h.workspace_id=target_workspace and h.deleted_at is null and parsed[2]::int=target_year;
 next_candidate:=last_confirmed+1;
 select count(*) into active_count from private.grcon_egrdt_reservations r
 where r.workspace_id=target_workspace and r.operational_year=target_year and r.status='reserved' and r.history_id is null;
 while exists(select 1 from private.grcon_egrdt_reservations r where r.workspace_id=target_workspace
    and r.operational_year=target_year and r.status='reserved' and r.sequence=next_candidate) loop
   next_candidate:=next_candidate+1;
   if next_candidate>9999 then exit; end if;
 end loop;
 return jsonb_build_object('last_generated',last_confirmed,'next_available',next_candidate,'active_reservations',active_count,'year',target_year);
end; $$;
create or replace function public.grcon_egrdt_sequence_status(target_workspace uuid,target_year integer)
returns jsonb language sql security invoker set search_path='' as $$
 select private.grcon_egrdt_sequence_status(target_workspace,target_year);
$$;
revoke all on function private.grcon_egrdt_sequence_status(uuid,integer) from public,anon,authenticated;
grant execute on function private.grcon_egrdt_sequence_status(uuid,integer) to authenticated;
revoke all on function public.grcon_egrdt_sequence_status(uuid,integer) from public,anon,authenticated;
grant execute on function public.grcon_egrdt_sequence_status(uuid,integer) to authenticated;
commit;