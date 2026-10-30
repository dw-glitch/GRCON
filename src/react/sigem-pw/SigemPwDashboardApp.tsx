import { useMemo } from "react";
import { UiMetaPill, UiPanel } from "../core/ui/UiPrimitives";
import { SigemPwHeader } from "./components/SigemPwHeader";
import { SigemPwReadiness } from "./components/SigemPwReadiness";
import { SigemPwAnalysisSources } from "./components/SigemPwAnalysisSources";
import { SigemPwBases } from "./components/SigemPwBases";
import { SigemPwSystemsSummary } from "./components/SigemPwSystemsSummary";
import { SigemPwManagerialOverview } from "./components/SigemPwManagerialOverview";
import { SigemPwRevisionScopeSelector } from "./components/SigemPwRevisionScopeSelector";
import { SigemPwSituationCards } from "./components/SigemPwSituationCards";
import { SigemPwListFilters } from "./components/SigemPwListFilters";
import { SigemPwTable } from "./components/SigemPwTable";
import { SigemPwPager } from "./components/SigemPwPager";
import { SigemPwBaseHistoryDialog } from "./components/SigemPwBaseHistoryDialog";
import { SigemPwBaseDateDialog } from "./components/SigemPwBaseDateDialog";
import { useSigemPwDashboard } from "./hooks/useSigemPwDashboard";
import { SigemPwRevisionSection } from "./revision/SigemPwRevisionSection";
import { SigemPwOutOfScope } from "./components/SigemPwOutOfScope";
import { SIGEM_PW_LISTS, SIGEM_PW_PAGE_SIZE, type SigemPwDocumentClass, type SigemPwListKey } from "./types/domain";

function fmt(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR");
}

