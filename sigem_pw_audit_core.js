(function (root, factory) {
  const safeRequire = (path) => {
    if (typeof require !== "function") return null;
    try { return require(path); } catch (_) { return null; }
  };
  const api = factory(root.GrconSigemPwDashboard || safeRequire("./sigem_pw_dashboard_core.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconSigemPwAudit = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Dashboard) {
  "use strict";

  const VERSION = "sigem-pw-audit-1";
  const CLASSES = Object.freeze(["ET", "N-1710"]);

  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
  function countBy(items, selector) {
    const counts = {};
    for (const item of items || []) {
      const key = text(selector(item));
      if (key) counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }

  function buildAudit(base, ldBase) {
    if (!Dashboard || !base || !base.meta || !Array.isArray(base.records)) return null;
    const entries = Dashboard.buildEntryMap(base.records, "pw");
    const values = [...entries.values()];
    const documents = new Set(values.map((entry) => entry.documentKey).filter(Boolean));
    const classCounts = Object.fromEntries(CLASSES.map((name) => [name, 0]));
    let emitted = 0;
    let identityComplete = true;
    for (const entry of values) {
      if (CLASSES.includes(entry.documentClass)) classCounts[entry.documentClass] += 1;
      if (entry.emitted) emitted += 1;
      if (!text(entry.documentKey) || !text(entry.revisionKey) || !CLASSES.includes(entry.documentClass)) identityComplete = false;
    }
    const meta = base.meta || {};
    const acceptedRows = base.records.length;
    const validEntries = entries.size;
    const duplicateRows = Math.max(0, acceptedRows - validEntries);
    const scopeLdSnapshotId = text(meta.scopeLdSnapshotId);
    const activeLdId = text(ldBase && ldBase.meta && ldBase.meta.snapshotId);
    const checks = [
      { key: "entry-balance", label: "Entradas conciliadas com as classes", passed: classCounts.ET + classCounts["N-1710"] === validEntries },
      { key: "emission-balance", label: "Emissões contidas na base cadastrada", passed: emitted <= validEntries },
      { key: "identity", label: "Código e revisão normalizados", passed: identityComplete },
      { key: "scope-version", label: "Regra de escopo vigente aplicada", passed: Number(meta.scopeVersion || 0) >= Number(Dashboard.PW_SCOPE_VERSION || 0) },
      { key: "quality-ld", label: "N-1710 rastreável à LD da Qualidade", passed: classCounts["N-1710"] === 0 || Boolean(scopeLdSnapshotId) },
    ];
    return {
      version: VERSION,
      status: checks.every((check) => check.passed) ? "validated" : "attention",
      metrics: {
        validRows: acceptedRows,
        validEntries,
        uniqueDocuments: documents.size,
        classes: classCounts,
        emittedEntries: emitted,
        notEmittedEntries: Math.max(0, validEntries - emitted),
        consolidatedDuplicates: duplicateRows,
        statuses: countBy(values, (entry) => entry.current && entry.current.state),
      },
      trace: {
        fileName: text(meta.fileName),
        importedAt: text(meta.importedAt),
        fileSize: Number(meta.fileSize || 0),
        snapshotId: text(meta.snapshotId),
        scopeVersion: Number(meta.scopeVersion || 0),
        scopeRule: text(meta.scopeRule),
        ldSnapshotId: scopeLdSnapshotId,
        ldFileName: scopeLdSnapshotId && scopeLdSnapshotId === activeLdId ? text(ldBase.meta.fileName) : "",
      },
      checks,
    };
  }

  function exportRows(audit) {
    if (!audit) return [];
    const metrics = audit.metrics;
    const trace = audit.trace;
    return [
      { Grupo: "Resultado", Indicador: "Situação da validação", Valor: audit.status === "validated" ? "Aprovada" : "Requer conferência" },
      { Grupo: "Quantidade", Indicador: "Linhas válidas utilizadas", Valor: metrics.validRows },
      { Grupo: "Quantidade", Indicador: "Entradas válidas (código + revisão)", Valor: metrics.validEntries },
      { Grupo: "Quantidade", Indicador: "Documentos únicos", Valor: metrics.uniqueDocuments },
      { Grupo: "Classe", Indicador: "ET", Valor: metrics.classes.ET },
      { Grupo: "Classe", Indicador: "N-1710", Valor: metrics.classes["N-1710"] },
      { Grupo: "Emissão", Indicador: "PW emitido", Valor: metrics.emittedEntries },
      { Grupo: "Emissão", Indicador: "PW não emitido", Valor: metrics.notEmittedEntries },
      { Grupo: "Qualidade", Indicador: "Duplicidades técnicas consolidadas", Valor: metrics.consolidatedDuplicates },
      { Grupo: "Origem", Indicador: "Arquivo PW", Valor: trace.fileName || "—" },
      { Grupo: "Origem", Indicador: "Data da importação", Valor: trace.importedAt || "—" },
      { Grupo: "Origem", Indicador: "Snapshot PW", Valor: trace.snapshotId || "—" },
      { Grupo: "Origem", Indicador: "Snapshot LD da Qualidade", Valor: trace.ldSnapshotId || "—" },
      ...audit.checks.map((check) => ({ Grupo: "Integridade", Indicador: check.label, Valor: check.passed ? "OK" : "ATENÇÃO" })),
    ];
  }

  return Object.freeze({ VERSION, CLASSES, text, countBy, buildAudit, exportRows });
});
