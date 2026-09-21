import type {
  DeleteOneResult,
  EgrdtHistoryFile,
  EgrdtHistoryRecord,
  ParsedEgrdtNumber,
  PostingRecord,
  RevisionRelation,
  UpdateNumberResult,
  WorkflowStep,
} from "./domain";

interface HistorySummary {
  egrdts: number;
  documents: number;
  files: number;
  allocations: number;
  lastGeneratedAt: string;
}

interface GrconHistoryApi {
  STORAGE_KEY: string;
  text(value: unknown): string;
  norm(value: unknown): string;
  read(): EgrdtHistoryRecord[];
  filter(records: EgrdtHistoryRecord[], query: string): EgrdtHistoryRecord[];
  filterByDate(records: EgrdtHistoryRecord[], startDate: string, endDate: string): EgrdtHistoryRecord[];
  filterByDocumentFamily?(records: EgrdtHistoryRecord[], family: string): EgrdtHistoryRecord[];
  summary(records: EgrdtHistoryRecord[]): HistorySummary;
  normalizeEgrdtNumber(value: string, fallbackYear?: number): ParsedEgrdtNumber | null;
  generatedRevision(file: EgrdtHistoryFile): string;
  updateNumber(recordId: string, value: string): UpdateNumberResult;
  deleteOne(recordId: string): DeleteOneResult;
  clear(): boolean;
}

interface PostingAudit {
  ready: boolean;
}

interface GrconSigemPostingApi {
  STATUSES: Record<string, string>;
  read(): PostingRecord[];
  statusLabel(status: string): string;
  audit(record: PostingRecord, records: PostingRecord[]): PostingAudit;
  registerGenerated(records: EgrdtHistoryRecord[], options: { appVersion: string }): { persistence?: Promise<unknown> } | undefined;
}

interface GrconHistoryReportApi {
  periodLabel(records: EgrdtHistoryRecord[], startDate: string, endDate: string): string;
  revisionRelation(record: EgrdtHistoryRecord, file: EgrdtHistoryFile, postings: PostingRecord[]): Omit<RevisionRelation, "generated">;
  buildWorkbook(records: EgrdtHistoryRecord[], options: Record<string, unknown>): Promise<ArrayBuffer>;
  downloadName(records: EgrdtHistoryRecord[], options: Record<string, unknown>): string;
}

interface GrconMacro5FlowApi {
  postingTone?(status: string): string;
  workflowSteps?(status: string, auditReady: boolean): WorkflowStep[];
}

interface GrconModuleLoaderApi {
  ensure?(group: string): Promise<void>;
  ensureModule?(view: string): Promise<void>;
}

interface GrconSigemUiApi {
  render?(): void;
  select?(id: string): void;
}

interface GrconAnalysisHistoryUiApi {
  render?(): void;
}

interface GrconCloudApi {
  state?: { membership?: { workspace_id?: string } };
  canManageHistory?(): boolean;
  deleteHistoryRecord?(record: EgrdtHistoryRecord): Promise<unknown>;
  clearHistory?(): Promise<boolean>;
}

interface GrconTeamsNotificationApi {
  open?(record: EgrdtHistoryRecord): void;
  buttonHtml?(record: EgrdtHistoryRecord, options?: { primary?: boolean; withStatus?: boolean }): string;
}

declare global {
  interface Window {
    GrconHistory?: GrconHistoryApi;
    GrconSigemPosting?: GrconSigemPostingApi;
    GrconHistoryReport?: GrconHistoryReportApi;
    GrconMacro5Flow?: GrconMacro5FlowApi;
    GRCONModuleLoader?: GrconModuleLoaderApi;
    GrconSigemUi?: GrconSigemUiApi;
    GrconAnalysisHistoryUi?: GrconAnalysisHistoryUiApi;
    GrconCloud?: GrconCloudApi;
    GrconEgrdtSequence?: { syncFromNumber?(number: string): void };
    GrconEgrdtEmailReplyUi?: { open?(records: EgrdtHistoryRecord[]): void };
    GrconEgrdtTeamsNotification?: GrconTeamsNotificationApi;
    GrconNotify?: (message: string, kind?: string) => void;
    GrconConfig?: { APP_VERSION?: string };
    GRCONBrandAssets?: unknown;
    GrconHistoryUi?: {
      state?: Record<string, unknown>;
      render?: () => void;
      activate?: (view: string) => void;
      select?: (id: string) => void;
      performanceSnapshot?: () => Record<string, unknown>;
    };
    GrconHistoricoEgrdtReact?: { mounted: boolean };
  }
}

export {};
