import type {
  DeleteRecordResult,
  HistoryFilters,
  HistoryRecord,
  HistorySummary,
  HistoryUiSnapshot,
  ParsedEgrdtNumber,
  PostingBadgeView,
  PostingIndexes,
  PostingRecord,
  RevisionRelation,
  WorkflowStep,
} from "../types/domain";
import type { HistoricoEgrdtsLegacyWindow } from "../types/legacy-globals";

const LIST_PAGE_SIZE = 200;
const SEARCH_DEBOUNCE_MS = 120;
const REFRESH_EVENT = "grcon:historico-egrdts-react-refresh";
const SELECT_EVENT = "grcon:historico-egrdts-react-select";
const ACTIVATE_EVENT = "grcon:historico-egrdts-react-activate";

let historyReportWorker: Worker | null = null;
let latestSnapshot: HistoryUiSnapshot = {
  selectedId: "",
  filtered: [],
  performance: {
    lastRenderMs: 0,
    postingReadsLastRender: 0,
    renderedRecords: 0,
    totalFiltered: 0,
    postingCount: 0,
    totalRecords: 0,
  },
};

function legacy(): HistoricoEgrdtsLegacyWindow {
  return window as unknown as HistoricoEgrdtsLegacyWindow;
}

function history() {
  const api = legacy().GrconHistory;
  if (!api) throw new Error("GrconHistory não foi carregado.");
  return api;
}

function report() {
  const api = legacy().GrconHistoryReport;
  if (!api) throw new Error("GrconHistoryReport não foi carregado.");
  return api;
}

function posting() {
  return legacy().GrconSigemPosting || null;
}

function flow() {
  return legacy().GrconMacro5Flow || null;
}

function appVersion(): string {
  return legacy().GrconConfig?.APP_VERSION
    || document.documentElement.dataset.version
    || "5.41.0";
}

function nowMs(): number {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

function notify(message: string, kind = "info"): void {
  if (typeof legacy().GrconNotify === "function") legacy().GrconNotify?.(message, kind);
  else if (kind === "error") window.alert(message);
}

function formatDate(value: unknown, withTime = true): string {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", withTime
    ? { dateStyle: "short", timeStyle: "short" }
    : { dateStyle: "short" }).format(date);
}

function readHistory(): HistoryRecord[] {
  return history().read();
}

function readPostings(): PostingRecord[] {
  return posting()?.read?.() || [];
}

function createPostingIndexes(postings: PostingRecord[]): PostingIndexes {
  const byHistoryId = new Map<string, PostingRecord>();
  const byId = new Map<string, PostingRecord>();
  const byEgrdt = new Map<string, PostingRecord>();
  postings.forEach((item) => {
    if (item.historyId && !byHistoryId.has(item.historyId)) byHistoryId.set(item.historyId, item);
    if (item.id && !byId.has(item.id)) byId.set(item.id, item);
    if (item.egrdtNumber && !byEgrdt.has(item.egrdtNumber)) byEgrdt.set(item.egrdtNumber, item);
  });
  return { byHistoryId, byId, byEgrdt };
}

function postingRecord(record: HistoryRecord | null | undefined, indexes: PostingIndexes): PostingRecord | null {
  if (!record) return null;
  return indexes.byHistoryId.get(record.id)
    || indexes.byId.get(record.id)
    || indexes.byEgrdt.get(record.egrdtNumber)
    || null;
}

function parsedNumber(record: HistoryRecord): ParsedEgrdtNumber | null {
  const year = new Date(record.generatedAt || Date.now()).getFullYear();
  return history().normalizeEgrdtNumber(record.egrdtNumber, year);
}

function filterRecords(records: HistoryRecord[], filters: HistoryFilters, indexes: PostingIndexes): HistoryRecord[] {
  let filtered = history().filter(records, filters.query);
  if (filters.year) {
    filtered = filtered.filter((record) => String(parsedNumber(record)?.year || "") === filters.year);
  }
  if (filters.outputType) {
    filtered = filtered.filter((record) => record.outputType === filters.outputType);
  }
  if (filters.postingStatus) {
    filtered = filtered.filter((record) => {
      const item = postingRecord(record, indexes);
      return filters.postingStatus === "AGUARDANDO"
        ? !item
        : item?.status === filters.postingStatus;
    });
  }
  filtered = history().filterByDate(filtered, filters.startDate, filters.endDate);
  filtered = history().filterByDocumentFamily(filtered, filters.documentFamily || "");

  return [...filtered].sort((left, right) => {
    if (filters.sort === "oldest") return left.generatedAt.localeCompare(right.generatedAt);
    if (filters.sort === "number-asc" || filters.sort === "number-desc") {
      const first = parsedNumber(left)?.sequence || 0;
      const second = parsedNumber(right)?.sequence || 0;
      return filters.sort === "number-asc" ? first - second : second - first;
    }
    return right.generatedAt.localeCompare(left.generatedAt);
  });
}

