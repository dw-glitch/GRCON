-- Aplicada em 15/08/2026 no projeto kvyrttccwzdhasplfxnr
-- (migrações solicitacoes_5_32_9, solicitacoes_funcoes_5_32_9 e
--  solicitacoes_itens_5_32_9). Mantida aqui para registro.
--
-- Estrutura da aba "Consultas e Solicitações": tipos configuráveis,
-- solicitações, itens com protocolo próprio e histórico imutável.
--
-- Mesmo padrão dos demais módulos: tabelas no schema "private", que não é
-- exposto pelo PostgREST, privilégios revogados de public/anon/authenticated,
-- acesso apenas por funções SECURITY DEFINER que conferem o papel, e
-- invólucros públicos SECURITY INVOKER.
-- NENHUMA política de RLS foi criada ou alterada.
--
-- DIVISÃO DE PAPÉIS
--   configurar tipos ......... somente o PROPRIETÁRIO (muda a regra para todos)
--   registrar e tratar ....... qualquer MEMBRO ativo (é o trabalho do dia a dia)
--
-- REGRAS CONFERIDAS NO BANCO DEPOIS DE APLICAR
--   não membro lê ..................... bloqueado ("Sem acesso a esta área…")
--   protocolo repetido ................ recusado pela restrição de unicidade
--   tipo em uso excluído .............. desativado; itens preservados e com o
--                                       type_code intacto
--   tipo nunca usado excluído ......... removido de vez
--   remoção da área de trabalho ....... leva os filhos por cascade
--   advisor de segurança .............. nenhum WARN novo; as quatro tabelas
--                                       entraram com o mesmo INFO
--                                       rls_enabled_no_policy das existentes
--
-- COMO REVERTER
--   drop function if exists public.grcon_request_item_history(uuid, text);
--   drop function if exists public.grcon_update_request_items(uuid, text[], text, text, text);
--   drop function if exists public.grcon_save_request(uuid, jsonb, jsonb);
--   drop function if exists public.grcon_list_request_items(uuid);
--   drop function if exists public.grcon_delete_request_type(uuid, text);
--   drop function if exists public.grcon_save_request_type(uuid, text, text, text, text, text, integer, text[], boolean, integer);
--   drop function if exists public.grcon_get_request_types(uuid);
--   (idem para as implementações em private)
--   drop table if exists private.grcon_request_item_events;
--   drop table if exists private.grcon_request_items;
--   drop table if exists private.grcon_requests;
--   drop table if exists private.grcon_request_types;
--   Guarde uma cópia das quatro tabelas antes, se já houver solicitações reais.

create table if not exists private.grcon_request_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
  code text not null,
  label text not null,
  description text not null default '',
  default_action text not null default '',
  default_priority text not null default 'normal',
  default_deadline_days integer,
  required_fields text[] not null default '{}',
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (workspace_id, code)
);

create table if not exists private.grcon_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
  request_number text not null,
  received_at date,
  requester text not null default '',
  owner_name text not null default '',
  notes text not null default '',
  status text not null default 'rascunho',
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (workspace_id, request_number)
);

create table if not exists private.grcon_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references private.grcon_requests(id) on delete cascade,
  workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
  item_number integer not null,
  -- O protocolo é a identidade do item e não pode repetir na área de trabalho.
  protocol text not null,
  document text not null default '',
  requested_title text not null default '',
  official_title text not null default '',
  type_code text not null default '',
  priority text not null default 'normal',
  owner_name text not null default '',
  deadline date,
  status text not null default 'recebido',
  classification text not null default '',
  recommended_action text not null default '',
  reason text not null default '',
  ld_name text not null default '',
  all_lds text not null default '',
  allocation text not null default '',
  allocation_status text not null default '',
  last_grdt text not null default '',
  sigem_status text not null default '',
  revision text not null default '',
  requested_revision text not null default '',
  needs_manual_validation boolean not null default true,
  observations text not null default '',
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (workspace_id, protocol),
  unique (request_id, item_number)
);

