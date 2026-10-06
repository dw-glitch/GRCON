(function (root, factory) {
  const api = factory(root.GrconAllocationRegistryCore || (typeof require === "function" ? require("./allocation_registry_core.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconDocumentAllocationContext = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Registry) {
  "use strict";
  function resolve(document, planned, central) {
    const identity = Registry.key(document), identified = identity.length >= 7 && /\d/.test(identity);
    const known = Boolean(identified && planned?.id && planned.keys instanceof Set);
    const kind = known ? planned.keys.has(identity) ? "allocated" : "not_allocated" : "unconfirmed";
    const references = Registry.lookup(document, central?.index);
    const allocations = [...new Set(references.map(item => item.allocation).filter(Boolean))];
    const warnings = [];
    if (!identified) warnings.push("Documento não identificado; alocação a confirmar.");
    if (kind === "not_allocated" && references.length) warnings.push("Há vínculo na Central, mas o documento não consta em Documentos Previstos.");
    if (allocations.length > 1) warnings.push("Documento vinculado a mais de uma alocação. Confira os vínculos antes de escolher.");
    if (central?.stale) warnings.push("A Central de alocação não foi confirmada nesta consulta; a referência exibida é a última versão carregada.");
    return { version: "1.0.0", kind, label: { allocated: "Alocado", not_allocated: "Não alocado", unconfirmed: "Alocação a confirmar" }[kind],
      plannedSnapshotId: planned?.id || "", centralSnapshotId: central?.id || "", centralFileName: central?.fileName || "",
      centralUpdatedAt: central?.updatedAt || "", allocations, references, warnings };
  }
  function filter(documents, mode, planned, central) {
    return (documents || []).filter(document => mode === "all" || resolve(document.document || document.documentCode || "", planned, central).kind === mode);
  }
  function applyRecords(records, planned, central) {
    return (records || []).map(record => {
      const context = resolve(record.document, planned, central);
      const allocation = planned?.id && context.allocations.length === 1 && !central?.stale ? context.allocations[0] : record.allocation;
      return { ...record, allocation, sharedAllocationContext: context };
    });
  }
  return Object.freeze({ resolve, filter, applyRecords });
});
