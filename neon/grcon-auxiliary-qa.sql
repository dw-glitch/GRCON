-- Teste sintético; as inserções são revertidas no próprio bloco.
DO $qa$
DECLARE w uuid:='00000000-0000-4000-8000-000000000001';c uuid:='00000000-0000-4000-8000-000000000002';s uuid:='00000000-0000-4000-8000-000000000003';p jsonb:='{"document":"QA-DOC","revision":"A","extra":{"preserve":[null,false,0,"漢字"]}}';
BEGIN
 BEGIN
  INSERT INTO grcon_auxiliary.snapshots(source_kind,workspace_id,contract_id,id,source_json,record_count) VALUES('pw',w,c,s,'{"file":"QA.xlsx","allMetadata":{"keep":true}}',1);
  INSERT INTO grcon_auxiliary.rows VALUES('pw',w,c,s,1,p);
  IF (SELECT payload FROM grcon_auxiliary.rows WHERE snapshot_id=s)<>p THEN RAISE EXCEPTION 'NEON_QA_PAYLOAD_MISMATCH';END IF;
  BEGIN
   INSERT INTO grcon_auxiliary.rows VALUES('pw',w,'00000000-0000-4000-8000-000000000099',s,2,p);
   RAISE EXCEPTION 'NEON_QA_TENANT_GUARD_FAILED';
  EXCEPTION WHEN foreign_key_violation THEN NULL;END;
  BEGIN
   INSERT INTO grcon_auxiliary.rows VALUES('pw',w,c,s,1,p);
   RAISE EXCEPTION 'NEON_QA_DUPLICATE_GUARD_FAILED';
  EXCEPTION WHEN unique_violation THEN NULL;END;
  RAISE EXCEPTION USING ERRCODE='PZ001',MESSAGE='ROLLBACK_SYNTHETIC_QA';
 EXCEPTION WHEN SQLSTATE 'PZ001' THEN NULL;END;
 IF EXISTS(SELECT 1 FROM grcon_auxiliary.rows WHERE snapshot_id=s) THEN RAISE EXCEPTION 'NEON_QA_ROLLBACK_FAILED';END IF;
END $qa$;
