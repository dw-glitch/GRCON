import { useEffect, useRef } from "react";
import { historicoAnalisesAdapter as Adapter } from "../services/historicoAnalisesAdapter";
import type {
  AnalysisDocument,
  AnalysisHistoryFilters,
  AnalysisSession,
  AnalysisSummary,
  DetailState,
  SavedAnalysisFilter,
  UnifiedSearchResult,
} from "../types/domain";

function numberBr(value: unknown): string {
  return Number(value || 0).toLocaleString("pt-BR");
}

export function HistoryHeader(props: {
  canDeleteSession: boolean;
  onBackup: () => void;
  onRestore: (file: File | null | undefined) => Promise<void>;
  onDeleteSession: () => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <header className="analysis-history-heading">
      <div>
        <span>RASTREABILIDADE DAS ANÁLISES</span>
        <h2 id="analysis-history-title">Todos os documentos analisados pelo GRCON</h2>
        <p>Cada análise concluída é registrada com data, documento, revisão, situação entregue e motivo.</p>
      </div>
      <div className="analysis-history-actions">
        <button className="secondary-button" id="analysis-history-backup" type="button" onClick={props.onBackup}>Fazer backup</button>
        <button className="secondary-button" id="analysis-history-restore" type="button" onClick={() => inputRef.current?.click()}>Restaurar backup</button>
        <input
          ref={inputRef}
          accept="application/json,.json"
          hidden
          id="analysis-history-restore-input"
          type="file"
          onChange={(event) => {
            const input = event.currentTarget;
            void props.onRestore(input.files?.[0]).finally(() => { input.value = ""; });
          }}
        />
        <button
          className="secondary-button"
          disabled={!props.canDeleteSession}
          id="analysis-history-delete-session"
          type="button"
          onClick={props.onDeleteSession}
        >
          Excluir análise selecionada
        </button>
        <button className="secondary-button" id="analysis-history-clear" type="button" onClick={props.onClear}>Limpar todo o histórico</button>
      </div>
    </header>
  );
}

export function UnifiedSearch(props: {
  value: string;
  result: UnifiedSearchResult | null;
  onChange: (value: string) => void;
  onSearch: () => void;
  onClear: () => void;
}) {
  const result = props.result;
  return (
    <section aria-label="Busca unificada" className="unified-search" id="unified-search">
      <div className="unified-search-heading">
        <span>BUSCA UNIFICADA</span>
        <h3>Buscar documentos no histórico e nas análises</h3>
        <p>Cole códigos ou nomes de documentos, um por linha, para buscar no histórico de eGRDTs e no histórico de análises.</p>
      </div>
      <div className="unified-search-body">
        <div className="unified-search-input">
          <textarea
            aria-label="Códigos ou nomes de documentos para buscar, um por linha"
            id="unified-search-text"
            placeholder="Cole um código ou nome de documento por linha"
            rows={3}
            spellCheck={false}
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                props.onSearch();
              }
            }}
          />
          <div className="unified-search-actions">
            <button className="primary-button" id="unified-search-btn" type="button" onClick={props.onSearch}>Buscar</button>
            <button className="secondary-button" id="unified-search-clear" type="button" onClick={props.onClear}>Limpar</button>
          </div>
        </div>
        <div className="unified-search-results" id="unified-search-results" hidden={!result}>
          <div className="unified-search-result-card">
            <div className="unified-search-result-header"><span>eGRDTs no Histórico</span><strong id="unified-history-count">{result?.historyCount || 0}</strong></div>
            <small>eGRDTs correspondentes</small>
          </div>
          <div className="unified-search-result-card">
            <div className="unified-search-result-header"><span>Análises no Histórico de Análises</span><strong id="unified-analysis-count">{result?.analysisCount || 0}</strong></div>
            <small>documentos analisados correspondentes</small>
          </div>
        </div>
        <div className="unified-search-detail" id="unified-search-detail" hidden={!result}>
          {result && (result.historyMatches.length || result.analysisMatches.length) ? (
            <details open>
              <summary>{`Detalhes (${result.historyCount} eGRDTs · ${result.analysisCount} análises)`}</summary>
              {result.historyMatches.length > 0 && (
                <div className="unified-search-detail-list">
                  {result.historyMatches.map((record) => (
                    <div className="unified-search-detail-item" key={record.id}>
                      <strong title={record.egrdtNumber || ""}>{record.egrdtNumber || "—"}</strong>
                      <small>{`${record.outputType || ""} · ${record.documentCount || 0} docs`}</small>
                    </div>
                  ))}
                </div>
              )}
              {result.analysisMatches.length > 0 && (
                <div className="unified-search-detail-list">
                  {result.analysisMatches.map((item) => (
                    <div className="unified-search-detail-item" key={item.id}>
                      <strong title={item.document || ""}>{item.document || "—"}</strong>
                      <small>{`${item.statusDelivered || ""} · ${item.allocationStatus || ""}`}</small>
                    </div>
                  ))}
                </div>
              )}
            </details>
          ) : result ? <p className="unified-search-empty">Nenhum documento encontrado para os termos pesquisados.</p> : null}
        </div>
      </div>
    </section>
  );
}

