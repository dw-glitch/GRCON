(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPostingConferenceRefinement = api;
  if (typeof window !== "undefined" && root === window) api.install();
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const MARKER = Symbol("grconPostingConferenceRefined");
  const PAGE_SIZE = 80;
  let installed = false;
  let decorating = false;
  let decorationQueued = false;
  let moduleObserver = null;

  function rawText(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function trimmed(value) {
    return rawText(value).trim();
  }

  function conferenceLabel(status, Conference) {
    const S = Conference && Conference.STATUSES || {};
    if (status === S.CONFIRMED) return "Postado";
    if (status === S.AWAITING || status === S.NOT_FOUND) return "Não postado ainda";
    return Conference && typeof Conference.statusLabel === "function"
      ? Conference.statusLabel(status)
      : trimmed(status) || "Não verificado";
  }

  function matchedBaseRecords(row, baseRecords, Conference, baseIndex) {
    if (!row || !Conference || !Array.isArray(baseRecords) || !baseRecords.length) return [];
    const index = baseIndex || Conference.buildBaseIndex(baseRecords);
    const positions = new Set();
    (row.searchKeys || Conference.documentKeys(row.document) || []).forEach((searchKey) => {
      (index.get(Conference.norm(searchKey)) || []).forEach((position) => positions.add(position));
    });
    return [...positions].map((position) => baseRecords[position]).filter(Boolean);
  }

  function parseSourceDate(value) {
    const source = trimmed(value);
    const br = source.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (br) {
      const [, d, m, y, h = "0", min = "0", s = "0"] = br;
      const time = Date.UTC(+y, +m - 1, +d, +h, +min, +s);
      const date = new Date(time);
      return date.getUTCFullYear() === +y && date.getUTCMonth() === +m - 1
        && date.getUTCDate() === +d && +h < 24 && +min < 60 && +s < 60 ? time : NaN;
    }
    return /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(source) ? Date.parse(source) : NaN;
  }

  function statusRecordTimestamp(record) {
    const values = [record && record.modifiedAt, record && record.includedAt]
      .map(parseSourceDate)
      .filter(Number.isFinite);
    return values.length ? Math.max(...values) : Number.NEGATIVE_INFINITY;
  }

  function currentStatusRecord(row, baseRecords, Conference, baseIndex) {
    const matched = matchedBaseRecords(row, baseRecords, Conference, baseIndex);
    if (!matched.length) return null;
    const identities = new Set(matched.map((record) => record.documentIdentity || Conference.documentIdentity(record.document)));
    if (identities.size !== 1) return null;
    const exact = matched.filter((record) => Conference.normalizeRevision(record.revision) === Conference.normalizeRevision(row.revisionSent));
    const candidates = exact.length ? exact : matched;
    const ordered = candidates.slice().sort((left, right) => {
      const byDate = statusRecordTimestamp(right) - statusRecordTimestamp(left);
      if (byDate) return byDate;
      return Conference.revisionRank(right && right.revision) - Conference.revisionRank(left && left.revision);
    });
    const selected = ordered[0];
    const tied = ordered.filter((record) => statusRecordTimestamp(record) === statusRecordTimestamp(selected)
      && Conference.normalizeRevision(record.revision) === Conference.normalizeRevision(selected.revision));
    if (new Set(tied.map((record) => rawText(record.status))).size > 1) return null;
    return selected || null;
  }

  function enrichRows(rows, baseRecords, Conference) {
    const base = Array.isArray(baseRecords) ? baseRecords : [];
    const index = Conference && typeof Conference.buildBaseIndex === "function" ? Conference.buildBaseIndex(base) : null;
    return (rows || []).map((row) => {
      const current = currentStatusRecord(row, base, Conference, index);
      const matched = matchedBaseRecords(row, base, Conference, index);
      return {
        ...row,
        conferenceLabel: conferenceLabel(row.status, Conference),
        sigemStatus: current ? rawText(current.status) : "",
        sigemStatusRevision: current ? current.revision : "",
        sigemSourceRow: current ? current.sourceRow : null,
        note: !current && matched.length
          ? `${row.note || ""} Status SIGEM ambíguo na Consulta Geral; requer análise das linhas de origem.`.trim()
          : current && Conference.normalizeRevision(current.revision) !== Conference.normalizeRevision(row.revisionSent)
            ? `${row.note || ""} Status SIGEM referente à revisão ${current.revision} encontrada na base.`.trim()
            : row.note,
      };
    });
  }

  function historyTimestamp(row) {
    const source = trimmed(row && row.generatedAt);
    const parsed = parseSourceDate(source);
    if (Number.isFinite(parsed)) return parsed;
    const generic = Date.parse(source);
    return Number.isFinite(generic) ? generic : Number.NEGATIVE_INFINITY;
  }

  function egrdtSequence(value) {
    const source = trimmed(value).toUpperCase();
    const standard = source.match(/-G-(\d+)-\d{4}(?:\D|$)/);
    if (standard) return Number(standard[1]) || 0;
    const parts = source.match(/\d+/g) || [];
    return parts.length ? Number(parts[parts.length - 1]) || 0 : 0;
  }

  function compareSendRecency(left, right) {
    const byTime = historyTimestamp(right) - historyTimestamp(left);
    if (Number.isFinite(byTime) && byTime) return byTime;
    const bySequence = egrdtSequence(right && right.egrdtNumber) - egrdtSequence(left && left.egrdtNumber);
    if (bySequence) return bySequence;
    return trimmed(right && right.egrdtNumber).localeCompare(trimmed(left && left.egrdtNumber), "pt-BR", { numeric: true });
  }

  function documentRevisionIdentity(row, Conference) {
    const identity = trimmed(row && row.documentIdentity) || Conference.documentIdentity(row && row.document);
    return `${identity}::${Conference.normalizeRevision(row && row.revisionSent)}`;
  }

  function sendEventKey(row, Conference) {
    const identity = trimmed(row && row.documentIdentity) || Conference.documentIdentity(row && row.document);
    const revision = Conference.normalizeRevision(row && row.revisionSent);
    const egrdt = Conference.norm(row && row.egrdtNumber);
    // A eGRDT identifica o evento/lote; data só entra como fallback quando o
    // número do lote não existe. Assim um registro persistido duas vezes com
    // pequenas diferenças de timestamp não vira uma falsa repostagem.
    const timestamp = historyTimestamp(row);
    const temporal = egrdt ? "" : (Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : Conference.norm(row && row.generatedAt));
    return `${identity}::${revision}::${egrdt}::${temporal}`;
  }

  function statusPriority(status, Conference) {
    const S = Conference.STATUSES;
    return ({
      [S.CONFIRMED]: 0,
      [S.REVIEW]: 1,
      [S.REVISION_DIVERGENT]: 2,
      [S.NOT_FOUND]: 3,
      [S.AWAITING]: 4,
      [S.NOT_VERIFIED]: 5,
    })[status] ?? 9;
  }

  function chooseDuplicateEvent(existing, candidate, Conference) {
    if (!existing) return candidate;
    if (!candidate) return existing;
    const existingPriority = statusPriority(existing.status, Conference);
    const candidatePriority = statusPriority(candidate.status, Conference);
    if (candidatePriority < existingPriority) return candidate;
    if (candidatePriority > existingPriority) return existing;
    const existingEvidence = Number(Boolean(existing.sigemStatus)) + Number(Boolean(existing.revisionFound)) + Number(Boolean(existing.note));
    const candidateEvidence = Number(Boolean(candidate.sigemStatus)) + Number(Boolean(candidate.revisionFound)) + Number(Boolean(candidate.note));
    return candidateEvidence > existingEvidence ? candidate : existing;
  }

  function summarizeDocuments(rows, Conference) {
    const source = Array.isArray(rows) ? rows : [];
    const S = Conference.STATUSES;
    const confirmed = source.filter((row) => row.status === S.CONFIRMED).length;
    const sendCount = source.reduce((sum, row) => sum + Number(row.sendCount || 0), 0);
    const repostCount = source.reduce((sum, row) => sum + Number(row.repostCount || 0), 0);
    const exactDuplicateCount = source.reduce((sum, row) => sum + Number(row.exactDuplicateCount || 0), 0);
    const egrdts = new Set(source.flatMap((row) => (row.sends || []).map((send) => Conference.norm(send.egrdtNumber)).filter(Boolean)));
    return {
      total: source.length,
      confirmed,
      awaiting: source.filter((row) => row.status === S.AWAITING).length,
      divergent: source.filter((row) => row.status === S.REVISION_DIVERGENT).length,
      notFound: source.filter((row) => row.status === S.NOT_FOUND).length,
      review: source.filter((row) => row.status === S.REVIEW).length,
      notVerified: source.filter((row) => row.status === S.NOT_VERIFIED).length,
      pending: source.filter((row) => row.status !== S.CONFIRMED).length,
      percentConfirmed: source.length ? Math.round((confirmed / source.length) * 10000) / 100 : 0,
      sendCount,
      repostCount,
      egrdtCount: egrdts.size,
      exactDuplicateCount,
      documentsWithMultipleSends: source.filter((row) => Number(row.sendCount || 0) > 1).length,
      rawEventCount: source.reduce((sum, row) => sum + Number(row.rawEventCount || row.sendCount || 0), 0),
    };
  }

  function buildDocumentAggregates(rows, Conference) {
    if (!Conference) return [];
    const groups = new Map();

    (rows || []).forEach((row) => {
      const identity = trimmed(row && row.documentIdentity) || Conference.documentIdentity(row && row.document);
      if (!identity) return;
      let group = groups.get(identity);
      if (!group) {
        group = { identity, rawRows: [], eventMap: new Map(), exactDuplicateCount: 0 };
        groups.set(identity, group);
      }
      group.rawRows.push(row);
      const eventKey = sendEventKey(row, Conference);
      if (group.eventMap.has(eventKey)) group.exactDuplicateCount += 1;
      group.eventMap.set(eventKey, chooseDuplicateEvent(group.eventMap.get(eventKey), row, Conference));
    });

    return [...groups.values()].map((group) => {
      const sends = [...group.eventMap.values()].sort(compareSendRecency);
      const latestSend = sends[0] || group.rawRows[0] || {};
      const currentRevision = Conference.normalizeRevision(latestSend.revisionSent);
      const currentRevisionSends = sends.filter((row) => Conference.normalizeRevision(row.revisionSent) === currentRevision);
      const confirmedCurrent = currentRevisionSends.filter((row) => row.status === Conference.STATUSES.CONFIRMED).sort(compareSendRecency);
      const current = confirmedCurrent[0] || currentRevisionSends[0] || latestSend;
      const revisions = [...new Set(sends.map((row) => Conference.normalizeRevision(row.revisionSent)).filter(Boolean))]
        .sort((a, b) => Conference.revisionRank(a) - Conference.revisionRank(b) || a.localeCompare(b, "pt-BR"));
      const revisionCounts = new Map();
      sends.forEach((row) => {
        const revision = Conference.normalizeRevision(row.revisionSent);
        revisionCounts.set(revision, (revisionCounts.get(revision) || 0) + 1);
      });
      const repostCount = [...revisionCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
      const egrdtNumbers = [...new Set(sends.map((row) => trimmed(row.egrdtNumber)).filter(Boolean))];
      const searchKeys = [...new Set(sends.flatMap((row) => row.searchKeys || Conference.documentKeys(row.document)).filter(Boolean))];
      const latestChecked = sends.slice().sort((a, b) => Date.parse(b.lastCheckedAt || 0) - Date.parse(a.lastCheckedAt || 0))[0];
      const allNotes = [...new Set(currentRevisionSends.map((row) => trimmed(row.note)).filter(Boolean))];
      const notePrefix = sends.length > 1
        ? `${sends.length} envios consolidados (${repostCount} repostagem(ns)); tentativas anteriores permanecem no histórico.`
        : "";
      const note = [notePrefix, trimmed(current.note) || allNotes[0] || ""].filter(Boolean).join(" ");

      return {
        ...latestSend,
        ...current,
        key: `document::${group.identity}`,
        identity: group.identity,
        documentIdentity: group.identity,
        documentRevisionIdentity: `${group.identity}::${currentRevision}`,
        document: latestSend.document || current.document,
        documentFamily: latestSend.documentFamily || current.documentFamily,
        discipline: latestSend.discipline || current.discipline,
        sheet: latestSend.sheet || current.sheet,
        searchKeys,
        currentRevision,
        revisionSent: currentRevision,
        revisions,
        revisionCount: revisions.length,
        sends,
        eventKeys: sends.map((row) => row.key).filter(Boolean),
        sendCount: sends.length,
        rawEventCount: group.rawRows.length,
        exactDuplicateCount: group.exactDuplicateCount,
        repostCount,
        currentRevisionSendCount: currentRevisionSends.length,
        currentRevisionRepostCount: Math.max(0, currentRevisionSends.length - 1),
        egrdtCount: egrdtNumbers.length,
        egrdtNumbers,
        associatedEgrdts: egrdtNumbers,
        latestSend,
        egrdtNumber: latestSend.egrdtNumber,
        generatedAt: latestSend.generatedAt,
        latestEgrdtNumber: latestSend.egrdtNumber,
        latestSendAt: latestSend.generatedAt,
        status: current.status,
        statusLabel: current.statusLabel || Conference.statusLabel(current.status),
        conferenceLabel: current.conferenceLabel || conferenceLabel(current.status, Conference),
        revisionFound: current.revisionFound,
        sigemStatus: current.sigemStatus,
        sigemStatusRevision: current.sigemStatusRevision,
        sigemSourceRow: current.sigemSourceRow,
        firstConfirmedAt: current.firstConfirmedAt,
        confirmedRevision: current.confirmedRevision,
        confirmationSource: current.confirmationSource,
        historicalPreserved: Boolean(current.historicalPreserved),
        currentEvidence: Boolean(current.currentEvidence),
        lastCheckedAt: latestChecked ? latestChecked.lastCheckedAt : current.lastCheckedAt,
        note,
      };
    }).sort((a, b) => compareSendRecency(a.latestSend || a, b.latestSend || b));
  }

  function enrichResult(result, baseRecords, Conference) {
    if (!result || typeof result !== "object") return result;
    const eventRows = enrichRows(result.eventRows || result.rows || [], baseRecords || [], Conference);
    const documentRows = buildDocumentAggregates(eventRows, Conference);
    const summary = summarizeDocuments(documentRows, Conference);
    const eventSummary = result.eventSummary || result.summary || (Conference.summarize ? Conference.summarize(eventRows) : {});
    return {
      ...result,
      rows: eventRows,
      eventRows,
      documentRows,
      summary,
      eventSummary,
      consolidation: {
        rawEvents: eventRows.length,
        uniqueDocuments: documentRows.length,
        duplicateDocumentRowsEliminated: Math.max(0, eventRows.length - documentRows.length),
        documentsWithMultipleSends: summary.documentsWithMultipleSends,
        sends: summary.sendCount,
        reposts: summary.repostCount,
        exactDuplicateEvents: summary.exactDuplicateCount,
        egrdts: summary.egrdtCount,
      },
    };
  }

  function locateExactStatusColumn(matrix, Conference) {
    const detection = Conference.detectColumns(matrix, 40);
    if (!detection) return null;
    const header = matrix[detection.rowIndex] || [];
    let statusIndex = -1;
    for (let index = 0; index < header.length; index += 1) {
      if (Conference.normalizeHeader(header[index]) === "STATUS") {
        statusIndex = index;
        break;
      }
    }
    return statusIndex >= 0 ? { detection, statusIndex } : null;
  }

  function repairParsedStatuses(workbook, parsed, Conference) {
    if (!workbook || !parsed || !Array.isArray(parsed.records) || !root.XLSX?.utils?.sheet_to_json) return parsed;
    const sheetName = trimmed(parsed.meta && parsed.meta.sheetName) || workbook.SheetNames?.[0];
    const sheet = workbook.Sheets && workbook.Sheets[sheetName];
    if (!sheet) return parsed;
    const matrix = root.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: true });
    const located = locateExactStatusColumn(matrix, Conference);
    if (!located) return parsed;

    const { detection, statusIndex } = located;
    const records = parsed.records.map((record) => {
      const source = matrix[record.sourceRow - 1];
      return source ? { ...record, status: rawText(source[statusIndex]) } : record;
    });
    const headers = matrix[detection.rowIndex] || [];
    return {
      ...parsed,
      records,
      meta: {
        ...(parsed.meta || {}),
        columns: { ...(parsed.meta && parsed.meta.columns || {}), status: rawText(headers[statusIndex]) || "STATUS" },
      },
    };
  }

  function isAggregateRows(rows) {
    return Array.isArray(rows) && rows.some((row) => Array.isArray(row && row.sends));
  }

  function aggregateMatches(row, filters, Conference) {
    const f = filters || {};
    const sends = row.sends || [];
    const norm = Conference.norm;
    const search = norm(f.search);
    const code = norm(f.document);
    const grdt = norm(f.grdt);
    const family = norm(f.family);
    const discipline = norm(f.discipline);
    const revision = Conference.normalizeRevision(f.revision);
    const status = trimmed(f.status);
    const start = trimmed(f.startDate);
    const end = trimmed(f.endDate);
    const documentList = String(f.documentList || "").split(/[\r\n,;|\t]+/).map(trimmed).filter(Boolean);
    const wantedIdentities = new Set(documentList.map((document) => Conference.documentIdentity(document)).filter(Boolean));

    if (search) {
      const haystack = [
        row.document, row.documentFamily, row.discipline, row.currentRevision, row.revisionFound,
        row.statusLabel, row.conferenceLabel, row.sigemStatus, row.note,
        ...sends.flatMap((send) => [send.egrdtNumber, send.generatedAt, send.revisionSent, send.sigemStatus, send.note]),
      ].join(" ");
      if (!norm(haystack).includes(search)) return false;
    }
    if (code && !norm(row.document).includes(code)) return false;
    if (wantedIdentities.size && !wantedIdentities.has(row.documentIdentity)) return false;
    if (grdt && !sends.some((send) => norm(send.egrdtNumber).includes(grdt))) return false;
    if (family && !sends.some((send) => norm(send.documentFamily || send.sheet) === family)) return false;
    if (discipline && !sends.some((send) => norm(send.discipline) === discipline)) return false;
    if (revision && !sends.some((send) => Conference.normalizeRevision(send.revisionSent) === revision)) return false;
    if (status && row.status !== status) return false;
    if (start || end) {
      const hasDate = sends.some((send) => {
        const dateKey = trimmed(send.generatedAt).slice(0, 10);
        if (!dateKey) return false;
        if (start && dateKey < start) return false;
        if (end && dateKey > end) return false;
        return true;
      });
      if (!hasDate) return false;
    }
    return true;
  }

  function pendingDocumentRows(rows, Conference) {
    return (rows || []).filter((row) => row.status !== Conference.STATUSES.CONFIRMED)
      .sort((a, b) => statusPriority(a.status, Conference) - statusPriority(b.status, Conference)
        || compareSendRecency(a.latestSend || a, b.latestSend || b));
  }

  function wrapConference(original) {
    if (!original || original[MARKER]) return original;
    const wrapped = {
      ...original,
      reconcile(historyRecords, baseRecords, previousState, options) {
        return enrichResult(original.reconcile(historyRecords, baseRecords, previousState, options), baseRecords || [], wrapped);
      },
      async reconcilePersisted(historyRecords, options) {
        const result = await original.reconcilePersisted(historyRecords, options);
        const base = await original.loadBase();
        return enrichResult(result, base && base.records || [], wrapped);
      },
      async importWorkbook(workbook, fileMeta, historyRecords, options) {
        let result = await original.importWorkbook(workbook, fileMeta, historyRecords, options);
        const repaired = repairParsedStatuses(workbook, result.parsed, wrapped);
        if (repaired !== result.parsed) {
          await original.saveBase({ meta: repaired.meta, records: repaired.records });
          result = { ...result, parsed: repaired };
        }
        return enrichResult(result, repaired.records || [], wrapped);
      },
      filterRows(rows, filters) {
        if (isAggregateRows(rows)) return (rows || []).filter((row) => aggregateMatches(row, filters, wrapped));
        const sourceFilters = { ...(filters || {}) };
        const search = trimmed(sourceFilters.search);
        sourceFilters.search = "";
        let result = original.filterRows(rows, sourceFilters);
        if (!search) return result;
        const wanted = original.norm(search);
        return result.filter((row) => original.norm([
          row.document, row.egrdtNumber, row.discipline, row.documentFamily,
          row.revisionSent, row.revisionFound, row.conferenceLabel || row.statusLabel,
          row.sigemStatus, row.note,
        ].join(" ")).includes(wanted));
      },
      pendingRows(rows) {
        return isAggregateRows(rows) ? pendingDocumentRows(rows, wrapped) : original.pendingRows(rows);
      },
      summarize(rows) {
        return isAggregateRows(rows) ? summarizeDocuments(rows, wrapped) : original.summarize(rows);
      },
      buildDocumentAggregates(rows) {
        return buildDocumentAggregates(rows, wrapped);
      },
      summarizeDocuments(rows) {
        return summarizeDocuments(rows, wrapped);
      },
      sendEventKey(row) {
        return sendEventKey(row, wrapped);
      },
      documentRevisionIdentity(row) {
        return documentRevisionIdentity(row, wrapped);
      },
    };
    Object.defineProperty(wrapped, MARKER, { value: true, enumerable: false });
    return Object.freeze(wrapped);
  }

  function installConferenceWrapper() {
    let value = root.GrconPostingConference;
    const descriptor = Object.getOwnPropertyDescriptor(root, "GrconPostingConference");
    if (!descriptor || descriptor.configurable) {
      Object.defineProperty(root, "GrconPostingConference", {
        configurable: true,
        enumerable: true,
        get() { return value; },
        set(next) { value = wrapConference(next); },
      });
      if (value) value = wrapConference(value);
      return;
    }
    if (value && !value[MARKER] && descriptor.writable) root.GrconPostingConference = wrapConference(value);
  }

  function visibleRows() {
    const ui = root.GrconPostingConferenceUi;
    const Conference = root.GrconPostingConference;
    if (!ui?.state || !Conference) return [];
    const source = ui.state.view === "grdts"
      ? (ui.state.result?.eventRows || ui.state.result?.rows || [])
      : (ui.state.result?.documentRows || []);
    let rows = Conference.filterRows(source, ui.state.filters || {});
    if (ui.state.view === "pending") rows = Conference.pendingRows(rows);
    const page = Math.max(1, Number(ui.state.page) || 1);
    return rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function ensureSigemCell(statusCell, row) {
    let cell = statusCell.nextElementSibling;
    if (cell && cell.classList.contains("pc-sigem-cell")) {
      const badge = cell.querySelector(".pc-sigem-status");
      if (!badge || !badge.classList.contains("pc-sigem-status")) return;
      setText(badge, rawText(row && row.sigemStatus) || "—");
      return;
    }
    // Compatibilidade com versões anteriores da tabela. A interface atual já
    // renderiza a coluna Status SIGEM nativamente e não passa por este ramo.
    if (cell && /Status SIGEM/i.test(cell.getAttribute("data-label") || "")) return;
    cell = document.createElement("td");
    cell.className = "pc-sigem-cell";
    cell.innerHTML = `<span class="pc-sigem-status"></span>`;
    statusCell.insertAdjacentElement("afterend", cell);
    setText(cell.firstElementChild, rawText(row && row.sigemStatus) || "—");
  }

  function decorateDocumentTable(module) {
    const table = module.querySelector(".pc-table:not(.pc-grdt-table)");
    if (!table) return;
    const headings = [...table.querySelectorAll("thead th")];
    const conferenceIndex = headings.findIndex((th) => /^(Situação|Conferência)$/i.test(trimmed(th.textContent)));
    if (conferenceIndex < 0) return;
    const conferenceHeading = headings[conferenceIndex];
    setText(conferenceHeading, "Conferência");
    const nextHeading = conferenceHeading.nextElementSibling;
    const hasNativeSigem = nextHeading && /Status SIGEM/i.test(trimmed(nextHeading.textContent));
    if (!hasNativeSigem) {
      let sigemHeading = table.querySelector("thead .pc-sigem-heading");
      if (!sigemHeading) {
        sigemHeading = document.createElement("th");
        sigemHeading.className = "pc-sigem-heading";
        conferenceHeading.insertAdjacentElement("afterend", sigemHeading);
      }
      setText(sigemHeading, "Status SIGEM");
      const rows = visibleRows();
      [...table.querySelectorAll("tbody tr")].forEach((tr, index) => {
        const cells = [...tr.children].filter((node) => node.tagName === "TD");
        const statusCell = cells[conferenceIndex];
        if (!statusCell) return;
        const chip = statusCell.querySelector(".pc-status");
        if (chip && rows[index]) setText(chip, rows[index].conferenceLabel || conferenceLabel(rows[index].status, root.GrconPostingConference));
        ensureSigemCell(statusCell, rows[index]);
      });
    }
  }

  function decorateLabels(module) {
    module.querySelectorAll("#pc-kpis span").forEach((node) => {
      if (trimmed(node.textContent) === "Aguardando confirmação") setText(node, "Não postado ainda");
    });
    module.querySelectorAll("#pc-status option").forEach((option) => {
      const Conference = root.GrconPostingConference;
      if (!Conference) return;
      if (option.value === Conference.STATUSES.CONFIRMED) setText(option, "Postado");
      if (option.value === Conference.STATUSES.AWAITING) setText(option, "Não postado ainda");
    });
  }

  function decorate() {
    if (decorating) return;
    const module = document.getElementById("posting-conference-module");
    if (!module) return;
    decorating = true;
    try {
      decorateLabels(module);
      if (root.GrconPostingConferenceUi?.state?.view !== "grdts") decorateDocumentTable(module);
    } finally {
      moduleObserver?.takeRecords?.();
      decorating = false;
    }
  }

  function scheduleDecorate() {
    if (decorating || decorationQueued) return;
    decorationQueued = true;
    const run = () => {
      decorationQueued = false;
      decorate();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else Promise.resolve().then(run);
  }

  function observeConferenceModule(module) {
    if (!module) return;
    moduleObserver?.disconnect?.();
    moduleObserver = new MutationObserver(() => scheduleDecorate());
    moduleObserver.observe(module, { childList: true, subtree: true });
    scheduleDecorate();
  }

  function installDomRefinement() {
    const existing = document.getElementById("posting-conference-module");
    if (existing) {
      observeConferenceModule(existing);
    } else {
      const workspace = document.querySelector("main.workspace");
      if (workspace) {
        const locator = new MutationObserver(() => {
          const module = document.getElementById("posting-conference-module");
          if (!module) return;
          locator.disconnect();
          observeConferenceModule(module);
        });
        locator.observe(workspace, { childList: true });
      }
    }
    root.addEventListener("grcon:conference-updated", scheduleDecorate);
    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-pc-view],#pc-prev,#pc-next,#pc-clear-filters")) return;
      if (typeof queueMicrotask === "function") queueMicrotask(scheduleDecorate);
      else Promise.resolve().then(scheduleDecorate);
    });
    scheduleDecorate();
  }

  function install() {
    if (installed) return;
    installed = true;
    installConferenceWrapper();
    if (typeof document !== "undefined") installDomRefinement();
  }

  return Object.freeze({
    install,
    conferenceLabel,
    enrichRows,
    enrichResult,
    currentStatusRecord,
    parseSourceDate,
    locateExactStatusColumn,
    repairParsedStatuses,
    wrapConference,
    buildDocumentAggregates,
    summarizeDocuments,
    sendEventKey,
    documentRevisionIdentity,
    compareSendRecency,
  });
});
