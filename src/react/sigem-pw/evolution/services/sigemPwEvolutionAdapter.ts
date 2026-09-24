import type { SigemPwRecord } from "../../types/domain";
import {
  EMPTY_EVOLUTION_FILTERS,
  EVOLUTION_EVENT_DEBOUNCE_MS,
  EVOLUTION_PAGE_SIZE,
  type EvolutionFilters,
  type EvolutionListMode,
  type EvolutionPageData,
  type EvolutionRecord,
  type EvolutionSnapshot,
  type EvolutionSourceSnapshotMeta,
  type EvolutionSystem,
  type EvolutionUiSnapshot,
  type EvolutionUiState,
} from "../types/domain";

type Subscriber = () => void;
type EvolutionCoreApi = NonNullable<Window["GrconSigemPwEvolution"]>;
type EvolutionHistoryApi = NonNullable<Window["GrconSigemPwHistory"]>;
type EvolutionManagementApi = NonNullable<Window["GrconSigemPwHistoryManagement"]>;

interface EvolutionPayload {
  snapshotId?: string;
  meta?: Record<string, unknown>;
  records: SigemPwRecord[];
}
interface MetaRecord {
  key?: unknown;
  value?: EvolutionPayload;
}
interface ParsedLd {
  records?: SigemPwRecord[];
  history?: SigemPwRecord[];
}
interface RuntimeWindow {
  XLSX?: {
    read(source: ArrayBuffer, options: Record<string, unknown>): unknown;
    utils: {
      json_to_sheet(rows: Array<Record<string, unknown>>): unknown;
      book_new(): unknown;
      book_append_sheet(workbook: unknown, sheet: unknown, name: string): void;
    };
    write(workbook: unknown, options: Record<string, unknown>): ArrayBuffer;
  };
  TriagemCore?: {
    parseWorkbook(workbook: unknown, fileName: string, lastModified: number, profile?: unknown): ParsedLd;
  };
  GrconLdCompatibility?: {
    workbookFor?(file: File): unknown;
    profileFor?(file: File): unknown;
  };
  GrconUtils?: {
    downloadBlob?(blob: Blob, filename: string): void;
  };
  GrconSigemPwHistoryRuntimeFix?: {
    openManager?(): void;
  };
}

const state: EvolutionUiState = {
  active: false,
  ready: false,
  busy: false,
  sigem: [],
  pw: [],
  unavailable: { sigem: 0, pw: 0 },
  ldUniverse: null,
  ldSignature: "",
  period: { start: "", end: "" },
  selections: { sigemPrev: "", sigemCurrent: "", pwPrev: "", pwCurrent: "" },
  comparison: null,
  timeline: [],
  listMode: "sigem-new",
  filters: EMPTY_EVOLUTION_FILTERS(),
  rawFilters: { query: "", tag: "", eap: "" },
  page: 1,
  filteredRows: [],
  detailRow: null,
  exporting: false,
  exportMessage: "",
  exportMessageKind: "info",
  error: "",
  metrics: {
    evolutionSnapshotBuildMs: 0,
    evolutionPeriodChangeMs: 0,
    evolutionFilterMs: 0,
    evolutionSearchMs: 0,
    evolutionPageChangeMs: 0,
    evolutionDetailMs: 0,
    evolutionExportMs: 0,
  },
};

let revision = 0;
let snapshot: EvolutionUiSnapshot = { ...state, revision };
const subscribers = new Set<Subscriber>();
let externalListenersInstalled = false;
let eventTimer: number | null = null;

function Core(): EvolutionCoreApi {
  const api = window.GrconSigemPwEvolution;
  if (!api?.buildLdUniverse || !api?.buildSnapshot || !api?.comparePeriod || !api?.buildDailyTimeline || !api?.norm || !api?.normalizeRevision) {
    throw new Error("Motor de evolução SIGEM × PW indisponível.");
  }
  return api;
}

