
create or replace function private.grcon_email_template_save(target_workspace uuid,target_scope text,input jsonb)
returns uuid
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
declare
  contract uuid;
  next_version integer;
  result uuid;
  scope_clean text:=lower(btrim(coalesce(target_scope,'contract')));
begin
  if jsonb_typeof(coalesce(input,'{}'::jsonb))<>'object' or octet_length(input::text)>262144 then
    raise exception 'Template inválido.' using errcode='22023';
  end if;
  if scope_clean not in ('global','contract') then raise exception 'Escopo inválido.' using errcode='22023'; end if;
  select c.id into contract from public.grcon_contracts c where c.workspace_id=target_workspace;
  if contract is null or not private.grcon_is_member(target_workspace) then
    raise exception 'Sem acesso ao contrato.' using errcode='42501';
  end if;
  if scope_clean='global' and not private.grcon_is_global_owner() then
    raise exception 'Somente o proprietário pode alterar o modelo global.' using errcode='42501';
  end if;
  if scope_clean='contract' and not private.grcon_has_role(target_workspace,array['owner','admin']) then
    raise exception 'Somente proprietário ou administrador pode alterar o modelo do contrato.' using errcode='42501';
  end if;

  if scope_clean='global' then
    select coalesce(max(version),0)+1 into next_version
    from private.grcon_email_template_versions where scope='global';
    update private.grcon_email_template_versions set active=false
    where scope='global' and active;
    insert into private.grcon_email_template_versions(scope,version,configuration,active,updated_by)
    values('global',next_version,input,true,auth.uid())
    returning id into result;
  else
    select coalesce(max(version),0)+1 into next_version
    from private.grcon_email_template_versions
    where scope='contract' and contract_id=contract;
    update private.grcon_email_template_versions set active=false
    where scope='contract' and contract_id=contract and active;
    insert into private.grcon_email_template_versions(
      workspace_id,contract_id,scope,version,configuration,active,updated_by
    )
    values(target_workspace,contract,'contract',next_version,input,true,auth.uid())
    returning id into result;
  end if;

  insert into public.grcon_audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_workspace,auth.uid(),'email_template_saved','email_template',result::text,
         jsonb_build_object('scope',scope_clean,'version',next_version));
  return result;
end $$;

create or replace function public.grcon_email_template_save(target_workspace uuid,target_scope text,input jsonb)
returns uuid
language sql security invoker
set search_path=public,private,pg_temp
as $$ select private.grcon_email_template_save(target_workspace,target_scope,input); $$;
revoke all on function public.grcon_email_template_save(uuid,text,jsonb) from public,anon;
grant execute on function public.grcon_email_template_save(uuid,text,jsonb) to authenticated;

create or replace function private.grcon_email_template_restore(target_workspace uuid,target_template uuid)
returns uuid
language plpgsql security definer
set search_path=private,public,pg_temp
as $$
declare
  source_scope text;
  source_workspace uuid;
  source_config jsonb;
begin
  select t.scope,t.workspace_id,t.configuration
  into source_scope,source_workspace,source_config
  from private.grcon_email_template_versions t
  where t.id=target_template;
  if not found then raise exception 'Versão de template não encontrada.' using errcode='22023'; end if;
  if source_scope='contract' and source_workspace<>target_workspace then
    raise exception 'Versão pertence a outro contrato.' using errcode='42501';
  end if;
  return private.grcon_email_template_save(target_workspace,source_scope,source_config);
end $$;

create or replace function public.grcon_email_template_restore(target_workspace uuid,target_template uuid)
returns uuid
language sql security invoker
set search_path=public,private,pg_temp
as $$ select private.grcon_email_template_restore(target_workspace,target_template); $$;
revoke all on function public.grcon_email_template_restore(uuid,uuid) from public,anon;
grant execute on function public.grcon_email_template_restore(uuid,uuid) to authenticated;
