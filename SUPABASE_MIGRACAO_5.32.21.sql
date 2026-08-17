-- Modelos de exportação da aba "Consultas e Solicitações".
--
-- Um modelo guarda a ordem e o nome das colunas do arquivo gerado, para cada
-- frente colar o resultado na planilha dela sem rearrumar coluna depois. Fica
-- no banco para não precisar ser cadastrado de novo em cada máquina; a tela
-- também guarda uma cópia local, que é o que atende quem trabalha sem área
-- compartilhada.
--
-- Mesmo padrão dos demais módulos: tabela no schema "private", que não é
-- exposto pelo PostgREST, privilégios revogados de public/anon/authenticated,
-- acesso apenas por funções SECURITY DEFINER que conferem o papel, e
-- invólucros públicos SECURITY INVOKER.
-- NENHUMA política de RLS foi criada ou alterada.
--
-- DIVISÃO DE PAPÉIS
--   ler os modelos ........... qualquer MEMBRO ativo (usa na exportação)
--   salvar e excluir ......... somente o PROPRIETÁRIO (vale para a equipe toda)
--
-- O QUE FICA GRAVADO EM columns
--   [{ "key": "document", "header": "Documento", "width": 46 }, …]
--   "key" vazio é coluna que o GRCON não preenche e sai em branco na planilha —
--   é assim que a estrutura de um painel oficial é reproduzida sem que nenhum
--   campo seja preenchido por suposição.
--
-- COMO REVERTER
--   drop function if exists public.grcon_delete_export_template(uuid, text);
--   drop function if exists public.grcon_save_export_template(uuid, text, text, text, jsonb);
--   drop function if exists public.grcon_get_export_templates(uuid);
--   (idem para as implementações em private)
--   drop table if exists private.grcon_export_templates;
--   Os modelos salvos no navegador não dependem do banco e continuam valendo.

create table if not exists private.grcon_export_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
  -- Identidade escolhida pela tela, a mesma usada na cópia local do navegador.
  template_id text not null,
  name text not null,
  -- De onde saem as linhas: 'consulta' ou 'controle'.
  base_kind text not null default 'consulta',
  columns jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (workspace_id, template_id)
);

revoke all on table private.grcon_export_templates from public, anon, authenticated;

-- RLS ligado e sem nenhuma política, igual às demais tabelas do schema privado.
alter table private.grcon_export_templates enable row level security;

create or replace function private.grcon_get_export_templates(target_workspace uuid)
returns setof private.grcon_export_templates
language plpgsql security definer set search_path = private, public, pg_temp
as $$
begin
  if not private.grcon_is_member(target_workspace) then
    raise exception 'Sem acesso a esta área de trabalho.' using errcode = '42501';
  end if;
  return query select * from private.grcon_export_templates t
    where t.workspace_id = target_workspace order by t.name;
end;
$$;

create or replace function private.grcon_save_export_template(
  target_workspace uuid, new_template_id text, new_name text,
  new_base_kind text, new_columns jsonb
)
returns private.grcon_export_templates
language plpgsql security definer set search_path = private, public, pg_temp
as $$
declare
  base_limpa text;
  resultado private.grcon_export_templates;
begin
  if not private.grcon_has_role(target_workspace, array['owner']) then
    raise exception 'Somente o proprietário pode salvar modelos de exportação.' using errcode = '42501';
  end if;
  if coalesce(btrim(new_template_id), '') = '' then
    raise exception 'O modelo precisa de um identificador.' using errcode = '22023';
  end if;
  if coalesce(btrim(new_name), '') = '' then
    raise exception 'O modelo precisa de um nome.' using errcode = '22023';
  end if;

  -- Lista fechada: uma base desconhecida geraria um arquivo que a tela não
  -- sabe preencher, e o erro só apareceria na hora de exportar.
  base_limpa := lower(coalesce(btrim(new_base_kind), 'consulta'));
  if base_limpa not in ('consulta', 'controle') then
    raise exception 'Base de dados desconhecida para o modelo: %', base_limpa using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(new_columns, '[]'::jsonb)) <> 'array' then
    raise exception 'As colunas do modelo precisam ser uma lista.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(new_columns, '[]'::jsonb)) = 0 then
    raise exception 'O modelo precisa de pelo menos uma coluna.' using errcode = '22023';
  end if;

  insert into private.grcon_export_templates as t
    (workspace_id, template_id, name, base_kind, columns, created_by, updated_at, updated_by)
  values
    (target_workspace, btrim(new_template_id), btrim(new_name), base_limpa,
     coalesce(new_columns, '[]'::jsonb), auth.uid(), now(), auth.uid())
  on conflict (workspace_id, template_id) do update
    set name = excluded.name, base_kind = excluded.base_kind, columns = excluded.columns,
        updated_at = now(), updated_by = auth.uid()
  returning * into resultado;

  insert into public.grcon_audit_events (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_workspace, auth.uid(), 'export_template_saved', 'export_template', btrim(new_template_id),
          jsonb_build_object('nome', btrim(new_name), 'base', base_limpa,
                             'colunas', jsonb_array_length(coalesce(new_columns, '[]'::jsonb))));
  return resultado;
end;
$$;

-- Excluir um modelo não afeta nenhuma planilha já exportada: o arquivo gerado é
-- independente do cadastro. Por isso aqui a remoção é remoção mesmo.
create or replace function private.grcon_delete_export_template(target_workspace uuid, target_template_id text)
returns integer
language plpgsql security definer set search_path = private, public, pg_temp
as $$
declare
  removidos integer;
begin
  if not private.grcon_has_role(target_workspace, array['owner']) then
    raise exception 'Somente o proprietário pode excluir modelos de exportação.' using errcode = '42501';
  end if;

  delete from private.grcon_export_templates
   where workspace_id = target_workspace and template_id = target_template_id;
  get diagnostics removidos = row_count;

  if removidos > 0 then
    insert into public.grcon_audit_events (workspace_id, actor_id, action, entity_type, entity_id, metadata)
    values (target_workspace, auth.uid(), 'export_template_deleted', 'export_template', target_template_id, '{}'::jsonb);
  end if;
  return removidos;
end;
$$;

create or replace function public.grcon_get_export_templates(target_workspace uuid)
returns setof private.grcon_export_templates
language sql security invoker set search_path = public, private, pg_temp
as $$ select * from private.grcon_get_export_templates(target_workspace); $$;

create or replace function public.grcon_save_export_template(
  target_workspace uuid, new_template_id text, new_name text,
  new_base_kind text, new_columns jsonb
)
returns private.grcon_export_templates
language sql security invoker set search_path = public, private, pg_temp
as $$ select * from private.grcon_save_export_template(target_workspace, new_template_id, new_name, new_base_kind, new_columns); $$;

create or replace function public.grcon_delete_export_template(target_workspace uuid, target_template_id text)
returns integer
language sql security invoker set search_path = public, private, pg_temp
as $$ select private.grcon_delete_export_template(target_workspace, target_template_id); $$;

revoke all on function public.grcon_get_export_templates(uuid) from public, anon;
grant execute on function public.grcon_get_export_templates(uuid) to authenticated;
revoke all on function public.grcon_save_export_template(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.grcon_save_export_template(uuid, text, text, text, jsonb) to authenticated;
revoke all on function public.grcon_delete_export_template(uuid, text) from public, anon;
grant execute on function public.grcon_delete_export_template(uuid, text) to authenticated;
