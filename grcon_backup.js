(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconBackup = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const BACKUP_SCHEMA = "grcon.backup.v1";
  const BACKUP_VERSION = 1;
  const SNAPSHOT_DB = "grcon.backup.recovery.v1";
  const SNAPSHOT_DB_VERSION = 1;
  const SNAPSHOT_STORE = "snapshots";
  const MAX_RECOVERY_SNAPSHOTS = 3;
  const SAFE_LOCAL_KEYS = Object.freeze([
    "quality-theme-grcon",
    "grcon.egrdt.batch-limit.v1",
    "grcon.sigem.preferences.v1",
    "grcon.postingConference.preferences.v1",
    "grcon.postingConference.historyIndex.v1",
  ]);
  const CATEGORY_KEYS = Object.freeze(["history", "postings", "conference", "analysisHistory", "preferences"]);

  function text(value) {
    return String(value === null || value === undefined ? "" : value).trim();
  }

  function clone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch (_) { /* fallback */ }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function appVersion() {
    return text(root.GRCON_CONFIG?.APP_VERSION || root.GrconConfig?.APP_VERSION || root.document?.documentElement?.dataset?.version || "unknown");
  }

  function fnv1a(value) {
    const raw = String(value || "");
    let hash = 0x811c9dc5;
    for (let index = 0; index < raw.length; index += 1) {
      hash ^= raw.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }

  function payloadForHash(payload) {
    const copy = { ...(payload || {}) };
    delete copy.integrity;
    return JSON.stringify(copy);
  }

  function integrityFor(payload) {
    return { algorithm: "fnv1a32", hash: fnv1a(payloadForHash(payload)) };
  }

  function safePreferences(source) {
    const input = source && typeof source === "object" ? source : {};
    const output = {};
    SAFE_LOCAL_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(input, key) && typeof input[key] === "string") output[key] = input[key];
    });
    return output;
  }

  function validateBackup(payload) {
    const data = payload && typeof payload === "object" ? payload : null;
    const errors = [];
    if (!data) errors.push("Arquivo de backup vazio ou ilegível.");
    if (data && data.schema !== BACKUP_SCHEMA) errors.push("Este arquivo não é um backup compatível do GRCON.");
    if (data && Number(data.backupVersion) !== BACKUP_VERSION) errors.push(`Versão de backup incompatível. Esperada: ${BACKUP_VERSION}.`);
    if (data && !data.data) errors.push("O backup não contém os estados operacionais esperados.");
    if (data?.data?.history && !Array.isArray(data.data.history)) errors.push("Histórico com estrutura inválida.");
    if (data?.data?.postings && !Array.isArray(data.data.postings)) errors.push("Postagem SIGEM com estrutura inválida.");
    if (data?.data?.conference && typeof data.data.conference !== "object") errors.push("Conferência com estrutura inválida.");
    if (data?.data?.preferences && typeof data.data.preferences !== "object") errors.push("Preferências com estrutura inválida.");
    if (data?.integrity?.algorithm === "fnv1a32" && data.integrity.hash !== fnv1a(payloadForHash(data))) errors.push("A integridade do arquivo não confere. O backup pode estar incompleto ou alterado.");
    return { valid: errors.length === 0, errors };
  }

  function summarizeBackup(payload) {
    const data = payload?.data || {};
    return {
      history: Array.isArray(data.history) ? data.history.length : 0,
      postings: Array.isArray(data.postings) ? data.postings.length : 0,
      conferenceRecords: Array.isArray(data.conference?.base?.records) ? data.conference.base.records.length : 0,
      conferenceConfirmations: data.conference?.state?.items && typeof data.conference.state.items === "object" ? Object.keys(data.conference.state.items).length : 0,
      analysisSessions: Array.isArray(data.analysisHistory?.sessions) ? data.analysisHistory.sessions.length : 0,
      analysisDocuments: Array.isArray(data.analysisHistory?.documents) ? data.analysisHistory.documents.length : 0,
      preferenceKeys: Object.keys(safePreferences(data.preferences)).length,
      exportedAt: text(payload?.exportedAt),
      grconVersion: text(payload?.grconVersion),
    };
  }

  function localStorageValues() {
    const output = {};
    let storage = null;
    try { storage = root.localStorage || null; } catch (_) { storage = null; }
    if (!storage) return output;
    SAFE_LOCAL_KEYS.forEach((key) => {
      try {
        const value = storage.getItem(key);
        if (value !== null) output[key] = value;
      } catch (_) { /* preferência opcional */ }
    });
    return output;
  }

  async function ensureConference() {
    if (root.GrconPostingConference) return root.GrconPostingConference;
    if (root.GRCONModuleLoader?.ensure) {
      try { await root.GRCONModuleLoader.ensure("posting_conference_core.js"); } catch (_) { /* backup sem conferência se indisponível */ }
    }
    return root.GrconPostingConference || null;
  }

  async function conferenceSnapshot() {
    const Conference = await ensureConference();
    if (!Conference) return null;
    const [base, state, audit] = await Promise.all([
      Conference.loadBase?.() || null,
      Conference.loadState?.() || null,
      Conference.loadAudit?.() || [],
    ]);
    return {
      base: clone(base),
      state: clone(state),
      audit: Array.isArray(audit) ? clone(audit) : [],
      preferences: clone(Conference.readPreferences?.() || {}),
    };
  }

  async function analysisSnapshot() {
    const Analysis = root.GrconAnalysisHistory;
    if (!Analysis?.exportBackup) return null;
    try { return clone(await Analysis.exportBackup()); } catch (_) { return null; }
  }

  async function buildBackup(options) {
    const Persistence = root.GrconOperationalPersistence;
    if (!Persistence?.exportState) throw new Error("A persistência durável ainda não está pronta para backup.");
    await Persistence.install?.();
    const [operational, conference, analysisHistory] = await Promise.all([
      Persistence.exportState(),
      conferenceSnapshot(),
      analysisSnapshot(),
    ]);
    const now = new Date().toISOString();
    const payload = {
      schema: BACKUP_SCHEMA,
      backupVersion: BACKUP_VERSION,
      grconVersion: appVersion(),
      exportedAt: now,
      reason: text(options?.reason) || "manual",
      data: {
        history: clone(operational.history || []),
        postings: clone(operational.postings || []),
        conference,
        analysisHistory,
        preferences: localStorageValues(),
      },
    };
    payload.integrity = integrityFor(payload);
    return payload;
  }

  function pad(value) { return String(value).padStart(2, "0"); }
  function backupFileName(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue || Date.now());
    return `GRCON_Backup_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}.grconbackup`;
  }

  function downloadBackup(payload) {
    if (!root.document || typeof root.Blob !== "function" || !root.URL?.createObjectURL) throw new Error("Download indisponível neste ambiente.");
    const validation = validateBackup(payload);
    if (!validation.valid) throw new Error(validation.errors[0]);
    const blob = new root.Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = root.URL.createObjectURL(blob);
    const anchor = root.document.createElement("a");
    anchor.href = url;
    anchor.download = backupFileName(payload.exportedAt);
    anchor.style.display = "none";
    root.document.body.appendChild(anchor);
    anchor.click();
    root.setTimeout(() => { anchor.remove(); root.URL.revokeObjectURL(url); }, 250);
    return anchor.download;
  }

  async function createAndDownload(options) {
    const payload = await buildBackup(options);
    const fileName = downloadBackup(payload);
    await root.GrconOperationalPersistence?.setLastBackup?.(payload.exportedAt);
    return { payload, fileName, summary: summarizeBackup(payload) };
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Falha no armazenamento de recuperação."));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Falha ao salvar snapshot de recuperação."));
      transaction.onabort = () => reject(transaction.error || new Error("Snapshot de recuperação interrompido."));
    });
  }

  function openSnapshotDb() {
    if (typeof root.indexedDB === "undefined") return Promise.reject(new Error("IndexedDB indisponível para snapshot de recuperação."));
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(SNAPSHOT_DB, SNAPSHOT_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          const store = db.createObjectStore(SNAPSHOT_STORE, { keyPath: "id" });
          store.createIndex("byCreatedAt", "createdAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Não foi possível abrir a área de recuperação."));
    });
  }

  async function trimRecoverySnapshots(db) {
    const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
    const done = transactionDone(tx);
    const store = tx.objectStore(SNAPSHOT_STORE);
    const all = await requestResult(store.getAll());
    (all || []).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(MAX_RECOVERY_SNAPSHOTS).forEach((item) => store.delete(item.id));
    await done;
  }

  async function saveRecoverySnapshot(payload, reason) {
    const validation = validateBackup(payload);
    if (!validation.valid) throw new Error("O estado atual não pôde ser validado para criar o snapshot de segurança.");
    const db = await openSnapshotDb();
    try {
      const entry = { id: `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString(), reason: text(reason) || "before-restore", payload: clone(payload) };
      let tx = db.transaction(SNAPSHOT_STORE, "readwrite");
      let done = transactionDone(tx);
      tx.objectStore(SNAPSHOT_STORE).put(entry);
      await done;
      await trimRecoverySnapshots(db);
      return entry;
    } finally { db.close(); }
  }

  async function latestRecoverySnapshot() {
    const db = await openSnapshotDb();
    try {
      const tx = db.transaction(SNAPSHOT_STORE, "readonly");
      const done = transactionDone(tx);
      const all = await requestResult(tx.objectStore(SNAPSHOT_STORE).getAll());
      await done;
      return (all || []).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
    } finally { db.close(); }
  }

  async function conferenceKvSet(key, value) {
    const Conference = await ensureConference();
    if (!Conference || typeof root.indexedDB === "undefined") return false;
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(Conference.DB_NAME, Conference.DB_VERSION);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put({ key, value: clone(value) });
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); reject(tx.error || new Error("Falha ao restaurar dados da Conferência.")); };
      };
      request.onerror = () => reject(request.error || new Error("Falha ao abrir os dados da Conferência."));
    });
  }

  function selectedCategories(options) {
    const requested = Array.isArray(options?.categories) && options.categories.length ? new Set(options.categories) : new Set(CATEGORY_KEYS);
    return new Set(CATEGORY_KEYS.filter((key) => requested.has(key)));
  }

  async function applyBackup(payload, options) {
    const validation = validateBackup(payload);
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    const categories = selectedCategories(options);
    const data = payload.data || {};
    const Persistence = root.GrconOperationalPersistence;
    if (!Persistence) throw new Error("Persistência durável indisponível para restauração.");

    if (categories.has("history") && Array.isArray(data.history)) await Persistence.replaceHistory(data.history);
    if (categories.has("postings") && Array.isArray(data.postings)) await Persistence.replacePostings(data.postings);

    if (categories.has("conference") && data.conference) {
      const Conference = await ensureConference();
      if (Conference) {
        if (data.conference.base) await Conference.saveBase(data.conference.base);
        if (data.conference.state) await Conference.saveState(data.conference.state);
        if (Array.isArray(data.conference.audit)) await conferenceKvSet(Conference.AUDIT_KEY, data.conference.audit.slice(0, 40));
        if (data.conference.preferences) Conference.savePreferences?.(data.conference.preferences);
        await Conference.reconcilePersisted?.(root.GrconHistory?.read?.() || []);
      }
    }

    if (categories.has("analysisHistory") && data.analysisHistory && root.GrconAnalysisHistory?.importBackup) {
      await root.GrconAnalysisHistory.importBackup(data.analysisHistory, { replace: true });
    }

    if (categories.has("preferences")) {
      const preferences = safePreferences(data.preferences);
      let storage = null;
      try { storage = root.localStorage || null; } catch (_) { storage = null; }
      if (storage) Object.entries(preferences).forEach(([key, value]) => storage.setItem(key, value));
    }

    root.dispatchEvent?.(new CustomEvent("grcon:history-updated", { detail: { backupRestore: true } }));
    root.dispatchEvent?.(new CustomEvent("grcon:sigem-updated", { detail: { backupRestore: true } }));
    root.dispatchEvent?.(new CustomEvent("grcon:conference-updated", { detail: { backupRestore: true } }));
    return { restored: true, categories: [...categories], summary: summarizeBackup(payload) };
  }

  async function restore(payload, options) {
    const validation = validateBackup(payload);
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    const current = await buildBackup({ reason: "pre-restore-snapshot" });
    const snapshot = await saveRecoverySnapshot(current, "before-restore");
    try {
      const result = await applyBackup(payload, options);
      return { ...result, recoverySnapshotId: snapshot.id };
    } catch (error) {
      try { await applyBackup(current, { categories: CATEGORY_KEYS }); }
      catch (rollbackError) {
        const combined = new Error("A restauração falhou e o rollback automático também não pôde ser concluído. O snapshot de segurança continua preservado no navegador.");
        combined.cause = { restore: error, rollback: rollbackError };
        throw combined;
      }
      const safe = new Error("A restauração não pôde ser concluída. O estado anterior foi restaurado automaticamente.");
      safe.cause = error;
      throw safe;
    }
  }

  async function parseFile(file) {
    if (!file || typeof file.text !== "function") throw new Error("Selecione um arquivo .grconbackup válido.");
    let payload;
    try { payload = JSON.parse(await file.text()); }
    catch (_) { throw new Error("O arquivo selecionado não pôde ser lido como backup do GRCON."); }
    const validation = validateBackup(payload);
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    return payload;
  }

  return Object.freeze({
    BACKUP_SCHEMA, BACKUP_VERSION, SNAPSHOT_DB, SNAPSHOT_STORE, SAFE_LOCAL_KEYS, CATEGORY_KEYS,
    fnv1a, integrityFor, validateBackup, summarizeBackup, safePreferences, backupFileName,
    buildBackup, downloadBackup, createAndDownload, saveRecoverySnapshot, latestRecoverySnapshot,
    applyBackup, restore, parseFile,
  });
});
