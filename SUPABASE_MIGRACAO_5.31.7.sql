-- GRCON 5.31.7
-- Melhorias de banco de dados (sem alterações de segurança/RLS):
--   1) Retenção do log de auditoria (grcon_audit_events), que hoje cresce
--      para sempre sem nenhum limite, ao contrário do histórico.
--   2) Limpeza de reservas de numeração eGRDT abandonadas (nunca consumidas),
--      que hoje ficam para sempre com status 'reserved' e "queimam"
--      permanentemente aquele número.
--   3) Remoção de um índice redundante em grcon_history.
--   4) Remoção retroativa de campos duplicados no payload jsonb de
--      grcon_history que já existem em colunas dedicadas.

-- ---------------------------------------------------------------------
-- 1) Retenção do log de auditoria
-- ---------------------------------------------------------------------

create table if not exists private.grcon_audit_retention_state (
  singleton boolean primary key default true check (singleton),
  last_checked_at timestamptz,
  last_pruned_at timestamptz,
  last_removed_rows bigint not null default 0
);

insert into private.grcon_audit_retention_state (singleton)
values (true)
on conflict (singleton) do nothing;

revoke all on table private.grcon_audit_retention_state from public, anon, authenticated;

create or replace function private.grcon_prune_audit_events()
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  checked_at timestamptz;
  removed_rows bigint := 0;
begin
  select retention.last_checked_at
  into checked_at
  from private.grcon_audit_retention_state retention
  where retention.singleton;

  if checked_at is not null and checked_at > clock_timestamp() - interval '30 minutes' then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('grcon:audit:retention', 0));

  select retention.last_checked_at
  into checked_at
  from private.grcon_audit_retention_state retention
  where retention.singleton
  for update;

  if checked_at is not null and checked_at > clock_timestamp() - interval '30 minutes' then
    return 0;
  end if;

  -- Mantem sempre os 200 eventos mais recentes de cada workspace, e alem
  -- disso remove qualquer evento com mais de 180 dias.
  with ranked as (
    select
      event_row.id,
      row_number() over (
        partition by event_row.workspace_id
        order by event_row.created_at desc, event_row.id desc
      ) as recency_rank
    from public.grcon_audit_events event_row
    where event_row.created_at < clock_timestamp() - interval '180 days'
  ),
  victims as (
    select id from ranked where recency_rank > 200
  ),
  deleted as (
    delete from public.grcon_audit_events event_row
    using victims
    where event_row.id = victims.id
    returning event_row.id
  )
  select count(*) into removed_rows from deleted;

  update private.grcon_audit_retention_state
  set last_checked_at = clock_timestamp(),
      last_pruned_at = case when removed_rows > 0 then clock_timestamp() else last_pruned_at end,
      last_removed_rows = removed_rows
  where singleton;

  return removed_rows;
end;
$$;

revoke all on function private.grcon_prune_audit_events() from public, anon, authenticated;

create or replace function private.grcon_prune_audit_events_after_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.grcon_prune_audit_events();
  return null;
end;
$$;

revoke all on function private.grcon_prune_audit_events_after_write() from public, anon, authenticated;

drop trigger if exists grcon_audit_events_retention on public.grcon_audit_events;
create trigger grcon_audit_events_retention
after insert on public.grcon_audit_events
for each statement execute function private.grcon_prune_audit_events_after_write();

comment on function private.grcon_prune_audit_events() is
  'Retencao do log de auditoria: remove eventos com mais de 180 dias, preservando sempre os 200 mais recentes por workspace.';

-- ---------------------------------------------------------------------
-- 2) Limpeza de reservas de eGRDT abandonadas (nunca consumidas)
-- ---------------------------------------------------------------------
-- Reservas com status 'consumed' nunca sao removidas aqui: elas registram
-- numeros ja efetivamente usados e precisam continuar contando na maior
-- sequencia conhecida (private.grcon_reserve_egrdt_numbers), mesmo que o
-- registro do historico associado seja apagado depois pela retencao de
-- armazenamento. So reservas 'reserved' e vencidas (nunca viraram um
-- eGRDT) sao liberadas, o que evita "queimar" numeros para sempre por
-- causa de sessoes abandonadas.

