(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconProjectWiseStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  const DB_NAME = "grcon.projectwise.v1";
  const DB_VERSION = 1;
  const STORE = "snapshots";
  const CURRENT = "current";

  function clone(value) {
    if (value == null) return value;
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch (_) { /* fallback */ }
    }
    return JSON.parse(JSON.stringify(value));
  }
  function open() {
    if (!root.indexedDB) return Promise.reject(new Error("IndexedDB indisponível."));
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Falha ao abrir o banco local do ProjectWise."));
    });
  }
  function done(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("Falha na persistência ProjectWise."));
      tx.onabort = () => reject(tx.error || new Error("Persistência ProjectWise interrompida."));
    });
  }
  async function saveCurrent(payload) {
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id: CURRENT, savedAt: new Date().toISOString(), payload: clone(payload) });
    await done(tx);
    db.close();
    return true;
  }
  async function loadCurrent() {
    const db = await open();
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(CURRENT);
    const result = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error("Falha ao ler a última conciliação."));
    });
    await done(tx);
    db.close();
    return result ? clone(result) : null;
  }
  async function clearCurrent() {
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(CURRENT);
    await done(tx);
    db.close();
  }
  return Object.freeze({ saveCurrent, loadCurrent, clearCurrent });
});