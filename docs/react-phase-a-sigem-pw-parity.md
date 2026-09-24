# FASE A — SIGEM × PW — Checklist de paridade do Dashboard principal

Baseline: `main` em `09a832b6f204702519ef7f45d0647e9544eca97c`.

Escopo desta etapa: somente a UI principal de `sigem_pw_dashboard_app.js` → React + TypeScript. Não inclui redesign (FASE B), Revision UI, Evolution UI nem histórico analítico avançado.

## Arquitetura anterior

`sigem_pw_dashboard_bootstrap.js` → `sigem_pw_dashboard_app.js` → `GrconSigemPwDashboard` / `GrconSigemPwReadiness` → `workers/sigem_pw_dashboard.worker.js` → IndexedDB.

Complementos são carregados de forma lazy e dependem da fachada global do Dashboard.

## Contratos de negócio que não podem mudar

- Core `sigem_pw_dashboard_core.js` continua fonte da verdade para normalização, identidade, matching, classificação e agregação.
- Escopo documental continua restrito a ET e N-1710. CV não entra nesta etapa.
- N-1710 continua condicionado ao universo válido da LD da Qualidade.
- `documento + revisão` é a ocorrência documental do Dashboard. Revisões 0, A, B do mesmo código contam como três ocorrências quando presentes.
- Registro existente na Consulta Geral SIGEM é considerado postado para este módulo.
- PW sem revisão informada mantém o fallback por código já implementado no Core.
- As cinco situações continuam mutuamente exclusivas: `sigemOnly`, `bothNotEmitted`, `bothEmitted`, `pwOnlyNotEmitted`, `pwOnlyEmitted`.
- `classifiedTotal` continua validado pelo Core.
- Troca ET/N-1710 deve reutilizar `state.aggregates`; não reconstrói modelo.
- `PAGE_SIZE = 100` é somente visual. Exportação usa toda a lista filtrada.
- XLSX permanece lazy via `GRCONModuleLoader.ensure("xlsx")`.

## Controles e comportamentos do shell principal

- Cabeçalho `Dashboard SIGEM × ProjectWise`.
- Botão `Evolução` chama o bootstrap legado/lazy.
- Botão `Gerenciar histórico` abre apenas o diálogo básico de snapshots do Dashboard.
- Botão `Exportar lista` exporta o resultado filtrado completo.
- Indicador `spw-progress` mostra `busy/progressMessage` e desabilita ações concorrentes relevantes.
- Readiness é apresentado a partir de `GrconSigemPwReadiness.assess()` sem regras duplicadas em JSX.
- Três cards de base: SIGEM, PW e LD da Qualidade, com arquivo, data operacional, quantidade e ações.
- SIGEM/PW mantêm edição de data operacional via `datetime-local`; `sourceImportedAt` não é sobrescrito.
- SIGEM aceita XLS/XLSX/XLSM e usa `posting_conference_core.js` para validação/preparo/commit.
- PW aceita CSV/TXT e mantém parser/encoding/escopo existentes.
- LD aceita XLS/XLSX/XLSM e procura a aba N-1710 via Core.
- Totais SIGEM: total, ET, N-1710.
- Totais PW: total cadastrado, ET, N-1710, emitido, não emitido.
- Cinco KPIs operacionais vêm de `aggregateModel`.
- Abas de lista: `all`, `sigemOnly`, `bothNotEmitted`, `bothEmitted`, `pwOnlyNotEmitted`, `pwOnlyEmitted`.
- Pesquisa `spw-query`: documento, revisão, classe, status SIGEM, status PW, emissão PW e situação.
- Filtro de classe: ET e N-1710 / ET / N-1710.
- `Limpar filtros` volta à visão completa e página 1.
- Tabela mantém as colunas: Classe, Documento, Revisão, Status SIGEM, Status PW, Emissão PW, Situação.
- Paginação anterior/próxima monta apenas 100 linhas por página.
- Diálogo básico de histórico lista snapshot atual, nome, data, registros, edição de data e exclusão com confirmação.
- Exclusão de snapshot chama o Core e depois `refreshBases()`.

