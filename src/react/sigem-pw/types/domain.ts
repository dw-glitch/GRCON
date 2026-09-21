export type SigemPwBaseKind = "sigem" | "pw" | "ld";
export type SigemPwEditableBaseKind = "sigem" | "pw";
export type SigemPwDocumentClass = "" | "ET" | "N-1710";
export type SigemPwListKey = "all" | "sigemOnly" | "bothNotEmitted" | "bothEmitted" | "pwOnlyNotEmitted" | "pwOnlyEmitted";
export type SigemPwReadinessStatus = "empty" | "partial" | "ready" | "attention";

export interface SigemPwBaseMeta {
  kind?: SigemPwBaseKind;
  snapshotId?: string;
  fileName?: string;
  fileSize?: number;
  lastModified?: number;
  importedAt?: string;
  sourceImportedAt?: string;
  historySourceSnapshotId?: string;
  recordCount?: number;
  sourceRowCount?: number;
  uniqueDocumentCount?: number;
  validRevisionRecordCount?: number;
  scopeVersion?: number;
  scopeLdSnapshotId?: string;
  sheetName?: string;
  [key: string]: unknown;
}

export interface SigemPwRecord {
  document?: string;
  revision?: string;
  revisionComplete?: string;
  status?: string;
  state?: string;
  lastEmission?: string;
  documentClass?: string;
  sourceRow?: number;
  [key: string]: unknown;
}

export interface SigemPwBase {
  meta: SigemPwBaseMeta | null;
  records: SigemPwRecord[];
  sourceRecords?: SigemPwRecord[];
}

export interface SigemPwSnapshot extends SigemPwBase {
  meta: SigemPwBaseMeta;
}

export interface SigemPwHistory {
  version: number;
  snapshots: SigemPwSnapshot[];
  deletedIds?: string[];
}

export interface SigemPwRow {
  key: string;
  documentKey?: string;
  document: string;
  revision: string;
  documentClass: string;
  sigemStatus: string;
  pwStatus: string;
  pwEmission: string;
  situation: string;
  situationKey: SigemPwListKey | string;
  inSigem?: boolean;
  inPw?: boolean;
  pwEmitted?: boolean;
  matchMode?: string;
}

export interface SigemPwClassSummary {
  documentClass: string;
  sigem: number;
  pwRegistered: number;
  pwEmitted: number;
  gapSigemToPw: number;
  gapPwToEmitted: number;
  pwExclusive: number;
  matched: number;
}

export interface SigemPwSummary {
  sigem: number;
  pwRegistered: number;
  pwEmitted: number;
  gapSigemToPw: number;
  gapPwToEmitted: number;
  pwExclusive: number;
  matched: number;
  sigemOnly: number;
  bothNotEmitted: number;
  bothEmitted: number;
  pwOnlyNotEmitted: number;
  pwOnlyEmitted: number;
  classifiedTotal: number;
}

export interface SigemPwQuality {
  sigemRawRecords?: number;
  pwRawRecords?: number;
  sigemEntries: number;
  pwEntries: number;
  pwEmittedEntries?: number;
  ldDocumentCount: number;
}

export interface SigemPwResult {
  summary: SigemPwSummary;
  classes: SigemPwClassSummary[];
  lists: Record<string, SigemPwRow[]>;
  quality: SigemPwQuality;
  [key: string]: unknown;
}

export interface SigemPwModel {
  sigemEntries?: Map<string, unknown>;
  pwEntries?: Map<string, unknown>;
  sigemAll?: Map<string, unknown>;
  pwAll?: Map<string, unknown>;
  normalizedSigem?: SigemPwRecord[];
  normalizedPw?: SigemPwRecord[];
  ldUniverse?: Map<string, unknown> | Set<string>;
  [key: string]: unknown;
}

export interface SigemPwAggregateMap {
  all: SigemPwResult;
  ET: SigemPwResult;
  "N-1710": SigemPwResult;
}

export interface SigemPwReadinessCheck {
  key: string;
  label: string;
  passed: boolean;
  applicable: boolean;
}

export interface SigemPwReadiness {
  version?: string;
  status: SigemPwReadinessStatus;
  ready: boolean;
  loaded: Record<string, boolean>;
  missing: string[];
  checks: SigemPwReadinessCheck[];
  failedChecks: string[];
  title: string;
  message: string;
}

export interface SigemPwFilters {
  documentClass: SigemPwDocumentClass;
  query: string;
}

export interface SigemPwDateEditor {
  open: boolean;
  system: SigemPwEditableBaseKind | "";
  snapshotId: string;
  value: string;
}

export interface SigemPwState {
  ready: boolean;
  busy: boolean;
  progressMessage: string;
  sigem: SigemPwBase;
  pw: SigemPwBase;
  ld: SigemPwBase;
  history: SigemPwHistory;
  model: SigemPwModel | null;
  result: SigemPwResult | null;
  readiness: SigemPwReadiness | null;
  aggregates: SigemPwAggregateMap | null;
  modelGeneration: number;
  dateEditSystem: SigemPwEditableBaseKind | "";
  dateEditSnapshotId: string;
  dateEditor: SigemPwDateEditor;
  historyDialogOpen: boolean;
  filters: SigemPwFilters;
  activeList: SigemPwListKey;
  page: number;
}

export interface SigemPwUiSnapshot extends SigemPwState {
  revision: number;
}

export interface WorkerModelPayload {
  ok: boolean;
  type?: string;
  generation?: number;
  model?: SigemPwModel;
  aggregates?: SigemPwAggregateMap;
  parsed?: { meta: SigemPwBaseMeta; records: SigemPwRecord[] };
  error?: string;
}

export const SIGEM_PW_LISTS: Readonly<Record<SigemPwListKey, string>> = Object.freeze({
  all: "Todas as situações",
  sigemOnly: "SIGEM: falta cadastrar no PW",
  bothNotEmitted: "SIGEM + PW: ainda não emitido",
  bothEmitted: "SIGEM + PW: emitido",
  pwOnlyNotEmitted: "Só PW: ainda não emitido",
  pwOnlyEmitted: "Só PW: emitido",
});

export const SIGEM_PW_PAGE_SIZE = 100;
