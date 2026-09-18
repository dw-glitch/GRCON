import type {
  AnalysisDocument,
  AnalysisHistoryFilters,
  AnalysisQueryResult,
  AnalysisSession,
  DetailContext,
  EgrdtHistoryRecord,
  ExportPayload,
  RestoreResult,
  SavedAnalysisFilter,
  SaveFilterResult,
  StorageEstimate,
  UnifiedSearchResult,
} from "../types/domain";

const APP_VERSION = "5.32.24";
const REFRESH_EVENT = "grcon:analysis-history-react-refresh";
const OPEN_DETAIL_EVENT = "grcon:analysis-history-react-open-detail";

function core() {
  if (!window.GrconAnalysisHistory) throw new Error("GrconAnalysisHistory não foi carregado.");
  return window.GrconAnalysisHistory;
}

function report() {
  if (!window.GrconAnalysisHistoryReport) throw new Error("GrconAnalysisHistoryReport não foi carregado.");
  return window.GrconAnalysisHistoryReport;
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

function formatDate(value: unknown, withTime = true): string {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", withTime
    ? { dateStyle: "short", timeStyle: "short" }
    : { dateStyle: "short" }).format(date);
}

function dateParts(value: unknown): { date: string; time: string } {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return { date: "—", time: "" };
  return {
    date: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date),
    time: new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date),
  };
}

