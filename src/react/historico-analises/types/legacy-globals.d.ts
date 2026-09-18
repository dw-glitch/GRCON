import type {
  AnalysisDocument,
  AnalysisHistoryFilters,
  AnalysisQueryResult,
  AnalysisSession,
  DetailContext,
  EgrdtHistoryRecord,
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
  analysisTimeline?(items: AnalysisDocument[]): AnalysisDocument[];
  relatedEgrdt?(item: AnalysisDocument, history: EgrdtHistoryRecord[]): EgrdtHistoryRecord | null;
}

interface GrconHistoryApi {
  read(): EgrdtHistoryRecord[];
}

interface GrconHistoryUiApi {
  select?(id: string): void;
}

interface GrconSigemPostingApi {
  registerGenerated(records: EgrdtHistoryRecord[], options: { appVersion: string }): void;
  read(): PostingRecord[];
}

interface GrconSigemUiApi {
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
