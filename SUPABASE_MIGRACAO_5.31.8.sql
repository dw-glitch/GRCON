-- GRCON 5.31.8
-- Autonomia do proprietário: alterar papel de membros e ativar/desativar
-- acesso, sem depender de ninguém mexer direto no banco. Nenhuma política
-- de RLS foi alterada; são funções novas, no mesmo padrão de segurança já
-- usado por grcon_invite_user e grcon_clear_history (SECURITY DEFINER,
-- restritas por papel, com log em grcon_audit_events).

create or replace function private.grcon_update_member_role(
  target_workspace uuid,
  target_user uuid,
  new_role text
)
returns public.grcon_memberships
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  chosen_role text := lower(btrim(coalesce(new_role, '')));
  active_owners integer;
  result public.grcon_memberships;
begin
  if current_user_id is null then
    raise exception 'Sessão expirada. Entre novamente no GRCON.';
  end if;
  if chosen_role not in ('owner', 'admin', 'operator', 'viewer') then
    raise exception 'Perfil de acesso inválido.';
  end if;
  if not private.grcon_has_role(target_workspace, array['owner']) then
    raise exception 'Somente o proprietário pode alterar perfis de acesso.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('grcon:membership:role:' || target_workspace::text, 0));

  if not exists (
    select 1 from public.grcon_memberships m
    where m.workspace_id = target_workspace and m.user_id = target_user and m.active
  ) then
    raise exception 'Usuário não encontrado neste workspace.';
  end if;

  -- Nunca deixa o workspace sem nenhum proprietário ativo.
  if chosen_role <> 'owner' then
    select count(*) into active_owners
    from public.grcon_memberships m
    where m.workspace_id = target_workspace and m.active and m.role = 'owner';

    if active_owners <= 1 and exists (
      select 1 from public.grcon_memberships m
      where m.workspace_id = target_workspace and m.user_id = target_user and m.role = 'owner'
    ) then
      raise exception 'O workspace precisa de pelo menos um proprietário ativo. Promova outro usuário antes de mudar este perfil.';
    end if;
  end if;

  update public.grcon_memberships
  set role = chosen_role
  where workspace_id = target_workspace and user_id = target_user
  returning * into result;

  insert into public.grcon_audit_events (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_workspace, current_user_id, 'update_role', 'membership', target_user::text, jsonb_build_object('new_role', chosen_role));

  return result;
end;
$$;

create or replace function public.grcon_update_member_role(
  target_workspace uuid,
  target_user uuid,
  new_role text
)
returns public.grcon_memberships
language sql
set search_path = public, private, pg_temp
as $$
  select private.grcon_update_member_role(target_workspace, target_user, new_role);
$$;

revoke all on function public.grcon_update_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.grcon_update_member_role(uuid, uuid, text) to authenticated;
revoke all on function private.grcon_update_member_role(uuid, uuid, text) from public, anon;
grant execute on function private.grcon_update_member_role(uuid, uuid, text) to authenticated;

comment on function public.grcon_update_member_role(uuid, uuid, text) is
  'Somente o proprietário altera o papel de um membro ativo; nunca permite ficar sem nenhum proprietário.';

create or replace function private.grcon_set_member_active(
  target_workspace uuid,
  target_user uuid,
  is_active boolean
)
returns public.grcon_memberships
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  active_owners integer;
  result public.grcon_memberships;
begin
  if current_user_id is null then
    raise exception 'Sessão expirada. Entre novamente no GRCON.';
  end if;
  if not private.grcon_has_role(target_workspace, array['owner']) then
    raise exception 'Somente o proprietário pode ativar ou desativar usuários.';
  end if;
  if target_user = current_user_id and not is_active then
    raise exception 'Você não pode desativar a si mesmo.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('grcon:membership:active:' || target_workspace::text, 0));

  if not exists (
    select 1 from public.grcon_memberships m
    where m.workspace_id = target_workspace and m.user_id = target_user
  ) then
    raise exception 'Usuário não encontrado neste workspace.';
  end if;

  if not is_active then
    select count(*) into active_owners
    from public.grcon_memberships m
    where m.workspace_id = target_workspace and m.active and m.role = 'owner';

    if active_owners <= 1 and exists (
      select 1 from public.grcon_memberships m
      where m.workspace_id = target_workspace and m.user_id = target_user and m.role = 'owner' and m.active
    ) then
      raise exception 'O workspace precisa de pelo menos um proprietário ativo.';
    end if;
  end if;

  update public.grcon_memberships
  set active = is_active
  where workspace_id = target_workspace and user_id = target_user
  returning * into result;

  insert into public.grcon_audit_events (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_workspace, current_user_id, case when is_active then 'reactivate' else 'deactivate' end, 'membership', target_user::text, '{}'::jsonb);

  return result;
end;
$$;

create or replace function public.grcon_set_member_active(
  target_workspace uuid,
  target_user uuid,
  is_active boolean
)
returns public.grcon_memberships
language sql
set search_path = public, private, pg_temp
as $$
  select private.grcon_set_member_active(target_workspace, target_user, is_active);
$$;

revoke all on function public.grcon_set_member_active(uuid, uuid, boolean) from public, anon;
grant execute on function public.grcon_set_member_active(uuid, uuid, boolean) to authenticated;
revoke all on function private.grcon_set_member_active(uuid, uuid, boolean) from public, anon;
grant execute on function private.grcon_set_member_active(uuid, uuid, boolean) to authenticated;

comment on function public.grcon_set_member_active(uuid, uuid, boolean) is
  'Somente o proprietário ativa/desativa um membro; nunca permite ficar sem nenhum proprietário ativo, nem autodesativação.';
