# FASE B — Histórico de eGRDTs — checklist de paridade

Esta FASE B moderniza somente UI/UX. A arquitetura permanece React → Hook → Adapter → contratos existentes.

## Controles e navegação
- [x] cabeçalho
- [x] busca textual com debounce existente
- [x] ano
- [x] tipo de saída
- [x] postagem
- [x] ordenação
- [x] data inicial
- [x] data final
- [x] família documental
- [x] exportação
- [x] resumo
- [x] lista
- [x] Mostrar mais 200
- [x] seleção
- [x] detalhe

## Ações operacionais
- [x] Preparar no SIGEM
- [x] Avisar/Reenviar no Teams via teamsPresentation/openTeams
- [x] resposta de e-mail
- [x] editar número
- [x] excluir uma eGRDT
- [x] limpar histórico em ação administrativa secundária
- [x] confirmação/permissão preservadas

## Detalhe e rastreabilidade
- [x] workflow SIGEM via Adapter.workflow
- [x] LD utilizada
- [x] origem
- [x] alocação
- [x] números anteriores
- [x] tabela com Documento
- [x] Arquivo original
- [x] Arquivo enviado
- [x] Revisão gerada na GRDT
- [x] Revisão desta GRDT postada
- [x] Outra revisão postada
- [x] Situação na geração
- [x] Alocação
- [x] Versão da LD enviada
- [x] Aba LD
- [x] indicador Alterada manualmente + tooltip
- [x] aviso sobre status atual x snapshot histórico

## Contratos críticos pós-hardening
- [x] SEARCH_DEBOUNCE_MS = 120
- [x] dependências explícitas de effectiveFilters
- [x] Data inicial/Data final atualizam imediatamente
- [x] state.filtered representa todo o recorte filtrado
- [x] state.selectedId representa o registro ativo
- [x] Retomar não sobrescreve #history-summary
- [x] exportação usa filtered, não visibleRecords
- [x] LIST_PAGE_SIZE = 200
- [x] Posting.read concentrado em readPostingCache
- [x] sem dangerouslySetInnerHTML
- [x] sem UI legada paralela

## FASE B visual
- [x] UiPageHeader reutilizado
- [x] UiPanel reutilizado
- [x] UiMetaPill reutilizado
- [x] filtros principais separados de período/relatório
- [x] busca é o controle de maior peso
- [x] ação Limpar período
- [x] filtros ativos removíveis
- [x] KPIs informativos e filtros rápidos somente onde o status é inequívoco
- [x] lista com seleção visível por borda + fundo + indicador lateral
- [x] lista com scroll interno para impedir páginas gigantes
- [x] Mostrar mais permanece fora da região rolável
- [x] detalhe dividido em identificação, status/workflow, ações, metadados e documentos
- [x] ações destrutivas secundárias
- [x] tabela com thead sticky
- [x] primeira coluna sticky
- [x] dark mode baseado em tokens + color-scheme para date
- [x] breakpoints desktop/tablet/mobile sem duplicar o detalhe
- [x] prefers-reduced-motion

## Fora de escopo preservado
- [x] history_core.js não alterado
- [x] history_report.js não alterado
- [x] sigem_posting_core.js não alterado
- [x] macro5_flow_core.js não alterado
- [x] Supabase/schema/RLS/RPC/migrations não alterados
- [x] Power Automate/payload/webhook/menções não alterados
- [x] regras EAP/TAG/ET/CV/N-1710/RIR/C&M/LD/revisão/alocação/SIGEM/Databook não alteradas

## Validação obrigatória da PR
- [ ] typecheck
- [ ] build
- [ ] npm test
- [ ] npm run verify
- [ ] Chromium História eGRDT: intervalo 10/09–20/09 → somente B
- [ ] Chromium: inicial apenas → B+C
- [ ] Chromium: final apenas → A+B
- [ ] Chromium: limpar período → A+B+C
- [ ] Chromium: período inválido bloqueia relatório
- [ ] Chromium: filtros combinados
- [ ] Chromium: 1000 registros, <= 200 renderizados inicialmente
- [ ] Chromium: Posting.read não ocorre por linha
- [ ] Chromium: busca progressiva preserva debounce
- [ ] regressão Consultas
- [ ] regressão Histórico de análises
- [ ] regressão Combinar PDFs
- [ ] screenshots 1366/390/dark
- [ ] Service Worker cold/warm/reload/upgrade
- [ ] bundle antes/depois registrado no workflow
