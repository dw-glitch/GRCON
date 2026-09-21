import type {
  DeleteOneResult,
  EgrdtHistoryFile,
  EgrdtHistoryFilterOptions,
  EgrdtHistoryFilters,
  EgrdtHistoryRecord,
  EgrdtHistorySummary,
  HistoryPerformanceSnapshot,
  PostingCache,
  PostingRecord,
  RevisionRelation,
  UpdateNumberResult,
  WorkflowStep,
} from "../types/domain";

const REFRESH_EVENT = "grcon:history-react-refresh";
const SELECT_EVENT = "grcon:history-react-select";
let reportWorker: Worker | null = null;
let performanceSnapshot: HistoryPerformanceSnapshot = {
  lastRenderMs: 0,
  postingReadsLastRender: 0,
  renderedRecords: 0,
  totalFiltered: 0,
  postingCount: 0,
  totalRecords: 0,
};

const compatibilityState: {
  react: true;
  filtered: EgrdtHistoryRecord[];
  selectedId: string;
} = {
  react: true,
  filtered: [],
  selectedId: "",
};

function history() {
  if (!window.GrconHistory) throw new Error("GrconHistory não foi carregado.");
  return window.GrconHistory;
}

function report() {
  if (!window.GrconHistoryReport) throw new Error("GrconHistoryReport não foi carregado.");
  return window.GrconHistoryReport;
}

function appVersion(): string {
  return window.GrconConfig?.APP_VERSION
    || document.documentElement.dataset.version
    || "5.41.0";
}

function notify(message: string, kind = "info"): void {
  if (typeof window.GrconNotify === "function") window.GrconNotify(message, kind);
  else if (kind === "error") window.alert(message);
}

function formatDate(value: unknown, withTime = false): string {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", withTime
    ? { dateStyle: "short", timeStyle: "short" }
    : { dateStyle: "short" }).format(date);
}

function parsedNumber(record: EgrdtHistoryRecord) {
  const generatedYear = new Date(record.generatedAt || Date.now()).getFullYear();
  return history().normalizeEgrdtNumber(record.egrdtNumber, generatedYear);
}

function readRecords(): EgrdtHistoryRecord[] {
  return history().read() as unknown as EgrdtHistoryRecord[];
}

function readPostingCache(): PostingCache {
  const Posting = window.GrconSigemPosting;
  const records = Posting?.read?.() || [];
  const byHistoryId = new Map<string, PostingRecord>();
  const byId = new Map<string, PostingRecord>();
  const byEgrdt = new Map<string, PostingRecord>();
  records.forEach((item) => {
    if (item.historyId && !byHistoryId.has(item.historyId)) byHistoryId.set(item.historyId, item);
    if (item.id && !byId.has(item.id)) byId.set(item.id, item);
    if (item.egrdtNumber && !byEgrdt.has(item.egrdtNumber)) byEgrdt.set(item.egrdtNumber, item);
  });
  return { records, byHistoryId, byId, byEgrdt, reads: Posting ? 1 : 0 };
}

function postingRecord(cache: PostingCache, record: EgrdtHistoryRecord): PostingRecord | null {
  return cache.byHistoryId.get(record.id)
    || cache.byId.get(record.id)
    || cache.byEgrdt.get(record.egrdtNumber)
    || null;
}

