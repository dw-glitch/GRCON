-- Keep the audit bounded while amortizing authenticated RPC latency.
DO $audit_batch$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO STRICT definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='grcon_sigem_release_step';
 definition:=replace(definition,'validation_row+500','validation_row+2000');
 EXECUTE definition;
END $audit_batch$;
