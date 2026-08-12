# Auditoria Supabase — GRCON 5.32.0

## Resultado do repositório

A validação automática percorre todas as migrações e verifica:

- `search_path` explícito em funções `SECURITY DEFINER`;
- revogação de acesso direto às tabelas do schema `private`;
- wrappers públicos do modelo de e-mail como `SECURITY INVOKER`;
- `EXECUTE` público/anon revogado e concedido ao papel `authenticated`;
- ausência de chave `service_role`/secreta no cliente;
- uso explícito da chave pública `sb_publishable_`.

Execute com `npm run check:supabase`.

## Migração 5.32.0

`SUPABASE_MIGRACAO_5.32.0.sql` revoga privilégios diretos das tabelas `private.grcon_egrdt_reservations` e `private.grcon_email_template`. Ela é idempotente e não modifica dados nem políticas.

Esta alteração está preparada no repositório, mas precisa ser aplicada no projeto Supabase pelo Dashboard SQL Editor ou pela CLI autorizada. Depois de aplicar, execute os Advisors de Security e Performance e confirme que não surgiram novos avisos.

## Limitação de reconstrução histórica

`SUPABASE_MIGRACAO_5.31.10.sql` foi mantida originalmente como registro de uma mudança já aplicada e não contém o corpo completo das duas funções privadas do modelo de e-mail. Portanto, uma instalação nova não deve tratar esse arquivo isolado como uma reconstrução completa do banco. Antes de instalar em outro projeto, recupere o SQL integral do histórico de migrações do projeto Supabase e versione-o.

## Checklist operacional

1. confirme RLS habilitada nas tabelas expostas do schema `public`;
2. confirme índices nas colunas usadas pelas políticas de workspace/usuário;
3. mantenha funções privilegiadas no schema `private`, com verificação explícita de `auth.uid()`/papel e `search_path` fixo;
4. conceda somente os privilégios exigidos para `authenticated`;
5. revise os privilégios do Data API sempre que o Supabase anunciar mudanças de padrão;
6. nunca coloque `service_role`, senha de banco ou JWT secret no repositório ou no navegador.

Esta auditoria é estática. Ela não confirma sozinha o estado do banco remoto.
