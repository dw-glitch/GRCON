# Consulta Geral e preparação do Neon

A Consulta Geral continua usando o Turso para todos os novos arquivos completos. O Supabase preserva as permissões, o catálogo das versões e a projeção operacional deduplicada usada pelas comparações, prazos e notificações.

A publicação envia até quatro lotes de 250 linhas simultaneamente. Uma falha aguarda os demais pedidos da mesma rodada e impede a ativação da nova base. Os recibos no Turso continuam verificando conteúdo e ordem. O servidor grava a projeção em conjuntos, com validação integral do lote, repetição segura e isolamento por contrato.

O deploy de produção executa a liberação das versões históricas em etapas retomáveis. Cada versão exige relatório de auditoria completo, manifesto R2 com hash válido, metadados iguais e recibo correspondente no Turso. A rotina reaproveita a autorização do Proprietário ADM registrada no trabalho original, revalidada no banco a cada chamada. A rota só aceita OIDC do proprietário do repositório, branch main e workflow de deploy autorizado. Os arquivos e backups do Turso permanecem preservados. Um envio novo pendente não impede a liberação de outra versão já auditada.

Após a liberação completa, conferir a contagem real em `private.grcon_sigem_query_rows`. Se estiver vazia, a recuperação física do espaço deve ser feita em manutenção curta, com lock_timeout, preservando tabela, índices, funções e projeções. Não usar CASCADE.

O projeto Neon existente é `summer-frost-00453971`, branch principal `br-plain-wind-b6vuv3vw`, região São Paulo. O esquema `grcon_auxiliary` já contém `snapshots` e `rows`, com RLS. A integração do Worker usa o driver oficial HTTP `@neondatabase/serverless`; sua conexão fica exclusivamente no secret `NEON_DATABASE_URL`. Não usar prefixo VITE nem gravar credenciais no repositório. O diagnóstico de armazenamento do Proprietário ADM verifica conexão e presença das duas tabelas, sem ler ou mover dados de módulos. Configurar o secret no Worker e republicar para concluir a conexão, caso ainda não exista. A divisão futura de módulos deve ser planejada e validada separadamente.

Validação: testes de envio fora de ordem, limite de concorrência, drenagem de falhas, troca de área; integração PostgreSQL/SQLite de importação, publicação e liberação; hash/conteúdo, retomada e controle de acesso; diagnóstico Neon sem divulgação de credenciais; compilação e verificações do projeto.
