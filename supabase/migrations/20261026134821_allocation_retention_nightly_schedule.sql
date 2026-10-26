-- Nightly retirement of expired allocation-registry snapshots, independent of publication.
-- pg_cron runs within PostgreSQL rather than the user-facing RPC statement timeout.
-- Preserve current active snapshot and allocation-number ledger.
create extension if not exists pg_cron;
select cron.schedule(
 'grcon-allocation-registry-retention',
 '23 5 * * *',
 $$select private.grcon_allocation_registry_prune_batch(2);$$
);
