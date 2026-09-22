"use strict";
importScripts("../jszip.min.js", "../cover_docx_engine.js");
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
  if (!templatePromise) templatePromise = decodeParts("../assets/templates/CAPA_PAGE1_TEMPLATE.docx.b64", 4);
  return templatePromise;
}
self.addEventListener("message", async (event) => {
  const msg = event.data || {}, jobId = msg.jobId || "";
  try {
    if (msg.type === "inspect") {
      const zip = await self.JSZip.loadAsync(await msg.file.arrayBuffer());
      const app = zip.file("docProps/app.xml");
      const xml = app ? await app.async("string") : "";
      const match = xml.match(/<Pages>(\d+)<\/Pages>/i);
      const pages = match ? Number(match[1]) : 0;
      self.postMessage({ type: "inspected", jobId, pages, pageCountReliable: pages > 0 });
      return;
    }
    if (msg.type !== "generate") return;
    self.postMessage({ type: "progress", jobId, stage: "template" });
    const tpl = await templateBytes();
    let sourceBytes = null;
    if (msg.file) {
      self.postMessage({ type: "progress", jobId, stage: "source" });
      sourceBytes = await msg.file.arrayBuffer();
    }
    const bytes = await self.GrconCoverDocxEngine.generate({
      templateBytes: tpl, sourceBytes, data: msg.data, totalPages: msg.totalPages || "XX", JSZip: self.JSZip,
    });
    self.postMessage({ type: "generated", jobId, bytes }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({ type: "error", jobId, error: error && error.message || "Falha ao gerar Word." });
  }
});