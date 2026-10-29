-- Consulta Geral: history counts must be computed one snapshot at a time.
-- A global GROUP BY with three COUNT(DISTINCT ...) spilled ~1M operational
-- rows to pgsql_tmp on the constrained Supabase instance (SQLSTATE 53100).
-- All fields, filters, status semantics and sort order match the previous RPC.
CREATE OR REPLACE FUNCTION private.grcon_sigem_query_history(target_workspace uuid)
RETURNS TABLE (
 snapshot_id uuid, file_name text, record_count integer,
 unique_document_count bigint, et_count bigint, n1710_count bigint,
 published_at timestamptz, created_at timestamptz,
 status text, is_current boolean, created_by uuid,
 created_by_name text, created_by_email text, metadata jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $history$
BEGIN
 IF auth.uid() IS NULL OR NOT private.grcon_is_member(target_workspace) THEN
   RAISE EXCEPTION 'Sem acesso à área de trabalho.' USING ERRCODE='42501';
 END IF;
 -- Per-version aggregation uses the snapshot_id indexes and caps the working
 -- set at one snapshot. No globally sorted 1M-row intermediate result.
 RETURN QUERY
 SELECT s.id,s.file_name,s.record_count,
        coalesce(counts.unique_count,0)::bigint,
        coalesce(counts.et,0)::bigint,
        coalesce(counts.n1710,0)::bigint,
        s.published_at,s.created_at,s.status,
        s.status='active',
        s.created_by,p.display_name,p.email,s.metadata
 FROM private.grcon_sigem_query_snapshots s
 LEFT JOIN public.grcon_profiles p ON p.id=s.created_by
 LEFT JOIN LATERAL (
   SELECT
    count(DISTINCT r.document_key) FILTER (WHERE coalesce(r.document_key,'')<>'') AS unique_count,
    count(DISTINCT (r.document_key,r.revision_key)) FILTER (
      WHERE coalesce(r.document_key,'')<>''
      AND coalesce(r.payload->>'document','') ~* '^[A-Z0-9]{3}[-_]RNEST[-_]'
    ) AS et,
    count(DISTINCT (r.document_key,r.revision_key)) FILTER (
      WHERE coalesce(r.document_key,'')<>''
      AND coalesce(r.payload->>'document','') ~* '^(?:[IAFLED]-)?[A-Z0-9]{2,3}-5290[.]00-22313-[A-Z0-9]{3}-C1O-[0-9]{3,4}$'
    ) AS n1710
   FROM private.grcon_sigem_operational_rows r
   WHERE r.snapshot_id=s.id
 ) counts ON TRUE
 WHERE s.workspace_id=target_workspace AND s.status IN ('active','archived')
   AND s.deleted_at IS NULL
 ORDER BY (s.status='active') DESC,
   coalesce(s.published_at,s.created_at) DESC,s.id DESC;
END
$history$;