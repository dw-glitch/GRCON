-- Índices de cobertura das chaves estrangeiras.
--
-- O linter do Supabase apontou cinco chaves estrangeiras sem índice de
-- cobertura. Sem esse índice, o Postgres precisa varrer a tabela inteira toda
-- vez que confere a restrição — e a conferência acontece justamente nas
-- operações que o GRCON já faz hoje:
--
--   public.grcon_history.deleted_by ......... exclusão do histórico compartilhado
--   public.grcon_invitations.invited_by ..... remoção de um convite
--   public.grcon_workspaces.created_by ...... remoção/desativação de um usuário
--   private.grcon_egrdt_reservations
--     .reserved_by .......................... liberação de numeração ao excluir
--                                             uma eGRDT
--   private.grcon_request_item_events
--     .workspace_id ......................... limpeza em cascata da área
--
-- As três primeiras apontam para auth.users: apagar um usuário obriga o
-- Postgres a conferir cada tabela que o referencia. Com o histórico já em
-- centenas de linhas e crescendo a cada eGRDT, a varredura completa aparece na
-- exclusão do histórico e na liberação da numeração — exatamente os dois pontos
-- em que o operador fica esperando a confirmação do Supabase.
--
-- A migração é aditiva: cria apenas índices, não altera dado, coluna, política
-- de RLS ou privilégio. Nenhuma estrutura nova é exposta ao PostgREST.
--
-- COMO REVERTER
--   drop index if exists public.grcon_history_deleted_by_idx;
--   drop index if exists public.grcon_invitations_invited_by_idx;
--   drop index if exists public.grcon_workspaces_created_by_idx;
--   drop index if exists private.grcon_egrdt_reservations_reserved_by_idx;
--   drop index if exists private.grcon_request_item_events_workspace_idx;

create index if not exists grcon_history_deleted_by_idx
  on public.grcon_history (deleted_by)
  where deleted_by is not null;

create index if not exists grcon_invitations_invited_by_idx
  on public.grcon_invitations (invited_by);

create index if not exists grcon_workspaces_created_by_idx
  on public.grcon_workspaces (created_by);

create index if not exists grcon_egrdt_reservations_reserved_by_idx
  on private.grcon_egrdt_reservations (reserved_by);

create index if not exists grcon_request_item_events_workspace_idx
  on private.grcon_request_item_events (workspace_id);
