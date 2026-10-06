
create or replace function private.grcon_document_key(value text)
returns text
language sql immutable
as $$
  select regexp_replace(
    regexp_replace(
      upper(btrim(replace(replace(coalesce(value,''),'–','-'),'—','-'))),
      '[[:space:]]*([_.-])[[:space:]]*','\1','g'
    ),
    '^NT-',''
  );
$$;

create or replace function private.grcon_revision_key(value text)
returns text
language sql immutable
as $$
  select regexp_replace(
    regexp_replace(upper(btrim(coalesce(value,''))),'^REV(ISAO|ISÃO)?[.]?[[:space:]]*','',''),
    '[[:space:]]+','','g'
  );
$$;

create or replace function private.grcon_status_key(value text)
returns text
language plpgsql immutable
as $$
declare s text;
begin
  s=translate(lower(btrim(coalesce(value,''))),
    'áàãâäéèêëíìîïóòõôöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc');
  s=regexp_replace(s,'[[:space:]]+',' ','g');
  if s in ('em analise','em workflow') then return 'EM_ANALISE'; end if;
  if s='' then return ''; end if;
  return upper(regexp_replace(s,'[^a-z0-9]+','_','g'));
end $$;

alter table private.grcon_sigem_query_snapshots
  add column if not exists version integer,
  add column if not exists fingerprint text,
  add column if not exists previous_snapshot_id uuid references private.grcon_sigem_query_snapshots(id) on delete set null,
  add column if not exists comparison_id uuid;

with ranked as (
  select id,
         row_number() over(partition by workspace_id order by coalesce(published_at,created_at),created_at,id)::integer as rn,
         lag(id) over(partition by workspace_id order by coalesce(published_at,created_at),created_at,id) as prev
  from private.grcon_sigem_query_snapshots
  where status in ('active','archived')
)
update private.grcon_sigem_query_snapshots s
set version=coalesce(s.version,r.rn),
    previous_snapshot_id=coalesce(s.previous_snapshot_id,r.prev),
    fingerprint=coalesce(s.fingerprint,s.metadata->>'checksum')
from ranked r where r.id=s.id;

alter table private.grcon_sigem_query_rows
  add column if not exists document_key text,
  add column if not exists revision_key text,
  add column if not exists status_original text,
  add column if not exists status_normalized text,
  add column if not exists title text,
  add column if not exists discipline text;

update private.grcon_sigem_query_rows r set
  document_key=private.grcon_document_key(r.payload->>'document'),
  revision_key=private.grcon_revision_key(r.payload->>'revision'),
  status_original=coalesce(r.payload->>'status',''),
  status_normalized=private.grcon_status_key(r.payload->>'status'),
  title=coalesce(r.payload->>'title',''),
  discipline=coalesce(r.payload->>'discipline','')
where r.document_key is null;

create index if not exists grcon_sigem_rows_identity_idx
  on private.grcon_sigem_query_rows(snapshot_id,document_key,revision_key);
create index if not exists grcon_sigem_snapshots_history_idx
  on private.grcon_sigem_query_snapshots(contract_id,published_at desc);

create table if not exists private.grcon_monitored_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
  contract_id uuid not null references public.grcon_contracts(id) on delete restrict,
  document_key text not null,
  document_code text not null,
  description text not null default '',
  note text not null default '',
  priority text not null default 'normal' check(priority in ('normal','alta','critica')),
  active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  unique(workspace_id,document_key)
);
alter table private.grcon_monitored_documents enable row level security;
revoke all on private.grcon_monitored_documents from public,anon,authenticated;
create index if not exists grcon_monitored_contract_active_idx
  on private.grcon_monitored_documents(contract_id,active,document_key);

create table if not exists private.grcon_sigem_comparisons (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
  contract_id uuid not null references public.grcon_contracts(id) on delete restrict,
  previous_snapshot_id uuid not null references private.grcon_sigem_query_snapshots(id) on delete restrict,
  current_snapshot_id uuid not null references private.grcon_sigem_query_snapshots(id) on delete restrict,
  automatic boolean not null default true,
  compared_by uuid not null,
  compared_at timestamptz not null default now(),
  counts jsonb not null default '{}'::jsonb,
  unique(workspace_id,previous_snapshot_id,current_snapshot_id,automatic)
);
alter table private.grcon_sigem_comparisons enable row level security;
revoke all on private.grcon_sigem_comparisons from public,anon,authenticated;
create index if not exists grcon_sigem_comparisons_contract_idx
  on private.grcon_sigem_comparisons(contract_id,compared_at desc);

