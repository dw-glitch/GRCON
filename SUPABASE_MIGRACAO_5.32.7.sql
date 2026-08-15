-- Aplicada em 15/08/2026 no projeto kvyrttccwzdhasplfxnr
-- (migração remover_aba_emails_5_32_7). Mantida aqui para registro.
--
-- Remoção das estruturas exclusivas da aba "E-mails de evidência", retirada do
-- GRCON na versão 5.32.7.
--
-- CONFERIDO ANTES DE REMOVER (consulta ao catálogo do Postgres):
--   funções que citam email_template ..... nenhuma além das próprias
--   views que citam email_template ....... nenhuma
--   chaves estrangeiras apontando p/ ela . nenhuma
--   gatilhos na tabela ................... nenhum
--   linhas guardadas ..................... 1 (copiada para o backup abaixo)
--
-- PRESERVADO por ser compartilhado com outros módulos:
--   public.grcon_profiles.email ...... identidade do usuário; usada no login,
--                                      nos convites e na autoria do histórico
--   public.grcon_invitations.email ... autorização de acesso à área compartilhada
--   public.grcon_audit_events ........ log compartilhado. O registro histórico
--                                      'email_template_updated' é MANTIDO: apagar
--                                      auditoria de um fato que ocorreu seria
--                                      perda de rastreabilidade, não limpeza
--   auth.users ....................... autenticação do Supabase
--   private.grcon_allocation_center .. central de alocação (5.32.6), intacta
--
-- COMO REVERTER
--   1. Reaplique SUPABASE_MIGRACAO_5.31.10.sql (tabela e implementações privadas)
--      e SUPABASE_MIGRACAO_5.31.14.sql (invólucros públicos INVOKER).
--   2. Restaure os dados:
--        insert into private.grcon_email_template
--        select * from private.grcon_email_template_backup_5_32_7
--        on conflict (workspace_id) do nothing;
--   3. Reponha no front-end os arquivos grcon_email_draft.js,
--      grcon_email_queue.js e grcon_email_queue_app.js, disponíveis no
--      histórico do repositório.

-- Cópia dos dados antes do descarte, para a remoção ser reversível sem perda.
create table if not exists private.grcon_email_template_backup_5_32_7 as
  select * from private.grcon_email_template;

revoke all on table private.grcon_email_template_backup_5_32_7 from public, anon, authenticated;

-- Invólucros públicos primeiro: são a única porta de entrada pelo PostgREST.
drop function if exists public.grcon_get_email_template(uuid);
drop function if exists public.grcon_set_email_template(uuid, text, text, text[], text[]);

-- Implementações privadas.
drop function if exists private.grcon_get_email_template(uuid);
drop function if exists private.grcon_set_email_template(uuid, text, text, text[], text[]);

-- Tabela exclusiva da aba removida.
drop table if exists private.grcon_email_template;
