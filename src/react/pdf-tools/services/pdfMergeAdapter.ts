import type {
  PdfMergeCoreApi,
  PdfMergeDebugState,
  PdfMergeItem,
  PdfMergeOutcome,
  PdfMergeProgress,
  PdfMergeProgressState,
  PdfMergeResult,
  PdfMergeWorkerMessage,
  PdfMergeWorkerPort,
} from "../types/domain";

interface PdfMergeFailure extends Error {
  code: string;
  fileName?: string;
}

interface PdfMergeAdapterDependencies {
  core?: PdfMergeCoreApi;
  workerFactory?: () => PdfMergeWorkerPort;
  notify?: (message: string, kind?: string) => void;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  triggerDownload?: (url: string, fileName: string) => void;
  randomId?: () => string;
}

interface AddFilesResult {
  items: PdfMergeItem[];
  added: number;
  invalid: number;
  duplicated: number;
}

interface ActiveJob {
  jobId: string;
  worker: PdfMergeWorkerPort;
  reject: (error: PdfMergeFailure) => void;
  cancel: () => void;
}

const DEFAULT_OUTPUT_NAME = "PDF_Combinado.pdf";

function cancelledError(): PdfMergeFailure {
  const error = new Error("Processamento cancelado.") as PdfMergeFailure;
  error.code = "CANCELLED";
  return error;
}

function workerError(message: string, code = "MERGE_FAILED", fileName = ""): PdfMergeFailure {
  const error = new Error(message) as PdfMergeFailure;
  error.code = code;
  if (fileName) error.fileName = fileName;
  return error;
}

function normalizeFiles(files: FileList | File[] | null | undefined): File[] {
  return files ? Array.from(files) : [];
}

