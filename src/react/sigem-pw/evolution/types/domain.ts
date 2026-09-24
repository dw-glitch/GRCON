export type EvolutionSystem = "sigem" | "pw";
export type EvolutionListMode =
  | "sigem-new"
  | "pw-new"
  | "pw-emitted"
  | "both"
  | "missing-pw"
  | "removed-sigem"
  | "removed-pw";
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
  title?: string;
  documentType?: string;
  discipline?: string;
  tag?: string;
  eap?: string;
  status?: string;
  date?: string;
  lastEmission?: string;
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
  matchedPw?: EvolutionRecord;
  previous?: EvolutionRecord;
  [key: string]: unknown;
}

export interface EvolutionAudit {
  acceptedRecords?: number;
  uniqueDocuments?: number;
  validRevisionRecords?: number;
  technicalDuplicates?: number;
  [key: string]: unknown;
}

export interface EvolutionSnapshot {
  id: string;
  sourceSnapshotId?: string;
  system: EvolutionSystem;
  importedAt: string;
  fileName?: string;
  audit?: EvolutionAudit;
  records: EvolutionRecord[];
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

export interface EvolutionDelta {
  added: EvolutionRecord[];
  removed: EvolutionRecord[];
  metadataChanged: Array<{ before: EvolutionRecord; after: EvolutionRecord }>;
  remained: number;
  net: number;
  previousCount: number;
  currentCount: number;
}

export interface EvolutionComparison {
  sigem: EvolutionDelta | null;
  pw: EvolutionDelta | null;
  relation: {
    newInBoth: EvolutionRecord[];
    newSigemNotNewPw: EvolutionRecord[];
    newPwWithoutSigemMovement: EvolutionRecord[];
    newSigemAlreadyInPw: EvolutionRecord[];
    newSigemMissingPw: EvolutionRecord[];
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
  evolutionPeriodChangeMs: number;
  evolutionFilterMs: number;
  evolutionSearchMs: number;
  evolutionPageChangeMs: number;
  evolutionDetailMs: number;
  evolutionExportMs: number;
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
  "sigem-new": ["Cadastrados no SIGEM", "Registros que não existiam na base SIGEM anterior."],
  "pw-new": ["Encontrados no ProjectWise", "Registros que não existiam na base PW anterior."],
  "pw-emitted": ["Emitidos no ProjectWise", "Novas entradas já emitidas e registros cuja emissão foi confirmada entre as duas bases."],
  both: ["Chegaram nas duas bases", "Novas ocorrências equivalentes no SIGEM e no PW no período selecionado."],
  "missing-pw": ["Novos SIGEM ainda não identificados no PW", "Novas ocorrências SIGEM sem correspondência na base PW atual."],
  "removed-sigem": ["Não encontrados nesta base SIGEM", "Ocorrências presentes na base anterior e ausentes na atual; não significam exclusão definitiva."],
  "removed-pw": ["Não encontrados nesta base PW", "Ocorrências presentes na base anterior e ausentes na atual; não significam exclusão definitiva."],
});
