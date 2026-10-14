/* Projeção operacional da triagem. Sem acesso ao banco ou alteração dos documentos. */
(function (root, factory) {
  const api = factory(root.TriagemCore || (typeof require === "function" ? require("./core.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconGrdtTriageQuery = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";
  const norm = Core.norm;
  function origin(row) {
    return row.fileOrigin || (String(row.listSource || "").includes("Cofre") ? "Cofre" :
      row.files?.length ? "Pasta local" : "Relação sem arquivo físico");
  }
  function extensions(row) {
    return [...new Set((row.files?.length ? row.files : [{ name: row.name || row.virtualFileName || "" }])
      .map(file => String(file.name || "").match(/\.([^.\\/]+)$/)?.[1]?.toUpperCase()).filter(Boolean))];
  }
  function historyKind(result, status) {
    if (result?.latestEmission) return "issued";
    return status?.complete ? "never" : "unconfirmed";
  }
  function matches(row, filters, result, status) {
    if (filters.origin && norm(origin(row)) !== filters.origin) return false;
    if (filters.extension && !extensions(row).includes(filters.extension)) return false;
    const found = filters.revision ? Core.normalizeRevision(row.record?.revision) : "", selected = filters.revision ? Core.normalizeRevision(row.revision) : "";
    if (filters.revision === "changed" && (!found || !selected || found === selected)) return false;
    if (filters.revision === "divergent" && !row.revisionFormatWarning && !row.documentRevisionWarning &&
        !(found && selected && found !== selected)) return false;
    const history = filters.history;
    if (["issued", "never", "unconfirmed"].includes(history) && historyKind(result, status) !== history) return false;
    if (history === "new-revision" && result?.emissionKind !== "NEW_REVISION") return false;
    if (history === "repost" && result?.emissionKind !== "REPOST") return false;
    const known = filters.allocation && Boolean(String(row.record?.allocation || "").trim() || row.allocationFinding?.allocation);
    if (filters.allocation === "known" && !known) return false;
    if (filters.allocation === "unknown" && known) return false;
    return true;
  }
  function searchText(row, ldCode, historyNumbers) {
    return norm([row.record?.title, row.record?.allocation, row.name, ...(row.files || []).map(file => file.name),
      row.document, ldCode, row.revision, row.status, row.sheet, row.reason, row.allocationStatus,
      row.fiscalComment, row.grdt, row.record?.grdt, origin(row), ...extensions(row), historyNumbers].filter(Boolean).join(" "));
  }
  return Object.freeze({ origin, extensions, historyKind, matches, searchText });
});
