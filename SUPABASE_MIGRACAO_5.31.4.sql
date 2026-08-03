-- GRCON 5.31.4
-- Reserva atômica da numeração eGRDT entre usuários do mesmo workspace.

create table if not exists private.grcon_egrdt_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
  operational_year integer not null check (operational_year between 2000 and 9999),
  sequence integer not null check (sequence between 1 and 9999),
  reserved_by uuid not null references auth.users(id),
  reserved_at timestamptz not null default now(),
  unique (workspace_id, operational_year, sequence)
);

create index if not exists grcon_egrdt_reservations_workspace_year_idx
  on private.grcon_egrdt_reservations (workspace_id, operational_year, sequence desc);

do $$
begin
  if exists (
    select 1
    from public.grcon_history
    where nullif(btrim(egrdt_number), '') is not null
    group by workspace_id, upper(btrim(egrdt_number))
    having count(*) > 1
  ) then
    raise exception 'Existem números eGRDT duplicados no histórico; corrija-os antes de aplicar a versão 5.31.4.';
  end if;
end;
$$;

create unique index if not exists grcon_history_workspace_egrdt_number_uidx
  on public.grcon_history (workspace_id, upper(btrim(egrdt_number)))
  where nullif(btrim(egrdt_number), '') is not null;

create or replace function private.grcon_enforce_egrdt_reservation()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  parsed text[];
  reservation_owner uuid;
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

  select r.reserved_by
  into reservation_owner
  from private.grcon_egrdt_reservations r
  where r.workspace_id = new.workspace_id
    and r.operational_year = parsed[2]::integer
    and r.sequence = parsed[1]::integer;

  if reservation_owner is not null and reservation_owner is distinct from actor then
    raise exception 'Este número eGRDT foi reservado por outro usuário.';
  end if;
  return new;
end;
$$;

drop trigger if exists grcon_history_reservation_guard on public.grcon_history;
create trigger grcon_history_reservation_guard
before insert or update of workspace_id, egrdt_number on public.grcon_history
for each row execute function private.grcon_enforce_egrdt_reservation();

create or replace function private.grcon_reserve_egrdt_numbers(
  target_workspace uuid,
  target_year integer,
  amount integer,
  requested_sequences integer[] default null
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
begin
  if current_user_id is null then
    raise exception 'Sessão expirada. Entre novamente no GRCON.';
  end if;
  if not private.grcon_has_role(target_workspace, array['owner', 'admin', 'operator']) then
    raise exception 'Seu perfil não pode reservar números de eGRDT neste workspace.';
  end if;
  if target_year is null or target_year not between 2000 and 9999 then
    raise exception 'Ano operacional inválido.';
  end if;
  if amount is null or amount not between 1 and 100 then
    raise exception 'A quantidade deve estar entre 1 e 100.';
  end if;
  if requested_count > 0 and requested_count <> amount then
    raise exception 'Informe exatamente um número para cada eGRDT.';
  end if;
  if requested_count > 0 and (
    select count(distinct value) <> requested_count
    from unnest(requested_sequences) as value
  ) then
    raise exception 'Os números solicitados não podem se repetir.';
  end if;
  if requested_count > 0 and exists (
    select 1 from unnest(requested_sequences) as value where value not between 1 and 9999
  ) then
    raise exception 'A sequência deve estar entre 0001 e 9999.';
  end if;

  -- Serializa somente as reservas do mesmo workspace/ano durante esta transação.
  perform pg_advisory_xact_lock(hashtextextended(target_workspace::text || ':' || target_year::text, 0));

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
      raise exception 'Um dos números solicitados já existe no histórico compartilhado.';
    end if;

    begin
      return query
      with inserted as (
        insert into private.grcon_egrdt_reservations (
          workspace_id, operational_year, sequence, reserved_by
        )
        select target_workspace, target_year, value, current_user_id
        from unnest(requested_sequences) as value
        order by value
        returning id, operational_year, sequence
      )
      select
        inserted.sequence,
        inserted.operational_year,
        format('0130870-C1O-PGV-G-%s-%s - eGRDT', lpad(inserted.sequence::text, 4, '0'), inserted.operational_year),
        inserted.id
      from inserted
      order by inserted.sequence;
    exception when unique_violation then
      raise exception 'Um dos números solicitados já foi reservado por outro usuário.';
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
    raise exception 'A quantidade solicitada ultrapassa a sequência 9999.';
  end if;

  return query
  with inserted as (
    insert into private.grcon_egrdt_reservations (
      workspace_id, operational_year, sequence, reserved_by
    )
    select target_workspace, target_year, value, current_user_id
    from generate_series(largest_sequence + 1, largest_sequence + amount) as value
    returning id, operational_year, sequence
  )
  select
    inserted.sequence,
    inserted.operational_year,
    format('0130870-C1O-PGV-G-%s-%s - eGRDT', lpad(inserted.sequence::text, 4, '0'), inserted.operational_year),
    inserted.id
  from inserted
  order by inserted.sequence;
end;
$$;

create or replace function public.grcon_reserve_egrdt_numbers(
  target_workspace uuid,
  target_year integer,
  amount integer,
  requested_sequences integer[] default null
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
    requested_sequences
  );
$$;

revoke all on function public.grcon_reserve_egrdt_numbers(uuid, integer, integer, integer[]) from public, anon;
grant execute on function public.grcon_reserve_egrdt_numbers(uuid, integer, integer, integer[]) to authenticated;
revoke all on function private.grcon_reserve_egrdt_numbers(uuid, integer, integer, integer[]) from public, anon;
grant execute on function private.grcon_reserve_egrdt_numbers(uuid, integer, integer, integer[]) to authenticated;

comment on function public.grcon_reserve_egrdt_numbers(uuid, integer, integer, integer[]) is
  'Reserva atomicamente números eGRDT por workspace e ano; números reservados não são reutilizados.';
