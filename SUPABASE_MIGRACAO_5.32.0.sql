-- GRCON 5.32.0 — endurecimento de privilégios das tabelas privadas
--
-- Esta migração é idempotente. Ela não altera linhas, políticas RLS nem a API
-- pública; apenas explicita o princípio do menor privilégio nas duas tabelas
-- privadas criadas antes de esse padrão passar a ser registrado nas migrações.

begin;

revoke all on table private.grcon_egrdt_reservations from public, anon, authenticated;
revoke all on table private.grcon_email_template from public, anon, authenticated;

-- Os únicos pontos públicos do modelo de e-mail continuam sendo os wrappers
-- SECURITY INVOKER, autenticados e com validação de membro/papel nas rotinas
-- privadas. Repetir os privilégios aqui deixa o estado final reproduzível.
revoke all on function public.grcon_get_email_template(uuid) from public, anon;
grant execute on function public.grcon_get_email_template(uuid) to authenticated;

revoke all on function public.grcon_set_email_template(uuid, text, text, text[], text[]) from public, anon;
grant execute on function public.grcon_set_email_template(uuid, text, text, text[], text[]) to authenticated;

commit;
