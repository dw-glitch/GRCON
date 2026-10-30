-- Old receipts may include a transport-only `ok` flag. Revalidate the identity
-- and content hashes rather than requiring equality of unrelated envelope keys.
DO $receipt$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO STRICT definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='grcon_sigem_release_step';
 definition:=replace(definition,'OR external_record.receipt IS DISTINCT FROM proof THEN',
 'OR external_record.receipt->>''checksum'' IS DISTINCT FROM proof->>''checksum''
 OR external_record.receipt->>''manifestHash'' IS DISTINCT FROM proof->>''manifestHash'' THEN');
 EXECUTE definition;
END $receipt$;
