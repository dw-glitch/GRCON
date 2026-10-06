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
interface PreparedSnapshotCacheValue {
  analysisVersion?: string;
  sourceSnapshotId?: string;
  sourceImportedAt?: string;
  ldFingerprint?: string;
  snapshot?: EvolutionSnapshot;
}
interface MetaRecord {
  key?: unknown;
  value?: EvolutionPayload | PreparedSnapshotCacheValue;
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
    evolutionHistoryReadMs: 0,
    evolutionComparisonMs: 0,
    evolutionTimelineMs: 0,
    evolutionPeriodChangeMs: 0,
    evolutionFilterMs: 0,
    evolutionSearchMs: 0,
    evolutionPageChangeMs: 0,
    evolutionDetailMs: 0,
    evolutionExportMs: 0,
    evolutionCacheHitCount: 0,
    evolutionCacheMissCount: 0,
  },
};

const PREFERENCES_KEY = "grcon:sigem-pw:evolution:ui:v2";
const PREPARED_CACHE_PREFIX = "evolutionPrepared:sigem-pw-evolution-audit-v4:";
const preparedSnapshotCache = new Map<string, EvolutionSnapshot>();
const timelineCache = new Map<string, EvolutionUiState["timeline"]>();

function restorePreferences(): void {
  try {
    const raw = window.sessionStorage?.getItem(PREFERENCES_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<Pick<EvolutionUiState, "period" | "selections" | "listMode" | "filters" | "rawFilters">>;
    if (saved.period) state.period = { ...state.period, ...saved.period };
    if (saved.selections) state.selections = { ...state.selections, ...saved.selections };
    if (saved.listMode) state.listMode = saved.listMode;
    if (saved.filters) state.filters = { ...state.filters, ...saved.filters };
    if (saved.rawFilters) state.rawFilters = { ...state.rawFilters, ...saved.rawFilters };
  } catch (_) {
    // Preferências de UI nunca podem impedir a abertura da Evolução.
  }
}

function persistPreferences(): void {
  try {
    window.sessionStorage?.setItem(PREFERENCES_KEY, JSON.stringify({
      period: state.period,
      selections: state.selections,
      listMode: state.listMode,
      filters: state.filters,
      rawFilters: state.rawFilters,
    }));
  } catch (_) {
    // Armazenamento pode estar bloqueado por política do navegador.
  }
}

restorePreferences();
let preferredSelections = { ...state.selections };
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
  persistPreferences();
  revision += 1;
  snapshot = { ...state, revision };
  subscribers.forEach((listener) => listener());
}

