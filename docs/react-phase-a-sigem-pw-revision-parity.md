# FASE A — SIGEM × PW — Situação das Revisões em React + TypeScript

Baseline: `main` após o hardening do Histórico de eGRDTs, merge `dc498be38bb86abfc6b1b82226405fbeaf70775e`.

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
- [ ] kicker `DETALHAMENTO OPERACIONAL`
- [ ] título `Situação das Revisões`
- [ ] descrição atual preservada
- [ ] botão/ajuda `ⓘ` com o texto atual

### Cinco cards
- [ ] Atualizados
- [ ] PW em revisão anterior
- [ ] Não localizados no PW
- [ ] Aguardando emissão no PW
- [ ] Outras divergências = `pwAhead + review`
- [ ] counts vêm de `analysis.counts`
- [ ] clique filtra
- [ ] segundo clique retorna para `attention`
- [ ] `aria-pressed` reflete o estado ativo

### Situações disponíveis no filtro
- [ ] Precisam de atenção
- [ ] Todos
- [ ] Não localizado no PW
- [ ] PW em revisão anterior
- [ ] Aguardando emissão
- [ ] Atualizado
- [ ] Outras divergências
- [ ] PW em revisão posterior
- [ ] Requer análise

### Filtros
- [ ] Situação
- [ ] Classe
- [ ] Rev. SIGEM
- [ ] Rev. PW
- [ ] Status SIGEM
- [ ] Status PW
- [ ] Pesquisar documento
- [ ] Lista de documentos
- [ ] classe limitada a ET / N-1710
- [ ] opções de revisão ordenadas por `Core.rank()`
- [ ] status derivados da análise real
- [ ] filtros novos resetam `page = 1`

### Busca / lista
- [ ] busca textual com debounce real de ~180 ms
- [ ] texto cru separado do texto debounced
- [ ] lista aceita linha, vírgula, ponto e vírgula, pipe e tab via `Core.filterRows()`
- [ ] React não reimplementa o parser
- [ ] exportação imediata usa texto cru atual, mesmo antes do debounce

### Análise
- [ ] fonte do modelo = `GrconSigemPwDashboardUi.state.model`
- [ ] referência do modelo, sem deep clone
- [ ] `GrconSigemPwRevision.analyzeAsync()`
- [ ] `chunkSize: 350`
- [ ] `analysisGeneration`
- [ ] `isCurrent(generation)`
- [ ] progresso real `done / total`
- [ ] resultado antigo nunca substitui nova geração
- [ ] ativação deferred, depois da primeira pintura do Dashboard
- [ ] reentrada com mesmo modelo não reanalisa sem necessidade

### Core preservado
React não reimplementa:
- [ ] comparação/rank de revisões
- [ ] identidade documental
- [ ] matching SIGEM × PW
- [ ] situação
- [ ] reason
- [ ] contagens
- [ ] parser de lista
- [ ] históricos SIGEM/PW

APIs usadas:
- [ ] `analyzeAsync`
- [ ] `filterRows`
- [ ] `historyForRows`
- [ ] `rank`
- [ ] `SITUATIONS`
- [ ] `LABELS`

### Resumo
- [ ] número total filtrado
- [ ] faixa X–Y
- [ ] duração da análise
- [ ] documentos comparáveis
- [ ] feedback de exportação com `aria-live`

### Tabela
Colunas preservadas:
- [ ] Documento
- [ ] Classe
- [ ] Rev. SIGEM
- [ ] Status SIGEM
- [ ] Rev. PW
- [ ] Status PW
- [ ] Última emissão PW
- [ ] Situação
- [ ] Detalhes

### Detalhe “Por quê?”
- [ ] `expandedKey`
- [ ] Fechar/Por quê?
- [ ] SIGEM — revisões encontradas
- [ ] ProjectWise — revisões encontradas
- [ ] `Core.historyForRows()`
- [ ] reason
- [ ] Código SIGEM
- [ ] Código PW
- [ ] EAP
- [ ] Tipo
- [ ] Revisão SIGEM
- [ ] Revisões PW
- [ ] Critério
- [ ] filtro/página que remove a linha limpa detalhe órfão

### Paginação
- [ ] `PAGE_SIZE = 100`
- [ ] Anterior
- [ ] Página X de Y
- [ ] Próxima
- [ ] `filteredRows()` retorna todas as páginas
- [ ] tabela renderiza somente a página atual

