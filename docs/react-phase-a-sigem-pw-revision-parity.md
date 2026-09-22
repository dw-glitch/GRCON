# FASE A — SIGEM × PW — Situação das Revisões em React + TypeScript

Baseline: `main` após o hardening do Histórico de eGRDTs, merge `dc498be38bb86abfc6b1b82226405fbeaf70775e`.

Consolidação verificada em `9fbf7b7be2c5cb1762b75f3a3ba0e40094a54f90` / PR #125. O workflow **SIGEM × PW — Revisões React FASE A** (`35742269130`) concluiu com sucesso typecheck, build, testes estruturais e críticos, `npm test`, `npm run verify`, Chromium, screenshots, métricas, regressões, exportação e PWA. Os itens abaixo foram marcados somente após confrontar código final, facade, Core, testes e esse artefato remoto.

## Escopo

Migrar somente a UI legada `sigem_pw_revision_section.js` para React + TypeScript, preservando o Core `sigem_pw_revision_core.js`, o relatório lazy `sigem_pw_revision_report.js`, Histórico/Evolução legados e todos os contratos públicos existentes.

## Arquitetura anterior

```text
sigem_pw_revision_section.js
  ├─ ensureStyle() -> CSS injetado
  ├─ ensureSection() -> innerHTML
  ├─ bindShell() -> listeners delegados
  ├─ ensureAnalysis() -> GrconSigemPwRevision.analyzeAsync()
  ├─ renderCards()
  ├─ renderFilters()
  ├─ renderTable()
  ├─ exportFilteredRows()
  └─ window.GrconSigemPwRevisionUi
```

## Arquitetura alvo

```text
SigemPwDashboardApp
  └─ SigemPwRevisionSection
      ├─ useSigemPwRevision
      ├─ sigemPwRevisionAdapter
      ├─ GrconSigemPwRevision (Core, fonte da verdade)
      └─ GrconSigemPwRevisionReport (lazy, somente exportação)
```

A seção permanece na mesma React root `#grcon-sigem-pw-root`. Não existe segunda ilha/root React.

## Inventário de paridade

### Cabeçalho e ajuda
- [x] kicker `DETALHAMENTO OPERACIONAL`
- [x] título `Situação das Revisões`
- [x] descrição atual preservada
- [x] botão/ajuda `ⓘ` com o texto atual

### Cinco cards
- [x] Atualizados
- [x] PW em revisão anterior
- [x] Não localizados no PW
- [x] Aguardando emissão no PW
- [x] Outras divergências = `pwAhead + review`
- [x] counts vêm de `analysis.counts`
- [x] clique filtra
- [x] segundo clique retorna para `attention`
- [x] `aria-pressed` reflete o estado ativo

### Situações disponíveis no filtro
- [x] Precisam de atenção
- [x] Todos
- [x] Não localizado no PW
- [x] PW em revisão anterior
- [x] Aguardando emissão
- [x] Atualizado
- [x] Outras divergências
- [x] PW em revisão posterior
- [x] Requer análise

### Filtros
- [x] Situação
- [x] Classe
- [x] Rev. SIGEM
- [x] Rev. PW
- [x] Status SIGEM
- [x] Status PW
- [x] Pesquisar documento
- [x] Lista de documentos
- [x] classe limitada a ET / N-1710
- [x] opções de revisão ordenadas por `Core.rank()`
- [x] status derivados da análise real
- [x] filtros novos resetam `page = 1`

### Busca / lista
- [x] busca textual com debounce real de ~180 ms
- [x] texto cru separado do texto debounced
- [x] lista aceita linha, vírgula, ponto e vírgula, pipe e tab via `Core.filterRows()`
- [x] React não reimplementa o parser
- [x] exportação imediata usa texto cru atual, mesmo antes do debounce

### Análise
- [x] fonte do modelo = `GrconSigemPwDashboardUi.state.model`
- [x] referência do modelo, sem deep clone
- [x] `GrconSigemPwRevision.analyzeAsync()`
- [x] `chunkSize: 350`
- [x] `analysisGeneration`
- [x] `isCurrent(generation)`
- [x] progresso real `done / total`
- [x] resultado antigo nunca substitui nova geração
- [x] ativação deferred, depois da primeira pintura do Dashboard
- [x] reentrada com mesmo modelo não reanalisa sem necessidade

### Core preservado
React não reimplementa:
- [x] comparação/rank de revisões
- [x] identidade documental
- [x] matching SIGEM × PW
- [x] situação
- [x] reason
- [x] contagens
- [x] parser de lista
- [x] históricos SIGEM/PW

APIs usadas:
- [x] `analyzeAsync`
- [x] `filterRows`
- [x] `historyForRows`
- [x] `rank`
- [x] `SITUATIONS`
- [x] `LABELS`

### Resumo
- [x] número total filtrado
- [x] faixa X–Y
- [x] duração da análise
- [x] documentos comparáveis
- [x] feedback de exportação com `aria-live`

### Tabela
Colunas preservadas:
- [x] Documento
- [x] Classe
- [x] Rev. SIGEM
- [x] Status SIGEM
- [x] Rev. PW
- [x] Status PW
- [x] Última emissão PW
- [x] Situação
- [x] Detalhes

