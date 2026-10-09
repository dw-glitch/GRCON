export interface NormativeValidation {
  normativeValidationVersion: string;
  generatedAt?: string;
  rulesChecked?: string[];
  normsApplied?: { norm: string; revision: string; part?: string }[];
  warnings?: { message: string; ruleId: string; norm: string; revision: string; section: string }[];
  blocks?: { message: string; ruleId: string; norm: string; revision: string; section: string }[];
  information?: { message: string; ruleId: string; norm: string; revision: string; section: string }[];
}

export interface EgrdtHistoryFile {
  fileProvenance?: {
    source: "cofre" | "local";
    fileName: string;
    revision: string;
    format: string;
    sizeBytes: number;
    vaultFileId?: string;
    catalogSequence?: number;
    fileVersion?: number;
    sha256?: string;
    createdAt?: string;
    verifiedAt?: string;
    lastModified?: number;
  } | null;
  sharedAllocationContext?: { centralFileName: string; references: { allocation: string; allocationStatus: string; workflow: string; sourceRow: number }[]; warnings: string[] } | null;
  historyClassification?: { label: string; emissionKind: string; previousGrdt: string; previousRevision: string; previousGeneratedAt: string; occurrenceCount: number; repostCount: number; warnings: string[] } | null;

  normativeValidation?: NormativeValidation | null;
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
  normativeValidation?: NormativeValidation | null;
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
  teamsConfirmation?: string;
  teamsResponsible?: string;
  teamsDate?: string;
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
