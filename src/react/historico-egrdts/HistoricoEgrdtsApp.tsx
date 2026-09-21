import { HistoricoEgrdtDetail } from "./components/HistoricoEgrdtDetail";
import { HistoricoEgrdtsFilters } from "./components/HistoricoEgrdtsFilters";
import { HistoricoEgrdtsList } from "./components/HistoricoEgrdtsList";
import { HistoricoEgrdtsSummary } from "./components/HistoricoEgrdtsSummary";
import { useHistoricoEgrdts } from "./hooks/useHistoricoEgrdts";

export function HistoricoEgrdtsApp() {
  const history = useHistoricoEgrdts();

  return (
    <>
      <header className="history-heading">
        <div>
          <span>{history.historyHeaderCopy.eyebrow}</span>
          <h2 id="history-title">eGRDTs geradas pelo GRCON</h2>
          <p>{history.historyHeaderCopy.description}</p>
        </div>
        <button
          className="secondary-button history-clear-button"
          id="history-clear"
          type="button"
          hidden={history.clearControl.hidden}
          disabled={history.clearControl.disabled}
          title={history.clearControl.title}
          onClick={() => void history.clearAll()}
        >
          Limpar histórico
        </button>
      </header>

      <HistoricoEgrdtsFilters
        filters={history.filters}
        searchInput={history.searchInput}
        years={history.years}
        outputTypes={history.outputTypes}
        postingStatusOptions={history.postingStatusOptions}
        exporting={history.exporting}
        periodValid={history.periodValid}
        periodStatus={history.periodStatus}
        resultCount={history.filtered.length}
        onSearchInput={history.setSearchInput}
        onFilter={history.setFilter}
        onExport={() => void history.exportPeriod()}
      />

      <HistoricoEgrdtsSummary summary={history.summary} />

      <div className="history-workspace">
        <HistoricoEgrdtsList
          visibleRecords={history.visibleRecords}
          totalFiltered={history.filtered.length}
          visibleLimit={history.visibleLimit}
          selectedId={history.selectedId}
          postingIndexes={history.postingIndexes}
          onSelect={history.select}
          onLoadMore={history.loadMore}
        />

        <section aria-live="polite" className="history-detail" id="history-detail">
          <HistoricoEgrdtDetail
            record={history.selectedRecord}
            postings={history.postings}
            postingIndexes={history.postingIndexes}
            editing={history.editingId === history.selectedId && Boolean(history.selectedRecord)}
            canDelete={history.canDelete}
            numberEditScope={history.numberEditScope}
            onPrepareSigem={() => void history.prepareForSigem()}
            onTeams={history.openTeams}
            onEmailReply={history.openEmailReply}
            onBeginEdit={history.beginEdit}
            onCancelEdit={history.cancelEdit}
            onSaveNumber={history.saveNumber}
            onDelete={() => void history.deleteSelected()}
          />
        </section>
      </div>
    </>
  );
}