export function createPdfMergeAdapter(overrides: PdfMergeAdapterDependencies = {}) {
  let activeJob: ActiveJob | null = null;
  let currentObjectUrl = "";

  function core(): PdfMergeCoreApi {
    const value = overrides.core || window.GrconPdfMergeCore;
    if (!value) throw new Error("O núcleo do combinador de PDFs não foi carregado.");
    return value;
  }

  function randomId(): string {
    if (overrides.randomId) return overrides.randomId();
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function notify(message: string, kind = "info"): void {
    const fn = overrides.notify || window.GrconNotify;
    if (typeof fn === "function") {
      fn(message, kind);
      return;
    }
    if (kind === "error") window.alert(message);
  }

  function addFiles(existing: PdfMergeItem[], input: FileList | File[] | null | undefined): AddFilesResult {
    const api = core();
    const signatures = new Set(existing.map((item) => item.signature));
    const accepted: PdfMergeItem[] = [];
    let invalid = 0;
    let duplicated = 0;

    normalizeFiles(input).forEach((file) => {
      if (!api.isAcceptedFile(file)) {
        invalid += 1;
        return;
      }
      const signature = api.fileSignature(file);
      if (signatures.has(signature)) {
        duplicated += 1;
        return;
      }
      signatures.add(signature);
      accepted.push({
        id: randomId(),
        file,
        name: file.name,
        size: file.size,
        signature,
      });
    });

    return {
      items: accepted.length ? [...existing, ...accepted] : existing,
      added: accepted.length,
      invalid,
      duplicated,
    };
  }

  function reorder(items: PdfMergeItem[], fromIndex: number, toIndex: number): PdfMergeItem[] {
    return core().reorder(items, fromIndex, toIndex);
  }

  function summarize(items: PdfMergeItem[]): { count: number; bytes: number } {
    return core().summarize(items);
  }

  function formatBytes(value: number): string {
    return core().formatBytes(value);
  }

  function outputFileName(value: unknown): string {
    return core().outputFileName(value || DEFAULT_OUTPUT_NAME, "pdf");
  }

  function progressState(message: PdfMergeProgress, fallbackCount: number): PdfMergeProgressState {
    const total = Math.max(1, Number(message.total) || fallbackCount || 1);
    if (message.stage === "reading") {
      return {
        percent: Math.max(0, Math.min(85, (Number(message.index) / total) * 85)),
        message: `Lendo ${message.name || "PDF"} (${Number(message.index) + 1} de ${total})…`,
      };
    }
    if (message.stage === "copied") {
      return {
        percent: Math.max(0, Math.min(85, ((Number(message.index) + 1) / total) * 85)),
        message: `${Number(message.pageCount).toLocaleString("pt-BR")} página(s) combinada(s)…`,
      };
    }
    return {
      percent: 94,
      message: `Finalizando ${Number(message.pageCount).toLocaleString("pt-BR")} página(s)…`,
    };
  }

  function defaultWorkerFactory(): PdfMergeWorkerPort {
    if (typeof Worker !== "function") {
      throw new Error("Este navegador não oferece o processamento necessário. Atualize o Chrome ou Edge e tente novamente.");
    }
    return new Worker("workers/pdf-merge.worker.js") as unknown as PdfMergeWorkerPort;
  }

  function merge(
    items: PdfMergeItem[],
    requestedOutputName: string,
    onProgress: (progress: PdfMergeProgress) => void,
  ): Promise<PdfMergeOutcome> {
    if (activeJob) return Promise.reject(workerError("Já existe uma combinação de PDFs em andamento.", "BUSY"));

    const outputName = outputFileName(requestedOutputName);
    const worker = (overrides.workerFactory || defaultWorkerFactory)();
    const jobId = randomId();

    return new Promise<PdfMergeOutcome>((resolve, reject) => {
      let settled = false;

      const cleanup = (): void => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        worker.terminate();
        if (activeJob?.jobId === jobId) activeJob = null;
      };

      const settleResolve = (value: PdfMergeOutcome): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      const settleReject = (error: PdfMergeFailure): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      const onMessage = (event: MessageEvent<PdfMergeWorkerMessage>): void => {
        const message = event.data;
        if (!message || message.jobId !== jobId) return;
        if (message.type === "progress") {
          onProgress({
            stage: message.stage,
            index: Number(message.index) || 0,
            total: Number(message.total) || items.length,
            name: message.name,
            pageCount: Number(message.pageCount) || 0,
            filePages: message.filePages,
          });
          return;
        }
        if (message.type === "done") {
          settleResolve({
            buffer: message.buffer,
            pageCount: Number(message.pageCount) || 0,
            fileCount: Number(message.fileCount) || items.length,
            inputBytes: Number(message.inputBytes) || 0,
            outputBytes: Number(message.outputBytes) || message.buffer.byteLength,
          });
          return;
        }
        settleReject(workerError(
          message.message || "Não foi possível combinar os PDFs.",
          message.code || "MERGE_FAILED",
          message.fileName || "",
        ));
      };

      const onError = (): void => {
        settleReject(workerError("O navegador interrompeu o processamento dos PDFs.", "WORKER_ERROR"));
      };

      const cancel = (): void => {
        if (settled) return;
        try {
          worker.postMessage({ type: "cancel", jobId });
        } catch (_) {
          // terminate() abaixo é a garantia final de cancelamento.
        }
        settleReject(cancelledError());
      };

      activeJob = { jobId, worker, reject: settleReject, cancel };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError, { once: true });
      worker.postMessage({
        type: "merge",
        jobId,
        title: outputName.replace(/\.pdf$/i, ""),
        files: items.map((item) => ({ name: item.name, file: item.file })),
      });
    });
  }

  function cancel(options: { notifyUser?: boolean } = {}): boolean {
    if (!activeJob) return false;
    const job = activeJob;
    job.cancel();
    if (options.notifyUser !== false) notify("Combinação cancelada. Nenhum arquivo foi salvo.", "info");
    return true;
  }

  function revokeResult(url?: string): void {
    const target = url || currentObjectUrl;
    if (!target) return;
    const revoke = overrides.revokeObjectURL || ((value: string) => URL.revokeObjectURL(value));
    revoke(target);
    if (currentObjectUrl === target) currentObjectUrl = "";
  }

  function createResult(outcome: PdfMergeOutcome, requestedOutputName: string): PdfMergeResult {
    revokeResult();
    const blob = new Blob([outcome.buffer], { type: "application/pdf" });
    const create = overrides.createObjectURL || ((value: Blob) => URL.createObjectURL(value));
    const url = create(blob);
    currentObjectUrl = url;
    return {
      blob,
      url,
      name: outputFileName(requestedOutputName),
      pageCount: outcome.pageCount,
      fileCount: outcome.fileCount,
      outputBytes: outcome.outputBytes || blob.size,
      mode: "pdf",
    };
  }

  function triggerDownload(url: string, requestedOutputName: string): string {
    const name = outputFileName(requestedOutputName);
    if (overrides.triggerDownload) {
      overrides.triggerDownload(url, name);
      return name;
    }
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return name;
  }

  function hasActiveWorker(): boolean {
    return Boolean(activeJob);
  }

  function dispose(): void {
    cancel({ notifyUser: false });
    revokeResult();
  }

  return Object.freeze({
    DEFAULT_OUTPUT_NAME,
    addFiles,
    reorder,
    summarize,
    formatBytes,
    outputFileName,
    progressState,
    merge,
    cancel,
    createResult,
    revokeResult,
    triggerDownload,
    hasActiveWorker,
    notify,
    dispose,
  });
}

export const pdfMergeAdapter = createPdfMergeAdapter();

interface PdfMergeBridgeHandlers {
  activate(): void;
  addFiles(files: FileList | File[] | null | undefined): void;
  clear(): void;
  getDebugState(): PdfMergeDebugState;
}

function createPdfMergeBridge() {
  let handlers: PdfMergeBridgeHandlers | null = null;
  let pendingActivate = false;
  let pendingClear = false;
  const pendingFiles: File[] = [];

  function flush(): void {
    if (!handlers) return;
    if (pendingClear) {
      pendingClear = false;
      pendingFiles.length = 0;
      handlers.clear();
    } else if (pendingFiles.length) {
      handlers.addFiles(pendingFiles.splice(0));
    }
    if (pendingActivate) {
      pendingActivate = false;
      handlers.activate();
    }
  }

  return Object.freeze({
    register(next: PdfMergeBridgeHandlers): () => void {
      handlers = next;
      flush();
      return () => {
        if (handlers === next) handlers = null;
      };
    },
    activate(): void {
      if (handlers) handlers.activate();
      else pendingActivate = true;
    },
    addFiles(files: FileList | File[] | null | undefined): void {
      const normalized = normalizeFiles(files);
      if (handlers) handlers.addFiles(normalized);
      else pendingFiles.push(...normalized);
    },
    clear(): void {
      if (handlers) handlers.clear();
      else pendingClear = true;
    },
    getDebugState(): PdfMergeDebugState | null {
      return handlers?.getDebugState() || null;
    },
  });
}

export const pdfMergeBridge = createPdfMergeBridge();
