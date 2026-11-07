-- Raw audit input is independent from the immutable prefix of calculated results.
-- No workbook bytes or credentials. Access follows the existing contract RPC.
create table private.grcon_allocation_audit_inputs (
 run_id uuid not null references private.grcon_allocation_audit_runs(id),
 row_number integer not null check(row_number between 1 and 50000),
 payload jsonb not null,
 primary key(run_id,row_number)
);
alter table private.grcon_allocation_audit_inputs enable row level security;
revoke all on private.grcon_allocation_audit_inputs from public,anon,authenticated;

-- Extend the private implementation; retain the public INVOKER wrapper and
-- all existing membership, decision and idempotent-write checks.
do $migration$
declare definition text;anchor text:=' if operation=''history'' then';
begin
 select pg_get_functiondef('private.grcon_allocation_auditor(uuid,text,jsonb)'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'Unexpected auditor RPC: history anchor missing.';end if;
 definition:=replace(definition,anchor,$guard$
 if operation in ('input-chunk','input-detail') then
  select * into v from private.grcon_allocation_audit_runs where id=(input->>'id')::uuid and contract_id=c and workspace_id=target_workspace for update;
  if not found then raise exception 'Análise indisponível.' using errcode='42501';end if;
  if operation='input-detail' then
   select coalesce(jsonb_agg(to_jsonb(q) order by q.row_number),'[]') into items from (
    select row_number,payload from private.grcon_allocation_audit_inputs where run_id=v.id and row_number>greatest(0,coalesce((input->>'after')::integer,0)) order by row_number limit 200
   ) q;
   return jsonb_build_object('rows',items);
  end if;
  if r not in ('owner','admin','operator') or v.created_by<>u then raise exception 'Somente o autor pode salvar a entrada.' using errcode='42501';end if;
  if v.metadata->>'snapshotVersion' is distinct from '2' or coalesce(v.metadata->>'inputHash','') !~ '^[a-f0-9]{64}$' then raise exception 'Manifesto de entrada inválido.';end if;
  first_row:=(input->>'first')::integer;
  if jsonb_typeof(input->'rows') is distinct from 'array' or jsonb_array_length(input->'rows') not between 1 and 100 or first_row is null or first_row<1 or first_row+jsonb_array_length(input->'rows')-1>v.expected_count then raise exception 'Lote de entrada inválido.';end if;
  for item in select value from jsonb_array_elements(input->'rows') loop
   if jsonb_typeof(item) is distinct from 'object' or octet_length(item::text)>100000 or length(coalesce(item->>'document','')) not between 1 and 255 or item->>'contract' is distinct from c::text then raise exception 'Registro de entrada inválido.';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(input->'rows') with ordinality a(value,n) join private.grcon_allocation_audit_inputs old on old.run_id=v.id and old.row_number=first_row+a.n-1 where old.payload is distinct from a.value) then raise exception 'Entrada imutável já recebida com outro conteúdo.';end if;
  if v.completed_at is not null and (select count(*) from jsonb_array_elements(input->'rows') with ordinality a(value,n) join private.grcon_allocation_audit_inputs old on old.run_id=v.id and old.row_number=first_row+a.n-1 and old.payload=a.value)<>jsonb_array_length(input->'rows') then raise exception 'Entrada concluída é imutável.';end if;
  insert into private.grcon_allocation_audit_inputs select v.id,first_row+a.n::integer-1,a.value from jsonb_array_elements(input->'rows') with ordinality a(value,n) on conflict do nothing;
  return jsonb_build_object('ok',true);
 end if;
 if operation in ('chunk','finish') then
  select * into v from private.grcon_allocation_audit_runs where id=(input->>'id')::uuid and contract_id=c and workspace_id=target_workspace;
  if found and v.metadata->>'snapshotVersion'='2' then
   if (select count(*) from private.grcon_allocation_audit_inputs where run_id=v.id)<>v.expected_count then raise exception 'Entrada completa obrigatória antes dos resultados.';end if;
   if operation='chunk' and jsonb_typeof(input->'rows')='array' then
    first_row:=(input->>'first')::integer;
    if exists(select 1 from jsonb_array_elements(input->'rows') with ordinality a(value,n)
     join private.grcon_allocation_audit_inputs orig on orig.run_id=v.id and orig.row_number=first_row+a.n-1
     where exists(select 1 from unnest(array['document','sourceHash','sourceFile','sourceSheet','sourceRow','allocation']) k where coalesce(orig.payload->>k,'')<>coalesce(a.value->>k,''))
      or (coalesce(orig.payload->>'revision','')<>'' and orig.payload->>'revision' is distinct from a.value->>'revision')) then raise exception 'Resultado não corresponde à ordem e identidade da entrada.';end if;
   end if;
  end if;
 end if;
 if operation='history' then$guard$);
 execute definition;
end $migration$;
