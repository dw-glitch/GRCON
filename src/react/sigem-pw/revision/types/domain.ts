import type { SigemPwModel, SigemPwRecord } from "../../types/domain";

export type RevisionSituation =
  | "updated"
  | "pw-previous"
  | "pw-not-found"
  | "pw-awaiting-emission"
  | "pw-ahead"
  | "review";

export type RevisionSituationFilter =
  | "attention"
  | "all"
  | "other"
  | RevisionSituation;

export type RevisionDocumentClass = "" | "ET" | "N-1710";
export type RevisionExportMessageKind = "info" | "success" | "error";

export interface RevisionHistoryItem {
  revision: string;
  status: string;
  emitted: boolean | null;
  emissionFlag?: string;
  sourceRow?: number;
}

export interface RevisionRow {
  key: string;
  document: string;
  documentClass: string;
  sigemRevision: string;
  sigemStatus: string;
  sigemCode: string;
  pwCode: string;
  pwRevision: string;
  pwStatus: string;
  lastEmittedPwRevision: string;
  lastEmittedPwStatus: string;
  situation: RevisionSituation;
  reason: string;
  eap: string;
  documentType: string;
  sigemRows: SigemPwRecord[];
  pwRows: SigemPwRecord[];
}

export interface RevisionCounts {
  updated: number;
  previous: number;
  notFound: number;
  awaitingEmission: number;
  pwAhead: number;
  review: number;
  comparable: number;
  nonComparable: number;
}

export interface RevisionMetrics {
  durationMs: number;
  documentsCompared: number;
  sigemRevisionRows: number;
  pwRevisionRows: number;
  maxChunkMs?: number;
  chunkSize?: number;
  algorithm?: string;
}

export interface RevisionAnalysis {
  cancelled?: boolean;
  rows: RevisionRow[];
  counts: RevisionCounts;
  metrics: RevisionMetrics;
}

export interface RevisionFilters {
  situation: RevisionSituationFilter;
  documentClass: RevisionDocumentClass;
  sigemRevision: string;
  pwRevision: string;
  sigemStatus: string;
  pwStatus: string;
  search: string;
  documentList: string;
}

export interface RevisionProgress {
  active: boolean;
  done: number;
  total: number;
  message: string;
}

export interface RevisionUiState {
  active: boolean;
  modelRef: SigemPwModel | null;
  analysis: RevisionAnalysis | null;
  analysisGeneration: number;
  filters: RevisionFilters;
  page: number;
  expandedKey: string;
  searchTimer: number | null;
  exporting: boolean;
  exportMessage: string;
  exportMessageKind: RevisionExportMessageKind;
  rawSearch: string;
  rawDocumentList: string;
  progress: RevisionProgress;
}

export interface RevisionUiSnapshot extends RevisionUiState {
  revision: number;
}

export interface RevisionOptionSets {
  classes: RevisionDocumentClass[];
  sigemRevisions: string[];
  pwRevisions: string[];
  sigemStatuses: string[];
  pwStatuses: string[];
}

export interface RevisionPageData {
  rows: RevisionRow[];
  visible: RevisionRow[];
  pages: number;
  start: number;
}

export const REVISION_PAGE_SIZE = 100;
export const REVISION_SEARCH_DEBOUNCE_MS = 180;

export const REVISION_FILTER_LABELS: ReadonlyArray<{ value: RevisionSituationFilter; label: string }> = Object.freeze([
  { value: "attention", label: "Precisam de atenção" },
  { value: "all", label: "Todos" },
  { value: "pw-not-found", label: "Não localizado no PW" },
  { value: "pw-previous", label: "PW em revisão anterior" },
  { value: "pw-awaiting-emission", label: "Aguardando emissão" },
  { value: "updated", label: "Atualizado" },
  { value: "other", label: "Outras divergências" },
  { value: "pw-ahead", label: "PW em revisão posterior" },
  { value: "review", label: "Requer análise" },
]);

export const EMPTY_REVISION_FILTERS = (): RevisionFilters => ({
  situation: "attention",
  documentClass: "",
  sigemRevision: "",
  pwRevision: "",
  sigemStatus: "",
  pwStatus: "",
  search: "",
  documentList: "",
});
