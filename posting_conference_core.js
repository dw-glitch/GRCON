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

  function parseMatrix(matrix, options) {
    const detection = detectColumns(matrix, options && options.maxHeaderRows);
    if (!detection) {
      return {
        ok: false,
        records: [],
        meta: { recordCount: 0, duplicateCount: 0, invalidCount: 0, headerRow: 0, columns: {} },
        errors: ["Não foi possível identificar simultaneamente as colunas Documento e Revisão da Consulta Geral."],
      };
    }

    const rows = matrix.slice(detection.rowIndex + 1);
    const records = [];
    const dedupe = new Map();
    let invalidCount = 0;
    let duplicateCount = 0;

    rows.forEach((row, offset) => {
      const document = rowValue(row, detection.columns.document);
      const revision = normalizeRevision(rowValue(row, detection.columns.revision));
      if (!document) return;
      const keys = documentKeys(document);
      if (!keys.length) {
        invalidCount += 1;
        return;
      }
      const identity = documentIdentity(document);
      const dedupeKey = `${identity}|${revision}`;
      const record = {
        id: dedupeKey,
        document: displayDocument(document),
        documentIdentity: identity,
        searchKeys: keys,
        revision,
        modifiedAt: rowValue(row, detection.columns.modifiedAt),
        includedAt: rowValue(row, detection.columns.includedAt),
        title: rowValue(row, detection.columns.title),
        status: rowValue(row, detection.columns.status),
        documentType: rowValue(row, detection.columns.documentType),
        situation: rowValue(row, detection.columns.situation),
        observation: rowValue(row, detection.columns.observation),
        sourceRow: detection.headerRow + offset + 1,
      };
      if (dedupe.has(dedupeKey)) {
        duplicateCount += 1;
        const previous = dedupe.get(dedupeKey);
        const merged = { ...previous };
        ["modifiedAt", "includedAt", "title", "status", "documentType", "situation", "observation"].forEach((field) => {
          if (!text(merged[field]) && text(record[field])) merged[field] = record[field];
        });
        dedupe.set(dedupeKey, merged);
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
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: false });
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
    const seen = new Set();
    (records || []).forEach((rawRecord) => {
      const record = History && typeof History.cleanRecord === "function" ? History.cleanRecord(rawRecord) : rawRecord || {};
      const stableId = historyStableId(record);
      (record.files || []).forEach((file) => {
        const document = text(file && file.document);
        const revision = sentRevision(file);
        if (!document) return;
        const identity = documentIdentity(document);
        const rowKey = `${stableId}|${identity}|${revision}`;
        if (seen.has(rowKey)) return;
        seen.add(rowKey);
        result.push({
          key: rowKey,
          historyId: stableId,
          historyRecordId: text(record.id),
          egrdtNumber: text(record.egrdtNumber),
          generatedAt: text(record.generatedAt),
          document: displayDocument(document),
          documentIdentity: identity,
          searchKeys: documentKeys(document),
          revisionSent: revision,
          documentFamily: documentFamily(file),
          discipline: text(file && file.discipline),
          sheet: text(file && file.sheet),
          sourceName: text(record.sourceName),
          ldName: text(record.ldName),
        });
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

  function previousStateMap(previousState) {
    const source = previousState && previousState.items && typeof previousState.items === "object" ? previousState.items : {};
    return { ...source };
  }

  function compareOne(historyRow, baseRecords, index, previous, options) {
    const now = text(options && options.now) || new Date().toISOString();
    const waitHours = Math.max(0, Number(options && options.waitHours) || DEFAULT_WAIT_HOURS);
    const matched = matchedBaseRecords(historyRow, baseRecords, index);
    const identities = [...new Set(matched.map((item) => item.documentIdentity || documentIdentity(item.document)).filter(Boolean))];
    const revisions = uniqueSortedRevisions(matched.map((item) => item.revision));
    const sent = normalizeRevision(historyRow.revisionSent);
    let status = STATUSES.NOT_VERIFIED;
    let note = "Consulta Geral ainda não carregada.";
    let currentEvidence = false;
    let foundRevision = "";

    if (baseRecords.length) {
      if (!historyRow.document || !sent) {
        status = STATUSES.REVIEW;
        note = !historyRow.document ? "O histórico não possui código documental suficiente para a conferência automática." : "A revisão enviada não está registrada de forma inequívoca no Histórico.";
      } else if (identities.length > 1) {
        status = STATUSES.REVIEW;
        note = `Mais de um documento da Consulta Geral corresponde às formas normalizadas pesquisadas (${matched.map((item) => item.document).filter(Boolean).slice(0, 4).join(" | ")}).`;
      } else if (matched.length) {
        const exact = matched.filter((item) => normalizeRevision(item.revision) === sent);
        if (exact.length) {
          status = STATUSES.CONFIRMED;
          currentEvidence = true;
          foundRevision = sent;
          note = `Documento e revisão ${sent} localizados na Consulta Geral.`;
        } else if (!revisions.length) {
          status = STATUSES.REVIEW;
          note = "O documento foi localizado na Consulta Geral, porém a revisão da linha está vazia ou inválida para comparação.";
        } else {
          status = STATUSES.REVISION_DIVERGENT;
          foundRevision = revisions.join(" · ");
          note = `Documento localizado, porém a revisão ${sent} ainda não foi confirmada. Revisão(ões) encontrada(s): ${foundRevision}.`;
        }
      } else {
        const age = hoursSince(historyRow.generatedAt, now);
        status = age <= waitHours ? STATUSES.AWAITING : STATUSES.NOT_FOUND;
        note = status === STATUSES.AWAITING
          ? `Ainda não confirmado na Consulta Geral. A eGRDT tem menos de ${waitHours} hora(s); a ausência não é tratada como falha.`
          : "Código não localizado na Consulta Geral atual. A ausência é uma pendência de confirmação e, isoladamente, não prova que a postagem não ocorreu.";
      }
    }

    const prior = previous || {};
    let firstConfirmedAt = text(prior.firstConfirmedAt);
    let confirmedRevision = text(prior.confirmedRevision);
    let confirmationSource = text(prior.confirmationSource);
    let historicalPreserved = false;

    if (status === STATUSES.CONFIRMED) {
      if (!firstConfirmedAt) firstConfirmedAt = now;
      confirmedRevision = sent;
      confirmationSource = "Consulta Geral SIGEM";
    } else if (firstConfirmedAt && normalizeRevision(confirmedRevision) === sent) {
      status = STATUSES.CONFIRMED;
      historicalPreserved = true;
      note = `Confirmação histórica preservada desde ${firstConfirmedAt}. A revisão ${sent} não foi reencontrada na Consulta Geral atual; confira a base se necessário.`;
    }

    return {
      ...historyRow,
      status,
      statusLabel: statusLabel(status),
      revisionFound: foundRevision || (status === STATUSES.CONFIRMED ? sent : revisions.join(" · ")),
      revisionsFound: revisions,
      firstConfirmedAt,
      confirmedRevision,
      confirmationSource,
      lastCheckedAt: now,
      currentEvidence,
      historicalPreserved,
      note,
      matchedCount: matched.length,
      matchedDocuments: [...new Set(matched.map((item) => item.document).filter(Boolean))],
    };
  }

  function statusLabel(status) {
    return ({
      [STATUSES.CONFIRMED]: "Confirmado",
      [STATUSES.AWAITING]: "Aguardando confirmação",
      [STATUSES.REVISION_DIVERGENT]: "Revisão divergente",
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
      return { ...group, ...counts, status: aggregateStatus(group.rows) };
    }).sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)));
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

  async function kvGet(key, fallback) {
    const db = await openDb();
    if (!db) return fallback;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => { db.close(); resolve(request.result ? request.result.value : fallback); };
      request.onerror = () => { db.close(); reject(request.error || new Error("Falha ao ler a conferência local.")); };
    });
  }

  async function kvSet(key, value) {
    const db = await openDb();
    if (!db) return false;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key, value });
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error("Falha ao salvar a conferência local.")); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error("A gravação da conferência foi cancelada.")); };
    });
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
    const result = reconcile(historyRecords || (History && History.read ? History.read() : []), base.records || [], previousState, { ...prefs, ...(options || {}) });
    await saveState(result.state);
    writeHistoryIndex(result.groups, base.meta);
    return { ...result, baseMeta: base.meta || null };
  }

  async function importWorkbook(workbook, fileMeta, historyRecords, options) {
    const parsed = parseWorkbook(workbook, fileMeta);
    if (!parsed.ok) throw new Error(parsed.errors.join(" ") || "Não foi possível ler a Consulta Geral.");
    const previousBase = await loadBase();
    const base = { meta: parsed.meta, records: parsed.records };
    await saveBase(base);
    const result = await reconcilePersisted(historyRecords, options);
    const audit = await loadAudit();
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
    await saveAudit([entry, ...audit.filter((item) => item.id !== entry.id)]);
    return { ...result, parsed, auditEntry: entry };
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
    return (rows || []).filter((row) => {
      if (search && !norm([row.document, row.egrdtNumber, row.discipline, row.documentFamily, row.revisionSent, row.revisionFound, row.statusLabel, row.note].join(" ")).includes(search)) return false;
      if (code && !norm(row.document).includes(code)) return false;
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

  return Object.freeze({
    DB_NAME, DB_VERSION, BASE_KEY, STATE_KEY, AUDIT_KEY, HISTORY_INDEX_KEY, PREFS_KEY,
    DEFAULT_WAIT_HOURS, STATUSES, AGGREGATE_STATUSES, HEADER_ALIASES,
    text, norm, normalizeRevision, normalizeHeader, documentKeys, documentIdentity, displayDocument,
    detectColumns, parseMatrix, parseWorkbook, flattenHistory, buildBaseIndex, reconcile, summarize, aggregateByGrdt,
    statusLabel, aggregateStatus, filterRows, pendingRows,
    readPreferences, savePreferences, loadBase, saveBase, loadState, saveState, loadAudit,
    readHistoryIndex, historyAggregate, reconcilePersisted, importWorkbook,
  });
});
