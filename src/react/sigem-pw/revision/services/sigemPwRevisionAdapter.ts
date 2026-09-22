import type { SigemPwModel } from "../../types/domain";
import {
  EMPTY_REVISION_FILTERS,
  REVISION_PAGE_SIZE,
  type RevisionAnalysis,
  type RevisionDocumentClass,
  type RevisionFilters,
  type RevisionHistoryItem,
  type RevisionOptionSets,
  type RevisionPageData,
  type RevisionRow,
  type RevisionSituationFilter,
  type RevisionUiSnapshot,
  type RevisionUiState,
} from "../types/domain";

type Subscriber = () => void;
type RevisionCoreApi = NonNullable<Window["GrconSigemPwRevision"]>;

const state: RevisionUiState = {
  active: false,
  modelRef: null,
  analysis: null,
  analysisGeneration: 0,
  filters: EMPTY_REVISION_FILTERS(),
  page: 1,
  expandedKey: "",
  searchTimer: null,
  exporting: false,
  exportMessage: "",
  exportMessageKind: "info",
  rawSearch: "",
  rawDocumentList: "",
  progress: { active: false, done: 0, total: 0, message: "" },
};

let revision = 0;
let snapshot: RevisionUiSnapshot = { ...state, revision };
const subscribers = new Set<Subscriber>();
let externalListenersInstalled = false;
let analysisPromise: Promise<RevisionAnalysis | null> | null = null;

function Core(): RevisionCoreApi {
  const api = window.GrconSigemPwRevision;
  if (!api?.analyzeAsync || !api.filterRows || !api.historyForRows || !api.rank || !api.SITUATIONS || !api.LABELS) {
    throw new Error("Motor de revisão SIGEM × PW indisponível.");
  }
  return api;
}

function dashboardModel(): SigemPwModel | null {
  return window.GrconSigemPwDashboardUi?.state?.model || null;
}

function emit(): void {
  revision += 1;
  snapshot = { ...state, revision };
  subscribers.forEach((listener) => listener());
}

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function fmt(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR");
}

function notify(message: string, kind = "info"): void {
  if (typeof window.GrconNotify === "function") window.GrconNotify(message, kind);
  else if (kind === "error") console.error("[SIGEM×PW][revisões]", message);
}

function currentFilters(overrides?: Partial<RevisionFilters>): RevisionFilters {
  return { ...state.filters, ...(overrides || {}) };
}

function updateFilters(next: Partial<RevisionFilters>): void {
  state.filters = { ...state.filters, ...next };
  state.page = 1;
  state.exportMessage = "";
  ensureExpandedRowStillVisible();
  emit();
}

function filteredRows(filters?: RevisionFilters): RevisionRow[] {
  if (!state.analysis) return [];
  return Core().filterRows?.(state.analysis.rows, filters || state.filters) as RevisionRow[];
}

function pageData(rows = filteredRows()): RevisionPageData {
  const pages = Math.max(1, Math.ceil(rows.length / REVISION_PAGE_SIZE));
  const page = Math.min(Math.max(1, state.page), pages);
  if (page !== state.page) state.page = page;
  const start = (page - 1) * REVISION_PAGE_SIZE;
  return { rows, visible: rows.slice(start, start + REVISION_PAGE_SIZE), pages, start };
}

function ensureExpandedRowStillVisible(rows = filteredRows()): void {
  if (!state.expandedKey) return;
  const data = pageData(rows);
  if (!data.visible.some((row) => row.key === state.expandedKey)) state.expandedKey = "";
}

function setPage(page: number): void {
  const rows = filteredRows();
  const pages = Math.max(1, Math.ceil(rows.length / REVISION_PAGE_SIZE));
  state.page = Math.min(Math.max(1, Number(page) || 1), pages);
  ensureExpandedRowStillVisible(rows);
  emit();
}

function setFilter<K extends keyof RevisionFilters>(key: K, value: RevisionFilters[K]): void {
  updateFilters({ [key]: value } as Pick<RevisionFilters, K>);
}

function setRawSearch(value: string): void {
  state.rawSearch = value;
  emit();
}

