export interface AnalysisHistoryFilters {
  query: string;
  status: string;
  startDate: string;
  endDate: string;
  sessionId: string;
}

export interface AnalysisCounts {
  READY?: number;
  BLOCKED?: number;
  DISCARD?: number;
  REVIEW?: number;
  UNKNOWN?: number;
  [key: string]: number | undefined;
}

export interface AnalysisSession {
  id: string;
  analyzedAt: string;
  dateKey: string;
  completed?: boolean;
  appVersion?: string;
  engineVersion?: string;
  ldName?: string;
  sourceName?: string;
  inputType?: string;
  relationLabel?: string;
  recentDays?: number;
  total: number;
  counts?: Record<string, number>;
  ldRecords?: number;
  sigemRecords?: number;
  savedDocuments?: number;
}

export interface AnalysisDocument {
  id: string;
  sessionId: string;
  analyzedAt: string;
  dateKey?: string;
  statusDelivered?: string;
  statusKey?: string;
  document?: string;
  documentKey?: string;
  title?: string;
  originalFiles?: string;
  finalFiles?: string;
  sheet?: string;
  ldRow?: number;
  ldVersion?: string;
  currentRevision?: string;
  targetRevision?: string;
  targetRevisionStatus?: string;
  reasonCode?: string;
  reason?: string;
  sigemStatus?: string;
  grdt?: string;
  effectiveDate?: string;
  postingStatus?: string;
  allocationStatus?: string;
  allocation?: string;
  allocationStage?: string;
  fiscalComment?: string;
  includedInEgrdt?: string;
  databook?: string;
  inputSource?: string;
  packageWarning?: string;
  virtual?: boolean;
  changes?: string[];
}

export interface AnalysisQueryResult {
  rows: AnalysisDocument[];
  total: number;
  counts: AnalysisCounts;
  sessionIds: string[];
  latest?: string;
  pageSize?: number;
}

export interface AnalysisSummary {
  total: number;
  counts: AnalysisCounts;
  sessions: number;
  latest?: string;
}

export interface StorageEstimate {
  usage: number;
  quota: number;
}

export interface SavedAnalysisFilter {
  id: string;
  name: string;
  filter: Partial<AnalysisHistoryFilters>;
}

export interface SaveFilterResult {
  saved: boolean;
  error?: string;
  item: SavedAnalysisFilter;
}

export interface EgrdtHistoryFile {
  document?: string;
  originalName?: string;
  finalName?: string;
  allocation?: string;
  revision?: string;
  sigemStatus?: string;
}

export interface EgrdtHistoryRecord {
  id: string;
  egrdtNumber?: string;
  numberHistory?: string[];
  outputType?: string;
  ldName?: string;
  sourceName?: string;
  allocations?: string[];
  files?: EgrdtHistoryFile[];
  documentCount?: number;
  generatedAt?: string;
}

export interface PostingRecord {
  id: string;
  historyId?: string;
}

export interface UnifiedSearchResult {
  historyCount: number;
  analysisCount: number;
  historyMatches: EgrdtHistoryRecord[];
  analysisMatches: AnalysisDocument[];
}

export interface DetailContext {
  timeline: AnalysisDocument[];
  related: EgrdtHistoryRecord | null;
  changes: string[];
}

export interface RestoreResult {
  sessions: number;
  documents: number;
}

export interface ExportPayload {
  documents: AnalysisDocument[];
  sessions: AnalysisSession[];
  filters: AnalysisHistoryFilters;
}

export interface DetailState {
  item: AnalysisDocument | null;
  loading: boolean;
  error: string;
  context: DetailContext | null;
}
