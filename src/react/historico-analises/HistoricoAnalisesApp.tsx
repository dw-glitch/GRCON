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

  return (
    <>
      <HistoryHeader
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

      <HistoryFilters
        filters={h.filters}
        sessions={h.sessions}
        periodInvalid={h.periodInvalid}
        onFilter={h.setFilter}
      />

      <QuickAndSavedFilters
        savedFilters={h.savedFilters}
        selectedId={h.selectedSavedFilterId}
        onQuick={h.applyQuickFilter}
        onSelectSaved={h.loadSavedFilter}
        onSave={h.saveCurrentFilter}
        onDelete={h.deleteSavedFilter}
      />

      <SummaryCards summary={h.summary} />

      <ResultsCard
        rows={h.rows}
        total={h.total}
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
    </>
  );
}