function formatBytes(value: unknown): string {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function statusClass(value: unknown): "ready" | "blocked" | "discard" | "review" {
  const key = core().statusKey(value);
  return key === "READY" ? "ready" : key === "BLOCKED" ? "blocked" : key === "DISCARD" ? "discard" : "review";
}

function sigemClass(value: unknown): "not-posted" | "attention" | "posted" | "neutral" {
  const normalized = core().norm(value);
  if (normalized.includes("NAO POSTADO")) return "not-posted";
  if (normalized.includes("COM COMENTARIO") || normalized.includes("RECUS")) return "attention";
  if (normalized.includes("SEM COMENTARIO") || normalized.includes("EMITIDO") || normalized.includes("POSTADO")) return "posted";
  return "neutral";
}

async function listSessions(): Promise<AnalysisSession[]> {
  return core().listSessions();
}

async function queryDocuments(filters: AnalysisHistoryFilters, page: number, pageSize: number): Promise<AnalysisQueryResult> {
  return core().queryDocuments(filters, {
    offset: Math.max(0, page - 1) * pageSize,
    limit: pageSize,
  });
}

async function storageEstimate(): Promise<StorageEstimate | null> {
  return core().storageEstimate();
}

async function storageLabel(): Promise<string> {
  const estimate = await storageEstimate();
  return estimate && estimate.quota
    ? `Armazenamento local usado pelo navegador: ${formatBytes(estimate.usage)} de ${formatBytes(estimate.quota)} disponíveis.`
    : "O histórico fica no armazenamento local deste navegador.";
}

function readSavedFilters(): SavedAnalysisFilter[] {
  return window.GrconMacro5Flow?.readSavedAnalysisFilters?.() || [];
}

function normalizeSavedFilter(value: unknown): Partial<AnalysisHistoryFilters> {
  return window.GrconMacro5Flow?.normalizeAnalysisFilter?.(value) || (value as Partial<AnalysisHistoryFilters>) || {};
}

function saveFilter(name: string, filters: AnalysisHistoryFilters): SaveFilterResult {
  if (!window.GrconMacro5Flow) {
    return {
      saved: false,
      error: "O mecanismo de filtros salvos não está disponível.",
      item: { id: "", name, filter: filters },
    };
  }
  return window.GrconMacro5Flow.saveAnalysisFilter(name, filters);
}

function deleteFilter(id: string): void {
  window.GrconMacro5Flow?.deleteAnalysisFilter?.(id);
}

async function unifiedSearch(raw: string): Promise<UnifiedSearchResult> {
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { historyCount: 0, analysisCount: 0, historyMatches: [], analysisMatches: [] };

  const Core = core();
  const terms = lines.map((line) => Core.norm(line));
  let historyMatches: EgrdtHistoryRecord[] = [];
  let analysisMatches: AnalysisDocument[] = [];

  if (window.GrconHistory) {
    historyMatches = window.GrconHistory.read().filter((record) => {
      const haystack = Core.norm([
        record.egrdtNumber,
        ...(record.numberHistory || []),
        record.outputType,
        record.ldName,
        record.sourceName,
        ...(record.allocations || []),
        ...(record.files || []).flatMap((file) => [
          file.document,
          file.originalName,
          file.finalName,
          file.allocation,
          file.revision,
          file.sigemStatus,
        ]),
      ].join(" "));
      return terms.some((term) => haystack.includes(term));
    });
  }

  try {
    const allDocs = await Core.allDocuments({ all: true });
    analysisMatches = allDocs.filter((doc) => {
      const haystack = Core.norm([
        doc.document,
        doc.title,
        doc.statusDelivered,
        doc.reasonCode,
        doc.reason,
        doc.sigemStatus,
        doc.allocation,
        doc.allocationStatus,
        doc.ldVersion,
        doc.databook,
        doc.grdt,
        doc.originalFiles,
        doc.finalFiles,
      ].join(" | "));
      return terms.some((term) => haystack.includes(term));
    });
  } catch (error) {
    console.debug("[HistoricoAnalises/Adapter] busca unificada:", error);
  }

  return {
    historyCount: historyMatches.length,
    analysisCount: analysisMatches.length,
    historyMatches,
    analysisMatches,
  };
}

async function detailContext(item: AnalysisDocument): Promise<DetailContext> {
  const Core = core();
  const candidates = await Core.allDocuments({ query: item.document || "" });
  const exact = candidates.filter((entry) => Core.norm(entry.document) === Core.norm(item.document));
  const timeline = window.GrconMacro5Flow?.analysisTimeline?.(exact) || exact;
  const historyRecords = window.GrconHistory?.read?.() || [];
  const related = window.GrconMacro5Flow?.relatedEgrdt?.(item, historyRecords) || null;
  const currentIndex = timeline.findIndex((entry) => entry.id === item.id);
  const previous = currentIndex > 0 ? timeline[currentIndex - 1] : null;
  const changes = previous ? [
    Core.norm(previous.statusDelivered) !== Core.norm(item.statusDelivered)
      ? `Resultado GRCON: ${previous.statusDelivered || "—"} → ${item.statusDelivered || "—"}`
      : "",
    Core.norm(previous.sigemStatus) !== Core.norm(item.sigemStatus)
      ? `SIGEM: ${previous.sigemStatus || "—"} → ${item.sigemStatus || "—"}`
      : "",
    Core.norm(previous.targetRevision) !== Core.norm(item.targetRevision)
      ? `Próxima revisão: ${previous.targetRevision || "—"} → ${item.targetRevision || "—"}`
      : "",
  ].filter(Boolean) : [];
  return { timeline, related, changes };
}

async function openRelatedHistory(id: string, prepareSigem: boolean): Promise<void> {
  await window.GRCONModuleLoader?.ensureModule?.("history");
  window.GrconHistoryUi?.select?.(id);

  if (prepareSigem) {
    const record = window.GrconHistory?.read?.().find((entry) => entry.id === id);
    if (record && window.GrconSigemPosting) {
      window.GrconSigemPosting.registerGenerated([record], { appVersion: APP_VERSION });
      await window.GRCONModuleLoader?.ensureModule?.("sigem");
      const posting = window.GrconSigemPosting.read().find((entry) => entry.historyId === id || entry.id === id);
      if (posting) window.GrconSigemUi?.select?.(posting.id);
    }
  }
}

async function exportReport(payload: ExportPayload): Promise<number> {
  const Report = report();
  await window.GRCONModuleLoader?.ensure("excel");
  await window.GRCONModuleLoader?.ensure("brand");
  const options = { ...payload.filters, appVersion: APP_VERSION, brandAssets: window.GRCONBrandAssets };
  const buffer = await Report.buildWorkbook(payload.documents, payload.sessions, options);
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    Report.downloadName(payload.documents, options),
  );
  return payload.documents.length;
}

