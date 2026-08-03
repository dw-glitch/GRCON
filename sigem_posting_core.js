(function (root, factory) {
  const api = factory(root.GrconHistory || (typeof require === "function" ? require("./history_core.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconSigemPosting = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (History) {
  "use strict";

  const STORAGE_KEY = "grcon.sigem.postings.v1";
  const PREFERENCES_KEY = "grcon.sigem.preferences.v1";
  const MAX_RECORDS = 240;
  const MAX_BYTES = 4200000;
  const STATUSES = Object.freeze({
    GERADO: "GERADO",
    VALIDADO: "VALIDADO",
    PRONTO: "PRONTO",
    POSTADO: "POSTADO",
    PENDENCIA: "PENDENCIA",
    FALHA: "FALHA",
    CANCELADO: "CANCELADO",
  });

  const _U = (typeof globalThis !== "undefined" ? globalThis : this).GrconUtils || {};
  function text(value) { return _U.text ? _U.text(value) : String(value === null || value === undefined ? "" : value).trim(); }
  function norm(value) { return _U.norm ? _U.norm(value) : text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[–—]/g, "-").replace(/\s+/g, " ").toUpperCase(); }
  function byteSize(value) { return _U.byteSize ? _U.byteSize(value) : (function() { try { return unescape(encodeURIComponent(String(value))).length; } catch (_) { console.debug("[SigemPostingCore] byteSize fallback:", _); return String(value).length; } })(); }
  function storageOf(storage) { return _U.storageOf ? _U.storageOf(storage) : (storage || (typeof localStorage !== "undefined" ? localStorage : null)); }
  function nowIso() { return new Date().toISOString(); }
  function safePart(value, fallback) {
    const clean = text(value).replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").replace(/[. ]+$/g, "");
    return clean || fallback || "arquivo";
  }
  function normalizePath(value) {
    let raw = text(value).replace(/\//g, "\\");
    if (!raw) return "";
    const unc = raw.startsWith("\\\\");
    raw = raw.replace(/\\+/g, "\\").replace(/\\+$/g, "");
    if (unc) raw = `\\\\${raw.replace(/^\\+/, "")}`;
    return raw;
  }
  function joinPath(base, child) {
    const first = normalizePath(base);
    const second = text(child).replace(/^[\\/]+/, "");
    return first ? `${first}\\${second}` : second;
  }
  function documentKey(file) { return `${norm(file && file.document)}|${norm(file && file.revision)}`; }
  function isNotAllocated(file) {
    const value = norm(file && file.allocationStatus);
    return value === "NAO ALOCADO"
      || value === "DOCUMENTO NAO ALOCADO"
      || value === "ALOCACAO RECUSADA";
  }

  function cleanFile(file) {
    return {
      document: text(file && file.document),
      title: text(file && file.title),
      originalName: text(file && file.originalName),
      finalName: text(file && file.finalName),
      revision: text(file && file.revision),
      format: text(file && file.format),
      discipline: text(file && file.discipline),
      documentType: text(file && file.documentType),
      purpose: text(file && file.purpose),
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
    };
  }

  function cleanHistoryEvent(event) {
    return {
      status: Object.values(STATUSES).includes(text(event && event.status)) ? text(event.status) : STATUSES.GERADO,
      at: text(event && event.at) || nowIso(),
      responsible: text(event && event.responsible),
      protocol: text(event && event.protocol),
      message: text(event && event.message),
      notes: text(event && event.notes),
    };
  }

  function cleanRecord(record) {
    const egrdtNumber = text(record && record.egrdtNumber);
    const files = Array.isArray(record && record.files) ? record.files.map(cleanFile).filter((file) => file.document || file.finalName) : [];
    const generatedAt = text(record && record.generatedAt) || nowIso();
    const folderName = text(record && record.folderName) || egrdtNumber;
    const egrdtFileName = text(record && record.egrdtFileName) || `${egrdtNumber}.xls`;
    const status = Object.values(STATUSES).includes(text(record && record.status)) ? text(record.status) : STATUSES.GERADO;
    const statusHistory = Array.isArray(record && record.statusHistory) ? record.statusHistory.map(cleanHistoryEvent) : [];
    return {
      id: text(record && record.id) || `${egrdtNumber}|${generatedAt}`,
      historyId: text(record && record.historyId),
      egrdtNumber,
      egrdtFileName,
      folderName,
      packageName: text(record && record.packageName),
      outputType: text(record && record.outputType),
      generatedAt,
      createdAt: text(record && record.createdAt) || generatedAt,
      updatedAt: text(record && record.updatedAt) || generatedAt,
      appVersion: text(record && record.appVersion),
      ldName: text(record && record.ldName),
      sourceName: text(record && record.sourceName),
      basePath: normalizePath(record && record.basePath),
      folderPath: normalizePath(record && record.folderPath),
      pathMode: text(record && record.pathMode) === "manual" ? "manual" : "auto",
      status,
      responsible: text(record && record.responsible),
      protocol: text(record && record.protocol),
      postingGrdtNumber: text(record && record.postingGrdtNumber),
      sigemMessage: text(record && record.sigemMessage),
      notes: text(record && record.notes),
      resultAt: text(record && record.resultAt),
      repostAuthorized: Boolean(record && record.repostAuthorized),
      repostJustification: text(record && record.repostJustification),
      ldUpdate: record && record.ldUpdate && typeof record.ldUpdate === "object" ? {
        appliedAt: text(record.ldUpdate.appliedAt),
        sourceFile: text(record.ldUpdate.sourceFile),
        outputFile: text(record.ldUpdate.outputFile),
        updatedDocuments: Number(record.ldUpdate.updatedDocuments) || 0,
        skippedDocuments: Number(record.ldUpdate.skippedDocuments) || 0,
      } : null,
      grdtValidation: record && record.grdtValidation && typeof record.grdtValidation === "object" ? {
        validatedAt: text(record.grdtValidation.validatedAt),
        sourceFile: text(record.grdtValidation.sourceFile),
        rowCount: Number(record.grdtValidation.rowCount) || 0,
        changedFields: Number(record.grdtValidation.changedFields) || 0,
        fileNameMatched: Boolean(record.grdtValidation.fileNameMatched),
      } : null,
      statusHistory: statusHistory.length ? statusHistory : [{ status, at: generatedAt, responsible: "", protocol: "", message: "", notes: "" }],
      files,
    };
  }

  function read(storage) {
    const target = storageOf(storage);
    if (!target) return [];
    try {
      const parsed = JSON.parse(target.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.map(cleanRecord).filter((record) => record.egrdtNumber).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)) : [];
    } catch (_) { console.debug("[SigemPostingCore] context:", _); return []; }
  }

  function fit(records) {
    const kept = records.slice(0, MAX_RECORDS);
    while (kept.length > 1 && byteSize(JSON.stringify(kept)) > MAX_BYTES) kept.pop();
    return kept;
  }

  function write(records, storage) {
    const target = storageOf(storage);
    if (!target) return { saved: false, records: [], error: "Armazenamento local indisponível." };
    const fitted = fit((records || []).map(cleanRecord).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)));
    try {
      target.setItem(STORAGE_KEY, JSON.stringify(fitted));
      return { saved: true, records: fitted, error: "" };
    } catch (error) {
      return { saved: false, records: read(target), error: error && error.message || "Não foi possível salvar os registros de postagem." };
    }
  }

  function readPreferences(storage) {
    const target = storageOf(storage);
    if (!target) return { basePath: "", responsible: "" };
    try {
      const parsed = JSON.parse(target.getItem(PREFERENCES_KEY) || "{}");
      return { basePath: normalizePath(parsed.basePath), responsible: text(parsed.responsible) };
    } catch (_) { console.debug("[SigemPostingCore] context:", _); return { basePath: "", responsible: "" }; }
  }

  function savePreferences(preferences, storage) {
    const target = storageOf(storage);
    if (!target) return { saved: false, error: "Armazenamento local indisponível." };
    const current = readPreferences(target);
    const next = { basePath: normalizePath(preferences && preferences.basePath !== undefined ? preferences.basePath : current.basePath), responsible: text(preferences && preferences.responsible !== undefined ? preferences.responsible : current.responsible) };
    try { target.setItem(PREFERENCES_KEY, JSON.stringify(next)); return { saved: true, preferences: next, error: "" }; }
    catch (error) { return { saved: false, preferences: current, error: error && error.message || "Não foi possível salvar as preferências." }; }
  }

  function isPhysicalOutput(outputType) {
    const value = norm(outputType);
    return value.includes("PACOTE COMPLETO") || value.includes("PDFS + EGRDT");
  }

  function fromHistory(historyRecord, context) {
    const source = History && History.cleanRecord ? History.cleanRecord(historyRecord) : historyRecord || {};
    const info = context || {};
    const preferences = readPreferences(info.storage);
    const basePath = normalizePath(info.basePath !== undefined ? info.basePath : preferences.basePath);
    const folderName = text(source.egrdtNumber);
    const folderPath = normalizePath(info.folderPath) || (basePath ? joinPath(basePath, folderName) : "");
    return cleanRecord({
      id: text(source.id) || `${folderName}|${source.generatedAt}`,
      historyId: text(source.id),
      egrdtNumber: folderName,
      egrdtFileName: `${folderName}.xls`,
      folderName,
      packageName: text(info.packageName),
      outputType: source.outputType,
      generatedAt: source.generatedAt,
      createdAt: source.generatedAt,
      updatedAt: source.generatedAt,
      appVersion: info.appVersion,
      ldName: source.ldName,
      sourceName: source.sourceName,
      basePath,
      folderPath,
      pathMode: info.folderPath ? "manual" : "auto",
      status: STATUSES.GERADO,
      responsible: preferences.responsible,
      files: source.files,
    });
  }

  function postedDocumentMap(records, excludeId) {
    const map = new Map();
    (records || []).filter((record) => record.id !== excludeId && record.status === STATUSES.POSTADO).forEach((record) => {
      (record.files || []).forEach((file) => {
        const key = documentKey(file);
        if (!key || key === "|") return;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ egrdtNumber: record.postingGrdtNumber || record.egrdtNumber, protocol: record.protocol, resultAt: record.resultAt || record.updatedAt, finalName: file.finalName });
      });
    });
    return map;
  }

  function audit(record, records) {
    const item = cleanRecord(record);
    const checks = [];
    const add = (code, label, severity, message, count) => checks.push({ code, label, severity, message, count: Number(count) || 0 });
    const numberValid = /^0130870-C1O-PGV-G-\d{4}-\d{4}\s-\seGRDT$/i.test(item.egrdtNumber);
    add("EGRDT_NUMBER", "Número da eGRDT", numberValid ? "ok" : "error", numberValid ? "Número no padrão oficial." : "O número da eGRDT não segue o padrão oficial.");
    const expectedFile = `${item.egrdtNumber}.xls`;
    add("EGRDT_FILE", "Arquivo da eGRDT", norm(item.egrdtFileName) === norm(expectedFile) ? "ok" : "error", norm(item.egrdtFileName) === norm(expectedFile) ? `Arquivo esperado: ${expectedFile}.` : `O arquivo deveria se chamar ${expectedFile}.`);
    add("FOLDER_PATH", "Pasta para o SIGEM", item.folderPath ? "ok" : "error", item.folderPath ? item.folderPath : "Informe o caminho da pasta extraída que será selecionada no SIGEM.");
    const physical = isPhysicalOutput(item.outputType);
    add("PHYSICAL_PACKAGE", "PDFs no pacote", physical ? "ok" : "error", physical ? "O registro foi criado a partir de uma saída com PDFs." : "Este registro contém somente a eGRDT; gere ou selecione o pacote com os PDFs.");
    add("PACKAGE_NAME", "Pacote de origem", item.packageName ? "ok" : "warning", item.packageName || "O nome do ZIP de origem não foi registrado.");
    add("FILES", "Documentos relacionados", item.files.length ? "ok" : "error", item.files.length ? `${item.files.length} arquivo(s) relacionado(s).` : "Nenhum documento foi relacionado à eGRDT.", item.files.length);

    const missingNames = item.files.filter((file) => !file.finalName);
    const nameKeys = item.files.map((file) => norm(file.finalName)).filter(Boolean);
    const duplicateNames = nameKeys.filter((value, index) => nameKeys.indexOf(value) !== index);
    add("FILE_NAMES", "Nomes finais", missingNames.length || duplicateNames.length ? "error" : "ok", missingNames.length ? `${missingNames.length} arquivo(s) sem nome final.` : duplicateNames.length ? `${new Set(duplicateNames).size} nome(s) final(is) duplicado(s).` : "Todos os arquivos possuem nomes finais únicos.", missingNames.length + new Set(duplicateNames).size);

    const missingRevision = item.files.filter((file) => !file.revision);
    add("REVISIONS", "Revisões", missingRevision.length ? "error" : "ok", missingRevision.length ? `${missingRevision.length} arquivo(s) sem revisão.` : "Todas as revisões estão preenchidas.", missingRevision.length);
    const missingDatabook = item.files.filter((file) => !file.databook);
    add("DATABOOK", "Caminhos Databook", missingDatabook.length ? "warning" : "ok", missingDatabook.length ? `${missingDatabook.length} documento(s) sem caminho Databook na LD; a eGRDT foi mantida em branco para conferência da alocação.` : "Todos os documentos possuem caminho Databook informado na LD.", missingDatabook.length);
    const notAllocated = item.files.filter(isNotAllocated);
    const allocationUnknown = item.files.filter((file) => !text(file.allocationStatus));
    add("ALLOCATION", "Situação de alocação", notAllocated.length ? "error" : allocationUnknown.length ? "warning" : "ok", notAllocated.length ? `${notAllocated.length} documento(s) constam como NÃO ALOCADO.` : allocationUnknown.length ? `${allocationUnknown.length} documento(s) sem confirmação explícita de alocação no histórico.` : "Nenhum documento está marcado como NÃO ALOCADO.", notAllocated.length || allocationUnknown.length);
    const virtualFiles = item.files.filter((file) => file.virtual);
    add("PHYSICAL_FILES", "Arquivos físicos", virtualFiles.length ? "error" : "ok", virtualFiles.length ? `${virtualFiles.length} item(ns) foram recebidos somente por relação e não possuem arquivo físico.` : "Todos os itens do lote possuem arquivo físico.", virtualFiles.length);

    const internalKeys = item.files.map(documentKey).filter((key) => key && key !== "|");
    const internalDuplicates = internalKeys.filter((value, index) => internalKeys.indexOf(value) !== index);
    add("INTERNAL_DUPLICATES", "Duplicidade no próprio lote", internalDuplicates.length ? "warning" : "ok", internalDuplicates.length ? `${new Set(internalDuplicates).size} documento(s)/revisão repetido(s) no mesmo lote; confira se há mais de um arquivo legítimo.` : "Nenhum documento/revisão repetido no próprio lote.", new Set(internalDuplicates).size);

    const posted = postedDocumentMap(records || [], item.id);
    const duplicates = [];
    item.files.forEach((file) => {
      const matches = posted.get(documentKey(file)) || [];
      matches.forEach((match) => duplicates.push({ document: file.document, revision: file.revision, previousEgrdt: match.egrdtNumber, protocol: match.protocol, resultAt: match.resultAt }));
    });
    const repostOk = item.repostAuthorized && item.repostJustification.length >= 10;
    add("PREVIOUS_POSTING", "Postagem duplicada", duplicates.length ? (repostOk ? "warning" : "error") : "ok", duplicates.length ? (repostOk ? `${duplicates.length} documento(s) já postado(s); repostagem excepcional justificada.` : `${duplicates.length} documento(s) com a mesma revisão já registrado(s) como POSTADO. Autorize e justifique a repostagem para continuar.`) : "Nenhum documento/revisão já postado foi localizado no histórico local.", duplicates.length);

    const errors = checks.filter((check) => check.severity === "error");
    const warnings = checks.filter((check) => check.severity === "warning");
    return { ready: errors.length === 0, errors, warnings, checks, duplicates, totals: { files: item.files.length, documents: new Set(item.files.map((file) => norm(file.document)).filter(Boolean)).size, databooks: new Set(item.files.map((file) => norm(file.databook)).filter(Boolean)).size } };
  }

  function ldRecoveryAudit(record, records) {
    const result = audit(record, records);
    const criticalCodes = new Set([
      "EGRDT_NUMBER", "EGRDT_FILE", "FILES", "FILE_NAMES", "REVISIONS",
      "DATABOOK", "ALLOCATION", "PREVIOUS_POSTING",
    ]);
    const checks = result.checks.filter((check) => criticalCodes.has(check.code));
    const errors = checks.filter((check) => check.severity === "error");
    const warnings = checks.filter((check) => check.severity === "warning");
    return { ...result, ready: errors.length === 0, errors, warnings, checks };
  }

  function createDrafts(historyRecords, context, storage) {
    const existing = read(storage);
    return (historyRecords || []).map((historyRecord) => {
      const draft = fromHistory(historyRecord, { ...(context || {}), storage });
      // Remove duplicate files automatically (by document+revision and by final file name)
      try {
        const originalLen = (draft.files || []).length;
        const seenDoc = new Set();
        const seenName = new Set();
        const filtered = [];
        (draft.files || []).forEach((f) => {
          const key = documentKey(f);
          const name = norm(f && f.finalName);
          // prefer keeping first occurrence
          if (key && seenDoc.has(key)) return;
          if (name && seenName.has(name)) return;
          if (key) seenDoc.add(key);
          if (name) seenName.add(name);
          filtered.push(f);
        });
        if (originalLen !== filtered.length) {
          const removed = originalLen - filtered.length;
          draft.files = filtered;
          draft.notes = (draft.notes ? draft.notes + "\n" : "") + `Duplicados removidos automaticamente: ${removed}`;
        }
      } catch (_) { console.debug("[SigemPostingCore] context:", _); /* não bloquear por erro de deduplicação */ }

      const previous = existing.find((record) => record.id === draft.id || (record.historyId && record.historyId === draft.historyId));
      if (previous) return cleanRecord({ ...draft, ...previous, files: previous.grdtValidation ? previous.files : draft.files, egrdtNumber: draft.egrdtNumber, egrdtFileName: draft.egrdtFileName, folderName: draft.folderName, packageName: draft.packageName || previous.packageName, outputType: draft.outputType, generatedAt: draft.generatedAt, ldName: draft.ldName, sourceName: draft.sourceName, appVersion: draft.appVersion || previous.appVersion });
      const result = audit(draft, existing);
      return cleanRecord({ ...draft, status: result.ready ? STATUSES.VALIDADO : STATUSES.GERADO, statusHistory: [{ status: result.ready ? STATUSES.VALIDADO : STATUSES.GERADO, at: draft.generatedAt }] });
    });
  }

  function registerGenerated(historyRecords, context, storage) {
    const current = read(storage);
    const drafts = createDrafts(historyRecords, context, storage);
    const merged = new Map(current.map((record) => [record.id, record]));
    drafts.forEach((record) => merged.set(record.id, record));
    const result = write([...merged.values()], storage);
    return { ...result, created: drafts };
  }

  function update(recordId, patch, storage) {
    const records = read(storage);
    const index = records.findIndex((record) => record.id === text(recordId));
    if (index < 0) return { updated: false, records, error: "Registro de postagem não localizado." };
    const current = records[index];
    const next = cleanRecord({ ...current, ...(patch || {}), updatedAt: nowIso(), files: current.files });
    records[index] = next;
    const result = write(records, storage);
    return { updated: result.saved, record: next, records: result.records, error: result.error };
  }

  function correctedRowErrors(rows) {
    const source = Array.isArray(rows) ? rows : [];
    const required = [
      ["document", "DOCUMENTO"], ["revision", "REVISÃO"], ["title", "TÍTULO"],
      ["fileName", "ARQUIVO"], ["format", "FORMATO"], ["discipline", "DISCIPLINA"],
      ["documentType", "TIPO DE DOCUMENTO"], ["purpose", "PROPÓSITO"],
    ];
    const errors = [];
    if (!source.length) return ["A eGRDT corrigida não contém documentos."];
    if (source.length > 48) errors.push("A eGRDT corrigida excede o limite de 48 documentos.");
    source.forEach((row, index) => {
      required.forEach(([property, label]) => {
        if (!text(row && row[property])) errors.push(`Linha ${index + 2}: ${label} está vazio.`);
      });
      const fileName = text(row && row.fileName);
      if (fileName && !/\.[A-Za-z0-9]{2,8}$/i.test(fileName)) {
        errors.push(`Linha ${index + 2}: ARQUIVO deve conter a extensão.`);
      }
    });
    const names = source.map((row) => norm(row && row.fileName)).filter(Boolean);
    const duplicates = names.filter((item, index) => names.indexOf(item) !== index);
    if (duplicates.length) errors.push(`${new Set(duplicates).size} nome(s) de arquivo está(ão) duplicado(s) na eGRDT corrigida.`);
    return errors;
  }

  function fileStem(value) {
    return norm(text(value).replace(/^.*[\\/]/, "").replace(/\.xls$/i, "").replace(/\s+\(\d+\)$/i, ""));
  }

  function sameDocumentRevisionSet(files, rows) {
    const count = (source, selector) => {
      const map = new Map();
      source.forEach((item) => {
        const key = selector(item);
        map.set(key, (map.get(key) || 0) + 1);
      });
      return map;
    };
    const expected = count(files, documentKey);
    const actual = count(rows, (row) => `${norm(row && row.document)}|${norm(row && row.revision)}`);
    if (expected.size !== actual.size) return false;
    return [...expected.entries()].every(([key, amount]) => key !== "|" && actual.get(key) === amount);
  }

  function reconcileCorrectedRows(files, rows) {
    const available = files.map((file, index) => ({ file, index, used: false }));
    let changedFields = 0;
    const merged = rows.map((row) => {
      const key = `${norm(row && row.document)}|${norm(row && row.revision)}`;
      const candidates = available.filter((entry) => !entry.used && documentKey(entry.file) === key);
      let selected = candidates.find((entry) => norm(entry.file.finalName) === norm(row.fileName)) || candidates[0];
      if (!selected) return null;
      selected.used = true;
      const patch = {
        title: text(row.title),
        finalName: text(row.fileName),
        revision: text(row.revision),
        document: text(row.document),
        format: text(row.format),
        discipline: text(row.discipline),
        documentType: text(row.documentType),
        purpose: text(row.purpose),
        databook: text(selected.file.databook),
      };
      Object.entries(patch).forEach(([property, nextValue]) => {
        if (text(selected.file[property]) !== nextValue) changedFields += 1;
      });
      return cleanFile({ ...selected.file, ...patch });
    });
    return { files: merged.filter(Boolean), changedFields };
  }

  function revalidateCorrectedGrdt(recordId, rows, metadata, storage) {
    const records = read(storage);
    const index = records.findIndex((record) => record.id === text(recordId));
    if (index < 0) return { updated: false, records, error: "Registro de postagem não localizado.", errors: [] };
    const current = records[index];
    const errors = correctedRowErrors(rows);
    if (!sameDocumentRevisionSet(current.files, Array.isArray(rows) ? rows : [])) {
      errors.push("Os pares DOCUMENTO + REVISÃO da eGRDT corrigida não correspondem exatamente a este lote.");
    }
    if (errors.length) return { updated: false, records, error: errors[0], errors };

    const info = metadata || {};
    const reconciled = reconcileCorrectedRows(current.files, rows);
    if (reconciled.files.length !== current.files.length) {
      return { updated: false, records, error: "Não foi possível conciliar todos os documentos da eGRDT corrigida.", errors: ["A conciliação Documento + Revisão ficou incompleta."] };
    }
    const sourceFile = text(info.sourceFile);
    const fileNameMatched = !sourceFile || fileStem(sourceFile) === fileStem(current.egrdtFileName);
    const validatedAt = text(info.validatedAt) || nowIso();
    const validation = {
      validatedAt,
      sourceFile,
      rowCount: reconciled.files.length,
      changedFields: reconciled.changedFields,
      fileNameMatched,
    };
    let candidate = cleanRecord({ ...current, files: reconciled.files, grdtValidation: validation, updatedAt: validatedAt });
    const result = audit(candidate, records);
    const keepPosted = current.status === STATUSES.POSTADO;
    const nextStatus = keepPosted ? STATUSES.POSTADO : result.ready ? STATUSES.VALIDADO : current.status;
    const message = result.ready
      ? `eGRDT corrigida reaberta e revalidada (${reconciled.files.length} documento(s)).`
      : `eGRDT corrigida reaberta; ainda existem ${result.errors.length} bloqueio(s) fora do conteúdo corrigido.`;
    const event = cleanHistoryEvent({ status: nextStatus, at: validatedAt, responsible: current.responsible, message });
    candidate = cleanRecord({ ...candidate, status: nextStatus, statusHistory: [...current.statusHistory, event] });
    records[index] = candidate;
    const saved = write(records, storage);
    const stored = saved.records.find((record) => record.id === candidate.id) || candidate;
    return {
      updated: saved.saved,
      record: stored,
      records: saved.records,
      audit: audit(stored, saved.records),
      changedFields: reconciled.changedFields,
      fileNameMatched,
      warnings: fileNameMatched ? [] : [`O arquivo selecionado se chama “${sourceFile}”; o vínculo foi confirmado pelo conjunto exato de Documento + Revisão.`],
      error: saved.error,
      errors: [],
    };
  }

  function transition(recordId, status, details, storage) {
    if (!Object.values(STATUSES).includes(status)) return { updated: false, error: "Status de postagem inválido.", records: read(storage) };
    const records = read(storage);
    const current = records.find((record) => record.id === text(recordId));
    if (!current) return { updated: false, error: "Registro de postagem não localizado.", records };
    const info = details || {};
    if ((status === STATUSES.PRONTO || status === STATUSES.POSTADO) && !audit({ ...current, ...info }, records).ready) return { updated: false, error: "A conferência pré-postagem ainda possui bloqueios.", records };
    const responsible = text(info.responsible || current.responsible);
    const postingGrdtNumber = text(info.postingGrdtNumber || current.postingGrdtNumber || current.egrdtNumber);
    const at = text(info.resultAt) || nowIso();
    if (status === STATUSES.POSTADO) {
      if (!responsible) return { updated: false, error: "Informe quem confirmou a postagem.", records };
      if (!/^0130870-C1O-PGV-G-\d{4}-\d{4}\s-\seGRDT$/i.test(postingGrdtNumber)) return { updated: false, error: "Confira o número da GRDT postada. Ele não segue o padrão oficial.", records };
      if (!at || Number.isNaN(new Date(at).getTime())) return { updated: false, error: "Informe uma data de postagem válida.", records };
    }
    const event = cleanHistoryEvent({ status, at, responsible, protocol: info.protocol, message: info.sigemMessage, notes: info.notes });
    return update(recordId, {
      ...info,
      responsible,
      postingGrdtNumber: status === STATUSES.POSTADO ? postingGrdtNumber : current.postingGrdtNumber,
      status,
      resultAt: [STATUSES.POSTADO, STATUSES.PENDENCIA, STATUSES.FALHA, STATUSES.CANCELADO].includes(status) ? at : current.resultAt,
      statusHistory: [...current.statusHistory, event],
    }, storage);
  }

  function confirmCorrectedPosting(recordId, details, storage) {
    const records = read(storage);
    const current = records.find((record) => record.id === text(recordId));
    if (!current) return { updated: false, error: "Registro de postagem não localizado.", records };
    if (!current.grdtValidation || !current.grdtValidation.validatedAt) {
      return { updated: false, error: "A eGRDT corrigida precisa ser reaberta e revalidada antes da atualização excepcional da LD.", records };
    }
    const recovery = ldRecoveryAudit(current, records);
    if (!recovery.ready) {
      return { updated: false, error: `A conferência para atualizar a LD ainda possui ${recovery.errors.length} bloqueio(s): ${recovery.errors.map((item) => item.label).join(", ")}.`, records, audit: recovery };
    }
    const info = details || {};
    const responsible = text(info.responsible);
    const postingGrdtNumber = text(info.postingGrdtNumber) || current.egrdtNumber;
    const resultAt = text(info.resultAt);
    if (!responsible) return { updated: false, error: "Informe o responsável pela confirmação.", records };
    if (!resultAt || Number.isNaN(new Date(resultAt).getTime())) return { updated: false, error: "Informe uma data efetiva válida.", records };
    if (!/^0130870-C1O-PGV-G-\d{4}-\d{4}\s-\seGRDT$/i.test(postingGrdtNumber)) {
      return { updated: false, error: "O número da GRDT não segue o padrão oficial.", records };
    }
    const message = text(info.sigemMessage) || "eGRDT corrigida já aceita pelo SIGEM; postagem confirmada para atualização da LD.";
    const notes = text(info.notes);
    const event = cleanHistoryEvent({ status: STATUSES.POSTADO, at: resultAt, responsible, protocol: info.protocol, message, notes });
    return update(recordId, {
      ...info,
      responsible,
      postingGrdtNumber,
      resultAt,
      status: STATUSES.POSTADO,
      sigemMessage: message,
      notes,
      statusHistory: [...current.statusHistory, event],
    }, storage);
  }

  function markLdUpdated(recordIds, metadata, storage) {
    const ids = new Set((recordIds || []).map(text).filter(Boolean));
    if (!ids.size) return { updated: false, records: read(storage), error: "Nenhuma postagem foi vinculada à atualização da LD." };
    const info = metadata || {};
    const records = read(storage).map((record) => ids.has(record.id) ? cleanRecord({
      ...record,
      updatedAt: nowIso(),
      ldUpdate: {
        appliedAt: text(info.appliedAt) || nowIso(),
        sourceFile: text(info.sourceFile),
        outputFile: text(info.outputFile),
        updatedDocuments: Number(info.updatedDocuments) || 0,
        skippedDocuments: Number(info.skippedDocuments) || 0,
      },
    }) : record);
    const result = write(records, storage);
    return { updated: result.saved, records: result.records, error: result.error };
  }

  function applyBasePath(basePath, storage) {
    const normalized = normalizePath(basePath);
    const records = read(storage).map((record) => record.pathMode === "manual" ? record : cleanRecord({ ...record, basePath: normalized, folderPath: normalized ? joinPath(normalized, record.folderName) : "", updatedAt: nowIso() }));
    const result = write(records, storage);
    savePreferences({ basePath: normalized }, storage);
    return result;
  }

  function clear(storage) {
    const target = storageOf(storage);
    if (!target) return false;
    try { target.removeItem(STORAGE_KEY); return true; } catch (_) { console.debug("[SigemPostingCore] context:", _); return false; }
  }

  function manifest(record, records) {
    const item = cleanRecord(record);
    const result = audit(item, records || read());
    return {
      schema: "grcon.sigem.posting.v1",
      application: "GRCON",
      app_version: item.appVersion,
      generated_at: item.generatedAt,
      updated_at: item.updatedAt,
      posting_status: item.status,
      egrdt: {
        number: item.egrdtNumber,
        posting_number: item.postingGrdtNumber || item.egrdtNumber,
        file: item.egrdtFileName,
        folder: item.folderName,
        folder_path: item.folderPath,
        file_path: item.folderPath ? joinPath(item.folderPath, item.egrdtFileName) : item.egrdtFileName,
        source_package: item.packageName,
      },
      source: { ld: item.ldName, documents: item.sourceName, output_type: item.outputType },
      totals: result.totals,
      audit: { ready: result.ready, errors: result.errors.length, warnings: result.warnings.length, checks: result.checks },
      posting_result: { responsible: item.responsible, protocol: item.protocol, message: item.sigemMessage, notes: item.notes, result_at: item.resultAt, repost_authorized: item.repostAuthorized, repost_justification: item.repostJustification },
      grdt_revalidation: item.grdtValidation,
      documents: item.files.map((file, index) => ({ line: index + 1, document: file.document, title: file.title, revision: file.revision, original_file: file.originalName, posted_file: file.finalName, format: file.format, discipline: file.discipline, document_type: file.documentType, purpose: file.purpose, databook_path: file.databook, allocation: file.allocation, allocation_stage: file.allocationStage, allocation_status: file.allocationStatus, fiscal_comment: file.fiscalComment, ld_sheet: file.sheet, ld_row: file.ldRow, ld_version: file.ldVersion, physical_file: !file.virtual })),
    };
  }

  function collectionManifest(records, allRecords) {
    const source = (records || []).map(cleanRecord);
    return {
      schema: "grcon.sigem.posting.collection.v1",
      application: "GRCON",
      generated_at: nowIso(),
      lots: source.map((record) => manifest(record, allRecords || source)),
    };
  }

  function packageManifestPayload() {
    // Mantido apenas por compatibilidade com versões anteriores. A versão atual não gera manifesto.
    return null;
  }

  function proofText(record, records) {
    const item = cleanRecord(record);
    const result = audit(item, records || read());
    const lines = [
      "GRCON — REGISTRO DE POSTAGEM ASSISTIDA NO SIGEM",
      "",
      `eGRDT: ${item.egrdtNumber}`,
      `Número gravado na LD: ${item.postingGrdtNumber || item.egrdtNumber}`,
      `Arquivo eGRDT: ${item.egrdtFileName}`,
      `Pasta selecionada no SIGEM: ${item.folderPath || "NÃO INFORMADA"}`,
      `Pacote de origem: ${item.packageName || "NÃO INFORMADO"}`,
      `Status: ${statusLabel(item.status)}`,
      `Gerado em: ${item.generatedAt}`,
      `Resultado registrado em: ${item.resultAt || "—"}`,
      `Responsável: ${item.responsible || "—"}`,
      `Protocolo: ${item.protocol || "—"}`,
      `Mensagem do SIGEM: ${item.sigemMessage || "—"}`,
      `Observações: ${item.notes || "—"}`,
      "",
      `Auditoria pré-postagem: ${result.ready ? "APROVADA" : "COM BLOQUEIOS"}`,
      `Erros: ${result.errors.length} | Avisos: ${result.warnings.length}`,
      "",
      "DOCUMENTOS",
    ];
    item.files.forEach((file, index) => lines.push(`${index + 1}. ${file.document} | Rev. ${file.revision || "—"} | ${file.finalName || "—"} | Databook: ${file.databook || "—"}`));
    return lines.join("\r\n");
  }

  function statusLabel(status) {
    return ({ GERADO: "Gerado", VALIDADO: "Validado", PRONTO: "Pronto para SIGEM", POSTADO: "Postado", PENDENCIA: "Postagem com pendência", FALHA: "Falha na postagem", CANCELADO: "Cancelado" })[status] || status;
  }

  function summary(records) {
    const source = records || [];
    const count = (status) => source.filter((record) => record.status === status).length;
    return { total: source.length, ready: count(STATUSES.PRONTO), posted: count(STATUSES.POSTADO), pending: count(STATUSES.PENDENCIA), failed: count(STATUSES.FALHA), cancelled: count(STATUSES.CANCELADO), validated: count(STATUSES.VALIDADO), generated: count(STATUSES.GERADO) };
  }

  return {
    STORAGE_KEY, PREFERENCES_KEY, STATUSES, text, norm, cleanRecord, read, write, clear,
    readPreferences, savePreferences, normalizePath, joinPath, isPhysicalOutput,
    fromHistory, createDrafts, registerGenerated, update, revalidateCorrectedGrdt, transition, confirmCorrectedPosting, markLdUpdated, applyBasePath,
    audit, ldRecoveryAudit, manifest, collectionManifest, packageManifestPayload, proofText, statusLabel, summary,
    safePart,
  };
});
