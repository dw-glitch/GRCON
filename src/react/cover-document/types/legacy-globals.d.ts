import type { CoverDebugState, LdDocumentRecord } from "./domain";

interface TriagemCoreApi {
  norm(value: unknown): string;
  parseWorkbook(workbook: unknown, fileName: string, lastModified: number, compatibilityProfile?: unknown): {
    records: LdDocumentRecord[];
    history: LdDocumentRecord[];
  };
  validateDocumentCode(document: string, sheetName?: string): {
    valid: boolean;
    family?: string;
    errors?: string[];
  };
}

interface PdfPageLike {
  getWidth(): number;
  getHeight(): number;
  drawText(text: string, options: Record<string, unknown>): void;
  drawRectangle(options: Record<string, unknown>): void;
}

interface PdfFontLike {
  widthOfTextAtSize(text: string, size: number): number;
}

interface PdfDocumentLike {
  getPages(): PdfPageLike[];
  getPageCount(): number;
  embedFont(name: string): Promise<PdfFontLike>;
  copyPages(source: PdfDocumentLike, indices: number[]): Promise<PdfPageLike[]>;
  addPage(page: PdfPageLike): void;
  save(): Promise<Uint8Array>;
}

interface PdfLibApi {
  PDFDocument: {
    load(bytes: ArrayBuffer | Uint8Array): Promise<PdfDocumentLike>;
  };
  StandardFonts: {
    Helvetica: string;
    HelveticaBold: string;
  };
  rgb(red: number, green: number, blue: number): unknown;
}

interface JsZipFileLike {
  async(type: "string"): Promise<string>;
}

interface JsZipLike {
  file(path: string): JsZipFileLike | null;
  file(path: string, data: string | ArrayBuffer | Uint8Array, options?: Record<string, unknown>): JsZipLike;
  generateAsync(options: Record<string, unknown>): Promise<Uint8Array>;
}

interface JsZipConstructor {
  loadAsync(data: ArrayBuffer | Uint8Array): Promise<JsZipLike>;
}

interface GrconCoverDocumentUiApi {
  activate(): void;
  deactivate(): void;
  clear(): void;
  _debug: { readonly state: CoverDebugState | null };
}

type NotifyFn = (message: string, kind?: string) => void;

declare global {
  interface Window {
    TriagemCore?: TriagemCoreApi;
    XLSX?: { read(buffer: ArrayBuffer, options: Record<string, unknown>): unknown };
    PDFLib?: PdfLibApi;
    JSZip?: JsZipConstructor;
    GrconNotify?: NotifyFn;
    GrconCoverDocumentUi?: GrconCoverDocumentUiApi;
    GrconCoverDocumentReact?: { mounted: boolean };
  }
}

export {};
