-- Master is a database-only capability. Ordinary memberships keep their existing
-- owner/admin/operator roles; no public role or user metadata can grant master.
begin;

create table if not exists private.grcon_master_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now()
);
alter table private.grcon_master_owner enable row level security;
revoke all on private.grcon_master_owner from public, anon, authenticated, service_role;
comment on table private.grcon_master_owner is
  'Exactly one master account, provisioned by a verified UUID directly through SQL. Never grant based on display name or user_metadata.';

create or replace function private.grcon_is_master_owner()
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from private.grcon_master_owner g
    where g.singleton and g.user_id=auth.uid()
      and exists (select 1 from public.grcon_memberships m
        where m.user_id=g.user_id and m.active and m.role='owner')
  );
$$;
revoke all on function private.grcon_is_master_owner() from public, anon, authenticated, service_role;
grant execute on function private.grcon_is_master_owner() to authenticated;

-- Caller learns only whether their own account is master, never the master UUID.
create or replace function public.grcon_is_master_owner()
returns boolean language sql stable security invoker set search_path='' as $$
  select private.grcon_is_master_owner();
$$;
revoke all on function public.grcon_is_master_owner() from public, anon, service_role;
grant execute on function public.grcon_is_master_owner() to authenticated;

create or replace function private.grcon_require_master_owner()
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.grcon_is_master_owner() then
    raise exception 'Acesso restrito ao proprietário master.' using errcode='42501';
  end if;
end $$;
revoke all on function private.grcon_require_master_owner() from public, anon, authenticated, service_role;
grant execute on function private.grcon_require_master_owner() to authenticated;

-- Preserve existing transactional implementations, signatures, locks and audit.
-- Guard every existing PL/pgSQL implementation, including legacy public routes.
-- Abort rather than silently ship an unprotected/missing legacy endpoint.
do $migration$
declare routine record; definition text; endpoint text; guarded integer;
begin
  foreach endpoint in array array['grcon_update_member_role','grcon_set_member_active',
    'grcon_invite_user','grcon_clear_history','grcon_delete_history_record',
    'grcon_history_file_action','grcon_sigem_query_delete'] loop
    guarded:=0;
    for routine in
      select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      join pg_language l on l.oid=p.prolang
      where n.nspname in ('private','public') and p.proname=endpoint and l.lanname='plpgsql'
    loop
      definition:=pg_get_functiondef(routine.oid);
      if position('grcon_master_owner_gate' in definition)=0 then
        if definition !~* '\mbegin\M' then raise exception 'Missing function body: %',endpoint; end if;
        definition:=regexp_replace(definition,'\mbegin\M',
          E'begin\n  -- grcon_master_owner_gate\n  perform private.grcon_require_master_owner();','i');
        execute definition;
      end if;
      guarded:=guarded+1;
    end loop;
    if guarded=0 then raise exception 'Unverified legacy endpoint: %',endpoint; end if;
  end loop;
end $migration$;

-- RLS is additive/restrictive: existing broader owner policies cannot grant writes.
do $policies$
declare target text;
begin
  foreach target in array array['grcon_memberships','grcon_invitations'] loop
    execute format('alter table public.%I enable row level security',target);
    execute format('drop policy if exists grcon_master_insert on public.%I',target);
    execute format('drop policy if exists grcon_master_update on public.%I',target);
    execute format('drop policy if exists grcon_master_delete on public.%I',target);
    execute format('create policy grcon_master_insert on public.%I as restrictive for insert to authenticated with check ((select private.grcon_is_master_owner()))',target);
    execute format('create policy grcon_master_update on public.%I as restrictive for update to authenticated using ((select private.grcon_is_master_owner())) with check ((select private.grcon_is_master_owner()))',target);
    execute format('create policy grcon_master_delete on public.%I as restrictive for delete to authenticated using ((select private.grcon_is_master_owner()))',target);
  end loop;
end $policies$;

