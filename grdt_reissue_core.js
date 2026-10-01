(function (root, factory) {
  const safeRequire = (path) => {
    if (typeof require !== "function") return null;
    try { return require(path); } catch (_) { return null; }
  };
  const api = factory(root.TriagemCore || safeRequire("./core.js"), root.GrconHistory || safeRequire("./history_core.js"), root.GrconEmission || safeRequire("./emission.js"));
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
    const ordered = [...(records || [])].sort((left, right) => text(right && right.generatedAt).localeCompare(text(left && left.generatedAt)));
    const byDocumentKey = new Map();
    ordered.forEach((record) => {
      (record && record.files || []).forEach((file) => {
        documentKeys(file && file.document).forEach((key) => {
          if (!byDocumentKey.has(key)) byDocumentKey.set(key, record);
        });
      });
    });
    return { byDocumentKey, recordCount: ordered.length };
  }
  function latestMatch(document, recordsOrIndex) {
    const index = recordsOrIndex && recordsOrIndex.byDocumentKey instanceof Map
      ? recordsOrIndex
      : buildLatestIndex(recordsOrIndex);
    const record = documentKeys(document).map((key) => index.byDocumentKey.get(key)).find(Boolean) || null;
    if (!record) return { document, record: null, files: [] };
    const files = (record.files || []).filter((file) => sameDocument(file && file.document, document));
    return { document, record, files };
  }
  function itemFromFile(file) {
    const finalName = text(file && (file.finalName || file.originalName));
    return {
      document: text(file && file.document),
      revision: Core && typeof Core.normalizeRevision === "function" ? Core.normalizeRevision(file && (file.grdtRevision || file.revision)) : norm(file && (file.grdtRevision || file.revision)),
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
  function addFieldError(target, field, message) {
    if (!target[field]) target[field] = [];
    if (!target[field].includes(message)) target[field].push(message);
  }
  function fieldErrors(item, sourceFile) {
    const result = {};
    missingFields(item).forEach((field) => addFieldError(result, field, `${field} não informado`));
    const official = Core && typeof Core.validateEgrdtData === "function" ? Core.validateEgrdtData(item || {}) : [];
    const mappings = [
      [/^DOCUMENTO/i, "document"],
      [/^REVISÃO/i, "revision"],
      [/^TÍTULO/i, "title"],
      [/^ARQUIVO/i, "fileName"],
      [/^FORMATO/i, "format"],
      [/^DISCIPLINA/i, "discipline"],
      [/^TIPO DE DOCUMENTO/i, "documentType"],
      [/^PROPÓSITO/i, "purpose"],
    ];
    (official || []).forEach((message) => {
      const mapped = mappings.find(([pattern]) => pattern.test(message));
      addFieldError(result, mapped ? mapped[1] : "document", message);
    });
    // emission.js torna PROPÓSITO informativo na geração normal. Na Repostagem,
    // porém, um valor antigo não padronizado precisa ser confirmado pelo operador:
    // não podemos replicar silenciosamente um propósito que não existe no modelo.
    const allowedPurposes = Core && Core.EGRDT_OPTIONS && Array.isArray(Core.EGRDT_OPTIONS.purposes)
      ? Core.EGRDT_OPTIONS.purposes
      : [];
    if (text(item && item.purpose) && allowedPurposes.length && !allowedPurposes.includes(text(item.purpose))) {
      addFieldError(result, "purpose", "PROPÓSITO fora da lista oficial");
    }
    if (!text(item && item.databook)) addFieldError(result, "databook", "CAMINHO DATABOOK vazio");
    if (text(item && item.fileName) && text(item && item.document) && text(item && item.revision)
        && Core && typeof Core.proposedFileName === "function") {
      const origin = text(sourceFile && (sourceFile.originalName || sourceFile.finalName)) || text(item.fileName);
      const expected = Core.proposedFileName(origin, item.document, item.revision, sourceFile && sourceFile.sheet);
      const same = Core && typeof Core.key === "function"
        ? Core.key(item.fileName) === Core.key(expected)
        : norm(item.fileName) === norm(expected);
      if (!same) addFieldError(result, "fileName", `ARQUIVO incompatível com a revisão ${item.revision}; esperado ${expected}`);
    }
    return result;
  }
  function itemErrors(item, sourceFile) {
    return [...new Set(Object.values(fieldErrors(item, sourceFile)).flat())];
  }
  function rowsForDocuments(documents, records) {
    const rows = [];
    const missingDocuments = [];
    const used = new Set();
    const latestIndex = buildLatestIndex(records);
    (documents || []).forEach((document) => {
      const match = latestMatch(document, latestIndex);
      if (!match.record) {
        missingDocuments.push(document);
        return;
      }
      match.files.forEach((file, fileIndex) => {
        const item = itemFromFile(file);
        const key = `${text(match.record.id)}|${norm(item.document)}|${norm(item.fileName)}|${fileIndex}`;
        if (used.has(key)) return;
        used.add(key);
        const errorsByField = fieldErrors(item, file);
        rows.push({
          id: key,
          requestedDocument: document,
          sourceRecordId: text(match.record.id),
          sourceEgrdt: text(match.record.egrdtNumber),
          sourceGeneratedAt: text(match.record.generatedAt),
          item,
          sourceFile: { ...file },
          missing: missingFields(item),
          fieldErrors: errorsByField,
          errors: [...new Set(Object.values(errorsByField).flat())],
        });
      });
    });
    return { rows, missingDocuments };
  }
  function updateRow(row, field, value) {
    if (!REQUIRED_FIELDS.includes(field)) return row;
    const nextValue = field === "revision" && Core && typeof Core.normalizeRevision === "function"
      ? Core.normalizeRevision(value)
      : text(value);
    const item = { ...(row && row.item || {}), [field]: nextValue };
    if (field === "revision" && nextValue && Core && typeof Core.proposedFileName === "function") {
      const sourceFile = row && row.sourceFile || {};
      const origin = text(sourceFile.originalName || sourceFile.finalName) || text(item.fileName);
      item.fileName = Core.proposedFileName(origin, item.document, nextValue, sourceFile.sheet);
    }
    const errorsByField = fieldErrors(item, row && row.sourceFile);
    return {
      ...row,
      item,
      missing: missingFields(item),
      fieldErrors: errorsByField,
      errors: [...new Set(Object.values(errorsByField).flat())],
    };
  }
  function normalizeBatchMode(value) {
    if (Emission && typeof Emission.normalizeBatchMode === "function") return Emission.normalizeBatchMode(value);
    return text(value).toLowerCase() === "limit-only" ? "limit-only" : "discipline";
  }
  function groupRows(rows, limit, mode) {
    if (!Emission || typeof Emission.splitPlan !== "function") {
      throw new Error("O motor compartilhado de loteamento da eGRDT não foi carregado.");
    }
    const source = rows || [];
    const plan = {
      entries: source.map((row, rowIndex) => ({
        rowIndex,
        document: text(row && row.item && row.item.document),
        item: { ...(row && row.item || {}) },
        reissueRow: row,
        normativeValidation: typeof globalThis !== "undefined" && globalThis.GrconDocumentaryCompliance
          ? globalThis.GrconDocumentaryCompliance.auditRow(row, row.item) : null,
      })),
    };
    return Emission.splitPlan(plan, limit, normalizeBatchMode(mode)).map((group) => ({
      ...group,
      rows: group.entries.map((entry) => entry.reissueRow),
      items: group.entries.map((entry) => ({ ...entry.item })),
    }));
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
    buildLatestIndex, latestMatch, itemFromFile, missingFields, fieldErrors, itemErrors, rowsForDocuments, updateRow, normalizeBatchMode, groupRows, validateRows, sharedPersistenceStatus,
  });
});
