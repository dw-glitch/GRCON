(function (root, factory) {
  const api = factory(root.TriagemCore || (typeof require === "function" ? require("./core.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconHistoryClassification = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";
  const VERSION = "1.0.0";
  const LABELS = Object.freeze({ FIRST_POSTING: "Primeira postagem", NEW_REVISION: "Nova revisão", REPOST: "Repostagem" });
  const text = value => String(value == null ? "" : value).trim();
  function documentKey(value) {
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[–—]/g, "-").toUpperCase().replace(/\s+/g, " ").replace(/^NT-/, "");
  }
  function revisionKey(value) { return Core.normalizeRevision(value); }
  function occurrenceId(record) { return text(record.clientRecordId || record.id || record.cloudId) || `${record.egrdtNumber}|${record.generatedAt}`; }
  function buildIndex(records, options = {}) {
    const byDocument = new Map();
    const seen = new Set();
    for (const record of records || []) {
      if (!record || record.deleted_at || record.deletedAt || !record.egrdtNumber) continue;
      if (options.workspaceId && record.workspaceId && record.workspaceId !== options.workspaceId) continue;
      for (const file of record.files || []) {
        const key = documentKey(file.document);
        if (!key) continue;
        const revision = revisionKey(file.grdtRevision || file.revision);
        // Several formats of the same document in one GRDT are one emission.
        const id = occurrenceId(record);
        const identity = JSON.stringify([id, key, revision]);
        if (seen.has(identity)) continue;
        seen.add(identity);
        if (!byDocument.has(key)) byDocument.set(key, { occurrences: [], byRevision: new Map() });
        const bucket = byDocument.get(key);
        const entry = { historyId: id, cloudId: text(record.cloudId), grdt: text(record.egrdtNumber), generatedAt: text(record.generatedAt), revision };
        bucket.occurrences.push(entry);
        if (revision) {
          if (!bucket.byRevision.has(revision)) bucket.byRevision.set(revision, []);
          bucket.byRevision.get(revision).push(entry);
        }
      }
    }
    const ordered = (a, b) => (Date.parse(a.generatedAt) || 0) - (Date.parse(b.generatedAt) || 0) || a.historyId.localeCompare(b.historyId);
    for (const bucket of byDocument.values()) {
      bucket.occurrences.sort(ordered);
      for (const entries of bucket.byRevision.values()) entries.sort(ordered);
    }
    return { byDocument, complete: options.complete !== false, workspaceId: text(options.workspaceId), source: text(options.source) || "Histórico do GRCON", version: VERSION };
  }
  function classify(document, revision, index) {
    const key = documentKey(document), rev = revisionKey(revision);
    const bucket = index.byDocument.get(key);
    const occurrences = bucket ? bucket.occurrences : [];
    const sameRevision = bucket && bucket.byRevision.get(rev) || [];
    const previous = (sameRevision.length ? sameRevision : occurrences).at(-1) || null;
    const first = sameRevision[0] || null;
    const warnings = [];
    const currentInfo = Core.revisionInfo(rev);
    if (!key || !rev || !currentInfo.valid) warnings.push("Código ou revisão não identificado; confirme a identificação documental.");
    if (!index.complete) warnings.push("Histórico compartilhado indisponível ou incompleto. A ausência nesta cópia não confirma uma primeira postagem nem uma revisão inédita.");
    if (occurrences.some(entry => !entry.revision)) warnings.push("Há emissões antigas sem revisão registrada; confirme a revisão enviada.");
    if (currentInfo.valid && occurrences.some(entry => {
      const info = Core.revisionInfo(entry.revision);
      return info.valid && info.rank > currentInfo.rank;
    })) warnings.push("Existe revisão posterior no Histórico.");
    const determinate = Boolean(key && currentInfo.valid && (sameRevision.length || index.complete && !occurrences.some(entry => !entry.revision)));
    const emissionKind = determinate ? (sameRevision.length ? "REPOST" : occurrences.length ? "NEW_REVISION" : "FIRST_POSTING") : "";
    return {
      classificationVersion: VERSION, emissionKind, classificationStatus: determinate ? "CONFIRMED" : "UNCONFIRMED",
      label: LABELS[emissionKind] || "Histórico a confirmar", documentCodeNormalized: key, revisionNormalized: rev,
      previousHistoryId: previous?.historyId || "", previousRevision: previous?.revision || "", previousGrdt: previous?.grdt || "",
      previousGeneratedAt: previous?.generatedAt || "", originalEmissionId: first?.historyId || "",
      firstEmission: first, lastEmission: sameRevision.at(-1) || null,
      occurrenceCount: sameRevision.length, repostCount: Math.max(0, sameRevision.length - 1),
      historicalDocumentCount: occurrences.length, warnings, source: index.source,
    };
  }
  function classifyPlan(plan, index) {
    const memo = new Map();
    for (const entry of plan.entries || []) {
      const identity = JSON.stringify([documentKey(entry.document), revisionKey(entry.item?.revision || entry.revision)]);
      if (!memo.has(identity)) memo.set(identity, classify(entry.document, entry.item?.revision || entry.revision, index));
      entry.historyClassification = memo.get(identity);
    }
    return plan;
  }
  return Object.freeze({ VERSION, LABELS, documentKey, revisionKey, buildIndex, classify, classifyPlan });
});
