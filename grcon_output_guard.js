(function (root, factory) {
  const contracts = root.GrconContracts || (typeof module === "object" && module.exports ? require("./grcon_contracts.js") : null);
  const api = factory(contracts);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconOutputGuard = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Contracts) {
  "use strict";

  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
  function norm(value) { return Contracts ? Contracts.norm(value) : text(value).toUpperCase(); }
  function validateRows(rows, options) {
    const settings = options || {};
    const manualForceRows = settings.manualForceRows instanceof Set ? settings.manualForceRows : new Set();
    const maxItems = Math.max(1, Number(settings.maxItems) || 48);
    const items = (rows || []).filter(Boolean);
    const errors = [];
    const warnings = [];
    if (!items.length) errors.push("Nenhum documento foi selecionado para a eGRDT.");
    if (items.length > maxItems) {
      const batches = Math.ceil(items.length / maxItems);
      if (settings.splitAllowed) warnings.push(`${items.length} documentos serão divididos automaticamente em ${batches} eGRDTs de até ${maxItems} documentos.`);
      else errors.push(`A eGRDT aceita no máximo ${maxItems} documentos.`);
    }

    const names = new Map();
    items.forEach((row) => {
      const message = Contracts ? Contracts.enrichDecision(row).userMessage : null;
      const allocation = text(row && (row.allocationStatus || row.record && row.record.allocationStatus));
      const manualAllocationOverride = Boolean(
        row.hardBlock
        && manualForceRows.has(row)
        && (/^not_allocated(?:_conflict)?$/.test(text(row.blockCode)) || norm(allocation).includes("NAO ALOCADO"))
      );
      // Apenas "Não Alocado" pode ser superado por seleção manual consciente.
      // Os demais bloqueios continuam impedindo a saída.
      if (row.hardBlock && !manualAllocationOverride) {
        errors.push(`${text(row.document) || "Documento"}: ${message ? message.title : "não pode ser incluído"}`);
      }
      if (manualAllocationOverride) warnings.push(`${text(row.document) || "Documento"}: inclusão manual apesar do status “Não Alocado” na LD.`);
      const finalName = text(row.finalName);
      if (!finalName) errors.push(`${text(row.document) || "Documento"}: o nome final não foi definido.`);
      const key = norm(finalName);
      if (key) names.set(key, (names.get(key) || 0) + 1);
      if (!text(row.record && row.record.databook)) warnings.push(`${text(row.document) || "Documento"}: caminho Databook não informado na LD.`);
    });
    names.forEach((count, name) => { if (count > 1) errors.push(`Existe mais de um arquivo com o nome final “${name}”.`); });
    return { valid: errors.length === 0, errors, warnings, count: items.length };
  }

  return { validateRows };
});
