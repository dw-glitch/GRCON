
create table if not exists public.grcon_contracts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.grcon_workspaces(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  code text not null unique,
  name text not null,
  display_name text not null,
  company text not null default 'CONSAG',
  client text,
  site text,
  project text,
  active boolean not null default true,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings)='object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.grcon_contracts enable row level security;
revoke all on public.grcon_contracts from anon;
grant select on public.grcon_contracts to authenticated;

create or replace function private.grcon_is_global_owner()
returns boolean
language sql stable security definer
set search_path=public,pg_temp
as $$
  select exists(
    select 1 from public.grcon_memberships m
    where m.user_id=auth.uid() and m.active and m.role='owner'
  );
$$;
revoke all on function private.grcon_is_global_owner() from public,anon,authenticated;

drop policy if exists grcon_contracts_select on public.grcon_contracts;
create policy grcon_contracts_select on public.grcon_contracts
for select to authenticated
using (
  private.grcon_is_global_owner()
  or exists(
    select 1 from public.grcon_memberships m
    where m.workspace_id=grcon_contracts.workspace_id
      and m.user_id=auth.uid() and m.active
  )
);

do $$
declare
  existing_workspace uuid;
  owner_id uuid;
  item record;
  new_workspace uuid;
begin
  select w.id into existing_workspace
  from public.grcon_workspaces w
  order by w.created_at
  limit 1;

  if existing_workspace is null then
    raise exception 'Workspace atual do GRCON não encontrado.';
  end if;

  select m.user_id into owner_id
  from public.grcon_memberships m
  where m.workspace_id=existing_workspace and m.active and m.role='owner'
  order by m.joined_at
  limit 1;

  insert into public.grcon_contracts(
    workspace_id,slug,code,name,display_name,company,client,site,project,active,settings,created_by
  )
  values(
    existing_workspace,'uhdt-d','UHDT-D','Unidade de Hidrotratamento de Diesel',
    'CONSAG / RNEST / UHDT-D','CONSAG','PETROBRAS','RNEST','UHDT-D',true,
    jsonb_build_object(
      'ruleProfile','UHDT','inheritLegacyRules',true,
      'documentRules',jsonb_build_object('profile','UHDT'),
      'taxonomyRules',jsonb_build_object('profile','UHDT'),
      'ldConfiguration',jsonb_build_object('profile','UHDT'),
      'grdtConfiguration',jsonb_build_object('profile','UHDT'),
      'sigemConfiguration',jsonb_build_object('profile','UHDT'),
      'pwConfiguration',jsonb_build_object('profile','UHDT'),
      'forecastConfiguration',jsonb_build_object('profile','UHDT'),
      'emailConfiguration',jsonb_build_object(),
      'conferenceConfiguration',jsonb_build_object(),
      'notificationConfiguration',jsonb_build_object(),
      'enabledModules',jsonb_build_object('legacyUhdtRules',true)
    ),
    owner_id
  )
  on conflict (workspace_id) do update set
    slug=excluded.slug, code=excluded.code, name=excluded.name,
    display_name=excluded.display_name, company=excluded.company,
    client=excluded.client, site=excluded.site, project=excluded.project,
    active=true, settings=excluded.settings, updated_at=now();

  update public.grcon_workspaces
  set name='CONSAG / RNEST / UHDT-D'
  where id=existing_workspace;

  for item in
    select * from (values
      ('ucr','UCR','Unidade de Coqueamento Retardado','CONSAG / RNEST / UCR'),
      ('uda','UDA','Unidade de Destilação Atmosférica','CONSAG / RNEST / UDA'),
      ('ugh','UGH','Unidade de Geração de Hidrogênio','CONSAG / RNEST / UGH'),
      ('patio-de-coque','PÁTIO DE COQUE','Pátio de Coque','CONSAG / RNEST / PÁTIO DE COQUE')
    ) as seed(slug,code,name,display_name)
  loop
    if not exists(select 1 from public.grcon_contracts c where c.code=item.code) then
      insert into public.grcon_workspaces(name,created_by)
      values(item.display_name,owner_id)
      returning id into new_workspace;

      insert into public.grcon_contracts(
        workspace_id,slug,code,name,display_name,company,client,site,project,active,settings,created_by
      )
      values(
        new_workspace,item.slug,item.code,item.name,item.display_name,
        'CONSAG','PETROBRAS','RNEST',item.code,true,
        jsonb_build_object(
          'ruleProfile','UNCONFIGURED','inheritLegacyRules',false,
          'documentRules',jsonb_build_object(),'taxonomyRules',jsonb_build_object(),
          'ldConfiguration',jsonb_build_object(),'grdtConfiguration',jsonb_build_object(),
          'sigemConfiguration',jsonb_build_object(),'pwConfiguration',jsonb_build_object(),
          'forecastConfiguration',jsonb_build_object(),'emailConfiguration',jsonb_build_object(),
          'conferenceConfiguration',jsonb_build_object(),'notificationConfiguration',jsonb_build_object(),
          'enabledModules',jsonb_build_object('legacyUhdtRules',false)
        ),
        owner_id
      );

      insert into public.grcon_memberships(workspace_id,user_id,role,active,invited_by)
      select new_workspace,m.user_id,'owner',true,owner_id
      from public.grcon_memberships m
      where m.workspace_id=existing_workspace and m.active and m.role='owner'
      on conflict (workspace_id,user_id) do update set role='owner',active=true;
    end if;
  end loop;
