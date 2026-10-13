# Central de Postagem SIGEM — auditoria e continuidade da PR #239

## Escopo, 13/10/2026

Esta PR substitui a área de *pré-conferência de eGRDT* na aba SIGEM por uma central de consulta documental, mantendo a conferência técnica na subárea e um atalho no Controle de GRDT. **Não executa envio ou postagem no SIGEM.**

Branch: `feat/sigem-posting-central-20261013`. Base: `main`.

## Decisões de arquitetura

1. **Consulta Geral**: apenas `GrconSharedSigemQuery.current()`, com `state.workspace` conferido contra `GrconCloud.state.membership.workspace_id`. Uma base local ou em cache deve sempre ser identificada.
2. **Histórico**: somente `GrconHistory.read()` do workspace ativo. Arquivos removidos do histórico não são exibidos como ativos.
3. **Conferência**: `GrconPostingConference.reconcile` define a presença de documento + revisão; `GrconPostingConferenceRefinement.buildDocumentAggregates` consolida repostagens e revisões. **Revisão anterior confirmada nunca confirma revisão posterior.**
4. **Alocação**: `GrconAllocationRegistry.resolve` consulta Documentos Previstos + Central de Alocação; comentários são complementares, não comprovam postagem. `GrconRequestsControl.find` fornece referências existentes, sem reimportar a base.
5. **Evolução e monitoramento**: reutiliza integralmente `GrconSigemStatusMonitoring`, incluindo snapshots, comparação, notificações e auditoria. Botão da central acessa a área já existente em Consultas.
6. **Repostagem**: a central somente copia códigos dos itens que passam por `GrconPostingConference.repostEligibility`, exigindo Consulta Geral atual. Não gera eGRDT automaticamente e não concede autorização de postagem.
7. **Personalização**: seleção, ordem e largura de colunas + ordenação são gravadas por `workspace_id` + `user.id`; nenhum dado documental completo é persistido como preferência.
8. **Desempenho**: índices em memória por identidade documental são construídos uma vez por reconstrução da consulta; pesquisa em lote usa conjuntos, sem varredura de toda a base por código.
9. **Exportação**: Excel segue a visualização filtrada e registra snapshot, período, fonte, contrato, usuário e filtros; itens não encontrados vão para uma aba própria.
10. **Permissões**: sem migrações, sem `service_role`, sem publicação automática. A interface não amplia permissões das APIs existentes.

## Entregas presentes nesta PR

- Visões Documentos, GRDTs, Revisões e Pendências.
- Pesquisa universal e lote com lista completa de códigos não encontrados.
- Painel lateral de ocorrências, situação de revisão, GRDT e evidências.
- Tabela com virtualização, ordenação, colunas selecionáveis/reordenáveis e largura configurável.
- Filtros de situação, revisão, alocação, disciplina, propósito, fiscalização, repostagem e datas.
- Integração com comentários da Fiscal 01/02, retorno e referências de solicitações.
- Evolução/monitoramento via área compartilhada já existente.
- Preparação **manual** de lista de itens para avaliação, preservando decisão do operador.
- Exportação XLSX com proveniência, e conferência técnica XLS preservada.

## Validação e gates

O workflow `.github/workflows/sigem-posting-central.yml` executa:

1. `node --check` dos módulos envolvidos.
2. `node --test tests/sigem_posting_central.cjs`, incluindo revisão posterior não confirmada, repostagens, GRDTs parcialmente confirmadas, busca em lote, ordenação e filtros.
3. Regressão dos testes de conferência existentes.
4. Chromium: `scripts/sigem-central-browser-qa.cjs`, com dados sintéticos de workspace isolado, clique na tabela, navegação, ordenação, filtros e lista.

Os workflows gerais do GRCON também devem passar no commit final. **Resultados anteriores a novos commits não contam como validação do código mais recente.**

## Riscos e limitações de homologação

- A central não substitui o módulo dedicado de monitoramento e evolução: ela o reutiliza por navegação.
- As faixas de prazo não constituem SLA oficial, e data de geração não é confirmação de envio.
- Enriquecimento com controle de solicitações depende da disponibilidade do snapshot compartilhado.
- A renderização assume altura constante de linha: testar visualmente zoom do navegador e muitos campos personalizados.
- Não há comparação local concorrente com snapshots: manter fonte única do monitoramento existente.
- O teste Chromium sintético **não substitui homologação autenticada** de owner/admin/operator com Supabase real, múltiplos contratos e XLSX reais.
- Não existem métricas de produção auditadas que comprovem o objetivo de 300 ms / 2 s. Não afirmar que as metas foram atingidas sem benchmark.
- É necessário verificar o pacote Cloudflare, a atualização do service worker e a operação offline antes de publicar.

## Homologação mínima antes de mesclar

- [ ] CI específico e validação geral aprovados no SHA final.
- [ ] Chromium sem erro e evidências revisadas.
- [ ] Conferência técnica .xls funciona a partir do Controle de GRDT e retorna à central.
- [ ] Testar pelo menos três contratos e dois usuários autorizados.
- [ ] Testar Consulta Geral compartilhada, local, ausente, antiga e cache stale.
- [ ] Testar histórico de postagem parcial e revisão nova não confirmada.
- [ ] Validar exportação em Excel com filtro e textos contendo caracteres especiais.
- [ ] Validar monitoramento e alterações via navegação de Consultas.
- [ ] Validar carregamento de 25 mil registros e pesquisa em lote de 500 códigos.
- [ ] Aprovação explícita para merge e publicação Cloudflare.

## Rollback

Manter a PR em draft enquanto houver gates pendentes. Se uma implantação futura apresentar regressões: retornar o Worker/artefato Cloudflare à versão anterior aprovada, invalidar as referências de cache com versão de service worker compatível e conservar os dados do banco (esta PR não prevê migrações).