-- Also protect writes performed by older SECURITY DEFINER RPCs that bypass RLS.
create or replace function private.grcon_master_membership_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  target:=case when tg_op='DELETE' then old.user_id else new.user_id end;
  -- Harmless idempotent membership refreshes must not break existing logins.
  if tg_op='UPDATE' and to_jsonb(old)=to_jsonb(new) then return new; end if;
  -- Database maintenance and trusted server operations have no caller UUID.
  if auth.uid() is null and (
    session_user in ('postgres','supabase_admin','supabase_auth_admin')
    or auth.jwt()->>'role'='service_role'
  ) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  -- A valid master-issued invitation can create only its intended membership;
  -- accepting an invitation can never reactivate or overwrite existing access.
  if tg_op='INSERT' and new.user_id=auth.uid() and new.active and exists (
    select 1 from public.grcon_invitations i join auth.users u on u.id=auth.uid()
    join private.grcon_master_owner g on g.user_id=i.invited_by
    where lower(i.email)=lower(u.email) and i.workspace_id=new.workspace_id
      and i.role=new.role and i.invited_by=new.invited_by
      and i.accepted_at is null and i.expires_at>now()
  ) and not exists(select 1 from private.grcon_master_owner g where g.user_id=new.user_id) then return new; end if;
  perform private.grcon_require_master_owner();
  if tg_op='INSERT' and new.user_id=auth.uid() and new.role='owner' and new.active then return new; end if;
  if exists(select 1 from private.grcon_master_owner g where g.user_id=target)
     or (tg_op='UPDATE' and exists(select 1 from private.grcon_master_owner g where g.user_id=old.user_id)) then
    raise exception 'A conta do proprietário master é protegida; altere somente diretamente no banco.' using errcode='42501';
  end if;
  if tg_op<>'DELETE' and new.role not in ('owner','admin','operator','viewer') then
    raise exception 'Perfil inválido.' using errcode='22023';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.grcon_master_membership_guard() from public, anon, authenticated, service_role;
drop trigger if exists grcon_master_membership_guard on public.grcon_memberships;
create trigger grcon_master_membership_guard before insert or update or delete on public.grcon_memberships
for each row execute function private.grcon_master_membership_guard();

create or replace function private.grcon_master_profile_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  target:=case when tg_op='DELETE' then old.id else new.id end;
  if auth.uid() is null and (session_user in ('postgres','supabase_admin','supabase_auth_admin') or auth.jwt()->>'role'='service_role') then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op='UPDATE' and new.id is distinct from old.id then
    raise exception 'Identidade imutável.' using errcode='42501';
  end if;
  -- Self-service profile display changes remain possible; they grant no permissions.
  if target=auth.uid() and tg_op<>'DELETE' then return new; end if;
  perform private.grcon_require_master_owner();
  if exists(select 1 from private.grcon_master_owner g where g.user_id=target) then
    raise exception 'Esta conta é protegida.' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.grcon_master_profile_guard() from public, anon, authenticated, service_role;
drop trigger if exists grcon_master_profile_guard on public.grcon_profiles;
create trigger grcon_master_profile_guard before insert or update or delete on public.grcon_profiles
for each row execute function private.grcon_master_profile_guard();

drop policy if exists grcon_master_delete on public.grcon_history;
create policy grcon_master_delete on public.grcon_history as restrictive for delete to authenticated
using ((select private.grcon_is_master_owner()));