end $$;

create or replace function private.grcon_fill_contract_id()
returns trigger
language plpgsql security definer
set search_path=public,private,pg_temp
as $$
declare mapped uuid;
begin
  if new.workspace_id is null then
    raise exception 'workspace_id é obrigatório para dados de contrato.' using errcode='23502';
  end if;
  select c.id into mapped from public.grcon_contracts c where c.workspace_id=new.workspace_id;
  if mapped is null then
    raise exception 'Workspace sem contrato associado: %',new.workspace_id using errcode='23503';
  end if;
  if new.contract_id is null then
    new.contract_id:=mapped;
  elsif new.contract_id<>mapped then
    raise exception 'contract_id não corresponde ao workspace_id.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function private.grcon_fill_contract_id() from public,anon,authenticated;

do $$
declare r record; constraint_name text; trigger_name text;
begin
  for r in
    select distinct c.table_schema,c.table_name
    from information_schema.columns c
    where c.table_schema in ('public','private')
      and c.table_name like 'grcon_%'
      and c.column_name='workspace_id'
      and c.table_name<>'grcon_contracts'
  loop
    execute format('alter table %I.%I add column if not exists contract_id uuid',r.table_schema,r.table_name);
    execute format(
      'update %I.%I t set contract_id=c.id from public.grcon_contracts c where t.workspace_id=c.workspace_id and t.contract_id is null',
      r.table_schema,r.table_name
    );
    constraint_name:=left(r.table_name||'_contract_fk',63);
    if not exists(
      select 1 from pg_constraint pc
      join pg_class cl on cl.oid=pc.conrelid
      join pg_namespace ns on ns.oid=cl.relnamespace
      where ns.nspname=r.table_schema and cl.relname=r.table_name and pc.conname=constraint_name
    ) then
      execute format(
        'alter table %I.%I add constraint %I foreign key (contract_id) references public.grcon_contracts(id) on delete restrict',
        r.table_schema,r.table_name,constraint_name
      );
    end if;
    execute format('alter table %I.%I alter column contract_id set not null',r.table_schema,r.table_name);
    trigger_name:=left(r.table_name||'_contract_guard',63);
    execute format('drop trigger if exists %I on %I.%I',trigger_name,r.table_schema,r.table_name);
    execute format(
      'create trigger %I before insert or update of workspace_id,contract_id on %I.%I for each row execute function private.grcon_fill_contract_id()',
      trigger_name,r.table_schema,r.table_name
    );
  end loop;
end $$;

create index if not exists grcon_memberships_contract_user_idx
  on public.grcon_memberships(contract_id,user_id) where active;
create index if not exists grcon_history_contract_generated_idx
  on public.grcon_history(contract_id,generated_at desc) where deleted_at is null;
create index if not exists grcon_audit_events_contract_created_idx
  on public.grcon_audit_events(contract_id,created_at desc);

create or replace function private.grcon_contract_context()
returns table(
  contract_id uuid, workspace_id uuid, slug text, code text, name text,
  display_name text, company text, client text, site text, project text,
  active boolean, role text, settings jsonb
)
language sql stable security definer
set search_path=public,pg_temp
as $$
  select c.id,c.workspace_id,c.slug,c.code,c.name,c.display_name,c.company,c.client,c.site,c.project,
         c.active,m.role,c.settings
  from public.grcon_contracts c
  join public.grcon_memberships m on m.workspace_id=c.workspace_id
  where m.user_id=auth.uid() and m.active
  order by case when c.code='UHDT-D' then 0 else 1 end,c.code;
$$;

create or replace function public.grcon_contract_context()
returns table(
  contract_id uuid, workspace_id uuid, slug text, code text, name text,
  display_name text, company text, client text, site text, project text,
  active boolean, role text, settings jsonb
)
language sql security invoker
set search_path=public,private,pg_temp
as $$ select * from private.grcon_contract_context(); $$;
revoke all on function public.grcon_contract_context() from public,anon;
grant execute on function public.grcon_contract_context() to authenticated;

create or replace function private.grcon_contract_save(input jsonb)
returns public.grcon_contracts
language plpgsql security definer
set search_path=public,private,pg_temp
as $$
declare
  result public.grcon_contracts;
  target_id uuid;
  workspace uuid;
  clean_code text;
  clean_slug text;
  clean_name text;
  clean_display text;
