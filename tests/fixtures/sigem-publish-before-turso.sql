CREATE OR REPLACE FUNCTION private.grcon_sigem_query_publish(target_workspace uuid, upload_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
declare
  s private.grcon_sigem_query_snapshots;
  active_id uuid;
  total integer;
  next_version integer;
  new_comparison uuid;
  comparison_counts jsonb;
  alert_count integer;
begin
  if auth.uid() is null or not private.grcon_has_role(target_workspace,array['owner']) then
    raise exception 'Somente o proprietário pode publicar a Consulta Geral compartilhada.' using errcode='42501';
  end if;
  perform 1 from public.grcon_workspaces where id=target_workspace for update;
  select * into s from private.grcon_sigem_query_snapshots
  where id=upload_id and workspace_id=target_workspace and status='pending' and created_by=auth.uid()
  for update;
  if not found then raise exception 'Envio indisponível.' using errcode='22023'; end if;

  select id into active_id from private.grcon_sigem_query_snapshots
  where workspace_id=target_workspace and status='active';
  if active_id is distinct from s.expected_active then
    raise exception 'Outro usuário publicou uma nova Consulta Geral. Recarregue antes de publicar novamente.' using errcode='40001';
  end if;

  select count(*) into total from private.grcon_sigem_query_rows where snapshot_id=upload_id;
  if total<>s.expected_count then
    raise exception 'Carga incompleta: % de % registros.',total,s.expected_count using errcode='22023';
  end if;
  if not exists(select 1 from private.grcon_sigem_query_rows where snapshot_id=upload_id and length(btrim(status_original))>0) then
    raise exception 'Consulta Geral sem status.' using errcode='22023';
  end if;

  if exists (
    select 1 from private.grcon_sigem_query_rows r where r.snapshot_id=upload_id
    group by r.document_key,r.revision_key having count(distinct r.status_normalized)>1
  ) then raise exception 'Status conflitantes para o mesmo documento e revisão.' using errcode='22023'; end if;

  select coalesce(max(version),0)+1 into next_version
  from private.grcon_sigem_query_snapshots
  where workspace_id=target_workspace and status in ('active','archived');

  update private.grcon_sigem_query_snapshots
  set status='archived'
  where workspace_id=target_workspace and status='active';

  update private.grcon_sigem_query_snapshots
  set status='active',record_count=total,published_at=now(),version=next_version,
      fingerprint=coalesce(metadata->>'checksum',''),previous_snapshot_id=active_id
  where id=upload_id;

  if active_id is not null then
    new_comparison=private.grcon_run_sigem_comparison(target_workspace,active_id,upload_id,true);
    select counts into comparison_counts from private.grcon_sigem_comparisons where id=new_comparison;
    select count(*) into alert_count from public.grcon_notifications where comparison_id=new_comparison;
    update private.grcon_sigem_query_snapshots set comparison_id=new_comparison where id=upload_id;
  else
    comparison_counts='{}'::jsonb;
    alert_count=0;
  end if;

  insert into public.grcon_audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  values(
    target_workspace,auth.uid(),'sigem_query_published','sigem_query',upload_id::text,
    jsonb_build_object(
      'arquivo',s.file_name,'registros',total,'checksum',s.metadata->>'checksum',
      'version',next_version,'previous_snapshot',active_id,'comparison',new_comparison,
      'changes',coalesce(comparison_counts->'changes','0'::jsonb),'alerts',coalesce(alert_count,0)
    )
  );

  delete from private.grcon_sigem_query_snapshots
  where workspace_id=target_workspace and status='pending' and created_at<now()-interval '1 day';

  return upload_id;
end $function$

