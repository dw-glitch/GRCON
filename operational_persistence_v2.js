(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconOperationalPersistence = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  // Persistência operacional silenciosa.
  // Mantém exatamente o mesmo banco e schema da implementação v2. Nenhuma
  // rotina desta camada apaga o banco. Falhas de storage ficam restritas a
  // diagnóstico/estado interno e nunca criam modal, overlay, toast ou alert.
  const DB_NAME = "grcon.operational.v2";
  const DB_VERSION = 2;
  const HISTORY_STORE = "history";
  const POSTING_STORE = "postings";
  const META_STORE = "meta";
  const QUARANTINE_STORE = "quarantine";
  const MIGRATION_HISTORY_KEY = "migration.history.localStorage.v1";
  const MIGRATION_POSTING_KEY = "migration.posting.localStorage.v1";
  const WAL_KEY = "grcon.operational.wal.v2";
  const MIGRATION_MARKER_KEY = "grcon.operational.migration.v2";
  const LAST_BACKUP_KEY = "grcon.operational.lastBackup.v1";
  const PROBE_KEY = "__grcon_storage_probe__";
  const RETRY_DELAYS = Object.freeze([2500, 10000, 30000, 60000]);
  const MAX_AUTO_RECOVERY_ATTEMPTS = RETRY_DELAYS.length;
  const LOG_DEDUPE_MS = 30000;

  const EXPECTED_SCHEMA = Object.freeze({
    [HISTORY_STORE]: Object.freeze({ keyPath: "id", indexes: Object.freeze({ byGeneratedAt: "generatedAt", byEgrdtNumber: "egrdtNumber", byClientRecordId: "clientRecordId", byWorkspaceId: "workspaceId" }) }),
    [POSTING_STORE]: Object.freeze({ keyPath: "id", indexes: Object.freeze({ byGeneratedAt: "generatedAt", byHistoryId: "historyId", byEgrdtNumber: "egrdtNumber", byStatus: "status" }) }),
    [META_STORE]: Object.freeze({ keyPath: "key", indexes: Object.freeze({}) }),
    [QUARANTINE_STORE]: Object.freeze({ keyPath: "id", indexes: Object.freeze({ byCreatedAt: "createdAt", bySource: "source" }) }),
  });

  const state = {
    installed: false,
    ready: false,
    degraded: false,
    writeBlocked: true,
    blocked: false,
    db: null,
    openPromise: null,
    initPromise: null,
    history: [],
    postings: [],
    queue: Promise.resolve(),
    originals: null,
    lastError: "",
    lastErrorDetail: null,
    migration: { history: false, postings: false },
    retryTimer: null,
    retryAttempt: 0,
    startedAt: 0,
    readyAt: 0,
    initDurationMs: 0,
    lastLogSignature: "",
    lastLogAt: 0,
  };

  function text(value) {
    return String(value === null || value === undefined ? "" : value).trim();
  }

  function clone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch (_) { /* JSON fallback */ }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function sortHistory(records) {
    return [...(records || [])].sort((a, b) => String(b && b.generatedAt || "").localeCompare(String(a && a.generatedAt || "")));
  }

  function sortPostings(records) {
    return [...(records || [])].sort((a, b) => String(b && b.generatedAt || "").localeCompare(String(a && a.generatedAt || "")));
  }

  function mergeById(current, incoming) {
    const merged = new Map();
    (current || []).forEach((item) => { if (item && item.id) merged.set(String(item.id), item); });
    (incoming || []).forEach((item) => { if (item && item.id) merged.set(String(item.id), item); });
    return [...merged.values()];
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

  function checksumRecords(records) {
    const canonical = (records || []).map((item) => [
      text(item && item.id),
      text(item && item.egrdtNumber),
      text(item && item.generatedAt),
      text(item && (item.updatedAt || item.localUpdatedAt)),
      Number(item && item.fileCount || (item && item.files && item.files.length) || 0),
    ].join("|")).sort().join("\n");
    return { count: (records || []).length, hash: fnv1a(canonical) };
  }

  function safeParsePayload(raw, label) {
    if (!text(raw)) return { ok: true, value: [], raw: "", label: text(label) };
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return { ok: false, value: [], raw, label: text(label), reason: "O conteúdo salvo não possui o formato de lista esperado." };
      return { ok: true, value: parsed, raw, label: text(label) };
    } catch (_) {
      return { ok: false, value: [], raw, label: text(label), reason: "O conteúdo salvo não pôde ser interpretado com segurança." };
    }
  }

  function storage() {
    try { return root.localStorage || null; } catch (_) { return null; }
  }

  function setLocalJson(key, value) {
    const target = storage();
    if (!target) return false;
    try { target.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
  }

  function readLocalJson(key, fallback) {
    const target = storage();
    if (!target) return fallback;
    try {
      const parsed = JSON.parse(target.getItem(key) || "null");
      return parsed === null ? fallback : parsed;
    } catch (_) { return fallback; }
  }

  function removeLocal(key) {
    const target = storage();
    if (!target) return false;
    try { target.removeItem(key); return true; } catch (_) { return false; }
  }

  function dispatch(name, detail) {
    if (typeof root.dispatchEvent !== "function" || typeof root.CustomEvent !== "function") return;
    try { root.dispatchEvent(new root.CustomEvent(name, { detail })); } catch (_) { /* ambiente sem DOM completo */ }
  }

  function errorDetail(error, operation, extra) {
    const err = error || new Error("Falha desconhecida no armazenamento local.");
    return {
      name: text(err.name) || "Error",
      message: text(err.message) || "Falha desconhecida no armazenamento local.",
      stack: text(err.stack),
      operation: text(operation),
      dbName: DB_NAME,
      requestedVersion: DB_VERSION,
      activeVersion: Number(state.db && state.db.version) || Number(extra && extra.activeVersion) || 0,
      blocked: Boolean(state.blocked),
      store: text(extra && extra.store),
      oldVersion: Number(extra && extra.oldVersion) || 0,
      newVersion: Number(extra && extra.newVersion) || 0,
      at: new Date().toISOString(),
    };
  }

  function logStorageError(error, operation, extra) {
    const detail = errorDetail(error, operation, extra);
    state.lastErrorDetail = detail;
    const signature = `${detail.name}|${detail.operation}|${detail.message}`;
    const now = Date.now();
    if (signature !== state.lastLogSignature || now - state.lastLogAt >= LOG_DEDUPE_MS) {
      console.error(`[GRCON Storage][${detail.operation || "unknown"}]`, detail);
      state.lastLogSignature = signature;
      state.lastLogAt = now;
    }
    return detail;
  }

  function isTransientStorageError(error) {
    const name = text(error && error.name);
    return ["AbortError", "InvalidStateError", "UnknownError", "NotReadableError", "TimeoutError"].includes(name)
      || /tempor|bloquead|connection|conex[aã]o/i.test(text(error && error.message));
  }

  function requestResult(request, operation) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error(`Falha em ${operation || "operação IndexedDB"}.`));
    });
  }

  function transactionDone(transaction, operation) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error(`Falha em ${operation || "transação IndexedDB"}.`));
      transaction.onabort = () => reject(transaction.error || new Error(`${operation || "Transação IndexedDB"} foi interrompida.`));
    });
  }

  function ensureIndex(store, name, keyPath, options) {
    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options || { unique: false });
  }

  function upgradeSchema(db, transaction) {
    Object.entries(EXPECTED_SCHEMA).forEach(([storeName, definition]) => {
      let store;
      if (db.objectStoreNames.contains(storeName)) {
        store = transaction.objectStore(storeName);
      } else {
        store = db.createObjectStore(storeName, { keyPath: definition.keyPath });
      }
      if (String(store.keyPath || "") !== definition.keyPath) {
        const error = new Error(`Schema incompatível na store ${storeName}: keyPath atual ${JSON.stringify(store.keyPath)}; esperado ${JSON.stringify(definition.keyPath)}.`);
        error.name = "SchemaError";
        throw error;
      }
      Object.entries(definition.indexes).forEach(([name, keyPath]) => ensureIndex(store, name, keyPath));
    });
  }

  function schemaSnapshot(db) {
    const result = { dbName: DB_NAME, version: Number(db && db.version) || 0, stores: {} };
    if (!db) return result;
    const names = [...db.objectStoreNames];
    if (!names.length) return result;
    let tx;
    try { tx = db.transaction(names, "readonly"); } catch (_) { return result; }
    names.forEach((name) => {
      try {
        const store = tx.objectStore(name);
        result.stores[name] = { keyPath: store.keyPath, autoIncrement: Boolean(store.autoIncrement), indexes: [...store.indexNames] };
      } catch (_) { /* somente diagnóstico */ }
    });
    return result;
  }

  function validateSchema(db) {
    if (!db) throw new Error("Banco local não foi aberto.");
    for (const [storeName, definition] of Object.entries(EXPECTED_SCHEMA)) {
      if (!db.objectStoreNames.contains(storeName)) {
        const error = new Error(`Store obrigatória ausente: ${storeName}.`);
        error.name = "SchemaError";
        throw error;
      }
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      if (String(store.keyPath || "") !== definition.keyPath) {
        const error = new Error(`Store ${storeName} usa keyPath ${JSON.stringify(store.keyPath)}; esperado ${JSON.stringify(definition.keyPath)}.`);
        error.name = "SchemaError";
        throw error;
      }
    }
    return true;
  }

  function attachDatabase(db) {
    state.db = db;
    state.blocked = false;
    db.onversionchange = () => {
      console.info("[GRCON Storage][versionchange] Fechando conexão antiga para permitir atualização do schema.");
      try { db.close(); } catch (_) { /* noop */ }
      if (state.db === db) state.db = null;
      state.openPromise = null;
      dispatch("grcon:persistence-versionchange", { dbName: DB_NAME, version: db.version });
    };
    return db;
  }

  function closeDatabase() {
    if (state.db) {
      try { state.db.close(); } catch (_) { /* noop */ }
    }
    state.db = null;
    state.openPromise = null;
  }

  function markBlocked(requestedVersion) {
    state.blocked = true;
    console.warn("[GRCON Storage][open] Abertura aguardando outra conexão liberar o banco; a tentativa permanece ativa.");
    dispatch("grcon:persistence-blocked", { dbName: DB_NAME, requestedVersion: Number(requestedVersion) || DB_VERSION });
  }

  function openCurrentCompatibleVersion() {
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME);
      request.onsuccess = () => {
        try {
          const db = request.result;
          validateSchema(db);
          console.warn(`[GRCON Storage][open] Banco está em versão ${db.version}, superior à versão solicitada ${DB_VERSION}; schema compatível validado sem downgrade.`);
          resolve(attachDatabase(db));
        } catch (error) {
          try { request.result && request.result.close(); } catch (_) { /* noop */ }
          reject(error);
        }
      };
      request.onerror = () => reject(request.error || new Error("Não foi possível abrir a versão existente do banco local."));
      request.onblocked = () => markBlocked(DB_VERSION);
    });
  }

  function openDatabase() {
    if (typeof root.indexedDB === "undefined") {
      const error = new Error("IndexedDB indisponível neste navegador.");
      error.name = "NotSupportedError";
      return Promise.reject(error);
    }
    if (state.db) return Promise.resolve(state.db);
    if (state.openPromise) return state.openPromise;

    state.openPromise = new Promise((resolve, reject) => {
      console.info(`[GRCON Storage][open] Abrindo ${DB_NAME} v${DB_VERSION}...`);
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      let upgradeError = null;

      request.onupgradeneeded = (event) => {
        try {
          console.info(`[GRCON Storage][upgrade] ${event.oldVersion || 0} → ${event.newVersion || DB_VERSION}`);
          upgradeSchema(request.result, request.transaction);
        } catch (error) {
          upgradeError = error;
          logStorageError(error, "upgrade", { oldVersion: event.oldVersion, newVersion: event.newVersion });
          try { request.transaction.abort(); } catch (_) { /* request.onerror concluirá */ }
        }
      };

      request.onblocked = () => markBlocked(DB_VERSION);

      request.onsuccess = () => {
        const db = attachDatabase(request.result);
        console.info(`[GRCON Storage][open] Banco aberto na versão ${db.version}.`);
        resolve(db);
      };

      request.onerror = async () => {
        const error = upgradeError || request.error || new Error("Não foi possível abrir o banco local do GRCON.");
        if (text(error.name) === "VersionError") {
          try { resolve(await openCurrentCompatibleVersion()); return; }
          catch (fallbackError) { reject(fallbackError); return; }
        }
        reject(error);
      };
    }).finally(() => { state.openPromise = null; });

    return state.openPromise;
  }

  async function validateStorageWritable(db) {
    validateSchema(db);
    const transaction = db.transaction(META_STORE, "readwrite");
    const done = transactionDone(transaction, "validação de escrita");
    const store = transaction.objectStore(META_STORE);
    store.put({ key: PROBE_KEY, value: { at: new Date().toISOString(), probe: true }, updatedAt: new Date().toISOString() });
    store.delete(PROBE_KEY);
    await done;
    return true;
  }

  async function getAll(storeName) {
    const db = await openDatabase();
    const transaction = db.transaction(storeName, "readonly");
    const done = transactionDone(transaction, `leitura de ${storeName}`);
    const values = await requestResult(transaction.objectStore(storeName).getAll(), `leitura de ${storeName}`);
    await done;
    return values || [];
  }

  async function setMeta(key, value) {
    const db = await openDatabase();
    const transaction = db.transaction(META_STORE, "readwrite");
    const done = transactionDone(transaction, "gravação de metadados");
    transaction.objectStore(META_STORE).put({ key, value, updatedAt: new Date().toISOString() });
    await done;
    return value;
  }

  async function safeSetMeta(key, value) {
    try { return await setMeta(key, value); }
    catch (error) {
      console.warn(`[GRCON Storage][meta] Metadado auxiliar ${key} não pôde ser atualizado:`, error);
      return null;
    }
  }

  async function putMany(storeName, records) {
    if (!(records || []).length) return records || [];
    const db = await openDatabase();
    const transaction = db.transaction(storeName, "readwrite");
    const done = transactionDone(transaction, `gravação de ${storeName}`);
    const store = transaction.objectStore(storeName);
    for (const record of records || []) store.put(clone(record));
    await done;
    return records || [];
  }

  async function deleteMany(storeName, ids) {
    if (!(ids || []).length) return;
    const db = await openDatabase();
    const transaction = db.transaction(storeName, "readwrite");
    const done = transactionDone(transaction, `exclusão de ${storeName}`);
    const store = transaction.objectStore(storeName);
    for (const id of ids || []) store.delete(id);
    await done;
  }

  async function replaceStore(storeName, records) {
    const db = await openDatabase();
    const transaction = db.transaction(storeName, "readwrite");
    const done = transactionDone(transaction, `substituição de ${storeName}`);
    const store = transaction.objectStore(storeName);
    store.clear();
    for (const record of records || []) store.put(clone(record));
    await done;
    return records || [];
  }

  async function clearStore(storeName) {
    const db = await openDatabase();
    const transaction = db.transaction(storeName, "readwrite");
    const done = transactionDone(transaction, `limpeza de ${storeName}`);
    transaction.objectStore(storeName).clear();
    await done;
  }

  async function quarantineRaw(sourceName, raw, reason) {
    if (!raw) return null;
    const entry = {
      id: `quarantine-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      source: text(sourceName) || "storage local",
      createdAt: new Date().toISOString(),
      reason: text(reason) || "Conteúdo local ilegível",
      raw: typeof raw === "string" ? raw : JSON.stringify(raw),
    };
    try {
      await putMany(QUARANTINE_STORE, [entry]);
    } catch (_) {
      const pending = readLocalJson("grcon.operational.quarantine.pending.v2", []);
      const next = Array.isArray(pending) ? pending.slice(-19) : [];
      next.push(entry);
      setLocalJson("grcon.operational.quarantine.pending.v2", next);
    }
    return entry;
  }

  function seedLegacy(key, cleaner, label) {
    const target = storage();
    if (!target) return { records: [], invalid: null, invalidRecords: [], raw: "" };
    let raw = "";
    try { raw = target.getItem(key) || ""; } catch (_) { return { records: [], invalid: null, invalidRecords: [], raw: "" }; }
    const parsed = safeParsePayload(raw, label);
    if (!parsed.ok) return { records: [], invalid: parsed, invalidRecords: [], raw };
    const records = [];
    const invalidRecords = [];
    parsed.value.forEach((item, index) => {
      try {
        const cleaned = cleaner(item);
        if (cleaned && cleaned.id) records.push(cleaned);
      } catch (error) {
        invalidRecords.push({ index, item, reason: text(error && error.message) || "Registro legado incompatível." });
      }
    });
    return { records, invalid: null, invalidRecords, raw };
  }

  function normalizeRecords(records, cleaner, sourceName) {
    const valid = [];
    const invalid = [];
    (records || []).forEach((item, index) => {
      try {
        const cleaned = cleaner(item);
        if (cleaned && cleaned.id) valid.push(cleaned);
        else invalid.push({ index, item, reason: "Registro sem identificador utilizável." });
      } catch (error) {
        invalid.push({ index, item, reason: text(error && error.message) || "Registro incompatível." });
      }
    });
    if (invalid.length) console.warn(`[GRCON Storage][${sourceName}] ${invalid.length} registro(s) isolado(s) sem bloquear o banco.`);
    return { valid, invalid };
  }

  async function quarantineInvalid(sourceName, invalid) {
    for (const entry of invalid || []) {
      await quarantineRaw(`${sourceName}[${entry.index}]`, entry.item, entry.reason);
    }
  }

  async function migrateCollection(options) {
    const { storeName, legacyRecords, cleaner, metaKey } = options;
    const rawCurrent = await getAll(storeName);
    const normalized = normalizeRecords(rawCurrent, cleaner, storeName);
    await quarantineInvalid(storeName, normalized.invalid);
    const merged = mergeById(normalized.valid, (legacyRecords || []).map(cleaner).filter((item) => item && item.id));
    const ordered = storeName === HISTORY_STORE ? sortHistory(merged) : sortPostings(merged);

    // Migração é somente upsert. Nunca faz clear/delete para "consertar" schema
    // ou conteúdo antigo que a versão atual não conseguiu interpretar.
    const currentIds = new Set(normalized.valid.map((item) => String(item.id)));
    const toWrite = ordered.filter((item) => !currentIds.has(String(item.id)) || (legacyRecords || []).some((legacy) => String(legacy.id) === String(item.id)));
    if (toWrite.length) await putMany(storeName, toWrite);

    const verifiedRaw = await getAll(storeName);
    const verified = normalizeRecords(verifiedRaw, cleaner, `${storeName}:verify`).valid;
    const verifiedIds = new Set(verified.map((item) => String(item.id)));
    const missing = ordered.filter((item) => !verifiedIds.has(String(item.id)));
    if (missing.length) throw new Error(`A migração de ${storeName} não passou na verificação de integridade: ${missing.length} registro(s) não foram confirmados.`);
    const final = storeName === HISTORY_STORE ? sortHistory(verified) : sortPostings(verified);
    await safeSetMeta(metaKey, { completedAt: new Date().toISOString(), ...checksumRecords(final), legacyCount: (legacyRecords || []).length, dbVersion: Number(state.db && state.db.version) || DB_VERSION });
    return final;
  }

  function journal(operation) {
    const token = `wal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setLocalJson(WAL_KEY, { token, createdAt: new Date().toISOString(), ...operation });
    return token;
  }

  function clearJournal(token) {
    const current = readLocalJson(WAL_KEY, null);
    if (current && current.token === token) removeLocal(WAL_KEY);
  }

  function applyWalToCaches(payload) {
    const wal = payload || {};
    if (wal.kind === "history") {
      if (wal.clear) state.history = [];
      if (Array.isArray(wal.deleteIds) && wal.deleteIds.length) {
        const deleted = new Set(wal.deleteIds.map(String));
        state.history = state.history.filter((item) => !deleted.has(String(item.id)));
      }
      if (Array.isArray(wal.upserts) && wal.upserts.length) {
        state.history = sortHistory(mergeById(state.history, wal.upserts.map((item) => state.originals.history.cleanRecord(item))));
      }
    }
    if (wal.kind === "postings") {
      if (wal.clear) state.postings = [];
      if (Array.isArray(wal.deleteIds) && wal.deleteIds.length) {
        const deleted = new Set(wal.deleteIds.map(String));
        state.postings = state.postings.filter((item) => !deleted.has(String(item.id)));
      }
      if (Array.isArray(wal.upserts) && wal.upserts.length) {
        state.postings = sortPostings(mergeById(state.postings, wal.upserts.map((item) => state.originals.posting.cleanRecord(item))));
      }
    }
  }

  async function replayWal() {
    const wal = readLocalJson(WAL_KEY, null);
    if (!wal || !wal.kind) return false;
    applyWalToCaches(wal);
    if (wal.kind === "history") {
      if (wal.clear) await clearStore(HISTORY_STORE);
      await deleteMany(HISTORY_STORE, wal.deleteIds || []);
      await putMany(HISTORY_STORE, wal.upserts || []);
    }
    if (wal.kind === "postings") {
      if (wal.clear) await clearStore(POSTING_STORE);
      await deleteMany(POSTING_STORE, wal.deleteIds || []);
      await putMany(POSTING_STORE, wal.upserts || []);
    }
    clearJournal(wal.token);
    return true;
  }

  function captureOriginals(History, Posting) {
    if (state.originals) return;
    state.originals = {
      history: {
        read: History.read.bind(History),
        saveMany: History.saveMany.bind(History),
        replaceWorkspaceSnapshot: History.replaceWorkspaceSnapshot.bind(History),
        markSynced: History.markSynced.bind(History),
        clear: History.clear.bind(History),
        deleteOne: History.deleteOne.bind(History),
        updateNumber: History.updateNumber.bind(History),
        cleanRecord: History.cleanRecord,
      },
      posting: {
        read: Posting.read.bind(Posting),
        write: Posting.write.bind(Posting),
        clear: Posting.clear.bind(Posting),
        cleanRecord: Posting.cleanRecord,
      },
    };
  }

  function scheduleRecovery(error) {
    if (!isTransientStorageError(error) || !state.degraded || state.retryTimer || !root.setTimeout) return;
    if (state.retryAttempt >= MAX_AUTO_RECOVERY_ATTEMPTS) {
      console.warn(`[GRCON Storage][recovery] Limite de ${MAX_AUTO_RECOVERY_ATTEMPTS} tentativas automáticas atingido; nenhuma nova tentativa será agendada nesta sessão.`);
      return;
    }
    const delay = RETRY_DELAYS[state.retryAttempt];
    state.retryAttempt += 1;
    state.retryTimer = root.setTimeout(() => {
      state.retryTimer = null;
      if (state.degraded) retry().catch(() => {});
    }, delay);
  }

  function markRuntimeFailure(error, operation) {
    const detail = logStorageError(error, operation);
    state.ready = false;
    state.degraded = true;
    state.writeBlocked = true;
    state.lastError = detail.message;
    dispatch("grcon:persistence-error", { message: state.lastError, detail });
    scheduleRecovery(error);
  }

  function enqueue(task) {
    const operation = state.queue.then(async () => {
      if (state.writeBlocked) throw new Error(state.lastError || "Persistência local indisponível.");
      return task();
    });
    // A Promise original continua rejeitando para o chamador decidir o que fazer.
    // A fila interna absorve a falha apenas para não ficar permanentemente quebrada.
    state.queue = operation.catch((error) => {
      markRuntimeFailure(error, "transaction");
      return false;
    });
    return operation;
  }

  function patchHistory(History) {
    const original = state.originals.history;
    if (History.__grconDurableV2Patched) return;

    History.read = function readDurable(customStorage) {
      if (customStorage) return original.read(customStorage);
      return clone(state.history);
    };

    History.saveMany = function saveManyDurable(records, customStorage) {
      if (customStorage) return original.saveMany(records, customStorage);
      if (state.writeBlocked) return { saved: 0, records: clone(state.history), error: state.lastError || "Armazenamento durável indisponível." };
      const incoming = (records || []).map(History.cleanRecord).filter((record) => record.egrdtNumber);
      state.history = sortHistory(mergeById(state.history, incoming));
      const token = journal({ kind: "history", upserts: incoming });
      const persistence = enqueue(async () => {
        await putMany(HISTORY_STORE, incoming);
        clearJournal(token);
        await safeSetMeta("history.checksum", checksumRecords(state.history));
        return true;
      });
      return { saved: incoming.length, records: clone(state.history), removed: 0, trimmed: 0, trimmedByCount: 0, trimmedBySize: 0, durable: true, persistence, error: "" };
    };

    History.replaceWorkspaceSnapshot = function replaceWorkspaceSnapshotDurable(records, workspaceId, customStorage) {
      if (customStorage) return original.replaceWorkspaceSnapshot(records, workspaceId, customStorage);
      if (state.writeBlocked) return { saved: 0, records: clone(state.history), removed: 0, error: state.lastError || "Armazenamento durável indisponível." };
      const workspace = History.text(workspaceId);
      const incoming = (records || []).map((record) => History.cleanRecord({ ...record, workspaceId: workspace, syncState: "synced" })).filter((record) => record.egrdtNumber);
      const cloudIds = new Set(incoming.map((record) => record.cloudId).filter(Boolean));
      const cloudClientIds = new Set(incoming.map((record) => record.clientRecordId).filter(Boolean));
      const preserved = [];
      const pendingKeys = new Set();
      let removed = 0;
      state.history.forEach((record) => {
        if (record.workspaceId !== workspace) { preserved.push(record); return; }
        if (!record.cloudId) { preserved.push(record); pendingKeys.add(record.clientRecordId || record.id); return; }
        const exists = cloudIds.has(record.cloudId) || cloudClientIds.has(record.clientRecordId);
        if (record.syncState === "pending" && exists) { preserved.push(record); pendingKeys.add(record.clientRecordId || record.id); return; }
        if (!exists) removed += 1;
      });
      const merged = new Map(preserved.map((record) => [record.id, record]));
      incoming.forEach((record) => { if (!pendingKeys.has(record.clientRecordId || record.id)) merged.set(record.id, record); });
      state.history = sortHistory([...merged.values()]);
      const persistence = enqueue(() => replaceStore(HISTORY_STORE, state.history));
      return { saved: incoming.length, records: clone(state.history), removed, durable: true, persistence, error: "" };
    };

    History.markSynced = function markSyncedDurable(recordId, cloudRecord, customStorage) {
      if (customStorage) return original.markSynced(recordId, cloudRecord, customStorage);
      const wanted = History.text(recordId);
      const index = state.history.findIndex((record) => record.id === wanted || record.clientRecordId === wanted);
      if (index < 0) return { updated: false, records: clone(state.history), error: "Registro local não localizado." };
      const cloud = cloudRecord || {};
      const updated = History.cleanRecord({
        ...state.history[index],
        cloudId: cloud.id || state.history[index].cloudId,
        workspaceId: cloud.workspace_id || state.history[index].workspaceId,
        syncedAt: cloud.updated_at || new Date().toISOString(),
        cloudUpdatedAt: cloud.updated_at || state.history[index].cloudUpdatedAt,
        syncState: "synced",
      });
      state.history[index] = updated;
      state.history = sortHistory(state.history);
      const token = journal({ kind: "history", upserts: [updated] });
      const persistence = enqueue(async () => { await putMany(HISTORY_STORE, [updated]); clearJournal(token); });
      return { updated: true, record: clone(updated), records: clone(state.history), durable: true, persistence, error: "" };
    };

    History.deleteOne = function deleteOneDurable(recordId, customStorage) {
      if (customStorage) return original.deleteOne(recordId, customStorage);
      if (state.writeBlocked) return { deleted: false, record: null, records: clone(state.history), error: state.lastError || "Armazenamento durável indisponível." };
      const id = History.text(recordId);
      const record = state.history.find((item) => item.id === id) || null;
      if (!record) return { deleted: false, record: null, records: clone(state.history), error: "Registro do histórico não localizado." };
      state.history = state.history.filter((item) => item.id !== id);
      const token = journal({ kind: "history", deleteIds: [id] });
      const persistence = enqueue(async () => { await deleteMany(HISTORY_STORE, [id]); clearJournal(token); });
      return { deleted: true, record: clone(record), records: clone(state.history), durable: true, persistence, error: "" };
    };

    History.clear = function clearDurable(customStorage) {
      if (customStorage) return original.clear(customStorage);
      if (state.writeBlocked) return false;
      state.history = [];
      enqueue(() => clearStore(HISTORY_STORE));
      return true;
    };

    History.updateNumber = function updateNumberDurable(recordId, value, customStorage) {
      if (customStorage) return original.updateNumber(recordId, value, customStorage);
      if (state.writeBlocked) return { updated: false, error: state.lastError || "Armazenamento durável indisponível." };
      const id = History.text(recordId);
      const index = state.history.findIndex((record) => record.id === id);
      if (index < 0) return { updated: false, error: "Registro do histórico não localizado." };
      const current = state.history[index];
      const currentYear = History.normalizeEgrdtNumber(current.egrdtNumber)?.year || new Date(current.generatedAt).getFullYear();
      const normalized = History.normalizeEgrdtNumber(value, currentYear);
      if (!normalized) return { updated: false, error: "Informe um número válido entre 0001 e 9999." };
      if (History.norm(current.egrdtNumber) === History.norm(normalized.baseName)) return { updated: true, record: clone(current), previous: current.egrdtNumber, records: clone(state.history) };
      const duplicate = state.history.some((record, position) => position !== index && [record.egrdtNumber, ...(record.numberHistory || [])].some((number) => History.norm(number) === History.norm(normalized.baseName)));
      if (duplicate) return { updated: false, error: "Esse número já pertence a outro registro ou a um número anterior do histórico." };
      const previous = current.egrdtNumber;
      const numberHistory = [...new Set([...(current.numberHistory || []), previous].map(History.text).filter(Boolean))];
      const updated = History.cleanRecord({
        ...current,
        egrdtNumber: normalized.baseName,
        id: `${normalized.baseName}|${current.generatedAt}|${current.outputType}`,
        clientRecordId: current.clientRecordId || current.id,
        numberHistory,
        localUpdatedAt: new Date().toISOString(),
        syncState: "pending",
      });
      state.history.splice(index, 1);
      state.history.push(updated);
      state.history = sortHistory(state.history);
      const token = journal({ kind: "history", deleteIds: [current.id], upserts: [updated] });
      const persistence = enqueue(async () => {
        await deleteMany(HISTORY_STORE, [current.id]);
        await putMany(HISTORY_STORE, [updated]);
        clearJournal(token);
      });
      return { updated: true, record: clone(updated), previous, records: clone(state.history), durable: true, persistence };
    };

    Object.defineProperty(History, "__grconDurableV2Patched", { value: true, configurable: true });
    History.durableReady = () => state.initPromise || Promise.resolve(status());
    History.durableStatus = () => status();
  }

  function diffRecords(previous, next) {
    const before = new Map((previous || []).map((item) => [String(item.id), JSON.stringify(item)]));
    const after = new Map((next || []).map((item) => [String(item.id), item]));
    const upserts = [];
    const deleteIds = [];
    after.forEach((item, id) => { if (before.get(id) !== JSON.stringify(item)) upserts.push(item); });
    before.forEach((_, id) => { if (!after.has(id)) deleteIds.push(id); });
    return { upserts, deleteIds };
  }

  function patchPosting(Posting) {
    const original = state.originals.posting;
    if (Posting.__grconDurableV2Patched) return;

    Posting.read = function readDurable(customStorage) {
      if (customStorage) return original.read(customStorage);
      return clone(state.postings);
    };

    Posting.write = function writeDurable(records, customStorage) {
      if (customStorage) return original.write(records, customStorage);
      if (state.writeBlocked) return { saved: false, records: clone(state.postings), error: state.lastError || "Armazenamento durável indisponível." };
      const next = sortPostings((records || []).map(Posting.cleanRecord).filter((record) => record.egrdtNumber));
      const diff = diffRecords(state.postings, next);
      state.postings = next;
      const token = journal({ kind: "postings", upserts: diff.upserts, deleteIds: diff.deleteIds });
      const persistence = enqueue(async () => {
        await replaceStore(POSTING_STORE, state.postings);
        clearJournal(token);
        await safeSetMeta("postings.checksum", checksumRecords(state.postings));
        return true;
      });
      return { saved: true, records: clone(state.postings), durable: true, persistence, error: "" };
    };

    Posting.clear = function clearDurable(customStorage) {
      if (customStorage) return original.clear(customStorage);
      if (state.writeBlocked) return false;
      state.postings = [];
      enqueue(() => clearStore(POSTING_STORE));
      return true;
    };

    Object.defineProperty(Posting, "__grconDurableV2Patched", { value: true, configurable: true });
    Posting.durableReady = () => state.initPromise || Promise.resolve(status());
    Posting.durableStatus = () => status();
  }

  async function initialize() {
    const History = root.GrconHistory;
    const Posting = root.GrconSigemPosting;
    if (!History || !Posting) {
      const error = new Error("Os módulos de Histórico e Postagem SIGEM ainda não estão disponíveis.");
      error.name = "DependencyError";
      throw error;
    }

    state.startedAt = Date.now();
    state.ready = false;
    state.writeBlocked = true;
    state.blocked = false;
    state.migration = { history: false, postings: false };

    const historyLegacy = seedLegacy(History.STORAGE_KEY, History.cleanRecord, "Histórico de eGRDTs");
    const postingLegacy = seedLegacy(Posting.STORAGE_KEY, Posting.cleanRecord, "Postagem SIGEM");
    if (!state.originals) {
      // O cache em memória é hidratado antes de tocar no IndexedDB. Assim,
      // indisponibilidade do storage não apaga o que ainda existe no legado.
      state.history = sortHistory(historyLegacy.records);
      state.postings = sortPostings(postingLegacy.records);
      captureOriginals(History, Posting);
      patchHistory(History);
      patchPosting(Posting);
    }

    const db = await openDatabase();
    validateSchema(db);
    await validateStorageWritable(db);

    if (historyLegacy.invalid) {
      await quarantineRaw(History.STORAGE_KEY, historyLegacy.invalid.raw, historyLegacy.invalid.reason);
      console.warn("[GRCON Storage][migration] Conteúdo legado incompatível do Histórico foi preservado em quarentena.");
    }
    if (postingLegacy.invalid) {
      await quarantineRaw(Posting.STORAGE_KEY, postingLegacy.invalid.raw, postingLegacy.invalid.reason);
      console.warn("[GRCON Storage][migration] Conteúdo legado incompatível de Postagem SIGEM foi preservado em quarentena.");
    }
    await quarantineInvalid(`${History.STORAGE_KEY}:legacy`, historyLegacy.invalidRecords);
    await quarantineInvalid(`${Posting.STORAGE_KEY}:legacy`, postingLegacy.invalidRecords);

    state.history = await migrateCollection({ storeName: HISTORY_STORE, legacyRecords: historyLegacy.records, cleaner: History.cleanRecord, metaKey: MIGRATION_HISTORY_KEY });
    state.migration.history = true;
    state.postings = await migrateCollection({ storeName: POSTING_STORE, legacyRecords: postingLegacy.records, cleaner: Posting.cleanRecord, metaKey: MIGRATION_POSTING_KEY });
    state.migration.postings = true;

    await replayWal();
    await safeSetMeta("storage.schema", schemaSnapshot(db));
    setLocalJson(MIGRATION_MARKER_KEY, {
      version: Number(db.version) || DB_VERSION,
      completedAt: new Date().toISOString(),
      history: checksumRecords(state.history),
      postings: checksumRecords(state.postings),
    });

    state.ready = true;
    state.degraded = false;
    state.writeBlocked = false;
    state.blocked = false;
    state.lastError = "";
    state.lastErrorDetail = null;
    state.retryAttempt = 0;
    if (state.retryTimer) { root.clearTimeout?.(state.retryTimer); state.retryTimer = null; }
    state.readyAt = Date.now();
    state.initDurationMs = Math.max(0, state.readyAt - state.startedAt);
    console.info(`[GRCON Storage][ready] Storage ready em ${state.initDurationMs} ms.`);
    dispatch("grcon:persistence-ready", { ...status(), schema: schemaSnapshot(db) });
    dispatch("grcon:history-updated", { durableHydration: true });
    dispatch("grcon:sigem-updated", { durableHydration: true });
    return status();
  }

  function status() {
    return {
      dbName: DB_NAME,
      dbVersion: Number(state.db && state.db.version) || DB_VERSION,
      requestedDbVersion: DB_VERSION,
      ready: state.ready,
      degraded: state.degraded,
      writeBlocked: state.writeBlocked,
      blocked: state.blocked,
      historyCount: state.history.length,
      postingCount: state.postings.length,
      migration: { ...state.migration },
      lastError: state.lastError,
      lastErrorDetail: state.lastErrorDetail ? { ...state.lastErrorDetail } : null,
      lastBackupAt: text(readLocalJson(LAST_BACKUP_KEY, {})?.at),
      initDurationMs: state.initDurationMs,
      retryAttempt: state.retryAttempt,
      maxAutoRecoveryAttempts: MAX_AUTO_RECOVERY_ATTEMPTS,
    };
  }

  async function health() {
    let db = state.db;
    try { db = db || await openDatabase(); }
    catch (error) {
      return { ...status(), indexedDb: false, error: text(error && error.message), schema: null, storageUsage: 0, storageQuota: 0 };
    }
    let quarantineCount = 0;
    try { quarantineCount = (await getAll(QUARANTINE_STORE)).length; } catch (_) { /* diagnostic only */ }
    let estimate = null;
    try { estimate = await root.navigator?.storage?.estimate?.(); } catch (_) { /* diagnostic only */ }
    return {
      ...status(),
      indexedDb: true,
      quarantineCount,
      storageUsage: Number(estimate && estimate.usage) || 0,
      storageQuota: Number(estimate && estimate.quota) || 0,
      schema: schemaSnapshot(db),
    };
  }

  function runInitialization() {
    if (state.initPromise) return state.initPromise;
    state.initPromise = initialize().catch((error) => {
      const detail = logStorageError(error, state.blocked ? "open-blocked" : "initialize");
      state.ready = false;
      state.degraded = true;
      state.writeBlocked = true;
      state.lastError = detail.message;
      dispatch("grcon:persistence-error", { message: state.lastError, detail });
      scheduleRecovery(error);
      return status();
    }).finally(() => { state.initPromise = null; });
    return state.initPromise;
  }

  function install() {
    if (!state.installed) state.installed = true;
    if (state.ready) return Promise.resolve(status());
    return runInitialization();
  }

  async function retry() {
    if (state.ready) return status();
    if (state.initPromise) return state.initPromise;
    console.info("[GRCON Storage][retry] Revalidando armazenamento em segundo plano.");
    closeDatabase();
    state.lastError = "";
    state.lastErrorDetail = null;
    state.blocked = false;
    return runInitialization();
  }

  async function exportState() {
    if (!state.ready && !state.degraded) await install();
    return { history: clone(state.history), postings: clone(state.postings), status: status() };
  }

  async function replaceHistory(records) {
    if (!state.ready) await install();
    if (state.writeBlocked) throw new Error(state.lastError || "Persistência durável indisponível para restauração.");
    const History = root.GrconHistory;
    const next = sortHistory((records || []).map(History.cleanRecord).filter((record) => record.egrdtNumber));
    await replaceStore(HISTORY_STORE, next);
    state.history = next;
    dispatch("grcon:history-updated", { restored: true });
    return clone(next);
  }

  async function replacePostings(records) {
    if (!state.ready) await install();
    if (state.writeBlocked) throw new Error(state.lastError || "Persistência durável indisponível para restauração.");
    const Posting = root.GrconSigemPosting;
    const next = sortPostings((records || []).map(Posting.cleanRecord).filter((record) => record.egrdtNumber));
    await replaceStore(POSTING_STORE, next);
    state.postings = next;
    dispatch("grcon:sigem-updated", { restored: true });
    return clone(next);
  }

  async function listQuarantine() {
    if (!state.ready) await install();
    return (await getAll(QUARANTINE_STORE)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async function setLastBackup(at) {
    const value = { at: text(at) || new Date().toISOString() };
    setLocalJson(LAST_BACKUP_KEY, value);
    await safeSetMeta("lastBackup", value);
    return value;
  }

  function autoInstall() {
    if (!root.document) return;
    const run = () => install().catch(() => {});
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", run, { once: true });
    else run();
  }

  autoInstall();

  return Object.freeze({
    DB_NAME, DB_VERSION, HISTORY_STORE, POSTING_STORE, META_STORE, QUARANTINE_STORE,
    WAL_KEY, MIGRATION_MARKER_KEY, LAST_BACKUP_KEY, EXPECTED_SCHEMA,
    mergeById, checksumRecords, safeParsePayload, isTransientStorageError,
    install, retry, status, health, exportState, replaceHistory, replacePostings,
    listQuarantine, quarantineRaw, setLastBackup, schemaSnapshot,
  });
});
