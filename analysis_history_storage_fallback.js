(function (root) {
  "use strict";

  const original = root.GrconAnalysisHistory;
  if (!original || original.__storageAdapterVersion) return;

  let mode = "checking";
  let issue = null;
  let checkPromise = null;
  let warningShown = false;
  const memory = { sessions: [], documents: [], summaries: [] };

  function isStorageError(error) {
    const name = String(error?.name || "");
    const text = String(error?.message || error || "").toUpperCase();
    return ["SecurityError", "InvalidStateError", "QuotaExceededError", "UnknownError", "NotAllowedError"].includes(name)
      || /INDEXEDDB|ARMAZENAMENTO|SECURITY|QUOTA|DATABASE/.test(text);
  }

  function announceFallback(error) {
    issue = error || issue || new Error("IndexedDB indisponível.");
    mode = "session";
    const apply = () => {
      document.body?.classList.add("grcon-analysis-session-storage");
      if (document.body) document.body.dataset.analysisStorageMode = "session";
      root.dispatchEvent(new CustomEvent("grcon:analysis-storage-fallback", { detail: { error: issue } }));
      if (warningShown) return;
      warningShown = true;
      const message = "O armazenamento persistente do Histórico de análises foi bloqueado. O GRCON continuará em modo temporário nesta aba; exporte o histórico antes de fechar a página.";
      if (typeof root.GrconNotify === "function") root.GrconNotify(message, "warning");
      else {
        const toast = document.getElementById("toast");
        if (toast) {
          toast.textContent = message;
          toast.className = "toast show warning";
        }
      }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply, { once: true });
    else apply();
  }

  async function ensureMode() {
    if (mode === "indexeddb" || mode === "session") return mode;
    if (checkPromise) return checkPromise;
    checkPromise = (async () => {
      try {
        const db = await original.openDatabase();
        db.close();
        mode = "indexeddb";
      } catch (error) {
        announceFallback(error);
      }
      return mode;
    })();
    return checkPromise;
  }

  function validateBackup(payload) {
    const data = payload || {};
    if (data.schema !== original.BACKUP_SCHEMA || !Array.isArray(data.sessions) || !Array.isArray(data.documents)) {
      throw new Error("Backup do Histórico de análises inválido.");
    }
    if (data.summaries != null && !Array.isArray(data.summaries)) {
      throw new Error("Os resumos do Histórico de análises são inválidos.");
    }
    return data;
  }

  function cleanMemoryBackup(payload) {
    const data = validateBackup(payload);
    const sessions = data.sessions.map(original.cleanSession);
    const byId = new Map(sessions.map((item) => [item.id, item]));
    const documents = data.documents.map((item, index) => {
      const session = byId.get(String(item?.sessionId || "")) || { id: item?.sessionId, analyzedAt: item?.analyzedAt };
      return original.cleanDocument(item, session, index);
    });
    return { sessions, documents, summaries: Array.isArray(data.summaries) ? data.summaries.slice() : [] };
  }

  function memoryCounts(rows) {
    const counts = { READY: 0, BLOCKED: 0, DISCARD: 0, REVIEW: 0, UNKNOWN: 0 };
    rows.forEach((item) => { counts[item.statusKey] = (counts[item.statusKey] || 0) + 1; });
    return counts;
  }

  function memoryQuery(filters, options) {
    const f = filters || {};
    const all = memory.documents.filter((item) => original.matches(item, f));
    all.sort((a, b) => String(b.analyzedAt).localeCompare(String(a.analyzedAt)) || String(a.document).localeCompare(String(b.document), "pt-BR"));
    const offset = Math.max(0, Number(options?.offset) || 0);
    const limit = options?.all ? all.length : Math.max(1, Number(options?.limit) || original.PAGE_SIZE);
    const rows = options?.all ? all.slice() : all.slice(offset, offset + limit);
    return {
      rows,
      total: all.length,
      counts: memoryCounts(all),
      sessionIds: [...new Set(all.map((item) => item.sessionId))],
      latest: all[0]?.analyzedAt || "",
      pageSize: limit,
    };
  }

  async function usePersistent(action, fallback) {
    await ensureMode();
    if (mode === "session") return fallback();
    try {
      return await action();
    } catch (error) {
      if (!isStorageError(error)) throw error;
      announceFallback(error);
      return fallback();
    }
  }

  async function saveAnalysis(payload) {
    return usePersistent(
      () => original.saveAnalysis(payload),
      async () => {
        const source = payload || {};
        const session = original.cleanSession(source.session || {});
        const documents = (source.documents || []).map((item, index) => original.cleanDocument(item, session, index));
        session.total = documents.length;
        session.savedDocuments = documents.length;
        session.completed = true;
        memory.sessions = memory.sessions.filter((item) => item.id !== session.id);
        memory.documents = memory.documents.filter((item) => item.sessionId !== session.id);
        memory.sessions.push(session);
        memory.documents.push(...documents);
        source.onProgress?.(documents.length, documents.length);
        return { saved: documents.length, session };
      },
    );
  }

  async function listSessions() {
    return usePersistent(
      () => original.listSessions(),
      async () => memory.sessions.slice().filter((item) => item.completed).sort((a, b) => String(b.analyzedAt).localeCompare(String(a.analyzedAt))),
    );
  }

  async function queryDocuments(filters, options) {
    return usePersistent(() => original.queryDocuments(filters, options), async () => memoryQuery(filters, options));
  }

  async function allDocuments(filters) {
    return usePersistent(() => original.allDocuments(filters), async () => memoryQuery(filters, { all: true }).rows);
  }

  async function summary(filters) {
    return usePersistent(
      () => original.summary(filters),
      async () => {
        const result = memoryQuery(filters, { all: true });
        return { total: result.total, counts: result.counts, sessions: result.sessionIds.length, latest: result.latest };
      },
    );
  }

  async function summaryFast(filters) { return summary(filters); }

  async function deleteSession(id) {
    return usePersistent(
      () => original.deleteSession(id),
      async () => {
        memory.sessions = memory.sessions.filter((item) => item.id !== id);
        memory.documents = memory.documents.filter((item) => item.sessionId !== id);
        return true;
      },
    );
  }

  async function clearAll() {
    return usePersistent(
      () => original.clearAll(),
      async () => {
        memory.sessions = [];
        memory.documents = [];
        memory.summaries = [];
        return true;
      },
    );
  }

  async function exportBackup() {
    return usePersistent(
      () => original.exportBackup(),
      async () => ({
        schema: original.BACKUP_SCHEMA,
        exportedAt: new Date().toISOString(),
        storageMode: "session",
        sessions: memory.sessions.slice(),
        documents: memory.documents.slice(),
        summaries: memory.summaries.slice(),
      }),
    );
  }

  async function importBackup(payload, options) {
    const data = validateBackup(payload);
    await ensureMode();
    if (mode === "session") {
      const cleaned = cleanMemoryBackup(data);
      if (options?.replace) {
        memory.sessions = cleaned.sessions;
        memory.documents = cleaned.documents;
        memory.summaries = cleaned.summaries;
      } else {
        const sessions = new Map(memory.sessions.map((item) => [item.id, item]));
        cleaned.sessions.forEach((item) => sessions.set(item.id, item));
        const docs = new Map(memory.documents.map((item) => [item.id, item]));
        cleaned.documents.forEach((item) => docs.set(item.id, item));
        memory.sessions = [...sessions.values()];
        memory.documents = [...docs.values()];
      }
      options?.onProgress?.(cleaned.documents.length, cleaned.documents.length);
      return { sessions: cleaned.sessions.length, documents: cleaned.documents.length };
    }

    const snapshot = options?.replace ? await original.exportBackup() : null;
    try {
      return await original.importBackup(data, options);
    } catch (error) {
      if (snapshot) {
        try { await original.importBackup(snapshot, { replace: true }); }
        catch (rollbackError) { error.rollbackError = rollbackError; }
      }
      if (isStorageError(error)) announceFallback(error);
      throw error;
    }
  }

  async function rebuildSummaries() {
    return usePersistent(() => original.rebuildSummaries(), async () => 0);
  }

  async function storageEstimate() {
    if ((await ensureMode()) === "session") return { usage: 0, quota: 0, mode: "session" };
    return original.storageEstimate();
  }

  const adapter = {
    ...original,
    __storageAdapterVersion: "1.0.0",
    validateBackup,
    ensureStorage: ensureMode,
    storageMode: () => mode,
    storageIssue: () => issue,
    openDatabase: async () => {
      if ((await ensureMode()) === "session") throw new Error("IndexedDB bloqueado. O Histórico está em modo temporário nesta aba.");
      return original.openDatabase();
    },
    saveAnalysis,
    listSessions,
    queryDocuments,
    allDocuments,
    summary,
    summaryFast,
    deleteSession,
    clearAll,
    rebuildSummaries,
    exportBackup,
    importBackup,
    storageEstimate,
  };

  root.GrconAnalysisHistory = Object.freeze(adapter);
  root.setTimeout(() => ensureMode(), 0);
})(window);
