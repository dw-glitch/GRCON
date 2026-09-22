import type {
  CoverDocumentData, CoverGeneratedResult, CoverValidationResult, LdDocumentRecord, SourceInfo, WorkerProgress,
} from "../types/domain";

function core() {
  if (!window.GrconCoverCore) throw new Error("O motor de capas não está disponível.");
  return window.GrconCoverCore;
}
async function ensure(name: string) {
  if (!window.GRCONModuleLoader) throw new Error("O carregador de módulos do GRCON não está disponível.");
  await window.GRCONModuleLoader.ensure(name);
}
async function read(file: File, context: string): Promise<ArrayBuffer> {
  return window.GrconFileAccess
    ? window.GrconFileAccess.read(file, { context, retries: 1 })
    : file.arrayBuffer();
}
function notify(message: string, kind = "info") { window.GrconNotify?.(message, kind); }

async function parseLd(file: File): Promise<LdDocumentRecord[]> {
  await ensure("xlsx");
  if (!window.XLSX || !window.TriagemCore) throw new Error("O leitor de LD não foi carregado.");
  const buffer = await read(file, "a LD usada na capa");
  const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true, cellStyles: false });
  const parsed = window.TriagemCore.parseWorkbook(workbook, file.name, file.lastModified);
  return (parsed.records || []).map((record) => core().prepareLdRecord(record, window.TriagemCore));
}
function sharedLdFiles(): File[] {
  const input = document.getElementById("ld-input") as HTMLInputElement | null;
  return [...(input?.files || [])];
}
function searchByTitle(records: LdDocumentRecord[], query: string) { return core().searchByTitle(records, query, 30); }
function coverDataFromRecord(record: LdDocumentRecord, overrides?: Partial<CoverDocumentData>) {
  return core().coverDataFromRecord(record, overrides);
}
function validate(data: CoverDocumentData, selected: LdDocumentRecord | null, source: SourceInfo | null): CoverValidationResult {
  return core().validateCoverData(data, { selectedRecord: selected, requireSource: true, hasSource: Boolean(source) });
}
function fileName(data: CoverDocumentData, ext: string) { return core().outputFileName(data, ext); }

type WorkerReply = Record<string, unknown> & { type?: string; error?: string; bytes?: Uint8Array; pageCount?: number; pages?: number; pageCountReliable?: boolean };
function workerRequest(script: string, payload: Record<string, unknown>, onProgress?: (p: WorkerProgress) => void): Promise<WorkerReply> {
  return new Promise((resolve, reject) => {
    if (typeof Worker !== "function") { reject(new Error("Este navegador não oferece Web Worker.")); return; }
    const worker = new Worker(script);
    const jobId = "cover-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    const cleanup = () => worker.terminate();
    worker.addEventListener("message", (event) => {
      const msg = event.data as WorkerReply & { jobId?: string; stage?: string };
      if (msg.jobId !== jobId) return;
      if (msg.type === "progress") { onProgress?.({ stage: String(msg.stage || "") }); return; }
      cleanup();
      if (msg.type === "error") reject(new Error(msg.error || "Falha no processamento."));
      else resolve(msg);
    });
    worker.addEventListener("error", () => { cleanup(); reject(new Error("O Worker de documentos falhou.")); }, { once: true });
    worker.postMessage({ ...payload, jobId });
  });
}
function sourceFormat(file: File): SourceInfo["format"] {
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") return "pdf";
  if (/\.docx$/i.test(file.name) || file.type.includes("wordprocessingml")) return "docx";
  return "unsupported";
}
async function inspectSource(file: File): Promise<SourceInfo> {
  const format = sourceFormat(file);
  if (format === "pdf") {
    const result = await workerRequest("workers/cover-pdf.worker.js", { type: "inspect", file });
    return { file, format, pages: Number(result.pageCount) || 0, pageCountReliable: true };
  }
  if (format === "docx") {
    const result = await workerRequest("workers/cover-docx.worker.js", { type: "inspect", file });
    const pages = Number(result.pages) || 0;
    return {
      file, format, pages: pages || null, pageCountReliable: Boolean(result.pageCountReliable && pages),
      warning: pages ? "Paginação lida do DOCX salvo; confira se o arquivo foi paginado no Word antes da geração." : "O DOCX não registra paginação confiável; o total de folhas ficará pendente para conferência.",
    };
  }
  return { file, format, pages: null, pageCountReliable: false, warning: "Formato ainda não suportado para geração automática." };
}
async function previewPdf(data: CoverDocumentData, totalPages: number | null): Promise<Blob> {
  const result = await workerRequest("workers/cover-pdf.worker.js", { type: "preview", data, totalPages: totalPages || 1 });
  const bytes = result.bytes as Uint8Array;
  return new Blob([bytes], { type: "application/pdf" });
}
async function generatePdf(file: File, data: CoverDocumentData, onProgress?: (p: WorkerProgress) => void): Promise<CoverGeneratedResult> {
  const result = await workerRequest("workers/cover-pdf.worker.js", { type: "generate", file, data }, onProgress);
  const bytes = result.bytes as Uint8Array;
  return { blob: new Blob([bytes], { type: "application/pdf" }), fileName: fileName(data, "pdf"), pageCount: Number(result.pageCount) || undefined };
}
async function generateDocx(file: File, data: CoverDocumentData, totalPages: number | null, onProgress?: (p: WorkerProgress) => void): Promise<CoverGeneratedResult> {
  const result = await workerRequest("workers/cover-docx.worker.js", { type: "generate", file, data, totalPages: totalPages || "XX" }, onProgress);
  const bytes = result.bytes as Uint8Array;
  return {
    blob: new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
    fileName: fileName(data, "docx"),
  };
}
function download(result: CoverGeneratedResult) {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement("a"); a.href = url; a.download = result.fileName;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export const coverAdapter = Object.freeze({
  notify, parseLd, sharedLdFiles, searchByTitle, coverDataFromRecord, validate,
  inspectSource, previewPdf, generatePdf, generateDocx, download, sourceFormat,
});
export type CoverAdapter = typeof coverAdapter;