-- Aplicada em 12/08/2026 no projeto kvyrttccwzdhasplfxnr
-- (migrações central_alocacao_5_32_6 e central_alocacao_rls_igual_ao_modelo_email_5_32_6).
-- Mantida aqui para registro.
--
-- Central de alocação compartilhada por área de trabalho: é a planilha de rede
-- de onde a coluna STATUS INTERNO do relatório puxa o comentário da fiscal.
-- Qualquer membro USA o cadastro; somente o PROPRIETÁRIO altera, e a alteração
-- vale para todos que usam o aplicativo.
--
-- Mesmo padrão do modelo do e-mail de evidência: a tabela fica no schema
-- "private", que não é exposto pelo PostgREST, e todo o acesso passa por
-- funções SECURITY DEFINER com verificação de papel. Os invólucros públicos são
-- SECURITY INVOKER, como todos os outros do GRCON. NENHUMA política de RLS foi
-- criada ou alterada.
--
-- Comportamento conferido depois de aplicar:
--   proprietário grava .......... ok
--   operador lê ................. ok
--   operador tenta gravar ....... bloqueado ("Somente o proprietário pode
--                                 alterar a central de alocação.")
--   não membro lê ............... bloqueado ("Sem acesso a esta área de trabalho.")
--   anônimo lê .................. bloqueado (permission denied for function)

create table if not exists private.grcon_allocation_center (
  workspace_id uuid primary key references public.grcon_workspaces(id) on delete cascade,
  file_path text not null,
  sheet_name text not null,
  key_column text not null,
  comment_column text not null,
  last_row integer not null default 20000,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

revoke all on table private.grcon_allocation_center from public, anon, authenticated;

-- RLS ligado e sem nenhuma política, igual a private.grcon_email_template. Não
-- muda o acesso: os privilégios já foram revogados acima e as funções abaixo
-- pertencem ao dono da tabela, que não é filtrado por RLS.
alter table private.grcon_allocation_center enable row level security;

create or replace function private.grcon_get_allocation_center(target_workspace uuid)
returns table (
  file_path text,
  sheet_name text,
  key_column text,
  comment_column text,
  last_row integer,
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if not private.grcon_is_member(target_workspace) then
    raise exception 'Sem acesso a esta área de trabalho.' using errcode = '42501';
  end if;

  return query
  select c.file_path, c.sheet_name, c.key_column, c.comment_column, c.last_row, c.updated_at, c.updated_by
  from private.grcon_allocation_center c
  where c.workspace_id = target_workspace;
end;
$$;

create or replace function private.grcon_set_allocation_center(
  target_workspace uuid,
  new_path text,
  new_sheet text,
  new_key_column text,
  new_comment_column text,
  new_last_row integer
)
returns table (
  file_path text,
  sheet_name text,
  key_column text,
  comment_column text,
  last_row integer,
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  limpo_path text;
  limpo_sheet text;
  limpo_key text;
  limpo_comment text;
  limpo_last_row integer;
begin
  if not private.grcon_has_role(target_workspace, array['owner']) then
    raise exception 'Somente o proprietário pode alterar a central de alocação.' using errcode = '42501';
  end if;

  limpo_path := coalesce(btrim(new_path), '');
  limpo_sheet := coalesce(btrim(new_sheet), '');
  -- As colunas viram letra pura: é assim que entram na referência da PROCX.
  limpo_key := upper(regexp_replace(coalesce(new_key_column, ''), '[^A-Za-z]', '', 'g'));
  limpo_comment := upper(regexp_replace(coalesce(new_comment_column, ''), '[^A-Za-z]', '', 'g'));

  if limpo_path = '' then
    raise exception 'Informe o caminho do arquivo da central de alocação.' using errcode = '22023';
  end if;
  if limpo_sheet = '' then
    raise exception 'Informe a aba da central de alocação.' using errcode = '22023';
  end if;
  if limpo_key = '' or limpo_comment = '' then
    raise exception 'Informe a coluna da alocação e a coluna do comentário da fiscal.' using errcode = '22023';
  end if;

  -- Limite de linhas de uma planilha. A faixa é delimitada porque referência
  -- externa a coluna inteira não resolve com o arquivo de origem fechado.
  limpo_last_row := least(1048576, greatest(2, coalesce(new_last_row, 20000)));

  insert into private.grcon_allocation_center as c
    (workspace_id, file_path, sheet_name, key_column, comment_column, last_row, updated_at, updated_by)
  values
    (target_workspace, limpo_path, limpo_sheet, limpo_key, limpo_comment, limpo_last_row, now(), auth.uid())
  on conflict (workspace_id) do update
    set file_path      = excluded.file_path,
        sheet_name     = excluded.sheet_name,
        key_column     = excluded.key_column,
        comment_column = excluded.comment_column,
        last_row       = excluded.last_row,
        updated_at     = now(),
        updated_by     = auth.uid();

  insert into public.grcon_audit_events (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_workspace, auth.uid(), 'allocation_center_updated', 'allocation_center', target_workspace::text,
          jsonb_build_object('aba', limpo_sheet, 'coluna_alocacao', limpo_key, 'coluna_comentario', limpo_comment));

  return query
  select c2.file_path, c2.sheet_name, c2.key_column, c2.comment_column, c2.last_row, c2.updated_at, c2.updated_by
  from private.grcon_allocation_center c2
  where c2.workspace_id = target_workspace;
end;
$$;

create or replace function public.grcon_get_allocation_center(target_workspace uuid)
returns table (
  file_path text,
  sheet_name text,
  key_column text,
  comment_column text,
  last_row integer,
  updated_at timestamptz,
  updated_by uuid
)
language sql
security invoker
set search_path = public, private, pg_temp
as $$ select * from private.grcon_get_allocation_center(target_workspace); $$;

revoke all on function public.grcon_get_allocation_center(uuid) from public, anon;
grant execute on function public.grcon_get_allocation_center(uuid) to authenticated;

create or replace function public.grcon_set_allocation_center(
  target_workspace uuid,
  new_path text,
  new_sheet text,
  new_key_column text,
  new_comment_column text,
  new_last_row integer
)
returns table (
  file_path text,
  sheet_name text,
  key_column text,
  comment_column text,
  last_row integer,
  updated_at timestamptz,
  updated_by uuid
)
language sql
security invoker
set search_path = public, private, pg_temp
as $$ select * from private.grcon_set_allocation_center(target_workspace, new_path, new_sheet, new_key_column, new_comment_column, new_last_row); $$;

revoke all on function public.grcon_set_allocation_center(uuid, text, text, text, text, integer) from public, anon;
grant execute on function public.grcon_set_allocation_center(uuid, text, text, text, text, integer) to authenticated;

-- Remoção do cadastro. Sem ela, "Remover cadastro" apagaria só a cópia local e
-- a próxima leitura da área compartilhada devolveria o registro.
create or replace function private.grcon_clear_allocation_center(target_workspace uuid)
returns boolean
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  removidas integer;
begin
  if not private.grcon_has_role(target_workspace, array['owner']) then
    raise exception 'Somente o proprietário pode alterar a central de alocação.' using errcode = '42501';
  end if;

  delete from private.grcon_allocation_center where workspace_id = target_workspace;
  get diagnostics removidas = row_count;

  if removidas > 0 then
    insert into public.grcon_audit_events (workspace_id, actor_id, action, entity_type, entity_id, metadata)
    values (target_workspace, auth.uid(), 'allocation_center_cleared', 'allocation_center', target_workspace::text,
            jsonb_build_object('removidas', removidas));
  end if;

  return removidas > 0;
end;
$$;

create or replace function public.grcon_clear_allocation_center(target_workspace uuid)
returns boolean
language sql
security invoker
set search_path = public, private, pg_temp
as $$ select private.grcon_clear_allocation_center(target_workspace); $$;

revoke all on function public.grcon_clear_allocation_center(uuid) from public, anon;
grant execute on function public.grcon_clear_allocation_center(uuid) to authenticated;
