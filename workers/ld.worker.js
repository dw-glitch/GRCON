// GRCON Worker ld — módulos externos, sem cópias embutidas
self.GRCON_ASSET_BASE = "../";
importScripts("../grcon_utils.js", "../grcon_contracts.js", "../xlsx.full.min.js", "../core.js");

const CACHE_DB = "grcon-performance-cache-v3";
const CACHE_STORE = "ld-indexes";
const CACHE_SCHEMA = "5.25.1";
const memoryCache = new Map();
function openDb() {
  return new Promise((resolve, reject) => {
    if (!self.indexedDB) return resolve(null);
    const request = indexedDB.open(CACHE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB indisponível"));
  });
}
async function cacheGet(key) {
  if (memoryCache.has(key)) return { ...memoryCache.get(key), cacheLayer: "memory" };
  try {
    const db = await openDb(); if (!db) return null;
    const found = await new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, "readonly");
      const request = tx.objectStore(CACHE_STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    if (found) memoryCache.set(key, found);
    return found ? { ...found, cacheLayer: "indexeddb" } : null;
  } catch (_) { return null; }
}
async function cachePut(value) {
  memoryCache.set(value.key, value);
  try {
    const db = await openDb(); if (!db) return false;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, "readwrite");
      tx.objectStore(CACHE_STORE).put(value);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
    return true;
  } catch (_) { return false; }
}
async function cacheClear() {
  memoryCache.clear();
  try {
    const db = await openDb(); if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, "readwrite"); tx.objectStore(CACHE_STORE).clear();
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  } catch (_) {}
}
function memoryMb() { return self.performance && performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null; }
self.onmessage = async (event) => {
  const { taskId, action, payload = {} } = event.data || {};
  const started = performance.now();
  try {
    if (action === "lookup") {
      const found = await cacheGet(payload.key);
      const valid = found && found.schema === CACHE_SCHEMA && found.value;
      self.postMessage({ taskId, type: "done", result: valid ? { ...found.value, cacheHit: true, cacheLayer: found.cacheLayer || "indexeddb" } : { cacheHit: false }, metrics: { stage: "ld-cache", durationMs: performance.now()-started, memoryMb: memoryMb() } });
      return;
    }
    if (action === "clear-cache") {
      await cacheClear(); self.postMessage({ taskId, type: "done", result: { cleared: true }, metrics: { stage: "ld-cache-clear", durationMs: performance.now()-started } }); return;
    }
    if (action !== "parse") throw new Error("Ação desconhecida no Worker da LD.");
    self.postMessage({ taskId, type: "progress", progress: 0.08, message: "Lendo estrutura da LD" });
    const workbook = XLSX.read(payload.buffer, { type: "array", cellDates: true, cellStyles: false });
    self.postMessage({ taskId, type: "progress", progress: 0.48, message: "Interpretando abas controladas" });
    const parsed = self.TriagemCore.parseWorkbook(workbook, payload.name, payload.lastModified, payload.profile || null);
    self.postMessage({ taskId, type: "progress", progress: 0.78, message: "Criando índices documentais" });
    const index = self.TriagemCore.buildIndex(parsed.records, parsed.history);
    const value = { parsed, index, cacheHit: false };
    await cachePut({ key: payload.key, schema: CACHE_SCHEMA, storedAt: Date.now(), value });
    self.postMessage({ taskId, type: "done", result: value, metrics: { stage: "ld-parse-index", durationMs: performance.now()-started, records: parsed.records.length, history: parsed.history.length, memoryMb: memoryMb() } });
  } catch (error) {
    self.postMessage({ taskId, type: "error", error: String(error && error.message || error), stack: String(error && error.stack || "") });
  }
};
