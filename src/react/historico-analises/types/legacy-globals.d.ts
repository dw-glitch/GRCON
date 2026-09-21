import type {
  AnalysisDocument,
  AnalysisHistoryFilters,
  AnalysisQueryResult,
  AnalysisSession,
  DetailContext,
  EgrdtHistoryRecord,
  EgrdtHistoryFile,
  PostingRecord,
  RestoreResult,
  SavedAnalysisFilter,
  SaveFilterResult,
  StorageEstimate,
} from "./domain";

interface GrconAnalysisHistoryApi {
  norm(value: unknown): string;
  statusKey(value: unknown): string;
  listSessions(): Promise<AnalysisSession[]>;
  queryDocuments(filters: AnalysisHistoryFilters, options: { offset: number; limit: number }): Promise<AnalysisQueryResult>;
  allDocuments(filters: Partial<AnalysisHistoryFilters> & { all?: boolean }): Promise<AnalysisDocument[]>;
  deleteSession(id: string): Promise<boolean>;
  clearAll(): Promise<boolean>;
  exportBackup(): Promise<Record<string, unknown>>;
  importBackup(payload: unknown, options: { replace: true }): Promise<RestoreResult>;
  storageEstimate(): Promise<StorageEstimate | null>;
}

interface GrconAnalysisHistoryReportApi {
  buildWorkbook(documents: AnalysisDocument[], sessions: AnalysisSession[], options: Record<string, unknown>): Promise<ArrayBuffer>;
  downloadName(documents: AnalysisDocument[], options: Record<string, unknown>): string;
}

interface GrconMacro5FlowApi {
  readSavedAnalysisFilters(): SavedAnalysisFilter[];
  normalizeAnalysisFilter(value: unknown): Partial<AnalysisHistoryFilters>;
  saveAnalysisFilter(name: string, value: AnalysisHistoryFilters): SaveFilterResult;
  deleteAnalysisFilter(id: string): void;
  postingTone?(status: string): string;
  workflowSteps?(status: string, auditReady: boolean): Array<{ key?: string; label: string; complete?: boolean; current?: boolean; tone?: string }>;
  analysisTimeline?(items: AnalysisDocument[]): AnalysisDocument[];
  relatedEgrdt?(item: AnalysisDocument, history: EgrdtHistoryRecord[]): EgrdtHistoryRecord | null;
}

interface GrconHistoryApi {
  STORAGE_KEY: string;
  read(): EgrdtHistoryRecord[];
  filter(records: EgrdtHistoryRecord[], query: string): EgrdtHistoryRecord[];
  filterByDate(records: EgrdtHistoryRecord[], startDate: string, endDate: string): EgrdtHistoryRecord[];
  filterByDocumentFamily?(records: EgrdtHistoryRecord[], family: string): EgrdtHistoryRecord[];
  summary(records: EgrdtHistoryRecord[]): { egrdts: number; documents: number; files: number; allocations: number; lastGeneratedAt: string };
  normalizeEgrdtNumber(value: string, fallbackYear?: number): { sequence: number; year: number; baseName: string } | null;
  generatedRevision(file: EgrdtHistoryFile): string;
  updateNumber(recordId: string, value: string): { updated: boolean; error?: string; previous?: string; record?: EgrdtHistoryRecord; records?: EgrdtHistoryRecord[] };
  deleteOne(recordId: string): { deleted: boolean; error?: string; records: EgrdtHistoryRecord[] };
  clear(): boolean;
}

interface GrconHistoryUiApi {
  state?: Record<string, unknown>;
  render?(): void;
  activate?(view: string): void;
  select?(id: string): void;
  performanceSnapshot?(): object;
}

interface GrconSigemPostingApi {
  STATUSES: Record<string, string>;
  registerGenerated(records: EgrdtHistoryRecord[], options: { appVersion: string }): { persistence?: Promise<unknown> } | void;
  read(): PostingRecord[];
  statusLabel(status: string): string;
  audit(record: PostingRecord, records: PostingRecord[]): { ready: boolean };
}

interface GrconSigemUiApi {
  render?(): void;
  select?(id: string): void;
}

interface GrconEnhancementsApi {
  confirmAction?(message: string, detail?: string): Promise<boolean>;
}

interface GrconAuditLogApi {
  log?(action: string, detail?: string): Promise<void> | void;
}

declare global {
  interface Window {
    GrconAnalysisHistory?: GrconAnalysisHistoryApi;
    GrconAnalysisHistoryReport?: GrconAnalysisHistoryReportApi;
    GrconMacro5Flow?: GrconMacro5FlowApi;
    GrconHistory?: GrconHistoryApi;
    GrconHistoryUi?: GrconHistoryUiApi;
    GrconSigemPosting?: GrconSigemPostingApi;
    GrconSigemUi?: GrconSigemUiApi;
    GrconEnhancements?: GrconEnhancementsApi;
    GrconAuditLog?: GrconAuditLogApi;
    GrconAnalysisHistoryUi?: {
      state?: Record<string, unknown>;
      render?: () => void;
      openDetail?: (item: AnalysisDocument) => void;
    };
    GrconHistoricoAnalisesReact?: { mounted: boolean };
  }
}

export {};