function filterOptions(records: EgrdtHistoryRecord[]): EgrdtHistoryFilterOptions {
  const years = [...new Set(records.map((record) => parsedNumber(record)?.year).filter(Boolean).map(String))]
    .sort((a, b) => Number(b) - Number(a));
  const outputTypes = [...new Set(records.map((record) => record.outputType).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { years, outputTypes };
}

function filterRecords(
  records: EgrdtHistoryRecord[],
  filters: EgrdtHistoryFilters,
  cache: PostingCache,
): EgrdtHistoryRecord[] {
  const History = history();
  let filtered = History.filter(records, filters.query) as unknown as EgrdtHistoryRecord[];
  if (filters.year) filtered = filtered.filter((record) => String(parsedNumber(record)?.year || "") === filters.year);
  if (filters.outputType) filtered = filtered.filter((record) => record.outputType === filters.outputType);
  if (filters.postingStatus) {
    filtered = filtered.filter((record) => {
      const posting = postingRecord(cache, record);
      return filters.postingStatus === "AGUARDANDO"
        ? !posting
        : posting?.status === filters.postingStatus;
    });
  }
  filtered = History.filterByDate(filtered, filters.startDate, filters.endDate) as unknown as EgrdtHistoryRecord[];
  if (typeof History.filterByDocumentFamily === "function") {
    filtered = History.filterByDocumentFamily(filtered, filters.documentFamily) as unknown as EgrdtHistoryRecord[];
  }
  return [...filtered].sort((a, b) => {
    if (filters.sort === "oldest") return a.generatedAt.localeCompare(b.generatedAt);
    if (filters.sort === "number-asc" || filters.sort === "number-desc") {
      const first = parsedNumber(a)?.sequence || 0;
      const second = parsedNumber(b)?.sequence || 0;
      return filters.sort === "number-asc" ? first - second : second - first;
    }
    return b.generatedAt.localeCompare(a.generatedAt);
  });
}

function summary(records: EgrdtHistoryRecord[], cache: PostingCache): EgrdtHistorySummary {
  const base = history().summary(records);
  const postingRecords = records.map((record) => postingRecord(cache, record));
  const statuses = window.GrconSigemPosting?.STATUSES || {};
  return {
    egrdts: base.egrdts,
    documents: base.documents,
    allocations: base.allocations,
    awaiting: postingRecords.filter((record) => !record).length,
    posted: postingRecords.filter((record) => record?.status === statuses.POSTADO).length,
    attention: postingRecords.filter((record) => [statuses.PENDENCIA, statuses.FALHA].includes(record?.status || "")).length,
  };
}

function postingPresentation(cache: PostingCache, record: EgrdtHistoryRecord): { label: string; tone: string } {
  const posting = postingRecord(cache, record);
  const Posting = window.GrconSigemPosting;
  const status = posting?.status || Posting?.STATUSES?.GERADO || "GERADO";
  return {
    label: posting && Posting ? Posting.statusLabel(status) : "Aguardando preparação",
    tone: window.GrconMacro5Flow?.postingTone?.(status) || "neutral",
  };
}

function workflow(cache: PostingCache, record: EgrdtHistoryRecord): WorkflowStep[] {
  const posting = postingRecord(cache, record);
  const Posting = window.GrconSigemPosting;
  const audit = posting && Posting ? Posting.audit(posting, cache.records) : { ready: false };
  return window.GrconMacro5Flow?.workflowSteps?.(posting?.status || "GERADO", Boolean(audit.ready)) || [];
}

function revisionRelation(
  record: EgrdtHistoryRecord,
  file: EgrdtHistoryFile,
  postings: PostingRecord[],
): RevisionRelation {
  return {
    generated: history().generatedRevision(file) || "—",
    ...report().revisionRelation(record, file, postings),
  };
}

function periodLabel(records: EgrdtHistoryRecord[], filters: EgrdtHistoryFilters): string {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) return "Período inválido";
  const label = window.GrconHistoryReport
    ? window.GrconHistoryReport.periodLabel(records, filters.startDate, filters.endDate)
    : "Período selecionado";
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

function buildWorkbookInWorker(records: EgrdtHistoryRecord[], options: Record<string, unknown>): Promise<ArrayBuffer | null> {
  const webOrigin = location.protocol === "http:" || location.protocol === "https:";
  if (typeof Worker !== "function" || !webOrigin) return Promise.resolve(null);
  try {
    if (!reportWorker) reportWorker = new Worker("history_report_worker.js");
  } catch (error) {
    reportWorker = null;
    return Promise.reject(error);
  }
  const worker = reportWorker;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };
    const onMessage = (event: MessageEvent) => {
      const payload = event.data || {};
      if (payload.type !== "history-report-result") return;
      cleanup();
      if (payload.ok) resolve(payload.buffer);
      else reject(new Error(payload.error || "Falha ao gerar relatório no worker."));
    };
    const onError = (error: ErrorEvent) => {
      cleanup();
      worker.terminate();
      if (reportWorker === worker) reportWorker = null;
      reject(error.error instanceof Error ? error.error : new Error("Falha no worker de relatório."));
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage({ type: "history-report-build", records, options });
  });
}

