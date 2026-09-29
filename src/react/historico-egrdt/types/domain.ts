export interface EgrdtHistoryFile {
  document?: string;
  originalName?: string;
  finalName?: string;
  title?: string;
  format?: string;
  documentType?: string;
  purpose?: string;
  revision?: string;
  grdtRevision?: string;
  revisionSuggested?: string;
  revisionManual?: boolean;
  sigemStatus?: string;
  allocation?: string;
  ldPrazo?: string;
  sheet?: string;
  discipline?: string;
}

export interface EgrdtHistoryRecord {
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
  batchMode?: "discipline" | "limit-only" | string;
  batchLimit?: number;
  reissueSources?: string[];
  allocations: string[];
  files: EgrdtHistoryFile[];
  documentCount: number;
  fileCount: number;
  createdByName?: string;
  createdByEmail?: string;
}

export interface EgrdtHistoryFilters {
  query: string;
  year: string;
  outputType: string;
  sort: "recent" | "oldest" | "number-desc" | "number-asc";
  startDate: string;
  endDate: string;
  documentFamily: string;
}

export interface EgrdtHistoryFilterOptions {
  years: string[];
  outputTypes: string[];
}

export interface EgrdtHistorySummary {
  egrdts: number;
  documents: number;
  allocations: number;
}

export interface ParsedEgrdtNumber {
  sequence: number;
  year: number;
  baseName: string;
}

export interface RevisionRelation {
  generated: string;
}

export interface HistoryPerformanceSnapshot {
  lastRenderMs: number;
  renderedRecords: number;
  totalFiltered: number;
  totalRecords: number;
}

export interface UpdateNumberResult {
  updated: boolean;
  error?: string;
  previous?: string;
  record?: EgrdtHistoryRecord;
  records?: EgrdtHistoryRecord[];
}

export interface DeleteOneResult {
  deleted: boolean;
  error?: string;
  records: EgrdtHistoryRecord[];
}