function History(): EvolutionHistoryApi {
  const api = window.GrconSigemPwHistory;
  if (!api?.openDb || !api?.listSourceSnapshots || !api?.STORES?.meta) {
    throw new Error("Histórico SIGEM × PW indisponível.");
  }
  return api;
}

function Management(): EvolutionManagementApi | null {
  return window.GrconSigemPwHistoryManagement || null;
}

function runtime(): RuntimeWindow {
  return window as unknown as RuntimeWindow;
}

function emit(): void {
  revision += 1;
  snapshot = { ...state, revision };
  subscribers.forEach((listener) => listener());
}

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function fmt(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR");
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function notify(message: string, kind = "info"): void {
  if (typeof window.GrconNotify === "function") window.GrconNotify(message, kind);
  else if (kind === "error") console.error("[SIGEM×PW][evolução]", message);
}

function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function ordered(list: EvolutionSnapshot[]): EvolutionSnapshot[] {
  return list.slice().sort((a, b) => Date.parse(a.importedAt || "0") - Date.parse(b.importedAt || "0"));
}

function hasValidatedLd(): boolean {
  return Boolean(state.ldUniverse?.qualityAvailable);
}

function selectionKey(system: EvolutionSystem, role: "previous" | "current"): keyof EvolutionUiState["selections"] {
  return `${system}${role === "previous" ? "Prev" : "Current"}` as keyof EvolutionUiState["selections"];
}

function selectedSnapshot(system: EvolutionSystem, role: "previous" | "current"): EvolutionSnapshot | null {
  const key = selectionKey(system, role);
  return state[system].find((item) => item.id === state.selections[key]) || null;
}

function localDateKey(value: unknown): string {
  const date = new Date(text(value));
  if (!value || Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function periodSnapshots(system: EvolutionSystem): EvolutionSnapshot[] {
  const start = state.period.start;
  const end = state.period.end;
  return ordered(state[system]).filter((item) => {
    const key = localDateKey(item.importedAt);
    return key && (!start || key >= start) && (!end || key <= end);
  });
}

function pairDefaults(system: EvolutionSystem): void {
  const list = periodSnapshots(system);
  const currentKey = selectionKey(system, "current");
  const previousKey = selectionKey(system, "previous");
  if (!list.length) {
    state.selections[currentKey] = "";
    state.selections[previousKey] = "";
    return;
  }
  state.selections[currentKey] = list[list.length - 1].id;
  const currentIndex = list.findIndex((row) => row.id === state.selections[currentKey]);
  state.selections[previousKey] = currentIndex > 0 ? list[currentIndex - 1].id : "";
}

function queryTokens(value: string): string[] {
  return text(value).split(/[\n,;]+/).map((item) => Core().norm(item)).filter(Boolean);
}

function rowsForMode(): EvolutionRecord[] {
  if (!hasValidatedLd()) return [];
  const comparison = state.comparison;
  const relation = comparison?.relation;
  if (state.listMode === "sigem-new") return comparison?.sigem?.added || [];
  if (state.listMode === "pw-new") return comparison?.pw?.added || [];
  if (state.listMode === "pw-emitted") return comparison?.pwEmissions || [];
  if (state.listMode === "both") return relation?.newInBoth || [];
  if (state.listMode === "missing-pw") return relation?.newSigemMissingPw || [];
  if (state.listMode === "removed-sigem") return comparison?.sigem?.removed || [];
  if (state.listMode === "removed-pw") return comparison?.pw?.removed || [];
  return [];
}

function rowPasses(row: EvolutionRecord, filters: EvolutionFilters): boolean {
  const tokens = queryTokens(filters.query);
  if (tokens.length && !tokens.some((token) => Core().norm(row.document).includes(token))) return false;
  if (filters.documentClass && text(row.documentClass) !== filters.documentClass) return false;
  if (filters.documentType && !Core().norm(row.documentType).includes(Core().norm(filters.documentType))) return false;
  if (filters.source && text(row.system) !== filters.source) return false;
  if (filters.revision && Core().normalizeRevision(row.revision) !== Core().normalizeRevision(filters.revision)) return false;
  if (filters.status && !Core().norm(row.status).includes(Core().norm(filters.status))) return false;
  if (filters.discipline && !Core().norm(row.discipline).includes(Core().norm(filters.discipline))) return false;
  if (filters.tag && !Core().norm(row.tag).includes(Core().norm(filters.tag))) return false;
  if (filters.eap && !Core().norm(row.eap).includes(Core().norm(filters.eap))) return false;
  return true;
}

function computeFilteredRows(filters = state.filters): EvolutionRecord[] {
  const started = now();
  const rows = rowsForMode().filter((row) => rowPasses(row, filters));
  state.metrics.evolutionFilterMs = now() - started;
  return rows;
}

function syncFilteredRows(): void {
  state.filteredRows = computeFilteredRows();
  const pages = Math.max(1, Math.ceil(state.filteredRows.length / EVOLUTION_PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), pages);
}

function pageData(rows = state.filteredRows): EvolutionPageData {
  const pages = Math.max(1, Math.ceil(rows.length / EVOLUTION_PAGE_SIZE));
  const page = Math.min(Math.max(1, state.page), pages);
  const start = (page - 1) * EVOLUTION_PAGE_SIZE;
  return { rows, visible: rows.slice(start, start + EVOLUTION_PAGE_SIZE), pages, start };
}

async function readLdUniverse(force: boolean): Promise<ReturnType<EvolutionCoreApi["buildLdUniverse"]>> {
  const input = document.getElementById("ld-input") as HTMLInputElement | null;
  const files = input?.files ? [...input.files] : [];
  const qualityBase = window.GrconSigemPwDashboardUi?.state?.ld;
  const qualityRecords = qualityBase?.records || [];
  const qualitySignature = [
    qualityBase?.meta?.snapshotId,
    qualityBase?.meta?.fileName,
    qualityRecords.length,
  ].map(text).join(":");
  const signature = `${qualitySignature}|${files.map((file) => `${file.name}:${file.size}:${file.lastModified}`).join("|")}`;

  if (!force && state.ldUniverse && signature === state.ldSignature) return state.ldUniverse;
  state.ldSignature = signature;

  const technical: SigemPwRecord[] = [];
  const historical: SigemPwRecord[] = [];
  const browser = runtime();

  if (files.length) {
    if (window.GRCONModuleLoader) await window.GRCONModuleLoader.ensure("xlsx");
    if (!browser.XLSX || !browser.TriagemCore) throw new Error("Leitura de LD indisponível para a Evolução SIGEM × PW.");
    for (const file of files) {
      try {
        const workbook = browser.GrconLdCompatibility?.workbookFor?.(file)
          || browser.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
        const parsed = browser.TriagemCore.parseWorkbook(
          workbook,
          file.name,
          file.lastModified,
          browser.GrconLdCompatibility?.profileFor?.(file),
        );
        technical.push(...(parsed.records || []));
        historical.push(...(parsed.history || []));
      } catch (error) {
        console.warn(`[SIGEM×PW][evolução] LD ${file.name}:`, error);
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  state.ldUniverse = Core().buildLdUniverse(technical, historical, { qualityRecords });
  return state.ldUniverse;
}

async function readPayloadMap(): Promise<Map<string, EvolutionPayload>> {
  const history = History();
  const management = Management();
  const output = new Map<string, EvolutionPayload>();
  const db = await history.openDb();
  try {
    const values = await new Promise<MetaRecord[]>((resolve, reject) => {
      const tx = db.transaction(history.STORES.meta, "readonly");
      const request = tx.objectStore(history.STORES.meta).getAll();
      request.onsuccess = () => resolve((request.result || []) as MetaRecord[]);
      request.onerror = () => reject(request.error || new Error("Falha ao ler payloads históricos."));
    });
    const prefix = management?.PAYLOAD_PREFIX || "sourcePayload:";
    values.forEach((row) => {
      const key = text(row?.key);
      const payload = row?.value;
      if (!key.startsWith(prefix) || !payload || !Array.isArray(payload.records)) return;
      output.set(text(payload.snapshotId) || key.slice(prefix.length), payload);
    });
  } finally {
    db.close();
  }
  return output;
}

async function buildPreparedSnapshots(
  system: EvolutionSystem,
  metadata: EvolutionSourceSnapshotMeta[],
  payloads: Map<string, EvolutionPayload>,
  universe: ReturnType<EvolutionCoreApi["buildLdUniverse"]>,
): Promise<{ output: EvolutionSnapshot[]; unavailable: number }> {
  const output: EvolutionSnapshot[] = [];
  let unavailable = 0;
  for (const sourceSnapshot of metadata.slice().sort((a, b) => Date.parse(text(a.importedAt)) - Date.parse(text(b.importedAt)))) {
    const payload = payloads.get(sourceSnapshot.id);
    if (!payload || !Array.isArray(payload.records)) {
      unavailable += 1;
      continue;
    }
    const base = {
      meta: {
        ...(payload.meta || {}),
        fileName: text(payload.meta?.fileName) || sourceSnapshot.fileName,
        importedAt: sourceSnapshot.importedAt || text(payload.meta?.importedAt),
      },
      records: payload.records,
    };
    try {
      output.push(Core().buildSnapshot(system, base, universe, {
        snapshotId: sourceSnapshot.id,
        sourceSnapshotId: sourceSnapshot.id,
      }));
    } catch (error) {
      console.warn(`[SIGEM×PW][evolução] snapshot ${sourceSnapshot.id}:`, error);
      unavailable += 1;
    }
    if (output.length % 4 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }
  return { output, unavailable };
}

function recalculate(): void {
  if (!hasValidatedLd()) {
    state.comparison = null;
    syncFilteredRows();
    return;
  }
  state.comparison = Core().comparePeriod(
    selectedSnapshot("sigem", "previous"),
    selectedSnapshot("sigem", "current"),
    selectedSnapshot("pw", "previous"),
    selectedSnapshot("pw", "current"),
  );
  state.page = 1;
  state.detailRow = null;
  syncFilteredRows();
}

function applyPeriod(): boolean {
  const started = now();
  if (state.period.start && state.period.end && state.period.start > state.period.end) return false;
  pairDefaults("sigem");
  pairDefaults("pw");
  state.timeline = Core().buildDailyTimeline(periodSnapshots("sigem"), periodSnapshots("pw"));
  recalculate();
  state.metrics.evolutionPeriodChangeMs = now() - started;
  return true;
}

async function loadSnapshots(forceLd = false): Promise<void> {
  if (state.busy) return;
  state.busy = true;
  state.error = "";
  emit();
  const started = now();
  try {
    const management = Management();
    if (management?.ensureCurrentPayloads) await management.ensureCurrentPayloads();
    const universe = await readLdUniverse(Boolean(forceLd));
    if (!universe.qualityAvailable) {
      state.sigem = [];
      state.pw = [];
      state.timeline = [];
      state.unavailable = { sigem: 0, pw: 0 };
      state.comparison = null;
      state.page = 1;
      state.detailRow = null;
      syncFilteredRows();
      return;
    }

    const [sigemMeta, pwMeta, payloads] = await Promise.all([
      History().listSourceSnapshots("sigem"),
      History().listSourceSnapshots("pw"),
      readPayloadMap(),
    ]);
    const [sigem, pw] = await Promise.all([
      buildPreparedSnapshots("sigem", sigemMeta, payloads, universe),
      buildPreparedSnapshots("pw", pwMeta, payloads, universe),
    ]);
    state.sigem = sigem.output;
    state.pw = pw.output;
    state.unavailable = { sigem: sigem.unavailable, pw: pw.unavailable };
    applyPeriod();
    state.metrics.evolutionSnapshotBuildMs = now() - started;
  } catch (error) {
    state.error = messageOf(error, "Não foi possível carregar a Evolução SIGEM × PW.");
    throw error;
  } finally {
    state.busy = false;
    emit();
  }
}

async function activate(): Promise<void> {
  if (!state.active) {
    state.active = true;
    emit();
  }
  await loadSnapshots(false);
  state.ready = true;
  emit();
}

async function refresh(forceLd = false): Promise<void> {
  await loadSnapshots(Boolean(forceLd));
  state.ready = true;
  emit();
}

function setPeriod(key: "start" | "end", value: string): boolean {
  const previous = state.period[key];
  state.period = { ...state.period, [key]: value };
  if (!applyPeriod()) {
    state.period = { ...state.period, [key]: previous };
    notify("A data inicial não pode ser posterior à data final.", "warning");
    emit();
    return false;
  }
  emit();
  return true;
}

function clearPeriod(): void {
  state.period = { start: "", end: "" };
  applyPeriod();
  emit();
}

function setSelection(key: keyof EvolutionUiState["selections"], value: string): void {
  state.selections = { ...state.selections, [key]: value };
  recalculate();
  emit();
}

function setListMode(mode: EvolutionListMode): void {
  if (state.listMode === mode) return;
  state.listMode = mode;
  state.page = 1;
  state.detailRow = null;
  syncFilteredRows();
  emit();
}

function setFilter<K extends keyof EvolutionFilters>(key: K, value: EvolutionFilters[K]): void {
  state.filters = { ...state.filters, [key]: value };
  state.page = 1;
  state.detailRow = null;
  syncFilteredRows();
  emit();
}

function setRawFilter(key: keyof EvolutionUiState["rawFilters"], value: string): void {
  state.rawFilters = { ...state.rawFilters, [key]: value };
  emit();
}

function applyRawFilters(raw: EvolutionUiState["rawFilters"]): void {
  const started = now();
  const next = { ...state.filters, ...raw };
  const changed = next.query !== state.filters.query || next.tag !== state.filters.tag || next.eap !== state.filters.eap;
  if (!changed) return;
  state.filters = next;
  state.page = 1;
  state.detailRow = null;
  syncFilteredRows();
  state.metrics.evolutionSearchMs = now() - started;
  emit();
}

function clearFilters(): void {
  state.filters = EMPTY_EVOLUTION_FILTERS();
  state.rawFilters = { query: "", tag: "", eap: "" };
  state.page = 1;
  state.detailRow = null;
  state.exportMessage = "";
  syncFilteredRows();
  emit();
}

function setPage(value: number): void {
  const started = now();
  const pages = Math.max(1, Math.ceil(state.filteredRows.length / EVOLUTION_PAGE_SIZE));
  state.page = Math.min(Math.max(1, Number(value) || 1), pages);
  state.detailRow = null;
  state.metrics.evolutionPageChangeMs = now() - started;
  emit();
}

function openDetail(row: EvolutionRecord): void {
  const started = now();
  state.detailRow = row;
  state.metrics.evolutionDetailMs = now() - started;
  emit();
}

function closeDetail(): void {
  state.detailRow = null;
  emit();
}

function currentFiltersForExport(): EvolutionFilters {
  return { ...state.filters, ...state.rawFilters };
}

function downloadBlob(blob: Blob, filename: string): void {
  const browser = runtime();
  if (browser.GrconUtils?.downloadBlob) {
    browser.GrconUtils.downloadBlob(blob, filename);
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportFilteredRows(): Promise<number> {
  if (state.exporting) return 0;
  const rows = computeFilteredRows(currentFiltersForExport());
  if (!rows.length) {
    state.exportMessage = "Não há registros filtrados para exportar.";
    state.exportMessageKind = "info";
    emit();
    notify(state.exportMessage, "warning");
    return 0;
  }

  state.exporting = true;
  state.exportMessage = `Gerando Excel com ${fmt(rows.length)} registro(s)...`;
  state.exportMessageKind = "info";
  emit();
  const started = now();

  try {
    if (!window.GRCONModuleLoader) throw new Error("Carregador de módulos do GRCON indisponível.");
    await window.GRCONModuleLoader.ensure("xlsx");
    const xlsx = runtime().XLSX;
    if (!xlsx) throw new Error("Exportador XLSX indisponível.");
    const data = rows.map((row) => ({
      Código: row.document || "",
      Revisão: row.revision || "",
      Classe: row.documentClass || "",
      "Tipo documental": row.documentType || "",
      Título: row.title || "",
      Movimento: row.movement || "",
      Status: row.status || "",
      Disciplina: row.discipline || "",
      TAG: row.tag || "",
      EAP: row.eap || "",
      Data: row.date || "",
      Origem: (row.system || "").toUpperCase(),
      "Emissão PW": row.system === "pw" ? (row.emitted ? "Emitido" : row.lastEmission || "") : "",
      "LD origem": row.ldSource || "",
      "LD aba": row.ldSheet || "",
      "Prazo LD": row.ldPrazo || "",
    }));
    const sheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, sheet, "Evolução");
    const output = xlsx.write(workbook, { bookType: "xlsx", type: "array" });
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    downloadBlob(
      new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `GRCON_Evolucao_${state.listMode}_${date}.xlsx`,
    );
    state.exportMessage = `Excel gerado com sucesso. ${fmt(rows.length)} registro(s) exportado(s).`;
    state.exportMessageKind = "success";
    state.metrics.evolutionExportMs = now() - started;
    notify(state.exportMessage, "success");
    return rows.length;
  } catch (error) {
    state.exportMessage = messageOf(error, "Não foi possível exportar a relação.");
    state.exportMessageKind = "error";
    notify(state.exportMessage, "error");
    return 0;
  } finally {
    state.exporting = false;
    emit();
  }
}

function openHistoryManager(): void {
  runtime().GrconSigemPwHistoryRuntimeFix?.openManager?.();
}

function scheduleRefresh(forceLd = false): void {
  if (!state.active) return;
  if (eventTimer !== null) window.clearTimeout(eventTimer);
  eventTimer = window.setTimeout(() => {
    eventTimer = null;
    void refresh(forceLd).catch((error) => console.error("[SIGEM×PW][evolução] atualização:", error));
  }, EVOLUTION_EVENT_DEBOUNCE_MS);
}

function subscribeExternalEvents(): () => void {
  if (externalListenersInstalled) return () => undefined;
  externalListenersInstalled = true;
  const onBaseUpdate = () => scheduleRefresh(false);
  const onLdInput = () => {
    state.ldSignature = "";
    scheduleRefresh(true);
  };
  window.addEventListener("grcon:conference-updated", onBaseUpdate);
  window.addEventListener("grcon:pw-base-updated", onBaseUpdate);
  window.addEventListener("grcon:sigem-pw-base-date-updated", onBaseUpdate);
  const ldInput = document.getElementById("ld-input");
  ldInput?.addEventListener("change", onLdInput);

  return () => {
    window.removeEventListener("grcon:conference-updated", onBaseUpdate);
    window.removeEventListener("grcon:pw-base-updated", onBaseUpdate);
    window.removeEventListener("grcon:sigem-pw-base-date-updated", onBaseUpdate);
    ldInput?.removeEventListener("change", onLdInput);
    if (eventTimer !== null) {
      window.clearTimeout(eventTimer);
      eventTimer = null;
    }
    externalListenersInstalled = false;
  };
}

export const sigemPwEvolutionAdapter = {
  state,
  subscribe(listener: Subscriber): () => void { subscribers.add(listener); return () => subscribers.delete(listener); },
  getSnapshot(): EvolutionUiSnapshot { return snapshot; },
  activate,
  refresh,
  loadSnapshots,
  periodSnapshots,
  selectedSnapshot,
  pageData,
  setPeriod,
  clearPeriod,
  setSelection,
  setListMode,
  setFilter,
  setRawFilter,
  applyRawFilters,
  clearFilters,
  setPage,
  openDetail,
  closeDetail,
  exportFilteredRows,
  openHistoryManager,
  subscribeExternalEvents,
};

export type SigemPwEvolutionAdapter = typeof sigemPwEvolutionAdapter;
