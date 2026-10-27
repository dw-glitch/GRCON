-- GRCON: distinguish generated history from ephemeral eGRDT reservations.
-- Safe under per-workspace/year advisory lock. No automatic deletion of historical GRDTs.
begin;
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
  -- Do not burn numbers permanently when the browser closes during generation.
  -- Two hours is the conservative lease; never remove a record with a confirmed history.
  delete from private.grcon_egrdt_reservations pending
  where pending.workspace_id = target_workspace
    and pending.operational_year = target_year
    and pending.status = 'reserved'
    and pending.history_id is null
    and pending.reserved_at < clock_timestamp() - interval '2 hours'
    and not exists (
      select 1 from public.grcon_history completed
      where completed.workspace_id = pending.workspace_id
        and completed.deleted_at is null
        and completed.egrdt_number ~* (
          'G-' || lpad(pending.sequence::text,4,'0') || '-' || target_year || '[[:space:]]*-[[:space:]]*eGRDT'
        )
    );


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

  -- Only actually generated GRDTs establish the last official sequence.
  select coalesce(max(parsed[1]::integer), 0) into largest_sequence
  from public.grcon_history history_row
  cross join lateral regexp_match(
    history_row.egrdt_number,
    'G-([0-9]{1,4})-([0-9]{4})[[:space:]]*-[[:space:]]*eGRDT',
    'i'
  ) as parsed
  where history_row.workspace_id = target_workspace
    and history_row.deleted_at is null
    and parsed[2]::integer = target_year;

  -- Skip only concurrent ACTIVE reservations, never treat them as "generated".
  while exists (
    select 1 from private.grcon_egrdt_reservations pending
    where pending.workspace_id = target_workspace
      and pending.operational_year = target_year
      and pending.sequence between largest_sequence + 1 and largest_sequence + amount
      and pending.status = 'reserved'
  ) loop
    largest_sequence := largest_sequence + 1;
    if largest_sequence + amount > 9999 then
      raise exception 'A quantidade solicitada ultrapassa a sequencia 9999.';
    end if;
  end loop;

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
create or replace function private.grcon_release_egrdt_reservations(
 target_workspace uuid, target_request_id uuid
) returns integer language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); release_year integer; released integer := 0; deleted_count integer;
begin
 if actor is null or target_workspace is null or target_request_id is null then
   raise exception 'Sessao, workspace ou tentativa invalidos.';
 end if;
 if not private.grcon_has_role(target_workspace,array['owner','admin','operator']) then
   raise exception 'Perfil sem permissao de reserva.';
 end if;
 -- Lock in chronological order, consistent with the reserving transaction.
 for release_year in
   select distinct operational_year from private.grcon_egrdt_reservations
   where workspace_id=target_workspace and request_id=target_request_id and reserved_by=actor
   order by operational_year
 loop
   perform pg_advisory_xact_lock(hashtextextended(target_workspace::text || ':' || release_year::text,0));
   delete from private.grcon_egrdt_reservations reservation_row
   where reservation_row.workspace_id = target_workspace
     and reservation_row.request_id = target_request_id
     and reservation_row.reserved_by = actor
     and reservation_row.operational_year = release_year
     and reservation_row.status = 'reserved'
     and reservation_row.history_id is null
     and not exists (
       select 1 from public.grcon_history h
       where h.workspace_id=target_workspace and h.deleted_at is null
         and h.egrdt_number ~* ('G-' || lpad(reservation_row.sequence::text,4,'0') || '-' || release_year || '[[:space:]]*-[[:space:]]*eGRDT')
     );
   get diagnostics deleted_count=row_count;
   released:=released+deleted_count;
 end loop;
 return released;
end;
$$;

create or replace function public.grcon_release_egrdt_reservations(
 target_workspace uuid, target_request_id uuid
) returns integer language sql security invoker set search_path = '' as $$
 select private.grcon_release_egrdt_reservations(target_workspace,target_request_id);
$$;
revoke all on function private.grcon_release_egrdt_reservations(uuid,uuid) from public, anon,authenticated;
grant execute on function private.grcon_release_egrdt_reservations(uuid,uuid) to authenticated;
revoke all on function public.grcon_release_egrdt_reservations(uuid,uuid) from public, anon,authenticated;
grant execute on function public.grcon_release_egrdt_reservations(uuid,uuid) to authenticated;
commit;
