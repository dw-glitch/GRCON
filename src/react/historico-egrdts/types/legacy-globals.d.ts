import type {
  DeleteRecordResult,
  HistoryFile,
  HistoryPerformanceSnapshot,
  HistoryRecord,
  HistoryUiSnapshot,
  ParsedEgrdtNumber,
  PostingRecord,
  RevisionRelation,
  UpdateNumberResult,
  WorkflowStep,
} from "./domain";

export interface HistoryCoreApi {
  STORAGE_KEY: string;
  text(value: unknown): string;
  read(): HistoryRecord[];
  filter(records: HistoryRecord[], query: string): HistoryRecord[];
  filterByDate(records: HistoryRecord[], startDate: string, endDate: string): HistoryRecord[];
  filterByDocumentFamily(records: HistoryRecord[], family: string): HistoryRecord[];
  summary(records: HistoryRecord[]): { egrdts: number; documents: number; allocations: number };
  normalizeEgrdtNumber(value: unknown, year?: number): ParsedEgrdtNumber | null;
  generatedRevision(file: HistoryFile): string;
  updateNumber(id: string, value: string): UpdateNumberResult;
  deleteOne(id: string): DeleteRecordResult;
  clear(): boolean;
}

export interface HistoryReportApi {
  periodLabel(records: HistoryRecord[], startDate: string, endDate: string): string;
  revisionRelation(record: HistoryRecord, file: HistoryFile, postings: PostingRecord[]): Omit<RevisionRelation, "generated">;
  buildWorkbook(records: HistoryRecord[], options: Record<string, unknown>): Promise<ArrayBuffer>;
  downloadName(records: HistoryRecord[], options: Record<string, unknown>): string;
}

export interface SigemPostingApi {
  STATUSES: Record<string, string>;
  read(): PostingRecord[];
  statusLabel(status: string): string;
  audit(record: PostingRecord, records: PostingRecord[]): { ready: boolean };
  registerGenerated(records: HistoryRecord[], options: { appVersion: string }): {
    saved?: boolean;
    created?: PostingRecord[];
    persistence?: Promise<unknown>;
    records?: PostingRecord[];
    error?: string;
  };
}

export interface Macro5FlowApi {
  postingTone(status: string): string;
  workflowSteps(status: string, auditReady: boolean): WorkflowStep[];
}

export interface CloudApi {
  state?: {
    membership?: { workspace_id?: string } | null;
    online?: boolean;
    syncing?: boolean;
    clearingHistory?: boolean;
  };
  canManageHistory?(): boolean;
  deleteHistoryRecord?(record: HistoryRecord): Promise<unknown>;
  clearHistory?(): Promise<boolean>;
}

export interface TeamsNotificationApi {
  open(record: HistoryRecord): void;
  status(record: HistoryRecord): { sentAt?: string } | null;
  statusLabel(record: HistoryRecord): string;
}

export interface EmailReplyUiApi {
  open(records: HistoryRecord[]): boolean;
}

export interface SigemUiApi {
  select?(id: string): void;
  render?(): void;
}

export interface ModuleLoaderApi {
  ensure?(name: string): Promise<void>;
  ensureModule?(name: string): Promise<void>;
}

export interface HistoricoEgrdtsUiApi {
  readonly state: {
    readonly selectedId: string;
    readonly filtered: HistoryRecord[];
  };
  render(): void;
  activate(view?: string): void;
  select(id: string): void;
  performanceSnapshot(): HistoryPerformanceSnapshot;
}

export interface HistoricoEgrdtsLegacyWindow extends Window {
  GrconHistory?: HistoryCoreApi;
  GrconHistoryReport?: HistoryReportApi;
  GrconSigemPosting?: SigemPostingApi;
  GrconMacro5Flow?: Macro5FlowApi;
  GrconCloud?: CloudApi;
  GrconEgrdtSequence?: { syncFromNumber?(value: string): boolean };
  GrconEgrdtTeamsNotification?: TeamsNotificationApi;
  GrconEgrdtEmailReplyUi?: EmailReplyUiApi;
  GrconSigemUi?: SigemUiApi;
  GRCONModuleLoader?: ModuleLoaderApi;
  GRCONBrandAssets?: unknown;
  GrconConfig?: { APP_VERSION?: string };
  GrconNotify?: (message: string, kind?: string) => void;
  GrconAnalysisHistoryUi?: { render?(): void };
  GrconHistoryUi?: HistoricoEgrdtsUiApi;
  GrconHistoricoEgrdtsReact?: { mounted: boolean };
  __grconHistoricoEgrdtsSnapshot?: HistoryUiSnapshot;
}
