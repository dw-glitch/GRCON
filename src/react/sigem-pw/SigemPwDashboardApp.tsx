import { UiMetaPill, UiPanel } from "../core/ui/UiPrimitives";
import { SigemPwHeader } from "./components/SigemPwHeader";
import { SigemPwReadiness } from "./components/SigemPwReadiness";
import { SigemPwBases } from "./components/SigemPwBases";
import { SigemPwSystemsSummary } from "./components/SigemPwSystemsSummary";
import { SigemPwSituationCards } from "./components/SigemPwSituationCards";
import { SigemPwListFilters } from "./components/SigemPwListFilters";
import { SigemPwTable } from "./components/SigemPwTable";
import { SigemPwPager } from "./components/SigemPwPager";
import { SigemPwBaseHistoryDialog } from "./components/SigemPwBaseHistoryDialog";
import { SigemPwBaseDateDialog } from "./components/SigemPwBaseDateDialog";
import { useSigemPwDashboard } from "./hooks/useSigemPwDashboard";
import { SigemPwRevisionSection } from "./revision/SigemPwRevisionSection";
import { SIGEM_PW_LISTS, SIGEM_PW_PAGE_SIZE, type SigemPwDocumentClass, type SigemPwListKey } from "./types/domain";

function fmt(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR");
}

export function SigemPwDashboardApp() {
  const { state, adapter } = useSigemPwDashboard();
  const pageData = adapter.pageRows();
  const activeLabel = SIGEM_PW_LISTS[state.activeList];
  const classifiedTotal = state.result?.summary?.classifiedTotal || 0;
  const loadedBases = [state.sigem.meta, state.pw.meta, state.ld.meta].filter(Boolean).length;

  return (
    <div className="spw-dashboard-shell spw-phase-b">
      <SigemPwHeader
        busy={state.busy}
        classifiedTotal={classifiedTotal}
        ready={Boolean(state.readiness?.ready)}
        onEvolution={() => { void adapter.openEvolution(); }}
        onHistory={() => { void adapter.openHistory(); }}
        onExport={() => { void adapter.exportCurrentList(); }}
      />

      <div className="spw-progress" id="spw-progress" hidden={!state.busy} role="status" aria-live="polite">
        <i aria-hidden="true"></i>
        <span>{state.progressMessage || "Processando base…"}</span>
      </div>

      <SigemPwReadiness readiness={state.readiness} />

      <UiPanel className="spw-section-panel spw-bases-panel" labelledBy="spw-bases-title">
        <div className="spw-section-heading">
          <div>
            <span className="spw-kicker">FONTES DE COMPARAÇÃO</span>
            <h3 id="spw-bases-title">Bases vigentes</h3>
            <p>Atualize apenas a base necessária. A data operacional pode ser ajustada sem alterar a data original de importação.</p>
          </div>
          <UiMetaPill><strong>{loadedBases}/3</strong> carregadas</UiMetaPill>
        </div>
        <SigemPwBases
          state={state}
          onImportSigem={(file) => { void adapter.importSigem(file); }}
          onImportPw={(file) => { void adapter.importPw(file); }}
          onImportLd={(file) => { void adapter.importLd(file); }}
          onEditDate={(system) => adapter.openBaseDateEditor(system)}
        />
      </UiPanel>

      <UiPanel className="spw-section-panel spw-overview-panel" labelledBy="spw-overview-title">
        <div className="spw-section-heading">
          <div>
            <span className="spw-kicker">VISÃO CONSOLIDADA</span>
            <h3 id="spw-overview-title">Totais e pendências operacionais</h3>
            <p>Os totais usam a mesma agregação do Core. Cada ocorrência entra em uma única situação operacional.</p>
          </div>
          {classifiedTotal > 0 ? <UiMetaPill><strong>{fmt(classifiedTotal)}</strong> classificados</UiMetaPill> : null}
        </div>
        <SigemPwSystemsSummary state={state} />
        <SigemPwSituationCards
          state={state}
          activeList={state.activeList}
          onSelect={(list) => adapter.setActiveList(list)}
        />
      </UiPanel>

      <UiPanel className="spw-list-card" labelledBy="spw-list-title">
        <header className="spw-list-head">
          <div>
            <span className="spw-kicker">RELAÇÃO DETALHADA</span>
            <strong id="spw-list-title">{activeLabel}</strong>
            <small>Pesquise, filtre por classe e navegue pela lista sem alterar o modelo conciliado.</small>
          </div>
          <UiMetaPill><strong>{fmt(pageData.rows.length)}</strong> registro(s)</UiMetaPill>
        </header>

        <div className="spw-list-tabs" id="spw-list-tabs" role="tablist" aria-label="Situações da relação detalhada">
          {(Object.entries(SIGEM_PW_LISTS) as Array<[SigemPwListKey, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={state.activeList === key}
              data-list={key}
              className={state.activeList === key ? "active" : ""}
              onClick={() => adapter.setActiveList(key)}
            >
              <span>{label}</span>
              <strong>{fmt(state.result?.lists?.[key]?.length || 0)}</strong>
            </button>
          ))}
        </div>

        <SigemPwListFilters
          query={state.filters.query}
          documentClass={state.filters.documentClass}
          busy={state.busy}
          onQuery={(value) => adapter.setQuery(value)}
          onClass={(value: SigemPwDocumentClass) => adapter.setDocumentClass(value)}
          onClear={() => adapter.clearFilters()}
        />
        <SigemPwTable rows={pageData.visible} caption={activeLabel} />
        <SigemPwPager
          page={state.page}
          pages={pageData.pages}
          total={pageData.rows.length}
          start={pageData.start}
          pageSize={SIGEM_PW_PAGE_SIZE}
          onPage={(page) => adapter.setPage(page)}
        />
      </UiPanel>

      <SigemPwRevisionSection />

      <SigemPwBaseHistoryDialog
        state={state}
        onClose={() => adapter.closeHistory()}
        onEdit={(kind, id) => adapter.openBaseDateEditor(kind, id)}
        onDelete={(id) => { void adapter.removeSnapshot(id); }}
      />
      <SigemPwBaseDateDialog
        state={state}
        onClose={() => adapter.closeBaseDateEditor()}
        onChange={(value) => adapter.setBaseDateValue(value)}
        onSave={() => { void adapter.saveBaseDate(); }}
      />
    </div>
  );
}
