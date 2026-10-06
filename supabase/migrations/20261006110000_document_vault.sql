-- GRCON Document Vault + unified emission metadata
-- Generated for the existing GRCON Supabase project. Apply only to the GRCON project
-- (the connected Supabase project in this ChatGPT session is a different project).

create table if not exists public.grcon_document_objects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
  object_key text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check (size_bytes >= 0),
  mime_type text not null default 'application/octet-stream',
  original_file_name text not null,
  storage_provider text not null default 'cloudflare-r2' check (storage_provider = 'cloudflare-r2'),
  storage_bucket text not null default 'grcon-documents',
  state text not null default 'pending' check (state in ('pending','available','soft_deleted','orphaned')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, object_key),
  unique (workspace_id, sha256, size_bytes)
);

create index if not exists grcon_document_objects_workspace_state_idx
  on public.grcon_document_objects (workspace_id, state, created_at desc);
create index if not exists grcon_document_objects_workspace_sha_idx
  on public.grcon_document_objects (workspace_id, sha256);

create table if not exists public.grcon_vault_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
  object_id uuid not null references public.grcon_document_objects(id) on delete restrict,
  document_code text,
  document_code_normalized text,
  revision text,
  revision_normalized text,
  identification_state text not null default 'identified' check (identification_state in ('identified','unidentified','conflict')),
  source_kind text not null default 'upload' check (source_kind in ('upload','folder-import','grdt')),
  original_relative_path text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, object_id, document_code_normalized, revision_normalized)
);

create index if not exists grcon_vault_documents_workspace_document_revision_idx
  on public.grcon_vault_documents (workspace_id, document_code_normalized, revision_normalized)
  where deleted_at is null;
create index if not exists grcon_vault_documents_workspace_created_idx
  on public.grcon_vault_documents (workspace_id, created_at desc)
  where deleted_at is null;

create table if not exists public.grcon_document_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
  vault_document_id uuid not null references public.grcon_vault_documents(id) on delete restrict,
  history_id uuid references public.grcon_history(id) on delete set null,
  client_history_id text,
  egrdt_number text,
  link_kind text not null default 'history' check (link_kind in ('history','grdt','manual')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists grcon_document_links_workspace_history_idx
  on public.grcon_document_links (workspace_id, history_id);
create index if not exists grcon_document_links_workspace_vault_idx
  on public.grcon_document_links (workspace_id, vault_document_id);

create table if not exists public.grcon_import_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
  state text not null default 'created' check (state in ('created','analyzing','uploading','paused','completed','completed_with_failures','cancelled')),
  source_kind text not null default 'folder',
  total_files integer not null default 0 check (total_files >= 0),
  analyzed_files integer not null default 0 check (analyzed_files >= 0),
  uploaded_files integer not null default 0 check (uploaded_files >= 0),
  failed_files integer not null default 0 check (failed_files >= 0),
  total_bytes bigint not null default 0 check (total_bytes >= 0),
  uploaded_bytes bigint not null default 0 check (uploaded_bytes >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grcon_import_sessions_workspace_created_idx
  on public.grcon_import_sessions (workspace_id, created_at desc);

create table if not exists public.grcon_import_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.grcon_import_sessions(id) on delete cascade,
  workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
  local_fingerprint text not null,
  original_file_name text not null,
  original_relative_path text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  state text not null default 'queued' check (state in ('queued','hashing','duplicate','conflict','unidentified','uploading','uploaded','failed','cancelled')),
  object_id uuid references public.grcon_document_objects(id) on delete set null,
  vault_document_id uuid references public.grcon_vault_documents(id) on delete set null,
  error_message text,
  retry_count integer not null default 0 check (retry_count >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, local_fingerprint)
);

create index if not exists grcon_import_items_session_state_idx
  on public.grcon_import_items (session_id, state, created_at);
create index if not exists grcon_import_items_workspace_sha_idx
  on public.grcon_import_items (workspace_id, sha256)
  where sha256 is not null;

create table if not exists public.grcon_document_audit (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists grcon_document_audit_workspace_created_idx
  on public.grcon_document_audit (workspace_id, created_at desc);

alter table public.grcon_document_objects enable row level security;
alter table public.grcon_vault_documents enable row level security;
alter table public.grcon_document_links enable row level security;
alter table public.grcon_import_sessions enable row level security;
alter table public.grcon_import_items enable row level security;
alter table public.grcon_document_audit enable row level security;

revoke all on table public.grcon_document_objects from anon, authenticated;
revoke all on table public.grcon_vault_documents from anon, authenticated;
revoke all on table public.grcon_document_links from anon, authenticated;
revoke all on table public.grcon_import_sessions from anon, authenticated;
revoke all on table public.grcon_import_items from anon, authenticated;
revoke all on table public.grcon_document_audit from anon, authenticated;

grant select, insert, update on table public.grcon_document_objects to authenticated;
grant select, insert, update on table public.grcon_vault_documents to authenticated;
grant select, insert, update on table public.grcon_document_links to authenticated;
grant select, insert, update on table public.grcon_import_sessions to authenticated;
grant select, insert, update on table public.grcon_import_items to authenticated;
grant select, insert on table public.grcon_document_audit to authenticated;
grant usage, select on sequence public.grcon_document_audit_id_seq to authenticated;

drop policy if exists grcon_document_objects_select on public.grcon_document_objects;
create policy grcon_document_objects_select on public.grcon_document_objects
for select to authenticated
using (private.grcon_has_role(workspace_id, array['owner','admin','operator','viewer']));

drop policy if exists grcon_document_objects_insert on public.grcon_document_objects;
create policy grcon_document_objects_insert on public.grcon_document_objects
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.grcon_has_role(workspace_id, array['owner','admin','operator'])
);

drop policy if exists grcon_document_objects_update on public.grcon_document_objects;
create policy grcon_document_objects_update on public.grcon_document_objects
for update to authenticated
using (
  private.grcon_has_role(workspace_id, array['owner','admin'])
  or (created_by = (select auth.uid()) and state = 'pending' and private.grcon_has_role(workspace_id, array['operator']))
)
with check (
  private.grcon_has_role(workspace_id, array['owner','admin'])
  or (created_by = (select auth.uid()) and private.grcon_has_role(workspace_id, array['operator']))
);

drop policy if exists grcon_vault_documents_select on public.grcon_vault_documents;
create policy grcon_vault_documents_select on public.grcon_vault_documents
for select to authenticated
using (private.grcon_has_role(workspace_id, array['owner','admin','operator','viewer']));

drop policy if exists grcon_vault_documents_insert on public.grcon_vault_documents;
create policy grcon_vault_documents_insert on public.grcon_vault_documents
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.grcon_has_role(workspace_id, array['owner','admin','operator'])
);

