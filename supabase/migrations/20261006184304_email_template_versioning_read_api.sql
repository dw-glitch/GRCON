
create or replace function private.grcon_email_template_get(target_workspace uuid)
returns table(template_id uuid,scope text,version integer,configuration jsonb,updated_by uuid,updated_at timestamptz)
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
declare contract uuid;
begin
  if not private.grcon_is_member(target_workspace) then raise exception 'Sem acesso ao contrato.' using errcode='42501'; end if;
  select c.id into contract from public.grcon_contracts c where c.workspace_id=target_workspace;
  return query
    (
      select t.id,t.scope,t.version,t.configuration,t.updated_by,t.updated_at
      from private.grcon_email_template_versions t
      where t.scope='contract' and t.contract_id=contract and t.active
      order by t.version desc limit 1
    )
    union all
    (
      select t.id,t.scope,t.version,t.configuration,t.updated_by,t.updated_at
      from private.grcon_email_template_versions t
      where t.scope='global' and t.active
        and not exists(select 1 from private.grcon_email_template_versions x where x.scope='contract' and x.contract_id=contract and x.active)
      order by t.version desc limit 1
    )
    limit 1;
end $$;

create or replace function public.grcon_email_template_get(target_workspace uuid)
returns table(template_id uuid,scope text,version integer,configuration jsonb,updated_by uuid,updated_at timestamptz)
language sql security invoker set search_path=public,private,pg_temp
as $$ select * from private.grcon_email_template_get(target_workspace); $$;
revoke all on function public.grcon_email_template_get(uuid) from public,anon;
grant execute on function public.grcon_email_template_get(uuid) to authenticated;

create or replace function private.grcon_email_template_versions(target_workspace uuid)
returns table(template_id uuid,scope text,version integer,configuration jsonb,active boolean,updated_by uuid,updated_at timestamptz)
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
declare contract uuid;
begin
  if not private.grcon_has_role(target_workspace,array['owner','admin']) and not private.grcon_is_global_owner() then
    raise exception 'Sem permissão para administrar modelos.' using errcode='42501';
  end if;
  select c.id into contract from public.grcon_contracts c where c.workspace_id=target_workspace;
  return query
    select t.id,t.scope,t.version,t.configuration,t.active,t.updated_by,t.updated_at
    from private.grcon_email_template_versions t
    where (t.scope='contract' and t.contract_id=contract)
       or (t.scope='global' and private.grcon_is_global_owner())
    order by t.scope,t.version desc;
end $$;

create or replace function public.grcon_email_template_versions(target_workspace uuid)
returns table(template_id uuid,scope text,version integer,configuration jsonb,active boolean,updated_by uuid,updated_at timestamptz)
language sql security invoker set search_path=public,private,pg_temp
as $$ select * from private.grcon_email_template_versions(target_workspace); $$;
revoke all on function public.grcon_email_template_versions(uuid) from public,anon;
grant execute on function public.grcon_email_template_versions(uuid) to authenticated;
