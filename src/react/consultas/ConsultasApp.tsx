/**
 * GRCON — Composição da tela de Consulta de documentos em React.
 */
import { useCallback, useEffect } from "react";
import { useConsultas } from "./hooks/useConsultas";
import { consultasAdapter } from "./services/consultasAdapter";
import {
  ActionsBar,
  CentralPanel,
  DocumentsPanel,
  FiltersBar,
  LdPanel,
  ProgressBar,
  ResultsTable,
  StepsIndicator,
  SummaryBar,
} from "./components/consultasComponents";

export function ConsultasApp() {
  const c = useConsultas();

  const onPasteClipboard = useCallback(async (setValue: (value: string) => void) => {
    try {
      const texto = await navigator.clipboard.readText();
      if (!texto) { consultasAdapter.notify("A área de transferência está vazia.", "warn"); return; }
      // Paridade com a tela legada: o botão já adiciona os documentos, sem
      // exigir um segundo clique em "Adicionar à lista".
      c.addDocuments(texto);
      setValue("");
    } catch (_error) {
      consultasAdapter.notify("O navegador bloqueou a leitura da área de transferência. Cole no campo acima.", "warn");
    }
  }, [c.addDocuments]);

  const onReuseHint = useCallback(() => {
    consultasAdapter.notify("Selecione o arquivo novamente: o navegador não guarda o conteúdo entre sessões, apenas o nome.", "info");
  }, []);

  const selectionNote = c.selectedCount
    ? `${c.selectedCount.toLocaleString("pt-BR")} de ${c.documents.length.toLocaleString("pt-BR")} selecionado(s)`
    : "";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modulo = document.getElementById("requests-module");
      if (!modulo || modulo.hidden) return;
      const active = document.activeElement;
      const digitando = active instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("#requests-area-consulta-react input[type=search]")?.focus();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !digitando) {
        event.preventDefault();
        void c.runQuery(false);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !digitando) {
        event.preventDefault();
        c.undo();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [c.runQuery, c.undo]);

  return (
    <div id="requests-area-consulta-react">
      <StepsIndicator ldsReady={c.ldsReady} documentsCount={c.documents.length} resultsCount={c.results.size} />
      <LdPanel lds={c.lds} lastLd={c.lastLd} onAddFiles={c.addLds} onRemove={c.removeLd} onClear={c.clearLds} onReuseHint={onReuseHint} />
      <CentralPanel central={c.central} onAttach={c.attachCentral} onClear={c.removeCentral} />
      <DocumentsPanel count={c.documents.length} onAdd={c.addDocuments} onPasteClipboard={onPasteClipboard} />
      <ActionsBar
        canQuery={c.documents.length > 0 && c.indexReady && !c.running}
        hasSelection={c.selectedCount > 0}
        hasDocuments={c.documents.length > 0}
        hasResults={c.results.size > 0}
        canUndo={c.canUndo}
        onRun={c.runQuery}
        onRunSelected={() => c.runQuery(true)}
        onSelectAll={() => c.toggleSelectAll(true)}
        onSelectNone={() => c.toggleSelectAll(false)}
        onDedupe={c.removeDuplicates}
        onCopy={c.copyResults}
        onExport={() => c.exportExcel()}
        onUndo={c.undo}
        onClear={c.clearConsulta}
        selectionNote={selectionNote}
        templates={c.templates}
        selectedTemplateId={c.selectedTemplateId}
        onTemplateChange={c.setSelectedTemplateId}
        lastExport={c.lastExport}
        onRepeat={c.repeatLastExport}
      />
      <section className="requests-results" aria-labelledby="requests-results-title">
        <div className="requests-results-head">
          <h3 id="requests-results-title">Resultado da consulta</h3>
          <FiltersBar
            search={c.search} situation={c.situation} allocation={c.allocation} sort={c.sort}
            onSearch={c.setSearch} onSituation={c.setSituation} onAllocation={c.setAllocation} onSort={c.setSort}
          />
        </div>
        <ProgressBar running={c.running} progress={c.progress} />
        <ResultsTable
          visibleRows={c.visibleRows} hasDocuments={c.documents.length > 0} onToggle={c.toggleSelect}
          onToggleAll={c.toggleSelectAll} allSelected={c.documents.length > 0 && c.selectedCount === c.documents.length}
          someSelected={c.selectedCount > 0} central={c.central}
        />
        <SummaryBar summary={c.summary} />
      </section>
    </div>
  );
}
