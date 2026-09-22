# FASE B — Situação das Revisões SIGEM × PW

Escopo: modernização visual e UX da seção React de Revisões, sem alterar Core, matching, contagens, situações, análise, facade ou exportação.

Baseline funcional: PR #125 / commit `9fbf7b7be2c5cb1762b75f3a3ba0e40094a54f90`.
Baseline visual/performance: artefato `sigem-pw-revision-react-phase-a` do workflow `35742269130`.

## Paridade funcional

- [ ] 5 cards preservam as mesmas contagens.
- [ ] Clique no card aplica a situação e segundo clique retorna a `attention`.
- [ ] Dropdown preserva `PW em revisão posterior` e `Requer análise`.
- [ ] Classe ET e N-1710 preservadas.
- [ ] Rev. SIGEM, Rev. PW, Status SIGEM e Status PW preservados.
- [ ] Busca textual preserva `rawSearch` + debounce de 180 ms.
- [ ] Pesquisa em lote continua delegando parsing ao Core.
- [ ] Limpar filtros restaura `EMPTY_REVISION_FILTERS()`.
- [ ] PAGE_SIZE continua 100.
- [ ] Detalhe órfão é limpo ao filtrar ou mudar de página.
- [ ] Exportação inclui todo o resultado filtrado, não apenas a página.
- [ ] Exportação imediata usa `exportFiltersSnapshot()` com texto cru.
- [ ] Feedback de exportação mantém `aria-live`.

## UX / visual

- [ ] Header alinhado ao Dashboard FASE B e mostra documentos comparáveis reais.
- [ ] Cards mais baixos e consistentes, inclusive para valores muito diferentes.
- [ ] Card ativo possui estado visual inequívoco e `aria-pressed`.
- [ ] Busca é o principal controle.
- [ ] Situação e Classe permanecem sempre visíveis.
- [ ] Filtros avançados ficam agrupados em `<details>`.
- [ ] Filtros avançados ativos são perceptíveis quando recolhidos.
- [ ] Pesquisa em lote deixa de dominar a altura inicial.
- [ ] Resumo da tabela prioriza quantidade + faixa visível.
- [ ] Exportar Excel é ação secundária.
- [ ] Nove colunas permanecem disponíveis.
- [ ] Documento recebe maior hierarquia.
- [ ] Comparação SIGEM → PW fica legível sem mudar dado.
- [ ] Status usam badges discretos com valores reais.
- [ ] Header da tabela é sticky.
- [ ] Tabela usa scroll horizontal local e não cria overflow global.
- [ ] Há indicação visual de conteúdo lateral em tablet/mobile.
- [ ] Detalhe mantém SIGEM, ProjectWise e diagnóstico.
- [ ] Histórico de revisões usa pills não interativas.
- [ ] Diagnóstico destaca `reason` e preserva metadados.
- [ ] Progresso usa `done/total` reais e não bloqueia a seção inteira.
- [ ] Estado sem base é distinto do filtro sem resultado.
- [ ] Dark mode é consistente.
- [ ] Touch targets e focus visible são adequados.

## Responsividade

- [ ] 1440 px sem overflow horizontal global.
- [ ] 1366 px sem overflow horizontal global.
- [ ] 1024 px sem overflow horizontal global.
- [ ] 768 px sem overflow horizontal global.
- [ ] 390 px sem overflow horizontal global.
- [ ] Em 390 px os cards continuam em grid compacto, sem cinco cards full-width.
- [ ] Em 390 px filtros avançados permanecem recolhidos por padrão.
- [ ] Altura inicial da seção em 390 px é menor que o baseline medido.

## Arquitetura

- [ ] `sigem_pw_revision_core.js` não foi alterado.
- [ ] `GrconSigemPwRevision.analyzeAsync()` não foi alterado.
- [ ] generation/cancelamento preservados.
- [ ] `GrconSigemPwRevisionUi` preservada.
- [ ] History Management continua chamando `RevisionUi().refresh()`.
- [ ] Evolução permanece legada e sem alteração visual.
- [ ] Histórico analítico permanece legado e sem alteração visual.
- [ ] Nenhuma biblioteca visual pesada adicionada.
- [ ] ExcelJS/XLSX permanecem fora do bundle React e lazy.

## Validação

- [ ] `npm ci --ignore-scripts`.
- [ ] `npm run typecheck`.
- [ ] `npm run build`.
- [ ] `npm test`.
- [ ] `npm run verify`.
- [ ] Testes de Revisões.
- [ ] 15.000 documentos / chunks responsivos.
- [ ] Dashboard até 50 mil.
- [ ] Exportação de 250 registros.
- [ ] Exportação real de 15.050 registros.
- [ ] Exportação antes do debounce.
- [ ] History Management.
- [ ] Evolução.
- [ ] Histórico analítico.
- [ ] Consultas Chromium.
- [ ] Histórico de análises Chromium.
- [ ] Combinar PDFs Chromium.
- [ ] Histórico de eGRDTs Chromium.
- [ ] PWA/SW cold, warm, reload e upgrade.
- [ ] Preview Vercel validado em 1366 e 390.

## Screenshots obrigatórios

- [ ] 01-revision-empty-1366.png
- [ ] 02-revision-overview-1366.png
- [ ] 03-revision-filters-1366.png
- [ ] 04-revision-filter-active-1366.png
- [ ] 05-revision-detail-1366.png
- [ ] 06-revision-page2-1366.png
- [ ] 07-revision-processing-1366.png
- [ ] 08-revision-export-success-1366.png
- [ ] 09-revision-mobile-overview-390.png
- [ ] 10-revision-mobile-filters-390.png
- [ ] 11-revision-mobile-detail-390.png
- [ ] 12-revision-dark-1366.png
- [ ] 13-revision-dark-390.png
