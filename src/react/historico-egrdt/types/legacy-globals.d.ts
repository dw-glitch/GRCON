import type { EgrdtHistoryRecord, EgrdtHistoryFile } from "./domain";

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


interface GrconHistoryReportApi {
  periodLabel(records: EgrdtHistoryRecord[], startDate: string, endDate: string): string;
  buildWorkbook(records: EgrdtHistoryRecord[], options: Record<string, unknown>): Promise<ArrayBuffer>;
  downloadName(records: EgrdtHistoryRecord[], options: Record<string, unknown>): string;
}

interface GrconTeamsNotificationApi {
  open?(record: EgrdtHistoryRecord): void;
  status?(record: EgrdtHistoryRecord): { sentAt?: string } | null;
  statusLabel?(record: EgrdtHistoryRecord): string;
  buttonLabel?(record: EgrdtHistoryRecord): string;
  isSending?(record: EgrdtHistoryRecord): boolean;
  buttonHtml?(record: EgrdtHistoryRecord, options?: { primary?: boolean; withStatus?: boolean }): string;
}

declare global {
  interface Window {
    GrconHistory?: GrconHistoryApi;
    GrconHistoryUi?: GrconHistoryUiApi;
    GrconHistoryReport?: GrconHistoryReportApi;
    GrconEgrdtSequence?: { syncFromNumber?(number: string): void };
    GrconEgrdtEmailReplyUi?: { open?(records: EgrdtHistoryRecord[]): void };
    GrconEgrdtTeamsNotification?: GrconTeamsNotificationApi;
    GrconConfig?: { APP_VERSION?: string };
    GrconHistoricoEgrdtReact?: { mounted: boolean };
  }
}

export {};