create index if not exists grcon_egrdt_reservations_stale_idx
  on private.grcon_egrdt_reservations (reserved_at)
  where status = 'reserved';

create table if not exists private.grcon_reservation_retention_state (
  singleton boolean primary key default true check (singleton),
  last_checked_at timestamptz,
  last_pruned_at timestamptz,
  last_removed_rows bigint not null default 0
);

insert into private.grcon_reservation_retention_state (singleton)
values (true)
on conflict (singleton) do nothing;

revoke all on table private.grcon_reservation_retention_state from public, anon, authenticated;

create or replace function private.grcon_prune_stale_reservations()
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  checked_at timestamptz;
  removed_rows bigint := 0;
begin
  select retention.last_checked_at
  into checked_at
  from private.grcon_reservation_retention_state retention
  where retention.singleton;

  if checked_at is not null and checked_at > clock_timestamp() - interval '30 minutes' then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('grcon:reservations:retention', 0));

  select retention.last_checked_at
  into checked_at
  from private.grcon_reservation_retention_state retention
  where retention.singleton
  for update;

  if checked_at is not null and checked_at > clock_timestamp() - interval '30 minutes' then
    return 0;
  end if;

  with deleted as (
    delete from private.grcon_egrdt_reservations reservation_row
    where reservation_row.status = 'reserved'
      and reservation_row.reserved_at < clock_timestamp() - interval '24 hours'
    returning reservation_row.id
  )
  select count(*) into removed_rows from deleted;

  update private.grcon_reservation_retention_state
  set last_checked_at = clock_timestamp(),
      last_pruned_at = case when removed_rows > 0 then clock_timestamp() else last_pruned_at end,
      last_removed_rows = removed_rows
  where singleton;

  return removed_rows;
end;
$$;

revoke all on function private.grcon_prune_stale_reservations() from public, anon, authenticated;

create or replace function private.grcon_prune_stale_reservations_after_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.grcon_prune_stale_reservations();
  return null;
end;
$$;

revoke all on function private.grcon_prune_stale_reservations_after_write() from public, anon, authenticated;

drop trigger if exists grcon_egrdt_reservations_retention on private.grcon_egrdt_reservations;
create trigger grcon_egrdt_reservations_retention
after insert on private.grcon_egrdt_reservations
for each statement execute function private.grcon_prune_stale_reservations_after_write();

comment on function private.grcon_prune_stale_reservations() is
  'Libera reservas de eGRDT com status reserved havia mais de 24h e nunca consumidas, evitando queimar numeros por sessoes abandonadas.';

-- ---------------------------------------------------------------------
-- 3) Indice redundante em grcon_history
-- ---------------------------------------------------------------------
-- grcon_history_workspace_active_generated_idx (workspace_id, generated_at desc)
-- where deleted_at is null cobre o mesmo caso de uso deste indice cheio;
-- toda leitura do app ja filtra deleted_at is null (fetchHistoryRows).
drop index if exists public.grcon_history_workspace_generated_idx;

-- ---------------------------------------------------------------------
-- 4) Remove duplicação retroativa no payload jsonb do histórico
-- ---------------------------------------------------------------------
-- Estes campos já existem como colunas dedicadas (egrdt_number, generated_at,
-- output_type, document_count, file_count, allocations) e o cliente passou a
-- lê-los das colunas em vez do payload (ver grcon_cloud_app.js 5.31.7).
update public.grcon_history
set payload = payload
  - 'egrdtNumber' - 'generatedAt' - 'outputType'
  - 'documentCount' - 'fileCount' - 'allocations'
where payload ?| array['egrdtNumber', 'generatedAt', 'outputType', 'documentCount', 'fileCount', 'allocations'];
