-- GRCON / Consulta Geral: resumable, fully verified Supabase raw-row release.
-- The former grcon_sigem_release_service attempted to project and delete 25k+
-- rows in one PostgREST request, exceeding the provider statement timeout.
-- Do not switch readers or delete any original row before a complete, field-level
-- comparison of the source and the operational projection succeeds.
CREATE OR REPLACE FUNCTION private.grcon_sigem_release_step(
 target_workspace uuid, actor_id uuid, target_snapshot uuid, proof jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $release_step$
DECLARE
 s private.grcon_sigem_query_snapshots;
 external_record private.grcon_sigem_external_snapshots;
 batch jsonb;
 mapped_count integer;
 last_row integer;
 removed integer:=0;
 remaining integer;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role'
    OR NOT EXISTS(
      SELECT 1 FROM private.grcon_master_owner owner_identity
      JOIN public.grcon_memberships m ON m.user_id=owner_identity.user_id
         AND m.active AND m.role='owner'
      JOIN public.grcon_contracts ct ON ct.id=m.contract_id
         AND ct.workspace_id=m.workspace_id AND ct.active
      WHERE owner_identity.singleton AND owner_identity.user_id=actor_id
        AND m.workspace_id=target_workspace
    ) THEN
    RAISE EXCEPTION 'SIGEM_RELEASE_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.grcon_workspaces w WHERE w.id=target_workspace FOR UPDATE;
 SELECT q.* INTO STRICT s
 FROM private.grcon_sigem_query_snapshots q
 JOIN public.grcon_memberships m
   ON m.workspace_id=q.workspace_id AND m.contract_id=q.contract_id
   AND m.user_id=actor_id AND m.active
 WHERE q.id=target_snapshot AND q.workspace_id=target_workspace
   AND q.deleted_at IS NULL FOR UPDATE OF q;
 IF s.status NOT IN ('active','archived')
    OR proof->>'id' IS DISTINCT FROM s.id::text
    OR proof->'fullAudit' IS DISTINCT FROM 'true'::jsonb
    OR proof->>'count' IS DISTINCT FROM s.record_count::text
    OR proof->>'validatedRecords' IS DISTINCT FROM s.record_count::text
    OR coalesce(proof->>'checksum','') !~ '^[a-f0-9]{64}$'
    OR coalesce(proof->>'manifestHash','') !~ '^[a-f0-9]{64}$'
    THEN RAISE EXCEPTION 'SIGEM_RELEASE_AUDIT_REQUIRED'; END IF;
 SELECT * INTO external_record
 FROM private.grcon_sigem_external_snapshots e WHERE e.snapshot_id=s.id FOR UPDATE;
 IF FOUND THEN
   IF external_record.storage_kind IS DISTINCT FROM 'legacy'
      OR NOT (external_record.ready AND external_record.projected)
      OR external_record.receipt IS DISTINCT FROM proof THEN
       RAISE EXCEPTION 'SIGEM_RELEASE_RECEIPT_CONFLICT';
   END IF;
   -- The view already reads exclusively from the complete verified projection.
   -- Delete old payloads only now, in short retryable transactions.
   WITH batch_to_delete AS (
     SELECT r.row_number FROM private.grcon_sigem_query_rows r
     WHERE r.snapshot_id=s.id ORDER BY r.row_number LIMIT 1000
   )
   DELETE FROM private.grcon_sigem_query_rows old
   USING batch_to_delete d
   WHERE old.snapshot_id=s.id AND old.row_number=d.row_number;
   GET DIAGNOSTICS removed=ROW_COUNT;
   SELECT count(*) INTO remaining FROM private.grcon_sigem_query_rows r WHERE r.snapshot_id=s.id;
   IF remaining=0 THEN
     INSERT INTO public.grcon_audit_events(workspace_id,contract_id,actor_id,
       action,entity_type,entity_id,metadata)
     VALUES(target_workspace,s.contract_id,actor_id,'sigem_payload_moved_to_turso',
       'sigem_query',s.id::text,jsonb_build_object(
       'checksum',proof->>'checksum','recordCount',s.record_count,
       'method','resumable_verified_projection'))
     ON CONFLICT DO NOTHING;
   END IF;
   RETURN jsonb_build_object('released',remaining=0,'phase',
     CASE WHEN remaining=0 THEN 'complete' ELSE 'cleaning' END,
     'processed',s.record_count-remaining,'expected',s.record_count,
     'remaining',remaining,'removed',removed);
 END IF;
 -- A partial projection is inert; old rows remain the only data source.
 SELECT count(*)::integer,coalesce(max(m.row_number),0)
   INTO mapped_count,last_row
 FROM private.grcon_sigem_projection_map m WHERE m.snapshot_id=s.id;
 IF mapped_count<>last_row OR mapped_count>s.record_count THEN
   RAISE EXCEPTION 'SIGEM_RELEASE_PROJECTION_GAP';
 END IF;
 IF mapped_count<s.record_count THEN
   SELECT jsonb_agg(jsonb_build_object(
     'document',r.payload->>'document',
     'revision',r.payload->>'revision',
     'status',r.status_original,'title',r.title,
     'discipline',r.discipline) ORDER BY r.row_number)
   INTO batch
   FROM (
     SELECT * FROM private.grcon_sigem_query_rows original
     WHERE original.snapshot_id=s.id AND original.row_number>last_row
     ORDER BY original.row_number LIMIT 500
   ) r;
   IF batch IS NULL THEN
     RAISE EXCEPTION 'SIGEM_RELEASE_SOURCE_INCOMPLETE';
   END IF;
   PERFORM private.grcon_sigem_project_rows(s.id,last_row+1,batch);
   mapped_count:=last_row+jsonb_array_length(batch);
 END IF;
 IF mapped_count<s.record_count THEN
   RETURN jsonb_build_object('released',false,'phase','projecting',
     'processed',mapped_count,'expected',s.record_count,
     'remaining',s.record_count-mapped_count,'removed',0);
 END IF;
 -- Atomically verify the complete projection and only then switch the view.
 IF (SELECT count(*) FROM private.grcon_sigem_query_rows r
     WHERE r.snapshot_id=s.id)<>s.record_count
    OR (SELECT count(*) FROM private.grcon_sigem_projection_map m
       WHERE m.snapshot_id=s.id)<>s.record_count
    OR EXISTS (
       SELECT 1 FROM private.grcon_sigem_query_rows r
       LEFT JOIN private.grcon_sigem_projection_map m
         ON m.snapshot_id=r.snapshot_id AND m.row_number=r.row_number
       LEFT JOIN private.grcon_sigem_projection_contents d
         ON d.id=m.content_id
       WHERE r.snapshot_id=s.id AND (
         r.document_key IS DISTINCT FROM d.content->>'document_key'
         OR r.revision_key IS DISTINCT FROM d.content->>'revision_key'
         OR r.status_original IS DISTINCT FROM d.content->>'status_original'
         OR r.status_normalized IS DISTINCT FROM d.content->>'status_normalized'
         OR r.title IS DISTINCT FROM d.content->>'title'
         OR r.discipline IS DISTINCT FROM d.content->>'discipline'
         OR r.payload->>'document' IS DISTINCT FROM d.content->'payload'->>'document'
         OR r.payload->>'revision' IS DISTINCT FROM d.content->'payload'->>'revision'
       )
    ) THEN RAISE EXCEPTION 'SIGEM_RELEASE_PROJECTION_MISMATCH'; END IF;
 INSERT INTO private.grcon_sigem_external_snapshots(
   snapshot_id,storage_kind,ready,projected,receipt)
 VALUES(s.id,'legacy',true,true,proof);
 -- Do not erase in this transaction: publication and cleanup are distinct.
 RETURN jsonb_build_object('released',false,'phase','cleaning',
   'processed',0,'expected',s.record_count,'remaining',s.record_count,'removed',0);
END $release_step$;

REVOKE ALL ON FUNCTION private.grcon_sigem_release_step(uuid,uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.grcon_sigem_release_step(
 target_workspace uuid, actor_id uuid, target_snapshot uuid, proof jsonb)
RETURNS jsonb LANGUAGE sql SET search_path TO ''
AS $public_release$ SELECT private.grcon_sigem_release_step(
 target_workspace,actor_id,target_snapshot,proof) $public_release$;
REVOKE ALL ON FUNCTION public.grcon_sigem_release_step(uuid,uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.grcon_sigem_release_step(uuid,uuid,uuid,jsonb)
  TO service_role;