async function exportPeriodReport(records: EgrdtHistoryRecord[], filters: EgrdtHistoryFilters): Promise<void> {
  if (!records.length) return;
  const HistoryReport = report();
  await window.GRCONModuleLoader?.ensure?.("excel");
  await window.GRCONModuleLoader?.ensure?.("brand");
  const options = {
    startDate: filters.startDate,
    endDate: filters.endDate,
    documentFamily: filters.documentFamily,
    appVersion: appVersion(),
    brandAssets: window.GRCONBrandAssets,
  };
  const workerBuffer = await buildWorkbookInWorker(records, options).catch(() => null);
  const buffer = workerBuffer || await HistoryReport.buildWorkbook(records, options);
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    HistoryReport.downloadName(records, options),
  );
}

function updateNumber(recordId: string, value: string): UpdateNumberResult {
  return history().updateNumber(recordId, value) as unknown as UpdateNumberResult;
}

function canDeleteHistory(): boolean {
  return !window.GrconCloud?.state?.membership || Boolean(window.GrconCloud.canManageHistory?.());
}

function isSharedHistory(): boolean {
  return Boolean(window.GrconCloud?.state?.membership?.workspace_id);
}

async function deleteRecord(record: EgrdtHistoryRecord): Promise<{ result: DeleteOneResult; cloudDeleted: boolean }> {
  let cloudDeleted = false;
  if (isSharedHistory()) {
    if (!window.GrconCloud?.deleteHistoryRecord) throw new Error("Atualize o GRCON para concluir a exclusão no Supabase.");
    cloudDeleted = Boolean(await window.GrconCloud.deleteHistoryRecord(record));
  }
  return { result: history().deleteOne(record.id) as unknown as DeleteOneResult, cloudDeleted };
}

async function clearHistory(): Promise<boolean> {
  if (isSharedHistory()) return Boolean(await window.GrconCloud?.clearHistory?.());
  return history().clear();
}

async function prepareForSigem(record: EgrdtHistoryRecord): Promise<PostingRecord | null> {
  const Posting = window.GrconSigemPosting;
  if (!Posting) return null;
  const saved = Posting.registerGenerated([record], { appVersion: appVersion() }) as { persistence?: Promise<unknown> } | undefined;
  if (saved?.persistence) await saved.persistence.catch(() => null);
  const cache = readPostingCache();
  await window.GRCONModuleLoader?.ensureModule?.("sigem");
  const posting = postingRecord(cache, record);
  if (posting) window.GrconSigemUi?.select?.(posting.id);
  window.dispatchEvent(new CustomEvent("grcon:sigem-updated", { detail: { record: posting, preparedFromHistory: true } }));
  return posting;
}

function openEmailReply(record: EgrdtHistoryRecord): void {
  if (!window.GrconEgrdtEmailReplyUi) throw new Error("O painel da resposta de e-mail não está disponível nesta sessão.");
  window.GrconEgrdtEmailReplyUi.open?.([record]);
}

function openTeams(record: EgrdtHistoryRecord): void {
  window.GrconEgrdtTeamsNotification?.open?.(record);
}

function teamsPresentation(record: EgrdtHistoryRecord): {
  recordId: string;
  label: string;
  statusLabel: string;
  sent: boolean;
  disabled: boolean;
} | null {
  const Teams = window.GrconEgrdtTeamsNotification;
  if (!Teams) return null;
  const saved = Teams.status?.(record);
  return {
    recordId: record.id || record.clientRecordId || "",
    label: Teams.buttonLabel?.(record) || (saved ? "Reenviar aviso no Teams" : "Avisar no Teams"),
    statusLabel: Teams.statusLabel?.(record) || (saved ? "Avisado no Teams" : "Ainda não avisado"),
    sent: Boolean(saved),
    disabled: Boolean(Teams.isSending?.(record)),
  };
}

