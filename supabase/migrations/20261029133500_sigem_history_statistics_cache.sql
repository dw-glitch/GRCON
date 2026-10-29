-- Persist exact historical counts by immutable snapshot instead of
-- running three DISTINCT aggregates over 40 versions at every screen load.
-- The summary contains only counts and the snapshot identifier, not documents.
CREATE TABLE IF NOT EXISTS private.grcon_sigem_history_stats (
 snapshot_id uuid PRIMARY KEY REFERENCES private.grcon_sigem_query_snapshots(id) ON DELETE CASCADE,
 source_count integer NOT NULL CHECK(source_count>=0),
 source_fingerprint text,
 unique_document_count bigint NOT NULL,
 et_count bigint NOT NULL,
 n1710_count bigint NOT NULL,
 calculated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.grcon_sigem_history_stats FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE private.grcon_sigem_history_stats ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.grcon_sigem_history_stats_refresh(target_snapshot uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO '' SET work_mem TO '24MB'
AS $refresh$
DECLARE s private.grcon_sigem_query_snapshots;
        actual_count bigint; unique_count bigint; et_count bigint; standard_count bigint;
BEGIN
 SELECT * INTO STRICT s FROM private.grcon_sigem_query_snapshots
 WHERE id=target_snapshot AND status IN ('active','archived') AND deleted_at IS NULL;
 SELECT count(*),
        count(DISTINCT r.document_key) FILTER (WHERE coalesce(r.document_key,'')<>''),
        count(DISTINCT (r.document_key,r.revision_key)) FILTER (
          WHERE coalesce(r.document_key,'')<>'' AND
          coalesce(r.payload->>'document','') ~* '^[A-Z0-9]{3}[-_]RNEST[-_]'
        ),
        count(DISTINCT (r.document_key,r.revision_key)) FILTER (
          WHERE coalesce(r.document_key,'')<>'' AND
          coalesce(r.payload->>'document','') ~*
            '^(?:[IAFLED]-)?[A-Z0-9]{2,3}-5290[.]00-22313-[A-Z0-9]{3}-C1O-[0-9]{3,4}$'
        )
 INTO actual_count,unique_count,et_count,standard_count
 FROM private.grcon_sigem_operational_rows r WHERE r.snapshot_id=target_snapshot;
 IF actual_count<>s.record_count THEN
   RAISE EXCEPTION 'SIGEM_HISTORY_SOURCE_INCOMPLETE';
 END IF;
 INSERT INTO private.grcon_sigem_history_stats (
   snapshot_id,source_count,source_fingerprint,
   unique_document_count,et_count,n1710_count,calculated_at
 ) VALUES (
   s.id,s.record_count,s.fingerprint,unique_count,et_count,standard_count,now()
 ) ON CONFLICT (snapshot_id) DO UPDATE SET
   source_count=excluded.source_count,
   source_fingerprint=excluded.source_fingerprint,
   unique_document_count=excluded.unique_document_count,
   et_count=excluded.et_count,
   n1710_count=excluded.n1710_count,calculated_at=now();
END $refresh$;
REVOKE ALL ON FUNCTION private.grcon_sigem_history_stats_refresh(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
