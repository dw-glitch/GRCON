-- Restore audit for explicitly abandoned (unconsumed) official GRDT reservations.
-- A private record allows every recovery to be traced without exposing sensitive actor IDs.
begin;
create table if not exists private.grcon_egrdt_reservation_recovery_audit (
  reservation_id uuid primary key,
  snapshot jsonb not null,
  released_at timestamptz not null default clock_timestamp(),
  reason text not null
);
revoke all on table private.grcon_egrdt_reservation_recovery_audit from public, anon, authenticated;
commit;
