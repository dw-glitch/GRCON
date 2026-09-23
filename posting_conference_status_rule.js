(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPostingConferenceStatusRule = api;
  if (typeof window !== "undefined" && root === window) api.install();
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const MARKER = Symbol("grconPostingConferenceStatusRule");
  let installed = false;

  function rawText(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function isPostedSigemStatus(value, Conference) {
    return Boolean(Conference && typeof Conference.isPostedSigemStatus === "function"
      ? Conference.isPostedSigemStatus(value)
      : false);
  }

  function revisionProvesPosting(foundRevision, sentRevision, Conference) {
    const found = Conference.normalizeRevision(foundRevision);
    const sent = Conference.normalizeRevision(sentRevision);
    if (!found || !sent) return false;
    if (found === sent) return true;
    const foundRank = Conference.revisionRank(found);
    const sentRank = Conference.revisionRank(sent);
    return foundRank >= 0 && sentRank >= 0 && foundRank > sentRank;
  }

  function matchedRecords(row, baseRecords, Conference, baseIndex) {
    if (!row || !Conference || !Array.isArray(baseRecords) || !baseRecords.length) return [];
    const index = baseIndex || Conference.buildBaseIndex(baseRecords);
    const positions = new Set();
    const searchKeys = Array.isArray(row.searchKeys) && row.searchKeys.length
      ? row.searchKeys
      : Conference.documentKeys(row.document);
    searchKeys.forEach((searchKey) => {
      (index.get(Conference.norm(searchKey)) || []).forEach((position) => positions.add(position));
    });
    return [...positions].map((position) => baseRecords[position]).filter(Boolean);
  }

  function postingEvidence(row, baseRecords, Conference, baseIndex) {
    if (!Conference || typeof Conference.resolvePostingEvidence !== "function") return null;
    const matched = matchedRecords(row, baseRecords, Conference, baseIndex);
    const resolved = Conference.resolvePostingEvidence(row, matched);
    return resolved && resolved.currentEvidence ? resolved.evidence : null;
  }

  function promotedRow(row, evidence, Conference) {
    const sent = Conference.normalizeRevision(row.revisionSent);
    const found = Conference.normalizeRevision(evidence.revision);
    const rawStatus = rawText(evidence.status).trim() || "Em análise";
    const now = row.lastCheckedAt || new Date().toISOString();
    const sameRevision = found === sent;
    const note = sameRevision
      ? `Status SIGEM "${rawStatus}" localizado para a revisão ${sent}; esta situação comprova que a postagem já entrou no fluxo do SIGEM.`
      : `Status SIGEM "${rawStatus}" localizado na revisão ${found}. Como é uma revisão posterior à ${sent}, a postagem da revisão ${sent} é considerada realizada.`;

    return {
      ...row,
      status: Conference.STATUSES.CONFIRMED,
      statusLabel: Conference.statusLabel(Conference.STATUSES.CONFIRMED),
      revisionFound: found || sent,
      firstConfirmedAt: row.firstConfirmedAt || now,
      confirmedRevision: sent,
      confirmationSource: `Consulta Geral SIGEM — ${rawStatus}`,
      currentEvidence: true,
      historicalPreserved: false,
      note,
      postingEvidenceStatus: rawStatus,
      postingEvidenceRevision: found,
    };
  }

  function stateItem(row, previous) {
    return {
      ...(previous || {}),
      firstConfirmedAt: row.firstConfirmedAt,
      confirmedRevision: row.confirmedRevision,
      confirmationSource: row.confirmationSource,
      lastCheckedAt: row.lastCheckedAt,
      lastStatus: row.status,
      lastFoundRevisions: row.revisionsFound,
      lastEgrdtNumber: row.egrdtNumber,
      lastDocument: row.document,
      lastRevisionSent: row.revisionSent,
    };
  }

  function applyResult(result) {
    // Compatibility facade only. The core is the single source of truth for
    // posting evidence and status; this layer must never promote/downgrade.
    return result;
  }

  function writeHistoryIndex(groups, baseMeta, Conference) {
    if (!Conference || !Conference.HISTORY_INDEX_KEY) return false;
    let storage = null;
    try { storage = typeof localStorage !== "undefined" ? localStorage : null; } catch (_) { storage = null; }
    if (!storage) return false;
    const byId = {};
    const byNumber = {};
    (groups || []).forEach((group) => {
      const compact = {
        historyId: group.historyId,
        egrdtNumber: group.egrdtNumber,
        status: group.status,
        total: group.total,
        confirmed: group.confirmed,
        awaiting: group.awaiting,
        divergent: group.divergent,
        notFound: group.notFound,
        review: group.review,
        updatedAt: new Date().toISOString(),
      };
      if (group.historyId) byId[group.historyId] = compact;
      if (group.egrdtNumber) byNumber[Conference.norm(group.egrdtNumber)] = compact;
    });
    try {
      storage.setItem(Conference.HISTORY_INDEX_KEY, JSON.stringify({
        byId,
        byNumber,
        baseUpdatedAt: rawText(baseMeta && baseMeta.importedAt).trim(),
        savedAt: new Date().toISOString(),
      }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function adjustedAuditEntry(entry, adjusted) {
    if (!entry || !adjusted) return entry;
    return {
      ...entry,
      newConfirmed: Number(adjusted.changes && adjusted.changes.newlyConfirmed || 0),
      divergencesResolved: Number(adjusted.changes && adjusted.changes.divergencesResolved || 0),
      pending: Number(adjusted.summary && adjusted.summary.awaiting || 0) + Number(adjusted.summary && adjusted.summary.notFound || 0),
    };
  }

  function wrapConference(original) {
    // Keep the historical module contract without adding a second decision engine.
    return original;
  }

  function install() {
    if (installed) return;
    installed = true;
    const previous = Object.getOwnPropertyDescriptor(root, "GrconPostingConference");
    let localValue = previous && Object.prototype.hasOwnProperty.call(previous, "value") ? previous.value : root.GrconPostingConference;
    if (!previous || previous.configurable) {
      if (!previous || !previous.get) localValue = wrapConference(localValue);
      Object.defineProperty(root, "GrconPostingConference", {
        configurable: true,
        enumerable: true,
        get() {
          const value = previous && previous.get ? previous.get.call(root) : localValue;
          return wrapConference(value);
        },
        set(next) {
          const wrapped = wrapConference(next);
          if (previous && previous.set) previous.set.call(root, wrapped);
          else localValue = wrapped;
        },
      });
      return;
    }
    if (root.GrconPostingConference && previous.writable) root.GrconPostingConference = wrapConference(root.GrconPostingConference);
  }

  return Object.freeze({
    install,
    wrapConference,
    applyResult,
    postingEvidence,
    isPostedSigemStatus,
    revisionProvesPosting,
  });
});
