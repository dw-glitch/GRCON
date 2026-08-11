-- Aplicada em 11/08/2026 no projeto kvyrttccwzdhasplfxnr
-- (migração alinha_involucros_modelo_email_5_31_14). Mantida aqui para registro.
--
-- Motivo: o advisor de segurança do Supabase apontou dois WARN de
-- "security definer function" nos invólucros públicos do modelo de e-mail
-- criados na 5.31.10. Revisando os outros invólucros do GRCON, todos são
-- SECURITY INVOKER — só as implementações em "private" são SECURITY DEFINER.
-- Os dois invólucros novos tinham sido criados como DEFINER, ou seja, com
-- privilégio a mais do que o padrão da base exigia.
--
-- Aqui eles voltam ao padrão: invólucro público INVOKER, implementação privada
-- DEFINER (é ela que confere o papel via private.grcon_has_role /
-- private.grcon_is_member). O schema "private" não é exposto pelo PostgREST,
-- então continua não existindo nenhuma política de RLS criada ou alterada.
--
-- Comportamento conferido depois de aplicar, em área de trabalho descartável:
--   proprietário grava .......... ok
--   operador lê ................. ok
--   operador tenta gravar ....... bloqueado ("Somente o proprietário pode
--                                 alterar o modelo do e-mail.")
--   não membro lê ............... bloqueado ("Sem acesso a esta área de trabalho.")
--   anônimo lê .................. bloqueado (permission denied for function)
-- Depois disso os dois WARN do advisor desapareceram.

create or replace function public.grcon_get_email_template(target_workspace uuid)
returns table (
  subject_template text,
  body_template text,
  recipients_to text[],
  recipients_cc text[],
  updated_at timestamptz,
  updated_by uuid
)
language sql
security invoker
set search_path = public, private, pg_temp
as $$ select * from private.grcon_get_email_template(target_workspace); $$;

revoke all on function public.grcon_get_email_template(uuid) from public, anon;
grant execute on function public.grcon_get_email_template(uuid) to authenticated;

create or replace function public.grcon_set_email_template(
  target_workspace uuid,
  new_subject text,
  new_body text,
  new_to text[],
  new_cc text[]
)
returns table (
  subject_template text,
  body_template text,
  recipients_to text[],
  recipients_cc text[],
  updated_at timestamptz,
  updated_by uuid
)
language sql
security invoker
set search_path = public, private, pg_temp
as $$ select * from private.grcon_set_email_template(target_workspace, new_subject, new_body, new_to, new_cc); $$;

revoke all on function public.grcon_set_email_template(uuid, text, text, text[], text[]) from public, anon;
grant execute on function public.grcon_set_email_template(uuid, text, text, text[], text[]) to authenticated;
