"use strict";

importScripts("../pdf-lib.min.js", "../pdf_merge_engine.js");

let activeJob = "";

self.addEventListener("message", async (event) => {
  const message = event.data || {};
  if (message.type === "cancel") {
    activeJob = "";
    return;
  }
  if (message.type !== "merge") return;

  const jobId = String(message.jobId || "");
  activeJob = jobId;
  try {
    const sources = (message.files || []).map((entry) => ({ name: entry.name, file: entry.file }));
    const result = await self.GrconPdfMergeEngine.mergePdfSources(sources, {
      pdfLib: self.PDFLib,
      title: message.title,
      onProgress(progress) {
        if (activeJob === jobId) self.postMessage({ type: "progress", jobId, ...progress });
      },
    });
    if (activeJob !== jobId) return;
    const bytes = result.bytes;
    const buffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.slice().buffer;
    self.postMessage({
      type: "done",
      jobId,
      buffer,
      pageCount: result.pageCount,
      fileCount: result.fileCount,
      inputBytes: result.inputBytes,
      outputBytes: buffer.byteLength,
    }, [buffer]);
  } catch (error) {
    if (activeJob !== jobId) return;
    self.postMessage({
      type: "error",
      jobId,
      code: String(error && error.code || "MERGE_FAILED"),
      fileName: String(error && error.fileName || ""),
      message: String(error && error.message || "Não foi possível combinar os PDFs."),
    });
  } finally {
    if (activeJob === jobId) activeJob = "";
  }
});
