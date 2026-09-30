/**
 * GRCON — Tipos ambientes para os módulos legados acessados pelo adaptador.
 *
 * Estes globais são anexados em `window` por scripts clássicos carregados
 * antes da ilha React (via `grcon_module_loader.js`). Aqui só é descrito o
 * suficiente para o adaptador; nenhum componente React usa estes tipos
 * diretamente — só `services/consultasAdapter.ts`.
 */
import type {
  DocumentIndex,
  ExportRow,
  ExportTemplate,
  LdHistoryEntry,
  LdRecord,
  LookupResult,
  ParsedDocument,
} from "./domain";

interface TriagemCoreApi {
  parseWorkbook(workbook: unknown, fileName: string, lastModified: number): { records: LdRecord[]; history: LdHistoryEntry[] };
  buildIndex(records: LdRecord[], history: LdHistoryEntry[]): DocumentIndex;
}

interface GrconRequestsCoreApi {
  parseDocumentList(input: string): ParsedDocument[];
  dedupeDocuments<T extends { document: string }>(items: T[]): { items: T[]; removed: T[] };
  lookupDocument(document: string, index: DocumentIndex, options: { requestedTitle?: string }): LookupResult;
  consultationRow(result: LookupResult): Record<string, unknown>;
  issuedColumns(entries: LdHistoryEntry[]): Record<string, unknown>;
}

interface GrconRequestsReportApi {
  COLUMNS: Array<{ key: string; header: string }>;
  BUILTIN_EXPORT_TEMPLATES: ExportTemplate[];
  normalizeExportTemplate(value: unknown): ExportTemplate;
  writeConsultationSheet(sheet: unknown, rows: ExportRow[], options: Record<string, unknown>): void;
  attachBrandLogo(workbook: unknown, sheet: unknown, brandAssets: unknown, fetchImpl: typeof fetch): Promise<void>;
}

interface GrconFileAccessApi {
  read(file: File, options: { context: string; retries: number }): Promise<ArrayBuffer>;
}

interface GRCONModuleLoaderApi {
  ensure(name: string): Promise<void>;
  ensureModule?(name: string): Promise<void>;
  state?(name: string): string;
}

interface GrconGrdtHistoryIndicatorApi {
  getEntries?(document: string): LdHistoryEntry[];
  refresh?(): void;
}

interface GrconLdMemoryApi {
  saveLastLd(file: File): void;
  getLastLd?(): { name: string } | null;
}

interface GrconCloudApi {
  getExportTemplates?(): Promise<ExportTemplate[]>;
  state?: { membership?: { workspace_id?: string }; plannedSnapshot?: GrconPlannedDocumentsSnapshot | null; online?: boolean };
  canManageHistory?(): boolean;
  deleteHistoryRecord?(record: unknown): Promise<unknown>;
  clearHistory?(): Promise<boolean>;
}

interface GrconPlannedDocumentsSnapshot {
  id: string;
  fileName?: string;
  updatedAt?: string;
  count?: number;
  keys?: Set<string>;
}

interface GrconPlannedDocumentClassification {
  available: boolean;
  allocated: boolean | null;
  kind: "allocated" | "not_allocated" | "unavailable" | string;
  label: string;
  status: string;
  documentKey: string;
  snapshotId: string;
  fileName: string;
  updatedAt: string;
}

interface GrconPlannedDocumentsApi {
  current(): GrconPlannedDocumentsSnapshot | null;
  refresh(): Promise<GrconPlannedDocumentsSnapshot | null>;
  classify(documentCode: string): GrconPlannedDocumentClassification;
  isAllocated(documentCode: string): boolean | null;
  applyRecords<T extends Record<string, unknown>>(records: T[]): T[];
  applyConsultationRow<T extends Record<string, unknown>>(row: T, documentCode: string): T;
}

type NotifyFn = (message: string, kind?: string) => void;

declare global {
  interface Window {
    TriagemCore?: TriagemCoreApi;
    GrconRequestsCore?: GrconRequestsCoreApi;
    GrconRequestsReport?: GrconRequestsReportApi;
    GrconFileAccess?: GrconFileAccessApi;
    GRCONModuleLoader?: GRCONModuleLoaderApi;
    GrconGrdtHistoryIndicator?: GrconGrdtHistoryIndicatorApi;
    GrconLdMemory?: GrconLdMemoryApi;
    GrconCloud?: GrconCloudApi;
    GrconPlannedDocuments?: GrconPlannedDocumentsApi;
    GrconNotify?: NotifyFn;
    GRCONBrandAssets?: unknown;
    XLSX?: {
      read(buffer: ArrayBuffer, options: Record<string, unknown>): unknown;
    };
    ExcelJS?: {
      Workbook: new () => {
        creator: string;
        company: string;
        title: string;
        addWorksheet(name: string, options: Record<string, unknown>): unknown;
        xlsx: { writeBuffer(): Promise<ArrayBuffer> };
      };
    };
    GrconConsultasAdapter?: unknown;
    GrconConsultasReact?: { mounted: boolean };
  }
}

export {};
