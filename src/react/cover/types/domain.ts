export interface LdDocumentRecord {
  id: string; document: string; title: string; revision: string; source: string; sheet: string; row: number;
  discipline: string; documentType: string; tag: string; eap: string; family: string; category: string;
  categoryCode: string; taxonomy: string; internalDocumentCode: string; raw?: unknown;
}
export interface LdEntry { id: string; file: File; name: string; records: LdDocumentRecord[]; error: string; }
export interface CoverDocumentData {
  documentCategory: string; documentNumber: string; title: string; internalDocumentCode: string; taxonomy: string;
  revision: string; revisionDescription: string; revisionDate: string; executor: string; checker: string; approver: string;
  client: string; program: string; area: string; managementUnit: string; classification: string; companyName: string;
  technicalResponsible: string; contractNumber: string; professionalRegistration: string;
  eap: string; discipline: string; tag: string; family: string; source: string; sheet: string; row: number;
}
export interface CoverValidationResult { errors: string[]; warnings: string[]; info: string[]; valid: boolean; }
export type SourceFormat = "pdf" | "docx" | "unsupported" | "";
export interface SourceInfo { file: File; format: SourceFormat; pages: number | null; pageCountReliable: boolean; warning?: string; }
export interface WorkerProgress { stage: string; }
export interface CoverGeneratedResult { blob: Blob; fileName: string; pageCount?: number; }
export interface CoverDebugState {
  lds: number; records: number; selectedId: string; sourceName: string; sourceFormat: SourceFormat;
  sourcePages: number | null; valid: boolean; previewReady: boolean; busy: boolean;
}
declare global {
  interface Window {
    GrconCoverCore?: {
      prepareLdRecord(record: Record<string, unknown>, triagem: unknown): LdDocumentRecord;
      searchByTitle(records: LdDocumentRecord[], query: string, limit?: number): Array<{ record: LdDocumentRecord; score: number }>;
      coverDataFromRecord(record: LdDocumentRecord, overrides?: Partial<CoverDocumentData>): CoverDocumentData;
      validateCoverData(data: CoverDocumentData, options?: Record<string, unknown>): CoverValidationResult;
      outputFileName(data: CoverDocumentData, extension: string): string;
    };
    TriagemCore?: { parseWorkbook(workbook: unknown, fileName: string, lastModified: number): { records: Record<string, unknown>[] } };
    XLSX?: { read(buffer: ArrayBuffer, options: Record<string, unknown>): unknown };
    GRCONModuleLoader?: { ensure(name: string): Promise<void> };
    GrconFileAccess?: { read(file: File, options: { context: string; retries: number }): Promise<ArrayBuffer> };
    GrconNotify?: (message: string, kind?: string) => void;
    GrconCoverUi?: { activate(): void; deactivate(): void; _debug?: { readonly state: CoverDebugState | null } };
    GrconCoverReact?: { mounted: boolean };
  }
}
export {};