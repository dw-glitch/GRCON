export type EvolutionSystem = "sigem" | "pw";
export type EvolutionListMode =
  | "sigem-new"
  | "pw-new"
  | "pw-emitted"
  | "both"
  | "missing-pw"
  | "removed-sigem"
  | "removed-pw"
  | "pw-current"
  | "pw-current-emitted"
  | "pw-current-not-emitted"
  | "only-sigem"
  | "only-pw"
  | "current-both"
  | "excluded-sigem"
  | "excluded-pw";
export type EvolutionExportMessageKind = "info" | "success" | "error";

export interface EvolutionFilters {
  query: string;
  documentClass: string;
  documentType: string;
  revision: string;
  status: string;
  discipline: string;
  tag: string;
  eap: string;
  source: string;
}

export interface EvolutionRecord {
  system: EvolutionSystem;
  document: string;
  documentKey?: string;
  canonicalDocument?: string;
  documentClass: string;
  revision: string;
  version?: string;
  documentRevisionKey?: string;
  title?: string;
  documentType?: string;
  discipline?: string;
  tag?: string;
  eap?: string;
  status?: string;
  date?: string;
  registrationDate?: string;
  emissionDate?: string;
  lastEmission?: string;
  emissionFlag?: string;
  emissionKind?: "current" | "historical" | "planned" | "unknown" | "missing" | string;
  emissionRecognized?: boolean | null;
  emissionReason?: string;
  emitted?: boolean | null;
  ldSource?: string;
  ldSheet?: string;
  ldRow?: number;
  ldPrazo?: string;
  ldValidated?: boolean;
  occurrenceKey?: string;
  matchKey?: string;
  technicalFingerprint?: string;
  movement?: string;
  inclusionReason?: string;
  exclusionReason?: string;
  reason?: string;
  matchedPw?: EvolutionRecord;
  previous?: EvolutionRecord;
  [key: string]: unknown;
}

export interface EvolutionAudit {
  rawRecords?: number;
  acceptedRecords?: number;
  discardedRecords?: number;
  scopeDiscardedRecords?: number;
  parserInvalidRecords?: number;
  uniqueDocuments?: number;
  validRevisionRecords?: number;
  documentRevisionRecords?: number;
  technicalDuplicates?: number;
  technicalVariantsSameDocumentRevision?: number;
  emittedTechnicalRecords?: number;
  emittedDocumentRevisionRecords?: number;
  emittedUniqueDocuments?: number;
  notEmittedDocumentRevisionRecords?: number;
  emissionBreakdown?: Record<string, number>;
  discardReasons?: Record<string, number>;
  comparisonGranularity?: string;
  registrationRule?: string;
  emissionRule?: string;
  registrationDateField?: string;
  emissionDateField?: string;
  snapshotDateField?: string;
  [key: string]: unknown;
}

export interface EvolutionSnapshot {
  id: string;
  sourceSnapshotId?: string;
  system: EvolutionSystem;
  importedAt: string;
  fileName?: string;
  importedBy?: string;
  calculationVersion?: string;
  analysisVersion?: string;
  contentFingerprint?: string;
  audit?: EvolutionAudit;
  records: EvolutionRecord[];
  rejected?: EvolutionRecord[];
  duplicates?: EvolutionRecord[];
  [key: string]: unknown;
}

export interface EvolutionSourceSnapshotMeta {
  id: string;
  system?: EvolutionSystem;
  importedAt?: string;
  recordedAt?: string;
  fileName?: string;
  audit?: EvolutionAudit;
  [key: string]: unknown;
}

export interface EvolutionDocumentRevisionDelta {
  added: EvolutionRecord[];
  removed: EvolutionRecord[];
  newDocuments: EvolutionRecord[];
  newRevisions: EvolutionRecord[];
  previousCount: number;
  currentCount: number;
  previousUniqueDocuments: number;
  currentUniqueDocuments: number;
  net: number;
}

export interface EvolutionDelta {
  added: EvolutionRecord[];
  removed: EvolutionRecord[];
  metadataChanged: Array<{ before: EvolutionRecord; after: EvolutionRecord }>;
  remained: number;
  net: number;
  previousCount: number;
  currentCount: number;
  analysisVersion?: string;
  documentRevision?: EvolutionDocumentRevisionDelta;
}

export interface EvolutionComparison {
  analysisVersion?: string;
  sigem: EvolutionDelta | null;
  pw: EvolutionDelta | null;
  relation: {
    newInBoth: EvolutionRecord[];
    newSigemNotNewPw: EvolutionRecord[];
    newPwWithoutSigemMovement: EvolutionRecord[];
    newSigemAlreadyInPw: EvolutionRecord[];
    newSigemMissingPw: EvolutionRecord[];
  };
  current: {
    both: EvolutionRecord[];
    onlySigem: EvolutionRecord[];
    onlyPw: EvolutionRecord[];
    bothEmitted: EvolutionRecord[];
    bothNotEmitted: EvolutionRecord[];
    pwOnlyEmitted: EvolutionRecord[];
    pwOnlyNotEmitted: EvolutionRecord[];
  };
  pwEmissions: EvolutionRecord[];
}

