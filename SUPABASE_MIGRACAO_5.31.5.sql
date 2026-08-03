-- GRCON 5.31.5
-- Exclusao logica sincronizavel, reservas idempotentes e ciclo de consumo.

alter table public.grcon_history
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'grcon_history_deleted_by_fkey'
      and conrelid = 'public.grcon_history'::regclass
  ) then
    alter table public.grcon_history
      add constraint grcon_history_deleted_by_fkey
      foreign key (deleted_by) references auth.users(id);
  end if;
end;
$$;

create index if not exists grcon_history_deleted_by_idx
  on public.grcon_history (deleted_by)
  where deleted_by is not null;

create index if not exists grcon_history_workspace_active_generated_idx
  on public.grcon_history (workspace_id, generated_at desc)
  where deleted_at is null;

create or replace function private.grcon_enforce_history_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  actor uuid := auth.uid();
begin
  if old.deleted_at is distinct from new.deleted_at then
    if actor is not null
       and not private.grcon_has_role(new.workspace_id, array['owner', 'admin']) then
      raise exception 'Seu perfil nao pode excluir ou restaurar registros do historico compartilhado.';
    end if;

    if new.deleted_at is null then
      new.deleted_by := null;
    elsif actor is not null then
      new.deleted_by := actor;
    end if;
  elsif old.deleted_at is not null and actor is not null then
    raise exception 'Este registro foi excluido do historico compartilhado.';
  end if;
  return new;
end;
$$;

drop trigger if exists grcon_history_soft_delete_guard on public.grcon_history;
create trigger grcon_history_soft_delete_guard
before update on public.grcon_history
for each row execute function private.grcon_enforce_history_soft_delete();

