-- Set-based projection can safely process 2,000 rows per RPC; the independent
-- validation stays at 500 rows, and the browser upload remains capped at 250.
DO $batches$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO STRICT definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='grcon_sigem_project_rows';
 definition:=replace(definition,'expected NOT BETWEEN 1 AND 500','expected NOT BETWEEN 1 AND 2000');
 EXECUTE definition;
 SELECT pg_get_functiondef(p.oid) INTO STRICT definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='grcon_sigem_release_step';
 definition:=replace(definition,'ORDER BY original.row_number LIMIT 500','ORDER BY original.row_number LIMIT 2000');
 EXECUTE definition;
END $batches$;