function debugMetric(label: string, details: Record<string, unknown>): void {
  if ((window as unknown as { GRCON_DEBUG_UI?: boolean }).GRCON_DEBUG_UI === true) {
    console.debug("[SIGEM×PW][evolução][perf]", label, details);
  }
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

function preparedCacheKey(system: EvolutionSystem, source: EvolutionSourceSnapshotMeta, universe: EvolutionUiState["ldUniverse"]): string {
  return [
    PREPARED_CACHE_PREFIX,
    Core().CALCULATION_VERSION || "unknown",
    system,
    source.id,
    universe?.fingerprint || "no-ld",
    source.importedAt || source.recordedAt || "",
    source.fileName || "",
  ].join("|");
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
  return state[system].filter((item) => {
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

  const ids = new Set(list.map((row) => row.id));
  const preferredCurrent = preferredSelections[currentKey];
  const preferredPrevious = preferredSelections[previousKey];

  const current = (preferredCurrent && ids.has(preferredCurrent) ? preferredCurrent : "")
    || list[list.length - 1].id;
  state.selections[currentKey] = current;

  const currentIndex = list.findIndex((row) => row.id === current);
  const fallbackPrevious = currentIndex > 0 ? list[currentIndex - 1].id : "";
  const previous = (preferredPrevious && preferredPrevious !== current && ids.has(preferredPrevious) ? preferredPrevious : "")
    || fallbackPrevious;
  state.selections[previousKey] = previous;
}

function queryTokens(value: string): string[] {
  return text(value).split(/[\n,;]+/).map((item) => Core().norm(item)).filter(Boolean);
}

function rowsForMode(): EvolutionRecord[] {
  if (!hasValidatedLd()) return [];
  const comparison = state.comparison;
  const relation = comparison?.relation;
  const current = comparison?.current;
  const pwCurrent = selectedSnapshot("pw", "current");
  const sigemCurrent = selectedSnapshot("sigem", "current");
  if (state.listMode === "sigem-new") return comparison?.sigem?.added || [];
  if (state.listMode === "pw-new") return comparison?.pw?.added || [];
  if (state.listMode === "pw-emitted") return comparison?.pwEmissions || [];
  if (state.listMode === "both") return relation?.newInBoth || [];
  if (state.listMode === "missing-pw") return relation?.newSigemMissingPw || [];
  if (state.listMode === "removed-sigem") return comparison?.sigem?.removed || [];
  if (state.listMode === "removed-pw") return comparison?.pw?.removed || [];
  if (state.listMode === "pw-current") return pwCurrent?.records || [];
  if (state.listMode === "pw-current-emitted") return (pwCurrent?.records || []).filter((row) => row.emitted);
  if (state.listMode === "pw-current-not-emitted") return (pwCurrent?.records || []).filter((row) => !row.emitted);
  if (state.listMode === "only-sigem") return current?.onlySigem || [];
  if (state.listMode === "only-pw") return current?.onlyPw || [];
  if (state.listMode === "current-both") return current?.both || [];
  if (state.listMode === "excluded-sigem") return sigemCurrent?.rejected || [];
  if (state.listMode === "excluded-pw") return pwCurrent?.rejected || [];
  return [];
}

function computeFilteredRows(filters = state.filters): EvolutionRecord[] {
  const started = now();
  const tokens = queryTokens(filters.query);
  const normalizedType = Core().norm(filters.documentType);
  const normalizedStatus = Core().norm(filters.status);
  const normalizedDiscipline = Core().norm(filters.discipline);
  const normalizedTag = Core().norm(filters.tag);
  const normalizedEap = Core().norm(filters.eap);
  const normalizedRevision = Core().normalizeRevision(filters.revision);
  const rows = rowsForMode().filter((row) => {
    if (tokens.length && !tokens.some((token) => Core().norm(row.document).includes(token))) return false;
    if (filters.documentClass && text(row.documentClass) !== filters.documentClass) return false;
    if (normalizedType && !Core().norm(row.documentType).includes(normalizedType)) return false;
    if (filters.source && text(row.system) !== filters.source) return false;
    if (normalizedRevision && Core().normalizeRevision(row.revision) !== normalizedRevision) return false;
    if (normalizedStatus && !Core().norm(row.status).includes(normalizedStatus)) return false;
    if (normalizedDiscipline && !Core().norm(row.discipline).includes(normalizedDiscipline)) return false;
    if (normalizedTag && !Core().norm(row.tag).includes(normalizedTag)) return false;
    if (normalizedEap && !Core().norm(row.eap).includes(normalizedEap)) return false;
    return true;
  });
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

async function readHistoryMaps(
  sources: Array<{ system: EvolutionSystem; metadata: EvolutionSourceSnapshotMeta[] }>,
  universe: EvolutionUiState["ldUniverse"],
): Promise<{ payloads: Map<string, EvolutionPayload>; prepared: Map<string, EvolutionSnapshot> }> {
  const started = now();
  const history = History();
  const management = Management();
  const payloads = new Map<string, EvolutionPayload>();
  const prepared = new Map<string, EvolutionSnapshot>();
  const prefix = management?.PAYLOAD_PREFIX || "sourcePayload:";
  const allSources = sources.flatMap(({ system, metadata }) => metadata.map((source) => ({ system, source })));

  const readMany = async (keys: string[]): Promise<Map<string, unknown>> => {
    const output = new Map<string, unknown>();
    if (!keys.length) return output;
    const db = await history.openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(history.STORES.meta, "readonly");
        const store = tx.objectStore(history.STORES.meta);
        let pending = keys.length;
        let failed = false;
        keys.forEach((key) => {
          const request = store.get(key);
          request.onsuccess = () => {
            const row = request.result as MetaRecord | undefined;
            if (row?.value !== undefined) output.set(key, row.value);
            pending -= 1;
            if (!pending && !failed) resolve();
          };
          request.onerror = () => {
            if (failed) return;
            failed = true;
            reject(request.error || new Error("Falha ao ler histórico da Evolução."));
          };
        });
      });
    } finally {
      db.close();
    }
    return output;
  };

  const persistedKeys: string[] = [];
  const persistedKeyBySource = new Map<string, string>();
  for (const { system, source } of allSources) {
    const key = preparedCacheKey(system, source, universe);
    persistedKeyBySource.set(system + ":" + source.id, key);
    const memory = preparedSnapshotCache.get(key);
    if (memory && memory.analysisVersion === Core().CALCULATION_VERSION) {
      prepared.set(key, memory);
    } else {
      persistedKeys.push(key);
    }
  }

  const persistedValues = await readMany([...new Set(persistedKeys)]);
  persistedValues.forEach((value, key) => {
    const cached = value as PreparedSnapshotCacheValue;
    if (cached?.snapshot && cached.snapshot.analysisVersion === Core().CALCULATION_VERSION && Array.isArray(cached.snapshot.records)) {
      prepared.set(key, cached.snapshot);
      preparedSnapshotCache.set(key, cached.snapshot);
    }
  });

  const misses = allSources.filter(({ system, source }) => {
    const key = persistedKeyBySource.get(system + ":" + source.id);
    return !key || !prepared.has(key);
  });
  const payloadKeys = misses.map(({ source }) => prefix + source.id);
  const rawValues = await readMany([...new Set(payloadKeys)]);
  for (const { source } of misses) {
    const value = rawValues.get(prefix + source.id) as EvolutionPayload | undefined;
    if (value && Array.isArray(value.records)) payloads.set(text(value.snapshotId) || source.id, value);
  }

  state.metrics.evolutionHistoryReadMs = now() - started;
  return { payloads, prepared };
}

async function persistPreparedSnapshots(entries: Array<{ key: string; snapshot: EvolutionSnapshot; source: EvolutionSourceSnapshotMeta; ldFingerprint: string }>): Promise<void> {
  if (!entries.length) return;
  const history = History();
  const db = await history.openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(history.STORES.meta, "readwrite");
      const store = tx.objectStore(history.STORES.meta);
      entries.forEach(({ key, snapshot: prepared, source, ldFingerprint }) => {
        const value: PreparedSnapshotCacheValue = {
          analysisVersion: prepared.analysisVersion || prepared.calculationVersion,
          sourceSnapshotId: source.id,
          sourceImportedAt: source.importedAt || source.recordedAt,
          ldFingerprint,
          snapshot: prepared,
        };
        if (store.keyPath) store.put({ key, value });
        else store.put(value, key);
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Falha ao persistir cache da Evolução."));
      tx.onabort = () => reject(tx.error || new Error("Cache da Evolução abortado."));
    });
  } finally {
    db.close();
  }
}