begin
  if not private.grcon_is_global_owner() then
    raise exception 'Somente o proprietário global pode administrar contratos.' using errcode='42501';
  end if;
  if jsonb_typeof(coalesce(input,'{}'::jsonb))<>'object' then
    raise exception 'Contrato inválido.' using errcode='22023';
  end if;
  target_id=nullif(input->>'id','')::uuid;
  clean_code=upper(btrim(coalesce(input->>'code','')));
  clean_slug=lower(btrim(coalesce(input->>'slug','')));
  clean_name=btrim(coalesce(input->>'name',''));
  clean_display=btrim(coalesce(input->>'displayName',''));
  if clean_code='' or clean_name='' or clean_display='' or clean_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Código, slug, nome e identificação visual são obrigatórios.' using errcode='22023';
  end if;

  if target_id is null then
    insert into public.grcon_workspaces(name,created_by)
    values(clean_display,auth.uid()) returning id into workspace;
    insert into public.grcon_contracts(
      workspace_id,slug,code,name,display_name,company,client,site,project,active,settings,created_by
    ) values(
      workspace,clean_slug,clean_code,clean_name,clean_display,
      coalesce(nullif(btrim(input->>'company'),''),'CONSAG'),
      nullif(btrim(input->>'client'),''),
      nullif(btrim(input->>'site'),''),
      nullif(btrim(input->>'project'),''),
      coalesce((input->>'active')::boolean,true),
      case when jsonb_typeof(input->'settings')='object' then input->'settings'
           else jsonb_build_object('ruleProfile','UNCONFIGURED','inheritLegacyRules',false,'enabledModules',jsonb_build_object('legacyUhdtRules',false)) end,
      auth.uid()
    ) returning * into result;
    insert into public.grcon_memberships(workspace_id,user_id,role,active,invited_by)
    values(workspace,auth.uid(),'owner',true,auth.uid())
    on conflict(workspace_id,user_id) do update set role='owner',active=true;
  else
    update public.grcon_contracts c set
      slug=clean_slug,code=clean_code,name=clean_name,display_name=clean_display,
      company=coalesce(nullif(btrim(input->>'company'),''),c.company),
      client=nullif(btrim(input->>'client'),''),
      site=nullif(btrim(input->>'site'),''),
      project=nullif(btrim(input->>'project'),''),
      active=coalesce((input->>'active')::boolean,c.active),
      settings=case when jsonb_typeof(input->'settings')='object' then input->'settings' else c.settings end,
      updated_at=now()
    where c.id=target_id
    returning * into result;
    if not found then raise exception 'Contrato não encontrado.' using errcode='22023'; end if;
    update public.grcon_workspaces set name=result.display_name where id=result.workspace_id;
  end if;
  insert into public.grcon_audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  values(result.workspace_id,auth.uid(),'contract_saved','contract',result.id::text,
         jsonb_build_object('code',result.code,'active',result.active));
  return result;
end $$;

create or replace function public.grcon_contract_save(input jsonb)
returns public.grcon_contracts
language sql security invoker
set search_path=public,private,pg_temp
as $$ select private.grcon_contract_save(input); $$;
revoke all on function public.grcon_contract_save(jsonb) from public,anon;
grant execute on function public.grcon_contract_save(jsonb) to authenticated;

create or replace function private.grcon_contract_settings_save(target_contract uuid,input jsonb)
returns jsonb
language plpgsql security definer
set search_path=public,private,pg_temp
as $$
declare c public.grcon_contracts;
begin
  if jsonb_typeof(coalesce(input,'{}'::jsonb))<>'object' or octet_length(input::text)>262144 then
    raise exception 'Configuração de contrato inválida.' using errcode='22023';
  end if;
  select * into c from public.grcon_contracts where id=target_contract for update;
  if not found then raise exception 'Contrato não encontrado.' using errcode='22023'; end if;
  if not private.grcon_is_global_owner()
     and not private.grcon_has_role(c.workspace_id,array['admin']) then
    raise exception 'Sem permissão para alterar este contrato.' using errcode='42501';
  end if;
  update public.grcon_contracts set settings=input,updated_at=now() where id=c.id;
  insert into public.grcon_audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  values(c.workspace_id,auth.uid(),'contract_settings_saved','contract',c.id::text,'{}'::jsonb);
  return input;
end $$;

create or replace function public.grcon_contract_settings_save(target_contract uuid,input jsonb)
returns jsonb
language sql security invoker
set search_path=public,private,pg_temp
as $$ select private.grcon_contract_settings_save(target_contract,input); $$;
revoke all on function public.grcon_contract_settings_save(uuid,jsonb) from public,anon;
grant execute on function public.grcon_contract_settings_save(uuid,jsonb) to authenticated;
