-- Base compartilhada de Documentos Previstos. Aplicar no projeto Supabase do GRCON.
-- Presença do código em DOCUMENTO = alocado; nenhuma outra coluna participa.
-- Tabelas privadas, leitura por membro e publicação somente pelo proprietário.
-- A versão ativa só muda depois que todos os códigos foram recebidos.

create table if not exists private.grcon_planned_document_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
  file_name text not null,
  expected_count integer not null check (expected_count between 1 and 100000),
  document_count integer not null default 0 check (document_count between 0 and 100000),
  status text not null default 'pending' check (status in ('pending', 'active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid not null,
  published_at timestamptz
);
create unique index if not exists grcon_planned_document_one_active
  on private.grcon_planned_document_snapshots(workspace_id) where status = 'active';
create index if not exists grcon_planned_document_workspace_status
  on private.grcon_planned_document_snapshots(workspace_id, status, created_at);

create table if not exists private.grcon_planned_document_items (
  snapshot_id uuid not null references private.grcon_planned_document_snapshots(id) on delete cascade,
  document_key text not null check (length(document_key) between 7 and 255 and document_key ~ '[0-9]'),
  primary key (snapshot_id, document_key)
);
alter table private.grcon_planned_document_snapshots enable row level security;
alter table private.grcon_planned_document_items enable row level security;
revoke all on table private.grcon_planned_document_snapshots from public, anon, authenticated;
revoke all on table private.grcon_planned_document_items from public, anon, authenticated;

create or replace function private.grcon_planned_documents_current(target_workspace uuid)
returns table(snapshot_id uuid, file_name text, document_count integer, published_at timestamptz)
language plpgsql security definer set search_path = private, public, pg_temp as $$
begin
  if not private.grcon_is_member(target_workspace) then
    raise exception 'Sem acesso a esta área de trabalho.' using errcode = '42501';
  end if;
  return query select s.id, s.file_name, s.document_count, s.published_at
    from private.grcon_planned_document_snapshots s
    where s.workspace_id = target_workspace and s.status = 'active';
end;
$$;

create or replace function private.grcon_planned_documents_page(
  target_workspace uuid, target_snapshot uuid, after_key text default '', page_size integer default 2000
)
returns table(document_key text)
language plpgsql security definer set search_path = private, public, pg_temp as $$
begin
  if not private.grcon_is_member(target_workspace) then
    raise exception 'Sem acesso a esta área de trabalho.' using errcode = '42501';
  end if;
  if not exists (select 1 from private.grcon_planned_document_snapshots s
    where s.id = target_snapshot and s.workspace_id = target_workspace and s.status in ('active', 'archived')) then
    raise exception 'Versão de Documentos Previstos indisponível.' using errcode = '22023';
  end if;
  return query select i.document_key from private.grcon_planned_document_items i
    where i.snapshot_id = target_snapshot and i.document_key > coalesce(after_key, '')
    order by i.document_key limit least(greatest(coalesce(page_size, 2000), 1), 2000);
end;
$$;

create or replace function private.grcon_planned_documents_begin(
  target_workspace uuid, source_file text, expected_count integer
)
returns uuid
language plpgsql security definer set search_path = private, public, pg_temp as $$
declare upload_id uuid;
begin
  if not private.grcon_has_role(target_workspace, array['owner']) then
    raise exception 'Somente o proprietário pode publicar Documentos Previstos.' using errcode = '42501';
  end if;
  if expected_count is null or expected_count not between 1 and 100000
     or length(btrim(coalesce(source_file, ''))) not between 1 and 255 then
    raise exception 'Arquivo ou contagem inválida.' using errcode = '22023';
  end if;
  insert into private.grcon_planned_document_snapshots(workspace_id, file_name, expected_count, created_by)
    values (target_workspace, btrim(source_file), expected_count, auth.uid()) returning id into upload_id;
  return upload_id;
end;
$$;

create or replace function private.grcon_planned_documents_chunk(
  target_workspace uuid, upload_id uuid, document_keys text[]
)
returns integer
language plpgsql security definer set search_path = private, public, pg_temp as $$
declare s private.grcon_planned_document_snapshots; total integer;
begin
  if not private.grcon_has_role(target_workspace, array['owner']) then
    raise exception 'Somente o proprietário pode publicar Documentos Previstos.' using errcode = '42501';
  end if;
  select * into s from private.grcon_planned_document_snapshots
    where id = upload_id and workspace_id = target_workspace and status = 'pending'
      and created_by = auth.uid() for update;
  if not found then raise exception 'Envio inexistente ou já publicado.' using errcode = '22023'; end if;
  if document_keys is null or cardinality(document_keys) not between 1 and 1200
     or exists (select 1 from unnest(document_keys) k
       where k is null or length(k) not between 7 and 255 or k !~ '[0-9]') then
    raise exception 'Lote de códigos inválido.' using errcode = '22023';
  end if;
  insert into private.grcon_planned_document_items(snapshot_id, document_key)
    select upload_id, k from unnest(document_keys) k group by k on conflict do nothing;
  select count(*) into total from private.grcon_planned_document_items where snapshot_id = upload_id;
  if total > s.expected_count then raise exception 'A contagem supera a planilha informada.' using errcode = '22023'; end if;
  return total;
end;
$$;

create or replace function private.grcon_planned_documents_publish(target_workspace uuid, upload_id uuid)
returns uuid
language plpgsql security definer set search_path = private, public, pg_temp as $$
declare s private.grcon_planned_document_snapshots; total integer;
begin
  if not private.grcon_has_role(target_workspace, array['owner']) then
    raise exception 'Somente o proprietário pode publicar Documentos Previstos.' using errcode = '42501';
  end if;
  perform 1 from public.grcon_workspaces where id = target_workspace for update;
  select * into s from private.grcon_planned_document_snapshots
    where id = upload_id and workspace_id = target_workspace and status = 'pending'
      and created_by = auth.uid() for update;
  if not found then raise exception 'Envio inexistente ou já publicado.' using errcode = '22023'; end if;
  select count(*) into total from private.grcon_planned_document_items where snapshot_id = upload_id;
  if total <> s.expected_count then
    raise exception 'A base está incompleta: % de % códigos.', total, s.expected_count using errcode = '22023';
  end if;
  update private.grcon_planned_document_snapshots set status = 'archived'
    where workspace_id = target_workspace and status = 'active';
  update private.grcon_planned_document_snapshots
    set status = 'active', document_count = total, published_at = now() where id = upload_id;
  insert into public.grcon_audit_events(workspace_id, actor_id, action, entity_type, entity_id, metadata)
    values (target_workspace, auth.uid(), 'planned_documents_published', 'planned_documents', upload_id::text,
      jsonb_build_object('arquivo', s.file_name, 'documentos', total));
  -- Retém versões recentes para leituras já iniciadas e descarta envios abandonados.
  delete from private.grcon_planned_document_snapshots
    where workspace_id = target_workspace
      and ((status = 'archived' and published_at < now() - interval '7 days')
        or (status = 'pending' and created_at < now() - interval '1 day'));
  return upload_id;
end;
$$;

create or replace function public.grcon_planned_documents_current(target_workspace uuid)
returns table(snapshot_id uuid, file_name text, document_count integer, published_at timestamptz)
language sql security invoker set search_path = public, private, pg_temp
as $$ select * from private.grcon_planned_documents_current(target_workspace); $$;
create or replace function public.grcon_planned_documents_page(
  target_workspace uuid, target_snapshot uuid, after_key text default '', page_size integer default 2000
)
returns table(document_key text)
language sql security invoker set search_path = public, private, pg_temp
as $$ select * from private.grcon_planned_documents_page(target_workspace, target_snapshot, after_key, page_size); $$;
create or replace function public.grcon_planned_documents_begin(
  target_workspace uuid, source_file text, expected_count integer
)
returns uuid language sql security invoker set search_path = public, private, pg_temp
as $$ select private.grcon_planned_documents_begin(target_workspace, source_file, expected_count); $$;
create or replace function public.grcon_planned_documents_chunk(
  target_workspace uuid, upload_id uuid, document_keys text[]
)
returns integer language sql security invoker set search_path = public, private, pg_temp
as $$ select private.grcon_planned_documents_chunk(target_workspace, upload_id, document_keys); $$;
create or replace function public.grcon_planned_documents_publish(target_workspace uuid, upload_id uuid)
returns uuid language sql security invoker set search_path = public, private, pg_temp
as $$ select private.grcon_planned_documents_publish(target_workspace, upload_id); $$;

revoke all on function public.grcon_planned_documents_current(uuid) from public, anon;
revoke all on function public.grcon_planned_documents_page(uuid, uuid, text, integer) from public, anon;
revoke all on function public.grcon_planned_documents_begin(uuid, text, integer) from public, anon;
revoke all on function public.grcon_planned_documents_chunk(uuid, uuid, text[]) from public, anon;
revoke all on function public.grcon_planned_documents_publish(uuid, uuid) from public, anon;
grant execute on function public.grcon_planned_documents_current(uuid) to authenticated;
grant execute on function public.grcon_planned_documents_page(uuid, uuid, text, integer) to authenticated;
grant execute on function public.grcon_planned_documents_begin(uuid, text, integer) to authenticated;
grant execute on function public.grcon_planned_documents_chunk(uuid, uuid, text[]) to authenticated;
grant execute on function public.grcon_planned_documents_publish(uuid, uuid) to authenticated;
