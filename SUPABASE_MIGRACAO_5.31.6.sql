-- GRCON 5.31.6
-- Limpeza física autorizada e retenção preventiva do histórico de eGRDT.
--
-- O projeto está no plano gratuito do Supabase (limite atual de 500 MiB).
-- A retenção começa antes do limite: 300 MiB na relação do histórico ou
-- 400 MiB no banco inteiro. Os 100 registros mais recentes de cada workspace
-- são sempre preservados. As reservas de numeração também são preservadas,
-- pois seu vínculo com o histórico usa ON DELETE SET NULL.

create table if not exists private.grcon_history_retention_state (
  singleton boolean primary key default true check (singleton),
  last_checked_at timestamptz,
  last_pruned_at timestamptz,
  last_removed_rows bigint not null default 0,
  last_db_bytes bigint not null default 0,
  last_relation_bytes bigint not null default 0,
  last_logical_bytes bigint not null default 0,
  last_live_rows bigint not null default 0
);

insert into private.grcon_history_retention_state (singleton)
values (true)
on conflict (singleton) do nothing;

revoke all on table private.grcon_history_retention_state from public, anon, authenticated;

create or replace function private.grcon_prune_history_storage()
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  checked_at timestamptz;
  database_bytes bigint;
  relation_bytes bigint;
  estimated_rows bigint;
  logical_bytes bigint;
  live_rows bigint;
  removed_rows bigint := 0;
  just_removed bigint := 0;
  target_bytes bigint;
  target_rows bigint;
  excess_bytes bigint;
  excess_rows bigint;
begin
  select retention.last_checked_at
  into checked_at
  from private.grcon_history_retention_state retention
  where retention.singleton;

  if checked_at is not null and checked_at > clock_timestamp() - interval '30 minutes' then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('grcon:history:retention', 0));

  select retention.last_checked_at
  into checked_at
  from private.grcon_history_retention_state retention
  where retention.singleton
  for update;

  if checked_at is not null and checked_at > clock_timestamp() - interval '30 minutes' then
    return 0;
  end if;

  database_bytes := pg_database_size(current_database());
  relation_bytes := pg_total_relation_size('public.grcon_history'::regclass);
  select greatest(coalesce(reltuples, 0), 0)::bigint
  into estimated_rows
  from pg_class
  where oid = 'public.grcon_history'::regclass;

  if database_bytes < 400 * 1024 * 1024
     and relation_bytes < 300 * 1024 * 1024
     and estimated_rows <= 15000 then
    update private.grcon_history_retention_state
    set last_checked_at = clock_timestamp(),
        last_removed_rows = 0,
        last_db_bytes = database_bytes,
        last_relation_bytes = relation_bytes
    where singleton;
    return 0;
  end if;

  delete from public.grcon_history
  where deleted_at is not null;
  get diagnostics removed_rows = row_count;

  select count(*), coalesce(sum(pg_column_size(history_row)), 0)
  into live_rows, logical_bytes
  from public.grcon_history history_row;

  if database_bytes >= 400 * 1024 * 1024 then
    target_bytes := 128 * 1024 * 1024;
    target_rows := 5000;
  else
    target_bytes := 240 * 1024 * 1024;
    target_rows := 10000;
  end if;

  excess_bytes := greatest(logical_bytes - target_bytes, 0);
  excess_rows := greatest(live_rows - target_rows, 0);

  if excess_bytes > 0 or excess_rows > 0 then
    with ranked as (
      select
        history_row.id,
        history_row.generated_at,
        history_row.created_at,
        pg_column_size(history_row)::bigint as row_bytes,
        row_number() over (
          partition by history_row.workspace_id
          order by history_row.generated_at desc, history_row.created_at desc, history_row.id desc
        ) as newest_position
      from public.grcon_history history_row
    ),
    oldest_eligible as (
      select
        ranked.id,
        ranked.row_bytes,
        row_number() over (
          order by ranked.generated_at asc, ranked.created_at asc, ranked.id asc
        ) as oldest_position,
        sum(ranked.row_bytes) over (
          order by ranked.generated_at asc, ranked.created_at asc, ranked.id asc
          rows between unbounded preceding and current row
        ) as cumulative_bytes
      from ranked
      where ranked.newest_position > 100
    ),
    victims as (
      select oldest.id
      from oldest_eligible oldest
      where (excess_rows > 0 and oldest.oldest_position <= excess_rows)
         or (excess_bytes > 0 and oldest.cumulative_bytes - oldest.row_bytes < excess_bytes)
    ),
    deleted as (
      delete from public.grcon_history history_row
      using victims
      where history_row.id = victims.id
      returning history_row.id
    )
    select count(*) into just_removed from deleted;
    removed_rows := removed_rows + just_removed;
  end if;

  select count(*), coalesce(sum(pg_column_size(history_row)), 0)
  into live_rows, logical_bytes
  from public.grcon_history history_row;

  update private.grcon_history_retention_state
  set last_checked_at = clock_timestamp(),
      last_pruned_at = case when removed_rows > 0 then clock_timestamp() else last_pruned_at end,
      last_removed_rows = removed_rows,
      last_db_bytes = pg_database_size(current_database()),
      last_relation_bytes = pg_total_relation_size('public.grcon_history'::regclass),
      last_logical_bytes = logical_bytes,
      last_live_rows = live_rows
  where singleton;

  return removed_rows;
end;
$$;

revoke all on function private.grcon_prune_history_storage() from public, anon, authenticated;

create or replace function private.grcon_prune_history_after_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.grcon_prune_history_storage();
  return null;
end;
$$;

revoke all on function private.grcon_prune_history_after_write() from public, anon, authenticated;

drop trigger if exists grcon_history_storage_retention on public.grcon_history;
create trigger grcon_history_storage_retention
after insert or update of payload on public.grcon_history
for each statement execute function private.grcon_prune_history_after_write();

create or replace function private.grcon_clear_history(target_workspace uuid)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  removed_rows bigint := 0;
begin
  if current_user_id is null then
    raise exception 'Sessao expirada. Entre novamente no GRCON.';
  end if;
  if target_workspace is null then
    raise exception 'Workspace nao informado.';
  end if;
  if not private.grcon_has_role(target_workspace, array['owner', 'admin']) then
    raise exception 'Seu perfil nao pode limpar o historico compartilhado.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('grcon:history:clear:' || target_workspace::text, 0));

  delete from public.grcon_history
  where workspace_id = target_workspace;
  get diagnostics removed_rows = row_count;

  update private.grcon_history_retention_state
  set last_checked_at = null,
      last_pruned_at = case when removed_rows > 0 then clock_timestamp() else last_pruned_at end,
      last_removed_rows = removed_rows
  where singleton;

  return removed_rows;
end;
$$;

create or replace function public.grcon_clear_history(target_workspace uuid)
returns bigint
language sql
set search_path = public, private, pg_temp
as $$
  select private.grcon_clear_history(target_workspace);
$$;

revoke all on function public.grcon_clear_history(uuid) from public, anon;
grant execute on function public.grcon_clear_history(uuid) to authenticated;
revoke all on function private.grcon_clear_history(uuid) from public, anon;
grant execute on function private.grcon_clear_history(uuid) to authenticated;

comment on function public.grcon_clear_history(uuid) is
  'Apaga fisicamente o histórico de eGRDT do workspace; somente owner/admin e sem reutilizar numerações reservadas.';
comment on function private.grcon_prune_history_storage() is
  'Retenção preventiva do histórico: inicia em 300 MiB da relação ou 400 MiB do banco, preservando os 100 registros mais recentes por workspace.';
