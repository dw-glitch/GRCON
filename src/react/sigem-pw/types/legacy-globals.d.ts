import type {
  SigemPwBase,
  SigemPwBaseMeta,
  SigemPwEditableBaseKind,
  SigemPwHistory,
  SigemPwModel,
  SigemPwReadiness,
  SigemPwRecord,
  SigemPwResult,
  SigemPwState,
  WorkerModelPayload,
} from "./domain";
import type {
  RevisionAnalysis,
  RevisionFilters,
  RevisionHistoryItem,
  RevisionRow,
  RevisionUiState,
} from "../revision/types/domain";
import type {
  EvolutionComparison,
  EvolutionLdUniverse,
  EvolutionRecord,
  EvolutionSnapshot,
  EvolutionSourceSnapshotMeta,
  EvolutionSystem,
  EvolutionTimelineDay,
  EvolutionUiState,
} from "../evolution/types/domain";

interface PreparedConferenceImport {
  parsed: { meta: SigemPwBaseMeta; records: SigemPwRecord[] };
  summary?: unknown;
  changes?: unknown;
}
interface ConferenceDetection { score: number; columns: Record<string, number>; }
interface PostingConferenceApi {
  detectColumns(matrix: string[][], maxColumns?: number): ConferenceDetection | null;
  prepareWorkbookImport(workbook: unknown, fileMeta: Record<string, unknown>, history: unknown[], options: Record<string, unknown>): Promise<PreparedConferenceImport>;
  commitPreparedImport(result: PreparedConferenceImport): Promise<unknown>;
}
interface SigemPwDashboardCoreApi {
  SIGEM_BASE_KEY: string; PW_BASE_KEY: string; LD_BASE_KEY: string; HISTORY_KEY: string; LEGACY_SIGEM_BASE_KEY: string; LEGACY_PW_BASE_KEY: string; HISTORY_VERSION: number; PW_SCOPE_VERSION: number;
  normalizeHeader(value: unknown): string; norm(value: unknown): string; parseDateMs(value: unknown): number;
  parsePwCsv(source: string, meta: Record<string, unknown>): { meta: SigemPwBaseMeta; records: SigemPwRecord[] };
  parseLdMatrix(matrix: string[][], meta: Record<string, unknown>): { meta: SigemPwBaseMeta; records: SigemPwRecord[] };
  sanitizePwBase(base: SigemPwBase, ld: SigemPwBase | SigemPwRecord[]): SigemPwBase;
  createModel(sigem: SigemPwRecord[], pw: SigemPwRecord[], ld: SigemPwRecord[]): SigemPwModel;
  aggregateModel(model: SigemPwModel, filters?: { documentClass?: string }): SigemPwResult;
  loadBases(): Promise<{ sigem: SigemPwBase; pw: SigemPwBase; ld: SigemPwBase; history: SigemPwHistory }>;
  loadHistory(): Promise<SigemPwHistory>;
  saveSigemBase(base: SigemPwBase): Promise<SigemPwBase>;
  savePwBase(base: SigemPwBase, ld?: SigemPwBase | SigemPwRecord[]): Promise<SigemPwBase>;
  saveLdAndReprocessPw(ld: SigemPwBase, pw: SigemPwBase): Promise<{ ld: SigemPwBase; pw: SigemPwBase | null }>;
  updateSnapshotDate(kind: SigemPwEditableBaseKind, snapshotId: string, importedAt: string): Promise<{ current?: SigemPwBase; importedAt: string }>;
  deleteSnapshot(snapshotId: string): Promise<unknown>;
  kvGet<T>(key: string, fallback: T): Promise<T>;
  kvSet(key: string, value: unknown): Promise<unknown>;
  kvSetMany(entries: Array<[string, unknown]>): Promise<boolean>;
}
interface SigemPwReadinessApi { assess(state: SigemPwState, result: SigemPwResult): SigemPwReadiness; }
interface RecordedActiveBases { sigem?: { snapshot?: { id?: string } }; pw?: { snapshot?: { id?: string } }; rollbackToken?: unknown; }
interface SigemPwHistoryApi {
  STORES: Readonly<{ sourceSnapshots: string; comparisonSnapshots: string; workingSets: string; snapshotChanges: string; meta: string }>;
  openDb(): Promise<IDBDatabase>;
  listSourceSnapshots(system: EvolutionSystem): Promise<EvolutionSourceSnapshotMeta[]>;
  clearHistory(): Promise<unknown>;
  recordActiveBases(sigem: SigemPwBase, pw: SigemPwBase, options: Record<string, unknown>): Promise<RecordedActiveBases>;
  rollbackRecordedActiveBases(recorded: RecordedActiveBases): Promise<unknown>;
  updateSourceSnapshotDate(system: SigemPwEditableBaseKind, snapshotId: string, importedAt: string): Promise<unknown>;
  contentFingerprint(system: string, records: SigemPwRecord[]): string;
}
interface SigemPwHistoryManagementApi {
  PAYLOAD_PREFIX?: string;
  capturePayload(system: string, base: SigemPwBase, snapshotId: string, context: Record<string, unknown>): Promise<unknown>;
  ensureCurrentPayloads?(): Promise<unknown>;
  state?: { open?: boolean; [key: string]: unknown };
  activate?: () => Promise<unknown> | unknown;
}
interface SigemPwDashboardUiApi {
  activate(): Promise<void>;
  refresh(reason?: string): Promise<void>;
  clearPreStage7BasesOnce(): Promise<boolean>;
  state: SigemPwState;
}
interface RevisionAnalyzeOptions {
  chunkSize?: number;
  generation?: number;
  isCurrent?: (generation: number) => boolean;
  onProgress?: (done: number, total: number) => void;
}
interface SigemPwRevisionCoreApi {
  SITUATIONS: Readonly<{
    UPDATED: "updated";
    PREVIOUS: "pw-previous";
    NOT_FOUND: "pw-not-found";
    AWAITING_EMISSION: "pw-awaiting-emission";
    PW_AHEAD: "pw-ahead";
    REVIEW: "review";
  }>;
  LABELS: Readonly<Record<string, string>>;
  ATTENTION: readonly string[];
  rank(value: unknown): number;
  analyze(model: SigemPwModel): RevisionAnalysis;
  analyzeAsync(model: SigemPwModel, options?: RevisionAnalyzeOptions): Promise<RevisionAnalysis>;
  filterRows(rows: RevisionRow[], filters?: Partial<RevisionFilters>): RevisionRow[];
  historyForRows(rows: SigemPwRecord[], kind: "sigem" | "pw"): RevisionHistoryItem[];
}
interface SigemPwRevisionUiApi {
  activate(): Promise<RevisionAnalysis | null>;
  refresh(): Promise<RevisionAnalysis | null>;
  readonly state: RevisionUiState;
  filteredRows(): RevisionRow[];
  exportFilteredRows(): Promise<number>;
}
interface SigemPwRevisionReportApi {
  MIME_XLSX: string;
  buildWorkbook(rows: RevisionRow[], filters: RevisionFilters, options?: Record<string, unknown>): Promise<ArrayBuffer>;
  downloadName(filters: RevisionFilters, date?: Date): string;
}
interface EvolutionBase {
  meta: Record<string, unknown>;
  records: SigemPwRecord[];
}
interface SigemPwEvolutionCoreApi {
  norm(value: unknown): string;
  normalizeRevision(value: unknown): string;
  buildLdUniverse(records: SigemPwRecord[], history: SigemPwRecord[], options?: { qualityRecords?: SigemPwRecord[] }): EvolutionLdUniverse;
  buildSnapshot(system: EvolutionSystem, base: EvolutionBase, universe: EvolutionLdUniverse, options?: Record<string, unknown>): EvolutionSnapshot;
  comparePeriod(
    sigemPrevious: EvolutionSnapshot | null,
    sigemCurrent: EvolutionSnapshot | null,
    pwPrevious: EvolutionSnapshot | null,
    pwCurrent: EvolutionSnapshot | null,
  ): EvolutionComparison;
  buildDailyTimeline(sigemSnapshots: EvolutionSnapshot[], pwSnapshots: EvolutionSnapshot[]): EvolutionTimelineDay[];
}
interface SigemPwEvolutionUiApi {
  activate(): Promise<void>;
  refresh(forceLd?: boolean): Promise<void>;
  readonly state: EvolutionUiState;
  filteredRows(): EvolutionRecord[];
  exportFilteredRows(): Promise<number>;
}
interface SigemPwBootstrapApi { open(): Promise<void>; openEvolution(): Promise<unknown>; deactivate(): void; }
interface LegacyActivationApi {
  activate?: (...args: unknown[]) => Promise<unknown> | unknown;
  refresh?: (...args: unknown[]) => Promise<unknown> | unknown;
  state?: Record<string, unknown>;
}

