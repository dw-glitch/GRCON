-- Apenas o proprietário do workspace pode publicar a Consulta Geral compartilhada.
-- Demais membros continuam com importação local no navegador.
create or replace function private.grcon_sigem_query_begin(
  target_workspace uuid,
  source_file text,
  expected_count integer,
  source_metadata jsonb,
  expected_active uuid
)
returns uuid
language plpgsql
security definer
set search_path=private,public,pg_temp
as $$
declare upload_id uuid;
begin
  if auth.uid() is null or not private.grcon_has_role(target_workspace,array['owner']) then
    raise exception 'Somente o proprietário pode publicar a Consulta Geral compartilhada.' using errcode='42501';
  end if;
  if expected_count is null
     or expected_count not between 1 and 100000
     or length(btrim(coalesce(source_file,''))) not between 1 and 255
     or jsonb_typeof(source_metadata) is distinct from 'object'
     or octet_length(source_metadata::text)>65536 then
    raise exception 'Arquivo ou metadados inválidos.' using errcode='22023';
  end if;
  insert into private.grcon_sigem_query_snapshots(
    workspace_id,file_name,expected_count,metadata,expected_active,created_by
  )
  values(
    target_workspace,source_file,expected_count,source_metadata,expected_active,auth.uid()
  )
  returning id into upload_id;
  return upload_id;
end;
$$;

create or replace function private.grcon_sigem_query_chunk(
  target_workspace uuid,
  upload_id uuid,
  first_row integer,
  rows jsonb
)
returns integer
language plpgsql
security definer
set search_path=private,public,pg_temp
as $$
declare
  s private.grcon_sigem_query_snapshots;
  total integer;
begin
  if auth.uid() is null or not private.grcon_has_role(target_workspace,array['owner']) then
    raise exception 'Somente o proprietário pode publicar a Consulta Geral compartilhada.' using errcode='42501';
  end if;
  select * into s
  from private.grcon_sigem_query_snapshots
  where id=upload_id
    and workspace_id=target_workspace
    and status='pending'
    and created_by=auth.uid()
  for update;
  if not found then
    raise exception 'Envio indisponível.' using errcode='22023';
  end if;
  if jsonb_typeof(rows) is distinct from 'array' then
    raise exception 'Lote inválido.' using errcode='22023';
  end if;
  if first_row is null
     or first_row<1
     or jsonb_array_length(rows) not between 1 and 500
     or first_row+jsonb_array_length(rows)-1>s.expected_count
     or octet_length(rows::text)>4000000 then
    raise exception 'Lote ou contagem inválida.' using errcode='22023';
  end if;
  if exists(
    select 1
    from jsonb_array_elements(rows) r
    where jsonb_typeof(r) is distinct from 'object'
       or length(btrim(coalesce(r->>'document',''))) not between 1 and 255
       or length(btrim(coalesce(r->>'revision',''))) not between 1 and 16
       or length(coalesce(r->>'status',''))>1024
  ) then
    raise exception 'Documento, revisão ou status inválido.' using errcode='22023';
  end if;
  insert into private.grcon_sigem_query_rows(snapshot_id,row_number,payload)
  select upload_id,first_row+n::integer-1,r
  from jsonb_array_elements(rows) with ordinality as t(r,n)
  on conflict(snapshot_id,row_number) do update set payload=excluded.payload;
  select count(*) into total
  from private.grcon_sigem_query_rows
  where snapshot_id=upload_id;
  return total;
end;
$$;

create or replace function private.grcon_sigem_query_publish(
  target_workspace uuid,
  upload_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=private,public,pg_temp
as $$
declare
  s private.grcon_sigem_query_snapshots;
  active_id uuid;
  total integer;
begin
  if auth.uid() is null or not private.grcon_has_role(target_workspace,array['owner']) then
    raise exception 'Somente o proprietário pode publicar a Consulta Geral compartilhada.' using errcode='42501';
  end if;
  perform 1 from public.grcon_workspaces where id=target_workspace for update;
  select * into s
  from private.grcon_sigem_query_snapshots
  where id=upload_id
    and workspace_id=target_workspace
    and status='pending'
    and created_by=auth.uid()
  for update;
  if not found then
    raise exception 'Envio indisponível.' using errcode='22023';
  end if;
  select id into active_id
  from private.grcon_sigem_query_snapshots
  where workspace_id=target_workspace and status='active';
  if active_id is distinct from s.expected_active then
    raise exception 'Outro usuário publicou uma nova Consulta Geral. Recarregue antes de publicar novamente.' using errcode='40001';
  end if;
  select count(*) into total
  from private.grcon_sigem_query_rows
  where snapshot_id=upload_id;
  if total<>s.expected_count then
    raise exception 'Carga incompleta: % de % registros.',total,s.expected_count using errcode='22023';
  end if;
  if not exists(
    select 1
    from private.grcon_sigem_query_rows
    where snapshot_id=upload_id
      and length(btrim(coalesce(payload->>'status','')))>0
  ) then
    raise exception 'Consulta Geral sem status.' using errcode='22023';
  end if;
  update private.grcon_sigem_query_snapshots
  set status='archived'
  where workspace_id=target_workspace and status='active';
  update private.grcon_sigem_query_snapshots
  set status='active',record_count=total,published_at=now()
  where id=upload_id;
  insert into public.grcon_audit_events(
    workspace_id,actor_id,action,entity_type,entity_id,metadata
  )
  values(
    target_workspace,auth.uid(),'sigem_query_published','sigem_query',upload_id::text,
    jsonb_build_object('arquivo',s.file_name,'registros',total,'checksum',s.metadata->>'checksum')
  );
  delete from private.grcon_sigem_query_snapshots
  where workspace_id=target_workspace
    and (
      (status='archived' and published_at<now()-interval '7 days')
      or (status='pending' and created_at<now()-interval '1 day')
    );
  return upload_id;
end;
$$;