### Detalhe “Por quê?”
- [x] `expandedKey`
- [x] Fechar/Por quê?
- [x] SIGEM — revisões encontradas
- [x] ProjectWise — revisões encontradas
- [x] `Core.historyForRows()`
- [x] reason
- [x] Código SIGEM
- [x] Código PW
- [x] EAP
- [x] Tipo
- [x] Revisão SIGEM
- [x] Revisões PW
- [x] Critério
- [x] filtro/página que remove a linha limpa detalhe órfão

### Paginação
- [x] `PAGE_SIZE = 100`
- [x] Anterior
- [x] Página X de Y
- [x] Próxima
- [x] `filteredRows()` retorna todas as páginas
- [x] tabela renderiza somente a página atual

### Estado vazio / progresso
- [x] sem modelo: `Carregue as bases para analisar as revisões.`
- [x] modelo + filtro zero: `Nenhum documento corresponde aos filtros atuais.`
- [x] progresso: `Comparando revisões SIGEM × PW...`
- [x] progresso: `X de Y documentos processados`

### Exportação
- [x] ação `Exportar lista filtrada`
- [x] lazy `GRCONModuleLoader.ensure("report")`
- [x] lazy `sigem_pw_revision_report.js`
- [x] `buildWorkbook()`
- [x] todas as linhas filtradas, não só a página
- [x] texto cru atual respeitado antes de 180 ms
- [x] `Gerando Excel...`
- [x] sucesso com quantidade
- [x] erro visível
- [x] XLSX/ExcelJS/report fora do bundle React inicial

### Eventos / refresh
- [x] `grcon:conference-updated`
- [x] `grcon:pw-base-updated`
- [x] ignorar refresh duplicado quando `detail.source === "sigem-pw-dashboard"`
- [x] para atualização externa: Dashboard refresh antes da revisão
- [x] listeners registrados uma vez e removidos no cleanup
- [x] sem loop Dashboard → revisão → Dashboard

### Facade pública
Preservar:
- [x] `GrconSigemPwRevisionUi.activate()`
- [x] `GrconSigemPwRevisionUi.refresh()`
- [x] `GrconSigemPwRevisionUi.state`
- [x] `GrconSigemPwRevisionUi.state.analysis`
- [x] `GrconSigemPwRevisionUi.filteredRows()`
- [x] `GrconSigemPwRevisionUi.exportFilteredRows()`

Estado de compatibilidade a manter vivo:
- [x] `modelRef`
- [x] `analysis`
- [x] `analysisGeneration`
- [x] `filters`
- [x] `page`
- [x] `expandedKey`
- [x] `searchTimer` compatível como `null`/handle interno
- [x] `exporting`
- [x] `exportMessage`
- [x] `exportMessageKind`

## Consumidores reais encontrados

- `sigem_pw_dashboard_bootstrap.js`: chama `GrconSigemPwRevisionUi.activate()` após `afterFirstPaint()`.
- `sigem_pw_dashboard_ui_audit.js`: inclui `GrconSigemPwRevisionUi` em activation guards e usa seletores `.spw-rev-*`.
- `sigem_pw_history_management.js`: após remoção/promoção de base chama `RevisionUi().refresh()`.
- `tests/sigem_pw_performance_stability.cjs`: usa facade/estado de revisão em cenários de estabilidade.
- `tests/sigem_pw_react.cjs`: exige tipagem do global.
- `scripts/validar-sigem-pw-react-browser.cjs`: exige uma única `#spw-revision-section` e passa a validar interações reais da seção.

Não foi encontrado outro consumidor direto de `GrconSigemPwRevisionUi.state` no runtime além dos testes/guards citados; ainda assim `state.analysis` será preservado como contrato público vivo.

## CSS / visual

- [x] extrair CSS de `ensureStyle()` para `sigem-pw-revision.css`
- [x] preservar classes `.spw-rev-*`
- [x] preservar breakpoints equivalentes a 1250 / 850 / 560
- [x] preservar dark mode existente por tokens
- [x] manter correções locais do `sigem_pw_dashboard_ui_audit.js`
- [x] sem redesign FASE B

## Bootstrap / runtime

- [x] `sigem_pw_dashboard_bootstrap.js` deixa de carregar `sigem_pw_revision_section.js`
- [x] continua chamando `RevisionUi.activate()` somente após `afterFirstPaint()`
- [x] `sigem_pw_revision_core.js` continua carregado antes do History Core
- [x] History/Evolution continuam legados
- [x] `sigem_pw_revision_section.js` removido somente após a nova implementação e testes estruturais existirem

## PWA / bundle

- [x] remover `sigem_pw_revision_section.js` do precache
- [x] adicionar `sigem-pw-revision.css`
- [x] renovar versão do cache
- [x] `sigem_pw_revision_core.js` permanece
- [x] `sigem_pw_revision_report.js` permanece lazy
- [x] bundle não contém ExcelJS/XLSX/report

## Critério de aceite

Somente considerar consolidado quando:
- React/TS real, sem `innerHTML`/delegação para render da seção;
- Core intacto;
- facade compatível;
- generation/cancelamento comprovados;
- debounce comprovado por digitação progressiva;
- exportação > PAGE_SIZE e exportação antes do debounce comprovadas;
- Chromium 1440/1366/1024/768/390 sem overflow global;
- screenshots FASE A antes≈depois;
- regressões Dashboard, Evolução, Histórico, History Management, Consultas, Histórico de análises, PDFs, Histórico de eGRDTs e mascote passam;
- Preview Vercel é gerado e inspecionado quando acessível.
