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
    const normalized = Conference && typeof Conference.norm === "function"
      ? Conference.norm(value)
      : rawText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
    return normalized === "EM ANALISE"
      || normalized === "EM WORKFLOW"
      || normalized.startsWith("EM ANALISE ")
      || normalized.startsWith("EM WORKFLOW ");
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
    const matched = matchedRecords(row, baseRecords, Conference, baseIndex);
    if (!matched.length) return null;
    const identities = new Set(matched.map((record) => record.documentIdentity || Conference.documentIdentity(record.document)).filter(Boolean));
    if (identities.size !== 1) return null;
    const sent = Conference.normalizeRevision(row.revisionSent);
    if (!sent) return null;

    return matched
      .filter((record) => isPostedSigemStatus(record && record.status, Conference))
      .filter((record) => revisionProvesPosting(record && record.revision, sent, Conference))
      .sort((left, right) => {
        const byRevision = Conference.revisionRank(right && right.revision) - Conference.revisionRank(left && left.revision);
        if (byRevision) return byRevision;
        return Number(right && right.sourceRow || 0) - Number(left && left.sourceRow || 0);
      })[0] || null;
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

  function applyResult(result, baseRecords, Conference) {
    if (!result || !Conference || !Array.isArray(result.rows)) return result;
    const base = Array.isArray(baseRecords) ? baseRecords : [];
    if (!base.length) return result;
    const index = Conference.buildBaseIndex(base);
    let promoted = 0;
    let resolvedDivergences = 0;

    const rows = result.rows.map((row) => {
      if (!row || row.status === Conference.STATUSES.CONFIRMED) return row;
      const evidence = postingEvidence(row, base, Conference, index);
      if (!evidence) return row;
      promoted += 1;
      if (row.status === Conference.STATUSES.REVISION_DIVERGENT) resolvedDivergences += 1;
      return promotedRow(row, evidence, Conference);
    });

    if (!promoted) return result;

    const groups = Conference.aggregateByGrdt(rows);
    const summary = Conference.summarize(rows);
    const previousItems = result.state && result.state.items && typeof result.state.items === "object"
      ? result.state.items
      : {};
    const items = { ...previousItems };
    rows.forEach((row) => {
      if (!row || !row.key) return;
      items[row.key] = stateItem(row, items[row.key]);
    });
    const state = {
      ...(result.state || {}),
      version: Number(result.state && result.state.version) || 1,
      updatedAt: result.state && result.state.updatedAt || new Date().toISOString(),
      items,
    };
    const changes = {
      ...(result.changes || {}),
      newlyConfirmed: Number(result.changes && result.changes.newlyConfirmed || 0) + promoted,
      divergencesResolved: Number(result.changes && result.changes.divergencesResolved || 0) + resolvedDivergences,
      statusChanged: Number(result.changes && result.changes.statusChanged || 0) + promoted,
    };

    return { ...result, rows, groups, summary, state, changes, postingStatusPromoted: promoted };
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
    if (!original || original[MARKER]) return original;
    const wrapped = {
      ...original,
      [MARKER]: true,
      reconcile(historyRecords, baseRecords, previousState, options) {
        return applyResult(original.reconcile(historyRecords, baseRecords, previousState, options), baseRecords || [], original);
      },
      async reconcilePersisted(historyRecords, options) {
        const result = await original.reconcilePersisted(historyRecords, options);
        const base = await original.loadBase();
        const adjusted = applyResult(result, base && base.records || [], original);
        if (adjusted !== result) {
          await original.saveState(adjusted.state);
          writeHistoryIndex(adjusted.groups, base && base.meta, original);
        }
        return adjusted;
      },
      async prepareWorkbookImport(workbook, fileMeta, historyRecords, options) {
        const result = await original.prepareWorkbookImport(workbook, fileMeta, historyRecords, options);
        const records = result && result.parsed && result.parsed.records || result && result.prepared && result.prepared.base && result.prepared.base.records || [];
        const adjusted = applyResult(result, records, original);
        if (adjusted === result) return result;
        const auditEntry = adjustedAuditEntry(result.auditEntry, adjusted);
        const preparedAudit = Array.isArray(result.prepared && result.prepared.audit)
          ? result.prepared.audit.map((entry) => entry && auditEntry && entry.id === auditEntry.id ? auditEntry : entry)
          : result.prepared && result.prepared.audit;
        return {
          ...adjusted,
          auditEntry,
          prepared: {
            ...(result.prepared || {}),
            state: adjusted.state,
            groups: adjusted.groups,
            audit: preparedAudit,
          },
        };
      },
      async importWorkbook(workbook, fileMeta, historyRecords, options) {
        const result = await original.importWorkbook(workbook, fileMeta, historyRecords, options);
        const records = result && result.parsed && result.parsed.records || [];
        const adjusted = applyResult(result, records, original);
        if (adjusted === result) return result;
        await original.saveState(adjusted.state);
        writeHistoryIndex(adjusted.groups, result && result.parsed && result.parsed.meta, original);
        const auditEntry = adjustedAuditEntry(result.auditEntry, adjusted);
        if (auditEntry && typeof original.loadAudit === "function" && typeof original.saveAudit === "function") {
          const audit = await original.loadAudit();
          const nextAudit = (audit || []).map((entry) => entry && entry.id === auditEntry.id ? auditEntry : entry);
          await original.saveAudit(nextAudit);
        }
        return { ...adjusted, auditEntry };
      },
    };
    return Object.freeze(wrapped);
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