export function HistoryFilters(props: {
  filters: AnalysisHistoryFilters;
  sessions: AnalysisSession[];
  periodInvalid: boolean;
  onFilter: <K extends keyof AnalysisHistoryFilters>(key: K, value: AnalysisHistoryFilters[K]) => void;
}) {
  const endRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    endRef.current?.setCustomValidity(props.periodInvalid ? "A data final deve ser igual ou posterior à data inicial." : "");
  }, [props.periodInvalid]);

  return (
    <section aria-label="Filtros do histórico de análises" className="analysis-history-toolbar">
      <label className="analysis-history-search-field">
        <span>Busca geral</span>
        <span className="analysis-history-search-control">
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10" cy="10" r="6" /><path d="M14.5 14.5L21 21" /></svg>
          <input
            autoComplete="off"
            id="analysis-history-search"
            placeholder="Documento, título, motivo, GRDT ou alocação"
            type="search"
            value={props.filters.query}
            onChange={(event) => props.onFilter("query", event.target.value)}
          />
        </span>
      </label>
      <label>
        <span>Situação entregue</span>
        <select id="analysis-history-status" value={props.filters.status} onChange={(event) => props.onFilter("status", event.target.value)}>
          <option value="ALL">Todas</option>
          <option value="READY">Será incluído na eGRDT</option>
          <option value="BLOCKED">Não será incluído</option>
          <option value="DISCARD">Não será enviado novamente</option>
          <option value="REVIEW">Precisa de conferência</option>
        </select>
      </label>
      <label>
        <span>Data inicial</span>
        <input id="analysis-history-start" type="date" value={props.filters.startDate} onChange={(event) => props.onFilter("startDate", event.target.value)} />
      </label>
      <label>
        <span>Data final</span>
        <input
          ref={endRef}
          aria-invalid={props.periodInvalid || undefined}
          id="analysis-history-end"
          type="date"
          value={props.filters.endDate}
          onChange={(event) => props.onFilter("endDate", event.target.value)}
        />
      </label>
      <label>
        <span>Análise executada</span>
        <select id="analysis-history-session" value={props.filters.sessionId} onChange={(event) => props.onFilter("sessionId", event.target.value)}>
          <option value="">Todas as análises</option>
          {props.sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {Adapter.formatDate(session.analyzedAt, true) + " · " + numberBr(session.total) + " docs · " + (session.ldName || "LD")}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

export function QuickAndSavedFilters(props: {
  savedFilters: SavedAnalysisFilter[];
  selectedId: string;
  onQuick: (kind: string) => void;
  onSelectSaved: (id: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <div className="analysis-history-quick" aria-label="Filtros rápidos">
        <button type="button" data-analysis-quick="today" onClick={() => props.onQuick("today")}>Hoje</button>
        <button type="button" data-analysis-quick="7days" onClick={() => props.onQuick("7days")}>Últimos 7 dias</button>
        <button type="button" data-analysis-quick="pending" onClick={() => props.onQuick("pending")}>Pendências</button>
        <button type="button" data-analysis-quick="included" onClick={() => props.onQuick("included")}>Incluídos</button>
      </div>
      <div className="analysis-saved-filters" aria-label="Filtros salvos">
        <label>
          <span>Filtro salvo</span>
          <select id="analysis-history-saved-filter" value={props.selectedId} onChange={(event) => props.onSelectSaved(event.target.value)}>
            <option value="">Selecionar filtro</option>
            {props.savedFilters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <button className="secondary-button compact" id="analysis-history-save-filter" type="button" onClick={props.onSave}>Salvar filtro atual</button>
        <button className="secondary-button compact" disabled={!props.selectedId} id="analysis-history-delete-filter" type="button" onClick={props.onDelete}>Excluir filtro</button>
      </div>
    </>
  );
}

export function SummaryCards({ summary }: { summary: AnalysisSummary }) {
  const entries: Array<[string, number, string]> = [
    ["Análises", summary.sessions || 0, "neutral"],
    ["Documentos", summary.total || 0, "neutral"],
    ["Incluir", summary.counts.READY || 0, "ready"],
    ["Não incluir", summary.counts.BLOCKED || 0, "blocked"],
    ["Aguardar", summary.counts.DISCARD || 0, "discard"],
    ["Conferir", summary.counts.REVIEW || 0, "review"],
  ];
  return (
    <section aria-label="Resumo das análises" className="analysis-history-summary" id="analysis-history-summary">
      {entries.map(([label, value, tone]) => (
        <div className={tone} key={label}><span>{label}</span><strong>{numberBr(value)}</strong></div>
      ))}
    </section>
  );
}

function HistoryRow({ item, onOpen }: { item: AnalysisDocument; onOpen: (item: AnalysisDocument) => void }) {
  const analyzed = Adapter.dateParts(item.analyzedAt);
  return (
    <tr
      data-analysis-id={item.id}
      tabIndex={0}
      aria-label={`Abrir detalhes de ${item.document || "documento"}`}
      onClick={() => onOpen(item)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen(item);
      }}
    >
      <td className="analysis-cell-date" data-label="Analisado em"><strong>{analyzed.date}</strong>{analyzed.time && <small>{analyzed.time}</small>}</td>
      <td className="analysis-cell-document" data-label="Documento"><strong title={item.document || ""}>{item.document || "—"}</strong>{item.title && <small title={item.title}>{item.title}</small>}</td>
      <td className="analysis-cell-revision" data-label="Revisão atual"><strong>{item.currentRevision || "—"}</strong></td>
      <td className="analysis-cell-revision" data-label="Próxima revisão"><strong>{item.targetRevision || "—"}</strong>{item.targetRevisionStatus && <small>{item.targetRevisionStatus}</small>}</td>
      <td className="analysis-cell-result" data-label="Resultado GRCON"><span className={`analysis-status-chip ${Adapter.statusClass(item.statusDelivered)}`}>{item.statusDelivered || "—"}</span></td>
      <td className="analysis-cell-sigem" data-label="SIGEM"><span className={`analysis-sigem-chip ${Adapter.sigemClass(item.sigemStatus)}`}>{item.sigemStatus || "—"}</span></td>
      <td className="analysis-cell-allocation" data-label="Alocação"><strong>{item.allocationStatus || "—"}</strong>{item.allocation && <small title={item.allocation}>{item.allocation}</small>}</td>
      <td className="analysis-cell-ld" data-label="LD"><strong>{item.ldVersion || "—"}</strong>{(item.sheet || item.ldRow) && <small>{[item.sheet, item.ldRow ? `linha ${item.ldRow}` : ""].filter(Boolean).join(" · ")}</small>}</td>
      <td className="analysis-cell-reason" data-label="Motivo" title={item.reason || ""}><strong>{item.reasonCode || "—"}</strong>{item.reason && <small>{item.reason}</small>}</td>
    </tr>
  );
}

export function ResultsCard(props: {
  rows: AnalysisDocument[];
  total: number;
  page: number;
  pages: number;
  loading: boolean;
  error: string;
  storageLabel: string;
  exporting: boolean;
  periodInvalid: boolean;
  hasReport: boolean;
  hasPeriod: boolean;
  onOpen: (item: AnalysisDocument) => void;
  onPrevious: () => void;
  onNext: () => void;
  onExport: () => void;
}) {
  const exportLabel = props.exporting
    ? "Gerando relatório…"
    : props.hasPeriod ? "Baixar relatório do período" : "Baixar relatório Excel";
  return (
    <section className="analysis-history-card" aria-label="Documentos analisados">
      <header>
        <div><span>DOCUMENTOS REGISTRADOS</span><strong id="analysis-history-result-count">{numberBr(props.total)} documento(s)</strong></div>
        <div className="analysis-history-actions">
          <button
            className="primary-button"
            disabled={!props.total || props.exporting || props.periodInvalid || !props.hasReport}
            id="analysis-history-export"
            type="button"
            onClick={props.onExport}
          >
            {exportLabel}
          </button>
        </div>
      </header>
      <div className="analysis-history-table-hint">
        <span>Visualização detalhada</span>
        <small>Em telas menores, cada documento é apresentado em um cartão para evitar sobreposição.</small>
      </div>
      <div className="analysis-history-table-wrap">
        <table className="analysis-history-table">
          <colgroup>
            <col className="analysis-col-date" /><col className="analysis-col-document" /><col className="analysis-col-current-revision" />
            <col className="analysis-col-target-revision" /><col className="analysis-col-result" /><col className="analysis-col-sigem" />
            <col className="analysis-col-allocation" /><col className="analysis-col-ld" /><col className="analysis-col-reason" />
          </colgroup>
          <thead><tr><th>Analisado em</th><th>Documento</th><th>Revisão atual</th><th>Próxima revisão</th><th>Resultado GRCON</th><th>SIGEM</th><th>Alocação</th><th>LD</th><th>Motivo</th></tr></thead>
          <tbody id="analysis-history-body">
            {props.loading
              ? <tr><td colSpan={9} className="analysis-history-loading">Carregando histórico…</td></tr>
              : props.error
                ? <tr><td colSpan={9} className="analysis-history-loading error">{props.error}</td></tr>
                : props.rows.map((item) => <HistoryRow item={item} key={item.id} onOpen={props.onOpen} />)}
          </tbody>
        </table>
        {props.loading || Boolean(props.error) || props.rows.length > 0 ? (
          <empty-state hidden id="analysis-history-empty">
            <strong>Nenhum documento localizado</strong><span>Execute uma análise ou ajuste os filtros.</span>
          </empty-state>
        ) : (
          <empty-state id="analysis-history-empty">
            <strong>Nenhum documento localizado</strong><span>Execute uma análise ou ajuste os filtros.</span>
          </empty-state>
        )}
      </div>
      <footer className="analysis-history-footer">
        <small id="analysis-history-storage">{props.storageLabel}</small>
        <div className="analysis-history-pagination">
          <button className="secondary-button compact" disabled={props.page <= 1} id="analysis-history-previous" type="button" onClick={props.onPrevious}>Anterior</button>
          <span id="analysis-history-page-status">{props.total ? `Página ${props.page} de ${props.pages} · ${numberBr(props.total)} documento(s)` : "Nenhum documento"}</span>
          <button className="secondary-button compact" disabled={props.page >= props.pages} id="analysis-history-next" type="button" onClick={props.onNext}>Próxima</button>
        </div>
      </footer>
    </section>
  );
}

function DetailField({ label, value }: { label: string; value: unknown }) {
  return <div><dt>{label}</dt><dd>{String(value || "—")}</dd></div>;
}

export function DetailPanel(props: {
  detail: DetailState;
  onClose: () => void;
  onRelated: (id: string, prepareSigem: boolean) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = Boolean(props.detail.item);

  useEffect(() => {
    if (open && !props.detail.loading) closeRef.current?.focus();
  }, [open, props.detail.loading]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") props.onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, props.onClose]);

  const item = props.detail.item;
  const context = props.detail.context;
  return (
    <>
      <aside
        aria-hidden={open ? "false" : "true"}
        aria-labelledby="analysis-history-detail-title"
        className="analysis-history-detail-panel"
        hidden={!open}
        id="analysis-history-detail"
      >
        <header>
          <div><span>COMPARAÇÃO E EVIDÊNCIAS</span><h3 id="analysis-history-detail-title">{item?.document || "Documento analisado"}</h3></div>
          <button ref={closeRef} aria-label="Fechar detalhes" className="icon-button" id="analysis-history-detail-close" type="button" onClick={props.onClose}>×</button>
        </header>
        <div id="analysis-history-detail-body">
          {props.detail.loading && <div className="analysis-detail-card"><strong>Carregando comparação…</strong></div>}
          {props.detail.error && <div className="analysis-detail-card"><strong>Não foi possível abrir a comparação.</strong><p>{props.detail.error}</p></div>}
          {item && context && !props.detail.loading && !props.detail.error && (
            <>
              <section className="analysis-detail-card"><h4>Decisão desta análise</h4><dl className="analysis-detail-grid">
                <DetailField label="Analisado em" value={Adapter.formatDate(item.analyzedAt, true)} />
                <DetailField label="Resultado GRCON" value={item.statusDelivered} />
                <DetailField label="Revisão atual" value={item.currentRevision} />
                <DetailField label="Próxima revisão" value={item.targetRevision} />
                <DetailField label="Status da revisão" value={item.targetRevisionStatus} />
                <DetailField label="SIGEM" value={item.sigemStatus} />
                <DetailField label="Situação da postagem" value={item.postingStatus} />
                <DetailField label="Alocação" value={[item.allocationStatus, item.allocation].filter(Boolean).join(" · ")} />
                <DetailField label="LD utilizada" value={[item.ldVersion, item.sheet, item.ldRow ? `linha ${item.ldRow}` : ""].filter(Boolean).join(" · ")} />
                <DetailField label="Caminho Databook" value={item.databook} />
              </dl></section>
              <section className="analysis-detail-card"><h4>Evidência e motivo</h4><dl className="analysis-detail-grid">
                <DetailField label="Código do motivo" value={item.reasonCode} />
                <DetailField label="Explicação" value={item.reason} />
                <DetailField label="Comentário da Fiscal" value={item.fiscalComment} />
                <DetailField label="Origem da entrada" value={item.inputSource} />
                <DetailField label="Arquivos originais" value={item.originalFiles} />
                <DetailField label="Arquivos finais" value={item.finalFiles} />
              </dl>
                {context.changes.length
                  ? <p><strong>Mudanças desde a análise anterior:</strong><br />{context.changes.map((change, index) => <span key={change}>{index ? <br /> : null}{change}</span>)}</p>
                  : <p>Nenhuma mudança material em relação à análise anterior localizada.</p>}
              </section>
              <section className="analysis-detail-card"><h4>Linha do tempo deste documento</h4>
                {context.timeline.length ? (
                  <ol className="analysis-timeline">
                    {[...context.timeline].reverse().map((entry) => (
                      <li key={entry.id}>
                        <strong>{Adapter.formatDate(entry.analyzedAt, true) + " · " + (entry.statusDelivered || "—")}</strong>
                        <span>{"Rev. " + (entry.currentRevision || "—") + " → " + (entry.targetRevision || "—") + " · SIGEM: " + (entry.sigemStatus || "—")}</span>
                        {entry.changes?.length ? <small>{entry.changes.join(" · ")}</small> : <small>{entry.reason || "Primeiro registro localizado"}</small>}
                      </li>
                    ))}
                  </ol>
                ) : <p>Nenhuma análise anterior localizada.</p>}
              </section>
              <section className="analysis-detail-card"><h4>eGRDT relacionada</h4>
                {context.related ? (
                  <>
                    <p><strong>{context.related.egrdtNumber}</strong><br />{Adapter.formatDate(context.related.generatedAt, true) + " · " + (context.related.documentCount || 0) + " documento(s)"}</p>
                    <div className="analysis-detail-actions">
                      <button className="primary-button" data-analysis-detail-action="open-egrdt" data-history-id={context.related.id} type="button" onClick={() => props.onRelated(context.related!.id, false)}>Abrir eGRDT no histórico</button>
                      <button className="secondary-button" data-analysis-detail-action="prepare-sigem" data-history-id={context.related.id} type="button" onClick={() => props.onRelated(context.related!.id, true)}>Preparar no SIGEM</button>
                    </div>
                  </>
                ) : <p>Este documento ainda não possui uma eGRDT relacionada no histórico local.</p>}
              </section>
            </>
          )}
        </div>
      </aside>
      <div className="analysis-history-detail-overlay" hidden={!open} id="analysis-history-detail-overlay" onClick={props.onClose} />
    </>
  );
}
