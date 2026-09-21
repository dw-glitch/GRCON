# FASE B — SIGEM × PW — Modernização visual e UX

Baseline: `main` após a PR #119 e o ajuste de Vercel em `da433898c3dc56378560534e7e820b8e1837d2b0`.

## Objetivo

Modernizar exclusivamente a camada React/CSS do Dashboard principal SIGEM × ProjectWise, mantendo a arquitetura e todas as regras documentais consolidadas na FASE A.

A FASE B não migra nem redesenha os módulos legados/lazy de Revisões, Evolução e histórico analítico.

## Arquitetura preservada

```text
React UI
↓
useSigemPwDashboard
↓
sigemPwDashboardAdapter
↓
sigem_pw_dashboard_core.js
↓
workers/sigem_pw_dashboard.worker.js
↓
IndexedDB / histórico existente
```

Continuam preservados:

- ocorrência documental = documento + revisão;
- revisões 0/A/B contam como três ocorrências quando presentes;
- escopo documental = ET e N-1710;
- N-1710 depende do universo válido da LD da Qualidade;
- Consulta Geral SIGEM = registro postado para este módulo;
- fallback PW sem revisão por código continua no Core;
- cinco situações mutuamente exclusivas;
- `classifiedTotal` validado pelo Core;
- troca de classe reutiliza agregados e não reconstrói modelo;
- paginação visual de 100 registros;
- exportação usa toda a lista filtrada;
- XLSX permanece lazy;
- atomicidade, registro de histórico e rollback permanecem no adapter;
- `GrconSigemPwDashboardUi` e seu `state` permanecem compatíveis;
- Worker e `modelGeneration` continuam protegendo a thread principal e resultados atrasados.

## FASE B visual

- [x] `UiPageHeader` reutilizado.
- [x] `UiPanel` reutilizado.
- [x] `UiMetaPill` reutilizado.
- [x] Cabeçalho reorganizado com escopo, chave documental, readiness e total conciliado.
- [x] Ações Evolução, Gerenciar histórico e Exportar lista preservadas com os mesmos IDs.
- [x] Readiness mantém o resultado do Core e ganha hierarquia visual mais clara.
- [x] Bases SIGEM, PW e LD mostram explicitamente estado Carregada/Pendente.
- [x] Edição de data só fica disponível quando a base correspondente existe.
- [x] Cards de totais SIGEM/PW foram reorganizados sem alterar números.
- [x] Cinco situações viraram filtros rápidos clicáveis, usando apenas `setActiveList()`.
- [x] Relação detalhada mostra contagem filtrada e abas com contadores destacados.
- [x] Busca e filtro de classe ganharam rótulos visíveis.
- [x] Tabela mantém as sete colunas da FASE A.
- [x] Cabeçalho da tabela permanece sticky; Classe e Documento ficam fixos durante scroll horizontal.
- [x] Status, revisão e classe usam apresentação compacta sem reinterpretação de conteúdo.
- [x] Paginação anterior/próxima preservada.
- [x] Mobile 390px sem overflow global.
- [x] Breakpoints para 1440/1366/1024/768/390 continuam cobertos pelo Chromium.
- [x] Dark mode preservado.
- [x] `prefers-reduced-motion` tratado.
- [x] Cache do Service Worker versionado.
- [x] CSS corrigido para usar o seletor real `#sigem-pw-dashboard-module` em vez do placeholder literal antigo.

## Fora de escopo

Não alterar nesta fase:

- `sigem_pw_dashboard_core.js`;
- `sigem_pw_readiness_core.js`;
- `sigem_pw_scope_fix.js`;
- Worker do Dashboard;
- Revision Core / Revision UI;
- Evolution Core / Evolution UI;
- histórico analítico avançado;
- regras de matching, revisão, EAP ou classificação;
- estrutura dos snapshots;
- Power Automate / Teams;
- SIGEM Posting;
- regras de eGRDT/GRDT.

## Critério de aceite

A FASE B só pode ser integrada quando:

- TypeScript passa;
- build Vite passa;
- `tests/sigem_pw_react.cjs` passa;
- testes críticos SIGEM × PW passam;
- `npm test` e `npm run verify` passam;
- Chromium específico passa;
- regressões de Consultas, Histórico de análises, Combinar PDFs e Histórico de eGRDTs passam;
- screenshots desktop/mobile/dark são geradas;
- Vercel atual conclui ou o projeto legado é ignorado pelo `ignoreCommand`.
