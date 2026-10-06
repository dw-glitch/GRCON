# Migração GRDT integrada — checkpoint 06/10/2026

## Estado recuperado

A branch `feat/grdt-unified-posting-phases` reuniu a migração do fluxo normal de GRDT (A–E), a Central de alocação compartilhada e, nesta retomada, o Cofre de Documentos que estava separado na branch `feat/unified-grdt-document-vault`.

## Fluxo de GRDT

- Histórico completo do workspace é a fonte para FIRST_POSTING / NEW_REVISION / REPOST.
- Documento + revisão normalizados identificam repostagem.
- Nova revisão do mesmo documento continua sendo NOVA_REVISÃO e mostra a emissão anterior.
- A classificação não bloqueia a autonomia do operador.
- Postagem/repostagem e Alocado/Não alocado são dimensões independentes.
- A prévia e as saídas usam o mesmo planejamento de lote, disciplina e limite configurável.
- O Histórico salva o snapshot da classificação e, quando a origem é o Cofre, `vaultFileId`.

## Alocação compartilhada

- Documentos Previstos permanece a autoridade de Alocado/Não alocado.
- A Central de alocação fornece contexto adicional de solicitação/workflow.
- Em 06/10/2026 há um snapshot ativo de Documentos Previstos no banco; o Cofre consulta a classificação no servidor.
- Não alocado gera informação/alerta e não bloqueia a decisão do operador.

## Cofre implementado

Backend:

- Worker `cloudflare/worker-entry.mjs` roteia `/api/document-vault/*` e preserva o Worker legado para demais rotas.
- R2 privado pelo binding `GRCON_DOCUMENTS`, bucket `grcon-documents`.
- `SUPABASE_SECRET_KEY` é segredo de runtime; não existe no frontend.
- autenticação Supabase do bearer do usuário + validação de membership;
- catálogo privado no Supabase;
- paginação/busca/filtro de alocação no servidor;
- SHA-256, deduplicação física, conflito de identidade, upload único/multipart, retomada, download autenticado.

Frontend:

- área nativa **Cofre** no GRCON;
- seleção de arquivos, seleção de pasta e drag-and-drop recursivo;
- a hierarquia local não vira pasta lógica do R2;
- fila com progresso, pausa, retomada, retry e confirmação de variante;
- código/revisão inferidos do nome e editáveis antes do envio;
- filtros Todos / Alocados / Não alocados;
- abrir/baixar;
- seleção do Cofre é baixada de forma autenticada e adicionada ao mesmo `pdf-input` do Fazer GRDT;
- origem do Cofre é preservada no plano/Histórico por `vaultFileId`.

## Supabase

O schema efetivo de produção foi conferido e as migrations aplicadas foram trazidas para o Git sem recriar uma estrutura paralela:

- `20261006163921_document_vault_catalog.sql`
- `20261006170344_document_vault_search_allocation.sql`
- `20261006170405_document_vault_filter_pagination_fix.sql`
- `20261006170533_document_vault_secret_key_compatibility.sql`
- `20261006170546_document_vault_list_secret_key_compatibility.sql`

A migration preliminar que criaria `public.grcon_document_objects` foi removida por não representar o banco real.

## Segurança verificada

- acesso direto de `authenticated` aos RPCs do Cofre: negado;
- `service_role`/secret backend: permitido;
- tabelas do Cofre ficam no schema `private`;
- bucket não recebe URL pública;
- nenhum segredo administrativo é versionado;
- R2 Access Key/Secret não são necessários no navegador nem no Worker quando o binding é usado.

## Validação / publicação

A PR #185 é a PR consolidada para `main`. Os checks de CI/Cloudflare devem ficar verdes antes de retirar o draft e mesclar. Depois do merge, o workflow `Deploy Cloudflare` publica a `main`; a validação final exige `/api/document-vault/health = 200/ok:true` e pelo menos um upload/download autenticado com SHA-256 preservado.

A PR #186 foi apenas uma ponte de integração entre as duas branches e deve ser encerrada como substituída quando #185 estiver validada.
