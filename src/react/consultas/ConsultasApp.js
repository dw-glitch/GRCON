/**
 * GRCON — Composição da tela de Consulta de documentos em React.
 */
(function (root) {
  "use strict";

  const React = root.React;
  const h = React.createElement;
  const useConsultas = root.GrconConsultasHooks.useConsultas;
  const {
    StepsIndicator, LdPanel, CentralPanel, DocumentsPanel, ActionsBar, FiltersBar, ProgressBar, ResultsTable, SummaryBar,
  } = root.GrconConsultasComponents;
  const Adapter = root.GrconConsultasAdapter;

  function ConsultasApp() {
    const c = useConsultas();

    const onPasteClipboard = React.useCallback(async (setValue) => {
      try {
        const texto = await navigator.clipboard.readText();
        if (!texto) { Adapter.notify("A área de transferência está vazia.", "warn"); return; }
        setValue(texto);
      } catch (_error) {
        Adapter.notify("O navegador bloqueou a leitura da área de transferência. Cole no campo acima.", "warn");
      }
    }, []);

    const onReuseHint = React.useCallback(() => {
      Adapter.notify("Selecione o arquivo novamente: o navegador não guarda o conteúdo entre sessões, apenas o nome.", "info");
    }, []);

    const selectionNote = c.selectedCount
      ? `${c.selectedCount.toLocaleString("pt-BR")} de ${c.documents.length.toLocaleString("pt-BR")} selecionado(s)`
      : "";

    return h("div", { id: "requests-area-consulta-react" },
      h(StepsIndicator, { ldsReady: c.ldsReady, documentsCount: c.documents.length, resultsCount: c.results.size }),
      h(LdPanel, { lds: c.lds, lastLd: c.lastLd, onAddFiles: c.addLds, onRemove: c.removeLd, onClear: c.clearLds, onReuseHint }),
      h(CentralPanel, { central: c.central, onAttach: c.attachCentral, onClear: c.removeCentral }),
      h(DocumentsPanel, { count: c.documents.length, onAdd: c.addDocuments, onPasteClipboard }),
      h(ActionsBar, {
        canQuery: c.documents.length > 0 && c.indexReady && !c.running,
        hasSelection: c.selectedCount > 0,
        hasDocuments: c.documents.length > 0,
        hasResults: c.results.size > 0,
        canUndo: c.canUndo,
        onRun: c.runQuery,
        onRunSelected: () => c.runQuery(true),
        onSelectAll: () => c.toggleSelectAll(true),
        onSelectNone: () => c.toggleSelectAll(false),
        onDedupe: c.removeDuplicates,
        onCopy: c.copyResults,
        onExport: () => c.exportExcel(),
        onUndo: c.undo,
        onClear: c.clearConsulta,
        selectionNote,
        templates: c.templates,
        selectedTemplateId: c.selectedTemplateId,
        onTemplateChange: c.setSelectedTemplateId,
        lastExport: c.lastExport,
        onRepeat: c.repeatLastExport,
      }),
      h("section", { className: "requests-results", "aria-labelledby": "requests-results-title" },
        h("div", { className: "requests-results-head" },
          h("h3", { id: "requests-results-title" }, "Resultado da consulta"),
          h(FiltersBar, {
            search: c.search, situation: c.situation, allocation: c.allocation, sort: c.sort,
            onSearch: c.setSearch, onSituation: c.setSituation, onAllocation: c.setAllocation, onSort: c.setSort,
          })),
        h(ProgressBar, { running: c.running, progress: c.progress }),
        h(ResultsTable, {
          visibleRows: c.visibleRows, hasDocuments: c.documents.length > 0, onToggle: c.toggleSelect,
          onToggleAll: c.toggleSelectAll, allSelected: c.documents.length > 0 && c.selectedCount === c.documents.length,
          someSelected: c.selectedCount > 0, central: c.central,
        }),
        h(SummaryBar, { summary: c.summary })));
  }

  root.GrconConsultasApp = ConsultasApp;
})(window);
