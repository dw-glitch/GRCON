begin;
create table if not exists private.grcon_ai_daily (
 day date primary key, requests integer not null default 0 check(requests between 0 and 32), probe_reserved boolean not null default false
);
create table if not exists private.grcon_ai_actor_daily (
 day date not null, actor_id uuid not null, requests integer not null default 0 check(requests between 0 and 6), last_at timestamptz,
 primary key(day,actor_id)
);
alter table private.grcon_ai_daily enable row level security;
alter table private.grcon_ai_actor_daily enable row level security;
revoke all on private.grcon_ai_daily,private.grcon_ai_actor_daily from public,anon,authenticated;
create or replace function private.grcon_document_ai_budget(operation text,target_workspace uuid default null,actor_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare today date := (clock_timestamp() at time zone 'UTC')::date; used integer; mine integer; last_request timestamptz; probed boolean;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Somente API de servidor.' using errcode='42501'; end if;
 if operation not in ('status','reserve','probe') or operation is null then raise exception 'Operação inválida.'; end if;
 if operation<>'probe' and not exists(select 1 from public.grcon_memberships m join public.grcon_contracts c on c.id=m.contract_id and c.workspace_id=m.workspace_id and c.active where m.workspace_id=target_workspace and m.user_id=actor_id and m.active) then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
 if operation='status' then
  select d.requests into used from private.grcon_ai_daily d where d.day=today;
  return jsonb_build_object('available',coalesce(used,0)<32,'remaining',greatest(0,32-coalesce(used,0)),'dailyLimit',32);
 end if;
 insert into private.grcon_ai_daily(day) values(today) on conflict do nothing;
 select d.requests,d.probe_reserved into used,probed from private.grcon_ai_daily d where d.day=today for update;
 if used>=32 or (operation='probe' and probed) then return jsonb_build_object('allowed',false,'reason','daily_limit'); end if;
 if operation='reserve' then
  select a.requests,a.last_at into mine,last_request from private.grcon_ai_actor_daily a where a.day=today and a.actor_id=grcon_document_ai_budget.actor_id;
  if coalesce(mine,0)>=6 then return jsonb_build_object('allowed',false,'reason','user_limit'); end if;
  if last_request>clock_timestamp()-interval '10 seconds' then return jsonb_build_object('allowed',false,'reason','cooldown'); end if;
  insert into private.grcon_ai_actor_daily as a(day,actor_id,requests,last_at) values(today,grcon_document_ai_budget.actor_id,1,clock_timestamp()) on conflict on constraint grcon_ai_actor_daily_pkey do update set requests=a.requests+1,last_at=excluded.last_at;
 end if;
 update private.grcon_ai_daily d set requests=d.requests+1,probe_reserved=d.probe_reserved or operation='probe' where d.day=today;
 return jsonb_build_object('allowed',true,'remaining',31-used,'dailyLimit',32);
end $$;
revoke all on function private.grcon_document_ai_budget(text,uuid,uuid) from public,anon,authenticated;
create or replace function public.grcon_document_ai_budget(operation text,target_workspace uuid default null,actor_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.grcon_document_ai_budget(operation,target_workspace,actor_id) $$;
revoke all on function public.grcon_document_ai_budget(text,uuid,uuid) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.grcon_document_ai_budget(text,uuid,uuid),public.grcon_document_ai_budget(text,uuid,uuid) to service_role;
commit;
