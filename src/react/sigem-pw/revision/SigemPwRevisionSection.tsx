import { UiMetaPill } from "../../core/ui/UiPrimitives";
import { SigemPwRevisionCards } from "./components/SigemPwRevisionCards";
import { SigemPwRevisionFilters } from "./components/SigemPwRevisionFilters";
import { SigemPwRevisionPager } from "./components/SigemPwRevisionPager";
import { SigemPwRevisionTable } from "./components/SigemPwRevisionTable";
import { useSigemPwRevision } from "./hooks/useSigemPwRevision";

function fmt(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR");
}

function ExportIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 3v12M8 11l4 4 4-4M5 19h14"></path>
    </svg>
  );
}

export function SigemPwRevisionSection() {
  const { state, rows, pageData, options, adapter } = useSigemPwRevision();
  const analysis = state.analysis;
  const progressPercent = state.progress.total > 0
    ? Math.min(100, Math.max(0, (state.progress.done / state.progress.total) * 100))
    : null;

  return (
    <section id="spw-revision-section" className="ui-panel spw-section-panel spw-revision-shell" aria-labelledby="spw-revision-title">
      <header className="spw-rev-head">
        <div className="spw-rev-head-copy">
          <span className="spw-kicker">DETALHAMENTO OPERACIONAL</span>
          <div className="spw-rev-title-row">
            <h3 id="spw-revision-title">Situação das Revisões</h3>
            <button
              className="spw-rev-help"
              type="button"
              aria-label="Ajuda sobre Situação das Revisões"
              aria-describedby="spw-rev-help-copy"
              title="Compara a revisão do SIGEM com as revisões localizadas no ProjectWise, sem alterar as regras do motor."
            >
              ?
            </button>
          </div>
          <p>Compare a revisão encontrada no SIGEM com a situação atual no ProjectWise.</p>
          <span className="spw-sr-only" id="spw-rev-help-copy">
            A classificação e as contagens vêm do motor de revisões do SIGEM × ProjectWise.
          </span>
        </div>
        {analysis ? (
          <UiMetaPill className="spw-rev-comparable">
            <strong>{fmt(analysis.metrics.documentsCompared)}</strong> documentos comparáveis
          </UiMetaPill>
        ) : null}
      </header>

      {analysis ? (
        <SigemPwRevisionCards
          analysis={analysis}
          situation={state.filters.situation}
          onSelect={(value) => adapter.toggleSituation(value)}
        />
      ) : null}

      <div className="spw-rev-panel">
        <SigemPwRevisionFilters
          filters={state.filters}
          options={options}
          rawSearch={state.rawSearch}
          rawDocumentList={state.rawDocumentList}
          onFilter={(key, value) => adapter.setFilter(key, value)}
          onRawSearch={(value) => adapter.setRawSearch(value)}
          onRawDocumentList={(value) => adapter.setRawDocumentList(value)}
          onClear={() => adapter.clearFilters()}
        />

        {analysis ? (
          <div className="spw-rev-summary">
            <div className="spw-rev-summary-copy">
              <strong>{fmt(rows.length)} documentos</strong>
              <span>
                {rows.length
                  ? "Mostrando " + fmt(pageData.start + 1) + "–" + fmt(Math.min(pageData.start + pageData.visible.length, rows.length))
                  : "Nenhum item visível"}
                {" · "}Análise {analysis.metrics.durationMs.toFixed(1)} ms
                {" · "}{fmt(analysis.metrics.documentsCompared)} comparáveis
              </span>
            </div>
            <div className="spw-rev-summary-actions">
              <span
                className={"spw-rev-export-feedback " + state.exportMessageKind}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {state.exportMessage}
              </span>
              <button
                className="secondary-button spw-rev-export"
                type="button"
                data-spw-rev-export
                disabled={state.exporting || rows.length === 0}
                onClick={() => { void adapter.exportFilteredRows(); }}
                aria-label="Exportar lista filtrada para Excel"
                title="Exportar lista filtrada completa, incluindo todas as páginas"
              >
                <ExportIcon />
                <span>{state.exporting ? "Gerando Excel..." : "Exportar Excel"}</span>
              </button>
            </div>
          </div>
        ) : null}

        <div className="spw-rev-scroll-hint" aria-hidden="true">
          <span>Deslize horizontalmente para ver todas as colunas</span>
          <b>→</b>
        </div>

        <div
          className="spw-rev-table-wrap"
          id="spw-rev-table-wrap"
          tabIndex={0}
          aria-label="Tabela da Situação das Revisões. A tabela possui rolagem horizontal local quando necessário."
        >
          {state.progress.active ? (
            <div className="spw-rev-processing" role="status" aria-live="polite">
              <div className="spw-rev-processing-copy">
                <span className="spw-rev-processing-icon" aria-hidden="true"></span>
                <div>
                  <strong>Comparando revisões SIGEM × PW...</strong>
                  <span id="spw-rev-progress-count">{state.progress.message || "Preparando análise..."}</span>
                </div>
              </div>
              {progressPercent !== null ? (
                <div
                  className="spw-rev-progress-track"
                  role="progressbar"
                  aria-label="Progresso da comparação de revisões"
                  aria-valuemin={0}
                  aria-valuemax={state.progress.total}
                  aria-valuenow={state.progress.done}
                >
                  <i style={{ width: progressPercent + "%" }}></i>
                </div>
              ) : null}
            </div>
          ) : !analysis ? (
            <div className="spw-rev-empty spw-rev-empty-bases">
              <div>
                <strong>Bases necessárias</strong>
                <span>Carregue as bases para analisar as revisões.</span>
              </div>
            </div>
          ) : (
            <SigemPwRevisionTable
              rows={pageData.visible}
              expandedKey={state.expandedKey}
              onToggle={(key) => adapter.toggleExpanded(key)}
              histories={(row) => adapter.histories(row)}
              situationLabel={(value) => adapter.situationLabel(value)}
              situationClass={(value) => adapter.situationClass(value)}
            />
          )}
        </div>

        {analysis && rows.length ? (
          <SigemPwRevisionPager
            page={state.page}
            pages={pageData.pages}
            total={rows.length}
            start={pageData.start}
            pageSize={100}
            onPage={(page) => adapter.setPage(page)}
          />
        ) : null}
      </div>
    </section>
  );
}
