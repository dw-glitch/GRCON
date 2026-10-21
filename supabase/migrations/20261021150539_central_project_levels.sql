-- Activate the Central master hierarchy in the publication transaction.
begin;

revoke all on function private.grcon_registry_project_levels() from public,anon,authenticated,service_role;
do $$ begin
if not exists(select 1 from pg_trigger where tgname='grcon_registry_project_levels' and tgrelid='private.grcon_allocation_registry_snapshots'::regclass) then
create trigger grcon_registry_project_levels after insert or update of status,metadata on private.grcon_allocation_registry_snapshots
for each row execute function private.grcon_registry_project_levels();
end if;
end $$;
commit;
