"use strict";
importScripts("../pdf-lib.min.js", "../cover_pdf_engine.js");
let templatePromise = null;
async function decodeParts(prefix, count) {
  const chunks = await Promise.all(Array.from({ length: count }, (_, index) => {
    const suffix = String(index + 1).padStart(3, "0");
    return fetch(prefix + "." + suffix, { cache: "no-cache" }).then((response) => {
      if (!response.ok) throw new Error("Template da capa não está disponível.");
      return response.text();
    });
  }));
  const binary = atob(chunks.join("").replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
function templateBytes() {
  if (!templatePromise) templatePromise = decodeParts("../assets/templates/CAPA_PAGE1_BASE.pdf.b64", 3);
  return templatePromise;
}
self.addEventListener("message", async (event) => {
  const msg = event.data || {}, jobId = msg.jobId || "";
  try {
    if (msg.type === "inspect") {
      const bytes = await msg.file.arrayBuffer();
      const result = await self.GrconCoverPdfEngine.inspectPdf(bytes, self.PDFLib);
      self.postMessage({ type: "inspected", jobId, ...result }); return;
    }
    if (msg.type === "generate" || msg.type === "preview") {
      self.postMessage({ type: "progress", jobId, stage: "template" });
      const tpl = await templateBytes();
      let sourceBytes = null;
      if (msg.type === "generate") {
        self.postMessage({ type: "progress", jobId, stage: "source" });
        sourceBytes = await msg.file.arrayBuffer();
      }
      const result = await self.GrconCoverPdfEngine.generate({ templateBytes: tpl, sourceBytes, data: msg.data, totalPages: msg.totalPages, pdfLib: self.PDFLib });
      self.postMessage({ type: msg.type === "preview" ? "previewed" : "generated", jobId, ...result }, [result.bytes.buffer]);
      return;
    }
  } catch (error) {
    self.postMessage({ type: "error", jobId, error: error && error.message || "Falha ao processar PDF." });
  }
});