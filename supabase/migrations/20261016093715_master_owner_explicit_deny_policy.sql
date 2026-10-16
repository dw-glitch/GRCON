-- Explicit deny documents the database-only registry and keeps advisor output clean.
-- Table grants remain revoked for all API roles.
begin;
drop policy if exists grcon_master_registry_deny_api on private.grcon_master_owner;
create policy grcon_master_registry_deny_api on private.grcon_master_owner
for all to anon, authenticated, service_role using (false) with check (false);
commit;
