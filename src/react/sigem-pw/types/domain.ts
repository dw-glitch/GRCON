export type SigemPwBaseKind = "sigem" | "pw" | "ld";
export type SigemPwEditableBaseKind = "sigem" | "pw";
export type SigemPwDocumentClass = "" | "ET" | "N-1710" | "CV" | "Não classificado";
export type SigemPwRevisionScope = "revision0" | "all";
export type SigemPwListKey = "all" | "sigem" | "pw" | "pwDuplicates" | "bothOtherRevision" | "sigemOnly" | "cvNotApplicable" | "bothNotEmitted" | "bothEmitted" | "pwOnlyNotEmitted" | "pwOnlyEmitted" | "sigemN1710OutsideLd" | "pwN1710OutsideLd" | "ldUnavailableN1710" | "ldWithoutSigem" | "n1710Candidates";
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
  company?: string;
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
  sigemDate?: string;
  pwStatus: string;
  pwEmission: string;
  pwLastEmission?: string;
  pwCompany?: string;
  ldStatus?: string;
  ldOriginalCode?: string;
  ldRevision?: string;
  ldSourceRow?: number;
  n1710DocumentType?: string;
  pwRegistrationStatus?: string;
  sigemOriginalCode?: string;
  pwOriginalCode?: string;
  pwRevisionEvidence?: string;
  pwRevision?: string;
  pwRevisionMatched?: boolean;
  hasPwEntry?: boolean;
  duplicateCount?: number;
  duplicateOccurrence?: number;
  pwSourceRow?: number;
  pwFileName?: string;
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
  cvNotApplicable: number;
  bothOtherRevision: number;
  bothNotEmitted: number;
  bothEmitted: number;
  pwOnlyNotEmitted: number;
  pwOnlyEmitted: number;
  classifiedTotal: number;
}

export interface SigemPwQuality {
  sigemRawRecords?: number;
  pwRawRecords?: number;
  pwSourceRows?: number;
  pwDuplicateGroups?: number;
  pwDuplicateExtraRows?: number;
  pwDuplicateRows?: number;
  sigemEntries: number;
  pwEntries: number;
  pwEmittedEntries?: number;
  ldDocumentCount: number;
  ldAvailable?: boolean;
  sigemN1710OutsideLd?: number;
  pwN1710OutsideLd?: number;
  ldWithoutSigem?: number;
  n1710Candidates?: number;
}

export interface SigemPwResult {
  revisionScope: SigemPwRevisionScope;
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
  CV: SigemPwResult;
  "revision0:all": SigemPwResult;
  "revision0:ET": SigemPwResult;
  "revision0:N-1710": SigemPwResult;
  "revision0:CV": SigemPwResult;
  "all:all": SigemPwResult;
  "all:ET": SigemPwResult;
  "all:N-1710": SigemPwResult;
  "all:CV": SigemPwResult;
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
  revision: string;
  sigemStatus: string;
  inPw: "" | "yes" | "no";
}

export interface SigemPwDateEditor {
  open: boolean;
  system: SigemPwEditableBaseKind | "";
  snapshotId: string;
  value: string;
}

export interface SigemPwSharedVersion {
  snapshot_id: string; version: number; file_name: string; record_count: number; status: string;
  published_at: string; created_at: string; created_by_name?: string; metadata: SigemPwBaseMeta;
}

export interface SigemPwState {
  sigemVersions: SigemPwSharedVersion[];
  pwVersions?: SigemPwSharedVersion[];
  pwSharedError?: string;
  analysisSigemId: string;
  analysisPwId: string;
  analysisError: string;
  officialSigem: SigemPwBaseMeta | null;
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
  revisionScope: SigemPwRevisionScope;
  filters: SigemPwFilters;
  filterResetKey: number;
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
  sigem: "Documentos do total SIGEM",
  pw: "Cadastrados no PW",
  pwDuplicates: "Duplicados PW",
  bothOtherRevision: "Cadastrado: conferir revisão",
  sigemOnly: "SIGEM: falta cadastrar no PW",
  cvNotApplicable: "CV — Currículos (PW não aplicável)",
  bothNotEmitted: "SIGEM + PW: ainda não emitido",
  bothEmitted: "SIGEM + PW: emitido",
  pwOnlyNotEmitted: "PW: revisão sem SIGEM, não emitida",
  pwOnlyEmitted: "PW: revisão sem SIGEM, emitida",
  sigemN1710OutsideLd: "SIGEM N-1710 fora da LD",
  pwN1710OutsideLd: "PW N-1710 fora da LD",
  ldUnavailableN1710: "N-1710 aguardando LD",
  ldWithoutSigem: "LD N-1710 sem SIGEM",
  n1710Candidates: "Códigos N-1710 para conferir",
});

export const SIGEM_PW_PAGE_SIZE = 100;
