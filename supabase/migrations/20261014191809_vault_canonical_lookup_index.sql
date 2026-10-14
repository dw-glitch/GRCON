begin;
create index if not exists grcon_vault_canonical_lookup_idx on private.grcon_document_files(workspace_id,contract_id,private.grcon_master_document_key(identity_code),revision) where status='ready';
commit;
