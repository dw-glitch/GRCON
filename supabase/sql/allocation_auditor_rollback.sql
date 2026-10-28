-- Roll back only an unused installation. Never silently discard saved audits.
begin;
do $$begin
 if exists(select 1 from private.grcon_allocation_audit_runs) then
  raise exception 'Existem auditorias salvas. Exporte e aprove uma estratégia de preservação antes de remover o módulo.';
 end if;
end$$;
drop function public.grcon_allocation_auditor(uuid,text,jsonb);
drop function private.grcon_allocation_auditor(uuid,text,jsonb);
drop table private.grcon_allocation_audit_events;
drop table private.grcon_allocation_audit_rows;
drop table private.grcon_allocation_audit_runs;
commit;
