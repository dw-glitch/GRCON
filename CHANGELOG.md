# Histórico de alterações

## 5.32.0 — 2026-08-11

- Pesquisa ET com e sem `NT-`, nos dois sentidos, preservando a exclusão da família N-1710.
- Código e nome final passam a seguir exatamente a forma encontrada na LD.
- Aba `Resumo` didática com pesquisa, alocação, renomeação `DE → PARA`, inclusão na eGRDT e ação necessária.
- Nova aba `Auditoria detalhada` com todas as evidências técnicas.
- Formatação idêntica para relações pequenas e grandes.
- Workers externos substituem o pacote de 3,3 MB com cópias embutidas e eliminam divergência entre tela e exportação.
- Validação automática de 15.000 códigos nos dois sentidos da busca, sem dados operacionais no repositório.
- CI unificada em `npm run verify`, controle de hashes das bibliotecas e Dependabot para Actions.
- CSP reforçada, scripts inline removidos e cabeçalhos de segurança adicionados ao Vercel.
- Migração Supabase idempotente para explicitar privilégios mínimos nas tabelas privadas.

## 5.31.17

- Base recebida para esta atualização, já contendo o primeiro conjunto de correções da busca `NT-`.