function summary(records: HistoryRecord[], indexes: PostingIndexes): HistorySummary {
  const base = history().summary(records);
  const postingRecords = records.map((record) => postingRecord(record, indexes));
  const Posting = posting();
  return {
    egrdts: base.egrdts,
    documents: base.documents,
    allocations: base.allocations,
    awaiting: postingRecords.filter((record) => !record).length,
    posted: postingRecords.filter((record) => record?.status === Posting?.STATUSES?.POSTADO).length,
    attention: postingRecords.filter((record) => (
      record?.status === Posting?.STATUSES?.PENDENCIA
      || record?.status === Posting?.STATUSES?.FALHA
    )).length,
  };
}

function postingBadge(record: HistoryRecord, indexes: PostingIndexes): PostingBadgeView {
  const Posting = posting();
  const item = postingRecord(record, indexes);
  const status = item?.status || Posting?.STATUSES?.GERADO || "GERADO";
  return {
    status,
    label: item && Posting ? Posting.statusLabel(status) : "Aguardando preparação",
    tone: flow()?.postingTone?.(status) || "neutral",
  };
}

function postingWorkflow(record: HistoryRecord, postings: PostingRecord[], indexes: PostingIndexes): WorkflowStep[] {
  const Posting = posting();
  const item = postingRecord(record, indexes);
  const audit = item && Posting ? Posting.audit(item, postings) : { ready: false };
  return flow()?.workflowSteps?.(item?.status || "GERADO", Boolean(audit.ready)) || [];
}

function revisionRelation(record: HistoryRecord, file: HistoryRecord["files"][number], postings: PostingRecord[]): RevisionRelation {
  return {
    generated: history().generatedRevision(file) || "—",
    ...report().revisionRelation(record, file, postings),
  };
}

function periodLabel(records: HistoryRecord[], filters: HistoryFilters): string {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) return "Período inválido";
  const label = report().periodLabel(records, filters.startDate, filters.endDate);
  const family = filters.documentFamily || "Todos";
  return `${label} · Tipo: ${family} · ${records.length.toLocaleString("pt-BR")} eGRDT(s)`;
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function buildWorkbookInWorker(records: HistoryRecord[], options: Record<string, unknown>): Promise<ArrayBuffer | null> {
  const webOrigin = location.protocol === "http:" || location.protocol === "https:";
  if (typeof Worker !== "function" || !webOrigin) return Promise.resolve(null);

  try {
    if (!historyReportWorker) historyReportWorker = new Worker("history_report_worker.js");
  } catch (error) {
    historyReportWorker = null;
    return Promise.reject(error instanceof Error ? error : new Error("Falha ao iniciar o worker de relatório."));
  }

  const worker = historyReportWorker;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };
    const failWorker = (error: unknown) => {
      cleanup();
      worker.terminate();
      if (historyReportWorker === worker) historyReportWorker = null;
      reject(error instanceof Error ? error : new Error("Falha no worker de relatório."));
    };
    const onMessage = (event: MessageEvent) => {
      const payload = event.data as { type?: string; ok?: boolean; buffer?: ArrayBuffer; error?: string } | null;
      if (!payload || payload.type !== "history-report-result") return;
      cleanup();
      if (payload.ok && payload.buffer) resolve(payload.buffer);
      else reject(new Error(payload.error || "Falha ao gerar relatório no worker."));
    };
    const onError = (event: ErrorEvent) => failWorker(event.error || new Error(event.message || "Falha no worker de relatório."));

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    try {
      worker.postMessage({ type: "history-report-build", records, options });
    } catch (error) {
      failWorker(error);
    }
  });
}

async function exportPeriod(records: HistoryRecord[], filters: HistoryFilters): Promise<number> {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    throw new Error("A data final deve ser igual ou posterior à data inicial.");
  }
  if (!records.length) return 0;

  await legacy().GRCONModuleLoader?.ensure?.("excel");
  await legacy().GRCONModuleLoader?.ensure?.("brand");

  const options = {
    startDate: filters.startDate,
    endDate: filters.endDate,
    documentFamily: filters.documentFamily || "",
    appVersion: appVersion(),
    brandAssets: legacy().GRCONBrandAssets,
  };
  const workerBuffer = await buildWorkbookInWorker(records, options).catch(() => null);
  const buffer = workerBuffer || await report().buildWorkbook(records, options);
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    report().downloadName(records, options),
  );
  return records.length;
}

