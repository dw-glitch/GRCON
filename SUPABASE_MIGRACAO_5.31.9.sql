-- Aplicada em 07/08/2026 no projeto kvyrttccwzdhasplfxnr (migração
-- remove_indices_sem_uso_5_31_9). Mantida aqui para registro.
--
-- Remove índices que nunca foram usados (0 varreduras) e que nenhuma consulta
-- do GRCON precisa. Nenhum é único, primário ou sustenta constraint.
--
-- O mais relevante é o GIN sobre o JSONB payload de grcon_history: índices GIN
-- são caros de manter a CADA gravação, e grcon_history é escrita a cada eGRDT
-- gerada e a cada sincronização. Ele ocupava 344 kB e nunca serviu a uma
-- consulta — o app filtra por workspace_id, id, client_record_id e deleted_at,
-- nunca pelo conteúdo do payload.
--
-- Reversível: qualquer um pode ser recriado se surgir uma consulta que precise.

drop index if exists public.grcon_history_payload_gin_idx;
drop index if exists public.grcon_history_deleted_by_idx;
drop index if exists public.grcon_invitations_invited_by_idx;
drop index if exists public.grcon_workspaces_created_by_idx;
drop index if exists private.grcon_egrdt_reservations_reserved_by_idx;