drop policy if exists grcon_vault_documents_update on public.grcon_vault_documents;
create policy grcon_vault_documents_update on public.grcon_vault_documents
for update to authenticated
using (
  private.grcon_has_role(workspace_id, array['owner','admin'])
  or created_by = (select auth.uid())
)
with check (
  private.grcon_has_role(workspace_id, array['owner','admin'])
  or created_by = (select auth.uid())
);

drop policy if exists grcon_document_links_select on public.grcon_document_links;
create policy grcon_document_links_select on public.grcon_document_links
for select to authenticated
using (private.grcon_has_role(workspace_id, array['owner','admin','operator','viewer']));

drop policy if exists grcon_document_links_insert on public.grcon_document_links;
create policy grcon_document_links_insert on public.grcon_document_links
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.grcon_has_role(workspace_id, array['owner','admin','operator'])
);

drop policy if exists grcon_document_links_update on public.grcon_document_links;
create policy grcon_document_links_update on public.grcon_document_links
for update to authenticated
using (private.grcon_has_role(workspace_id, array['owner','admin']))
with check (private.grcon_has_role(workspace_id, array['owner','admin']));

drop policy if exists grcon_import_sessions_select on public.grcon_import_sessions;
create policy grcon_import_sessions_select on public.grcon_import_sessions
for select to authenticated
using (private.grcon_has_role(workspace_id, array['owner','admin','operator','viewer']));

drop policy if exists grcon_import_sessions_insert on public.grcon_import_sessions;
create policy grcon_import_sessions_insert on public.grcon_import_sessions
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.grcon_has_role(workspace_id, array['owner','admin','operator'])
);

drop policy if exists grcon_import_sessions_update on public.grcon_import_sessions;
create policy grcon_import_sessions_update on public.grcon_import_sessions
for update to authenticated
using (
  private.grcon_has_role(workspace_id, array['owner','admin'])
  or created_by = (select auth.uid())
)
with check (
  private.grcon_has_role(workspace_id, array['owner','admin'])
  or created_by = (select auth.uid())
);

drop policy if exists grcon_import_items_select on public.grcon_import_items;
create policy grcon_import_items_select on public.grcon_import_items
for select to authenticated
using (private.grcon_has_role(workspace_id, array['owner','admin','operator','viewer']));

drop policy if exists grcon_import_items_insert on public.grcon_import_items;
create policy grcon_import_items_insert on public.grcon_import_items
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.grcon_has_role(workspace_id, array['owner','admin','operator'])
);

drop policy if exists grcon_import_items_update on public.grcon_import_items;
create policy grcon_import_items_update on public.grcon_import_items
for update to authenticated
using (
  private.grcon_has_role(workspace_id, array['owner','admin'])
  or created_by = (select auth.uid())
)
with check (
  private.grcon_has_role(workspace_id, array['owner','admin'])
  or created_by = (select auth.uid())
);

drop policy if exists grcon_document_audit_select on public.grcon_document_audit;
create policy grcon_document_audit_select on public.grcon_document_audit
for select to authenticated
using (private.grcon_has_role(workspace_id, array['owner','admin']));

drop policy if exists grcon_document_audit_insert on public.grcon_document_audit;
create policy grcon_document_audit_insert on public.grcon_document_audit
for insert to authenticated
with check (
  actor_id = (select auth.uid())
  and private.grcon_has_role(workspace_id, array['owner','admin','operator'])
);

comment on table public.grcon_document_objects is
  'Catálogo físico do Cofre GRCON; contém somente metadados de objetos privados armazenados no Cloudflare R2.';
comment on table public.grcon_vault_documents is
  'Identificação lógica documento/revisão vinculada a um objeto R2, permitindo conflitos explícitos sem sobrescrita.';
comment on table public.grcon_import_sessions is
  'Sessões recuperáveis de importação em lote do Cofre GRCON.';