function syncSequence(number: string): void {
  window.GrconEgrdtSequence?.syncFromNumber?.(number);
}

function dispatchUpdated(detail?: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent("grcon:history-updated", { detail }));
}

function subscribeUpdates(callback: () => void): () => void {
  const simple = () => callback();
  const onStorage = (event: StorageEvent) => {
    if (event.key === history().STORAGE_KEY) callback();
  };
  ["grcon:history-updated", "grcon:sigem-updated", "grcon:egrdt-teams-state", "grcon:egrdt-teams-notified", REFRESH_EVENT]
    .forEach((name) => window.addEventListener(name, simple));
  window.addEventListener("storage", onStorage);
  return () => {
    ["grcon:history-updated", "grcon:sigem-updated", "grcon:egrdt-teams-state", "grcon:egrdt-teams-notified", REFRESH_EVENT]
      .forEach((name) => window.removeEventListener(name, simple));
    window.removeEventListener("storage", onStorage);
  };
}

function requestRefresh(): void {
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
}

function subscribeSelect(callback: (id: string) => void): () => void {
  const handler = (event: Event) => {
    const id = (event as CustomEvent<string>).detail;
    if (id) callback(id);
  };
  window.addEventListener(SELECT_EVENT, handler);
  return () => window.removeEventListener(SELECT_EVENT, handler);
}

function requestSelect(id: string): void {
  window.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: id }));
}

function updateExternalCount(count: number): void {
  const element = document.getElementById("history-tab-count");
  if (!element) return;
  element.textContent = String(count);
  element.hidden = count === 0;
}

function activateView(view: string): void {
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
    window.GrconAnalysisHistoryUi?.render?.();
    window.setTimeout(() => document.querySelector<HTMLElement>("#analysis-history-search")?.focus(), 0);
  } else if (view === "history") {
    requestRefresh();
    window.setTimeout(() => document.querySelector<HTMLElement>("#history-search")?.focus(), 0);
  } else if (view === "sigem") {
    window.GrconSigemUi?.render?.();
    window.setTimeout(() => document.querySelector<HTMLElement>("#sigem-search")?.focus(), 0);
  }
}

function setPerformanceSnapshot(next: HistoryPerformanceSnapshot): void {
  performanceSnapshot = { ...next };
}

function getPerformanceSnapshot(): HistoryPerformanceSnapshot {
  return { ...performanceSnapshot };
}

function confirmDelete(record: EgrdtHistoryRecord): boolean {
  const shared = isSharedHistory();
  return window.confirm(
    `Excluir somente ${record.egrdtNumber} do histórico ${shared ? "compartilhado" : "local"}?\n\n${shared ? "A reserva desse número também será removida e ele poderá ser usado novamente. " : ""}Os arquivos já baixados e os registros da fila SIGEM não serão alterados.`,
  );
}

function confirmClear(): boolean {
  return window.confirm(isSharedHistory()
    ? "Limpar todo o histórico compartilhado de eGRDTs?\n\nOs registros serão apagados também do Supabase e as numerações consumidas serão liberadas para reutilização."
    : "Limpar todo o histórico de eGRDTs salvo neste navegador?");
}

function reportDateValidity(): void {
  document.querySelector<HTMLInputElement>("#history-date-end")?.reportValidity();
}

export const historicoEgrdtAdapter = {
  appVersion,
  notify,
  formatDate,
  parsedNumber,
  readRecords,
  readPostingCache,
  postingRecord,
  filterOptions,
  filterRecords,
  summary,
  postingPresentation,
  workflow,
  revisionRelation,
  periodLabel,
  exportPeriodReport,
  updateNumber,
  canDeleteHistory,
  isSharedHistory,
  deleteRecord,
  clearHistory,
  prepareForSigem,
  openEmailReply,
  openTeams,
  teamsButtonHtml,
  syncSequence,
  dispatchUpdated,
  subscribeUpdates,
  requestRefresh,
  subscribeSelect,
  requestSelect,
  updateExternalCount,
  activateView,
  setPerformanceSnapshot,
  getPerformanceSnapshot,
  confirmDelete,
  confirmClear,
  reportDateValidity,
};
