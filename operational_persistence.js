(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconOperationalPersistence = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const DB_NAME = "grcon.operational.v2";
  const DB_VERSION = 1;
  const HISTORY_STORE = "history";
  const POSTING_STORE = "postings";
  const META_STORE = "meta";
  const QUARANTINE_STORE = "quarantine";
  const MIGRATION_HISTORY_KEY = "migration.history.localStorage.v1";
  const MIGRATION_POSTING_KEY = "migration.posting.localStorage.v1";
  const WAL_KEY = "grcon.operational.wal.v2";
  const MIGRATION_MARKER_KEY = "grcon.operational.migration.v2";
  const LAST_BACKUP_KEY = "grcon.operational.lastBackup.v1";

  const state = {
    installed: false,
    ready: false,
    degraded: false,
    writeBlocked: false,
    db: null,
    history: [],
    postings: [],
    queue: Promise.resolve(),
    initPromise: null,
    originals: null,
    lastError: "",
    migration: { history: false, postings: false },
  };

  function text(value) {
    return String(value === null || value === undefined ? "" : value).trim();
  }

  function clone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch (_) { /* fallback abaixo */ }
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
      text(item && item.updatedAt),
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

  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
    else if (kind === "error") console.error(`GRCON: ${message}`);
    else if (kind === "warning") console.warn(`GRCON: ${message}`);
  }

  function setLocalJson(key, value) {
    const target = storage();
    if (!target) return false;
    try { target.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
  }

  function removeLocal(key) {
    const target = storage();
    if (!target) return false;
    try { target.removeItem(key); return true; } catch (_) { return false; }
  }

  function readLocalJson(key, fallback) {
    const target = storage();
    if (!target) return fallback;
    try {
      const parsed = JSON.parse(target.getItem(key) || "null");
      return parsed === null ? fallback : parsed;
    } catch (_) { return fallback; }
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Falha no armazenamento local do GRCON."));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Falha ao gravar dados locais do GRCON."));
      transaction.onabort = () => reject(transaction.error || new Error("A gravação local do GRCON foi interrompida."));
    });
  }

  function ensureIndex(store, name, keyPath, options) {
    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options || { unique: false });
  }

  function openDatabase() {
    if (typeof root.indexedDB === "undefined") return Promise.reject(new Error("IndexedDB indisponível neste navegador."));
    if (state.db) return Promise.resolve(state.db);
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const transaction = request.transaction;
        const history = db.objectStoreNames.contains(HISTORY_STORE)
          ? transaction.objectStore(HISTORY_STORE)
          : db.createObjectStore(HISTORY_STORE, { keyPath: "id" });
        ensureIndex(history, "byGeneratedAt", "generatedAt");
        ensureIndex(history, "byEgrdtNumber", "egrdtNumber");
        ensureIndex(history, "byClientRecordId", "clientRecordId");
        ensureIndex(history, "byWorkspaceId", "workspaceId");

        const postings = db.objectStoreNames.contains(POSTING_STORE)
          ? transaction.objectStore(POSTING_STORE)
          : db.createObjectStore(POSTING_STORE, { keyPath: "id" });
        ensureIndex(postings, "byGeneratedAt", "generatedAt");
        ensureIndex(postings, "byHistoryId", "historyId");
        ensureIndex(postings, "byEgrdtNumber", "egrdtNumber");
        ensureIndex(postings, "byStatus", "status");

        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "key" });
        if (!db.objectStoreNames.contains(QUARANTINE_STORE)) {
          const quarantine = db.createObjectStore(QUARANTINE_STORE, { keyPath: "id" });
          ensureIndex(quarantine, "byCreatedAt", "createdAt");
          ensureIndex(quarantine, "bySource", "source");
        }
      };
      request.onsuccess = () => {
        state.db = request.result;
        state.db.onversionchange = () => { try { state.db.close(); } catch (_) { /* noop */ } state.db = null; };
        resolve(state.db);
      };
      request.onerror = () => reject(request.error || new Error("Não foi possível abrir o banco local do GRCON."));
      request.onblocked = () => reject(new Error("Feche outras abas antigas do GRCON e tente novamente."));
    });
  }

  async function getAll(storeName) {
    const db = await openDatabase();
    const transaction = db.transaction(storeName, "readonly");
    const done = transactionDone(transaction);
    const values = await requestResult(transaction.objectStore(storeName).getAll());
    await done;
    return values || [];
  }

  async function getMeta(key, fallback) {
    const db = await openDatabase();
    const transaction = db.transaction(META_STORE, "readonly");
    const done = transactionDone(transaction);
    const value = await requestResult(transaction.objectStore(META_STORE).get(key));
    await done;
    return value ? value.value : fallback;
  }

  async function setMeta(key, value) {
    const db = await openDatabase();
    const transaction = db.transaction(META_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(META_STORE).put({ key, value, updatedAt: new Date().toISOString() });
    await done;
    return value;
  }

  async function replaceStore(storeName, records) {
    const db = await openDatabase();
    const transaction = db.transaction(storeName, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(storeName);
    store.clear();
    (records || []).forEach((record) => store.put(clone(record)));
    await done;
    return records || [];
  }

  async function putMany(storeName, records) {
    const db = await openDatabase();
    const transaction = db.transaction(storeName, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(storeName);
    (records || []).forEach((record) => store.put(clone(record)));
    await done;
    return records || [];
  }

  async function deleteMany(storeName, ids) {
    const db = await openDatabase();
    const transaction = db.transaction(storeName, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(storeName);
    (ids || []).forEach((id) => store.delete(id));
    await done;
  }

  async function clearStore(storeName) {
    const db = await openDatabase();
    const transaction = db.transaction(storeName, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(storeName).clear();
    await done;
  }

  async function quarantineRaw(source, raw, reason) {
    if (!raw) return null;
    const entry = {
      id: `quarantine-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      source: text(source) || "storage local",
      createdAt: new Date().toISOString(),
      reason: text(reason) || "Conteúdo local ilegível",
      raw: String(raw),
    };
    try {
      const db = await openDatabase();
      const transaction = db.transaction(QUARANTINE_STORE, "readwrite");
      const done = transactionDone(transaction);
      transaction.objectStore(QUARANTINE_STORE).put(entry);
      await done;
    } catch (_) {
      setLocalJson("grcon.operational.quarantine.pending.v1", entry);
    }
    return entry;
  }

  function seedLegacy(key, cleaner, label) {
    const target = storage();
    if (!target) return { records: [], invalid: null };
    let raw = "";
    try { raw = target.getItem(key) || ""; } catch (_) { return { records: [], invalid: null }; }
    const parsed = safeParsePayload(raw, label);
    if (!parsed.ok) return { records: [], invalid: parsed };
    const records = parsed.value.map((item) => cleaner(item)).filter((item) => item && item.id);
    return { records, invalid: null, raw };
  }

  function journal(operation) {
    const token = `wal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = { token, createdAt: new Date().toISOString(), ...operation };
    setLocalJson(WAL_KEY, payload);
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
    if (wal.kind === "history") await replaceStore(HISTORY_STORE, state.history);
    if (wal.kind === "postings") await replaceStore(POSTING_STORE, state.postings);
    clearJournal(wal.token);
    return true;
  }

  function enqueue(task, failureMessage) {
    const operation = state.queue.then(async () => {
      if (state.writeBlocked) throw new Error(state.lastError || "Persistência local indisponível.");
      return task();
    });
    state.queue = operation.catch((error) => {
      state.lastError = error && error.message || "Falha na persistência local.";
      state.writeBlocked = true;
      notify(failureMessage || "Não foi possível salvar os dados locais. Nenhum registro será descartado; faça um backup antes de continuar.", "error");
      root.dispatchEvent?.(new CustomEvent("grcon:persistence-error", { detail: { message: state.lastError } }));
    });
    return operation;
  }

  function patchHistory(History) {
    const original = state.originals.history;

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
        await setMeta("history.checksum", checksumRecords(state.history));
        return true;
      }, "Não foi possível confirmar a gravação do Histórico no banco local. Os dados desta operação foram preservados para recuperação.");
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
      const persistence = enqueue(() => replaceStore(HISTORY_STORE, state.history), "Não foi possível reconciliar o Histórico compartilhado no banco local.");
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
      const persistence = enqueue(async () => { await putMany(HISTORY_STORE, [updated]); clearJournal(token); }, "Não foi possível confirmar a sincronização no banco local.");
      return { updated: true, record: clone(updated), records: clone(state.history), durable: true, persistence, error: "" };
    };

    History.deleteOne = function deleteOneDurable(recordId, customStorage) {
      if (customStorage) return original.deleteOne(recordId, customStorage);
      const id = History.text(recordId);
      const record = state.history.find((item) => item.id === id) || null;
      if (!record) return { deleted: false, record: null, records: clone(state.history), error: "Registro do histórico não localizado." };
      state.history = state.history.filter((item) => item.id !== id);
      const token = journal({ kind: "history", deleteIds: [id] });
      const persistence = enqueue(async () => { await deleteMany(HISTORY_STORE, [id]); clearJournal(token); }, "Não foi possível concluir a exclusão no banco local.");
      return { deleted: true, record: clone(record), records: clone(state.history), durable: true, persistence, error: "" };
    };

    History.clear = function clearDurable(customStorage) {
      if (customStorage) return original.clear(customStorage);
      if (state.writeBlocked) return false;
      state.history = [];
      enqueue(() => clearStore(HISTORY_STORE), "Não foi possível limpar o Histórico local.");
      return true;
    };

    History.updateNumber = function updateNumberDurable(recordId, value, customStorage) {
      if (customStorage) return original.updateNumber(recordId, value, customStorage);
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
      }, "Não foi possível salvar a alteração de número no banco local.");
      return { updated: true, record: clone(updated), previous, records: clone(state.history), durable: true, persistence };
    };

    History.durableReady = () => state.initPromise || Promise.resolve();
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
        await setMeta("postings.checksum", checksumRecords(state.postings));
        return true;
      }, "Não foi possível confirmar os registros de Postagem SIGEM no banco local. Nenhum registro foi descartado.");
      return { saved: true, records: clone(state.postings), durable: true, persistence, error: "" };
    };

    Posting.clear = function clearDurable(customStorage) {
      if (customStorage) return original.clear(customStorage);
      if (state.writeBlocked) return false;
      state.postings = [];
      enqueue(() => clearStore(POSTING_STORE), "Não foi possível limpar os registros de Postagem SIGEM.");
      return true;
    };

    Posting.durableReady = () => state.initPromise || Promise.resolve();
    Posting.durableStatus = () => status();
  }

  function createLoadingSurface() {
    if (!root.document || root.document.getElementById("grcon-persistence-gate")) return null;
    const style = root.document.createElement("style");
    style.id = "grcon-persistence-gate-style";
    style.textContent = `
      #grcon-persistence-gate{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:rgba(246,249,251,.96);font-family:Arial,sans-serif;color:#16324a}
      #grcon-persistence-gate[hidden]{display:none}
      #grcon-persistence-gate>div{width:min(460px,calc(100vw - 32px));padding:24px;border:1px solid #d5dee5;border-radius:16px;background:#fff;box-shadow:0 18px 50px rgba(22,50,74,.15)}
      #grcon-persistence-gate strong{display:block;font-size:18px;margin-bottom:8px}#grcon-persistence-gate span{display:block;font-size:14px;line-height:1.5;color:#5b6770}
    `;
    root.document.head.appendChild(style);
    const gate = root.document.createElement("section");
    gate.id = "grcon-persistence-gate";
    gate.setAttribute("role", "status");
    gate.setAttribute("aria-live", "polite");
    gate.innerHTML = "<div><strong>Preparando os dados locais do GRCON</strong><span>Conferindo Histórico e Postagem SIGEM antes de liberar a operação.</span></div>";
    root.document.body.appendChild(gate);
    return gate;
  }

  function finishLoadingSurface(gate, error) {
    if (!gate) return;
    if (!error) {
      gate.hidden = true;
      root.setTimeout(() => { gate.remove(); root.document.getElementById("grcon-persistence-gate-style")?.remove(); }, 250);
      return;
    }
    gate.querySelector("strong").textContent = "Dados locais preservados em modo seguro";
    gate.querySelector("span").textContent = "O banco local não pôde ser preparado. O GRCON não gravará novos históricos até que o armazenamento esteja disponível. Recarregue a página; seus dados antigos não foram apagados.";
    root.setTimeout(() => { gate.hidden = true; }, 5000);
  }

  async function migrateCollection(options) {
    const { storeName, legacyRecords, cleaner, metaKey } = options;
    const current = (await getAll(storeName)).map(cleaner).filter((item) => item && item.id);
    const merged = mergeById(current, legacyRecords.map(cleaner).filter((item) => item && item.id));
    const normalized = storeName === HISTORY_STORE ? sortHistory(merged) : sortPostings(merged);
    const before = checksumRecords(normalized);
    if (current.length !== normalized.length || checksumRecords(current).hash !== before.hash) await replaceStore(storeName, normalized);
    const verified = (await getAll(storeName)).map(cleaner).filter((item) => item && item.id);
    const after = checksumRecords(verified);
    if (before.count !== after.count || before.hash !== after.hash) throw new Error(`A migração de ${storeName} não passou na verificação de integridade.`);
    await setMeta(metaKey, { completedAt: new Date().toISOString(), ...after, legacyCount: legacyRecords.length });
    return storeName === HISTORY_STORE ? sortHistory(verified) : sortPostings(verified);
  }

  async function initialize() {
    const History = root.GrconHistory;
    const Posting = root.GrconSigemPosting;
    if (!History || !Posting) throw new Error("Os módulos de Histórico e Postagem SIGEM ainda não estão disponíveis.");

    const historyLegacy = seedLegacy(History.STORAGE_KEY, History.cleanRecord, "Histórico de eGRDTs");
    const postingLegacy = seedLegacy(Posting.STORAGE_KEY, Posting.cleanRecord, "Postagem SIGEM");
    state.history = sortHistory(historyLegacy.records);
    state.postings = sortPostings(postingLegacy.records);

    state.originals = {
      history: {
        read: History.read.bind(History), saveMany: History.saveMany.bind(History), replaceWorkspaceSnapshot: History.replaceWorkspaceSnapshot.bind(History),
        markSynced: History.markSynced.bind(History), clear: History.clear.bind(History), deleteOne: History.deleteOne.bind(History), updateNumber: History.updateNumber.bind(History),
        cleanRecord: History.cleanRecord,
      },
      posting: { read: Posting.read.bind(Posting), write: Posting.write.bind(Posting), clear: Posting.clear.bind(Posting), cleanRecord: Posting.cleanRecord },
    };

    patchHistory(History);
    patchPosting(Posting);

    if (historyLegacy.invalid) {
      await quarantineRaw(History.STORAGE_KEY, historyLegacy.invalid.raw, historyLegacy.invalid.reason);
      notify("Encontramos dados do Histórico que não puderam ser lidos. O conteúdo bruto foi preservado para recuperação e não será sobrescrito.", "warning");
    }
    if (postingLegacy.invalid) {
      await quarantineRaw(Posting.STORAGE_KEY, postingLegacy.invalid.raw, postingLegacy.invalid.reason);
      notify("Encontramos dados de Postagem SIGEM que não puderam ser lidos. O conteúdo bruto foi preservado para recuperação e não será sobrescrito.", "warning");
    }

    await openDatabase();
    state.history = await migrateCollection({ storeName: HISTORY_STORE, legacyRecords: state.history, cleaner: History.cleanRecord, metaKey: MIGRATION_HISTORY_KEY });
    state.postings = await migrateCollection({ storeName: POSTING_STORE, legacyRecords: state.postings, cleaner: Posting.cleanRecord, metaKey: MIGRATION_POSTING_KEY });
    state.migration.history = true;
    state.migration.postings = true;
    setLocalJson(MIGRATION_MARKER_KEY, { version: DB_VERSION, completedAt: new Date().toISOString(), history: checksumRecords(state.history), postings: checksumRecords(state.postings) });

    await replayWal();
    state.ready = true;
    state.writeBlocked = false;
    root.dispatchEvent?.(new CustomEvent("grcon:persistence-ready", { detail: status() }));
    root.dispatchEvent?.(new CustomEvent("grcon:history-updated", { detail: { durableHydration: true } }));
    root.dispatchEvent?.(new CustomEvent("grcon:sigem-updated", { detail: { durableHydration: true } }));
    return status();
  }

  function status() {
    return {
      dbName: DB_NAME,
      dbVersion: DB_VERSION,
      ready: state.ready,
      degraded: state.degraded,
      writeBlocked: state.writeBlocked,
      historyCount: state.history.length,
      postingCount: state.postings.length,
      migration: { ...state.migration },
      lastError: state.lastError,
      lastBackupAt: text(readLocalJson(LAST_BACKUP_KEY, {})?.at),
    };
  }

  async function health() {
    const base = status();
    if (!state.db && !state.ready) {
      try { await openDatabase(); } catch (error) { return { ...base, indexedDb: false, quarantineCount: 0, error: error.message }; }
    }
    let quarantineCount = 0;
    try { quarantineCount = (await getAll(QUARANTINE_STORE)).length; } catch (_) { /* noop */ }
    let estimate = null;
    try { estimate = await root.navigator?.storage?.estimate?.(); } catch (_) { /* noop */ }
    return {
      ...status(),
      indexedDb: true,
      quarantineCount,
      storageUsage: Number(estimate && estimate.usage) || 0,
      storageQuota: Number(estimate && estimate.quota) || 0,
    };
  }

  async function exportState() {
    await (state.initPromise || Promise.resolve());
    return { history: clone(state.history), postings: clone(state.postings), status: status() };
  }

  async function replaceHistory(records) {
    await (state.initPromise || Promise.resolve());
    const History = root.GrconHistory;
    const next = sortHistory((records || []).map(History.cleanRecord).filter((record) => record.egrdtNumber));
    await replaceStore(HISTORY_STORE, next);
    state.history = next;
    root.dispatchEvent?.(new CustomEvent("grcon:history-updated", { detail: { restored: true } }));
    return clone(next);
  }

  async function replacePostings(records) {
    await (state.initPromise || Promise.resolve());
    const Posting = root.GrconSigemPosting;
    const next = sortPostings((records || []).map(Posting.cleanRecord).filter((record) => record.egrdtNumber));
    await replaceStore(POSTING_STORE, next);
    state.postings = next;
    root.dispatchEvent?.(new CustomEvent("grcon:sigem-updated", { detail: { restored: true } }));
    return clone(next);
  }

  async function listQuarantine() {
    await (state.initPromise || Promise.resolve());
    return (await getAll(QUARANTINE_STORE)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async function setLastBackup(at) {
    const value = { at: text(at) || new Date().toISOString() };
    setLocalJson(LAST_BACKUP_KEY, value);
    try { await setMeta("lastBackup", value); } catch (_) { /* metadado auxiliar */ }
    return value;
  }

  function install() {
    if (state.installed) return state.initPromise;
    state.installed = true;
    const gate = createLoadingSurface();
    state.initPromise = initialize().then((result) => {
      finishLoadingSurface(gate, null);
      return result;
    }).catch((error) => {
      state.degraded = true;
      state.writeBlocked = true;
      state.lastError = error && error.message || "Falha ao preparar o armazenamento local.";
      finishLoadingSurface(gate, error);
      return status();
    });
    return state.initPromise;
  }

  function autoInstall() {
    if (!root.document) return;
    const run = () => install();
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", run, { once: true });
    else run();
  }

  autoInstall();

  return Object.freeze({
    DB_NAME, DB_VERSION, HISTORY_STORE, POSTING_STORE, META_STORE, QUARANTINE_STORE,
    WAL_KEY, MIGRATION_MARKER_KEY, LAST_BACKUP_KEY,
    mergeById, checksumRecords, safeParsePayload,
    install, status, health, exportState, replaceHistory, replacePostings, listQuarantine, quarantineRaw, setLastBackup,
  });
});
