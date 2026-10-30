-- GRCON: failures after #344/#345: SQLSTATE 42702 and monitor statement_timeout.
-- Non-destructive: retain snapshots, full rows, projections, permissions, audits.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION private.grcon_storage_admin(target_workspace uuid, operation text, input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c uuid;s private.grcon_sigem_query_snapshots;result jsonb;n bigint;
begin
 perform private.grcon_require_master_owner();
 select m.contract_id into c from public.grcon_memberships m join public.grcon_contracts ct on ct.id=m.contract_id and ct.workspace_id=m.workspace_id and ct.active where m.workspace_id=target_workspace and m.user_id=auth.uid() and m.active;
 if c is null then raise exception 'Sem acesso ao contrato.' using errcode='42501';end if;
 if operation='bases' then
  select coalesce(jsonb_agg(jsonb_build_object('id',bs.id,'version',bs.version,'fileName',bs.file_name,'records',bs.record_count,'date',coalesce(bs.metadata->>'referenceDate',bs.published_at::text),'status',bs.status,'deletedAt',bs.deleted_at,'deletionPending',r.snapshot_id is not null and not r.finished,'storage',e.storage_kind) order by bs.version desc),'[]') into result
  from private.grcon_sigem_query_snapshots bs left join private.grcon_sigem_external_snapshots e on e.snapshot_id=bs.id left join private.grcon_sigem_retirements r on r.snapshot_id=bs.id
  where bs.workspace_id=target_workspace and bs.contract_id=c and bs.status in('active','archived') and not coalesce(r.finished,false);
  return jsonb_build_object('bases',result);
 elsif operation in('document-scope','document-finish') then
  if operation='document-finish' then
   delete from private.grcon_vault_emission_links l using private.grcon_document_files f where l.file_id=f.id and f.workspace_id=target_workspace;
   delete from private.grcon_document_files where workspace_id=target_workspace;
   get diagnostics n=row_count;
   insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata) values(target_workspace,c,auth.uid(),'document_storage_retired','storage',target_workspace::text,jsonb_build_object('catalogRowsRemoved',n));
  end if;
  return jsonb_build_object('prefix','workspaces/'||target_workspace::text||'/documents/','records',(select count(*) from private.grcon_document_files where workspace_id=target_workspace),'catalogBytes',(select coalesce(sum(size_bytes),0) from private.grcon_document_files where workspace_id=target_workspace),'multipart',(select coalesce(jsonb_agg(jsonb_build_object('key',object_key,'id',multipart_id)),'[]') from private.grcon_document_files where workspace_id=target_workspace and multipart_id is not null));
 elsif operation in('delete-base-begin','delete-base-finish','base-source') then
  perform 1 from public.grcon_workspaces where id=target_workspace for update;
  select * into s from private.grcon_sigem_query_snapshots where id=(input->>'snapshot')::uuid and workspace_id=target_workspace and contract_id=c for update;
  if not found then raise exception 'Base indisponível.' using errcode='22023';end if;
  if operation='base-source' then return to_jsonb(s);end if;
  if s.status<>'archived' then raise exception 'A base ativa não pode ser excluída.' using errcode='22023';end if;
  if operation='delete-base-begin' then
   update private.grcon_sigem_query_snapshots set deleted_at=coalesce(deleted_at,now()),deleted_by=auth.uid() where id=s.id;
   insert into private.grcon_sigem_retirements(snapshot_id,requested_by) values(s.id,auth.uid()) on conflict do nothing;
  else
   if not exists(select 1 from private.grcon_sigem_retirements where snapshot_id=s.id) then raise exception 'Exclusão não iniciada.';end if;
   delete from private.grcon_sigem_query_rows where snapshot_id=s.id;
   delete from private.grcon_sigem_projection_map where snapshot_id=s.id;
   delete from private.grcon_sigem_projection_contents d where not exists(select 1 from private.grcon_sigem_projection_map m where m.content_id=d.id);
   update private.grcon_sigem_retirements set finished=true where snapshot_id=s.id;
   insert into public.grcon_audit_events(workspace_id,contract_id,actor_id,action,entity_type,entity_id,metadata) values(target_workspace,c,auth.uid(),'sigem_base_permanently_deleted','sigem_query',s.id::text,jsonb_build_object('version',s.version,'records',s.record_count));
  end if;
  return jsonb_build_object('snapshot',to_jsonb(s),'kind',(select storage_kind from private.grcon_sigem_external_snapshots where snapshot_id=s.id));
 end if;
 raise exception 'Operação inválida.' using errcode='22023';
end $function$
;
CREATE INDEX IF NOT EXISTS grcon_sigem_projection_document_lookup_idx
 ON private.grcon_sigem_projection_contents
 (workspace_id,contract_id,((content->>'document_key')));

CREATE OR REPLACE FUNCTION private.grcon_monitored_documents_list(target_workspace uuid)
RETURNS TABLE(id uuid, document_key text, document_code text, description text,
 note text, priority text, active boolean, current_status text, last_status text,
 last_change timestamptz, last_snapshot timestamptz, title text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $monitor$
BEGIN
 IF NOT private.grcon_is_member(target_workspace) THEN
  RAISE EXCEPTION 'Sem acesso ao contrato.' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 SELECT md.id,md.document_key,md.document_code,md.description,md.note,
        md.priority,md.active,cr.status_original,lc.previous_status,
        lc.compared_at,cs.published_at,cr.title
 FROM private.grcon_monitored_documents md
 LEFT JOIN LATERAL (
   SELECT snap.id,snap.published_at
   FROM private.grcon_sigem_query_snapshots snap
   WHERE snap.workspace_id=md.workspace_id AND snap.contract_id=md.contract_id
     AND snap.status='active' AND snap.deleted_at IS NULL
   ORDER BY snap.published_at DESC LIMIT 1
 ) cs ON TRUE
 LEFT JOIN LATERAL (
   SELECT rows.status_original,rows.title
   FROM private.grcon_sigem_operational_rows rows
   WHERE rows.snapshot_id=cs.id AND rows.document_key=md.document_key
   ORDER BY rows.row_number DESC LIMIT 1
 ) cr ON TRUE
 LEFT JOIN LATERAL (
   SELECT changes.previous_status,cmp.compared_at
   FROM private.grcon_sigem_status_changes changes
   JOIN private.grcon_sigem_comparisons cmp ON cmp.id=changes.comparison_id
   WHERE changes.workspace_id=md.workspace_id
     AND changes.contract_id=md.contract_id
     AND changes.document_key=md.document_key
   ORDER BY cmp.compared_at DESC,changes.created_at DESC
   LIMIT 1
 ) lc ON TRUE
 WHERE md.workspace_id=target_workspace
 ORDER BY md.active DESC,
   CASE md.priority WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 ELSE 2 END,
   md.document_code;
END $monitor$;
COMMIT;
