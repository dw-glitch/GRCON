/**
 * GRCON — Composição da tela de Consulta de documentos em React.
 * FASE B: hierarquia visual e fluxo operacional; domínio permanece no adapter.
 */
import { useCallback } from "react";
import { UiPageHeader, UiPanel } from "../core/ui/UiPrimitives";
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
      if (!texto) {
        consultasAdapter.notify("A área de transferência está vazia.", "warn");
        return;
      }
      setValue(texto);
    } catch (_error) {
      consultasAdapter.notify("O navegador bloqueou a leitura da área de transferência. Cole no campo acima.", "warn");
    }
  }, []);

  const onReuseHint = useCallback(() => {
    consultasAdapter.notify("Selecione o arquivo novamente: o navegador não guarda o conteúdo entre sessões, apenas o nome.", "info");
  }, []);

  const selectionNote = c.selectedCount
    ? `${c.selectedCount.toLocaleString("pt-BR")} de ${c.documents.length.toLocaleString("pt-BR")} selecionado(s)`
    : "";

  const setupReady = c.ldsReady > 0 && c.documents.length > 0;
  const filterKey = [c.search, c.situation, c.allocation, c.sort].join("|");

  const clearFilters = useCallback(() => {
    c.setSearch("");
    c.setSituation("");
    c.setAllocation("");
  }, [c.setSearch, c.setSituation, c.setAllocation]);

  return (
    <div id="requests-area-consulta-react">
      <UiPageHeader
        eyebrow="Gestão e conferência documental"
        title="Consulta de documentos"
        description="Cruze os documentos informados com as LDs, acompanhe o resultado essencial na tabela e abra as evidências completas somente quando precisar."
        meta={(
          <div className="requests-context-meta">
            <span className="ui-meta-pill"><strong>{c.ldsReady.toLocaleString("pt-BR")}</strong> LD(s) válida(s)</span>
            <span className="ui-meta-pill"><strong>{c.documents.length.toLocaleString("pt-BR")}</strong> documento(s)</span>
            {c.results.size
              ? <span className="ui-meta-pill"><strong>{c.results.size.toLocaleString("pt-BR")}</strong> consultado(s)</span>
              : null}
          </div>
        )}
      />

      <StepsIndicator
        ldsReady={c.ldsReady}
        documentsCount={c.documents.length}
        resultsCount={c.results.size}
        compact={setupReady || c.results.size > 0}
      />

      <div className="requests-setup-layout" aria-label="Preparação da consulta">
        <LdPanel
          lds={c.lds}
          readyCount={c.ldsReady}
          lastLd={c.lastLd}
          onAddFiles={c.addLds}
          onRemove={c.removeLd}
          onClear={c.clearLds}
          onReuseHint={onReuseHint}
        />
        <DocumentsPanel
          count={c.documents.length}
          onAdd={c.addDocuments}
          onPasteClipboard={onPasteClipboard}
        />
        <CentralPanel central={c.central} onAttach={c.attachCentral} onClear={c.removeCentral} />
      </div>

      <ActionsBar
        canQuery={c.documents.length > 0 && c.indexReady && !c.running}
        hasSelection={c.selectedCount > 0}
        hasDocuments={c.documents.length > 0}
        hasResults={c.results.size > 0}
        canUndo={c.canUndo}
        selectedCount={c.selectedCount}
        documentsCount={c.documents.length}
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

      <UiPanel className="requests-results-panel" labelledBy="requests-results-title">
        <div className="requests-results-intro">
          <div>
            <h3 id="requests-results-title">Resultado da consulta</h3>
            <p>Status e campos operacionais ficam visíveis; histórico e evidências estão em “Detalhes”.</p>
          </div>
        </div>

        <SummaryBar
          summary={c.summary}
          activeSituation={c.situation}
          onFilter={c.setSituation}
        />

        <FiltersBar
          search={c.search}
          situation={c.situation}
          allocation={c.allocation}
          sort={c.sort}
          totalCount={c.documents.length}
          shownCount={c.visibleRows.length}
          onSearch={c.setSearch}
          onSituation={c.setSituation}
          onAllocation={c.setAllocation}
          onSort={c.setSort}
          onClear={clearFilters}
        />

        <ProgressBar running={c.running} progress={c.progress} />

        <ResultsTable
          visibleRows={c.visibleRows}
          hasDocuments={c.documents.length > 0}
          onToggle={c.toggleSelect}
          onToggleAll={c.toggleSelectAll}
          allSelected={c.documents.length > 0 && c.selectedCount === c.documents.length}
          someSelected={c.selectedCount > 0}
          central={c.central}
          filterKey={filterKey}
        />
      </UiPanel>
    </div>
  );
}