function applySearch(value: string): void {
  state.rawSearch = value;
  if (state.filters.search === value) return;
  updateFilters({ search: value });
}

function setRawDocumentList(value: string): void {
  state.rawDocumentList = value;
  emit();
}

function applyDocumentList(value: string): void {
  state.rawDocumentList = value;
  if (state.filters.documentList === value) return;
  updateFilters({ documentList: value });
}

function toggleSituation(value: RevisionSituationFilter): void {
  setFilter("situation", state.filters.situation === value ? "attention" : value);
}

function toggleExpanded(key: string): void {
  state.expandedKey = state.expandedKey === key ? "" : key;
  emit();
}

function optionSets(): RevisionOptionSets {
  const rows = state.analysis?.rows || [];
  const rank = (value: string) => Number(Core().rank?.(value) ?? -1);
  const unique = (values: string[]) => [...new Set(values.filter((value) => text(value) !== ""))];
  const revisions = (values: string[]) => unique(values)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "pt-BR", { numeric: true }));
  return {
    classes: (["ET", "N-1710"] as RevisionDocumentClass[]).filter((value) => rows.some((row) => row.documentClass === value)),
    sigemRevisions: revisions(rows.map((row) => row.sigemRevision)),
    pwRevisions: revisions(rows.map((row) => row.pwRevision)),
    sigemStatuses: unique(rows.map((row) => row.sigemStatus)).sort((a, b) => a.localeCompare(b, "pt-BR")),
    pwStatuses: unique(rows.map((row) => row.pwStatus)).sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}

function histories(row: RevisionRow): { sigem: RevisionHistoryItem[]; pw: RevisionHistoryItem[] } {
  return {
    sigem: Core().historyForRows?.(row.sigemRows, "sigem") as RevisionHistoryItem[] || [],
    pw: Core().historyForRows?.(row.pwRows, "pw") as RevisionHistoryItem[] || [],
  };
}

function finishProgress(): void {
  state.progress = { active: false, done: 0, total: 0, message: "" };
}

async function analyzeCurrentModel(force: boolean): Promise<RevisionAnalysis | null> {
  const model = dashboardModel();
  if (!model) {
    state.analysisGeneration += 1;
    state.modelRef = null;
    state.analysis = null;
    finishProgress();
    state.page = 1;
    state.expandedKey = "";
    emit();
    return null;
  }
  if (!force && state.modelRef === model && state.analysis) return state.analysis;

  const generation = ++state.analysisGeneration;
  state.modelRef = model;
  state.progress = {
    active: true,
    done: 0,
    total: 0,
    message: "Comparando revisões SIGEM × PW...",
  };
  state.exportMessage = "";
  emit();

  const task = Core().analyzeAsync!(model, {
    chunkSize: 350,
    generation,
    isCurrent: (value: number) => value === state.analysisGeneration,
    onProgress: (done: number, total: number) => {
      if (generation !== state.analysisGeneration) return;
      state.progress = {
        active: true,
        done,
        total,
        message: `${fmt(done)} de ${fmt(total)} documentos processados`,
      };
      emit();
    },
  }) as Promise<RevisionAnalysis>;

  analysisPromise = task.then((result) => {
    if (!result || result.cancelled || generation !== state.analysisGeneration) return null;
    state.analysis = result;
    state.page = 1;
    ensureExpandedRowStillVisible(result.rows);
    finishProgress();
    state.exportMessage = "";
    if (window.console?.debug) console.debug("[SIGEM×PW][performance] revisão", result.metrics);
    emit();
    return result;
  }).catch((error) => {
    if (generation === state.analysisGeneration) {
      finishProgress();
      emit();
    }
    throw error;
  }).finally(() => {
    if (analysisPromise === task) analysisPromise = null;
  });

  return analysisPromise;
}

async function activate(): Promise<RevisionAnalysis | null> {
  if (!state.active) {
    state.active = true;
    emit();
  }
  return analyzeCurrentModel(false);
}

async function refresh(): Promise<RevisionAnalysis | null> {
  if (!state.active) {
    state.active = true;
    emit();
  }
  return analyzeCurrentModel(true);
}