async function buildPreparedSnapshots(
  system: EvolutionSystem,
  metadata: EvolutionSourceSnapshotMeta[],
  payloads: Map<string, EvolutionPayload>,
  storedPrepared: Map<string, EvolutionSnapshot>,
  universe: ReturnType<EvolutionCoreApi["buildLdUniverse"]>,
): Promise<{ output: EvolutionSnapshot[]; unavailable: number; writes: Array<{ key: string; snapshot: EvolutionSnapshot; source: EvolutionSourceSnapshotMeta; ldFingerprint: string }> }> {
  const output: EvolutionSnapshot[] = [];
  const writes: Array<{ key: string; snapshot: EvolutionSnapshot; source: EvolutionSourceSnapshotMeta; ldFingerprint: string }> = [];
  let unavailable = 0;
  const ldFingerprint = text(universe?.fingerprint);
  for (const sourceSnapshot of metadata.slice().sort((a, b) => Date.parse(text(a.importedAt)) - Date.parse(text(b.importedAt)))) {
    const payload = payloads.get(sourceSnapshot.id);
    if (!payload || !Array.isArray(payload.records)) {
      unavailable += 1;
      continue;
    }
    const key = preparedCacheKey(system, sourceSnapshot, state.ldUniverse);
    const cached = preparedSnapshotCache.get(key) || storedPrepared.get(key);
    if (cached && cached.analysisVersion === Core().CALCULATION_VERSION && Array.isArray(cached.records)) {
      preparedSnapshotCache.set(key, cached);
      output.push(cached);
      state.metrics.evolutionCacheHitCount += 1;
      continue;
    }
    state.metrics.evolutionCacheMissCount += 1;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    const base = {
      meta: {
        ...(payload.meta || {}),
        fileName: text(payload.meta?.fileName) || sourceSnapshot.fileName,
        importedAt: sourceSnapshot.importedAt || text(payload.meta?.importedAt),
      },
      records: payload.records,
    };
    try {
      const prepared = Core().buildSnapshot(system, base, universe, {
        snapshotId: sourceSnapshot.id,
        sourceSnapshotId: sourceSnapshot.id,
      });
      preparedSnapshotCache.set(key, prepared);
      output.push(prepared);
      writes.push({ key, snapshot: prepared, source: sourceSnapshot, ldFingerprint });
    } catch (error) {
      console.warn(`[SIGEM×PW][evolução] snapshot ${sourceSnapshot.id}:`, error);
      unavailable += 1;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }
  return { output, unavailable, writes };
}

function recalculate(): void {
  if (!hasValidatedLd()) {
    state.comparison = null;
    syncFilteredRows();
    return;
  }
  const started = now();
  state.comparison = Core().comparePeriod(
    selectedSnapshot("sigem", "previous"),
    selectedSnapshot("sigem", "current"),
    selectedSnapshot("pw", "previous"),
    selectedSnapshot("pw", "current"),
  );
  state.metrics.evolutionComparisonMs = now() - started;
  state.page = 1;
  state.detailRow = null;
  syncFilteredRows();
}

function fullTimeline(): EvolutionUiState["timeline"] {
  const key = [
    Core().CALCULATION_VERSION,
    state.ldUniverse?.fingerprint || "",
    ...state.sigem.map((row) => [row.id, row.importedAt, row.contentFingerprint || ""].join("@")),
    "|",
    ...state.pw.map((row) => [row.id, row.importedAt, row.contentFingerprint || ""].join("@")),
  ].join(":");
  const cached = timelineCache.get(key);
  if (cached) return cached;
  const started = now();
  const built = Core().buildDailyTimeline(state.sigem, state.pw);
  state.metrics.evolutionTimelineMs = now() - started;
  timelineCache.set(key, built);
  return built;
}

function applyPeriod(): boolean {
  const started = now();
  if (state.period.start && state.period.end && state.period.start > state.period.end) return false;
  pairDefaults("sigem");
  pairDefaults("pw");
  state.timeline = fullTimeline().filter((row) => (!state.period.start || row.date >= state.period.start) && (!state.period.end || row.date <= state.period.end));
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

    const [sigemMeta, pwMeta] = await Promise.all([
      History().listSourceSnapshots("sigem"),
      History().listSourceSnapshots("pw"),
    ]);
    const historyMaps = await readHistoryMaps([
      { system: "sigem", metadata: sigemMeta },
      { system: "pw", metadata: pwMeta },
    ], universe);
    const [sigem, pw] = await Promise.all([
      buildPreparedSnapshots("sigem", sigemMeta, historyMaps.payloads, historyMaps.prepared, universe),
      buildPreparedSnapshots("pw", pwMeta, historyMaps.payloads, historyMaps.prepared, universe),
    ]);
    state.sigem = ordered(sigem.output);
    state.pw = ordered(pw.output);
    state.unavailable = { sigem: sigem.unavailable, pw: pw.unavailable };
    applyPeriod();
    state.metrics.evolutionSnapshotBuildMs = now() - started;
    debugMetric("snapshots", {
      ms: state.metrics.evolutionSnapshotBuildMs,
      historyReadMs: state.metrics.evolutionHistoryReadMs,
      cacheHits: state.metrics.evolutionCacheHitCount,
      cacheMisses: state.metrics.evolutionCacheMissCount,
      sigem: state.sigem.length,
      pw: state.pw.length,
    });
    const writes = [...sigem.writes, ...pw.writes];
    if (writes.length) {
      void persistPreparedSnapshots(writes).catch((error) => {
        if ((window as unknown as { GRCON_DEBUG_UI?: boolean }).GRCON_DEBUG_UI === true) console.warn("[SIGEM×PW][evolução] cache derivado:", error);
      });
    }
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
  if (state.ready && (state.sigem.length || state.pw.length)) {
    emit();
    return;
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
  preferredSelections = { ...preferredSelections, [key]: value };
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

function auditRow(row: EvolutionRecord, situation = ""): Record<string, unknown> {
  return {
    Código: row.document || "",
    Revisão: row.revision || "",
    "Documento + revisão": row.documentRevisionKey || "",
    Classe: row.documentClass || "",
    Título: row.title || "",
    Origem: (row.system || "").toUpperCase(),
    "Status SIGEM/PW": row.status || "",
    "Última emissão": row.lastEmission || "",
    "Regra de emissão": row.emissionReason || "",
    "Data de cadastro": row.registrationDate || "",
    "Data de emissão": row.emissionDate || "",
    "Data relevante": row.date || "",
    Situação: situation || row.movement || "",
    "Motivo de inclusão": row.inclusionReason || "",
    "Motivo de exclusão": row.exclusionReason || row.reason || "",
    "Linha origem": row.sourceRow || "",
  };
}

function snapshotRuleRows(label: string, snapshot: EvolutionSnapshot | null): Array<Record<string, unknown>> {
  if (!snapshot) return [{ Item: label, Valor: "Não selecionado" }];
  const audit = snapshot.audit || {};
  return [
    { Item: `${label} · arquivo`, Valor: snapshot.fileName || "base" },
    { Item: `${label} · snapshot`, Valor: snapshot.id },
    { Item: `${label} · hash`, Valor: snapshot.contentFingerprint || "" },
    { Item: `${label} · importado em`, Valor: snapshot.importedAt },
    { Item: `${label} · responsável`, Valor: snapshot.importedBy || "Não disponível na origem" },
    { Item: `${label} · linhas brutas`, Valor: audit.rawRecords || 0 },
    { Item: `${label} · aceitas`, Valor: audit.acceptedRecords || 0 },
    { Item: `${label} · documento + revisão`, Valor: audit.documentRevisionRecords || 0 },
    { Item: `${label} · documentos únicos`, Valor: audit.uniqueDocuments || 0 },
    { Item: `${label} · duplicidades exatas`, Valor: audit.technicalDuplicates || 0 },
    { Item: `${label} · excluídas`, Valor: audit.discardedRecords || 0 },
    { Item: `${label} · regra de cadastro`, Valor: audit.registrationRule || "" },
    { Item: `${label} · regra de emissão`, Valor: audit.emissionRule || "" },
    { Item: `${label} · data de cadastro`, Valor: audit.registrationDateField || "" },
    { Item: `${label} · data de emissão`, Valor: audit.emissionDateField || "" },
    { Item: `${label} · data do snapshot`, Valor: audit.snapshotDateField || "" },
  ];
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

async function exportAuditWorkbook(): Promise<number> {
  if (state.exporting) return 0;
  const sigemCurrent = selectedSnapshot("sigem", "current");
  const pwCurrent = selectedSnapshot("pw", "current");
  const comparison = state.comparison;
  if (!sigemCurrent && !pwCurrent) {
    notify("Selecione ao menos uma base atual para exportar a auditoria.", "warning");
    return 0;
  }

  state.exporting = true;
  state.exportMessage = "Gerando relatório de auditoria SIGEM × PW...";
  state.exportMessageKind = "info";
  emit();
  const started = now();
  try {
    if (!window.GRCONModuleLoader) throw new Error("Carregador de módulos do GRCON indisponível.");
    await window.GRCONModuleLoader.ensure("xlsx");
    const xlsx = runtime().XLSX;
    if (!xlsx) throw new Error("Exportador XLSX indisponível.");
    const workbook = xlsx.utils.book_new();
    const append = (name: string, rows: Array<Record<string, unknown>>) => {
      const safeRows = rows.length ? rows : [{ Informação: "Sem registros para esta categoria." }];
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(safeRows), name.slice(0, 31));
    };

    const sigemAudit = sigemCurrent?.audit || {};
    const pwAudit = pwCurrent?.audit || {};
    append("Resumo", [
      { Métrica: "Versão da análise", Valor: comparison?.analysisVersion || Core().CALCULATION_VERSION },
      { Métrica: "SIGEM · documentos únicos", Valor: sigemAudit.uniqueDocuments || 0 },
      { Métrica: "SIGEM · documento + revisão", Valor: sigemAudit.documentRevisionRecords || 0 },
      { Métrica: "PW · documentos únicos", Valor: pwAudit.uniqueDocuments || 0 },
      { Métrica: "PW · documento + revisão cadastrado", Valor: pwAudit.documentRevisionRecords || 0 },
      { Métrica: "PW · documento + revisão emitido", Valor: pwAudit.emittedDocumentRevisionRecords || 0 },
      { Métrica: "PW · documentos únicos emitidos", Valor: pwAudit.emittedUniqueDocuments || 0 },
      { Métrica: "Somente SIGEM (doc+rev)", Valor: comparison?.current.onlySigem.length || 0 },
      { Métrica: "Somente PW (doc+rev)", Valor: comparison?.current.onlyPw.length || 0 },
      { Métrica: "SIGEM + PW (doc+rev)", Valor: comparison?.current.both.length || 0 },
      { Métrica: "Novas emissões no período", Valor: comparison?.pwEmissions.length || 0 },
    ]);
    append("SIGEM x PW", [
      ...(comparison?.current.both || []).map((row) => auditRow(row, row.movement || "SIGEM + PW")),
      ...(comparison?.current.onlySigem || []).map((row) => auditRow(row, "Somente SIGEM")),
      ...(comparison?.current.onlyPw || []).map((row) => auditRow(row, "Somente PW")),
    ]);
    append("Novos", [
      ...(comparison?.sigem?.added || []).map((row) => auditRow(row, "Novo SIGEM")),
      ...(comparison?.pw?.added || []).map((row) => auditRow(row, "Novo PW")),
    ]);
    append("Novas revisões", [
      ...(comparison?.sigem?.documentRevision?.newRevisions || []).map((row) => auditRow(row, "Nova revisão SIGEM")),
      ...(comparison?.pw?.documentRevision?.newRevisions || []).map((row) => auditRow(row, "Nova revisão PW")),
    ]);
    append("Emitidos", (pwCurrent?.records || []).filter((row) => row.emitted).map((row) => auditRow(row, "Emitido")));
    append("Não emitidos", (pwCurrent?.records || []).filter((row) => !row.emitted).map((row) => auditRow(row, "Não emitido")));
    append("Somente SIGEM", (comparison?.current.onlySigem || []).map((row) => auditRow(row, "Somente SIGEM")));
    append("Somente PW", (comparison?.current.onlyPw || []).map((row) => auditRow(row, "Somente PW")));
    append("Excluídos da análise", [
      ...(sigemCurrent?.rejected || []).map((row) => auditRow(row, "Excluído SIGEM")),
      ...(pwCurrent?.rejected || []).map((row) => auditRow(row, "Excluído PW")),
      ...(sigemCurrent?.duplicates || []).map((row) => auditRow(row, "Duplicidade exata SIGEM")),
      ...(pwCurrent?.duplicates || []).map((row) => auditRow(row, "Duplicidade exata PW")),
    ]);
    append("Regras da análise", [
      { Item: "analysisVersion", Valor: comparison?.analysisVersion || Core().CALCULATION_VERSION },
      { Item: "Granularidade técnica", Valor: "A evolução legada preserva ocorrências técnicas para compatibilidade histórica." },
      { Item: "Granularidade auditável", Valor: "Documento + revisão é calculado em paralelo e usado para explicar novos documentos, novas revisões e presença entre sistemas." },
      { Item: "Emissão PW", Valor: "SIM = evidência atual; NÃO = evidência histórica; PREVISTO/ausente/desconhecido = não emitido." },
      ...snapshotRuleRows("SIGEM atual", sigemCurrent),
      ...snapshotRuleRows("PW atual", pwCurrent),
    ]);

    const output = xlsx.write(workbook, { bookType: "xlsx", type: "array" });
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    downloadBlob(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `GRCON_Auditoria_SIGEM_PW_${date}.xlsx`);
    state.metrics.evolutionExportMs = now() - started;
    state.exportMessage = "Relatório de auditoria gerado com sucesso.";
    state.exportMessageKind = "success";
    notify(state.exportMessage, "success");
    return 1;
  } catch (error) {
    state.exportMessage = messageOf(error, "Não foi possível gerar o relatório de auditoria.");
    state.exportMessageKind = "error";
    notify(state.exportMessage, "error");
    return 0;
  } finally {
    state.exporting = false;
    emit();
  }
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
  exportAuditWorkbook,
  openHistoryManager,
  subscribeExternalEvents,
};

export type SigemPwEvolutionAdapter = typeof sigemPwEvolutionAdapter;
