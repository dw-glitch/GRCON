-- The 40 historical snapshots were backfilled before enabling this RPC.
-- New published versions are calculated once on first history access.
-- No globally sorted 1M-row join and no modification of immutable source metadata.
CREATE OR REPLACE FUNCTION private.grcon_sigem_query_history(target_workspace uuid)
RETURNS TABLE (
 snapshot_id uuid, file_name text, record_count integer,
 unique_document_count bigint, et_count bigint, n1710_count bigint,
 published_at timestamptz, created_at timestamptz,
 status text, is_current boolean, created_by uuid,
 created_by_name text, created_by_email text, metadata jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $cached_history$
DECLARE missing_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT private.grcon_is_member(target_workspace) THEN
   RAISE EXCEPTION 'Sem acesso à área de trabalho.' USING ERRCODE='42501';
 END IF;
 -- One version at a time if a new snapshot is published or a cached summary
 -- has become stale; fail closed if any snapshot's operational rows are incomplete.
 FOR missing_id IN
   SELECT s.id FROM private.grcon_sigem_query_snapshots s
   WHERE s.workspace_id=target_workspace AND s.status IN ('active','archived')
     AND s.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM private.grcon_sigem_history_stats h
       WHERE h.snapshot_id=s.id AND h.source_count=s.record_count
         AND h.source_fingerprint IS NOT DISTINCT FROM s.fingerprint
     )
   ORDER BY s.version DESC
 LOOP
   PERFORM private.grcon_sigem_history_stats_refresh(missing_id);
 END LOOP;
 RETURN QUERY
 SELECT s.id,s.file_name,s.record_count,
        h.unique_document_count,h.et_count,h.n1710_count,
        s.published_at,s.created_at,s.status,(s.status='active'),
        s.created_by,p.display_name,p.email,s.metadata
 FROM private.grcon_sigem_query_snapshots s
 JOIN private.grcon_sigem_history_stats h
   ON h.snapshot_id=s.id AND h.source_count=s.record_count
   AND h.source_fingerprint IS NOT DISTINCT FROM s.fingerprint
 LEFT JOIN public.grcon_profiles p ON p.id=s.created_by
 WHERE s.workspace_id=target_workspace AND s.status IN ('active','archived')
   AND s.deleted_at IS NULL
 ORDER BY (s.status='active') DESC,
   coalesce(s.published_at,s.created_at) DESC,s.id DESC;
END $cached_history$;
