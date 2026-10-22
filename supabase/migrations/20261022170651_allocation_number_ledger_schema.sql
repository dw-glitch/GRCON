-- Allocation numbers outlive the seven-day source-snapshot retention window.
begin;
create table if not exists private.grcon_allocation_numbers (
 contract_id uuid not null references public.grcon_contracts(id) on delete cascade,
 allocation_code text not null,
 code_prefix text not null,
 allocation_year integer not null check (allocation_year between 1 and 9999),
 sequence integer not null check (sequence between 0 and 9999),
 observed_at timestamptz not null default now(),
 primary key(contract_id,allocation_code)
);
create index if not exists grcon_allocation_numbers_sequence on private.grcon_allocation_numbers(contract_id,allocation_year,code_prefix,sequence);
alter table private.grcon_allocation_numbers enable row level security;
revoke all on private.grcon_allocation_numbers from public,anon,authenticated;

create or replace function private.grcon_remember_allocation_numbers(target_snapshot uuid) returns void
language sql security definer set search_path='' as $$
 insert into private.grcon_allocation_numbers(contract_id,allocation_code,code_prefix,allocation_year,sequence)
 select distinct s.contract_id,code.value,m.parts[1],m.parts[3]::integer,m.parts[2]::integer
 from private.grcon_allocation_registry_snapshots s
 join private.grcon_allocation_registry_rows ar on ar.snapshot_id=s.id
 cross join lateral (select upper(regexp_replace(btrim(coalesce(ar.payload->>'allocation','')),'[[:space:]]+','','g')) as value) code
 cross join lateral (select regexp_match(code.value,'^([A-Z0-9]{2,8}-ALOC-[A-Z0-9]{1,8})-([0-9]{4})-([0-9]{4})$') as parts) m
 where s.id=target_snapshot and s.status in ('active','archived') and s.contract_id is not null
   and m.parts is not null and m.parts[3]::integer>0
 on conflict(contract_id,allocation_code) do nothing;
$$;
revoke all on function private.grcon_remember_allocation_numbers(uuid) from public,anon,authenticated;

create or replace function private.grcon_allocation_numbers_from_snapshot() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then
  perform private.grcon_remember_allocation_numbers(OLD.id);
  return OLD;
 end if;
 perform private.grcon_remember_allocation_numbers(NEW.id);
 return NEW;
end $$;
revoke all on function private.grcon_allocation_numbers_from_snapshot() from public,anon,authenticated;
do $$ begin
 if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='private.grcon_allocation_registry_snapshots'::regclass and tgname='grcon_allocation_numbers_published') then
  create trigger grcon_allocation_numbers_published after insert or update of status
   on private.grcon_allocation_registry_snapshots for each row
   when (NEW.status in ('active','archived')) execute function private.grcon_allocation_numbers_from_snapshot();
 end if;
 if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='private.grcon_allocation_registry_snapshots'::regclass and tgname='grcon_allocation_numbers_before_retention') then
  create trigger grcon_allocation_numbers_before_retention before delete
   on private.grcon_allocation_registry_snapshots for each row
   execute function private.grcon_allocation_numbers_from_snapshot();
 end if;
end $$;

select private.grcon_remember_allocation_numbers(id) from private.grcon_allocation_registry_snapshots where status in ('active','archived');
insert into private.grcon_allocation_numbers(contract_id,allocation_code,code_prefix,allocation_year,sequence)
 select distinct rr.contract_id,code.value,m.parts[1],m.parts[3]::integer,m.parts[2]::integer
 from private.grcon_allocation_runs rr
 cross join lateral (select upper(regexp_replace(btrim(rr.allocation_code),'[[:space:]]+','','g')) as value) code
 cross join lateral (select regexp_match(code.value,'^([A-Z0-9]{2,8}-ALOC-[A-Z0-9]{1,8})-([0-9]{4})-([0-9]{4})$') as parts) m
 where m.parts is not null and m.parts[3]::integer>0
 on conflict(contract_id,allocation_code) do nothing;

commit;
