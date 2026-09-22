# FASE B — Situação das Revisões SIGEM × PW

Escopo: modernização visual e UX da seção React de Revisões, sem alterar Core, matching, contagens, situações, análise, facade ou exportação.

Baseline funcional: PR #125 / commit `9fbf7b7be2c5cb1762b75f3a3ba0e40094a54f90`.
Baseline visual/performance: artefato `sigem-pw-revision-react-phase-a` do workflow `35742269130`.

## Paridade funcional

- [x] 5 cards preservam as mesmas contagens.
- [x] Clique no card aplica a situação e segundo clique retorna a `attention`.
- [x] Dropdown preserva `PW em revisão posterior` e `Requer análise`.
- [x] Classe ET e N-1710 preservadas.
- [x] Rev. SIGEM, Rev. PW, Status SIGEM e Status PW preservados.
- [x] Busca textual preserva `rawSearch` + debounce de 180 ms.
- [x] Pesquisa em lote continua delegando parsing ao Core.
- [x] Limpar filtros restaura `EMPTY_REVISION_FILTERS()`.
- [x] PAGE_SIZE continua 100.
- [x] Detalhe órfão é limpo ao filtrar ou mudar de página.
- [x] Exportação inclui todo o resultado filtrado, não apenas a página.
- [x] Exportação imediata usa `exportFiltersSnapshot()` com texto cru.
- [x] Feedback de exportação mantém `aria-live`.

## UX / visual

- [x] Header alinhado ao Dashboard FASE B e mostra documentos comparáveis reais.
- [x] Cards mais baixos e consistentes, inclusive para valores muito diferentes.
- [x] Card ativo possui estado visual inequívoco e `aria-pressed`.
- [x] Busca é o principal controle.
- [x] Situação e Classe permanecem sempre visíveis.
- [x] Filtros avançados ficam agrupados em `<details>`.
- [x] Filtros avançados ativos são perceptíveis quando recolhidos.
- [x] Pesquisa em lote deixa de dominar a altura inicial.
- [x] Resumo da tabela prioriza quantidade + faixa visível.
- [x] Exportar Excel é ação secundária.
- [x] Nove colunas permanecem disponíveis.
- [x] Documento recebe maior hierarquia.
- [x] Comparação SIGEM → PW fica legível sem mudar dado.
- [x] Status usam badges discretos com valores reais.
- [x] Header da tabela é sticky.
- [x] Tabela usa scroll horizontal local e não cria overflow global.
- [x] Há indicação visual de conteúdo lateral em tablet/mobile.
- [x] Detalhe mantém SIGEM, ProjectWise e diagnóstico.
- [x] Histórico de revisões usa pills não interativas.
- [x] Diagnóstico destaca `reason` e preserva metadados.
- [x] Progresso usa `done/total` reais e não bloqueia a seção inteira.
- [x] Estado sem base é distinto do filtro sem resultado.
- [x] Dark mode é consistente.
- [x] Touch targets e focus visible são adequados.

## Responsividade

- [x] 1440 px sem overflow horizontal global.
- [x] 1366 px sem overflow horizontal global.
- [x] 1024 px sem overflow horizontal global.
- [x] 768 px sem overflow horizontal global.
- [x] 390 px sem overflow horizontal global.
- [x] Em 390 px os cards continuam em grid compacto, sem cinco cards full-width.
- [x] Em 390 px filtros avançados permanecem recolhidos por padrão.
- [x] Altura inicial da seção em 390 px é menor que o baseline medido.

## Arquitetura

- [x] `sigem_pw_revision_core.js` não foi alterado.
- [x] `GrconSigemPwRevision.analyzeAsync()` não foi alterado.
- [x] generation/cancelamento preservados.
- [x] `GrconSigemPwRevisionUi` preservada.
- [x] History Management continua chamando `RevisionUi().refresh()`.
- [x] Evolução permanece legada e sem alteração visual.
- [x] Histórico analítico permanece legado e sem alteração visual.
- [x] Nenhuma biblioteca visual pesada adicionada.
- [x] ExcelJS/XLSX permanecem fora do bundle React e lazy.

## Validação

- [x] `npm ci --ignore-scripts`.
- [x] `npm run typecheck`.
- [x] `npm run build`.
- [x] `npm test`.
- [x] `npm run verify`.
- [x] Testes de Revisões.
- [x] 15.000 documentos / chunks responsivos.
- [x] Dashboard até 50 mil.
- [x] Exportação de 250 registros.
- [x] Exportação real de 15.050 registros.
- [x] Exportação antes do debounce.
- [x] History Management.
- [x] Evolução.
- [x] Histórico analítico.
- [x] Consultas Chromium.
- [x] Histórico de análises Chromium.
- [x] Combinar PDFs Chromium.
- [x] Histórico de eGRDTs Chromium.
- [x] PWA/SW cold, warm, reload e upgrade.
- [ ] Preview Vercel validado em 1366 e 390. — **NÃO EXECUTADO**: deployment Vercel `READY` no commit `a996e2a`, porém a abertura interativa do Preview foi bloqueada pelo ambiente (`ERR_BLOCKED_BY_ADMINISTRATOR`) mesmo após gerar acesso temporário autorizado.

## Screenshots obrigatórios

- [x] 01-revision-empty-1366.png
- [x] 02-revision-overview-1366.png
- [x] 03-revision-filters-1366.png
- [x] 04-revision-filter-active-1366.png
- [x] 05-revision-detail-1366.png
- [x] 06-revision-page2-1366.png
- [x] 07-revision-processing-1366.png
- [x] 08-revision-export-success-1366.png
- [x] 09-revision-mobile-overview-390.png
- [x] 10-revision-mobile-filters-390.png
- [x] 11-revision-mobile-detail-390.png
- [x] 12-revision-dark-1366.png
- [x] 13-revision-dark-390.png


## Evidências finais da FASE B

- Workflow: `SIGEM × PW — Revisões React FASE B`, run `35766401045` — PASS.
- Artefato final: `sigem-pw-revision-react-phase-b`, artifact `10712198529`.
- 13 screenshots obrigatórios presentes e inspecionados.
- Altura inicial da seção em 390 px: `2010.640625 px → 1399.34375 px` (`-30,4%`).
- Sem overflow horizontal global em 1440, 1366, 1024, 768 e 390 px.
- Performance Chromium: activation `23 ms`; analysis `1,3 ms`; filter `49 ms`; search `230 ms`; page `97 ms`; export `339 ms`; expand `35 ms`.
- 15.000 documentos: análise async `149,9 ms`; chunk máximo `3,9 ms`.
- Exportação real de `15.050` registros: PASS.
- Exportação Chromium de `250` registros com `100` visíveis por página: PASS.
- Exportação imediata antes do debounce usando o texto cru atual: PASS.
- Bundle SIGEM × PW: `210446 B` / `64617 B gzip`; baseline aproximado `206,1 kB` / `63,9 kB gzip`.
- ExcelJS/XLSX permanecem fora do bundle React inicial.
- PWA/SW: cold, warm, reload e upgrade — PASS.
- Core de revisões não aparece entre os arquivos alterados da PR.
- Evolução e Histórico analítico permanecem fora do escopo visual desta PR.
- Preview Vercel: deployment `READY` para o mesmo commit; inspeção interativa externa ainda NÃO EXECUTADA por bloqueio administrativo do ambiente.
