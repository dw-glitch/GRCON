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
    const index = new Map();
    const ordered = [...(records || [])].sort((left, right) => text(right && right.generatedAt).localeCompare(text(left && left.generatedAt)));
    ordered.forEach((record) => {
      const grouped = new Map();
      (record && record.files || []).forEach((file) => {
        documentKeys(file && file.document).forEach((key) => {
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(file);
        });
      });
      grouped.forEach((files, key) => {
        if (!index.has(key)) index.set(key, { record, files });
      });
    });
    return index;
  }

  function latestMatch(document, recordsOrIndex) {
    const index = recordsOrIndex instanceof Map ? recordsOrIndex : buildLatestIndex(recordsOrIndex);
    for (const key of documentKeys(document)) {
      const match = index.get(key);
      if (match) return { document, record: match.record, files: match.files };
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

  function fieldForError(message) {
    const value = norm(message);
    if (value.startsWith("DOCUMENTO")) return "document";
    if (value.startsWith("REVISAO")) return "revision";
    if (value.startsWith("TITULO")) return "title";
    if (value.startsWith("ARQUIVO")) return "fileName";
    if (value.startsWith("FORMATO")) return "format";
    if (value.startsWith("DISCIPLINA")) return "discipline";
    if (value.startsWith("TIPO DE DOCUMENTO")) return "documentType";
    if (value.startsWith("PROPOSITO")) return "purpose";
    if (value.startsWith("CAMINHO DATABOOK")) return "databook";
    return "";
  }

  function validationState(item, sourceFile) {
    const errors = Core && typeof Core.validateEgrdtData === "function"
      ? [...Core.validateEgrdtData(item || {})]
      : missingFields(item).map((field) => `${field} não informado`);
    if (!text(item && item.databook)) errors.push("CAMINHO DATABOOK vazio");

    const originalName = text(sourceFile && (sourceFile.originalName || sourceFile.finalName)) || text(item && item.fileName);
    if (Core && typeof Core.validateFinalFileName === "function" && text(item && item.fileName) && text(item && item.document) && text(item && item.revision)) {
      const fileCheck = Core.validateFinalFileName(
        item.fileName,
        originalName,
        item.document,
        item.revision,
        text(sourceFile && sourceFile.sheet),
      );
      if (!fileCheck.valid) fileCheck.errors.forEach((error) => errors.push(`ARQUIVO: ${error}`));
    }

    const unique = [...new Set(errors.map(text).filter(Boolean))];
    const fieldErrors = Object.fromEntries(REQUIRED_FIELDS.map((field) => [field, []]));
    unique.forEach((error) => {
      const field = fieldForError(error);
      if (field) fieldErrors[field].push(error.replace(/^ARQUIVO:\s*/i, ""));
    });
    return { errors: unique, fieldErrors };
  }

  function itemErrors(item, sourceFile) {
    return validationState(item, sourceFile).errors;
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
        const validation = validationState(item, file);
        rows.push({
          id: key,
          requestedDocument: document,
          sourceRecordId: text(match.record.id),
          sourceEgrdt: text(match.record.egrdtNumber),
          sourceGeneratedAt: text(match.record.generatedAt),
          item,
          sourceFile: { ...file },
          fileNameAuto: true,
          missing: missingFields(item),
          errors: validation.errors,
          fieldErrors: validation.fieldErrors,
        });
      });
    });
    return { rows, missingDocuments };
  }

  function updateRow(row, field, value) {
    if (!REQUIRED_FIELDS.includes(field)) return row;
    const previous = row && row.item || {};
    const item = { ...previous };
    let fileNameAuto = row && row.fileNameAuto !== false;
    if (field === "revision") {
      const raw = text(value);
      const normalized = Core && typeof Core.normalizeRevision === "function" ? Core.normalizeRevision(raw) : raw;
      item.revision = normalized || raw;
      if (fileNameAuto && Core && typeof Core.proposedFileName === "function") {
        const sourceName = text(row && row.sourceFile && (row.sourceFile.originalName || row.sourceFile.finalName)) || text(previous.fileName);
        item.fileName = Core.proposedFileName(
          sourceName,
          item.document,
          item.revision,
          text(row && row.sourceFile && row.sourceFile.sheet),
        );
      }
    } else {
      item[field] = text(value);
      if (field === "fileName") fileNameAuto = false;
    }
    const validation = validationState(item, row && row.sourceFile);
    return {
      ...row,
      item,
      fileNameAuto,
      missing: missingFields(item),
      errors: validation.errors,
      fieldErrors: validation.fieldErrors,
    };
  }

  function groupRows(rows, options) {
    if (!Emission || typeof Emission.groupEgrdtRows !== "function") {
      throw new Error("Motor compartilhado de loteamento de eGRDT indisponível.");
    }
    return Emission.groupEgrdtRows(rows, typeof options === "number" ? { limit: options, mode: "discipline" } : options);
  }

  function validateRows(rows) {
    const source = rows || [];
    const normalized = source.map((row) => {
      const validation = validationState(row && row.item, row && row.sourceFile);
      return row && row.errors && row.fieldErrors ? row : { ...row, errors: validation.errors, fieldErrors: validation.fieldErrors };
    });
    return {
      valid: normalized.length > 0 && normalized.every((row) => !(row.errors || []).length),
      rowCount: normalized.length,
      incomplete: normalized.filter((row) => (row.errors || []).length),
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
    buildLatestIndex, latestMatch, itemFromFile, missingFields, fieldForError, validationState, itemErrors, rowsForDocuments, updateRow, groupRows, validateRows, sharedPersistenceStatus,
  });
});
