(function (root, factory) {
  const api = factory(root.TriagemCore || (typeof module === "object" && module.exports ? require("./core.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconHistoryClassification = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (C) {
  "use strict";

  const KINDS = Object.freeze({
    FIRST_POSTING: "FIRST_POSTING",
    NEW_REVISION: "NEW_REVISION",
    REPOST: "REPOST",
  });

  function text(value) {
    return String(value === null || value === undefined ? "" : value).trim();
  }

  function normalizeDocument(value) {
    if (C && typeof C.key === "function") return C.key(value);
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  }

  function normalizeRevision(value) {
    if (C && typeof C.normalizeRevision === "function") return C.normalizeRevision(value);
    return text(value).toUpperCase().replace(/^REV(?:ISAO)?\.?\s*/i, "").replace(/\s+/g, "");
  }

  function revisionRank(value) {
    if (C && typeof C.revisionRank === "function") return C.revisionRank(value);
    const revision = normalizeRevision(value);
    if (revision === "0") return 0;
    if (/^[A-Z]+$/.test(revision)) {
      let rank = 0;
      for (const ch of revision) rank = rank * 26 + ch.charCodeAt(0) - 64;
      return rank * 1000;
    }
    return -1;
  }

  function occurrenceDate(value) {
    const stamp = Date.parse(text(value));
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function occurrenceKey(record, file, revision) {
    return [
      text(record && (record.clientRecordId || record.id)),
      normalizeDocument(file && file.document),
      normalizeRevision(revision),
    ].join("::");
  }

  function buildHistoryIndex(records) {
    const byDocument = new Map();
    const seen = new Set();

    (records || []).forEach((record) => {
      (record && Array.isArray(record.files) ? record.files : []).forEach((file, fileIndex) => {
        const document = normalizeDocument(file && file.document);
        const revision = normalizeRevision(file && (file.grdtRevision || file.revision));
        if (!document || !revision) return;
        const dedupeKey = occurrenceKey(record, file, revision);
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);

        const occurrence = Object.freeze({
          historyId: text(record && (record.clientRecordId || record.id)),
          cloudId: text(record && record.cloudId),
          egrdtNumber: text(record && record.egrdtNumber),
          generatedAt: text(record && record.generatedAt),
          generatedAtMs: occurrenceDate(record && record.generatedAt),
          document: text(file && file.document),
          documentNormalized: document,
          revision: text(file && (file.grdtRevision || file.revision)),
          revisionNormalized: revision,
          fileIndex,
          outputType: text(record && record.outputType),
        });
        if (!byDocument.has(document)) byDocument.set(document, []);
        byDocument.get(document).push(occurrence);
      });
    });

    byDocument.forEach((items) => items.sort((a, b) => (
      a.generatedAtMs - b.generatedAtMs
      || a.egrdtNumber.localeCompare(b.egrdtNumber, "pt-BR")
      || a.fileIndex - b.fileIndex
    )));
    return byDocument;
  }

  function emptyResult(document, revision) {
    return {
      document: text(document),
      revision: text(revision),
      documentNormalized: normalizeDocument(document),
      revisionNormalized: normalizeRevision(revision),
      emissionKind: KINDS.FIRST_POSTING,
      label: "Primeira postagem",
      statusLabel: "Pronto para postagem",
      previousHistoryId: "",
      previousRevision: "",
      previousGrdt: "",
      previousDate: "",
      originalEmissionId: "",
      firstEmission: null,
      lastEmission: null,
      occurrenceCount: 0,
      repostCount: 0,
      warnings: [],
      timeline: [],
    };
  }

  function classifyOne(document, revision, historyIndex) {
    const result = emptyResult(document, revision);
    const documentOccurrences = historyIndex instanceof Map
      ? historyIndex.get(result.documentNormalized) || []
      : [];
    if (!documentOccurrences.length) return result;

    const exact = documentOccurrences.filter((item) => item.revisionNormalized === result.revisionNormalized);
    const firstDocumentOccurrence = documentOccurrences[0] || null;
    const lastDocumentOccurrence = documentOccurrences[documentOccurrences.length - 1] || null;

    if (exact.length) {
      const first = exact[0];
      const last = exact[exact.length - 1];
      return {
        ...result,
        emissionKind: KINDS.REPOST,
        label: "Repostagem",
        statusLabel: "Esta mesma revisão já foi emitida anteriormente.",
        previousHistoryId: last.historyId,
        previousRevision: last.revision,
        previousGrdt: last.egrdtNumber,
        previousDate: last.generatedAt,
        originalEmissionId: first.historyId,
        firstEmission: first,
        lastEmission: last,
        occurrenceCount: exact.length,
        repostCount: Math.max(0, exact.length - 1),
        timeline: exact,
      };
    }

    const warnings = [];
    const currentRank = revisionRank(result.revisionNormalized);
    if (currentRank >= 0) {
      const later = documentOccurrences.filter((item) => {
        const rank = revisionRank(item.revisionNormalized);
        return rank >= 0 && rank > currentRank;
      });
      if (later.length) warnings.push("Existe revisão posterior no Histórico.");
    }

    return {
      ...result,
      emissionKind: KINDS.NEW_REVISION,
      label: "Nova revisão",
      statusLabel: "Pronto para postagem",
      previousHistoryId: lastDocumentOccurrence && lastDocumentOccurrence.historyId || "",
      previousRevision: lastDocumentOccurrence && lastDocumentOccurrence.revision || "",
      previousGrdt: lastDocumentOccurrence && lastDocumentOccurrence.egrdtNumber || "",
      previousDate: lastDocumentOccurrence && lastDocumentOccurrence.generatedAt || "",
      originalEmissionId: firstDocumentOccurrence && firstDocumentOccurrence.historyId || "",
      firstEmission: firstDocumentOccurrence,
      lastEmission: lastDocumentOccurrence,
      occurrenceCount: documentOccurrences.length,
      repostCount: 0,
      warnings,
      timeline: documentOccurrences,
    };
  }

  function summarize(classifications) {
    const source = classifications || [];
    const summary = {
      total: source.length,
      firstPosting: 0,
      newRevision: 0,
      repost: 0,
      attention: 0,
      posting: 0,
    };
    source.forEach((item) => {
      if (item.emissionKind === KINDS.FIRST_POSTING) summary.firstPosting += 1;
      if (item.emissionKind === KINDS.NEW_REVISION) summary.newRevision += 1;
      if (item.emissionKind === KINDS.REPOST) summary.repost += 1;
      if (item.emissionKind !== KINDS.REPOST) summary.posting += 1;
      if ((item.warnings || []).length) summary.attention += 1;
    });
    return summary;
  }

  function classifyRows(rows, recordsOrIndex) {
    const historyIndex = recordsOrIndex instanceof Map ? recordsOrIndex : buildHistoryIndex(recordsOrIndex);
    const classifications = (rows || []).map((row) => classifyOne(
      row && row.document,
      row && (row.revision || row.egrdt && row.egrdt.revision),
      historyIndex,
    ));
    const annotatedRows = (rows || []).map((row, index) => {
      const classification = classifications[index];
      return {
        ...row,
        emissionKind: classification.emissionKind,
        historyClassification: classification,
        historyClassificationWarning: (classification.warnings || []).join(" "),
      };
    });
    return {
      rows: annotatedRows,
      classifications,
      summary: summarize(classifications),
      historyIndex,
    };
  }

  function postingGroup(value) {
    return text(value && value.emissionKind || value).toUpperCase() === KINDS.REPOST ? "REPOST" : "POSTING";
  }

  return Object.freeze({
    KINDS,
    normalizeDocument,
    normalizeRevision,
    revisionRank,
    buildHistoryIndex,
    classifyOne,
    classifyRows,
    summarize,
    postingGroup,
  });
});
