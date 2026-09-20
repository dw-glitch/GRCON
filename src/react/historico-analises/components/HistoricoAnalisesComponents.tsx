import { useEffect, useRef } from "react";
import { UiDrawer, UiMetaPill, UiPageHeader, UiPanel } from "../../core/ui/UiPrimitives";
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

function todayIso(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function quickFilterActive(filters: AnalysisHistoryFilters, kind: string): boolean {
  if (kind === "today") {
    const today = todayIso();
    return filters.startDate === today && filters.endDate === today && filters.status === "ALL";
  }
  if (kind === "7days") {
    return filters.startDate === todayIso(-6) && filters.endDate === todayIso() && filters.status === "ALL";
  }
  if (kind === "pending") return filters.status === "REVIEW" && !filters.startDate && !filters.endDate;
  if (kind === "included") return filters.status === "READY" && !filters.startDate && !filters.endDate;
  return false;
}

const STATUS_LABEL: Record<string, string> = {
  READY: "Será incluído na eGRDT",
  BLOCKED: "Não será incluído",
  DISCARD: "Não será enviado novamente",
  REVIEW: "Precisa de conferência",
};

export function HistoryHeader(props: {
  sessionsCount: number;
  documentsCount: number;
  canDeleteSession: boolean;
  onBackup: () => void;
  onRestore: (file: File | null | undefined) => Promise<void>;
  onDeleteSession: () => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="analysis-history-header">
      <UiPageHeader
        eyebrow="Rastreabilidade das análises"
        title="Todos os documentos analisados pelo GRCON"
        description="Localize, filtre, compare e investigue cada decisão registrada sem alterar os motores que produziram a análise."
        meta={(
          <>
            <UiMetaPill><strong>{numberBr(props.sessionsCount)}</strong> análise(s)</UiMetaPill>
            <UiMetaPill><strong>{numberBr(props.documentsCount)}</strong> documento(s) no recorte</UiMetaPill>
            <UiMetaPill>Histórico local</UiMetaPill>
          </>
        )}
      />
      <div className="analysis-history-header-tools">
        <details className="analysis-history-manage">
          <summary>Gerenciar histórico</summary>
          <div className="analysis-history-manage-menu">
            <span className="analysis-history-menu-label">Backup e restauração</span>
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
            <span className="analysis-history-menu-label analysis-history-menu-danger-label">Ações destrutivas</span>
            <button
              className="secondary-button analysis-danger-action"
              disabled={!props.canDeleteSession}
              id="analysis-history-delete-session"
              type="button"
              onClick={props.onDeleteSession}
            >
              Excluir análise selecionada
            </button>
            <button className="secondary-button analysis-danger-action" id="analysis-history-clear" type="button" onClick={props.onClear}>Limpar todo o histórico</button>
          </div>
        </details>
      </div>
    </div>
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
    <UiPanel className="analysis-history-unified" labelledBy="analysis-history-unified-title">
      <div className="analysis-history-section-heading">
        <div>
          <span>BUSCA DE RASTREABILIDADE</span>
          <h3 id="analysis-history-unified-title">Histórico de eGRDT + análises</h3>
          <p>Pesquise um ou vários documentos simultaneamente nas duas fontes. Use um item por linha.</p>
        </div>
      </div>
      <div className="analysis-history-unified-grid" id="unified-search">
        <div className="unified-search-input">
          <textarea
            aria-label="Códigos ou nomes de documentos para buscar, um por linha"
            id="unified-search-text"
            placeholder="Ex.: RL-5290.00-22313-91B-C1O-002"
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
          <small>Enter busca · Shift+Enter cria uma nova linha</small>
        </div>

        <div className="analysis-history-trace-results" id="unified-search-results" hidden={!result}>
          <div className="unified-search-result-card">
            <div className="unified-search-result-header"><span>eGRDTs no Histórico</span><strong id="unified-history-count">{result?.historyCount || 0}</strong></div>
            <small>registros de eGRDT correspondentes</small>
          </div>
          <div className="unified-search-result-card">
            <div className="unified-search-result-header"><span>Histórico de análises</span><strong id="unified-analysis-count">{result?.analysisCount || 0}</strong></div>
            <small>documentos analisados correspondentes</small>
          </div>
        </div>
      </div>

      <div className="unified-search-detail" id="unified-search-detail" hidden={!result}>
        {result && (result.historyMatches.length || result.analysisMatches.length) ? (
          <details open>
            <summary>{`Comparar resultados (${result.historyCount} eGRDTs · ${result.analysisCount} análises)`}</summary>
            <div className="analysis-history-trace-groups">
              <div>
                <h4>eGRDT</h4>
                {result.historyMatches.length > 0
                  ? <div className="unified-search-detail-list">
                      {result.historyMatches.map((record) => (
                        <div className="unified-search-detail-item" key={record.id}>
                          <strong title={record.egrdtNumber || ""}>{record.egrdtNumber || "—"}</strong>
                          <small>{`${record.outputType || "Saída"} · ${record.documentCount || 0} docs`}</small>
                        </div>
                      ))}
                    </div>
                  : <p className="unified-search-empty">Nenhuma eGRDT correspondente.</p>}
              </div>
              <div>
                <h4>Análises</h4>
                {result.analysisMatches.length > 0
                  ? <div className="unified-search-detail-list">
                      {result.analysisMatches.map((item) => (
                        <div className="unified-search-detail-item" key={item.id}>
                          <strong title={item.document || ""}>{item.document || "—"}</strong>
                          <small>{`${item.statusDelivered || "—"} · ${item.allocationStatus || "—"}`}</small>
                        </div>
                      ))}
                    </div>
                  : <p className="unified-search-empty">Nenhuma análise correspondente.</p>}
              </div>
            </div>
          </details>
        ) : result ? <p className="unified-search-empty">Nenhum documento encontrado para os termos pesquisados.</p> : null}
      </div>
    </UiPanel>
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
    <div>
      <div aria-label="Filtros do histórico de análises" className="analysis-history-toolbar">
        <label className="analysis-history-search-field" aria-label="Busca geral">
          <span>Buscar no histórico</span>
          <span className="analysis-history-search-control">
            <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10" cy="10" r="6" /><path d="M14.5 14.5L21 21" /></svg>
            <input
              autoComplete="off"
              id="analysis-history-search"
              placeholder="Documento, título, motivo, GRDT, alocação…"
              type="search"
              value={props.filters.query}
              onChange={(event) => props.onFilter("query", event.target.value)}
            />
          </span>
        </label>
        <label>
          <span>Situação</span>
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
        <label className="analysis-history-session-filter">
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
      </div>
      {props.periodInvalid
        ? <p className="analysis-history-period-error" role="alert">A data final deve ser igual ou posterior à data inicial.</p>
        : null}
    </div>
  );
}

export function QuickAndSavedFilters(props: {
  filters: AnalysisHistoryFilters;
  savedFilters: SavedAnalysisFilter[];
  selectedId: string;
  onQuick: (kind: string) => void;
  onSelectSaved: (id: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const quick = [
    ["today", "Hoje"],
    ["7days", "Últimos 7 dias"],
    ["pending", "Pendências"],
    ["included", "Incluídos"],
  ] as const;
  return (
    <div className="analysis-history-filter-extras">
      <div className="analysis-history-quick" aria-label="Filtros rápidos">
        {quick.map(([kind, label]) => {
          const active = quickFilterActive(props.filters, kind);
          return (
            <button
              type="button"
              className={active ? "is-active" : ""}
              aria-pressed={active}
              data-analysis-quick={kind}
              key={kind}
              onClick={() => props.onQuick(kind)}
            >
              {label}
            </button>
          );
        })}
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
    </div>
  );
}

export function SummaryCards(props: {
  summary: AnalysisSummary;
  activeStatus: string;
  onStatus: (status: string) => void;
}) {
  const entries: Array<{ label: string; value: number; tone: string; status?: string }> = [
    { label: "Análises", value: props.summary.sessions || 0, tone: "neutral" },
    { label: "Documentos", value: props.summary.total || 0, tone: "neutral" },
    { label: "Incluir", value: props.summary.counts.READY || 0, tone: "ready", status: "READY" },
    { label: "Não incluir", value: props.summary.counts.BLOCKED || 0, tone: "blocked", status: "BLOCKED" },
    { label: "Aguardar", value: props.summary.counts.DISCARD || 0, tone: "discard", status: "DISCARD" },
    { label: "Conferir", value: props.summary.counts.REVIEW || 0, tone: "review", status: "REVIEW" },
  ];
  return (
    <section aria-label="Resumo das análises" className="analysis-history-summary" id="analysis-history-summary">
      {entries.map((entry) => entry.status ? (
        <button
          className={`analysis-history-kpi ${entry.tone}`}
          key={entry.label}
          type="button"
          aria-pressed={props.activeStatus === entry.status}
          onClick={() => props.onStatus(props.activeStatus === entry.status ? "ALL" : entry.status!)}
        >
          <span>{entry.label}</span><strong>{numberBr(entry.value)}</strong><small>Filtrar por situação</small>
        </button>
      ) : (
        <div className={`analysis-history-kpi ${entry.tone}`} key={entry.label}>
          <span>{entry.label}</span><strong>{numberBr(entry.value)}</strong><small>No recorte atual</small>
        </div>
      ))}
    </section>
  );
}

function HistoryRow({ item, onOpen }: { item: AnalysisDocument; onOpen: (item: AnalysisDocument) => void }) {
  const analyzed = Adapter.dateParts(item.analyzedAt);
  const currentRevision = item.currentRevision || "—";
  const targetRevision = item.targetRevision || "—";
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
      <td className="analysis-cell-document" data-label="Documento"><strong title={item.document || ""}>{item.document || "—"}</strong>{item.title && <small title={item.title}>{item.title}</small>}</td>
      <td className="analysis-cell-result" data-label="Resultado GRCON"><span className={`analysis-status-chip ${Adapter.statusClass(item.statusDelivered)}`}>{item.statusDelivered || "—"}</span></td>
      <td className="analysis-cell-revisions" data-label="Revisões" aria-label={`Revisão atual ${currentRevision}; próxima revisão ${targetRevision}`}>
        <strong>{currentRevision}<span aria-hidden="true"> → </span>{targetRevision}</strong>
        {item.targetRevisionStatus && <small>{item.targetRevisionStatus}</small>}
      </td>
      <td className="analysis-cell-sigem" data-label="SIGEM"><span className={`analysis-sigem-chip ${Adapter.sigemClass(item.sigemStatus)}`}>{item.sigemStatus || "—"}</span></td>
      <td className="analysis-cell-allocation" data-label="Alocação"><strong>{item.allocationStatus || "—"}</strong>{item.allocation && <small title={item.allocation}>{item.allocation}</small>}</td>
      <td className="analysis-cell-date" data-label="Analisado em"><strong>{analyzed.date}</strong>{analyzed.time && <small>{analyzed.time}</small>}</td>
      <td className="analysis-cell-ld" data-label="LD"><strong>{item.ldVersion || "—"}</strong>{(item.sheet || item.ldRow) && <small>{[item.sheet, item.ldRow ? `linha ${item.ldRow}` : ""].filter(Boolean).join(" · ")}</small>}</td>
      <td className="analysis-cell-reason" data-label="Motivo"><strong>{item.reasonCode || "—"}</strong>{item.reason && <small title={item.reason}>{item.reason}</small>}</td>
    </tr>
  );
}

function activeFilterLabels(filters: AnalysisHistoryFilters): string[] {
  const labels: string[] = [];
  if (filters.query.trim()) labels.push(`Busca: ${filters.query.trim()}`);
  if (filters.status !== "ALL") labels.push(STATUS_LABEL[filters.status] || filters.status);
  if (filters.startDate || filters.endDate) labels.push(`Período: ${filters.startDate || "…"} → ${filters.endDate || "…"}`);
  if (filters.sessionId) labels.push("Análise específica");
  return labels;
}

export function ResultsCard(props: {
  rows: AnalysisDocument[];
  total: number;
  allTotal: number;
  filters: AnalysisHistoryFilters;
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
  const filters = activeFilterLabels(props.filters);
  const resultLabel = filters.length && props.allTotal
    ? `Exibindo ${numberBr(props.total)} de ${numberBr(props.allTotal)}`
    : `${numberBr(props.total)} documento(s)`;

  return (
    <UiPanel className="analysis-history-results" labelledBy="analysis-history-results-title">
      <header className="analysis-history-results-header">
        <div>
          <span>RESULTADOS</span>
          <h3 id="analysis-history-results-title">Documentos analisados</h3>
          <strong id="analysis-history-result-count">{resultLabel}</strong>
        </div>
        <button
          className="primary-button"
          disabled={!props.total || props.exporting || props.periodInvalid || !props.hasReport}
          id="analysis-history-export"
          type="button"
          onClick={props.onExport}
        >
          {exportLabel}
        </button>
      </header>

      {filters.length ? (
        <div className="analysis-history-active-filters" aria-label="Filtros ativos">
          {filters.map((label) => <span key={label}>{label}</span>)}
        </div>
      ) : null}

      <div className="analysis-history-table-hint">
        <span>Rastreabilidade detalhada</span>
        <small>Selecione uma linha para evidências, comparação, timeline e eGRDT relacionada.</small>
      </div>

      <div className="analysis-history-table-wrap">
        <table className="analysis-history-table">
          <colgroup>
            <col className="analysis-col-document" /><col className="analysis-col-result" /><col className="analysis-col-revisions" />
            <col className="analysis-col-sigem" /><col className="analysis-col-allocation" /><col className="analysis-col-date" />
            <col className="analysis-col-ld" /><col className="analysis-col-reason" />
          </colgroup>
          <thead><tr><th>Documento</th><th>Resultado GRCON</th><th>Revisões</th><th>SIGEM</th><th>Alocação</th><th>Analisado em</th><th>LD</th><th>Motivo</th></tr></thead>
          <tbody id="analysis-history-body">
            {props.loading
              ? <tr><td colSpan={8} className="analysis-history-loading">Carregando histórico…</td></tr>
              : props.error
                ? <tr><td colSpan={8} className="analysis-history-loading error">{props.error}</td></tr>
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
    </UiPanel>
  );
}

function DetailField({ label, value, wide = false }: { label: string; value: unknown; wide?: boolean }) {
  return <div className={wide ? "analysis-detail-field analysis-detail-field-wide" : "analysis-detail-field"}><dt>{label}</dt><dd>{String(value || "—")}</dd></div>;
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

  const item = props.detail.item;
  const context = props.detail.context;
  return (
    <UiDrawer
      open={open}
      onClose={props.onClose}
      labelledBy="analysis-history-detail-title"
      drawerClassName="analysis-history-detail-panel"
      overlayClassName="analysis-history-detail-overlay"
      drawerId="analysis-history-detail"
      overlayId="analysis-history-detail-overlay"
    >
      <header className="analysis-history-detail-head">
        <div><span>COMPARAÇÃO E EVIDÊNCIAS</span><h3 id="analysis-history-detail-title">{item?.document || "Documento analisado"}</h3></div>
        <button ref={closeRef} aria-label="Fechar detalhes" className="icon-button" id="analysis-history-detail-close" type="button" onClick={props.onClose}>×</button>
      </header>
      <div className="analysis-history-detail-body" id="analysis-history-detail-body">
        {props.detail.loading && <div className="analysis-detail-card analysis-detail-loading"><strong>Carregando comparação…</strong></div>}
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
              <DetailField label="Caminho Databook" value={item.databook} wide />
            </dl></section>

            <section className="analysis-detail-card"><h4>Evidência e motivo</h4><dl className="analysis-detail-grid">
              <DetailField label="Código do motivo" value={item.reasonCode} />
              <DetailField label="Explicação" value={item.reason} wide />
              <DetailField label="Comentário da Fiscal" value={item.fiscalComment} wide />
              <DetailField label="Origem da entrada" value={item.inputSource} />
              <DetailField label="Arquivos originais" value={item.originalFiles} wide />
              <DetailField label="Arquivos finais" value={item.finalFiles} wide />
            </dl>
              <div className="analysis-detail-comparison">
                <strong>Comparação com análise anterior</strong>
                {context.changes.length
                  ? <ul>{context.changes.map((change) => <li key={change}>{change}</li>)}</ul>
                  : <p>Nenhuma mudança material em relação à análise anterior localizada.</p>}
              </div>
            </section>

            <section className="analysis-detail-card"><h4>Linha do tempo deste documento</h4>
              {context.timeline.length ? (
                <ol className="analysis-timeline">
                  {[...context.timeline].reverse().map((entry) => (
                    <li key={entry.id}>
                      <div className="analysis-timeline-top">
                        <time>{Adapter.formatDate(entry.analyzedAt, true)}</time>
                        <span className={`analysis-status-chip ${Adapter.statusClass(entry.statusDelivered)}`}>{entry.statusDelivered || "—"}</span>
                      </div>
                      <div className="analysis-timeline-meta"><strong>{`Rev. ${entry.currentRevision || "—"} → ${entry.targetRevision || "—"}`}</strong><span>{`SIGEM: ${entry.sigemStatus || "—"}`}</span></div>
                      <small>{entry.changes?.length ? entry.changes.join(" · ") : entry.reason || "Primeiro registro localizado"}</small>
                    </li>
                  ))}
                </ol>
              ) : <p>Nenhuma análise anterior localizada.</p>}
            </section>

            <section className="analysis-detail-card analysis-related-egrdt"><h4>eGRDT relacionada</h4>
              {context.related ? (
                <>
                  <div className="analysis-related-egrdt-summary">
                    <strong>{context.related.egrdtNumber}</strong>
                    <span>{Adapter.formatDate(context.related.generatedAt, true)}</span>
                    <span>{numberBr(context.related.documentCount || 0)} documento(s)</span>
                  </div>
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
    </UiDrawer>
  );
}
