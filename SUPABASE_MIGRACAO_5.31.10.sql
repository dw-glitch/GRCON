-- Aplicada em 10/08/2026 no projeto kvyrttccwzdhasplfxnr
-- (migrações modelo_email_evidencia_5_31_10 e corrige_auditoria_modelo_email_5_31_10).
-- Mantida aqui para registro.
--
-- Modelo do e-mail de evidência de postagem, compartilhado por área de trabalho:
-- qualquer membro USA, somente o PROPRIETÁRIO altera, e a alteração vale para
-- todos que usam o aplicativo.
--
-- A tabela fica no schema "private", que não é exposto pelo PostgREST, e todo o
-- acesso passa por funções SECURITY DEFINER com verificação de papel — mesmo
-- padrão de grcon_update_member_role. Nenhuma política de RLS foi criada ou
-- alterada.
--
-- Consulte o histórico do repositório para o corpo completo das funções
-- private.grcon_get_email_template e private.grcon_set_email_template.

create table if not exists private.grcon_email_template (
  workspace_id uuid primary key references public.grcon_workspaces(id) on delete cascade,
  subject_template text not null,
  body_template text not null,
  recipients_to text[] not null default '{}',
  recipients_cc text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Leitura: qualquer membro ativo (private.grcon_is_member).
-- Escrita: somente owner (private.grcon_has_role(..., array['owner'])),
--          com assunto e corpo obrigatórios, limpeza de destinatários
--          duplicados/vazios e registro em public.grcon_audit_events.
-- Invólucros públicos: public.grcon_get_email_template / grcon_set_email_template
--          com revoke de public/anon e grant apenas para authenticated.
