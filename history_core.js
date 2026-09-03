(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconHistory = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE_KEY = "grcon.egrdt.history.v1";
  // O navegador mantém uma cópia de trabalho recente. No modo compartilhado,
  // o conjunto completo é lido do Supabase em páginas e reconciliado aqui.
  const MAX_RECORDS = 1000;
  const MAX_BYTES = 4500000;

  const _U = (typeof globalThis !== "undefined" ? globalThis : this).GrconUtils || {};
  function text(value) { return _U.text ? _U.text(value) : String(value === null || value === undefined ? "" : value).trim(); }
  function norm(value) { return _U.norm ? _U.norm(value) : text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toUpperCase(); }
  function pad(value) { return _U.pad ? _U.pad(value, 2) : String(value).padStart(2, "0"); }
  function byteSize(value) { return _U.byteSize ? _U.byteSize(value) : (function() { try { return unescape(encodeURIComponent(String(value))).length; } catch (_) { console.debug("[HistoryCore] byteSize fallback:", _); return String(value).length; } })(); }
  function storageOf(storage) { return _U.storageOf ? _U.storageOf(storage) : (storage || (typeof localStorage !== "undefined" ? localStorage : null)); }

  // Famílias documentais usadas no filtro do histórico. A classificação segue
  // as mesmas convenções da triagem e também funciona em registros antigos,
  // nos quais a família pode precisar ser inferida pelo código do documento.
  const HISTORY_FAMILIES = Object.freeze(["N-1710", "ET", "CV"]);
  const HISTORY_N1710_CATEGORIES = new Set([
    "CE", "CR", "DB", "DE", "EC", "ET", "FD", "IM", "IS", "LA",
    "LD", "LI", "LO", "MA", "MC", "MD", "MO", "PR", "PT", "RL",
    "RM", "CT", "SIT",
  ]);
  const HISTORY_CV_RE = /^5900(?:\.\d+){3}-[A-Z0-9]{3}-CV-[A-Z0-9]+-\d{3,4}(?:_|$)/i;
  const HISTORY_ET_RE = /(?:^|[^A-Z0-9])[A-Z0-9]{3}_RNEST_[A-Z0-9]+_\d+(?:\.\d+){3}_[A-Z0-9]+_[A-Z0-9][A-Z0-9.-]*_/i;

  function normalizedHistoryFamily(value) {
    const wanted = norm(value).replace(/_/g, "-");
    if (!wanted || wanted === "TODOS" || wanted === "TODAS") return "";
    if (wanted === "N1710" || wanted === "N-1710") return "N-1710";
    if (wanted === "ET") return "ET";
    if (wanted === "CV") return "CV";
    return "";
  }

  function documentFamily(fileOrValue, sheetName) {
    const file = fileOrValue && typeof fileOrValue === "object" ? fileOrValue : null;
    const sheet = norm(file ? file.sheet : sheetName);
    if (/^N-?1710(?:\s|$)/.test(sheet)) return "N-1710";
    if (sheet === "CV") return "CV";
    // RIR e C&M são subdivisões operacionais da família ET nas LDs antigas.
    if (sheet === "ET" || sheet === "RIR" || sheet === "C&M" || sheet === "C & M" || sheet === "CM") return "ET";

    const candidates = file ? [file.document, file.finalName, file.originalName] : [fileOrValue];
    for (const candidateValue of candidates) {
      let candidate = norm(candidateValue);
      if (!candidate) continue;
      candidate = candidate.split(/[\/\\]/).pop().replace(/\.(?:PDF|DOCX?|XLSX?|XLSM|DWG|DGN|PPTX?)$/i, "");
      if (HISTORY_CV_RE.test(candidate)) return "CV";
      if (HISTORY_ET_RE.test(candidate)) return "ET";
      const canonical = candidate.replace(/^NT-/, "");
      const parts = canonical.split("-");
      const first = parts[0] || "";
      const category = /^[IAFLED]$/.test(first) ? (parts[1] || "") : first;
      if (HISTORY_N1710_CATEGORIES.has(category) && canonical.includes("-5290.00-")) return "N-1710";
    }
    return "";
  }

  function recordFamilies(record) {
    return [...new Set((record && record.files || []).map((file) => documentFamily(file)).filter(Boolean))];
  }

  function filterByDocumentFamily(records, family) {
    const wanted = normalizedHistoryFamily(family);
    if (!wanted) return [...(records || [])];
    return (records || []).map((record) => {
      const files = (record.files || []).filter((file) => documentFamily(file) === wanted);
      if (!files.length) return null;
      return cleanRecord({ ...record, files, allocations: files.map((file) => file.allocation).filter(Boolean) });
    }).filter(Boolean);
  }

  function parseDateValue(value) {
    if (_U.parseDateValue) return _U.parseDateValue(value);
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === "number" && Number.isFinite(value)) {
      const numericDate = new Date(value);
      return Number.isNaN(numericDate.getTime()) ? null : numericDate;
    }
    const raw = text(value);
    if (!raw) return null;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!br) return null;
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    const hour = Number(br[4] || 0);
    const minute = Number(br[5] || 0);
    const second = Number(br[6] || 0);
    const local = new Date(year, month - 1, day, hour, minute, second, 0);
    if (Number.isNaN(local.getTime())) return null;
    return local;
  }

  function normalizeGeneratedAt(value) {
    const parsed = parseDateValue(value);
    return parsed ? parsed.toISOString() : text(value) || new Date().toISOString();
  }

  function generatedRevision(file) {
    const explicit = text(file && (file.grdtRevision || file.revision));
    if (explicit) return explicit;
    const document = text(file && file.document);
    const finalName = text(file && file.finalName);
    if (!document || !finalName) return "";
    const stem = finalName.replace(/\.[^.]+$/, "");
    const normalizedStem = norm(stem);
    const bases = [`${document}_0001`, document].sort((left, right) => right.length - left.length);
    for (const base of bases) {
      const normalizedBase = norm(base);
      if (normalizedStem === normalizedBase) return "0";
      if (!normalizedStem.startsWith(`${normalizedBase}_`)) continue;
      const candidate = normalizedStem.slice(normalizedBase.length + 1).trim();
      if (/^(?:0|[A-HJ-NP-Z]+)$/.test(candidate)) return candidate;
    }
    return "";
  }

  function revisionFromVerifiedGrdt(file, entry, entryIndex, row) {
    const verificationRows = file && file.verification && file.verification.valid !== false && Array.isArray(file.verification.rows)
      ? file.verification.rows
      : [];
    const wantedDocument = norm(entry && entry.document || row && row.document);
    const wantedFileName = norm(entry && (entry.finalName || entry.item && entry.item.fileName));
    let reopened = verificationRows[entryIndex] || null;
    if (reopened && wantedDocument && norm(reopened.document) !== wantedDocument) reopened = null;
    if (!reopened && wantedFileName) {
      reopened = verificationRows.find((item) => norm(item && item.fileName) === wantedFileName) || null;
    }
    if (!reopened && wantedDocument) {
      reopened = verificationRows.find((item) => norm(item && item.document) === wantedDocument) || null;
    }
    const verifiedRevision = text(reopened && reopened.revision);
    if (verifiedRevision) {
      return { revision: verifiedRevision, source: "Arquivo eGRDT .xls reaberto e verificado" };
    }
    return {
      revision: text(entry && entry.item && entry.item.revision) || text(entry && entry.revision) || text(row && row.egrdt && row.egrdt.revision) || text(row && row.revision),
      source: "Dados usados para gerar a eGRDT",
    };
  }

  function cleanFile(file) {
    const revision = generatedRevision(file);
    return {
      document: text(file && file.document),
      title: text(file && file.title),
      originalName: text(file && file.originalName),
      finalName: text(file && file.finalName),
      revision,
      grdtRevision: text(file && file.grdtRevision) || revision,
      revisionSource: text(file && file.revisionSource) || (revision ? "Histórico registrado" : ""),
      // Rastreabilidade da escolha manual de revisão (melhoria "escolha manual
      // de revisão na GRDT"): preserva o que o sistema sugeriu na triagem,
      // independente da revisão efetivamente enviada acima. Registros antigos
      // não têm este campo — revisionSuggested cai para a própria revisão
      // enviada e revisionManual para "não alterada", sem quebrar o histórico.
      revisionSuggested: text(file && file.revisionSuggested) || revision,
      revisionManual: Boolean(file && file.revisionManual),
      // Rastreabilidade da edição manual de revisão *depois* de a eGRDT já
      // estar no histórico (diferente de revisionManual/revisionSuggested,
      // que só cobrem a escolha feita ainda na triagem). grdtRevisionOriginal
      // preserva a revisão como foi de fato gerada na primeira vez.
      grdtRevisionOriginal: text(file && file.grdtRevisionOriginal),
      revisionEditedAt: text(file && file.revisionEditedAt),
      revisionHistory: Array.isArray(file && file.revisionHistory) ? file.revisionHistory.map(text).filter(Boolean) : [],
      effectiveDate: text(file && file.effectiveDate),
      grdt: text(file && file.grdt),
      sigemStatus: text(file && file.sigemStatus),
      allocation: text(file && file.allocation),
      allocationStage: text(file && file.allocationStage),
      allocationStatus: text(file && file.allocationStatus),
      fiscalComment: text(file && file.fiscalComment),
      sheet: text(file && file.sheet),
      ldRow: Number(file && file.ldRow) || 0,
      ldVersion: text(file && file.ldVersion),
      databook: text(file && file.databook),
      virtual: Boolean(file && file.virtual),
      discipline: text(file && file.discipline),
    };
  }

  function cleanRecord(record) {
    const files = Array.isArray(record && record.files) ? record.files.map(cleanFile).filter((file) => file.document || file.originalName || file.finalName) : [];
    const allocations = [...new Set((record && record.allocations || files.map((file) => file.allocation)).map(text).filter(Boolean))];
    const documents = [...new Set(files.map((file) => norm(file.document)).filter(Boolean))];
    const cloudId = text(record && record.cloudId);
    const workspaceId = text(record && record.workspaceId);
    const syncedAt = text(record && record.syncedAt);
    const reservationRequestId = text(record && record.reservationRequestId);
    const reservationIds = Array.isArray(record && record.reservationIds)
      ? record.reservationIds.map(text).filter(Boolean)
      : [];
    const syncState = text(record && record.syncState) || (cloudId && syncedAt ? "synced" : "pending");
    return {
      id: text(record && record.id) || `${text(record && record.egrdtNumber)}|${text(record && record.generatedAt)}`,
      clientRecordId: text(record && record.clientRecordId) || text(record && record.id) || `${text(record && record.egrdtNumber)}|${text(record && record.generatedAt)}`,
      egrdtNumber: text(record && record.egrdtNumber),
      generatedAt: normalizeGeneratedAt(record && record.generatedAt),
      outputType: text(record && record.outputType) || "eGRDT final",
      ldName: text(record && record.ldName),
      sourceName: text(record && record.sourceName),
      numberHistory: Array.isArray(record && record.numberHistory) ? record.numberHistory.map(text).filter(Boolean) : [],
      cloudId,
      workspaceId,
      createdBy: text(record && record.createdBy),
      createdByEmail: text(record && record.createdByEmail),
      createdByName: text(record && record.createdByName),
      syncedAt,
      cloudUpdatedAt: text(record && record.cloudUpdatedAt) || syncedAt,
      localUpdatedAt: text(record && record.localUpdatedAt) || normalizeGeneratedAt(record && record.generatedAt),
      reservationRequestId,
      reservationIds,
      syncState: syncState === "synced" ? "synced" : "pending",
      documentCount: documents.length,
      fileCount: files.length,
      allocations,
      files,
    };
  }

  function read(storage) {
    const target = storageOf(storage);
    if (!target) return [];
    try {
      const parsed = JSON.parse(target.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.map(cleanRecord).filter((record) => record.egrdtNumber).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)) : [];
    } catch (_) { console.debug("[HistoryCore] context:", _); return []; }
  }

  // Devolve também POR QUE registros foram descartados, para que a interface
  // possa avisar. Antes o histórico era truncado em silêncio: passando de 1000
  // registros ou de 4,5 MB, os mais antigos sumiam sem nenhum sinal.
  function fitDetailed(records) {
    const porQuantidade = Math.max(0, records.length - MAX_RECORDS);
    const kept = records.slice(0, MAX_RECORDS);
    // Mede cada registro uma única vez. O laço anterior refazia JSON.stringify
    // do array inteiro a cada descarte, o que ficava lento justamente quando
    // havia muito a descartar.
    const tamanhos = kept.map((record) => byteSize(JSON.stringify(record)) + 1);
    let total = tamanhos.reduce((soma, valor) => soma + valor, 2);
    let porTamanho = 0;
    while (kept.length > 1 && total > MAX_BYTES) {
      total -= tamanhos[kept.length - 1];
      kept.pop();
      porTamanho += 1;
    }
    return { kept, droppedByCount: porQuantidade, droppedBySize: porTamanho, dropped: porQuantidade + porTamanho };
  }

  function fit(records) {
    return fitDetailed(records).kept;
  }

  function saveMany(records, storage) {
    const target = storageOf(storage);
    if (!target) return { saved: 0, records: [], error: "Armazenamento local indisponível." };
    const incoming = (records || []).map(cleanRecord).filter((record) => record.egrdtNumber);
    const merged = new Map(read(target).map((record) => [record.id, record]));
    incoming.forEach((record) => merged.set(record.id, record));
    const ajuste = fitDetailed([...merged.values()].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)));
    const fitted = ajuste.kept;
    try {
      target.setItem(STORAGE_KEY, JSON.stringify(fitted));
      return {
        saved: incoming.length,
        records: fitted,
        removed: Math.max(0, merged.size - fitted.length),
        trimmed: ajuste.dropped,
        trimmedByCount: ajuste.droppedByCount,
        trimmedBySize: ajuste.droppedBySize,
        limits: { maxRecords: MAX_RECORDS, maxBytes: MAX_BYTES },
        error: "",
      };
    } catch (error) {
      return { saved: 0, records: read(target), error: error && error.message || "Não foi possível salvar o histórico." };
    }
  }

  function replaceWorkspaceSnapshot(records, workspaceId, storage) {
    const target = storageOf(storage);
    if (!target) return { saved: 0, records: [], removed: 0, error: "Armazenamento local indisponível." };
    const workspace = text(workspaceId);
    const incoming = (records || []).map((record) => cleanRecord({ ...record, workspaceId: workspace, syncState: "synced" }))
      .filter((record) => record.egrdtNumber);
    const cloudIds = new Set(incoming.map((record) => record.cloudId).filter(Boolean));
    const cloudClientIds = new Set(incoming.map((record) => record.clientRecordId).filter(Boolean));
    const current = read(target);
    const preserved = [];
    const pendingKeys = new Set();
    let removed = 0;

    current.forEach((record) => {
      if (record.workspaceId !== workspace) {
        preserved.push(record);
        return;
      }
      if (!record.cloudId) {
        preserved.push(record);
        pendingKeys.add(record.clientRecordId || record.id);
        return;
      }
      const existsInCloud = cloudIds.has(record.cloudId) || cloudClientIds.has(record.clientRecordId);
      if (record.syncState === "pending" && existsInCloud) {
        preserved.push(record);
        pendingKeys.add(record.clientRecordId || record.id);
        return;
      }
      if (!existsInCloud) removed += 1;
    });

    const merged = new Map(preserved.map((record) => [record.id, record]));
    incoming.forEach((record) => {
      if (!pendingKeys.has(record.clientRecordId || record.id)) merged.set(record.id, record);
    });
    const fitted = fit([...merged.values()].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)));
    try {
      target.setItem(STORAGE_KEY, JSON.stringify(fitted));
      return { saved: incoming.length, records: fitted, removed: removed + Math.max(0, merged.size - fitted.length), error: "" };
    } catch (error) {
      return { saved: 0, records: current, removed: 0, error: error && error.message || "Não foi possível reconciliar o histórico compartilhado." };
    }
  }

  function markSynced(recordId, cloudRecord, storage) {
    const target = storageOf(storage);
    if (!target) return { updated: false, records: [], error: "Armazenamento local indisponível." };
    const records = read(target);
    const wanted = text(recordId);
    const index = records.findIndex((record) => record.id === wanted || record.clientRecordId === wanted);
    if (index < 0) return { updated: false, records, error: "Registro local não localizado." };
    const cloud = cloudRecord || {};
    records[index] = cleanRecord({
      ...records[index],
      cloudId: cloud.id || records[index].cloudId,
      workspaceId: cloud.workspace_id || records[index].workspaceId,
      syncedAt: cloud.updated_at || new Date().toISOString(),
      cloudUpdatedAt: cloud.updated_at || records[index].cloudUpdatedAt,
      syncState: "synced",
    });
    try {
      target.setItem(STORAGE_KEY, JSON.stringify(fit(records.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)))));
      return { updated: true, record: records[index], records: read(target), error: "" };
    } catch (error) {
      return { updated: false, records: read(target), error: error && error.message || "Não foi possível confirmar a sincronização local." };
    }
  }

  function clear(storage) {
    const target = storageOf(storage);
    if (!target) return false;
    try { target.removeItem(STORAGE_KEY); return true; } catch (_) { console.debug("[HistoryCore] context:", _); return false; }
  }

  function deleteOne(recordId, storage) {
    const target = storageOf(storage);
    if (!target) return { deleted: false, record: null, records: [], error: "Armazenamento local indisponível." };
    const id = text(recordId);
    const records = read(target);
    const record = records.find((item) => item.id === id) || null;
    if (!record) return { deleted: false, record: null, records, error: "Registro do histórico não localizado." };
    const remaining = records.filter((item) => item.id !== id);
    try {
      target.setItem(STORAGE_KEY, JSON.stringify(remaining));
      return { deleted: true, record, records: remaining, error: "" };
    } catch (error) {
      return { deleted: false, record, records, error: error && error.message || "Não foi possível excluir a eGRDT do histórico." };
    }
  }

  function recordFromGenerated(file, results, context) {
    const info = context || {};
    const rows = results || [];
    const entries = file && file.group && file.group.entries || [];
    const files = entries.map((entry, entryIndex) => {
      const row = rows[entry.rowIndex] || {};
      const record = row.record || {};
      const grdtRevision = revisionFromVerifiedGrdt(file, entry, entryIndex, row);
      return cleanFile({
        document: entry.document || row.document,
        title: row.egrdt && row.egrdt.title || row.title || record.title,
        originalName: entry.originalName,
        finalName: entry.finalName,
        revision: grdtRevision.revision,
        grdtRevision: grdtRevision.revision,
        revisionSource: grdtRevision.source,
        revisionSuggested: row.revisionSuggested || "",
        revisionManual: Boolean(row.revisionManual),
        effectiveDate: row.effectiveDate || record.effectiveDate,
        grdt: row.grdt || record.grdt,
        sigemStatus: row.status || row.sigemStatus || record.sigemStatus || record.status,
        allocation: row.allocation || record.allocation,
        allocationStage: row.allocationStage || record.allocationStage,
        allocationStatus: row.allocationStatus || record.allocationStatus,
        fiscalComment: row.fiscalComment || record.fiscalComment,
        sheet: row.sheet || record.sheet,
        ldRow: record.row,
        ldVersion: record.ldVersion,
        databook: record.databook || "",
        virtual: Boolean(entry.virtual),
        discipline: row.egrdt && row.egrdt.discipline || record.discipline || "",
      });
    });
    const generatedAt = text(info.generatedAt) || new Date().toISOString();
    const egrdtNumber = text(file && file.official && file.official.baseName) || text(file && file.fileName).replace(/\.xlsx?$/i, "");
    return cleanRecord({
      id: `${egrdtNumber}|${generatedAt}|${text(info.outputType)}`,
      egrdtNumber,
      generatedAt,
      outputType: info.outputType,
      ldName: info.ldName,
      sourceName: info.sourceName,
      reservationRequestId: text(file && file.official && file.official.requestId),
      reservationIds: [text(file && file.official && file.official.reservationId)].filter(Boolean),
      files,
    });
  }

  function createRecords(generated, results, context) {
    const generatedAt = text(context && context.generatedAt) || new Date().toISOString();
    return (generated || []).map((file) => recordFromGenerated(file, results, { ...(context || {}), generatedAt }));
  }

  function normalizeEgrdtNumber(value, fallbackYear) {
    const raw = text(value);
    const full = raw.match(/0130870-C1O-PGV-G-(\d{1,4})-(\d{4})\s*-\s*eGRDT/i);
    const year = Number(full ? full[2] : fallbackYear || new Date().getFullYear());
    const sequence = Number(full ? full[1] : raw.replace(/\D/g, ""));
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999 || !Number.isInteger(year) || year < 2000 || year > 9999) return null;
    return { sequence, year, baseName: `0130870-C1O-PGV-G-${String(sequence).padStart(4, "0")}-${year} - eGRDT` };
  }

  function updateNumber(recordId, value, storage) {
    const target = storageOf(storage);
    if (!target) return { updated: false, error: "Armazenamento local indisponível." };
    const records = read(target);
    const index = records.findIndex((record) => record.id === text(recordId));
    if (index < 0) return { updated: false, error: "Registro do histórico não localizado." };
    const current = records[index];
    const currentYear = normalizeEgrdtNumber(current.egrdtNumber)?.year || new Date(current.generatedAt).getFullYear();
    const normalized = normalizeEgrdtNumber(value, currentYear);
    if (!normalized) return { updated: false, error: "Informe um número válido entre 0001 e 9999." };
    if (norm(current.egrdtNumber) === norm(normalized.baseName)) return { updated: true, record: current, previous: current.egrdtNumber, records };
    const duplicate = records.some((record, position) => position !== index && [record.egrdtNumber, ...(record.numberHistory || [])].some((number) => norm(number) === norm(normalized.baseName)));
    if (duplicate) return { updated: false, error: "Esse número já pertence a outro registro ou a um número anterior do histórico." };
    const previous = current.egrdtNumber;
    const history = [...new Set([...(current.numberHistory || []), previous].map(text).filter(Boolean))];
    const updatedRecord = cleanRecord({
      ...current,
      egrdtNumber: normalized.baseName,
      id: `${normalized.baseName}|${current.generatedAt}|${current.outputType}`,
      clientRecordId: current.clientRecordId || current.id,
      numberHistory: history,
      localUpdatedAt: new Date().toISOString(),
      syncState: "pending",
    });
    records[index] = updatedRecord;
    try {
      target.setItem(STORAGE_KEY, JSON.stringify(fit(records.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)))));
      return { updated: true, record: updatedRecord, previous, records: read(target) };
    } catch (error) {
      return { updated: false, error: error && error.message || "Não foi possível atualizar o histórico." };
    }
  }

  function normalizeRevisionValue(value) {
    return norm(value).replace(/^REV(?:ISAO)?\.?\s*/, "").replace(/\s+/g, "");
  }

  function isValidRevisionValue(value) {
    // Aceita "0", revisões-padrão em letras (sem I/O, mesmo alfabeto de
    // core.js#REVISION_ALPHABET) e revisões de campo (letras + número, ex.
    // "A1"), igual à validação usada na triagem (core.js#revisionInfo).
    return /^(?:0|[A-HJ-NP-Z]+(?:[1-9]\d*)?)$/.test(value);
  }

  function updateFileRevision(recordId, fileIndex, value, storage) {
    const target = storageOf(storage);
    if (!target) return { updated: false, error: "Armazenamento local indisponível." };
    const records = read(target);
    const index = records.findIndex((record) => record.id === text(recordId));
    if (index < 0) return { updated: false, error: "Registro do histórico não localizado." };
    const current = records[index];
    const position = Number(fileIndex);
    const currentFile = Number.isInteger(position) ? current.files[position] : null;
    if (!currentFile) return { updated: false, error: "Documento não localizado nesta eGRDT." };
    const normalized = normalizeRevisionValue(value);
    if (!normalized || !isValidRevisionValue(normalized)) {
      return { updated: false, error: "Informe uma revisão válida: 0 ou letras (sem I/O)." };
    }
    const previous = currentFile.revision;
    if (norm(previous) === normalized) return { updated: true, record: current, previous, records };
    const revisionHistory = [...new Set([...(currentFile.revisionHistory || []), previous].map(text).filter(Boolean))];
    const files = current.files.map((file, position2) => position2 !== position ? file : {
      ...file,
      revision: normalized,
      grdtRevision: normalized,
      grdtRevisionOriginal: file.grdtRevisionOriginal || file.grdtRevision || previous,
      revisionEditedAt: new Date().toISOString(),
      revisionHistory,
    });
    const updatedRecord = cleanRecord({
      ...current,
      files,
      localUpdatedAt: new Date().toISOString(),
      syncState: "pending",
    });
    records[index] = updatedRecord;
    try {
      target.setItem(STORAGE_KEY, JSON.stringify(fit(records.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)))));
      return { updated: true, record: updatedRecord, previous, records: read(target) };
    } catch (error) {
      return { updated: false, error: error && error.message || "Não foi possível atualizar o histórico." };
    }
  }

  function filter(records, query) {
    const wanted = norm(query);
    if (!wanted) return records || [];
    return (records || []).filter((record) => norm([
      record.egrdtNumber, ...(record.numberHistory || []), record.outputType, record.ldName, record.sourceName,
      ...(record.allocations || []),
      ...(record.files || []).flatMap((file) => [file.document, file.originalName, file.finalName, file.allocation, file.revision, file.sigemStatus]),
    ].join(" ")).includes(wanted));
  }


  function localDateKey(value) {
    const date = parseDateValue(value);
    if (!date || Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function filterByDate(records, startDate, endDate) {
    const start = text(startDate);
    const end = text(endDate);
    if (start && end && start > end) return [];
    return (records || []).filter((record) => {
      const key = localDateKey(record && record.generatedAt);
      if (!key) return false;
      if (start && key < start) return false;
      if (end && key > end) return false;
      return true;
    });
  }

  function periodBounds(records) {
    const keys = (records || []).map((record) => localDateKey(record && record.generatedAt)).filter(Boolean).sort();
    return { start: keys[0] || "", end: keys[keys.length - 1] || "" };
  }

  function summary(records) {
    const source = records || [];
    return {
      egrdts: source.length,
      documents: source.reduce((total, record) => total + Number(record.documentCount || 0), 0),
      files: source.reduce((total, record) => total + Number(record.fileCount || 0), 0),
      allocations: new Set(source.flatMap((record) => record.allocations || []).map(norm).filter(Boolean)).size,
      lastGeneratedAt: source[0] && source[0].generatedAt || "",
    };
  }

  return { STORAGE_KEY, MAX_RECORDS, MAX_BYTES, HISTORY_FAMILIES, text, norm, normalizedHistoryFamily, documentFamily, recordFamilies, filterByDocumentFamily, generatedRevision, revisionFromVerifiedGrdt, cleanRecord, read, saveMany, replaceWorkspaceSnapshot, markSynced, clear, deleteOne, recordFromGenerated, createRecords, normalizeEgrdtNumber, updateNumber, normalizeRevisionValue, isValidRevisionValue, updateFileRevision, filter, localDateKey, filterByDate, periodBounds, summary };
});
