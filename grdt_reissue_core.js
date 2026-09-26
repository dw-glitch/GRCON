(function (root, factory) {
  const safeRequire = (path) => {
    if (typeof require !== "function") return null;
    try { return require(path); } catch (_) { return null; }
  };
  const api = factory(
    root.TriagemCore || safeRequire("./core.js"),
    root.GrconHistory || safeRequire("./history_core.js"),
    root.GrconEmission || safeRequire("./emission.js")
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconGrdtReissueCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core, History, Emission) {
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

  function buildLatestIndex(records) {
    const index = new Map();
    (records || []).forEach((record) => {
      const generatedAt = text(record && record.generatedAt);
      (record && record.files || []).forEach((file) => {
        documentKeys(file && file.document).forEach((key) => {
          const current = index.get(key);
          const currentAt = text(current && current.record && current.record.generatedAt);
          if (!current || generatedAt > currentAt) {
            index.set(key, { record, file });
          }
        });
      });
    });
    return index;
  }

  function latestMatch(document, records, latestIndex) {
    const index = latestIndex instanceof Map ? latestIndex : buildLatestIndex(records);
    const candidates = documentKeys(document).map((key) => index.get(key)).filter(Boolean);
    const newest = candidates.reduce((best, candidate) => {
      if (!best) return candidate;
      return text(candidate.record && candidate.record.generatedAt) > text(best.record && best.record.generatedAt) ? candidate : best;
    }, null);
    if (!newest || !newest.record) return { document, record: null, files: [] };
    const files = (newest.record.files || []).filter((file) => sameDocument(file && file.document, document));
    return { document, record: newest.record, files };
  }

  function itemFromFile(file) {
    const finalName = text(file && (file.finalName || file.originalName));
    const revision = Core && typeof Core.normalizeRevision === "function"
      ? Core.normalizeRevision(file && (file.grdtRevision || file.revision))
      : text(file && (file.grdtRevision || file.revision));
    return {
      document: text(file && file.document),
      revision,
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

  function fieldErrors(item, sourceFile) {
    const value = item || {};
    const source = sourceFile || {};
    const errors = {};
    REQUIRED_FIELDS.forEach((field) => {
      if (!text(value[field])) errors[field] = ["Campo obrigatório."];
    });
    if (text(value.revision) && Core && typeof Core.revisionInfo === "function" && !Core.revisionInfo(value.revision).valid) {
      errors.revision = [...(errors.revision || []), "Revisão inválida."];
    }
    if (text(value.fileName) && Core && typeof Core.validateFinalFileName === "function") {
      const originalName = text(source.originalName || source.finalName || value.fileName);
      const check = Core.validateFinalFileName(value.fileName, originalName, value.document, value.revision, source.sheet);
      if (!check.valid) errors.fileName = [...(errors.fileName || []), ...check.errors, `Esperado: ${check.expected}`].filter(Boolean);
    }
    const optionMap = {
      format: Core && Core.EGRDT_OPTIONS && Core.EGRDT_OPTIONS.formats,
      discipline: Core && Core.EGRDT_OPTIONS && Core.EGRDT_OPTIONS.disciplines,
      documentType: Core && Core.EGRDT_OPTIONS && Core.EGRDT_OPTIONS.documentTypes,
      purpose: Core && Core.EGRDT_OPTIONS && Core.EGRDT_OPTIONS.purposes,
    };
    Object.entries(optionMap).forEach(([field, options]) => {
      if (!text(value[field]) || !Array.isArray(options) || !options.length) return;
      if (!options.includes(value[field])) errors[field] = [...(errors[field] || []), "Valor fora da lista oficial da eGRDT."];
    });
    return errors;
  }

  function itemErrors(item, sourceFile) {
    const errors = [];
    if (Core && typeof Core.validateEgrdtData === "function") errors.push(...Core.validateEgrdtData(item || {}));
    else missingFields(item).forEach((field) => errors.push(`${field} não informado`));
    if (!text(item && item.databook)) errors.push("CAMINHO DATABOOK vazio");
    Object.values(fieldErrors(item, sourceFile)).flat().forEach((message) => errors.push(message));
    return [...new Set(errors.filter(Boolean))];
  }

  function decorateRow(row) {
    const item = row && row.item || {};
    const perField = fieldErrors(item, row && row.sourceFile);
    return {
      ...row,
      missing: missingFields(item),
      fieldErrors: perField,
      errors: itemErrors(item, row && row.sourceFile),
    };
  }

  function rowsForDocuments(documents, records) {
    const rows = [];
    const missingDocuments = [];
    const used = new Set();
    const latestIndex = buildLatestIndex(records);
    (documents || []).forEach((document) => {
      const match = latestMatch(document, records, latestIndex);
      if (!match.record) {
        missingDocuments.push(document);
        return;
      }
      match.files.forEach((file, fileIndex) => {
        const item = itemFromFile(file);
        const key = `${text(match.record.id)}|${norm(item.document)}|${norm(item.fileName)}|${fileIndex}`;
        if (used.has(key)) return;
        used.add(key);
        rows.push(decorateRow({
          id: key,
          requestedDocument: document,
          sourceRecordId: text(match.record.id),
          sourceEgrdt: text(match.record.egrdtNumber),
          sourceGeneratedAt: text(match.record.generatedAt),
          item,
          sourceFile: { ...file },
        }));
      });
    });
    return { rows, missingDocuments };
  }

  function updateRow(row, field, value) {
    if (!REQUIRED_FIELDS.includes(field)) return row;
    const item = { ...(row && row.item || {}) };
    if (field === "revision") {
      item.revision = Core && typeof Core.normalizeRevision === "function" ? Core.normalizeRevision(value) : text(value);
      if (Core && typeof Core.proposedFileName === "function") {
        const source = row && row.sourceFile || {};
        const originalName = text(source.originalName || source.finalName || item.fileName);
        item.fileName = Core.proposedFileName(originalName, item.document, item.revision, source.sheet);
      }
    } else {
      item[field] = text(value);
    }
    return decorateRow({ ...row, item });
  }

  function groupRows(rows, limit, mode) {
    if (!Emission || typeof Emission.splitPlan !== "function") throw new Error("Motor de distribuição das eGRDTs indisponível.");
    const source = rows || [];
    const entries = source.map((row, index) => ({
      rowIndex: index,
      document: text(row && row.item && row.item.document),
      revision: text(row && row.item && row.item.revision),
      finalName: text(row && row.item && row.item.fileName),
      item: { ...(row && row.item || {}) },
    }));
    const groups = Emission.splitPlan({ entries, items: entries.map((entry) => entry.item) }, limit, mode);
    return groups.map((group) => ({
      ...group,
      rows: (group.originalIndices || []).map((index) => source[index]).filter(Boolean),
      items: group.items.map((item) => ({ ...item })),
    }));
  }

  function validateRows(rows) {
    const source = rows || [];
    return {
      valid: source.length > 0 && source.every((row) => !(row.errors || itemErrors(row.item, row.sourceFile)).length),
      rowCount: source.length,
      incomplete: source.filter((row) => (row.errors || itemErrors(row.item, row.sourceFile)).length),
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
    buildLatestIndex, latestMatch, itemFromFile, missingFields, fieldErrors, itemErrors, decorateRow,
    rowsForDocuments, updateRow, groupRows, validateRows, sharedPersistenceStatus,
  });
});
