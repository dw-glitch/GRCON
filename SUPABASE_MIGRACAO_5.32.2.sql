-- GRCON 5.32.2 — exclusão real do histórico e liberação da numeração eGRDT
--
-- A exclusão continua usando um tombstone em grcon_history para sincronizar os
-- navegadores, mas a reserva consumida é removida na mesma transação. O índice
-- e a rotina de reserva passam a considerar somente registros ativos.

begin;

-- Corrige exclusões feitas antes desta versão: a reserva ligada a um registro
-- já excluído não pode continuar bloqueando a numeração.
delete from private.grcon_egrdt_reservations reservation_row
using public.grcon_history history_row
where reservation_row.history_id = history_row.id
  and history_row.deleted_at is not null;

-- O tombstone precisa permanecer para sincronização, mas não representa uma
-- eGRDT ativa e portanto não pode participar da unicidade da numeração.
drop index if exists public.grcon_history_workspace_egrdt_number_uidx;
create unique index grcon_history_workspace_egrdt_number_uidx
  on public.grcon_history (workspace_id, upper(btrim(egrdt_number)))
  where nullif(btrim(egrdt_number), '') is not null
    and deleted_at is null;

create or replace function private.grcon_delete_history_record(
  target_workspace uuid,
  target_history_id uuid default null,
  target_client_record_id text default null,
  target_reservation_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_history_id uuid;
  selected_number text;
  selected_deleted_at timestamptz;
  parsed text[];
  released_rows bigint := 0;
  history_deleted boolean := false;
  locked_year integer;
begin
  if current_user_id is null then
    raise exception 'Sessao expirada. Entre novamente no GRCON.';
  end if;
  if target_workspace is null then
    raise exception 'Workspace nao informado.';
  end if;
  if target_history_id is null and nullif(btrim(target_client_record_id), '') is null
     and coalesce(cardinality(target_reservation_ids), 0) = 0 then
    raise exception 'Registro do historico nao informado.';
  end if;
  if not private.grcon_has_role(target_workspace, array['owner', 'admin']) then
    raise exception 'Seu perfil nao pode excluir registros do historico compartilhado.';
  end if;

  select history_row.id, history_row.egrdt_number, history_row.deleted_at
  into selected_history_id, selected_number, selected_deleted_at
  from public.grcon_history history_row
  where history_row.workspace_id = target_workspace
    and (
      (target_history_id is not null and history_row.id = target_history_id)
      or (
        nullif(btrim(target_client_record_id), '') is not null
        and history_row.client_record_id = target_client_record_id
      )
    )
  order by case when history_row.id = target_history_id then 0 else 1 end
  limit 1
  for update;

  if selected_number is not null then
    parsed := regexp_match(
      selected_number,
      'G-([0-9]{1,4})-([0-9]{4})[[:space:]]*-[[:space:]]*eGRDT',
      'i'
    );
  end if;

  -- Usa a mesma trava da reserva. Assim uma exclusão e uma nova geração do
  -- mesmo workspace/ano nunca disputam a numeração no meio da transação.
  if parsed is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(target_workspace::text || ':' || parsed[2], 0)
    );
  end if;

  -- Uma relação local ainda não sincronizada pode ter somente os IDs das
  -- reservas. Trave esses anos em ordem estável antes de liberar as linhas.
  for locked_year in
    select distinct reservation_row.operational_year
    from private.grcon_egrdt_reservations reservation_row
    where reservation_row.workspace_id = target_workspace
      and reservation_row.id = any(coalesce(target_reservation_ids, array[]::uuid[]))
      and (parsed is null or reservation_row.operational_year <> parsed[2]::integer)
    order by reservation_row.operational_year
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(target_workspace::text || ':' || locked_year::text, 0)
    );
  end loop;

  if selected_history_id is not null and selected_deleted_at is null then
    update public.grcon_history
    set deleted_at = clock_timestamp(),
        deleted_by = current_user_id,
        updated_by = current_user_id
    where id = selected_history_id
      and workspace_id = target_workspace
      and deleted_at is null;
    history_deleted := found;
  end if;

  delete from private.grcon_egrdt_reservations reservation_row
  where reservation_row.workspace_id = target_workspace
    and (
      (selected_history_id is not null and reservation_row.history_id = selected_history_id)
      or reservation_row.id = any(coalesce(target_reservation_ids, array[]::uuid[]))
      or (
        parsed is not null
        and reservation_row.operational_year = parsed[2]::integer
        and reservation_row.sequence = parsed[1]::integer
      )
    );
  get diagnostics released_rows = row_count;

  return jsonb_build_object(
    'deleted', history_deleted,
    'already_deleted', selected_history_id is not null and selected_deleted_at is not null,
    'not_found', selected_history_id is null,
    'released_reservations', released_rows,
    'egrdt_number', coalesce(selected_number, '')
  );
