import { SigemPwRevisionCards } from "./components/SigemPwRevisionCards";
import { SigemPwRevisionFilters } from "./components/SigemPwRevisionFilters";
import { SigemPwRevisionPager } from "./components/SigemPwRevisionPager";
import { SigemPwRevisionTable } from "./components/SigemPwRevisionTable";
import { useSigemPwRevision } from "./hooks/useSigemPwRevision";
import { REVISION_PAGE_SIZE } from "./types/domain";

function fmt(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR");
}

function ms(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function ExportIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 3v12M7 10l5 5 5-5M5 20h14"></path>
    </svg>
  );
}

export function SigemPwRevisionSection() {
  const { state, rows, pageData, options, adapter } = useSigemPwRevision();

  if (!state.active) return null;

  const analysis = state.analysis;
  const page = state.page;
  const exportDisabled = !rows.length || state.exporting;
  const exportTitle = !rows.length
    ? "Nenhum documento disponível para exportação."
    : state.exporting
      ? "Aguarde a conclusão da exportação atual."
      : `Exportar os ${fmt(rows.length)} documento(s) resultantes dos filtros atuais, em todas as páginas.`;

  return (
    <section id="spw-revision-section" aria-labelledby="spw-revision-title">
      <header className="spw-rev-head">
        <div>
          <span className="spw-kicker">DETALHAMENTO OPERACIONAL</span>
          <h3 id="spw-revision-title">Situação das Revisões</h3>
          <p>Identifique documentos em que a revisão disponível ou emitida no ProjectWise ainda não acompanha a revisão encontrada no SIGEM.</p>
        </div>
        <button
          type="button"
          className="spw-rev-help"
          title="Esta área compara a revisão encontrada no SIGEM com todas as revisões disponíveis no ProjectWise. Ela diferencia revisão anterior, documento não localizado e revisão correta cadastrada porém ainda sem emissão."
          aria-label="Ajuda sobre a Situação das Revisões"
        >
          ⓘ
        </button>
      </header>

      {analysis ? (
        <SigemPwRevisionCards
          counts={analysis.counts}
          active={state.filters.situation}
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
          onSearch={(value) => adapter.setRawSearch(value)}
          onDocumentList={(value) => adapter.setRawDocumentList(value)}
        />

        {analysis ? (
          <div className="spw-rev-summary" id="spw-rev-summary">
            <div className="spw-rev-summary-main">
              <span>
                <strong>{fmt(rows.length)}</strong> documento(s) no filtro · mostrando {rows.length ? fmt(pageData.start + 1) : 0}–{fmt(Math.min(pageData.start + REVISION_PAGE_SIZE, rows.length))}
              </span>
              <button
                className="secondary-button compact spw-rev-export"
                type="button"
                data-spw-rev-export
                disabled={exportDisabled}
                title={exportTitle}
                aria-label="Exportar lista filtrada para Excel"
                onClick={() => { void adapter.exportFilteredRows(); }}
              >
                <ExportIcon />
                <span>{state.exporting ? "Gerando Excel..." : "Exportar lista filtrada"}</span>
              </button>
              {state.exportMessage ? (
                <span className={`spw-rev-export-feedback ${state.exportMessageKind}`} aria-live="polite">
                  {state.exportMessage}
                </span>
              ) : null}
            </div>
            <span>Análise: {ms(analysis.metrics.durationMs)} ms · {fmt(analysis.metrics.documentsCompared)} documentos comparáveis</span>
          </div>
        ) : null}

        <div className="spw-rev-table-wrap" id="spw-rev-table-wrap">
          {state.progress.active ? (
            <div className="spw-rev-empty" role="status" aria-live="polite">
              <strong>Comparando revisões SIGEM × PW...</strong>
              <br />
              <span id="spw-rev-progress-count">{state.progress.message || "Preparando índices já carregados."}</span>
            </div>
          ) : !analysis ? (
            <div className="spw-rev-empty">
              <strong>Carregue as bases para analisar as revisões.</strong>
            </div>
          ) : (
            <SigemPwRevisionTable
              rows={pageData.visible}
              expandedKey={state.expandedKey}
              situationLabel={(value) => adapter.situationLabel(value)}
              situationClass={(value) => adapter.situationClass(value)}
              historyForRow={(row) => adapter.histories(row)}
              onToggleDetail={(key) => adapter.toggleExpanded(key)}
            />
          )}
        </div>

        {analysis && !state.progress.active ? (
          <SigemPwRevisionPager page={page} pages={pageData.pages} onPage={(value) => adapter.setPage(value)} />
        ) : (
          <div className="spw-rev-pages" id="spw-rev-pages"></div>
        )}
      </div>
    </section>
  );
}
