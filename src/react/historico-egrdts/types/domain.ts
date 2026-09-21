export interface HistoryFile {
  document?: string;
  originalName?: string;
  finalName?: string;
  revision?: string;
  sigemStatus?: string;
  allocation?: string;
  allocationStatus?: string;
  allocationStage?: string;
  fiscalComment?: string;
  ldPrazo?: string;
  ldVersion?: string;
  databook?: string;
  sheet?: string;
  discipline?: string;
  revisionManual?: boolean;
  revisionSuggested?: string;
  [key: string]: unknown;
}

export interface HistoryRecord {
  id: string;
  clientRecordId?: string;
  cloudId?: string;
  workspaceId?: string;
  reservationIds?: string[];
  egrdtNumber: string;
  numberHistory?: string[];
  generatedAt: string;
  outputType: string;
  ldName?: string;
  sourceName?: string;
  allocations: string[];
  documentCount: number;
  fileCount: number;
  createdByName?: string;
  createdByEmail?: string;
  syncState?: string;
  localUpdatedAt?: string;
  files: HistoryFile[];
  [key: string]: unknown;
}

export interface PostingRecord {
  id: string;
  historyId?: string;
  egrdtNumber?: string;
  status: string;
  persistence?: Promise<unknown>;
  [key: string]: unknown;
}

export interface ParsedEgrdtNumber {
  sequence: number;
  year: number;
  baseName: string;
}

export type HistorySortMode = "recent" | "oldest" | "number-desc" | "number-asc";

export interface HistoryFilters {
  query: string;
  year: string;
  outputType: string;
  postingStatus: string;
  sort: HistorySortMode;
  startDate: string;
  endDate: string;
  documentFamily: string;
}

export interface HistorySummary {
  egrdts: number;
  documents: number;
  allocations: number;
  awaiting: number;
  posted: number;
  attention: number;
}

export interface HistoryPerformanceSnapshot {
  lastRenderMs: number;
  postingReadsLastRender: number;
  renderedRecords: number;
  totalFiltered: number;
  postingCount: number;
  totalRecords: number;
}

export interface PostingIndexes {
  byHistoryId: Map<string, PostingRecord>;
  byId: Map<string, PostingRecord>;
  byEgrdt: Map<string, PostingRecord>;
}

export interface PostingBadgeView {
  status: string;
  label: string;
  tone: string;
}

export interface WorkflowStep {
  key?: string;
  label: string;
  complete?: boolean;
  current?: boolean;
  tone?: string;
}

export interface RevisionRelation {
  generated: string;
  posted: string;
  other: string;
}

export interface UpdateNumberResult {
  updated: boolean;
  error?: string;
  previous?: string;
  record?: HistoryRecord;
  records?: HistoryRecord[];
}

export interface DeleteRecordResult {
  deleted: boolean;
  records: HistoryRecord[];
  error?: string;
}

export interface HistoryUiSnapshot {
  selectedId: string;
  filtered: HistoryRecord[];
  performance: HistoryPerformanceSnapshot;
}