function updateNumber(record: HistoryRecord, value: string) {
  const result = history().updateNumber(record.id, value);
  if (!result.updated || !result.record) return result;
  legacy().GrconEgrdtSequence?.syncFromNumber?.(result.record.egrdtNumber);
  window.dispatchEvent(new CustomEvent("grcon:history-updated", {
    detail: {
      renamed: true,
      previous: result.previous,
      current: result.record.egrdtNumber,
    },
  }));
  return result;
}

function canDelete(): boolean {
  const Cloud = legacy().GrconCloud;
  return !Cloud?.state?.membership || Boolean(Cloud.canManageHistory?.());
}

async function deleteRecord(record: HistoryRecord): Promise<DeleteRecordResult> {
  const Cloud = legacy().GrconCloud;
  const shared = Boolean(Cloud?.state?.membership?.workspace_id);
  const confirmed = window.confirm(
    `Excluir somente ${record.egrdtNumber} do histórico ${shared ? "compartilhado" : "local"}?\n\n`
      + `${shared ? "A reserva desse número também será removida e ele poderá ser usado novamente. " : ""}`
      + "Os arquivos já baixados e os registros da fila SIGEM não serão alterados.",
  );
  if (!confirmed) return { deleted: false, records: readHistory() };

  let cloudResult: unknown = null;
  if (shared) {
    if (!Cloud?.deleteHistoryRecord) throw new Error("Atualize o GRCON para concluir a exclusão no Supabase.");
    cloudResult = await Cloud.deleteHistoryRecord(record);
  }

  const result = history().deleteOne(record.id);
  if (!result.deleted) throw new Error(result.error || "Não foi possível excluir esta eGRDT.");

  window.dispatchEvent(new CustomEvent("grcon:history-updated", {
    detail: {
      deleted: true,
      recordId: record.clientRecordId || record.id,
      cloudId: record.cloudId || "",
      workspaceId: record.workspaceId || "",
      reservationIds: record.reservationIds || [],
      cloudDeleted: Boolean(cloudResult),
    },
  }));
  notify(
    shared
      ? `eGRDT excluída do histórico compartilhado. O número ${record.egrdtNumber} foi liberado para reutilização.`
      : "eGRDT excluída do histórico local.",
    "success",
  );
  return result;
}

async function clearHistory(records: HistoryRecord[]): Promise<boolean> {
  if (!records.length) return false;
  const Cloud = legacy().GrconCloud;
  const shared = Boolean(Cloud?.state?.membership?.workspace_id);
  const question = shared
    ? "Limpar todo o histórico compartilhado de eGRDTs?\n\nOs registros serão apagados também do Supabase e as numerações consumidas serão liberadas para reutilização."
    : "Limpar todo o histórico de eGRDTs salvo neste navegador?";
  if (!window.confirm(question)) return false;

  if (shared) {
    if (!Cloud?.clearHistory) throw new Error("A limpeza compartilhada não está disponível.");
    const cleared = await Cloud.clearHistory();
    if (!cleared) return false;
    window.dispatchEvent(new CustomEvent("grcon:history-updated"));
    return true;
  }

  if (!history().clear()) return false;
  window.dispatchEvent(new CustomEvent("grcon:history-updated"));
  return true;
}

async function prepareForSigem(record: HistoryRecord): Promise<void> {
  const Posting = posting();
  if (!Posting) throw new Error("O módulo de postagem SIGEM não está disponível.");
  const saved = Posting.registerGenerated([record], { appVersion: appVersion() }) as PostingRecord & {
    persistence?: Promise<unknown>;
    created?: PostingRecord[];
  };
  if (saved?.persistence) await saved.persistence.catch(() => null);

  await legacy().GRCONModuleLoader?.ensureModule?.("sigem");
  const postings = readPostings();
  const indexes = createPostingIndexes(postings);
  const item = postingRecord(record, indexes);
  if (item) legacy().GrconSigemUi?.select?.(item.id);
  window.dispatchEvent(new CustomEvent("grcon:sigem-updated", {
    detail: { record: item, preparedFromHistory: true },
  }));
  notify("eGRDT preparada na fila de postagem SIGEM.", "success");
}