export function SigemPwDashboardApp() {
  const { state, adapter } = useSigemPwDashboard();
  const pageData = adapter.pageRows();
  const activeLabel = SIGEM_PW_LISTS[state.activeList];
  const sigemStatusOptions = useMemo(() => [...new Set((state.result?.lists?.[state.activeList] || []).map(row => row.sigemStatus).filter(Boolean))].sort(), [state.result, state.activeList]);
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
        onCoordinatorExport={() => { void adapter.exportCoordinatorWorkbook(); }}
      />

      <div className="spw-progress" id="spw-progress" hidden={!state.busy} role="status" aria-live="polite">
        <i aria-hidden="true"></i>
        <span>{state.progressMessage || "Processando base…"}</span>
      </div>

      <SigemPwReadiness readiness={state.readiness} />
      {state.pw.meta && (state.pw.meta.companyColumn !== "C" || state.pw.meta.scopeCompanyColumnMissing === true) ? (
        <div className="spw-empty" role="alert"><strong>Reimportação do PW necessária</strong><span>A base atual não comprova a leitura da sigla da empresa pela coluna C. Os indicadores foram suspensos até importar uma consulta PW com essa coluna, evitando contagens incorretas.</span></div>
      ) : null}

      <UiPanel className="spw-section-panel spw-overview-panel" labelledBy="spw-overview-title">
        <div className="spw-section-heading">
          <div>
            <span className="spw-kicker">VISÃO GERENCIAL</span>
            <h3 id="spw-overview-title">Visão consolidada da conciliação</h3>
            <p>Somente registros PW com sigla CSG ou QTM na coluna C são considerados. Demais empresas ficam separadas para auditoria.</p>
          </div>
          {classifiedTotal > 0 ? <UiMetaPill><strong>{fmt(classifiedTotal)}</strong> classificados</UiMetaPill> : null}
        </div>
        <SigemPwManagerialOverview state={state} />
        <details className="spw-advanced-area">
          <summary>Conferências técnicas por revisão e indicadores operacionais</summary>
          <SigemPwRevisionScopeSelector value={state.revisionScope} onChange={(value) => adapter.setRevisionScope(value)} />
        <details className="spw-import-options"><summary>Indicadores operacionais por revisão</summary><SigemPwSystemsSummary state={state} onOpenSigem={() => adapter.openSigemDetails()} /></details>
        {state.pw.meta ? <section className="spw-pw-audit" aria-label="Conferência da lista PW" id="spw-pw-audit">
          <div><strong>{fmt(state.result?.quality.pwSourceRows || 0)}</strong><span>linhas PW com código · CSG/QTM</span></div>
          <div><strong>{fmt(Number(state.pw.meta?.scopeExcludedCount) || 0)}</strong><span>linhas PW de outras empresas ou sem sigla</span></div>
          {state.pw.meta?.scopeCompanyColumnMissing ? <small role="alert">A base PW anterior não registra a coluna C. Reimporte a consulta com sigla de empresa para validar os totais.</small> : null}
          <div><strong>{fmt(state.result?.quality.pwDuplicateGroups || 0)}</strong><span>grupos de código + revisão repetidos</span></div>
          <div><strong>{fmt(state.result?.quality.pwDuplicateExtraRows || 0)}</strong><span>repetições adicionais</span></div>
          <button type="button" className="secondary-button" onClick={() => adapter.setActiveList("pwDuplicates")}>Ver duplicados PW</button>
          <small>A lista de duplicados usa apenas o PW das empresas CSG/QTM. Revisões diferentes são registros distintos. Exporte a relação pelo botão “Exportar lista”.</small>
        </section> : null}
        {!state.ld.meta && state.sigem.meta ? <div className="spw-empty" role="alert"><strong>Referências documentais necessárias para os totais oficiais</strong><span>Sem referências válidas, o painel oficial não calcula cadastro, emissão ou postagem. Inclua as fontes do contrato antes de comparar.</span></div> : null}
        {state.result?.quality?.ldAvailable ? <div className="spw-pw-audit" role="status">
          <span><strong>{fmt(state.result.lists.sigemN1710OutsideLd?.length || 0)}</strong> SIGEM fora das referências</span>
          <button type="button" className="secondary-button" onClick={() => adapter.setActiveList("sigemN1710OutsideLd")}>Conferir na lista</button>
          <span><strong>{fmt(state.result.lists.pwN1710OutsideLd?.length || 0)}</strong> PW fora das referências</span>
          <button type="button" className="secondary-button" onClick={() => adapter.setActiveList("pwN1710OutsideLd")}>Conferir PW</button>
        </div> : null}
        <details className="spw-import-options"><summary>Comparativos operacionais e situações por revisão</summary>
          <SigemPwSituationCards state={state} activeList={state.activeList} onSelect={(list) => adapter.setActiveList(list)} />
        </details>
        </details>
      </UiPanel>

      <details className="spw-sources-disclosure" open={loadedBases < 3}>
        <summary>Gerenciar fontes de comparação · {loadedBases}/3 bases carregadas</summary>
      <UiPanel className="spw-section-panel spw-bases-panel" labelledBy="spw-bases-title">
        <div className="spw-section-heading">
          <div>
            <span className="spw-kicker">FONTES DE COMPARAÇÃO</span>
            <h3 id="spw-bases-title">Bases vigentes</h3>
            <p>Atualize apenas a base necessária. A data operacional pode ser ajustada sem alterar a data original de importação.</p>
          </div>
          <UiMetaPill><strong>{loadedBases}/3</strong> carregadas</UiMetaPill>
        </div>
        <SigemPwAnalysisSources
          state={state}
          onSelect={(system, id) => { void adapter.selectAnalysisBase(system, id); }}
          canManageSigemHistory={Boolean(window.GrconSharedSigemQuery?.canManageHistory?.())}
          onActivateSigem={(id) => { void adapter.activateSharedSigemVersion(id); }}
          onDeleteSigem={(id) => { void adapter.deleteSharedSigemVersion(id); }}
        />
        <SigemPwBases
          state={state}
          onImportSigem={(file) => { void adapter.importSigem(file); }}
          onImportPw={(file) => { void adapter.importPw(file); }}
          onPublishPw={() => { void adapter.publishPw(); }}
          onImportLd={(files) => { void adapter.importLd(files); }}
          onToggleLd={(id, active) => { void adapter.toggleLdSource(id, active); }}
          onEditDate={(system) => adapter.openBaseDateEditor(system)}
        />
      </UiPanel>

      </details>

      <details className="spw-legacy-disclosure">
        <summary>Auditoria avançada: listas por revisão, duplicados, histórico e evolução documental</summary>
      <UiPanel className="spw-list-card" labelledBy="spw-list-title">
        <header className="spw-list-head">
          <div>
            <span className="spw-kicker">RELAÇÃO DETALHADA</span>
            <strong id="spw-list-title">{activeLabel}</strong>
            <small>{state.activeList === "pwDuplicates" ? "Todas as ocorrências dos grupos duplicados na base PW completa, com linha de origem e status original." : state.revisionScope === "revision0"
              ? "Detalhamento auditável somente da revisão 0; os demais filtros permanecem ativos."
              : "Detalhamento auditável por Documento + Revisão; os demais filtros permanecem ativos."}</small>
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
          key={`${state.activeList}:${state.filterResetKey}`}
          query={state.filters.query}
          revision={state.filters.revision}
          sigemStatus={state.filters.sigemStatus}
          inPw={state.filters.inPw}
          sigemStatusOptions={sigemStatusOptions}
          onRevision={adapter.setRevision}
          onSigemStatus={adapter.setSigemStatus}
          onInPw={adapter.setInPw}
          documentClass={state.filters.documentClass}
          busy={state.busy}
          onQuery={(value) => adapter.setQuery(value)}
          onClass={(value: SigemPwDocumentClass) => adapter.setDocumentClass(value)}
          onClear={() => adapter.clearFilters()}
        />
        <SigemPwTable rows={pageData.visible} caption={activeLabel} duplicates={state.activeList === "pwDuplicates"} />
        <SigemPwPager
          page={state.page}
          pages={pageData.pages}
          total={pageData.rows.length}
          start={pageData.start}
          pageSize={SIGEM_PW_PAGE_SIZE}
          onPage={(page) => adapter.setPage(page)}
        />
      </UiPanel>

      <SigemPwOutOfScope state={state} />
      <SigemPwRevisionSection />
      </details>

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
