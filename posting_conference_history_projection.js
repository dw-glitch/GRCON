(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPostingConferenceHistoryProjection = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function text(value) {
    return String(value === null || value === undefined ? "" : value).trim();
  }

  function rawText(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function push(map, key, row) {
    const wanted = text(key);
    if (!wanted) return;
    if (!map.has(wanted)) map.set(wanted, []);
    map.get(wanted).push(row);
  }

  function build(rows, baseMeta, Conference) {
    const byHistoryId = new Map();
    const byRecordId = new Map();
    const byNumber = new Map();
    (rows || []).forEach((row) => {
      push(byHistoryId, row && row.historyId, row);
      push(byRecordId, row && row.historyRecordId, row);
      const number = Conference && typeof Conference.norm === "function"
        ? Conference.norm(row && row.egrdtNumber)
        : text(row && row.egrdtNumber).toUpperCase();
      push(byNumber, number, row);
    });
    return Object.freeze({
      byHistoryId,
      byRecordId,
      byNumber,
      baseLoaded: Boolean(baseMeta && (baseMeta.importedAt || baseMeta.fileName)),
      baseImportedAt: text(baseMeta && baseMeta.importedAt),
      baseFileName: text(baseMeta && baseMeta.fileName),
      rowCount: Array.isArray(rows) ? rows.length : 0,
    });
  }

  function rowsForRecord(index, record, Conference) {
    if (!index || !record) return [];
    const stable = text(record.clientRecordId || record.id);
    const recordId = text(record.id);
    const number = Conference && typeof Conference.norm === "function"
      ? Conference.norm(record.egrdtNumber)
      : text(record.egrdtNumber).toUpperCase();
    return index.byHistoryId.get(stable)
      || index.byHistoryId.get(recordId)
      || index.byRecordId.get(recordId)
      || index.byNumber.get(number)
      || [];
  }

  function fileRevision(file, History, Conference) {
    const raw = file && (file.grdtRevision || file.revision)
      || (History && typeof History.generatedRevision === "function" ? History.generatedRevision(file) : "");
    return Conference && typeof Conference.normalizeRevision === "function"
      ? Conference.normalizeRevision(raw)
      : text(raw).toUpperCase();
  }

  function rowForFile(index, record, file, Conference, History) {
    if (!index || !record || !file || !Conference) return null;
    const rows = rowsForRecord(index, record, Conference);
    const identity = typeof Conference.documentIdentity === "function"
      ? Conference.documentIdentity(file.document)
      : text(file.document).toUpperCase();
    const revision = fileRevision(file, History, Conference);
    return rows.find((row) => {
      const rowIdentity = row.documentIdentity || (typeof Conference.documentIdentity === "function" ? Conference.documentIdentity(row.document) : text(row.document).toUpperCase());
      const rowRevision = typeof Conference.normalizeRevision === "function" ? Conference.normalizeRevision(row.revisionSent) : text(row.revisionSent).toUpperCase();
      return rowIdentity === identity && rowRevision === revision;
    }) || null;
  }

  function sigemStatus(row) {
    if (!row || !row.currentEvidence) return "";
    const value = rawText(row.sigemStatus);
    return value.trim() ? value : "";
  }

  function statusSummary(index, record, Conference) {
    if (!index || !record) return { label: "—", title: "", values: [], baseLoaded: false };
    if (!index.baseLoaded) return { label: "—", title: "Consulta Geral não carregada", values: [], baseLoaded: false };
    const values = [];
    const seen = new Set();
    rowsForRecord(index, record, Conference).forEach((row) => {
      const raw = sigemStatus(row);
      if (!raw) return;
      const key = raw.trim();
      if (seen.has(key)) return;
      seen.add(key);
      values.push(raw);
    });
    if (!values.length) return { label: "—", title: "Nenhum Status SIGEM atual para documento/revisão confirmados", values, baseLoaded: true };
    if (values.length === 1) return { label: values[0], title: values[0], values, baseLoaded: true };
    return { label: `${values.length} valores`, title: values.join(" | "), values, baseLoaded: true };
  }

  return Object.freeze({
    text,
    rawText,
    build,
    rowsForRecord,
    rowForFile,
    fileRevision,
    sigemStatus,
    statusSummary,
  });
});