export interface EvolutionTimelineDay {
  date: string;
  sigemAdded: number;
  sigemRemoved: number;
  pwAdded: number;
  pwRemoved: number;
  pwEmitted: number;
  events: number;
}

export interface EvolutionLdUniverse {
  qualityAvailable: boolean;
  qualityDocumentCount: number;
  available?: boolean;
  fingerprint?: string;
  [key: string]: unknown;
}

export interface EvolutionSelections {
  sigemPrev: string;
  sigemCurrent: string;
  pwPrev: string;
  pwCurrent: string;
}

export interface EvolutionMetrics {
  evolutionSnapshotBuildMs: number;
  evolutionHistoryReadMs: number;
  evolutionComparisonMs: number;
  evolutionTimelineMs: number;
  evolutionPeriodChangeMs: number;
  evolutionFilterMs: number;
  evolutionSearchMs: number;
  evolutionPageChangeMs: number;
  evolutionDetailMs: number;
  evolutionExportMs: number;
  evolutionCacheHitCount: number;
  evolutionCacheMissCount: number;
}

export interface EvolutionUiState {
  active: boolean;
  ready: boolean;
  busy: boolean;
  sigem: EvolutionSnapshot[];
  pw: EvolutionSnapshot[];
  unavailable: { sigem: number; pw: number };
  ldUniverse: EvolutionLdUniverse | null;
  ldSignature: string;
  period: { start: string; end: string };
  selections: EvolutionSelections;
  comparison: EvolutionComparison | null;
  timeline: EvolutionTimelineDay[];
  listMode: EvolutionListMode;
  filters: EvolutionFilters;
  rawFilters: Pick<EvolutionFilters, "query" | "tag" | "eap">;
  page: number;
  filteredRows: EvolutionRecord[];
  detailRow: EvolutionRecord | null;
  exporting: boolean;
  exportMessage: string;
  exportMessageKind: EvolutionExportMessageKind;
  error: string;
  metrics: EvolutionMetrics;
}

export interface EvolutionUiSnapshot extends EvolutionUiState {
  revision: number;
}

export interface EvolutionPageData {
  rows: EvolutionRecord[];
  visible: EvolutionRecord[];
  pages: number;
  start: number;
}

export const EVOLUTION_PAGE_SIZE = 100;
export const EVOLUTION_SEARCH_DEBOUNCE_MS = 180;
export const EVOLUTION_EVENT_DEBOUNCE_MS = 700;

export const EMPTY_EVOLUTION_FILTERS = (): EvolutionFilters => ({
  query: "",
  documentClass: "",
  documentType: "",
  revision: "",
  status: "",
  discipline: "",
  tag: "",
  eap: "",
  source: "",
});

export const EVOLUTION_LIST_LABELS: Readonly<Record<EvolutionListMode, readonly [string, string]>> = Object.freeze({
  "sigem-new": ["Cadastrados no SIGEM", "Ocorrências técnicas novas entre os dois snapshots SIGEM; a auditoria mostra também documento + revisão."],
  "pw-new": ["Encontrados no ProjectWise", "Ocorrências técnicas novas entre os dois snapshots PW; presença no PW significa cadastro, não emissão."],
  "pw-emitted": ["Novas emissões no ProjectWise", "Novas entradas com evidência de emissão ou registros que passaram de não emitido para emitido."],
  both: ["Chegaram nas duas bases", "Novas ocorrências equivalentes no SIGEM e no PW no período selecionado."],
  "missing-pw": ["Novos SIGEM ainda não identificados no PW", "Novas ocorrências SIGEM sem correspondência na base PW atual."],
  "removed-sigem": ["Não encontrados nesta base SIGEM", "Ocorrências presentes na base anterior e ausentes na atual; não significam exclusão definitiva."],
  "removed-pw": ["Não encontrados nesta base PW", "Ocorrências presentes na base anterior e ausentes na atual; não significam exclusão definitiva."],
  "pw-current": ["Cadastrados no PW atual", "Todos os registros válidos da base PW atual; documento + revisão é exibido em paralelo à ocorrência técnica."],
  "pw-current-emitted": ["Emitidos no PW atual", "Registros PW atuais com evidência de emissão reconhecida pela regra vigente."],
  "pw-current-not-emitted": ["Não emitidos no PW atual", "Registros PW atuais sem evidência de emissão reconhecida."],
  "only-sigem": ["Somente SIGEM", "Documento + revisão presente no SIGEM atual e ausente no PW atual."],
  "only-pw": ["Somente PW", "Documento + revisão presente no PW atual e ausente no SIGEM atual."],
  "current-both": ["SIGEM + PW", "Documento + revisão presente nas duas bases atuais."],
  "excluded-sigem": ["Excluídos da análise SIGEM", "Linhas SIGEM rejeitadas pela regra de escopo/validação, com motivo preservado."],
  "excluded-pw": ["Excluídos da análise PW", "Linhas PW rejeitadas pela regra de escopo/validação, com motivo preservado."],
});

export const EVOLUTION_TAB_MODES: readonly EvolutionListMode[] = Object.freeze([
  "sigem-new",
  "pw-new",
  "pw-emitted",
  "both",
  "missing-pw",
  "removed-sigem",
  "removed-pw",
]);
