# Central de Postagem SIGEM — entrega da PR #239

Data: 13/10/2026. Branch: `feat/sigem-posting-central-20261013`.

A Central substitui a pré-conferência da aba SIGEM, conserva a conferência técnica em subárea e oferece atalho no Controle de GRDT. Consulta e prepara rascunhos por seleção humana; a geração registrada não comprova envio.

## Arquitetura implementada

1. Consulta Geral pelo serviço oficial, conferindo workspace, origem, snapshot e data. Cache/desatualização são identificados.
2. Histórico compartilhado completo e paginado por `loadClassificationHistory`; cópia local é fallback explicitamente identificado. Arquivos removidos não são ativos.
3. Conferência por `GrconPostingConference.reconcile` e consolidação por `GrconPostingConferenceRefinement`; uma revisão anterior nunca confirma uma posterior.
4. Alocação, fiscalização e solicitações pelos motores existentes, com fontes e referências rastreáveis.
5. Evolução na Central usando comparação oficial de snapshots no servidor, projeção completa incluindo itens sem alteração, classificação de informações modificadas e reconciliação oficial para pendências/divergências.
6. Monitoramentos por documento, revisão exata e GRDT no mesmo motor e na mesma central de notificações. Integrantes ativos da GRDT são derivados pelo servidor; alertas são deduplicados por evidência e abrem o item correto.
7. Proprietário/administrador gerenciam monitoramentos; membros autorizados consultam. As três migrações estão aplicadas; tabelas privadas têm RLS/acesso direto revogado, wrappers invoker e guardas de papel/contrato.
8. Preferências, colunas por visão, visualizações salvas, filtros, larguras e fixação isolados por usuário/contrato. Troca de contexto descarta resultados atrasados.
9. Tabela virtual e processamento em Worker externo com motores oficiais. Lista de códigos utiliza índices compartilhados com a visualização.
10. Excel da visão filtrada, integrantes da GRDT, ausências e metadados das bases; proteção de texto contra fórmulas e preservação de códigos/revisões.

## Entrega e verificação

| Área | Resultado |
|---|---|
| Visões | Documentos, GRDTs, Revisões, Pendências e Evolução. |
| Evolução | Novidades, status, informações, itens sem alteração, monitorados, pendências resolvidas e divergências atuais/resolvidas; Excel com versões e datas. |
| Gerenciamento | Criar, desativar, reativar e excluir assinatura por revisão/GRDT; backend preserva papéis existentes. |
| GRDT | Diagnóstico total/parcial, integrantes e seleção explícita para preparar rascunho; não envia nem gera automaticamente. |
| Interface | Busca universal/lote, filtros combinados no mesmo integrante, colunas, arraste, largura, fixação, teclado, detalhe e retorno técnico. |
| Dados reais | 593 GRDTs, 23.574 registros SIGEM, 27.465 previstos, 12.835 vínculos de alocação e 933 solicitações. 4.823 ocorrências sem divergência do motor oficial; 18.419 documentos consolidados. |
| Comparação real | 23.574 pares nas bases de 12 e 13/10; 12 alterações de presença/status e 23.562 sem alteração; sem alertas em comparação manual. |
| Papéis e contratos | Identidades reais owner/admin/operator no PostgreSQL authenticated; UHDT-D, UGH e Pátio do Coque; escrita do operador e acesso sem associação negados. |
| Regressão | `npm run verify`, testes PostgreSQL/PGlite e Chromium, pacote Cloudflare e integridade de referências. CI executa no SHA da PR. |
| Publicação | Autorizada pelo usuário; workflow da main executa validação, deploy e conferência da versão/proteção do Cofre. |

O relatório `docs/grdt-table-audit-20261013.md` registra defeitos, correções, medições e limites. Testes reais usam uma fotografia das bases no navegador local; papéis/APIs são exercitados separadamente no banco de produção com transações revertidas. Nenhum dado operacional ou credencial é incluído em git ou artefatos públicos.

## Scripts reproduzíveis

- `node tests/sigem_monitor_targets.cjs`: banco, revisão exata, GRDT agrupada, remoção de integrante, idempotência, informações, links e permissões.
- `node scripts/sigem-central-browser-qa.cjs`: Central operacional e interação.
- `node scripts/sigem-central-worker-qa.cjs`: Worker, virtualização, exportação e concorrência entre contratos.
- `node scripts/sigem-central-tracking-qa.cjs`: assinaturas, comparação, filtros de evolução, visões e links exatos.
- `node scripts/sigem-central-real-data-qa.cjs /caminho/snapshot.json`: fotografia obtida por leitura autorizada; dados reais não são versionados nem enviados ao CI.
- `node scripts/validar-grdt-table-audit-browser.cjs`: geração real do aplicativo com insumos sintéticos, densidades, detalhes e zoom.

## Limites operacionais e recuperação

Tempo desde geração não é SLA nem evidência de postagem. Ausência numa nova Consulta Geral não comprova cancelamento. Bases inexistentes são apresentadas como indisponíveis; UGH e Pátio do Coque estavam vazios na homologação. Desempenho medido no ambiente de teste não garante os mesmos tempos no computador corporativo.

Em regressão de implantação, restaurar o artefato Cloudflare anterior aprovado e atualizar o cache do service worker. Conservar as migrações e dados: a ampliação é compatível com o frontend anterior. Os testes de banco não deixaram assinaturas de homologação e não enviaram notificações.
