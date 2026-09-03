(function (root) {
  "use strict";
  const Base = root.GrconRevisionControl;
  const History = root.GrconHistory;
  const Core = root.TriagemCore;
  if (!Base || !History) return;

  function text(value) { return String(value === null || value === undefined ? "" : value).trim(); }
  function norm(value) { return Core?.key?.(value) || History.norm?.(value) || text(value).toUpperCase(); }
  function normalizeRevision(value) { return Base.normalizeRevision(value); }
  function clone(value) { try { return structuredClone(value); } catch (_) { return JSON.parse(JSON.stringify(value)); } }
  function recordKey(record) { return text(record?.clientRecordId || record?.id); }
  function sameDocument(a, b) {
    const left = new Set(Core?.documentSearchKeys?.(a)?.map((value) => norm(value)) || [norm(a)]);
    return (Core?.documentSearchKeys?.(b)?.map((value) => norm(value)) || [norm(b)]).some((value) => left.has(value));
  }
  function cleanAuditEvent(event) {
    const item = event || {};
    return {
      id: text(item.id),
      recordId: text(item.recordId),
      historyRecordId: text(item.historyRecordId),
      egrdtNumber: text(item.egrdtNumber),
      document: text(item.document),
      previousRevision: normalizeRevision(item.previousRevision),
      newRevision: normalizeRevision(item.newRevision),
      affectedFiles: Array.isArray(item.affectedFiles) ? item.affectedFiles.map((file) => ({ index: Number(file?.index) || 0, originalName: text(file?.originalName), finalName: text(file?.finalName) })) : [],
      changedAt: text(item.changedAt),
      source: text(item.source) || Base.SOURCE,
      userId: text(item.userId),
      userEmail: text(item.userEmail),
      userName: text(item.userName),
    };
  }

  // revisionHistory viaja junto com o registro operacional. Isso faz a
  // rastreabilidade acompanhar a sincronização normal do Histórico/Supabase e
  // entrar nos backups que já exportam o Histórico, sem transformar o log em
  // fonte de verdade da revisão. A revisão válida continua nos campos
  // revision/grdtRevision do arquivo.
  if (!History.__grconRevisionHistoryPatched && typeof History.cleanRecord === "function") {
    const originalCleanRecord = History.cleanRecord.bind(History);
    History.cleanRecord = function cleanRecordWithRevisionHistory(record) {
      const cleaned = originalCleanRecord(record);
      cleaned.revisionHistory = Array.isArray(record?.revisionHistory)
        ? record.revisionHistory.map(cleanAuditEvent).filter((event) => event.id && event.document && event.changedAt)
        : [];
      return cleaned;
    };
    try { Object.defineProperty(History, "__grconRevisionHistoryPatched", { value: true, configurable: false }); }
    catch (_) { History.__grconRevisionHistoryPatched = true; }
  }

  function requestResult(request) { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error("Falha na auditoria de revisão.")); }); }
  function transactionDone(tx) { return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error || new Error("Falha na auditoria de revisão.")); tx.onabort = () => reject(tx.error || new Error("Auditoria interrompida.")); }); }
  function openDb() {
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(Base.DB_NAME, Base.DB_VERSION);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Auditoria de revisão indisponível."));
    });
  }
  async function putEvent(event) {
    const db = await openDb();
    try {
      const tx = db.transaction(Base.STORE, "readwrite");
      const done = transactionDone(tx);
      tx.objectStore(Base.STORE).put(event);
      await done;
      return event;
    } finally { db.close(); }
  }
  async function deleteEvent(id) {
    const db = await openDb();
    try {
      const tx = db.transaction(Base.STORE, "readwrite");
      const done = transactionDone(tx);
      tx.objectStore(Base.STORE).delete(id);
      await done;
    } finally { db.close(); }
  }
  function userContext() {
    const user = root.GrconCloud?.state?.session?.user || {};
    return { userId: text(user.id), userEmail: text(user.email), userName: text(user.user_metadata?.display_name || user.user_metadata?.name) };
  }
  async function awaitPersistence(result) {
    if (result?.persistence?.then) await result.persistence;
    if (result?.error) throw new Error(result.error);
  }

  async function updateDocumentRevision(recordSelector, documentSelector, nextRevision, context) {
    await History.durableReady?.();
    const wantedRecord = text(recordSelector);
    const records = History.read();
    const current = records.find((record) => record.id === wantedRecord || record.clientRecordId === wantedRecord) || null;
    if (!current) return { updated: false, error: "eGRDT não localizada no Histórico." };
    const document = text(documentSelector?.document);
    const currentRevision = normalizeRevision(documentSelector?.currentRevision);
    const newRevision = normalizeRevision(nextRevision);
    if (!document) return { updated: false, error: "Selecione o documento que será corrigido." };
    if (!Base.validRevision(newRevision)) return { updated: false, error: "Informe uma revisão válida segundo as regras do GRCON." };
    if (currentRevision === newRevision) return { updated: false, unchanged: true, error: "A nova revisão é igual à revisão atualmente registrada." };

    const next = clone(current);
    const affectedIndexes = [];
    (next.files || []).forEach((file, index) => {
      if (!sameDocument(file.document, document)) return;
      const revision = Base.revisionOf(file);
      if (currentRevision && revision !== currentRevision) return;
      affectedIndexes.push(index);
    });
    if (!affectedIndexes.length) return { updated: false, error: "Nenhum arquivo desse documento possui a revisão atual informada." };

    const distinctCurrent = [...new Set(affectedIndexes.map((index) => Base.revisionOf(next.files[index])))];
    if (distinctCurrent.length !== 1) return { updated: false, error: "O documento possui revisões diferentes dentro da mesma eGRDT. Selecione explicitamente a revisão atual antes de alterar." };
    const previousRevision = distinctCurrent[0];
    const now = text(context?.at) || new Date().toISOString();
    affectedIndexes.forEach((index) => {
      const file = next.files[index];
      file.revision = newRevision;
      file.grdtRevision = newRevision;
      file.revisionManual = true;
      file.revisionSource = "Alteração manual pós-eGRDT no Histórico";
    });
    next.localUpdatedAt = now;
    next.syncState = "pending";
    const actor = { ...userContext(), ...(context || {}) };
    const event = cleanAuditEvent({
      id: `revision-doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      recordId: recordKey(current),
      historyRecordId: text(current.id),
      egrdtNumber: text(current.egrdtNumber),
      document,
      previousRevision,
      newRevision,
      affectedFiles: affectedIndexes.map((index) => ({ index, originalName: text(next.files[index].originalName), finalName: text(next.files[index].finalName) })),
      changedAt: now,
      source: Base.SOURCE,
      userId: text(actor.userId),
      userEmail: text(actor.userEmail),
      userName: text(actor.userName),
    });
    next.revisionHistory = [...(Array.isArray(next.revisionHistory) ? next.revisionHistory : []), event];

    let saveResult;
    try {
      saveResult = History.saveMany([History.cleanRecord(next)]);
      await awaitPersistence(saveResult);
      await putEvent(event);
    } catch (error) {
      try {
        const rollback = History.saveMany([History.cleanRecord(current)]);
        await awaitPersistence(rollback);
        await deleteEvent(event.id).catch(() => null);
      } catch (rollbackError) {
        const combined = new Error(`${error.message || "Falha ao salvar a revisão."} O rollback também não pôde ser confirmado; exporte um backup antes de continuar.`);
        combined.cause = rollbackError;
        throw combined;
      }
      throw error;
    }

    const detail = { manualRevision: true, documentRevision: true, recordId: next.id, clientRecordId: recordKey(next), egrdtNumber: next.egrdtNumber, document, previousRevision, newRevision, affectedFiles: affectedIndexes.length, auditId: event.id };
    root.dispatchEvent(new CustomEvent("grcon:history-updated", { detail }));
    return { updated: true, saved: true, record: History.cleanRecord(next), previousRecord: current, document, previousRevision, newRevision, affectedFiles: affectedIndexes.length, event, persistence: saveResult?.persistence || null };
  }

  async function listAudit(filter) {
    const merged = new Map();
    try { (await Base.listAudit(filter || {})).forEach((event) => merged.set(event.id, cleanAuditEvent(event))); } catch (_) { /* Histórico abaixo continua disponível */ }
    const wantedRecord = text(filter?.recordId);
    const wantedDocument = norm(filter?.document);
    History.read().forEach((record) => {
      if (wantedRecord && recordKey(record) !== wantedRecord && text(record.id) !== wantedRecord) return;
      (record.revisionHistory || []).forEach((raw) => {
        const event = cleanAuditEvent(raw);
        if (!event.id) return;
        if (wantedDocument && norm(event.document) !== wantedDocument) return;
        merged.set(event.id, event);
      });
    });
    return [...merged.values()].sort((a, b) => String(b.changedAt).localeCompare(String(a.changedAt)));
  }
  async function exportAudit() { return listAudit({}); }

  root.GrconRevisionControl = Object.freeze({ ...Base, updateRevision: updateDocumentRevision, updateDocumentRevision, listAudit, exportAudit, cleanAuditEvent });
})(window);
