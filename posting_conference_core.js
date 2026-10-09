(function (root, factory) {
  const safeRequire = (path) => {
    if (typeof require !== "function") return null;
    try { return require(path); } catch (_) { return null; }
  };
  const api = factory(root.GrconHistory || safeRequire("./history_core.js"), root.TriagemCore || safeRequire("./core.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPostingConference = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (History, Core) {
  "use strict";

  const DB_NAME = "grcon-posting-conference";
  const DB_VERSION = 1;
  const STORE = "kv";
  const BASE_KEY = "current-base";
  const STATE_KEY = "confirmation-state";
  const AUDIT_KEY = "audit-log";
  const HISTORY_INDEX_KEY = "grcon.postingConference.historyIndex.v1";
  const PREFS_KEY = "grcon.postingConference.preferences.v1";
  const DEFAULT_WAIT_HOURS = 48;
  const MAX_AUDIT = 40;

  const STATUSES = Object.freeze({
    CONFIRMED: "CONFIRMADO",
    AWAITING: "AGUARDANDO",
    REVISION_DIVERGENT: "REVISAO_DIVERGENTE",
    NOT_FOUND: "NAO_ENCONTRADO",
    REVIEW: "REQUER_ANALISE",
    NOT_VERIFIED: "NAO_VERIFICADO",
  });

  const AGGREGATE_STATUSES = Object.freeze({
    CONFIRMED: "CONFIRMADO",
    PENDING: "PENDENTE",
    REVIEW: "REVISAR",
    NOT_VERIFIED: "NAO_VERIFICADO",
  });

  const HEADER_ALIASES = Object.freeze({
    document: ["DOCUMENTO", "CODIGO DO DOCUMENTO", "CÓDIGO DO DOCUMENTO", "COD DOCUMENTO", "DOCUMENT NUMBER", "DOCUMENT"],
    revision: ["REVISAO", "REVISÃO", "REV", "REVISION", "REVISAO DO DOCUMENTO", "REVISÃO DO DOCUMENTO"],
    modifiedAt: ["MODIFICADO EM", "DATA MODIFICACAO", "DATA MODIFICAÇÃO", "MODIFIED AT"],
    includedAt: ["INCLUIDO EM", "INCLUÍDO EM", "DATA INCLUSAO", "DATA INCLUSÃO", "INCLUDED AT"],
    title: ["TITULO", "TÍTULO", "TITLE"],
    status: ["STATUS", "STATUS SIGEM", "SITUACAO", "SITUAÇÃO"],
    discipline: ["DISCIPLINA", "DISCIPLINE"],
    documentType: ["TIPO DE DOCUMENTO", "TIPO DOCUMENTO", "DOCUMENT TYPE"],
    situation: ["SITUACAO DO DOCUMENTO", "SITUAÇÃO DO DOCUMENTO"],
    observation: ["OBSERVACAO", "OBSERVAÇÃO", "OBS", "COMENTARIO", "COMENTÁRIO"],
  });

  function text(value) {
    if (History && typeof History.text === "function") return History.text(value);
    return String(value === null || value === undefined ? "" : value).trim();
  }

  function norm(value) {
    if (Core && typeof Core.key === "function") return Core.key(value);
    if (History && typeof History.norm === "function") return History.norm(value);
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[–—]/g, "-").toUpperCase().replace(/\s+/g, " ").trim();
  }

  function normalizeRevision(value) {
    if (Core && typeof Core.normalizeRevision === "function") return Core.normalizeRevision(value);
    return norm(value).replace(/^REV(?:ISAO)?\.?\s*/, "").replace(/\s+/g, "");
  }

  function normalizeHeader(value) {
    return text(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const NORMALIZED_ALIASES = Object.freeze(Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([key, values]) => [key, new Set(values.map(normalizeHeader))]),
  ));

  function documentKeys(value) {
    const raw = text(value);
    if (!raw) return [];
    if (Core && typeof Core.documentSearchKeys === "function") {
      return [...new Set(Core.documentSearchKeys(raw).map((item) => norm(item)).filter(Boolean))];
    }
    const base = norm(raw);
    return base ? [base] : [];
  }

  function documentIdentity(value) {
    const keys = documentKeys(value).slice().sort();
    return keys.join("||") || norm(value);
  }

  function displayDocument(value) {
    if (Core && typeof Core.displayDocumentCode === "function") return Core.displayDocumentCode(value);
    return text(value);
  }

  function revisionRank(value) {
    if (Core && typeof Core.revisionRank === "function") return Core.revisionRank(value);
    const revision = normalizeRevision(value);
    if (revision === "0") return 0;
    if (/^[A-Z]+$/.test(revision)) {
      let rank = 0;
      for (const char of revision) rank = rank * 26 + char.charCodeAt(0) - 64;
      return rank * 1000;
    }
    return -1;
  }

  function uniqueSortedRevisions(values) {
    return [...new Set((values || []).map(normalizeRevision).filter(Boolean))]
      .sort((a, b) => revisionRank(a) - revisionRank(b) || a.localeCompare(b, "pt-BR"));
  }

  function fieldIndex(headers, field) {
    if (field === "status") {
      const exact = headers.findIndex((value) => normalizeHeader(value) === "STATUS");
      if (exact >= 0) return exact;
    }
    const aliases = NORMALIZED_ALIASES[field] || new Set();
    for (let index = 0; index < headers.length; index += 1) {
      if (aliases.has(normalizeHeader(headers[index]))) return index;
    }
    return -1;
  }

  function detectColumns(matrix, maxHeaderRows) {
    const rows = Array.isArray(matrix) ? matrix : [];
    const limit = Math.min(rows.length, Number(maxHeaderRows) || 40);
    let best = null;
    for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
      const headers = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
      const columns = {};
      Object.keys(HEADER_ALIASES).forEach((field) => { columns[field] = fieldIndex(headers, field); });
      const score = Object.values(columns).filter((index) => index >= 0).length;
      if (columns.document >= 0 && columns.revision >= 0 && (!best || score > best.score)) {
        best = { rowIndex, headerRow: rowIndex + 1, columns, headers: headers.map(text), score };
      }
    }
    return best;
  }

  function rowValue(row, index) {
    return index >= 0 && Array.isArray(row) ? text(row[index]) : "";
  }

  function isSigemFooterRow(row, detection) {
    if (!Array.isArray(row) || !detection?.columns) return false;
    const document = rowValue(row, detection.columns.document);
    const revision = normalizeRevision(rowValue(row, detection.columns.revision));
    if (!document || revision) return false;

    // Exportações da Consulta Geral do SIGEM encerram a planilha com uma
    // assinatura textual na coluna Documento. Ela não é um documento e não
    // pode invalidar a publicação da base compartilhada.
    const footer = normalizeHeader(document);
    if (!footer.startsWith("SIGEM SISTEMA INTEGRADO DE GERENCIAMENTO DE EMPREENDIMENTOS")) return false;

    return Object.entries(detection.columns)
      .filter(([field, index]) => field !== "document" && index >= 0)
      .every(([, index]) => !rowValue(row, index));
  }

  function parseMatrix(matrix, options) {
    const detection = detectColumns(matrix, options && options.maxHeaderRows);
    if (!detection) {
      return {
        ok: false,
        records: [],
        meta: { recordCount: 0, duplicateCount: 0, invalidCount: 0, ignoredFooterCount: 0, headerRow: 0, columns: {} },
        errors: ["Não foi possível identificar simultaneamente as colunas Documento e Revisão da Consulta Geral."],
      };
    }

    const rows = matrix.slice(detection.rowIndex + 1);
    const records = [];
    const dedupe = new Map();
    let invalidCount = 0;
    let ignoredFooterCount = 0;
    let duplicateCount = 0;

    rows.forEach((row, offset) => {
      const document = rowValue(row, detection.columns.document);
      const revision = normalizeRevision(rowValue(row, detection.columns.revision));
      if (!document) return;
      if (isSigemFooterRow(row, detection)) {
        ignoredFooterCount += 1;
        return;
      }
      if (!revision) invalidCount += 1;
      const keys = documentKeys(document);
      if (!keys.length) {
        invalidCount += 1;
        return;
      }
      const identity = documentIdentity(document);
      const dedupeKey = `${identity}|${revision}|${JSON.stringify(row)}`;
      const record = {
        id: `${identity}|${revision}|${detection.headerRow + offset + 1}`,
        document: displayDocument(document),
        documentIdentity: identity,
        searchKeys: keys,
        revision,
        modifiedAt: rowValue(row, detection.columns.modifiedAt),
        includedAt: rowValue(row, detection.columns.includedAt),
        title: rowValue(row, detection.columns.title),
        status: rowValue(row, detection.columns.status),
        documentType: rowValue(row, detection.columns.documentType),
        discipline: rowValue(row, detection.columns.discipline),
        situation: rowValue(row, detection.columns.situation),
        observation: rowValue(row, detection.columns.observation),
        sourceRow: detection.headerRow + offset + 1,
      };
      if (dedupe.has(dedupeKey)) {
        duplicateCount += 1;
        // Only identical source rows can be collapsed. Different statuses or
        // dates must remain available to resolve the current evidence.
      } else {
        dedupe.set(dedupeKey, record);
      }
    });

    dedupe.forEach((record) => records.push(record));
    return {
      ok: true,
      records,
      meta: {
        recordCount: records.length,
        sourceRowCount: rows.length,
        duplicateCount,
        invalidCount,
        ignoredFooterCount,
        headerRow: detection.headerRow,
        columns: Object.fromEntries(Object.entries(detection.columns).filter(([, index]) => index >= 0).map(([field, index]) => [field, detection.headers[index] || field])),
      },
      errors: [],
    };
  }

  function workbookToMatrix(workbook) {
    if (!workbook || !Array.isArray(workbook.SheetNames) || !workbook.SheetNames.length) {
      return { matrix: [], sheetName: "", errors: ["A planilha não possui abas legíveis."] };
    }
    const XLSX = (typeof globalThis !== "undefined" ? globalThis.XLSX : null);
    if (!XLSX || !XLSX.utils || typeof XLSX.utils.sheet_to_json !== "function") {
      return { matrix: [], sheetName: "", errors: ["Leitor XLSX indisponível nesta sessão."] };
    }
    let best = null;
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: true });
      const detection = detectColumns(matrix, 40);
      if (!detection) return;
      if (!best || detection.score > best.detection.score) best = { matrix, sheetName, detection };
    });
    return best || { matrix: [], sheetName: "", errors: ["Nenhuma aba contém as colunas essenciais Documento e Revisão."] };
  }

  function parseWorkbook(workbook, fileMeta) {
    const selected = workbookToMatrix(workbook);
    if (selected.errors) return { ok: false, records: [], meta: {}, errors: selected.errors };
    const parsed = parseMatrix(selected.matrix);
    parsed.meta = {
      ...parsed.meta,
      sheetName: selected.sheetName,
      fileName: text(fileMeta && fileMeta.fileName),
      fileSize: Number(fileMeta && fileMeta.fileSize) || 0,
      importedAt: text(fileMeta && fileMeta.importedAt) || new Date().toISOString(),
      lastModified: Number(fileMeta && fileMeta.lastModified) || 0,
    };
    return parsed;
  }

  function historyStableId(record) {
    return text(record && (record.clientRecordId || record.id)) || `${text(record && record.egrdtNumber)}|${text(record && record.generatedAt)}`;
  }

  function sentRevision(file) {
    const explicit = text(file && (file.grdtRevision || file.revision));
    if (explicit) return normalizeRevision(explicit);
    if (History && typeof History.generatedRevision === "function") return normalizeRevision(History.generatedRevision(file));
    return "";
  }

  function documentFamily(file) {
    if (History && typeof History.documentFamily === "function") return History.documentFamily(file) || "";
    return text(file && file.sheet) || "";
  }

  function flattenHistory(records) {
    const result = [];
    const seen = new Map();
    (records || []).forEach((rawRecord) => {
      const record = History && typeof History.cleanRecord === "function" ? History.cleanRecord(rawRecord) : rawRecord || {};
      const stableId = historyStableId(record);
      (record.files || []).forEach((file) => {
        const document = text(file && file.document);
        const revision = sentRevision(file);
        if (!document) return;
        const identity = documentIdentity(document);
        const rowKey = `${stableId}|${identity}|${revision}`;
        const purpose = text(file && file.purpose);
        if (seen.has(rowKey)) {
          // Mesmo envio/revisão com propósitos diferentes não tem evidência inequívoca.
          const previous = seen.get(rowKey);
          if (purpose && previous.purpose && norm(purpose) !== norm(previous.purpose)) {
            previous.purpose = "";
            previous.purposeAmbiguous = true;
          } else if (!previous.purpose && !previous.purposeAmbiguous) {
            previous.purpose = purpose;
          }
          return;
        }
        const event = {
          key: rowKey,
          purpose,
          historyId: stableId,
          historyRecordId: text(record.id),
          egrdtNumber: text(record.egrdtNumber),
          generatedAt: text(record.generatedAt),
          workspaceId: text(record.workspaceId),
          title: text(file && file.title),
          document: displayDocument(document),
          documentIdentity: identity,
          searchKeys: documentKeys(document),
          revisionSent: revision,
          documentFamily: documentFamily(file),
          discipline: text(file && file.discipline),
          sheet: text(file && file.sheet),
          sourceName: text(record.sourceName),
          ldName: text(record.ldName),
        };
        seen.set(rowKey, event);
        result.push(event);
      });
    });
    return result;
  }

  function buildBaseIndex(records) {
    const index = new Map();
    (records || []).forEach((record, recordIndex) => {
      const keys = Array.isArray(record.searchKeys) && record.searchKeys.length ? record.searchKeys : documentKeys(record.document);
      keys.forEach((searchKey) => {
        const normalized = norm(searchKey);
        if (!normalized) return;
        if (!index.has(normalized)) index.set(normalized, []);
        index.get(normalized).push(recordIndex);
      });
    });
    return index;
  }

  function matchedBaseRecords(historyRow, baseRecords, index) {
    const positions = new Set();
    (historyRow.searchKeys || []).forEach((searchKey) => {
      (index.get(norm(searchKey)) || []).forEach((position) => positions.add(position));
    });
    return [...positions].map((position) => baseRecords[position]).filter(Boolean);
  }

  function hoursSince(value, nowValue) {
    const parsed = new Date(value);
    const now = new Date(nowValue || Date.now());
    if (Number.isNaN(parsed.getTime()) || Number.isNaN(now.getTime())) return Number.POSITIVE_INFINITY;
    return Math.max(0, (now.getTime() - parsed.getTime()) / 3600000);
  }

  function isPostedSigemStatus(value) {
    const normalized = norm(value).replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
    return normalized === "EM ANALISE" || normalized === "EM WORKFLOW";
  }

  function parseSourceDate(value) {
    const source = text(value);
    const br = source.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (br) {
      const [, d, m, y, h = "0", min = "0", s = "0"] = br;
      const time = Date.UTC(+y, +m - 1, +d, +h, +min, +s);
      const date = new Date(time);
      return date.getUTCFullYear() === +y
        && date.getUTCMonth() === +m - 1
        && date.getUTCDate() === +d
        && +h < 24 && +min < 60 && +s < 60 ? time : NaN;
    }
    return /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(source) ? Date.parse(source) : NaN;
  }

  function effectiveRecordTimestamp(record) {
    const values = [record && record.modifiedAt, record && record.includedAt]
      .map(parseSourceDate)
      .filter(Number.isFinite);
    return values.length ? Math.max(...values) : Number.NEGATIVE_INFINITY;
  }

  function sameTimestampStatusConflict(records) {
    if (!records.length) return false;
    const firstTime = effectiveRecordTimestamp(records[0]);
    const tied = records.filter((record) => effectiveRecordTimestamp(record) === firstTime);
    return new Set(tied.map((record) => norm(record && record.status))).size > 1;
  }

  function sortEvidenceRecords(records) {
    return records.slice().sort((left, right) => {
      const byTime = effectiveRecordTimestamp(right) - effectiveRecordTimestamp(left);
      if (byTime) return byTime;
      const byRevision = revisionRank(right && right.revision) - revisionRank(left && left.revision);
      if (byRevision) return byRevision;
      return Number(right && right.sourceRow || 0) - Number(left && left.sourceRow || 0);
    });
  }

  function resolvePostingEvidence(historyRow, matchedRecords) {
    const matched = Array.isArray(matchedRecords) ? matchedRecords : [];
    const sent = normalizeRevision(historyRow && historyRow.revisionSent);
    const identities = [...new Set(matched.map((item) => item.documentIdentity || documentIdentity(item.document)).filter(Boolean))];
    const revisions = uniqueSortedRevisions(matched.map((item) => item.revision));

    if (!historyRow || !historyRow.document || !sent) {
      return {
        status: STATUSES.REVIEW,
        revisionFound: "",
        revisionsFound: revisions,
        currentEvidence: false,
        ambiguity: false,
        evidence: null,
        note: !historyRow || !historyRow.document
          ? "O histórico não possui código documental suficiente para a conferência automática."
          : "A revisão enviada não está registrada de forma inequívoca no Histórico.",
      };
    }

    if (identities.length > 1) {
      return {
        status: STATUSES.REVIEW,
        revisionFound: revisions.join(" · "),
        revisionsFound: revisions,
        currentEvidence: false,
        ambiguity: true,
        evidence: null,
        note: `Mais de um documento da Consulta Geral corresponde às formas normalizadas pesquisadas (${matched.map((item) => item.document).filter(Boolean).slice(0, 4).join(" | ")}).`,
      };
    }

    if (!matched.length) return null;

    const exact = sortEvidenceRecords(matched.filter((item) => normalizeRevision(item.revision) === sent));
    if (exact.length) {
      const evidence = exact[0];
      return {
        status: STATUSES.CONFIRMED,
        revisionFound: sent,
        revisionsFound: revisions,
        currentEvidence: true,
        ambiguity: false,
        evidence,
        note: `Documento e revisão ${sent} localizados na Consulta Geral.`,
      };
    }

    if (!revisions.length) {
      return {
        status: STATUSES.REVIEW,
        revisionFound: "",
        revisionsFound: revisions,
        currentEvidence: false,
        ambiguity: false,
        evidence: null,
        note: "O documento foi localizado na Consulta Geral, porém a revisão da linha está vazia ou inválida para comparação.",
      };
    }

    return {
      status: STATUSES.REVISION_DIVERGENT,
      revisionFound: revisions.join(" · "),
      revisionsFound: revisions,
      currentEvidence: false,
      ambiguity: false,
      evidence: sortEvidenceRecords(matched)[0] || null,
      note: `Documento localizado, porém a revisão ${sent} ainda não foi confirmada. Revisão(ões) encontrada(s): ${revisions.join(" · ")}.`,
    };
  }

  function previousStateMap(previousState) {
    const source = previousState && previousState.items && typeof previousState.items === "object" ? previousState.items : {};
    return { ...source };
  }

  function compareOne(historyRow, baseRecords, index, previous, options) {
    const now = text(options && options.now) || new Date().toISOString();
    const waitHours = Math.max(0, Number(options && options.waitHours) || DEFAULT_WAIT_HOURS);
    const matched = matchedBaseRecords(historyRow, baseRecords, index);
    const sent = normalizeRevision(historyRow.revisionSent);
    let resolved = null;

    if (baseRecords.length) {
      resolved = resolvePostingEvidence(historyRow, matched);
      if (!resolved) {
        const age = hoursSince(historyRow.generatedAt, now);
        // A geração da eGRDT não comprova a data da postagem. Uma base mais
        // antiga que a emissão nunca prova ausência na data do envio.
        const referenceAt = parseSourceDate(options && options.baseReferenceDate);
        const emittedAt = parseSourceDate(historyRow.generatedAt);
        const basePrecedesEvent = Number.isFinite(referenceAt) && Number.isFinite(emittedAt)
          && referenceAt + 86400000 <= emittedAt;
        resolved = {
          status: basePrecedesEvent ? STATUSES.NOT_VERIFIED
            : age <= waitHours ? STATUSES.AWAITING : STATUSES.NOT_FOUND,
          revisionFound: "",
          revisionsFound: [],
          currentEvidence: false,
          ambiguity: false,
          evidence: null,
          note: basePrecedesEvent
            ? "Consulta Geral anterior à data de geração da eGRDT; esta base não permite verificar a ausência. Solicite uma Consulta Geral mais recente."
            : age <= waitHours
              ? `Ainda não confirmado na Consulta Geral. A eGRDT tem menos de ${waitHours} hora(s); a ausência não é tratada como falha.`
              : "Código não localizado na Consulta Geral atual. A ausência é uma pendência de confirmação e, isoladamente, não prova que a postagem não ocorreu.",
        };
      }
    } else {
      resolved = {
        status: STATUSES.NOT_VERIFIED,
        revisionFound: "",
        revisionsFound: [],
        currentEvidence: false,
        ambiguity: false,
        evidence: null,
        note: "Consulta Geral ainda não carregada.",
      };
    }

    const prior = previous || {};
    let firstConfirmedAt = text(prior.firstConfirmedAt);
    let confirmedRevision = text(prior.confirmedRevision);
    let confirmationSource = text(prior.confirmationSource);
    const historicalPreserved = Boolean(firstConfirmedAt && normalizeRevision(confirmedRevision) === sent);

    if (resolved.status === STATUSES.CONFIRMED) {
      if (!firstConfirmedAt) firstConfirmedAt = now;
      confirmedRevision = sent;
      confirmationSource = resolved.evidence
        ? `Consulta Geral SIGEM — ${text(resolved.evidence.status)}`
        : "Consulta Geral SIGEM";
    }

    const evidence = resolved.evidence || null;
    return {
      ...historyRow,
      status: resolved.status,
      statusLabel: statusLabel(resolved.status),
      revisionFound: resolved.revisionFound,
      revisionsFound: resolved.revisionsFound,
      firstConfirmedAt,
      confirmedRevision,
      confirmationSource,
      lastCheckedAt: now,
      currentEvidence: Boolean(resolved.currentEvidence),
      historicalPreserved: resolved.status === STATUSES.CONFIRMED ? false : historicalPreserved,
      note: resolved.note,
      matchedCount: matched.length,
      matchedDocuments: [...new Set(matched.map((item) => item.document).filter(Boolean))],
      postingEvidenceStatus: evidence ? text(evidence.status) : "",
      postingEvidenceRevision: evidence ? normalizeRevision(evidence.revision) : "",
      sigemStatus: evidence ? text(evidence.status) : "",
      sigemStatusRevision: evidence ? normalizeRevision(evidence.revision) : "",
      sigemSourceRow: evidence ? Number(evidence.sourceRow) || null : null,
      title: text(historyRow.title) || (evidence ? text(evidence.title) : ""),
      ambiguity: Boolean(resolved.ambiguity),
    };
  }

  function statusLabel(status) {
    return ({
      [STATUSES.CONFIRMED]: "Confirmado",
      [STATUSES.AWAITING]: "Aguardando confirmação",
      [STATUSES.REVISION_DIVERGENT]: "Aguardando retorno do SIGEM",
      [STATUSES.NOT_FOUND]: "Não encontrado",
      [STATUSES.REVIEW]: "Requer análise",
      [STATUSES.NOT_VERIFIED]: "Não verificado",
    })[status] || "Não verificado";
  }

  function aggregateStatus(rows) {
    if (!rows.length || rows.every((row) => row.status === STATUSES.NOT_VERIFIED)) return AGGREGATE_STATUSES.NOT_VERIFIED;
    if (rows.every((row) => row.status === STATUSES.CONFIRMED)) return AGGREGATE_STATUSES.CONFIRMED;
    if (rows.some((row) => [STATUSES.REVISION_DIVERGENT, STATUSES.REVIEW].includes(row.status))) return AGGREGATE_STATUSES.REVIEW;
    return AGGREGATE_STATUSES.PENDING;
  }

  function aggregateByGrdt(rows) {
    const groups = new Map();
    (rows || []).forEach((row) => {
      const key = row.historyId || row.egrdtNumber;
      if (!groups.has(key)) groups.set(key, { historyId: row.historyId, egrdtNumber: row.egrdtNumber, generatedAt: row.generatedAt, rows: [] });
      groups.get(key).rows.push(row);
    });
    return [...groups.values()].map((group) => {
      const counts = {
        total: group.rows.length,
        confirmed: group.rows.filter((row) => row.status === STATUSES.CONFIRMED).length,
        awaiting: group.rows.filter((row) => row.status === STATUSES.AWAITING).length,
        divergent: group.rows.filter((row) => row.status === STATUSES.REVISION_DIVERGENT).length,
        notFound: group.rows.filter((row) => row.status === STATUSES.NOT_FOUND).length,
        review: group.rows.filter((row) => row.status === STATUSES.REVIEW).length,
        notVerified: group.rows.filter((row) => row.status === STATUSES.NOT_VERIFIED).length,
      };
      const currentlyLocated = group.rows.filter((row) => row.status === STATUSES.CONFIRMED);
      const preservedOnly = group.rows.filter((row) => row.status !== STATUSES.CONFIRMED && row.historicalPreserved).length;
      const inTransit = group.rows.filter((row) => row.currentEvidence && row.sigemStatus
        && /^(EM ANALISE|EM WORKFLOW)$/.test(norm(row.sigemStatus))
        && normalizeRevision(row.sigemStatusRevision) === normalizeRevision(row.revisionSent)).length;
      const ambiguous = group.rows.filter((row) => row.ambiguity || row.status === STATUSES.REVIEW).length;
      const classification = counts.notVerified === counts.total ? "NAO_VERIFICADA"
        : counts.confirmed === counts.total ? "TOTALMENTE_CONFIRMADA"
          : counts.confirmed > 0 ? "PARCIALMENTE_CONFIRMADA"
            : preservedOnly || ambiguous || counts.notVerified ? "REQUER_INVESTIGACAO" : "NENHUM_DOCUMENTO_CONFIRMADO";
      return {
        ...group, ...counts, status: aggregateStatus(group.rows), classification,
        workspaceId: text(group.rows[0] && group.rows[0].workspaceId),
        confirmedOrPreserved: counts.confirmed + preservedOnly, preservedOnly, inTransit, ambiguous,
        distinctDocuments: new Set(group.rows.map((row) => row.documentIdentity || documentIdentity(row.document))).size,
        locatedDocuments: new Set(currentlyLocated.map((row) => row.documentIdentity || documentIdentity(row.document))).size,
        riskOfDuplicateResend: counts.confirmed + preservedOnly > 0 && counts.confirmed + preservedOnly < counts.total,
      };
    }).sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)));
  }

  // Sempre recebe a emissão completa: filtros e paginação não mudam sua abrangência.
  function pendingScope(group) {
    if (!group || !Array.isArray(group.rows) || !group.rows.length) return {
      label: "GRDT a verificar", detail: "Não foi possível conferir a GRDT completa.",
    };
    const total = group.rows.length;
    const pending = group.rows.filter(row => row.status !== STATUSES.CONFIRMED).length;
    const confirmed = total - pending;
    const historical = group.rows.some(row => row.status !== STATUSES.CONFIRMED && row.historicalPreserved);
    if (!pending) return { label: "Sem pendência", detail: `${total} de ${total} documentos/revisões confirmados.` };
    if (historical) return {
      label: confirmed ? "Parte da GRDT pendente" : "Conferência atual pendente",
      detail: `${pending} de ${total} documentos/revisões sem confirmação atual. Há confirmação histórica; não reenviar esses documentos.`,
    };
    return {
      label: pending === total ? "GRDT inteira pendente" : pending === 1 ? "Somente este documento pendente" : "Parte da GRDT pendente",
      detail: `${pending} de ${total} documentos/revisões pendentes; ${confirmed} confirmado(s) no SIGEM.`,
    };
  }

  // O diagnóstico é derivado de evidências verificáveis e não altera o estado da postagem.
  // allocationContext é resolvido pelas fontes oficiais do contrato ativo.
  function diagnoseRow(row, allocationContext, baseMeta) {
    const context = allocationContext || {};
    const kind = text(context.kind) || "unconfirmed";
    const confirmed = row.status === STATUSES.CONFIRMED && row.currentEvidence;
    const preserved = Boolean(row.historicalPreserved);
    const revision = normalizeRevision(row.revisionSent);
    const foundRevision = normalizeRevision(row.sigemStatusRevision);
    const sigemStatus = text(row.sigemStatus);
    const sameRevision = revision && revision === foundRevision;
    const workflow = sameRevision && /^(EM ANALISE|EM WORKFLOW)$/.test(norm(sigemStatus));
    const baseOlder = row.status === STATUSES.NOT_VERIFIED && /anterior/i.test(text(row.note));
    let action = "ANÁLISE MANUAL OBRIGATÓRIA";
    let evidenceLevel = "CAUSA INDETERMINADA";
    let reason = text(row.note) || "Dados insuficientes para concluir a conferência.";
    if (confirmed || preserved) {
      action = "NÃO REENVIAR";
      evidenceLevel = "SITUAÇÃO CONSTATADA";
      if (preserved && !confirmed) reason = "Confirmação histórica preservada; conferir a evidência atual antes de qualquer ação.";
      else if (workflow) reason = `Documento/revisão ${revision} localizados no SIGEM. Status atual: ${sigemStatus}. Acompanhar o processamento, sem repostar.`;
      else reason = `Documento/revisão ${revision} localizados na Consulta Geral.`;
    } else if (row.status === STATUSES.REVISION_DIVERGENT) {
      action = "INVESTIGAR REVISÃO";
      evidenceLevel = "SITUAÇÃO CONSTATADA";
      reason = `Revisão ${revision || "não informada"} não localizada. Revisão(ões) encontradas: ${text(row.revisionFound) || "não informadas"}.${sigemStatus ? ` Status ${sigemStatus} da revisão ${foundRevision || "não identificada"}.` : ""}`;
    } else if (row.status === STATUSES.AWAITING) {
      action = "AGUARDAR CONFIRMAÇÃO";
      evidenceLevel = "SITUAÇÃO CONSTATADA";
    } else if (row.status === STATUSES.NOT_FOUND) {
      action = kind === "not_allocated" ? "VERIFICAR ALOCAÇÃO" : "AVALIAR REENVIO";
      evidenceLevel = kind === "not_allocated" ? "INDÍCIO DE POSSÍVEL CAUSA" : "CAUSA INDETERMINADA";
      reason = kind === "not_allocated"
        ? "Documento não encontrado em Documentos Previstos. Possível pendência de alocação; não é prova de rejeição pelo SIGEM."
        : kind === "allocated"
          ? "Documento consta em Documentos Previstos, porém não foi localizado na Consulta Geral. Verificar atualização e retorno do SIGEM."
          : "Documento não localizado na Consulta Geral; não foi possível confirmar a situação de alocação.";
    } else if (baseOlder) {
      action = "AGUARDAR BASE ATUALIZADA";
      evidenceLevel = "SITUAÇÃO CONSTATADA";
    } else if (row.status === STATUSES.NOT_VERIFIED) {
      action = "ANÁLISE MANUAL OBRIGATÓRIA";
    }
    if (row.ambiguity) {
      action = "ANÁLISE MANUAL OBRIGATÓRIA";
      evidenceLevel = "CAUSA INDETERMINADA";
    }
    return {
      presence: confirmed ? "DOCUMENTO E REVISÃO LOCALIZADOS"
        : row.status === STATUSES.REVISION_DIVERGENT ? "OUTRA REVISÃO LOCALIZADA"
          : row.status === STATUSES.NOT_VERIFIED ? "NÃO VERIFICADO" : "SEM CONFIRMAÇÃO DA REVISÃO",
      statusSigem: sigemStatus || "Não informado",
      statusSigemRevision: foundRevision,
      allocationKind: kind,
      allocations: Array.isArray(context.allocations) ? context.allocations : [],
      allocationReferences: Array.isArray(context.references) ? context.references : [],
      allocationWarnings: Array.isArray(context.warnings) ? context.warnings : [],
      plannedSnapshotId: text(context.plannedSnapshotId),
      centralSnapshotId: text(context.centralSnapshotId),
      baseReferenceDate: text(baseMeta && baseMeta.referenceDate),
      baseFileName: text(baseMeta && baseMeta.fileName),
      evidenceLevel, reason, action,
      canPreselectResend: false, // Decisão sempre manual após verificar SIGEM e alocação.
    };
  }

  function repostEligibility(row) {
    if (!row || row.status === STATUSES.CONFIRMED || row.historicalPreserved) {
      return { eligible: false, reason: "Já confirmado: não reenviar." };
    }
    if (row.ambiguity || ![STATUSES.NOT_FOUND, STATUSES.AWAITING, STATUSES.REVISION_DIVERGENT].includes(row.status)) {
      return { eligible: false, reason: "Atualize a base e resolva a análise antes de selecionar." };
    }
    if (!text(row.key) || !normalizeRevision(row.revisionSent)) {
      return { eligible: false, reason: "Documento/revisão não identificados." };
    }
    return { eligible: true, reason: row.status === STATUSES.AWAITING
      ? "Ainda no prazo de confirmação. Verifique o retorno antes de reenviar."
      : row.status === STATUSES.REVISION_DIVERGENT
        ? "Outra revisão localizada. Confirme a revisão enviada antes de reenviar."
        : "Sem confirmação na base atual. Verifique alocação e retorno antes de reenviar." };
  }

  function summarize(rows) {
    const source = rows || [];
    const confirmed = source.filter((row) => row.status === STATUSES.CONFIRMED).length;
    return {
      total: source.length,
      confirmed,
      awaiting: source.filter((row) => row.status === STATUSES.AWAITING).length,
      divergent: source.filter((row) => row.status === STATUSES.REVISION_DIVERGENT).length,
      notFound: source.filter((row) => row.status === STATUSES.NOT_FOUND).length,
      review: source.filter((row) => row.status === STATUSES.REVIEW).length,
      notVerified: source.filter((row) => row.status === STATUSES.NOT_VERIFIED).length,
      percentConfirmed: source.length ? Math.round((confirmed / source.length) * 10000) / 100 : 0,
    };
  }

  function reconcile(historyRecords, baseRecords, previousState, options) {
    const historyRows = flattenHistory(historyRecords);
    const base = Array.isArray(baseRecords) ? baseRecords : [];
    const index = buildBaseIndex(base);
    const previousItems = previousStateMap(previousState);
    const nextItems = {};
    const rows = historyRows.map((historyRow) => {
      const row = compareOne(historyRow, base, index, previousItems[historyRow.key], options);
      nextItems[historyRow.key] = {
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
      return row;
    });

    const changes = {
      newlyConfirmed: rows.filter((row) => row.status === STATUSES.CONFIRMED && previousItems[row.key] && previousItems[row.key].lastStatus !== STATUSES.CONFIRMED).length
        + rows.filter((row) => row.status === STATUSES.CONFIRMED && !previousItems[row.key]).length,
      divergencesResolved: rows.filter((row) => row.status === STATUSES.CONFIRMED && previousItems[row.key] && previousItems[row.key].lastStatus === STATUSES.REVISION_DIVERGENT).length,
      statusChanged: rows.filter((row) => previousItems[row.key] && previousItems[row.key].lastStatus !== row.status).length,
    };

    const groups = aggregateByGrdt(rows);
    return {
      rows,
      groups,
      summary: summarize(rows),
      changes,
      state: { version: 1, updatedAt: text(options && options.now) || new Date().toISOString(), items: nextItems },
    };
  }

  function storageOf() {
    try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (_) { return null; }
  }

  function readPreferences() {
    const storage = storageOf();
    if (!storage) return { waitHours: DEFAULT_WAIT_HOURS };
    try {
      const parsed = JSON.parse(storage.getItem(PREFS_KEY) || "{}");
      return { waitHours: Math.max(0, Number(parsed.waitHours) || DEFAULT_WAIT_HOURS) };
    } catch (_) { return { waitHours: DEFAULT_WAIT_HOURS }; }
  }

  function savePreferences(preferences) {
    const next = { waitHours: Math.max(0, Number(preferences && preferences.waitHours) || DEFAULT_WAIT_HOURS) };
    const storage = storageOf();
    if (storage) {
      try { storage.setItem(PREFS_KEY, JSON.stringify(next)); } catch (_) { /* local preference only */ }
    }
    return next;
  }

  function openDb() {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Não foi possível abrir o armazenamento local da conferência."));
    });
  }

  function storedValue(record, fallback) {
    if (record === undefined) return fallback;
    if (record && typeof record === "object"
      && Object.prototype.hasOwnProperty.call(record, "key")
      && Object.prototype.hasOwnProperty.call(record, "value")) return record.value;
    return record;
  }

  function putKv(store, key, value) {
    if (store.keyPath) store.put({ key, value });
    else store.put(value, key);
  }

  async function kvGet(key, fallback) {
    const db = await openDb();
    if (!db) return fallback;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => { db.close(); resolve(storedValue(request.result, fallback)); };
      request.onerror = () => { db.close(); reject(request.error || new Error("Falha ao ler a conferência local.")); };
    });
  }

  async function kvSetMany(entries) {
    const db = await openDb();
    if (!db) return false;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      (entries || []).forEach(([key, value]) => putKv(store, key, value));
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error("Falha ao salvar a conferência local.")); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error("A gravação da conferência foi cancelada.")); };
    });
  }

  async function kvSet(key, value) {
    await kvSetMany([[key, value]]);
    return true;
  }

  async function loadBase() { return kvGet(BASE_KEY, { meta: null, records: [] }); }
  async function saveBase(base) { await kvSet(BASE_KEY, base); return base; }
  async function loadState() { return kvGet(STATE_KEY, { version: 1, updatedAt: "", items: {} }); }
  async function saveState(state) { await kvSet(STATE_KEY, state); return state; }
  async function loadAudit() { return kvGet(AUDIT_KEY, []); }
  async function saveAudit(entries) { await kvSet(AUDIT_KEY, (entries || []).slice(0, MAX_AUDIT)); return entries; }

  function writeHistoryIndex(groups, baseMeta) {
    const storage = storageOf();
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
      if (group.egrdtNumber) byNumber[norm(group.egrdtNumber)] = compact;
    });
    try {
      storage.setItem(HISTORY_INDEX_KEY, JSON.stringify({ byId, byNumber, baseUpdatedAt: text(baseMeta && baseMeta.importedAt), savedAt: new Date().toISOString() }));
      return true;
    } catch (_) { return false; }
  }

  function readHistoryIndex() {
    const storage = storageOf();
    if (!storage) return { byId: {}, byNumber: {}, baseUpdatedAt: "", savedAt: "" };
    try {
      const parsed = JSON.parse(storage.getItem(HISTORY_INDEX_KEY) || "{}");
      return { byId: parsed.byId || {}, byNumber: parsed.byNumber || {}, baseUpdatedAt: text(parsed.baseUpdatedAt), savedAt: text(parsed.savedAt) };
    } catch (_) { return { byId: {}, byNumber: {}, baseUpdatedAt: "", savedAt: "" }; }
  }

  function historyAggregate(recordOrId, number) {
    const index = readHistoryIndex();
    if (recordOrId && typeof recordOrId === "object") {
      const stable = historyStableId(recordOrId);
      return index.byId[stable] || index.byId[text(recordOrId.id)] || index.byNumber[norm(recordOrId.egrdtNumber)] || null;
    }
    return index.byId[text(recordOrId)] || index.byNumber[norm(number || recordOrId)] || null;
  }

  async function reconcilePersisted(historyRecords, options) {
    const [base, previousState] = await Promise.all([loadBase(), loadState()]);
    const prefs = readPreferences();
    const result = reconcile(historyRecords || (History && History.read ? History.read() : []), base.records || [], previousState, { ...prefs, ...(options || {}), baseReferenceDate: text(base.meta && base.meta.referenceDate) });
    await saveState(result.state);
    writeHistoryIndex(result.groups, base.meta);
    return { ...result, baseMeta: base.meta || null };
  }

  async function prepareWorkbookImport(workbook, fileMeta, historyRecords, options) {
    const parsed = parseWorkbook(workbook, fileMeta);
    return prepareParsedImport(parsed, historyRecords, options);
  }

  async function prepareParsedImport(parsed, historyRecords, options) {
    if (!parsed.ok) throw new Error((parsed.errors || []).join(" ") || "Não foi possível ler a Consulta Geral.");
    const [previousBase, previousState, audit] = await Promise.all([loadBase(), loadState(), loadAudit()]);
    const base = { meta: parsed.meta, records: parsed.records };
    const prefs = readPreferences();
    const result = reconcile(
      historyRecords || (History && History.read ? History.read() : []),
      base.records,
      previousState,
      { ...prefs, ...(options || {}), baseReferenceDate: text(base.meta && base.meta.referenceDate) }
    );
    const entry = {
      id: `${parsed.meta.importedAt}|${parsed.meta.fileName}`,
      at: parsed.meta.importedAt,
      fileName: parsed.meta.fileName,
      recordCount: parsed.meta.recordCount,
      sourceRowCount: parsed.meta.sourceRowCount,
      duplicateCount: parsed.meta.duplicateCount,
      invalidCount: parsed.meta.invalidCount,
      headerRow: parsed.meta.headerRow,
      newConfirmed: result.changes.newlyConfirmed,
      divergencesResolved: result.changes.divergencesResolved,
      pending: result.summary.awaiting + result.summary.notFound,
      previousFileName: text(previousBase && previousBase.meta && previousBase.meta.fileName),
      errors: [],
    };
    const nextAudit = [entry, ...audit.filter((item) => item.id !== entry.id)].slice(0, MAX_AUDIT);
    return {
      ...result,
      parsed,
      auditEntry: entry,
      prepared: { base, state: result.state, audit: nextAudit, groups: result.groups },
    };
  }

  async function commitPreparedImport(preparedResult) {
    const prepared = preparedResult && preparedResult.prepared;
    if (!prepared || !prepared.base || !prepared.state || !Array.isArray(prepared.audit)) {
      throw new Error("Importação preparada inválida; nenhuma base foi alterada.");
    }
    await kvSetMany([
      [BASE_KEY, prepared.base],
      [STATE_KEY, prepared.state],
      [AUDIT_KEY, prepared.audit],
    ]);
    writeHistoryIndex(prepared.groups || [], prepared.base.meta);
    return preparedResult;
  }

  async function importWorkbook(workbook, fileMeta, historyRecords, options) {
    const prepared = await prepareWorkbookImport(workbook, fileMeta, historyRecords, options);
    await commitPreparedImport(prepared);
    return prepared;
  }

  function filterRows(rows, filters) {
    const f = filters || {};
    const search = norm(f.search);
    const code = norm(f.document);
    const grdt = norm(f.grdt);
    const family = norm(f.family);
    const discipline = norm(f.discipline);
    const revision = normalizeRevision(f.revision);
    const status = text(f.status);
    const start = text(f.startDate);
    const end = text(f.endDate);
    const documentList = String(f.documentList || "")
      .split(/[\r\n,;|\t]+/)
      .map(text)
      .filter(Boolean);
    const wantedDocuments = new Set(documentList.flatMap((document) => documentKeys(document).map(norm)).filter(Boolean));
    return (rows || []).filter((row) => {
      if (search && !norm([row.document, row.egrdtNumber, row.discipline, row.documentFamily, row.revisionSent, row.revisionFound, row.statusLabel, row.note].join(" ")).includes(search)) return false;
      if (code && !norm(row.document).includes(code)) return false;
      if (wantedDocuments.size) {
        const rowKeys = documentKeys(row.document).map(norm);
        if (!rowKeys.some((rowKey) => wantedDocuments.has(rowKey))) return false;
      }
      if (grdt && !norm(row.egrdtNumber).includes(grdt)) return false;
      if (family && norm(row.documentFamily) !== family) return false;
      if (discipline && norm(row.discipline) !== discipline) return false;
      if (revision && normalizeRevision(row.revisionSent) !== revision) return false;
      if (status && row.status !== status) return false;
      const dateKey = text(row.generatedAt).slice(0, 10);
      if (start && dateKey && dateKey < start) return false;
      if (end && dateKey && dateKey > end) return false;
      return true;
    });
  }

  function priorityRank(status) {
    return ({ [STATUSES.REVIEW]: 0, [STATUSES.REVISION_DIVERGENT]: 1, [STATUSES.NOT_FOUND]: 2, [STATUSES.AWAITING]: 3, [STATUSES.CONFIRMED]: 4, [STATUSES.NOT_VERIFIED]: 5 })[status] ?? 9;
  }

  function pendingRows(rows) {
    return (rows || []).filter((row) => row.status !== STATUSES.CONFIRMED)
      .sort((a, b) => priorityRank(a.status) - priorityRank(b.status) || String(a.generatedAt).localeCompare(String(b.generatedAt)));
  }

  function pertinentGrdt(row) {
    const grdt = text(row.latestEgrdtNumber || row.egrdtNumber || row.sends?.[0]?.egrdtNumber).replace(/\s+/g, " ");
    // Historical identifiers can be numeric or include a contract prefix.
    // Labels and placeholders cannot identify a GRDT.
    return /\d/.test(grdt) ? grdt : "";
  }

  function pendingGrdts(rows) {
    const groups = new Map();
    let missing = 0;
    for (const row of rows || []) {
      // Use the same pertinent (latest) GRDT shown by the document detail.
      const grdt = pertinentGrdt(row);
      if (!grdt) { missing++; continue; }
      const key = grdt.toLocaleUpperCase("pt-BR");
      if (!groups.has(key)) groups.set(key, { grdt, documentCount: 0 });
      groups.get(key).documentCount++;
    }
    const grdts = Array.from(groups.values()).sort((a, b) => a.grdt.localeCompare(b.grdt, "pt-BR", { numeric: true, sensitivity: "base" }));
    return { documentCount: (rows || []).length, grdtCount: grdts.length, missing, grdts };
  }

  return Object.freeze({
    DB_NAME, DB_VERSION, BASE_KEY, STATE_KEY, AUDIT_KEY, HISTORY_INDEX_KEY, PREFS_KEY,
    DEFAULT_WAIT_HOURS, STATUSES, AGGREGATE_STATUSES, HEADER_ALIASES,
    text, norm, normalizeRevision, normalizeHeader, documentKeys, documentIdentity, displayDocument, revisionRank,
    isPostedSigemStatus, parseSourceDate, effectiveRecordTimestamp, resolvePostingEvidence,
    detectColumns, parseMatrix, parseWorkbook, flattenHistory, buildBaseIndex, reconcile, summarize, aggregateByGrdt,
    statusLabel, aggregateStatus, pendingScope, diagnoseRow, repostEligibility, filterRows, pendingRows, pertinentGrdt, pendingGrdts,
    readPreferences, savePreferences, loadBase, saveBase, loadState, saveState, loadAudit,
    kvGet, kvSet, kvSetMany, storedValue, putKv,
    readHistoryIndex, historyAggregate, reconcilePersisted, prepareWorkbookImport, prepareParsedImport, commitPreparedImport, importWorkbook,
  });
});