async function allDocuments(filters: AnalysisHistoryFilters): Promise<AnalysisDocument[]> {
  return core().allDocuments(filters);
}

async function backupHistory(): Promise<void> {
  const data = await core().exportBackup();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadBlob(
    new Blob([JSON.stringify(data)], { type: "application/json" }),
    `GRCON_Backup_Historico_Analises_${stamp}.json`,
  );
}

async function restoreHistory(file: File): Promise<RestoreResult> {
  const data: unknown = JSON.parse(await file.text());
  return core().importBackup(data, { replace: true });
}

async function deleteSession(id: string): Promise<boolean> {
  return core().deleteSession(id);
}

async function clearAll(): Promise<boolean> {
  return core().clearAll();
}

function notify(message: string, kind: string = "info"): void {
  if (typeof window.GrconNotify === "function") window.GrconNotify(message, kind);
  else if (kind === "error") window.alert(message);
}

function dispatchUpdated(detail?: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent("grcon:analysis-history-updated", { detail }));
}

function subscribeUpdates(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener("grcon:analysis-history-updated", handler);
  window.addEventListener(REFRESH_EVENT, handler);
  return () => {
    window.removeEventListener("grcon:analysis-history-updated", handler);
    window.removeEventListener(REFRESH_EVENT, handler);
  };
}

function requestRefresh(): void {
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
}

function subscribeOpenDetail(callback: (item: AnalysisDocument) => void): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<AnalysisDocument>;
    if (custom.detail) callback(custom.detail);
  };
  window.addEventListener(OPEN_DETAIL_EVENT, handler);
  return () => window.removeEventListener(OPEN_DETAIL_EVENT, handler);
}

function requestOpenDetail(item: AnalysisDocument): void {
  window.dispatchEvent(new CustomEvent(OPEN_DETAIL_EVENT, { detail: item }));
}

function updateExternalCount(count: number): void {
  ["analysis-history-tab-count", "ops-analysis-history-count"].forEach((id) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = String(count);
    element.hidden = count === 0;
  });
}

async function confirmClearHistory(): Promise<boolean> {
  const message = "Limpar todo o histórico de análises?";
  const detail = "Esta ação é irreversível. Todos os registros de análises anteriores serão excluídos permanentemente. Recomenda-se fazer um backup antes.";
  if (window.GrconEnhancements?.confirmAction) return window.GrconEnhancements.confirmAction(message, detail);
  return window.confirm("Apagar todo o histórico de análises salvo neste navegador? Esta ação não pode ser desfeita.");
}

function auditClearHistory(): void {
  window.GrconAuditLog?.log?.("historico_analises_limpo", "Botão: analysis-history-clear");
}

function confirmRestore(): boolean {
  return window.confirm("Restaurar este backup substituindo o histórico atual deste navegador?");
}

function confirmDeleteSession(session: AnalysisSession): boolean {
  return window.confirm(`Excluir a análise de ${formatDate(session.analyzedAt, true)} com ${session.total} documento(s)?`);
}

function confirmDeleteFilter(name: string): boolean {
  return window.confirm(`Excluir o filtro salvo “${name}”?`);
}

function promptFilterName(defaultName: string): string {
  return window.prompt("Nome para este conjunto de filtros:", defaultName || "Meu filtro") || "";
}

export const historicoAnalisesAdapter = {
  APP_VERSION,
  formatDate,
  dateParts,
  formatBytes,
  statusClass,
  sigemClass,
  listSessions,
  queryDocuments,
  allDocuments,
  storageEstimate,
  storageLabel,
  readSavedFilters,
  normalizeSavedFilter,
  saveFilter,
  deleteFilter,
  unifiedSearch,
  detailContext,
  openRelatedHistory,
  exportReport,
  backupHistory,
  restoreHistory,
  deleteSession,
  clearAll,
  notify,
  dispatchUpdated,
  subscribeUpdates,
  requestRefresh,
  subscribeOpenDetail,
  requestOpenDetail,
  updateExternalCount,
  confirmClearHistory,
  auditClearHistory,
  confirmRestore,
  confirmDeleteSession,
  confirmDeleteFilter,
  promptFilterName,
};
