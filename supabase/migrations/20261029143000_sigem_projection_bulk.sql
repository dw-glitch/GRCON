CREATE OR REPLACE FUNCTION private.grcon_sigem_projection_content(r jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path='' AS $content$
 SELECT jsonb_build_object('payload',jsonb_build_object('document',r->>'document','revision',r->>'revision'),
 'document_key',private.grcon_document_key(r->>'document'),'revision_key',private.grcon_revision_key(r->>'revision'),
 'status_original',coalesce(r->>'status',''),'status_normalized',private.grcon_status_key(r->>'status'),
 'title',coalesce(r->>'title',''),'discipline',coalesce(r->>'discipline',''))
$content$;
REVOKE ALL ON FUNCTION private.grcon_sigem_projection_content(jsonb) FROM public,anon,authenticated,service_role;
-- Preserve the projection contract while processing a complete batch in sets.
CREATE OR REPLACE FUNCTION private.grcon_sigem_project_rows(target_snapshot uuid,first_row integer,rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $bulk$
DECLARE s private.grcon_sigem_query_snapshots; n integer; expected integer;
BEGIN
 SELECT * INTO STRICT s FROM private.grcon_sigem_query_snapshots WHERE id=target_snapshot FOR UPDATE;
 IF first_row IS NULL OR first_row<1 OR jsonb_typeof(rows) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'SIGEM_PROJECTION_INPUT_INVALID';
 END IF;
 expected:=jsonb_array_length(rows);
 IF expected NOT BETWEEN 1 AND 500 OR first_row+expected-1>s.expected_count THEN
  RAISE EXCEPTION 'SIGEM_PROJECTION_INPUT_INVALID';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE
  jsonb_typeof(r) IS DISTINCT FROM 'object' OR length(btrim(coalesce(r->>'document',''))) NOT BETWEEN 1 AND 255
  OR length(btrim(coalesce(r->>'revision',''))) NOT BETWEEN 1 AND 16 OR length(coalesce(r->>'status',''))>1024
  OR length(coalesce(r->>'title',''))>10000 OR length(coalesce(r->>'discipline',''))>1024) THEN
  RAISE EXCEPTION 'SIGEM_PROJECTION_ROW_INVALID';
 END IF;
 WITH content AS (
  SELECT private.grcon_sigem_projection_content(r) AS value FROM jsonb_array_elements(rows) r
 )
 INSERT INTO private.grcon_sigem_projection_contents(workspace_id,contract_id,digest,content)
 SELECT DISTINCT s.workspace_id,s.contract_id,sha256(convert_to(value::text,'UTF8')),value FROM content
 ON CONFLICT DO NOTHING;
 WITH normalized AS (
  SELECT first_row+ordinality::integer-1 AS rn,private.grcon_sigem_projection_content(value) AS content
  FROM jsonb_array_elements(rows) WITH ORDINALITY
 )
 INSERT INTO private.grcon_sigem_projection_map(snapshot_id,row_number,content_id)
 SELECT s.id,rn,d.id FROM normalized r
 JOIN private.grcon_sigem_projection_contents d ON d.workspace_id=s.workspace_id AND d.contract_id=s.contract_id
  AND d.digest=sha256(convert_to(r.content::text,'UTF8')) AND d.content=r.content
 ON CONFLICT DO NOTHING;
 -- A replay must match every row, including order; a digest is never enough.
 WITH normalized AS (
  SELECT first_row+ordinality::integer-1 AS rn,private.grcon_sigem_projection_content(value) AS content
  FROM jsonb_array_elements(rows) WITH ORDINALITY
 ) SELECT count(*)::integer INTO n FROM normalized r
 JOIN private.grcon_sigem_projection_map m ON m.snapshot_id=s.id AND m.row_number=r.rn
 JOIN private.grcon_sigem_projection_contents d ON d.id=m.content_id AND d.workspace_id=s.workspace_id
  AND d.contract_id=s.contract_id AND d.content=r.content;
 IF n<>expected THEN RAISE EXCEPTION 'SIGEM_PROJECTION_CONFLICT'; END IF;
 SELECT count(*)::integer INTO n FROM private.grcon_sigem_projection_map WHERE snapshot_id=s.id;
 RETURN n;
END $bulk$;