-- Histórico imutável: só recebe inserções. Editar um item nunca apaga o que
-- havia antes, e é daqui que sai a rastreabilidade das solicitações.
create table if not exists private.grcon_request_item_events (
  id bigserial primary key,
  item_id uuid not null references private.grcon_request_items(id) on delete cascade,
  workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
  action text not null,
  field text not null default '',
  old_value text not null default '',
  new_value text not null default '',
  note text not null default '',
  actor_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists grcon_request_items_workspace_idx on private.grcon_request_items (workspace_id, status);
create index if not exists grcon_request_items_document_idx on private.grcon_request_items (workspace_id, document);
create index if not exists grcon_request_item_events_item_idx on private.grcon_request_item_events (item_id, created_at desc);

revoke all on table private.grcon_request_types from public, anon, authenticated;
revoke all on table private.grcon_requests from public, anon, authenticated;
revoke all on table private.grcon_request_items from public, anon, authenticated;
revoke all on table private.grcon_request_item_events from public, anon, authenticated;
revoke all on sequence private.grcon_request_item_events_id_seq from public, anon, authenticated;

-- RLS ligado e sem nenhuma política, igual às demais tabelas do schema privado.
alter table private.grcon_request_types enable row level security;
alter table private.grcon_requests enable row level security;
alter table private.grcon_request_items enable row level security;
alter table private.grcon_request_item_events enable row level security;

-- ---------------------------------------------------------------------------
-- Tipos de solicitação: qualquer membro LÊ, somente o proprietário ALTERA.
-- ---------------------------------------------------------------------------

create or replace function private.grcon_get_request_types(target_workspace uuid)
returns setof private.grcon_request_types
language plpgsql security definer set search_path = private, public, pg_temp
as $$
begin
  if not private.grcon_is_member(target_workspace) then
    raise exception 'Sem acesso a esta área de trabalho.' using errcode = '42501';
  end if;
  return query select * from private.grcon_request_types t
    where t.workspace_id = target_workspace order by t.display_order, t.label;
end;
$$;

create or replace function private.grcon_save_request_type(
  target_workspace uuid, new_code text, new_label text, new_description text,
  new_default_action text, new_default_priority text, new_default_deadline_days integer,
  new_required_fields text[], new_active boolean, new_order integer
)
returns private.grcon_request_types
language plpgsql security definer set search_path = private, public, pg_temp
as $$
declare
  limpo_code text;
  resultado private.grcon_request_types;
begin
  if not private.grcon_has_role(target_workspace, array['owner']) then
    raise exception 'Somente o proprietário pode configurar os tipos de solicitação.' using errcode = '42501';
  end if;
  if coalesce(btrim(new_label), '') = '' then
    raise exception 'O tipo precisa de um nome.' using errcode = '22023';
  end if;
  limpo_code := upper(regexp_replace(coalesce(new_code, ''), '[^A-Za-z0-9_]', '_', 'g'));
  if limpo_code = '' then
    raise exception 'O tipo precisa de um código.' using errcode = '22023';
  end if;

  insert into private.grcon_request_types as t
    (workspace_id, code, label, description, default_action, default_priority,
     default_deadline_days, required_fields, active, display_order, updated_at, updated_by)
  values
    (target_workspace, limpo_code, btrim(new_label), coalesce(new_description, ''),
     coalesce(new_default_action, ''), coalesce(new_default_priority, 'normal'),
     new_default_deadline_days, coalesce(new_required_fields, '{}'),
     coalesce(new_active, true), coalesce(new_order, 0), now(), auth.uid())
  on conflict (workspace_id, code) do update
    set label = excluded.label, description = excluded.description,
        default_action = excluded.default_action, default_priority = excluded.default_priority,
        default_deadline_days = excluded.default_deadline_days,
        required_fields = excluded.required_fields, active = excluded.active,
        display_order = excluded.display_order, updated_at = now(), updated_by = auth.uid()
  returning * into resultado;

  insert into public.grcon_audit_events (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_workspace, auth.uid(), 'request_type_saved', 'request_type', limpo_code,
          jsonb_build_object('rotulo', btrim(new_label), 'ativo', coalesce(new_active, true)));
  return resultado;
end;
$$;

-- Excluir um tipo já usado apagaria a informação de solicitações antigas. Nesse
-- caso a função desativa em vez de remover, preservando o histórico e tirando o
-- tipo apenas das novas solicitações.
create or replace function private.grcon_delete_request_type(target_workspace uuid, target_code text)
returns text
language plpgsql security definer set search_path = private, public, pg_temp
as $$
declare
  em_uso integer;
begin
  if not private.grcon_has_role(target_workspace, array['owner']) then
    raise exception 'Somente o proprietário pode configurar os tipos de solicitação.' using errcode = '42501';
  end if;

  select count(*) into em_uso from private.grcon_request_items i
   where i.workspace_id = target_workspace and i.type_code = target_code;

  if em_uso > 0 then
    update private.grcon_request_types set active = false, updated_at = now(), updated_by = auth.uid()
     where workspace_id = target_workspace and code = target_code;
    insert into public.grcon_audit_events (workspace_id, actor_id, action, entity_type, entity_id, metadata)
    values (target_workspace, auth.uid(), 'request_type_deactivated', 'request_type', target_code,
            jsonb_build_object('itens_em_uso', em_uso));
    return format('desativado: %s item(ns) já usam este tipo e foram preservados', em_uso);
  end if;

  delete from private.grcon_request_types where workspace_id = target_workspace and code = target_code;
  insert into public.grcon_audit_events (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_workspace, auth.uid(), 'request_type_deleted', 'request_type', target_code, '{}'::jsonb);
  return 'removido';
end;
$$;

create or replace function public.grcon_get_request_types(target_workspace uuid)
returns setof private.grcon_request_types
language sql security invoker set search_path = public, private, pg_temp
as $$ select * from private.grcon_get_request_types(target_workspace); $$;

create or replace function public.grcon_save_request_type(
  target_workspace uuid, new_code text, new_label text, new_description text,
  new_default_action text, new_default_priority text, new_default_deadline_days integer,
  new_required_fields text[], new_active boolean, new_order integer
)
returns private.grcon_request_types
language sql security invoker set search_path = public, private, pg_temp
as $$ select * from private.grcon_save_request_type(target_workspace, new_code, new_label, new_description,
       new_default_action, new_default_priority, new_default_deadline_days, new_required_fields, new_active, new_order); $$;

create or replace function public.grcon_delete_request_type(target_workspace uuid, target_code text)
returns text
language sql security invoker set search_path = public, private, pg_temp
as $$ select private.grcon_delete_request_type(target_workspace, target_code); $$;

revoke all on function public.grcon_get_request_types(uuid) from public, anon;
grant execute on function public.grcon_get_request_types(uuid) to authenticated;
revoke all on function public.grcon_save_request_type(uuid, text, text, text, text, text, integer, text[], boolean, integer) from public, anon;
grant execute on function public.grcon_save_request_type(uuid, text, text, text, text, text, integer, text[], boolean, integer) to authenticated;
revoke all on function public.grcon_delete_request_type(uuid, text) from public, anon;
grant execute on function public.grcon_delete_request_type(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Solicitações e itens: qualquer membro ativo registra e trata, porque é o
-- trabalho do dia a dia. Toda alteração grava no histórico, que só recebe
-- inserções.
-- ---------------------------------------------------------------------------

create or replace function private.grcon_list_request_items(target_workspace uuid)
returns table (
  item_id uuid, request_id uuid, request_number text, received_at date, requester text,
  item_number integer, protocol text, document text, requested_title text, official_title text,
  type_code text, priority text, owner_name text, deadline date, status text,
  classification text, recommended_action text, reason text, ld_name text, all_lds text,
  allocation text, allocation_status text, last_grdt text, sigem_status text,
  revision text, requested_revision text, needs_manual_validation boolean,
  observations text, started_at timestamptz, finished_at timestamptz, updated_at timestamptz
)
language plpgsql security definer set search_path = private, public, pg_temp
as $$
begin
  if not private.grcon_is_member(target_workspace) then
    raise exception 'Sem acesso a esta área de trabalho.' using errcode = '42501';
  end if;
  return query
  select i.id, r.id, r.request_number, r.received_at, r.requester,
         i.item_number, i.protocol, i.document, i.requested_title, i.official_title,
         i.type_code, i.priority, i.owner_name, i.deadline, i.status,
         i.classification, i.recommended_action, i.reason, i.ld_name, i.all_lds,
         i.allocation, i.allocation_status, i.last_grdt, i.sigem_status,
         i.revision, i.requested_revision, i.needs_manual_validation,
         i.observations, i.started_at, i.finished_at, i.updated_at
    from private.grcon_request_items i
    join private.grcon_requests r on r.id = i.request_id
   where i.workspace_id = target_workspace
   order by r.request_number desc, i.item_number;
end;
$$;

-- Grava a solicitação inteira com seus itens, numa transação. O protocolo é
-- conferido contra a área de trabalho toda: se já existir em OUTRA solicitação,
-- a gravação falha por inteiro, em vez de deixar dois itens com a mesma
-- identidade.
create or replace function private.grcon_save_request(
  target_workspace uuid, request_payload jsonb, items_payload jsonb
)
returns uuid
language plpgsql security definer set search_path = private, public, pg_temp
as $$
declare
  id_solicitacao uuid;
  numero text;
  item jsonb;
  id_item uuid;
  protocolo text;
  conflito text;
begin
  if not private.grcon_is_member(target_workspace) then
    raise exception 'Sem acesso a esta área de trabalho.' using errcode = '42501';
  end if;

  numero := btrim(coalesce(request_payload->>'request_number', ''));
  if numero = '' then
    raise exception 'Informe o número da solicitação.' using errcode = '22023';
  end if;

  insert into private.grcon_requests as r
    (workspace_id, request_number, received_at, requester, owner_name, notes, status, created_by, updated_by)
  values
    (target_workspace, numero,
     nullif(request_payload->>'received_at', '')::date,
     coalesce(request_payload->>'requester', ''),
     coalesce(request_payload->>'owner_name', ''),
     coalesce(request_payload->>'notes', ''),
     coalesce(nullif(request_payload->>'status', ''), 'recebido'),
     auth.uid(), auth.uid())
  on conflict (workspace_id, request_number) do update
    set received_at = excluded.received_at, requester = excluded.requester,
        owner_name = excluded.owner_name, notes = excluded.notes,
        status = excluded.status, updated_at = now(), updated_by = auth.uid()
  returning r.id into id_solicitacao;

  for item in select * from jsonb_array_elements(coalesce(items_payload, '[]'::jsonb)) loop
    protocolo := btrim(coalesce(item->>'protocol', ''));
    if protocolo = '' then
      raise exception 'Cada item precisa de protocolo.' using errcode = '22023';
    end if;

    -- Protocolo repetido em OUTRA solicitação é erro; na mesma, é atualização.
    select r2.request_number into conflito
      from private.grcon_request_items i2
      join private.grcon_requests r2 on r2.id = i2.request_id
     where i2.workspace_id = target_workspace and i2.protocol = protocolo
       and i2.request_id <> id_solicitacao
     limit 1;
    if conflito is not null then
      raise exception 'O protocolo % já existe na solicitação %.', protocolo, conflito using errcode = '23505';
    end if;

    insert into private.grcon_request_items as i
      (request_id, workspace_id, item_number, protocol, document, requested_title, official_title,
       type_code, priority, owner_name, deadline, status, classification, recommended_action, reason,
       ld_name, all_lds, allocation, allocation_status, last_grdt, sigem_status, revision,
       requested_revision, needs_manual_validation, observations, updated_by)
    values
      (id_solicitacao, target_workspace,
       coalesce((item->>'item_number')::integer, 1), protocolo,
       coalesce(item->>'document', ''), coalesce(item->>'requested_title', ''), coalesce(item->>'official_title', ''),
       coalesce(item->>'type_code', ''), coalesce(nullif(item->>'priority', ''), 'normal'),
       coalesce(item->>'owner_name', ''), nullif(item->>'deadline', '')::date,
       coalesce(nullif(item->>'status', ''), 'recebido'),
       coalesce(item->>'classification', ''), coalesce(item->>'recommended_action', ''), coalesce(item->>'reason', ''),
       coalesce(item->>'ld_name', ''), coalesce(item->>'all_lds', ''), coalesce(item->>'allocation', ''),
       coalesce(item->>'allocation_status', ''), coalesce(item->>'last_grdt', ''), coalesce(item->>'sigem_status', ''),
       coalesce(item->>'revision', ''), coalesce(item->>'requested_revision', ''),
       coalesce((item->>'needs_manual_validation')::boolean, true),
       coalesce(item->>'observations', ''), auth.uid())
    on conflict (workspace_id, protocol) do update
      set document = excluded.document, requested_title = excluded.requested_title,
          official_title = excluded.official_title, type_code = excluded.type_code,
          priority = excluded.priority, owner_name = excluded.owner_name,
          deadline = excluded.deadline, status = excluded.status,
          classification = excluded.classification, recommended_action = excluded.recommended_action,
          reason = excluded.reason, ld_name = excluded.ld_name, all_lds = excluded.all_lds,
          allocation = excluded.allocation, allocation_status = excluded.allocation_status,
          last_grdt = excluded.last_grdt, sigem_status = excluded.sigem_status,
          revision = excluded.revision, requested_revision = excluded.requested_revision,
          needs_manual_validation = excluded.needs_manual_validation,
          observations = excluded.observations, updated_at = now(), updated_by = auth.uid()
    returning i.id into id_item;

    insert into private.grcon_request_item_events (item_id, workspace_id, action, note, actor_id)
    values (id_item, target_workspace, 'saved', coalesce(item->>'classification', ''), auth.uid());
  end loop;

  insert into public.grcon_audit_events (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_workspace, auth.uid(), 'request_saved', 'request', numero,
          jsonb_build_object('itens', jsonb_array_length(coalesce(items_payload, '[]'::jsonb))));
  return id_solicitacao;
end;
$$;

-- Alteração em lote de um campo. Cada item alterado gera uma linha de histórico
-- com o valor anterior e o novo, para reconstruir quem mudou o quê e quando.
-- A lista de campos é fechada: o nome vai para dentro de um format(%I), e sem
-- essa restrição a função viraria uma porta para alterar qualquer coluna.
create or replace function private.grcon_update_request_items(
  target_workspace uuid, target_protocols text[], field_name text, new_value text, note text
)
returns integer
language plpgsql security definer set search_path = private, public, pg_temp
as $$
declare
  alterados integer := 0;
  registro record;
  anterior text;
begin
  if not private.grcon_is_member(target_workspace) then
    raise exception 'Sem acesso a esta área de trabalho.' using errcode = '42501';
  end if;
  if field_name not in ('status', 'owner_name', 'type_code', 'priority', 'deadline', 'observations', 'classification', 'needs_manual_validation') then
    raise exception 'Campo % não pode ser alterado em lote.', field_name using errcode = '22023';
  end if;

  for registro in
    select i.id, i.protocol,
           case field_name
             when 'status' then i.status when 'owner_name' then i.owner_name
             when 'type_code' then i.type_code when 'priority' then i.priority
             when 'deadline' then i.deadline::text when 'observations' then i.observations
             when 'classification' then i.classification
             else i.needs_manual_validation::text end as valor_atual
      from private.grcon_request_items i
     where i.workspace_id = target_workspace and i.protocol = any(target_protocols)
  loop
    anterior := registro.valor_atual;
    execute format(
      'update private.grcon_request_items set %I = $1, updated_at = now(), updated_by = $2 where id = $3',
      field_name
    ) using (case when field_name = 'deadline' then nullif(new_value, '')::date::text
                  when field_name = 'needs_manual_validation' then new_value
                  else new_value end), auth.uid(), registro.id;

    insert into private.grcon_request_item_events (item_id, workspace_id, action, field, old_value, new_value, note, actor_id)
    values (registro.id, target_workspace, 'updated', field_name, coalesce(anterior, ''), coalesce(new_value, ''), coalesce(note, ''), auth.uid());
    alterados := alterados + 1;
  end loop;

  return alterados;
end;
$$;

create or replace function private.grcon_request_item_history(target_workspace uuid, target_protocol text)
returns table (action text, field text, old_value text, new_value text, note text, actor_id uuid, created_at timestamptz)
language plpgsql security definer set search_path = private, public, pg_temp
as $$
begin
  if not private.grcon_is_member(target_workspace) then
    raise exception 'Sem acesso a esta área de trabalho.' using errcode = '42501';
  end if;
  return query
  select e.action, e.field, e.old_value, e.new_value, e.note, e.actor_id, e.created_at
    from private.grcon_request_item_events e
    join private.grcon_request_items i on i.id = e.item_id
   where e.workspace_id = target_workspace and i.protocol = target_protocol
   order by e.created_at desc;
end;
$$;

create or replace function public.grcon_list_request_items(target_workspace uuid)
returns table (
  item_id uuid, request_id uuid, request_number text, received_at date, requester text,
  item_number integer, protocol text, document text, requested_title text, official_title text,
  type_code text, priority text, owner_name text, deadline date, status text,
  classification text, recommended_action text, reason text, ld_name text, all_lds text,
  allocation text, allocation_status text, last_grdt text, sigem_status text,
  revision text, requested_revision text, needs_manual_validation boolean,
  observations text, started_at timestamptz, finished_at timestamptz, updated_at timestamptz
)
language sql security invoker set search_path = public, private, pg_temp
as $$ select * from private.grcon_list_request_items(target_workspace); $$;

create or replace function public.grcon_save_request(target_workspace uuid, request_payload jsonb, items_payload jsonb)
returns uuid language sql security invoker set search_path = public, private, pg_temp
as $$ select private.grcon_save_request(target_workspace, request_payload, items_payload); $$;

create or replace function public.grcon_update_request_items(target_workspace uuid, target_protocols text[], field_name text, new_value text, note text)
returns integer language sql security invoker set search_path = public, private, pg_temp
as $$ select private.grcon_update_request_items(target_workspace, target_protocols, field_name, new_value, note); $$;

create or replace function public.grcon_request_item_history(target_workspace uuid, target_protocol text)
returns table (action text, field text, old_value text, new_value text, note text, actor_id uuid, created_at timestamptz)
language sql security invoker set search_path = public, private, pg_temp
as $$ select * from private.grcon_request_item_history(target_workspace, target_protocol); $$;

revoke all on function public.grcon_list_request_items(uuid) from public, anon;
grant execute on function public.grcon_list_request_items(uuid) to authenticated;
revoke all on function public.grcon_save_request(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.grcon_save_request(uuid, jsonb, jsonb) to authenticated;
revoke all on function public.grcon_update_request_items(uuid, text[], text, text, text) from public, anon;
grant execute on function public.grcon_update_request_items(uuid, text[], text, text, text) to authenticated;
revoke all on function public.grcon_request_item_history(uuid, text) from public, anon;
grant execute on function public.grcon_request_item_history(uuid, text) to authenticated;