-- Existing accounts keep their current role and active status at every login.
-- Only pending invitations issued by the master can establish a new membership.
create or replace function private.grcon_accept_my_invitation()
returns table(workspace_id uuid, role text, workspace_name text)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); account_email text; account_name text;
begin
  if actor is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  select lower(btrim(u.email)),btrim(coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',''))
    into account_email,account_name from auth.users u where u.id=actor;
  if coalesce(account_email,'')='' then raise exception 'Conta sem e-mail válido.' using errcode='22023'; end if;
  insert into public.grcon_profiles(id,email,display_name) values(actor,account_email,account_name)
  on conflict(id) do update set email=excluded.email;
  insert into public.grcon_memberships(workspace_id,contract_id,user_id,role,active,invited_by)
  select i.workspace_id,i.contract_id,actor,i.role,true,i.invited_by
  from public.grcon_invitations i join private.grcon_master_owner g on g.user_id=i.invited_by
  where lower(i.email)=account_email and i.accepted_at is null and i.expires_at>now()
    and not exists(select 1 from public.grcon_memberships m where m.workspace_id=i.workspace_id and m.user_id=actor)
  on conflict on constraint grcon_memberships_pkey do nothing;
  update public.grcon_invitations i set accepted_at=now()
  where lower(i.email)=account_email and i.accepted_at is null and i.expires_at>now()
    and exists(select 1 from private.grcon_master_owner g where g.user_id=i.invited_by)
    and exists(select 1 from public.grcon_memberships m where m.workspace_id=i.workspace_id and m.user_id=actor);
  return query select m.workspace_id,m.role,w.name from public.grcon_memberships m
    join public.grcon_workspaces w on w.id=m.workspace_id
    where m.user_id=actor and m.active order by m.joined_at limit 1;
end $$;
revoke all on function private.grcon_accept_my_invitation() from public,anon,service_role;
grant execute on function private.grcon_accept_my_invitation() to authenticated;

-- Automatic retention must not turn an operator's normal save into a forbidden
-- cleanup. It remains available to the master and server maintenance jobs.
do $retention$
declare definition text;
begin
  select pg_get_functiondef(p.oid) into definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='grcon_prune_history_storage' and p.pronargs=0;
  if definition is not null and position('grcon_master_retention_gate' in definition)=0 then
    definition:=regexp_replace(definition,'\mbegin\M',
      E'begin\n  -- grcon_master_retention_gate\n  if auth.uid() is not null and not private.grcon_is_master_owner() then return 0; end if;','i');
    execute definition;
  end if;
end $retention$;

-- Direct history deletes/soft deletes also need master, even through legacy RLS.
create or replace function private.grcon_master_history_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and (tg_op='DELETE' or old.deleted_at is distinct from new.deleted_at) then
    perform private.grcon_require_master_owner();
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.grcon_master_history_guard() from public, anon, authenticated, service_role;
drop trigger if exists grcon_master_history_guard on public.grcon_history;
create trigger grcon_master_history_guard before update or delete on public.grcon_history
for each row execute function private.grcon_master_history_guard();

-- Atomic profile + membership changes, authorized with the user's JWT.
create or replace function private.grcon_master_save_user(
  target_workspace uuid, target_user uuid, user_name text,
  target_role text, is_active boolean, creating boolean default false
)
returns void language plpgsql security definer set search_path='' as $$
declare account_email text; contract uuid;
begin
  perform private.grcon_require_master_owner();
  perform 1 from private.grcon_master_owner where user_id=auth.uid() for share;
  if target_user is null or nullif(btrim(user_name),'') is null or length(user_name)>160
     or target_role is null or target_role not in ('owner','admin','operator','viewer') or is_active is null then
    raise exception 'Nome, função e acesso válidos são obrigatórios.' using errcode='22023';
  end if;
  if exists(select 1 from private.grcon_master_owner g where g.user_id=target_user) then
    raise exception 'Esta conta é protegida.' using errcode='42501';
  end if;
  select c.id into contract from public.grcon_contracts c where c.workspace_id=target_workspace;
  if contract is null then raise exception 'Contrato não encontrado.' using errcode='22023'; end if;
  if creating and not exists(select 1 from public.grcon_contracts c where c.id=contract and c.active) then
    raise exception 'Contrato inativo.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('grcon:master:user:'||target_user::text,0));
  if not creating and not exists(select 1 from public.grcon_memberships m where m.workspace_id=target_workspace and m.user_id=target_user) then
    raise exception 'Usuário não encontrado neste contrato.' using errcode='22023';
  end if;
  if creating and exists(select 1 from public.grcon_memberships m where m.workspace_id=target_workspace and m.user_id=target_user) then
    raise exception 'Usuário já vinculado; use Editar acesso.' using errcode='22023';
  end if;
  select u.email into account_email from auth.users u where u.id=target_user;
  if account_email is null then raise exception 'Conta não encontrada.' using errcode='22023'; end if;
  insert into public.grcon_profiles(id,email,display_name,updated_at)
  values(target_user,account_email,btrim(user_name),now())
  on conflict(id) do update set display_name=excluded.display_name,updated_at=excluded.updated_at;
  insert into public.grcon_memberships(workspace_id,contract_id,user_id,role,active,invited_by)
  values(target_workspace,contract,target_user,target_role,is_active,auth.uid())
  on conflict(workspace_id,user_id) do update set role=excluded.role,active=excluded.active;
  insert into public.grcon_audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_workspace,auth.uid(),case when creating then 'user_created' else 'user_updated' end,'auth_user',target_user::text,
    jsonb_build_object('role',target_role,'active',is_active,'contract_id',contract));
end $$;
create or replace function public.grcon_master_save_user(
  target_workspace uuid, target_user uuid, user_name text,
  target_role text, is_active boolean, creating boolean default false
)
returns void language sql security invoker set search_path='' as $$
  select private.grcon_master_save_user(target_workspace,target_user,user_name,target_role,is_active,creating);
$$;
revoke all on function private.grcon_master_save_user(uuid,uuid,text,text,boolean,boolean) from public, anon, service_role;
revoke all on function public.grcon_master_save_user(uuid,uuid,text,text,boolean,boolean) from public, anon, service_role;
grant execute on function private.grcon_master_save_user(uuid,uuid,text,text,boolean,boolean) to authenticated;
grant execute on function public.grcon_master_save_user(uuid,uuid,text,text,boolean,boolean) to authenticated;

-- Intentionally no grant by name/email: verify Vinício's auth UUID in the live
-- project before inserting the singleton. Empty registry means deny, never owner fallback.
commit;
