(function (root, factory) {
  const safeRequire = (path) => {
    if (typeof require !== "function") return null;
    try { return require(path); } catch (_) { return null; }
  };
  const api = factory(root.TriagemCore || safeRequire("./core.js"), root.GrconHistory || safeRequire("./history_core.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconGrdtReissueCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core, History) {
  "use strict";

  const REQUIRED_FIELDS = Object.freeze([
    "document", "revision", "title", "fileName", "format", "discipline", "documentType", "purpose", "databook",
  ]);

  function text(value) { return String(value === null || value === undefined ? "" : value).trim(); }
  function norm(value) {
    if (Core && typeof Core.key === "function") return Core.key(value);
    if (History && typeof History.norm === "function") return History.norm(value);
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[–—]/g, "-").replace(/\s+/g, " ").toUpperCase();
  }
  function documentKeys(value) {
    if (Core && typeof Core.documentSearchKeys === "function") {
      return [...new Set(Core.documentSearchKeys(text(value)).map(norm).filter(Boolean))];
    }
    const key = norm(value).replace(/^NT-/, "");
    return key ? [key, `NT-${key}`] : [];
  }
  function sameDocument(left, right) {
    const wanted = new Set(documentKeys(left));
    return documentKeys(right).some((key) => wanted.has(key));
  }
  function parseDocuments(value) {
    const seen = new Set();
    const documents = [];
    String(value || "").split(/[\r\n;]+/).map(text).filter(Boolean).forEach((document) => {
      const key = norm(document).replace(/^NT-/, "");
      if (!key || seen.has(key)) return;
      seen.add(key);
      documents.push(document);
    });
    return documents;
  }
  function extensionFormat(fileName) {
    const match = text(fileName).match(/\.([A-Z0-9]{1,10})$/i);
    return match ? match[1].toUpperCase() : "";
  }
  function latestMatch(document, records) {
    const ordered = [...(records || [])].sort((left, right) => text(right && right.generatedAt).localeCompare(text(left && left.generatedAt)));
    for (const record of ordered) {
      const files = (record && record.files || []).filter((file) => sameDocument(file && file.document, document));
      if (files.length) return { document, record, files };
    }
    return { document, record: null, files: [] };
  }
  function itemFromFile(file) {
    const finalName = text(file && (file.finalName || file.originalName));
    return {
      document: text(file && file.document),
      revision: text(file && (file.grdtRevision || file.revision)),
      title: text(file && file.title),
      fileName: finalName,
      format: text(file && file.format),
      discipline: text(file && file.discipline),
      documentType: text(file && file.documentType),
      purpose: text(file && file.purpose),
      databook: text(file && file.databook),
    };
  }
  function missingFields(item) {
    return REQUIRED_FIELDS.filter((field) => !text(item && item[field]));
  }
  function itemErrors(item) {
    if (Core && typeof Core.validateEgrdtData === "function") {
      const errors = [...Core.validateEgrdtData(item || {})];
      if (!text(item && item.databook)) errors.push("CAMINHO DATABOOK vazio");
      return errors;
    }
    return missingFields(item).map((field) => `${field} não informado`);
  }
  function rowsForDocuments(documents, records) {
    const rows = [];
    const missingDocuments = [];
    const used = new Set();
    (documents || []).forEach((document) => {
      const match = latestMatch(document, records);
      if (!match.record) {
        missingDocuments.push(document);
        return;
      }
      match.files.forEach((file, fileIndex) => {
        const item = itemFromFile(file);
        const key = `${text(match.record.id)}|${norm(item.document)}|${norm(item.fileName)}|${fileIndex}`;
        if (used.has(key)) return;
        used.add(key);
        rows.push({
          id: key,
          requestedDocument: document,
          sourceRecordId: text(match.record.id),
          sourceEgrdt: text(match.record.egrdtNumber),
          sourceGeneratedAt: text(match.record.generatedAt),
          item,
          sourceFile: { ...file },
          missing: missingFields(item),
          errors: itemErrors(item),
        });
      });
    });
    return { rows, missingDocuments };
  }
  function updateRow(row, field, value) {
    if (!REQUIRED_FIELDS.includes(field)) return row;
    const item = { ...(row && row.item || {}), [field]: text(value) };
    return { ...row, item, missing: missingFields(item), errors: itemErrors(item) };
  }
  function groupRows(rows, limit) {
    const size = Math.max(1, Math.min(48, Number(limit) || 48));
    const buckets = new Map();
    (rows || []).forEach((row) => {
      const discipline = text(row && row.item && row.item.discipline) || "SEM DISCIPLINA";
      const key = norm(discipline);
      if (!buckets.has(key)) buckets.set(key, { discipline, rows: [] });
      buckets.get(key).rows.push(row);
    });
    const groups = [];
    [...buckets.values()].sort((a, b) => norm(a.discipline).localeCompare(norm(b.discipline), "pt-BR")).forEach((bucket) => {
      const count = Math.ceil(bucket.rows.length / size);
      for (let start = 0; start < bucket.rows.length; start += size) {
        const slice = bucket.rows.slice(start, start + size);
        groups.push({
          number: groups.length + 1,
          discipline: bucket.discipline,
          disciplineBatchNumber: Math.floor(start / size) + 1,
          disciplineBatchCount: count,
          rows: slice,
          items: slice.map((row) => ({ ...row.item })),
        });
      }
    });
    return groups;
  }
  function validateRows(rows) {
    const source = rows || [];
    return {
      valid: source.length > 0 && source.every((row) => !(row.errors || itemErrors(row.item)).length),
      rowCount: source.length,
      incomplete: source.filter((row) => (row.errors || itemErrors(row.item)).length),
    };
  }
  function sharedPersistenceStatus(records, storedRecords) {
    const ids = new Set((records || []).map((record) => text(record && (record.clientRecordId || record.id))).filter(Boolean));
    const persisted = (storedRecords || []).filter((record) => ids.has(text(record && (record.clientRecordId || record.id))));
    return {
      expected: ids.size,
      found: persisted.length,
      synced: ids.size > 0 && persisted.length === ids.size && persisted.every((record) => record.syncState === "synced" && text(record.cloudId)),
    };
  }

  return Object.freeze({
    REQUIRED_FIELDS, text, norm, documentKeys, sameDocument, parseDocuments, extensionFormat,
    latestMatch, itemFromFile, missingFields, itemErrors, rowsForDocuments, updateRow, groupRows, validateRows, sharedPersistenceStatus,
  });
});