alter table private.grcon_egrdt_reservations
  add column if not exists request_id uuid,
  add column if not exists request_index integer,
  add column if not exists status text not null default 'reserved',
  add column if not exists history_id uuid,
  add column if not exists consumed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'grcon_egrdt_reservations_request_index_check'
      and conrelid = 'private.grcon_egrdt_reservations'::regclass
  ) then
    alter table private.grcon_egrdt_reservations
      add constraint grcon_egrdt_reservations_request_index_check
      check (request_index is null or request_index between 1 and 100);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'grcon_egrdt_reservations_status_check'
      and conrelid = 'private.grcon_egrdt_reservations'::regclass
  ) then
    alter table private.grcon_egrdt_reservations
      add constraint grcon_egrdt_reservations_status_check
      check (status in ('reserved', 'consumed', 'cancelled'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'grcon_egrdt_reservations_history_id_fkey'
      and conrelid = 'private.grcon_egrdt_reservations'::regclass
  ) then
    alter table private.grcon_egrdt_reservations
      add constraint grcon_egrdt_reservations_history_id_fkey
      foreign key (history_id) references public.grcon_history(id) on delete set null;
  end if;
end;
$$;

create index if not exists grcon_egrdt_reservations_reserved_by_idx
  on private.grcon_egrdt_reservations (reserved_by);

create index if not exists grcon_egrdt_reservations_history_id_idx
  on private.grcon_egrdt_reservations (history_id)
  where history_id is not null;

create unique index if not exists grcon_egrdt_reservations_request_item_uidx
  on private.grcon_egrdt_reservations (workspace_id, reserved_by, request_id, request_index)
  where request_id is not null;

create or replace function private.grcon_enforce_egrdt_reservation()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  parsed text[];
  reservation_id uuid;
  reservation_owner uuid;
  reservation_history uuid;
  actor uuid := coalesce(auth.uid(), new.updated_by, new.created_by);
begin
  parsed := regexp_match(
    new.egrdt_number,
    'G-([0-9]{1,4})-([0-9]{4})[[:space:]]*-[[:space:]]*eGRDT',
    'i'
  );
  if parsed is null then
    return new;
  end if;

  select r.id, r.reserved_by, r.history_id
  into reservation_id, reservation_owner, reservation_history
  from private.grcon_egrdt_reservations r
  where r.workspace_id = new.workspace_id
    and r.operational_year = parsed[2]::integer
    and r.sequence = parsed[1]::integer;

  if reservation_owner is not null and reservation_owner is distinct from actor then
    raise exception 'Este numero eGRDT foi reservado por outro usuario.';
  end if;

  if reservation_history is not null and reservation_history is distinct from new.id then
    raise exception 'Este numero eGRDT ja esta vinculado a outro registro do historico.';
  end if;

  return new;
end;
$$;

create or replace function private.grcon_consume_egrdt_reservation()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  parsed text[];
begin
  parsed := regexp_match(
    new.egrdt_number,
    'G-([0-9]{1,4})-([0-9]{4})[[:space:]]*-[[:space:]]*eGRDT',
    'i'
  );
  if parsed is null then
    return new;
  end if;

  update private.grcon_egrdt_reservations r
  set status = 'consumed',
      history_id = new.id,
      consumed_at = coalesce(r.consumed_at, clock_timestamp())
  where r.workspace_id = new.workspace_id
    and r.operational_year = parsed[2]::integer
    and r.sequence = parsed[1]::integer
    and (r.history_id is null or r.history_id = new.id);
  return new;
end;
$$;

drop trigger if exists grcon_history_reservation_consume on public.grcon_history;
create trigger grcon_history_reservation_consume
after insert or update of workspace_id, egrdt_number on public.grcon_history
for each row execute function private.grcon_consume_egrdt_reservation();

drop function if exists public.grcon_reserve_egrdt_numbers(uuid, integer, integer, integer[], uuid);
drop function if exists private.grcon_reserve_egrdt_numbers(uuid, integer, integer, integer[], uuid);
drop function if exists public.grcon_reserve_egrdt_numbers(uuid, integer, integer, integer[]);
drop function if exists private.grcon_reserve_egrdt_numbers(uuid, integer, integer, integer[]);

create function private.grcon_reserve_egrdt_numbers(
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
set search_path = public, private, pg_temp
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
    select count(*), array_agg(r.sequence order by r.request_index)
    into existing_count, existing_sequences
    from private.grcon_egrdt_reservations r
    where r.workspace_id = target_workspace
      and r.reserved_by = current_user_id
      and r.request_id = target_request_id;

    if existing_count > 0 then
      if existing_count <> amount
         or exists (
           select 1
           from private.grcon_egrdt_reservations r
           where r.workspace_id = target_workspace
             and r.reserved_by = current_user_id
             and r.request_id = target_request_id
             and r.operational_year <> target_year
         )
         or (requested_count > 0 and existing_sequences is distinct from requested_sequences) then
        raise exception 'A solicitacao de reserva foi repetida com parametros diferentes.';
      end if;

      return query
      select
        r.sequence,
        r.operational_year,
        format('0130870-C1O-PGV-G-%s-%s - eGRDT', lpad(r.sequence::text, 4, '0'), r.operational_year),
        r.id
      from private.grcon_egrdt_reservations r
      where r.workspace_id = target_workspace
        and r.reserved_by = current_user_id
        and r.request_id = target_request_id
      order by r.request_index;
      return;
    end if;
  end if;

  if requested_count > 0 then
    if exists (
      select 1
      from public.grcon_history h
      cross join lateral regexp_match(
        h.egrdt_number,
        'G-([0-9]{1,4})-([0-9]{4})[[:space:]]*-[[:space:]]*eGRDT',
        'i'
      ) as parsed
      where h.workspace_id = target_workspace
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
          workspace_id, operational_year, sequence, reserved_by, request_id, request_index
        )
        select target_workspace, target_year, requested.sequence, current_user_id, target_request_id, requested.request_index
        from requested
        order by requested.request_index
        returning id, operational_year, sequence, request_index
      )
      select
        inserted.sequence,
        inserted.operational_year,
        format('0130870-C1O-PGV-G-%s-%s - eGRDT', lpad(inserted.sequence::text, 4, '0'), inserted.operational_year),
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
      select max(r.sequence)
      from private.grcon_egrdt_reservations r
      where r.workspace_id = target_workspace
        and r.operational_year = target_year
    ), 0),
    coalesce((
      select max(parsed[1]::integer)
      from public.grcon_history h
      cross join lateral regexp_match(
        h.egrdt_number,
        'G-([0-9]{1,4})-([0-9]{4})[[:space:]]*-[[:space:]]*eGRDT',
        'i'
      ) as parsed
      where h.workspace_id = target_workspace
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
      workspace_id, operational_year, sequence, reserved_by, request_id, request_index
    )
    select target_workspace, target_year, generated.sequence, current_user_id, target_request_id, generated.request_index
    from generated
    returning id, operational_year, sequence, request_index
  )
  select
    inserted.sequence,
    inserted.operational_year,
    format('0130870-C1O-PGV-G-%s-%s - eGRDT', lpad(inserted.sequence::text, 4, '0'), inserted.operational_year),
    inserted.id
  from inserted
  order by inserted.request_index;
end;
$$;

create function public.grcon_reserve_egrdt_numbers(
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
language sql
set search_path = public, private, pg_temp
as $$
  select *
  from private.grcon_reserve_egrdt_numbers(
    target_workspace,
    target_year,
    amount,
    requested_sequences,
    target_request_id
  );
$$;

revoke all on function public.grcon_reserve_egrdt_numbers(uuid, integer, integer, integer[], uuid) from public, anon;
grant execute on function public.grcon_reserve_egrdt_numbers(uuid, integer, integer, integer[], uuid) to authenticated;
revoke all on function private.grcon_reserve_egrdt_numbers(uuid, integer, integer, integer[], uuid) from public, anon;
grant execute on function private.grcon_reserve_egrdt_numbers(uuid, integer, integer, integer[], uuid) to authenticated;

comment on function public.grcon_reserve_egrdt_numbers(uuid, integer, integer, integer[], uuid) is
  'Reserva numeros eGRDT de forma atomica e idempotente por solicitacao; vincula cada reserva ao historico quando consumida.';

-- Estas rotinas existem exclusivamente como funcoes de gatilho. Impedir a
-- chamada direta pela Data API reduz a superficie privilegiada sem afetar os
-- triggers ja instalados em auth.users e public.grcon_profiles.
revoke all on function public.grcon_fill_profile_fields() from public, anon, authenticated;
revoke all on function public.grcon_sync_auth_user_profile() from public, anon, authenticated;