function exportFiltersSnapshot(): RevisionFilters {
  return currentFilters({
    search: state.rawSearch,
    documentList: state.rawDocumentList,
  });
}

function yieldUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(() => resolve());
    else window.setTimeout(resolve, 0);
  });
}

async function exportFilteredRows(): Promise<number> {
  if (state.exporting || !state.analysis) return 0;
  const filters = exportFiltersSnapshot();
  const rows = filteredRows(filters);
  if (!rows.length) {
    state.exportMessage = "Nenhum documento disponível para exportação.";
    state.exportMessageKind = "info";
    emit();
    notify(state.exportMessage, "info");
    return 0;
  }

  state.exporting = true;
  state.exportMessage = `Gerando Excel com ${fmt(rows.length)} registro(s)...`;
  state.exportMessageKind = "info";
  emit();
  await yieldUi();

  try {
    if (!window.GRCONModuleLoader) throw new Error("Carregador de módulos do GRCON indisponível.");
    await window.GRCONModuleLoader.ensure("report");
    if (!window.GrconSigemPwRevisionReport) await window.GRCONModuleLoader.ensure("sigem_pw_revision_report.js");
    const report = window.GrconSigemPwRevisionReport;
    if (!report?.buildWorkbook) throw new Error("Exportador Excel da análise SIGEM × PW indisponível.");
    const buffer = await report.buildWorkbook(rows, filters, {
      brandAssets: window.GRCONBrandAssets || null,
      createdAt: new Date(),
    });
    const blob = new Blob([buffer], { type: report.MIME_XLSX });
    const filename = report.downloadName(filters, new Date());
    if (window.GrconUtils?.downloadBlob) window.GrconUtils.downloadBlob(blob, filename);
    else {
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
    state.exportMessage = `Excel gerado com sucesso. ${fmt(rows.length)} registro(s) exportado(s).`;
    state.exportMessageKind = "success";
    notify(state.exportMessage, "success");
    return rows.length;
  } catch (error) {
    console.error("[SIGEM×PW] exportação da lista filtrada:", error);
    state.exportMessage = messageOf(error, "Não foi possível gerar o Excel da lista filtrada.");
    state.exportMessageKind = "error";
    notify(state.exportMessage, "error");
    return 0;
  } finally {
    state.exporting = false;
    emit();
  }
}

async function syncAfterBaseEvent(event: Event): Promise<void> {
  try {
    const detail = (event as CustomEvent<{ source?: string }>).detail;
    if (detail?.source !== "sigem-pw-dashboard" && window.GrconSigemPwDashboardUi?.refresh) {
      await window.GrconSigemPwDashboardUi.refresh("sincronização das revisões");
    }
    if (state.active) await refresh();
  } catch (error) {
    console.error("[SIGEM×PW] revisão após atualização:", error);
  }
}

function subscribeExternalEvents(): () => void {
  if (externalListenersInstalled) return () => undefined;
  externalListenersInstalled = true;
  const conference = (event: Event) => { void syncAfterBaseEvent(event); };
  const pw = (event: Event) => { void syncAfterBaseEvent(event); };
  window.addEventListener("grcon:conference-updated", conference);
  window.addEventListener("grcon:pw-base-updated", pw);
  return () => {
    window.removeEventListener("grcon:conference-updated", conference);
    window.removeEventListener("grcon:pw-base-updated", pw);
    externalListenersInstalled = false;
  };
}

export const sigemPwRevisionAdapter = {
  state,
  subscribe(listener: Subscriber): () => void { subscribers.add(listener); return () => subscribers.delete(listener); },
  getSnapshot(): RevisionUiSnapshot { return snapshot; },
  activate,
  refresh,
  analyzeCurrentModel,
  filteredRows,
  pageData,
  optionSets,
  histories,
  setPage,
  setFilter,
  setRawSearch,
  applySearch,
  setRawDocumentList,
  applyDocumentList,
  toggleSituation,
  toggleExpanded,
  exportFiltersSnapshot,
  exportFilteredRows,
  subscribeExternalEvents,
};

export type SigemPwRevisionAdapter = typeof sigemPwRevisionAdapter;