## Atomicidade e rollback

A ordem obrigatória permanece:

1. validar/preparar candidato;
2. `registerHistoryBeforeActivation()`;
3. `History.recordActiveBases()`;
4. `HistoryManagement.capturePayload()`;
5. ativar/persistir a nova base;
6. reconstruir modelo;
7. publicar eventos.

Em falha depois do registro e antes da ativação, `rollbackStagedImport()` restaura a base/histórico anterior e chama `rollbackRecordedActiveBases()`. A mensagem de regressão permanece: “A nova base foi validada, mas não pôde ser registrada no histórico e não foi ativada.”

A dependência continua: Revision Core → History Core → registro → ativação.

## Worker e geração

- `workers/sigem_pw_dashboard.worker.js` continua montando `createModel()` e os agregados `all`, `ET`, `N-1710` fora da thread principal.
- `modelGeneration` invalida resultados atrasados; um modelo antigo nunca pode sobrescrever o mais novo.
- Parser PW continua usando Worker quando disponível.

## Contrato público `GrconSigemPwDashboardUi`

A fachada React deve manter:

- `activate()`
- `refresh(reason?)`
- `clearPreStage7BasesOnce()`
- `state`

`state` permanece um objeto estável e contém, no mínimo: `model`, `result`, `ld`, `sigem`, `pw`, `aggregates`, `filters`, `activeList`, `page`, `ready`, `busy`, `history`, `readiness`, `modelGeneration`, `dateEditSystem` e `dateEditSnapshotId`.

### Consumidores identificados

- `sigem_pw_revision_section.js`: lê `state.model` para análise de revisões.
- `sigem_pw_history_management.js`: lê `state.sigem` / `state.pw` para source IDs e payloads.
- `sigem_pw_dashboard_ui_audit.js`: lê `state.model` para activation guards e protege debounce/scroll/content-visibility.
- `sigem_pw_audit_app.js`: lê `state.pw` e snapshot atual.
- `sigem_pw_history_postmerge.js`: lê `state.sigem` / `state.pw` para token de bases.
- `sigem_pw_history_runtime_fix.js`: lê `state[system]` em integrações legadas.
- `react-dist/sigem-pw-evolution-app.js`: UI React + TypeScript da Evolução, carregada sob demanda após `sigem_pw_evolution_core.js` pelo Dashboard/bootstrap.
- `sigem_pw_history_app.js`: permanece legado e fora do bundle React nesta etapa.
- `tests/sigem_pw_history_postmerge.cjs` e `tests/sigem_pw_performance_stability.cjs` exercitam a mutabilidade histórica do `state`.

## Activation guards e carregamento lazy

- `sigem_pw_dashboard_ui_audit.js` permanece.
- Reabrir o Dashboard com o mesmo `state.model` não deve reexecutar análises pesadas dos complementos.
- `afterFirstPaint()` / `requestIdleCallback()` permanecem para Revision UI + audit.
- Evolution continua carregada apenas ao clicar.
- Revision Report/Excel/Audit detalhado não entram no bundle principal.

## Eventos preservados

- `grcon:conference-updated`
- `grcon:pw-base-updated`
- `grcon:sigem-pw-base-date-updated`
- `grcon:mascot-operation`

Listeners React devem ser registrados uma vez por montagem e removidos no cleanup.

## Paridade visual

A folha antes injetada por `ensureStyles()` passa para `sigem-pw-dashboard.css`, mantendo IDs, classes, layout, breakpoints e dark-mode baseado nas variáveis do design system. O objetivo é ANTES ≈ DEPOIS; nenhum redesign faz parte da FASE A.


## Consolidação final da FASE A

Após o primeiro checkpoint remoto integralmente verde, `sigem_pw_dashboard_app.js` foi removido do repositório. O runtime final do shell principal passa exclusivamente por `react-dist/sigem-pw-dashboard-app.js`; Revision, Evolution e histórico analítico permanecem legados/lazy nesta etapa. Os testes que antes inspecionavam o app imperativo passaram a validar o adapter, componentes React e bootstrap correspondentes, sem alterar os contratos de negócio.
