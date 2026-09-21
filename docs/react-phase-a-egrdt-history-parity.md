# FASE A — paridade do Histórico de eGRDTs

Baseline inventariada antes da remoção de `history_app.js`.

## Fonte da verdade preservada
- `history_core.js`: leitura, filtros, famílias, número, exclusão e resumo.
- `history_report.js`: relação de revisões, linhas e workbook.
- `history_report_worker.js`: geração do relatório fora da thread principal.
- `sigem_posting_core.js`: fila/status/auditoria da postagem.
- `macro5_flow_core.js`: tom e etapas do fluxo.
- `GrconCloud`: permissões e exclusão/limpeza compartilhada.

## Filtros
- busca textual por eGRDT, documentos, alocação, arquivos, revisão, status, disciplina e demais campos indexados pelo Core;
- debounce de 120 ms;
- ano derivado dos registros;
- tipo de saída derivado dos registros;
- status de postagem: AGUARDANDO, GERADO, VALIDADO, PRONTO, POSTADO, PENDENCIA, FALHA e CANCELADO;
- ordenação: recentes, antigas, maior número, menor número;
- data inicial/final, com bloqueio quando fim < início;
- família documental: Todos, N-1710, ET e CV via `GrconHistory.filterByDocumentFamily`.

## Resumo
- eGRDTs localizadas;
- documentos registrados;
- alocações relacionadas;
- aguardando SIGEM;
- postadas;
- pendências/falhas.

## Lista e seleção
- limite inicial 200;
- Mostrar mais em lotes de 200;
- `filtered` representa o conjunto completo filtrado;
- seleção acompanha filtro/reload;
- registro selecionado abre detalhe.

## Detalhe
- número, data/hora, tipo de saída, criador, status, documentos e arquivos;
- LD, origem, alocação e números anteriores;
- fluxo de postagem vindo de `GrconMacro5Flow.workflowSteps`;
- badge via `GrconSigemPosting.statusLabel` + `GrconMacro5Flow.postingTone`.

## Ações
- Preparar no SIGEM: `registerGenerated`, aguarda persistência, abre SIGEM, seleciona posting e emite `grcon:sigem-updated`;
- Teams: abertura manual via `GrconEgrdtTeamsNotification.open(record)`, sem alterar payload/webhook;
- Resposta de e-mail: `GrconEgrdtEmailReplyUi.open([record])`;
- Editar número: somente coleta valor e chama `GrconHistory.updateNumber`; sincroniza sequência e emite `grcon:history-updated`;
- Excluir: Cloud primeiro quando compartilhado, local somente depois;
- Limpar histórico: Cloud quando compartilhado; `History.clear()` quando local.

## Documentos
Colunas preservadas:
1. Documento
2. Arquivo original
3. Arquivo enviado
4. Revisão gerada na GRDT
5. Revisão desta GRDT postada
6. Outra revisão postada
7. Situação na geração
8. Alocação
9. Versão da LD enviada
10. Aba LD

Também preservados:
- `revisionManual` e `revisionSuggested`;
- snapshot SIGEM histórico;
- `ldPrazo` como Versão da LD enviada;
- alocação sem simplificação;
- relação `nt-` delegada ao Report/Core.

## Relatório
- exporta o conjunto filtrado completo, não somente os visíveis;
- Worker primeiro, fallback para `HistoryReport.buildWorkbook`;
- abas Resumo, eGRDTs e Documentos;
- Blob/Object URL centralizados no adapter, com revoke.

## Eventos
A ilha reage, com cleanup, a:
- `grcon:history-updated`;
- `grcon:egrdt-teams-state`;
- `grcon:egrdt-teams-notified`;
- `grcon:sigem-updated`;
- `storage` para `GrconHistory.STORAGE_KEY`.

## Contrato global
Preservar:
- `GrconHistoryUi.state.selectedId`;
- `GrconHistoryUi.state.filtered`;
- `GrconHistoryUi.render()`;
- `GrconHistoryUi.activate(view)`;
- `GrconHistoryUi.select(id)`;
- `GrconHistoryUi.performanceSnapshot()`.

## Performance
- uma leitura de `Posting.read()` por refresh;
- índices `postingByHistoryId`, `postingById`, `postingByEgrdt`;
- lookup O(1);
- 200 registros por lote;
- debounce 120 ms;
- sem duplicar registros entre arrays profundos.

## Visual
FASE A somente: preservar classes, hierarquia e comportamento responsivo/dark mode existentes. Redesign fica para FASE B.