create table if not exists private.grcon_sigem_status_changes (
  id uuid primary key default gen_random_uuid(),
  comparison_id uuid not null references private.grcon_sigem_comparisons(id) on delete cascade,
  workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
  contract_id uuid not null references public.grcon_contracts(id) on delete restrict,
  document_key text not null,
  document_code text not null,
  revision text not null default '',
  title text not null default '',
  discipline text not null default '',
  previous_status text,
  current_status text,
  previous_status_normalized text,
  current_status_normalized text,
  change_type text not null check(change_type in ('ENTROU_EM_ANALISE','SAIU_DE_ANALISE','MUDANCA_DE_STATUS','NOVO_NA_CONSULTA','REMOVIDO_DA_CONSULTA')),
  monitored boolean not null default false,
  created_at timestamptz not null default now(),
  unique(comparison_id,document_key,revision)
);
alter table private.grcon_sigem_status_changes enable row level security;
revoke all on private.grcon_sigem_status_changes from public,anon,authenticated;
create index if not exists grcon_sigem_changes_contract_created_idx
  on private.grcon_sigem_status_changes(contract_id,created_at desc);
create index if not exists grcon_sigem_changes_document_idx
  on private.grcon_sigem_status_changes(contract_id,document_key,created_at desc);

create table if not exists public.grcon_notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.grcon_workspaces(id) on delete cascade,
  contract_id uuid not null references public.grcon_contracts(id) on delete restrict,
  event_key text not null unique,
  kind text not null,
  severity text not null default 'info' check(severity in ('info','warning','high')),
  title text not null,
  message text not null,
  document_key text,
  document_code text,
  previous_status text,
  current_status text,
  comparison_id uuid,
  change_id uuid,
  link_target text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.grcon_notifications enable row level security;
revoke all on public.grcon_notifications from anon;
revoke insert,update,delete on public.grcon_notifications from authenticated;
grant select on public.grcon_notifications to authenticated;
drop policy if exists grcon_notifications_select on public.grcon_notifications;
create policy grcon_notifications_select on public.grcon_notifications
for select to authenticated using(private.grcon_is_member(workspace_id));
create index if not exists grcon_notifications_contract_created_idx
  on public.grcon_notifications(contract_id,created_at desc);

create table if not exists public.grcon_notification_reads (
  notification_id uuid not null references public.grcon_notifications(id) on delete cascade,
  user_id uuid not null,
  read_at timestamptz not null default now(),
  primary key(notification_id,user_id)
);
alter table public.grcon_notification_reads enable row level security;
revoke all on public.grcon_notification_reads from anon;
grant select,insert,update,delete on public.grcon_notification_reads to authenticated;
drop policy if exists grcon_notification_reads_select on public.grcon_notification_reads;
create policy grcon_notification_reads_select on public.grcon_notification_reads
for select to authenticated
using(user_id=auth.uid() and exists(
  select 1 from public.grcon_notifications n
  where n.id=notification_id and private.grcon_is_member(n.workspace_id)
));
drop policy if exists grcon_notification_reads_insert on public.grcon_notification_reads;
create policy grcon_notification_reads_insert on public.grcon_notification_reads
for insert to authenticated
with check(user_id=auth.uid() and exists(
  select 1 from public.grcon_notifications n
  where n.id=notification_id and private.grcon_is_member(n.workspace_id)
));
drop policy if exists grcon_notification_reads_update on public.grcon_notification_reads;
create policy grcon_notification_reads_update on public.grcon_notification_reads
for update to authenticated
using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists grcon_notification_reads_delete on public.grcon_notification_reads;
create policy grcon_notification_reads_delete on public.grcon_notification_reads
for delete to authenticated using(user_id=auth.uid());
