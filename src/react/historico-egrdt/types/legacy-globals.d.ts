import type {
  EgrdtHistoryFile,
  EgrdtHistoryRecord,
  PostingRecord,
  RevisionRelation,
} from "./domain";

interface GrconHistoryReportApi {
  periodLabel(records: EgrdtHistoryRecord[], startDate: string, endDate: string): string;
  revisionRelation(record: EgrdtHistoryRecord, file: EgrdtHistoryFile, postings: PostingRecord[]): Omit<RevisionRelation, "generated">;
  buildWorkbook(records: EgrdtHistoryRecord[], options: Record<string, unknown>): Promise<ArrayBuffer>;
  downloadName(records: EgrdtHistoryRecord[], options: Record<string, unknown>): string;
}

interface GrconTeamsNotificationApi {
  open?(record: EgrdtHistoryRecord): void;
  buttonHtml?(record: EgrdtHistoryRecord, options?: { primary?: boolean; withStatus?: boolean }): string;
}

declare global {
  interface Window {
    GrconHistoryReport?: GrconHistoryReportApi;
    GrconEgrdtSequence?: { syncFromNumber?(number: string): void };
    GrconEgrdtEmailReplyUi?: { open?(records: EgrdtHistoryRecord[]): void };
    GrconEgrdtTeamsNotification?: GrconTeamsNotificationApi;
    GrconConfig?: { APP_VERSION?: string };
    GrconHistoricoEgrdtReact?: { mounted: boolean };
  }
}

export {};