declare global {
  interface Window {
    GrconSigemPwDashboard?: SigemPwDashboardCoreApi;
    GrconSigemPwReadiness?: SigemPwReadinessApi;
    GrconSigemPwHistory?: SigemPwHistoryApi;
    GrconSigemPwHistoryManagement?: SigemPwHistoryManagementApi;
    GrconSigemPwRevision?: SigemPwRevisionCoreApi;
    GrconSigemPwRevisionReport?: SigemPwRevisionReportApi;
    GrconSigemPwEvolution?: SigemPwEvolutionCoreApi;
    GrconSigemPwDashboardUi?: SigemPwDashboardUiApi;
    GrconSigemPwRevisionUi?: SigemPwRevisionUiApi;
    GrconSigemPwEvolutionUi?: SigemPwEvolutionUiApi;
    GrconSigemPwDashboardBootstrap?: SigemPwBootstrapApi;
    GrconSigemPwDashboardReact?: { mounted: boolean };
    GrconPostingConference?: PostingConferenceApi;
  }
  interface WindowEventMap {
    "grcon:conference-updated": CustomEvent<{ source?: string; [key: string]: unknown }>;
    "grcon:pw-base-updated": CustomEvent<{ source?: string; [key: string]: unknown }>;
    "grcon:sigem-pw-base-date-updated": CustomEvent<Record<string, unknown>>;
    "grcon:mascot-operation": CustomEvent<Record<string, unknown>>;
  }
}
export type {
  SigemPwDashboardCoreApi,
  SigemPwEvolutionCoreApi,
  SigemPwEvolutionUiApi,
  SigemPwRevisionCoreApi,
  SigemPwRevisionUiApi,
  WorkerModelPayload,
};
export {};
