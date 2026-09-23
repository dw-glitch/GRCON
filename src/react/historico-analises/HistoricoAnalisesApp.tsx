import { UiPanel } from "../core/ui/UiPrimitives";
import { historicoAnalisesAdapter as Adapter } from "./services/historicoAnalisesAdapter";
import { useHistoricoAnalises } from "./hooks/useHistoricoAnalises";
import {
  DetailPanel,
  HistoryFilters,
  HistoryHeader,
  QuickAndSavedFilters,
  ResultsCard,
  SummaryCards,
  UnifiedSearch,
} from "./components/HistoricoAnalisesComponents";

export function HistoricoAnalisesApp() {
  const h = useHistoricoAnalises();
  const allDocumentsCount = h.sessions.reduce((total, session) => total + Number(session.total || 0), 0);

  return (
    <div className="analysis-history-phase-b">
      <HistoryHeader
        sessionsCount={h.sessions.length}
        documentsCount={h.total}
        canDeleteSession={Boolean(h.filters.sessionId)}
        onBackup={() => { void h.backup(); }}
        onRestore={h.restore}
        onDeleteSession={() => { void h.deleteSelectedSession(); }}
        onClear={() => { void h.clearAll(); }}
      />

      <UnifiedSearch
        value={h.unifiedText}
        result={h.unifiedResult}
        onChange={h.setUnifiedText}
        onSearch={() => { void h.runUnifiedSearch(); }}
        onClear={h.clearUnifiedSearch}
      />

      <UiPanel className="analysis-history-filter-panel" labelledBy="analysis-history-filter-title">
        <div className="analysis-history-section-heading">
          <div>
            <span>BUSCA / FILTROS</span>
            <h3 id="analysis-history-filter-title">Localizar análises</h3>
            <p>Refine por texto, situação, período ou execução sem perder o contexto do histórico.</p>
          </div>
        </div>

        <HistoryFilters
          filters={h.filters}
          sessions={h.sessions}
          periodInvalid={h.periodInvalid}
          onFilter={h.setFilter}
        />

        <QuickAndSavedFilters
          filters={h.filters}
          savedFilters={h.savedFilters}
          selectedId={h.selectedSavedFilterId}
          onQuick={h.applyQuickFilter}
          onSelectSaved={h.loadSavedFilter}
          onSave={h.saveCurrentFilter}
          onDelete={h.deleteSavedFilter}
        />
      </UiPanel>

      <SummaryCards
        summary={h.summary}
        activeStatus={h.filters.status}
        onStatus={(status) => h.setFilter("status", status)}
      />

      <ResultsCard
        rows={h.rows}
        total={h.total}
        allTotal={allDocumentsCount}
        filters={h.filters}
        page={h.page}
        pages={h.pages}
        loading={h.loading}
        error={h.loadError}
        storageLabel={h.storageLabel}
        exporting={h.exporting}
        periodInvalid={h.periodInvalid}
        hasReport={Adapter.hasReport()}
        hasPeriod={Boolean(h.filters.startDate || h.filters.endDate)}
        onOpen={h.openDetail}
        onPrevious={() => h.setPage((value: number) => Math.max(1, value - 1))}
        onNext={() => h.setPage((value: number) => Math.min(h.pages, value + 1))}
        onExport={() => { void h.exportExcel(); }}
      />

      <DetailPanel
        detail={h.detail}
        onClose={h.closeDetail}
        onRelated={(id, prepareSigem) => { void h.openRelatedHistory(id, prepareSigem); }}
      />
    </div>
  );
}