### Estado vazio / progresso
- [ ] sem modelo: `Carregue as bases para analisar as revisões.`
- [ ] modelo + filtro zero: `Nenhum documento corresponde aos filtros atuais.`
- [ ] progresso: `Comparando revisões SIGEM × PW...`
- [ ] progresso: `X de Y documentos processados`

### Exportação
- [ ] ação `Exportar lista filtrada`
- [ ] lazy `GRCONModuleLoader.ensure("report")`
- [ ] lazy `sigem_pw_revision_report.js`
- [ ] `buildWorkbook()`
- [ ] todas as linhas filtradas, não só a página
- [ ] texto cru atual respeitado antes de 180 ms
- [ ] `Gerando Excel...`
- [ ] sucesso com quantidade
- [ ] erro visível
- [ ] XLSX/ExcelJS/report fora do bundle React inicial

### Eventos / refresh
- [ ] `grcon:conference-updated`
- [ ] `grcon:pw-base-updated`
- [ ] ignorar refresh duplicado quando `detail.source === "sigem-pw-dashboard"`
- [ ] para atualização externa: Dashboard refresh antes da revisão
- [ ] listeners registrados uma vez e removidos no cleanup
- [ ] sem loop Dashboard → revisão → Dashboard

### Facade pública
Preservar:
- [ ] `GrconSigemPwRevisionUi.activate()`
- [ ] `GrconSigemPwRevisionUi.refresh()`
- [ ] `GrconSigemPwRevisionUi.state`
- [ ] `GrconSigemPwRevisionUi.state.analysis`
- [ ] `GrconSigemPwRevisionUi.filteredRows()`
- [ ] `GrconSigemPwRevisionUi.exportFilteredRows()`

Estado de compatibilidade a manter vivo:
- [ ] `modelRef`
- [ ] `analysis`
- [ ] `analysisGeneration`
- [ ] `filters`
- [ ] `page`
- [ ] `expandedKey`
- [ ] `searchTimer` compatível como `null`/handle interno
- [ ] `exporting`
- [ ] `exportMessage`
- [ ] `exportMessageKind`

## Consumidores reais encontrados

- `sigem_pw_dashboard_bootstrap.js`: chama `GrconSigemPwRevisionUi.activate()` após `afterFirstPaint()`.
- `sigem_pw_dashboard_ui_audit.js`: inclui `GrconSigemPwRevisionUi` em activation guards e usa seletores `.spw-rev-*`.
- `sigem_pw_history_management.js`: após remoção/promoção de base chama `RevisionUi().refresh()`.
- `tests/sigem_pw_performance_stability.cjs`: usa facade/estado de revisão em cenários de estabilidade.
- `tests/sigem_pw_react.cjs`: exige tipagem do global.
- `scripts/validar-sigem-pw-react-browser.cjs`: exige uma única `#spw-revision-section` e passa a validar interações reais da seção.

Não foi encontrado outro consumidor direto de `GrconSigemPwRevisionUi.state` no runtime além dos testes/guards citados; ainda assim `state.analysis` será preservado como contrato público vivo.

## CSS / visual

- [ ] extrair CSS de `ensureStyle()` para `sigem-pw-revision.css`
- [ ] preservar classes `.spw-rev-*`
- [ ] preservar breakpoints equivalentes a 1250 / 850 / 560
- [ ] preservar dark mode existente por tokens
- [ ] manter correções locais do `sigem_pw_dashboard_ui_audit.js`
- [ ] sem redesign FASE B

## Bootstrap / runtime

- [ ] `sigem_pw_dashboard_bootstrap.js` deixa de carregar `sigem_pw_revision_section.js`
- [ ] continua chamando `RevisionUi.activate()` somente após `afterFirstPaint()`
- [ ] `sigem_pw_revision_core.js` continua carregado antes do History Core
- [ ] History/Evolution continuam legados
- [ ] `sigem_pw_revision_section.js` removido somente após a nova implementação e testes estruturais existirem

## PWA / bundle

- [ ] remover `sigem_pw_revision_section.js` do precache
- [ ] adicionar `sigem-pw-revision.css`
- [ ] renovar versão do cache
- [ ] `sigem_pw_revision_core.js` permanece
- [ ] `sigem_pw_revision_report.js` permanece lazy
- [ ] bundle não contém ExcelJS/XLSX/report

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
