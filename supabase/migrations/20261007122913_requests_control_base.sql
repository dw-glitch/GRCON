begin;
create table private.grcon_requests_bases (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.grcon_workspaces(id),
 contract_id uuid not null references public.grcon_contracts(id), file_name text not null,
 expected_count integer not null check(expected_count between 1 and 100000),
 created_by uuid not null, created_at timestamptz not null default now(), published_at timestamptz,
 status text not null default 'pending' check(status in ('pending','active','archived')), expected_active uuid
);
create unique index grcon_requests_one_active on private.grcon_requests_bases(contract_id) where status='active';
create table private.grcon_requests_rows (
 base_id uuid not null references private.grcon_requests_bases(id) on delete cascade,
 row_number integer not null, payload jsonb not null, primary key(base_id,row_number)
);
alter table private.grcon_requests_bases enable row level security;
alter table private.grcon_requests_rows enable row level security;
revoke all on private.grcon_requests_bases,private.grcon_requests_rows from public,anon,authenticated;
create function private.grcon_requests_base(target_workspace uuid,operation text,input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; member_role text; b private.grcon_requests_bases; new_base_id uuid; rows_count integer; active_id uuid; result jsonb;
begin
 select m.contract_id,m.role into c,member_role from public.grcon_memberships m
 join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active
 where m.workspace_id=target_workspace and m.user_id=auth.uid() and m.active;
 if not found then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
 if operation='current' then
  select to_jsonb(s) into result from private.grcon_requests_bases s where s.workspace_id=target_workspace and s.contract_id=c and s.status='active';
  return result;
 elsif operation='page' then
  if not exists(select 1 from private.grcon_requests_bases s where s.id=(input->>'id')::uuid and s.workspace_id=target_workspace and s.contract_id=c and s.status in ('active','archived')) then raise exception 'Base indisponível.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.row_number),'[]') into result from
   (select r.row_number,r.payload from private.grcon_requests_rows r where r.base_id=(input->>'id')::uuid and r.row_number>coalesce((input->>'after')::integer,0) order by r.row_number limit 1000) q;
  return result;
 end if;
 if member_role not in ('owner','admin') then raise exception 'Sem permissão para atualizar a base.' using errcode='42501'; end if;
 if operation='begin' then
  rows_count:=(input->>'count')::integer;
  if rows_count is null or rows_count not between 1 and 100000 or length(btrim(coalesce(input->>'fileName',''))) not between 1 and 255 then raise exception 'Base inválida.'; end if;
  insert into private.grcon_requests_bases(workspace_id,contract_id,file_name,expected_count,created_by,expected_active)
   values(target_workspace,c,input->>'fileName',rows_count,auth.uid(),(input->>'expectedActive')::uuid) returning id into new_base_id;
  return jsonb_build_object('id',new_base_id);
 end if;
 select * into b from private.grcon_requests_bases s where s.id=(input->>'id')::uuid and s.workspace_id=target_workspace and s.contract_id=c and s.status='pending' and s.created_by=auth.uid() for update;
 if not found then raise exception 'Envio indisponível.'; end if;
 if operation='chunk' then
  if jsonb_typeof(input->'rows') is distinct from 'array' or jsonb_array_length(input->'rows') not between 1 and 500 or octet_length(input::text)>4000000 then raise exception 'Lote inválido.'; end if;
  if coalesce((input->>'first')::integer,0)<1 or (input->>'first')::integer+jsonb_array_length(input->'rows')-1>b.expected_count then raise exception 'Contagem inválida.'; end if;
  if exists(select 1 from jsonb_array_elements(input->'rows') r where jsonb_typeof(r) is distinct from 'object' or length(btrim(coalesce(r->>'document',''))) not between 1 and 255 or jsonb_typeof(r->'data') is distinct from 'object') then raise exception 'Documento inválido.'; end if;
  insert into private.grcon_requests_rows(base_id,row_number,payload) select b.id,(input->>'first')::integer+n::integer-1,r from jsonb_array_elements(input->'rows') with ordinality t(r,n)
  on conflict(base_id,row_number) do update set payload=excluded.payload;
  return jsonb_build_object('ok',true);
 elsif operation='publish' then
  perform 1 from public.grcon_contracts where id=c for update;
  select id into active_id from private.grcon_requests_bases where contract_id=c and status='active';
  if active_id is distinct from b.expected_active then raise exception 'Outra base foi publicada. Atualize e tente novamente.' using errcode='40001'; end if;
  if (select count(*) from private.grcon_requests_rows where base_id=b.id)<>b.expected_count then raise exception 'Carga incompleta.'; end if;
  update private.grcon_requests_bases set status='archived' where contract_id=c and status='active';
  update private.grcon_requests_bases set status='active',published_at=now() where id=b.id;
  insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_workspace,c,auth.uid(),'requests_control_published','requests_control',b.id::text,jsonb_build_object('file',b.file_name,'count',b.expected_count));
  delete from private.grcon_requests_bases where contract_id=c and ((status='archived' and published_at<now()-interval '7 days') or (status='pending' and created_at<now()-interval '1 day'));
  return jsonb_build_object('id',b.id);
 end if;
 raise exception 'Operação inválida.';
end $$;
create function public.grcon_requests_base(target_workspace uuid,operation text,input jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select private.grcon_requests_base(target_workspace,operation,input); $$;
revoke all on function public.grcon_requests_base(uuid,text,jsonb),private.grcon_requests_base(uuid,text,jsonb) from public,anon;
grant execute on function public.grcon_requests_base(uuid,text,jsonb),private.grcon_requests_base(uuid,text,jsonb) to authenticated;
commit;
