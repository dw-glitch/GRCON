import type { PdfMergeCoreApi, PdfMergeDebugState } from "./domain";

type NotifyFn = (message: string, kind?: string) => void;

interface GrconPdfMergeUiApi {
  activate(): void;
  addFiles(files: FileList | File[] | null | undefined): void;
  clear(): void;
  _debug: {
    readonly state: PdfMergeDebugState | null;
  };
}

declare global {
  interface Window {
    GrconPdfMergeCore?: PdfMergeCoreApi;
    GrconPdfMergeUi?: GrconPdfMergeUiApi;
    GrconPdfMergeReact?: { mounted: boolean };
    GrconNotify?: NotifyFn;
  }
}

export {};