end;
$$;

create or replace function public.grcon_delete_history_record(
  target_workspace uuid,
  target_history_id uuid default null,
  target_client_record_id text default null,
  target_reservation_ids uuid[] default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.grcon_delete_history_record(
    target_workspace,
    target_history_id,
    target_client_record_id,
    target_reservation_ids
  );
$$;

revoke all on function private.grcon_delete_history_record(uuid, uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function private.grcon_delete_history_record(uuid, uuid, text, uuid[]) to authenticated;
revoke all on function public.grcon_delete_history_record(uuid, uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.grcon_delete_history_record(uuid, uuid, text, uuid[]) to authenticated;

-- A rotina de reserva precisa ignorar tombstones, senão o histórico excluído
-- ainda bloquearia tanto um número informado quanto o cálculo do próximo.
create or replace function private.grcon_reserve_egrdt_numbers(
  target_workspace uuid,
  target_year integer,
  amount integer,
  requested_sequences integer[] default null,
  target_request_id uuid default null
)
returns table (
  reserved_sequence integer,
  reserved_year integer,
  base_name text,
  reservation_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  largest_sequence integer := 0;
  requested_count integer := coalesce(cardinality(requested_sequences), 0);
  existing_count integer := 0;
  existing_sequences integer[];
begin
  if current_user_id is null then
    raise exception 'Sessao expirada. Entre novamente no GRCON.';
  end if;
  if not private.grcon_has_role(target_workspace, array['owner', 'admin', 'operator']) then
    raise exception 'Seu perfil nao pode reservar numeros de eGRDT neste workspace.';
  end if;
  if target_year is null or target_year not between 2000 and 9999 then
    raise exception 'Ano operacional invalido.';
  end if;
  if amount is null or amount not between 1 and 100 then
    raise exception 'A quantidade deve estar entre 1 e 100.';
  end if;
  if requested_count > 0 and requested_count <> amount then
    raise exception 'Informe exatamente um numero para cada eGRDT.';
  end if;
  if requested_count > 0 and (
    select count(distinct value) <> requested_count
    from unnest(requested_sequences) as value
  ) then
    raise exception 'Os numeros solicitados nao podem se repetir.';
  end if;
  if requested_count > 0 and exists (
    select 1 from unnest(requested_sequences) as value where value not between 1 and 9999
  ) then
    raise exception 'A sequencia deve estar entre 0001 e 9999.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_workspace::text || ':' || target_year::text, 0));

  if target_request_id is not null then
    select count(*), array_agg(reservation_row.sequence order by reservation_row.request_index)
    into existing_count, existing_sequences
    from private.grcon_egrdt_reservations reservation_row
    where reservation_row.workspace_id = target_workspace
      and reservation_row.reserved_by = current_user_id
      and reservation_row.request_id = target_request_id;

    if existing_count > 0 then
      if existing_count <> amount
         or exists (
           select 1
           from private.grcon_egrdt_reservations reservation_row
           where reservation_row.workspace_id = target_workspace
             and reservation_row.reserved_by = current_user_id
             and reservation_row.request_id = target_request_id
             and reservation_row.operational_year <> target_year
         )
         or (requested_count > 0 and existing_sequences is distinct from requested_sequences) then
        raise exception 'A solicitacao de reserva foi repetida com parametros diferentes.';
      end if;

      return query
      select
        reservation_row.sequence,
        reservation_row.operational_year,
        format(
          '0130870-C1O-PGV-G-%s-%s - eGRDT',
          lpad(reservation_row.sequence::text, 4, '0'),
          reservation_row.operational_year
        ),
        reservation_row.id
      from private.grcon_egrdt_reservations reservation_row
      where reservation_row.workspace_id = target_workspace
        and reservation_row.reserved_by = current_user_id
        and reservation_row.request_id = target_request_id
      order by reservation_row.request_index;
      return;
    end if;
  end if;

  if requested_count > 0 then
    if exists (
      select 1
      from public.grcon_history history_row
      cross join lateral regexp_match(
        history_row.egrdt_number,
        'G-([0-9]{1,4})-([0-9]{4})[[:space:]]*-[[:space:]]*eGRDT',
        'i'
      ) as parsed
      where history_row.workspace_id = target_workspace
        and history_row.deleted_at is null
        and parsed[2]::integer = target_year
        and parsed[1]::integer = any(requested_sequences)
    ) then
      raise exception 'Um dos numeros solicitados ja existe no historico compartilhado.';
    end if;

    begin
      return query
      with requested as (
        select value::integer as sequence, ordinality::integer as request_index
        from unnest(requested_sequences) with ordinality as item(value, ordinality)
      ), inserted as (
        insert into private.grcon_egrdt_reservations (
          workspace_id,
          operational_year,
          sequence,
          reserved_by,
          request_id,
          request_index
        )
        select
          target_workspace,
          target_year,
          requested.sequence,
          current_user_id,
          target_request_id,
          requested.request_index
        from requested
        order by requested.request_index
        returning id, operational_year, sequence, request_index
      )
      select
        inserted.sequence,
        inserted.operational_year,
        format(
          '0130870-C1O-PGV-G-%s-%s - eGRDT',
          lpad(inserted.sequence::text, 4, '0'),
          inserted.operational_year
        ),
        inserted.id
      from inserted
      order by inserted.request_index;
    exception when unique_violation then
      raise exception 'Um dos numeros solicitados ja foi reservado por outro usuario.';
    end;
    return;
  end if;

  select greatest(
    coalesce((
      select max(reservation_row.sequence)
      from private.grcon_egrdt_reservations reservation_row
      where reservation_row.workspace_id = target_workspace
        and reservation_row.operational_year = target_year
    ), 0),
    coalesce((
      select max(parsed[1]::integer)
      from public.grcon_history history_row
      cross join lateral regexp_match(
        history_row.egrdt_number,
        'G-([0-9]{1,4})-([0-9]{4})[[:space:]]*-[[:space:]]*eGRDT',
        'i'
      ) as parsed
      where history_row.workspace_id = target_workspace
        and history_row.deleted_at is null
        and parsed[2]::integer = target_year
    ), 0)
  ) into largest_sequence;

  if largest_sequence + amount > 9999 then
    raise exception 'A quantidade solicitada ultrapassa a sequencia 9999.';
  end if;

  return query
  with generated as (
    select value::integer as sequence, ordinality::integer as request_index
    from generate_series(largest_sequence + 1, largest_sequence + amount)
      with ordinality as item(value, ordinality)
  ), inserted as (
    insert into private.grcon_egrdt_reservations (
      workspace_id,
      operational_year,
      sequence,
      reserved_by,
      request_id,
      request_index
    )
    select
      target_workspace,
      target_year,
      generated.sequence,
      current_user_id,
      target_request_id,
      generated.request_index
    from generated
    returning id, operational_year, sequence, request_index
  )
  select
    inserted.sequence,
    inserted.operational_year,
    format(
      '0130870-C1O-PGV-G-%s-%s - eGRDT',
      lpad(inserted.sequence::text, 4, '0'),
      inserted.operational_year
    ),
    inserted.id
  from inserted
  order by inserted.request_index;
end;
$$;

revoke all on function private.grcon_reserve_egrdt_numbers(uuid, integer, integer, integer[], uuid) from public, anon, authenticated;
grant execute on function private.grcon_reserve_egrdt_numbers(uuid, integer, integer, integer[], uuid) to authenticated;

-- Limpar todo o histórico também libera somente reservas que já viraram
-- registros. Reservas ainda em geração, sem history_id, são preservadas.
create or replace function private.grcon_clear_history(target_workspace uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  removed_rows bigint := 0;
  locked_year integer;
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

  perform pg_advisory_xact_lock(
    hashtextextended('grcon:history:clear:' || target_workspace::text, 0)
  );

  for locked_year in
    select distinct reservation_row.operational_year
    from private.grcon_egrdt_reservations reservation_row
    where reservation_row.workspace_id = target_workspace
      and reservation_row.history_id is not null
    order by reservation_row.operational_year
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(target_workspace::text || ':' || locked_year::text, 0)
    );
  end loop;

  delete from private.grcon_egrdt_reservations reservation_row
  where reservation_row.workspace_id = target_workspace
    and reservation_row.history_id in (
      select history_row.id
      from public.grcon_history history_row
      where history_row.workspace_id = target_workspace
    );

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

revoke all on function private.grcon_clear_history(uuid) from public, anon, authenticated;
grant execute on function private.grcon_clear_history(uuid) to authenticated;

comment on function public.grcon_delete_history_record(uuid, uuid, text, uuid[]) is
  'Exclui uma eGRDT do histórico compartilhado e libera sua numeração para reutilização; somente owner/admin.';
comment on function public.grcon_clear_history(uuid) is
  'Apaga fisicamente o histórico do workspace e libera as numerações consumidas; somente owner/admin.';
comment on function public.grcon_reserve_egrdt_numbers(uuid, integer, integer, integer[], uuid) is
  'Reserva atomicamente números eGRDT por workspace e ano; números de registros excluídos podem ser reutilizados.';

commit;
