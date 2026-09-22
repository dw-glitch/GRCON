"use strict";
importScripts("../pdf-lib.min.js", "../cover_pdf_engine.js");
let templatePromise = null;
function templateBytes() {
  if (!templatePromise) templatePromise = fetch("../assets/templates/CAPA_PAGE1_BASE.pdf", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error("Template PDF da capa não está disponível."); return r.arrayBuffer(); });
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
      const result = await self.GrconCoverPdfEngine.generate({ templateBytes: tpl, sourceBytes, data: msg.data, pdfLib: self.PDFLib });
      self.postMessage({ type: msg.type === "preview" ? "previewed" : "generated", jobId, ...result }, [result.bytes.buffer]);
      return;
    }
  } catch (error) {
    self.postMessage({ type: "error", jobId, error: error && error.message || "Falha ao processar PDF." });
  }
});