(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NormativeVersionRegistry = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function norm(value) {
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  }

  function revisionKey(value) {
    return norm(value).replace(/^REV(?:ISAO)?\.?\s*/, "");
  }

  function versionKey(record) {
    const item = record || {};
    return [norm(item.norma || item.normId), revisionKey(item.revision), text(item.editionDate || item.effectiveDate)].join("|");
  }

  function normalizeRecord(record) {
    const item = record || {};
    return {
      normId: text(item.normId) || norm(item.norma).replace(/\s+/g, "-"),
      norma: text(item.norma),
      revision: revisionKey(item.revision),
      editionDate: text(item.editionDate),
      amendmentDate: text(item.amendmentDate),
      effectiveDate: text(item.effectiveDate || item.editionDate),
      title: text(item.title),
      classification: text(item.classification),
      sourceFile: text(item.sourceFile),
      sourceStatus: text(item.sourceStatus) || "file-confirmed",
      catalogRevision: revisionKey(item.catalogRevision),
      catalogDate: text(item.catalogDate),
      explicitStatus: text(item.explicitStatus),
      notes: text(item.notes),
    };
  }

  function statusOf(record) {
    const item = normalizeRecord(record);
    const explicit = norm(item.explicitStatus);
    if (["CANCELLED", "CANCELED", "CANCELADA", "CANCELADO"].includes(explicit)) return "cancelled";
    if (["SUPERSEDED", "SUBSTITUIDA", "SUBSTITUIDO"].includes(explicit)) return "superseded";\n    if (["SOURCE-CONFIRMED", "SOURCE_CONFIRMED", "FONTE-CONFIRMADA"].includes(explicit)) return "source-confirmed";
    if (!item.revision) return "invalid";
    if (!item.catalogRevision) return "catalog-unconfirmed";
    if (item.catalogRevision !== item.revision) return "catalog-mismatch";
    return "current";
  }

  function create(initialRecords) {
    const records = new Map();
    (initialRecords || []).forEach(register);

    function register(record) {
      const normalized = normalizeRecord(record);
      if (!normalized.norma || !normalized.revision) throw new Error("Norma e revisão são obrigatórias no registro normativo.");
      const key = versionKey(normalized);
      if (!records.has(key)) records.set(key, Object.freeze({ ...normalized }));
      return records.get(key);
    }

    function list() {
      return [...records.values()].map((item) => ({ ...item, status: statusOf(item) }));
    }

    function historyFor(norma) {
      const wanted = norm(norma);
      return list().filter((item) => norm(item.norma) === wanted || norm(item.normId) === wanted);
    }

    function get(norma, revision) {
      const wantedNorm = norm(norma);
      const wantedRevision = revisionKey(revision);
      return list().find((item) => (norm(item.norma) === wantedNorm || norm(item.normId) === wantedNorm) && item.revision === wantedRevision) || null;
    }

    function latestKnown(norma) {
      const history = historyFor(norma);
      return history.length ? history[history.length - 1] : null;
    }

    return Object.freeze({ register, list, historyFor, get, latestKnown, statusOf });
  }

  return { text, norm, revisionKey, versionKey, normalizeRecord, statusOf, create };
});
