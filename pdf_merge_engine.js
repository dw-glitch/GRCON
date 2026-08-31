(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPdfMergeEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function sourceName(source, index) {
    return String(source && source.name || `PDF ${index + 1}`).trim();
  }

  async function sourceBytes(source) {
    if (source && source.bytes != null) return source.bytes;
    if (source && source.file && typeof source.file.arrayBuffer === "function") return source.file.arrayBuffer();
    if (source && typeof source.arrayBuffer === "function") return source.arrayBuffer();
    throw new Error("O arquivo não pôde ser lido pelo navegador.");
  }

  function readableError(error, name) {
    const raw = String(error && error.message || error || "");
    const normalized = raw.toLocaleLowerCase("pt-BR");
    let message = `O arquivo “${name}” não é um PDF válido ou está danificado.`;
    let code = "INVALID_PDF";
    if (normalized.includes("encrypt") || normalized.includes("password")) {
      message = `O arquivo “${name}” está protegido por senha ou criptografado. Remova a proteção antes de combinar.`;
      code = "ENCRYPTED_PDF";
    } else if (normalized.includes("page") && normalized.includes("zero")) {
      message = `O arquivo “${name}” não possui páginas para combinar.`;
      code = "EMPTY_PDF";
    }
    const result = new Error(message);
    result.code = code;
    result.fileName = name;
    return result;
  }

  async function mergePdfSources(sources, options) {
    const settings = options || {};
    const pdfLib = settings.pdfLib || root.PDFLib;
    if (!pdfLib || !pdfLib.PDFDocument) throw new Error("O mecanismo de combinação de PDFs não foi carregado.");
    const list = Array.isArray(sources) ? sources : [];
    if (list.length < 2) throw new Error("Selecione pelo menos dois PDFs para combinar.");

    const output = await pdfLib.PDFDocument.create({ updateMetadata: false });
    output.setTitle(String(settings.title || "PDF combinado pelo GRCON"));
    output.setCreator("GRCON");
    output.setProducer("GRCON - Combinador local de PDFs");
    output.setCreationDate(new Date());
    output.setModificationDate(new Date());

    let pageCount = 0;
    let inputBytes = 0;
    for (let index = 0; index < list.length; index += 1) {
      const source = list[index];
      const name = sourceName(source, index);
      if (typeof settings.onProgress === "function") settings.onProgress({ stage: "reading", index, total: list.length, name, pageCount });
      let bytes;
      let document;
      try {
        bytes = await sourceBytes(source);
        inputBytes += Number(bytes && bytes.byteLength) || 0;
        document = await pdfLib.PDFDocument.load(bytes, {
          ignoreEncryption: false,
          updateMetadata: false,
          throwOnInvalidObject: true,
        });
        const indices = document.getPageIndices();
        if (!indices.length) {
          const empty = new Error("zero pages");
          throw empty;
        }
        const pages = await output.copyPages(document, indices);
        pages.forEach((page) => output.addPage(page));
        pageCount += pages.length;
        if (typeof settings.onProgress === "function") settings.onProgress({ stage: "copied", index, total: list.length, name, pageCount, filePages: pages.length });
      } catch (error) {
        throw readableError(error, name);
      } finally {
        bytes = null;
        document = null;
      }
    }

    if (typeof settings.onProgress === "function") settings.onProgress({ stage: "saving", index: list.length, total: list.length, pageCount });
    const bytes = await output.save({
      addDefaultPage: false,
      useObjectStreams: true,
      objectsPerTick: 50,
    });
    return { bytes, pageCount, fileCount: list.length, inputBytes };
  }

  return Object.freeze({ mergePdfSources, readableError });
});
