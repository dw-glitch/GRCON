export interface PdfMergeItem {
  id: string;
  file: File;
  name: string;
  size: number;
  signature: string;
}

export type PdfMergeProgressStage = "reading" | "copied" | "saving";

export interface PdfMergeProgress {
  stage: PdfMergeProgressStage;
  index: number;
  total: number;
  name?: string;
  pageCount: number;
  filePages?: number;
}

export interface PdfMergeProgressState {
  percent: number;
  message: string;
}

export interface PdfMergeResult {
  blob: Blob;
  url: string;
  name: string;
  pageCount: number;
  fileCount: number;
  outputBytes: number;
  mode: "pdf";
}

export interface PdfMergeOutcome {
  buffer: ArrayBuffer;
  pageCount: number;
  fileCount: number;
  inputBytes: number;
  outputBytes: number;
}

export interface PdfMergeWorkerProgressMessage extends PdfMergeProgress {
  type: "progress";
  jobId: string;
}

export interface PdfMergeWorkerDoneMessage {
  type: "done";
  jobId: string;
  buffer: ArrayBuffer;
  pageCount: number;
  fileCount: number;
  inputBytes: number;
  outputBytes: number;
}

export interface PdfMergeWorkerErrorMessage {
  type: "error";
  jobId: string;
  code: string;
  fileName?: string;
  message: string;
}

export type PdfMergeWorkerMessage =
  | PdfMergeWorkerProgressMessage
  | PdfMergeWorkerDoneMessage
  | PdfMergeWorkerErrorMessage;

export interface PdfMergeCoreApi {
  text(value: unknown): string;
  isPdfFile(file: File | { name?: string; type?: string; size?: number }): boolean;
  isAcceptedFile(file: File | { name?: string; type?: string; size?: number }): boolean;
  fileSignature(file: File | { name?: string; size?: number; lastModified?: number }): string;
  outputFileName(value: unknown, extension?: string): string;
  formatBytes(value: unknown): string;
  summarize(items: Array<{ size?: number; file?: { size?: number } }>): { count: number; bytes: number };
  reorder<T>(items: T[], fromIndex: number, toIndex: number): T[];
}

export interface PdfMergeWorkerPort {
  addEventListener(type: "message", listener: (event: MessageEvent<PdfMergeWorkerMessage>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void, options?: AddEventListenerOptions | boolean): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<PdfMergeWorkerMessage>) => void): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  postMessage(message: unknown): void;
  terminate(): void;
}

export interface PdfMergeState {
  items: PdfMergeItem[];
  busy: boolean;
  progress: PdfMergeProgressState;
  outputName: string;
  result: PdfMergeResult | null;
  isDropActive: boolean;
  draggedId: string;
  dropTargetId: string;
  workerActive: boolean;
}

export interface PdfMergeDebugState {
  items: PdfMergeItem[];
  busy: boolean;
  outputName: string;
  result: PdfMergeResult | null;
  workerActive: boolean;
}