function openTeams(record: HistoryRecord): void {
  const api = legacy().GrconEgrdtTeamsNotification;
  if (!api) {
    notify("O aviso para o Teams não está disponível nesta sessão.", "error");
    return;
  }
  api.open(record);
}

function teamsState(record: HistoryRecord): { sent: boolean; label: string; buttonLabel: string } {
  const api = legacy().GrconEgrdtTeamsNotification;
  if (!api) return { sent: false, label: "", buttonLabel: "Avisar no Teams" };
  const sent = Boolean(api.status(record));
  return {
    sent,
    label: api.statusLabel(record),
    buttonLabel: sent ? "Reenviar aviso no Teams" : "Avisar no Teams",
  };
}

function openEmailReply(record: HistoryRecord): void {
  if (!legacy().GrconEgrdtEmailReplyUi) {
    notify("O painel da resposta de e-mail não está disponível nesta sessão.", "error");
    return;
  }
  legacy().GrconEgrdtEmailReplyUi?.open([record]);
}

function updateTabCount(count: number): void {
  const element = document.getElementById("history-tab-count");
  if (!element) return;
  element.textContent = String(count);
  element.hidden = count === 0;
}

function activateShell(view = "history"): void {
  const modules: Record<string, string> = {
    control: "grdt-module",
    "analysis-history": "analysis-history-module",
    history: "history-module",
    dashboard: "dashboard-module",
    sigem: "sigem-module",
    requests: "requests-module",
    "pdf-tools": "pdf-tools-module",
  };
  Object.entries(modules).forEach(([key, id]) => {
    const node = document.getElementById(id);
    if (node) node.hidden = key !== view;
  });
  document.querySelectorAll<HTMLElement>("[data-grcon-view]").forEach((button) => {
    const active = button.dataset.grconView === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  if (view === "analysis-history") {
    legacy().GrconAnalysisHistoryUi?.render?.();
    window.setTimeout(() => document.getElementById("analysis-history-search")?.focus(), 0);
  } else if (view === "history") {
    requestRefresh();
    window.setTimeout(() => document.getElementById("history-search")?.focus(), 0);
  } else if (view === "sigem") {
    legacy().GrconSigemUi?.render?.();
    window.setTimeout(() => document.getElementById("sigem-search")?.focus(), 0);
  }
}

function setSnapshot(snapshot: HistoryUiSnapshot): void {
  latestSnapshot = snapshot;
  legacy().__grconHistoricoEgrdtsSnapshot = snapshot;
}

function getSnapshot(): HistoryUiSnapshot {
  return latestSnapshot;
}

function requestRefresh(): void {
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
}

function requestSelect(id: string): void {
  window.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: { id } }));
}

function requestActivate(view = "history"): void {
  activateShell(view);
  window.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: { view } }));
}

function subscribeRefresh(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(REFRESH_EVENT, handler);
  return () => window.removeEventListener(REFRESH_EVENT, handler);
}

function subscribeSelect(callback: (id: string) => void): () => void {
  const handler = (event: Event) => {
    const id = String((event as CustomEvent<{ id?: string }>).detail?.id || "");
    if (id) callback(id);
  };
  window.addEventListener(SELECT_EVENT, handler);
  return () => window.removeEventListener(SELECT_EVENT, handler);
}

function subscribeActivate(callback: (view: string) => void): () => void {
  const handler = (event: Event) => callback(String((event as CustomEvent<{ view?: string }>).detail?.view || "history"));
  window.addEventListener(ACTIVATE_EVENT, handler);
  return () => window.removeEventListener(ACTIVATE_EVENT, handler);
}

export const historicoEgrdtsAdapter = {
  LIST_PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
  nowMs,
  notify,
  formatDate,
  readHistory,
  readPostings,
  createPostingIndexes,
  postingRecord,
  parsedNumber,
  filterRecords,
  summary,
  postingBadge,
  postingWorkflow,
  revisionRelation,
  periodLabel,
  exportPeriod,
  updateNumber,
  canDelete,
  deleteRecord,
  clearHistory,
  prepareForSigem,
  openTeams,
  teamsState,
  openEmailReply,
  updateTabCount,
  activateShell,
  setSnapshot,
  getSnapshot,
  requestRefresh,
  requestSelect,
  requestActivate,
  subscribeRefresh,
  subscribeSelect,
  subscribeActivate,
  historyStorageKey: () => history().STORAGE_KEY,
};
