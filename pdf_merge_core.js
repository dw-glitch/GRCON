(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPdfMergeCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function isPdfFile(file) {
    const name = text(file && file.name);
    const type = text(file && file.type).toLowerCase();
    return Boolean(file && Number(file.size) > 0 && (/\.pdf$/i.test(name) || type === "application/pdf"));
  }

  function fileSignature(file) {
    return [
      text(file && file.name).toLocaleLowerCase("pt-BR"),
      Number(file && file.size) || 0,
      Number(file && file.lastModified) || 0,
    ].join("::");
  }

  function cleanBaseName(value) {
    const original = text(value).replace(/\.pdf\s*$/i, "");
    const cleaned = original
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[<>:"/\\|?*]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim();
    return Array.from(cleaned || "PDF_Combinado").slice(0, 120).join("");
  }

  function outputFileName(value) {
    return `${cleanBaseName(value)}.pdf`;
  }

  function formatBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${bytes.toLocaleString("pt-BR")} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
    return `${(bytes / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB`;
  }

  function summarize(items) {
    const list = Array.isArray(items) ? items : [];
    return {
      count: list.length,
      bytes: list.reduce((total, item) => total + (Number(item && (item.size ?? (item.file && item.file.size))) || 0), 0),
    };
  }

  function reorder(items, fromIndex, toIndex) {
    const list = [...(Array.isArray(items) ? items : [])];
    const from = Number(fromIndex);
    const to = Number(toIndex);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return list;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    return list;
  }

  return Object.freeze({
    text,
    isPdfFile,
    fileSignature,
    cleanBaseName,
    outputFileName,
    formatBytes,
    summarize,
    reorder,
  });
});
