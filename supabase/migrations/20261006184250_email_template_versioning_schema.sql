
create table if not exists private.grcon_email_template_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.grcon_workspaces(id) on delete cascade,
  contract_id uuid references public.grcon_contracts(id) on delete restrict,
  scope text not null check(scope in ('global','contract')),
  version integer not null,
  configuration jsonb not null check(jsonb_typeof(configuration)='object'),
  active boolean not null default true,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  check((scope='global' and workspace_id is null and contract_id is null) or
        (scope='contract' and workspace_id is not null and contract_id is not null))
);
alter table private.grcon_email_template_versions enable row level security;
revoke all on private.grcon_email_template_versions from public,anon,authenticated;
create unique index if not exists grcon_email_template_active_global
  on private.grcon_email_template_versions(scope) where scope='global' and active;
create unique index if not exists grcon_email_template_active_contract
  on private.grcon_email_template_versions(contract_id) where scope='contract' and active;
create unique index if not exists grcon_email_template_version_global
  on private.grcon_email_template_versions(scope,version) where scope='global';
create unique index if not exists grcon_email_template_version_contract
  on private.grcon_email_template_versions(contract_id,version) where scope='contract';
