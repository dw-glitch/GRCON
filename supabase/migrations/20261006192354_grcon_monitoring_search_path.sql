-- Pure status/identity helpers resolve only built-in functions.
alter function private.grcon_document_key(text) set search_path=pg_catalog;
alter function private.grcon_revision_key(text) set search_path=pg_catalog;
alter function private.grcon_status_key(text) set search_path=pg_catalog;
