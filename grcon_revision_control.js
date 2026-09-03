(function (root, factory) {
  const safeRequire = (path) => {
    if (typeof require !== "function") return null;
    try { return require(path); } catch (_) { return null; }
  };
  const api = factory(root, root.GrconHistory || safeRequire("./history_core.js"), root.TriagemCore || safeRequire("./core.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconRevisionControl = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, History, Core) {
  "use strict";

  const DB_NAME = "grcon.revision-audit.v1";
  const DB_VERSION = 1;
  const STORE = "events";
  const SOURCE = "ALTERACAO_MANUAL_HISTORICO";

  function text(value) { return String(value === null || value === undefined ? "" : value).trim(); }
  function norm(value) {
    if (Core && typeof Core.key === "function") return Core.key(value);
    if (History && typeof History.norm === "function") return History.norm(value);
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ");
  }
  function normalizeRevision(value) {
    if (Core && typeof Core.normalizeRevision === "function") return Core.normalizeRevision(value);
    return norm(value).replace(/^REV(?:ISAO)?\.?\s*/, "").replace(/\s+/g, "");
  }
  function revisionOf(file) {
    const value = text(file && (file.grdtRevision || file.revision));
    return normalizeRevision(value || (History && History.generatedRevision ? History.generatedRevision(file) : ""));
  }
  function validRevision(value) {
    const revision = normalizeRevision(value);
    if (!revision) return false;
    if (Core && typeof Core.revisionRank === "function") return Core.revisionRank(revision) >= 0;
    return /^(?:0|[A-HJ-NP-Z]+)$/.test(revision);
  }
  function clone(value) {
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch (_) { /* fallback */ }
    }
    return JSON.parse(JSON.stringify(value));
  }
  function recordId(record) { return text(record && (record.clientRecordId || record.id)); }
  function sameDocument(left, right) { return norm(left) === norm(right); }

  function locateFile(record, selector) {
    const files = Array.isArray(record && record.files) ? record.files : [];
    const index = Number(selector && selector.fileIndex);
    if (Number.isInteger(index) && index >= 0 && index < files.length) {
      const candidate = files[index];
      if (!selector.document || sameDocument(candidate.document, selector.document)) return { index, file: candidate };
    }
    const wantedDocument = text(selector && selector.document);
    const wantedOriginal = norm(selector && selector.originalName);
    const wantedFinal = norm(selector && selector.finalName);
    const matches = files.map((file, fileIndex) => ({ file, index: fileIndex })).filter(({ file }) => {
      if (wantedDocument && !sameDocument(file.document, wantedDocument)) return false;
      if (wantedOriginal && norm(file.originalName) !== wantedOriginal) return false;
      if (wantedFinal && norm(file.finalName) !== wantedFinal) return false;
      return true;
    });
    if (matches.length !== 1) return null;
    return matches[0];
  }

  function applyRevision(record, selector, nextRevision, context) {
    if (!record) return { updated: false, error: "eGRDT não localizada no Histórico." };
    const revision = normalizeRevision(nextRevision);
    if (!validRevision(revision)) return { updated: false, error: "Informe uma revisão válida segundo as regras do GRCON." };
    const next = clone(record);
    const found = locateFile(next, selector || {});
    if (!found) return { updated: false, error: "Não foi possível identificar de forma inequívoca o documento dentro da eGRDT." };
    const previous = revisionOf(found.file);
    if (previous === revision) return { updated: false, unchanged: true, error: "A nova revisão é igual à revisão atualmente registrada." };
    const now = text(context && context.at) || new Date().toISOString();
    found.file.revision = revision;
    found.file.grdtRevision = revision;
    found.file.revisionManual = true;
    found.file.revisionSource = "Alteração manual pós-eGRDT no Histórico";
    next.localUpdatedAt = now;
    next.syncState = "pending";
    const event = {
      id: `revision-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      recordId: recordId(record),
      historyRecordId: text(record.id),
      egrdtNumber: text(record.egrdtNumber),
      document: text(found.file.document),
      fileIndex: found.index,
      originalName: text(found.file.originalName),
      finalName: text(found.file.finalName),
      previousRevision: previous,
      newRevision: revision,
      changedAt: now,
      source: SOURCE,
      userId: text(context && context.userId),
      userEmail: text(context && context.userEmail),
      userName: text(context && context.userName),
    };
    return { updated: true, record: next, previousRecord: clone(record), fileIndex: found.index, file: clone(found.file), previousRevision: previous, newRevision: revision, event };
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Falha ao acessar a auditoria de revisão."));
    });
  }
  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Falha ao salvar a auditoria de revisão."));
      tx.onabort = () => reject(tx.error || new Error("A gravação da auditoria foi interrompida."));
    });
  }
  function openDb() {
    if (!root || typeof root.indexedDB === "undefined") return Promise.reject(new Error("IndexedDB indisponível para registrar a alteração de revisão."));
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("byRecordId", "recordId", { unique: false });
          store.createIndex("byDocument", "document", { unique: false });
          store.createIndex("byChangedAt", "changedAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Não foi possível abrir a auditoria de revisão."));
    });
  }
  async function putAudit(event) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readwrite");
      const done = transactionDone(tx);
      tx.objectStore(STORE).put(clone(event));
      await done;
      return event;
    } finally { db.close(); }
  }
  async function deleteAudit(id) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readwrite");
      const done = transactionDone(tx);
      tx.objectStore(STORE).delete(id);
      await done;
    } finally { db.close(); }
  }
  async function listAudit(filter) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readonly");
      const done = transactionDone(tx);
      const all = await requestResult(tx.objectStore(STORE).getAll());
      await done;
      const record = text(filter && filter.recordId);
      const document = norm(filter && filter.document);
      return (all || []).filter((event) => (!record || event.recordId === record) && (!document || norm(event.document) === document))
        .sort((a, b) => String(b.changedAt).localeCompare(String(a.changedAt)));
    } finally { db.close(); }
  }
  async function exportAudit() {
    try { return await listAudit({}); } catch (_) { return []; }
  }

  function userContext() {
    const user = root && root.GrconCloud && root.GrconCloud.state && root.GrconCloud.state.session && root.GrconCloud.state.session.user || {};
    return { userId: text(user.id), userEmail: text(user.email), userName: text(user.user_metadata && (user.user_metadata.display_name || user.user_metadata.name)) };
  }
  async function awaitPersistence(result) {
    if (result && result.persistence && typeof result.persistence.then === "function") await result.persistence;
    if (result && result.error) throw new Error(result.error);
  }

  async function updateRevision(recordSelector, fileSelector, nextRevision, context) {
    if (!History || typeof History.read !== "function" || typeof History.saveMany !== "function") throw new Error("Histórico do GRCON indisponível.");
    await History.durableReady?.();
    const records = History.read();
    const wanted = text(recordSelector);
    const current = records.find((record) => record.id === wanted || record.clientRecordId === wanted) || null;
    const applied = applyRevision(current, fileSelector, nextRevision, { ...userContext(), ...(context || {}) });
    if (!applied.updated) return applied;

    let saveResult = null;
    try {
      saveResult = History.saveMany([History.cleanRecord ? History.cleanRecord(applied.record) : applied.record]);
      await awaitPersistence(saveResult);
      await putAudit(applied.event);
    } catch (error) {
      try {
        const rollback = History.saveMany([History.cleanRecord ? History.cleanRecord(applied.previousRecord) : applied.previousRecord]);
        await awaitPersistence(rollback);
        await deleteAudit(applied.event.id).catch(() => null);
      } catch (rollbackError) {
        const combined = new Error(`${error.message || "Falha ao salvar a revisão."} O GRCON também não conseguiu confirmar o rollback; faça um backup antes de continuar.`);
        combined.cause = rollbackError;
        throw combined;
      }
      throw error;
    }

    const detail = { manualRevision: true, recordId: applied.record.id, clientRecordId: recordId(applied.record), egrdtNumber: applied.record.egrdtNumber, document: applied.event.document, previousRevision: applied.previousRevision, newRevision: applied.newRevision, auditId: applied.event.id };
    root.dispatchEvent?.(new CustomEvent("grcon:history-updated", { detail }));
    return { ...applied, saved: true, persistence: saveResult && saveResult.persistence || null };
  }

  return Object.freeze({ DB_NAME, DB_VERSION, STORE, SOURCE, revisionOf, validRevision, locateFile, applyRevision, updateRevision, listAudit, exportAudit, normalizeRevision });
});
