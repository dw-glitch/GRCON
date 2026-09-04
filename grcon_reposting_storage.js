(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconRepostingStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const DB_NAME = "grcon.reposting.v1";
  const DB_VERSION = 1;
  const ROOTS = "roots";
  const FILES = "files";
  const BATCHES = "batches";
  const ZIP_SAFE_BYTES = 150 * 1024 * 1024;

  function text(value) { return String(value === null || value === undefined ? "" : value).trim(); }
  function slug(value) { return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "raiz"; }
  function clone(value) {
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch (_) { /* handle/file podem exigir IDB direto */ }
    }
    return JSON.parse(JSON.stringify(value));
  }
  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Falha no índice local de repostagem."));
    });
  }
  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Falha ao gravar o índice local de repostagem."));
      tx.onabort = () => reject(tx.error || new Error("A gravação do índice foi interrompida."));
    });
  }
  function openDb() {
    if (!root || typeof root.indexedDB === "undefined") return Promise.reject(new Error("IndexedDB indisponível para o índice de arquivos."));
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(ROOTS)) {
          const roots = db.createObjectStore(ROOTS, { keyPath: "id" });
          roots.createIndex("byLabel", "label", { unique: false });
        }
        if (!db.objectStoreNames.contains(FILES)) {
          const files = db.createObjectStore(FILES, { keyPath: "id" });
          files.createIndex("byRoot", "rootId", { unique: false });
          files.createIndex("byRootGeneration", ["rootId", "generation"], { unique: false });
          files.createIndex("byName", "normalizedName", { unique: false });
        }
        if (!db.objectStoreNames.contains(BATCHES)) {
          const batches = db.createObjectStore(BATCHES, { keyPath: "id" });
          batches.createIndex("byCreatedAt", "createdAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Não foi possível abrir o índice local de repostagem."));
    });
  }
  function supportsDirectoryPicker() {
    return Boolean(root && root.isSecureContext && typeof root.showDirectoryPicker === "function");
  }
  function compatibility() {
    return {
      secureContext: Boolean(root && root.isSecureContext),
      directoryPicker: supportsDirectoryPicker(),
      directoryInput: Boolean(root && root.document && "webkitdirectory" in root.document.createElement("input")),
      persistentHandles: typeof root.indexedDB !== "undefined",
    };
  }
  async function listRoots() {
    const db = await openDb();
    try {
      const tx = db.transaction(ROOTS, "readonly");
      const done = transactionDone(tx);
      const roots = await requestResult(tx.objectStore(ROOTS).getAll());
      await done;
      return (roots || []).sort((a, b) => String(a.label).localeCompare(String(b.label), "pt-BR"));
    } finally { db.close(); }
  }
  async function getRoot(id) {
    const db = await openDb();
    try {
      const tx = db.transaction(ROOTS, "readonly");
      const done = transactionDone(tx);
      const value = await requestResult(tx.objectStore(ROOTS).get(text(id)));
      await done;
      return value || null;
    } finally { db.close(); }
  }
  async function putRoot(rootRecord) {
    const db = await openDb();
    try {
      const tx = db.transaction(ROOTS, "readwrite");
      const done = transactionDone(tx);
      tx.objectStore(ROOTS).put(rootRecord);
      await done;
      return rootRecord;
    } finally { db.close(); }
  }
  async function addRoot(label, handle, options) {
    if (!handle || handle.kind !== "directory") throw new Error("Selecione uma pasta válida para a raiz de arquivos.");
    const now = new Date().toISOString();
    const id = text(options && options.id) || `root-${slug(label || handle.name)}-${Date.now().toString(36)}`;
    return putRoot({ id, label: text(label) || text(handle.name) || "Arquivos", area: text(options && options.area), handle, createdAt: now, updatedAt: now, lastIndexedAt: "", currentGeneration: "", indexedFiles: 0 });
  }
  async function chooseRoot(label, options) {
    if (!supportsDirectoryPicker()) throw new Error("A busca automática em pastas requer um navegador Chromium compatível em HTTPS.");
    const handle = await root.showDirectoryPicker({ id: text(options && options.pickerId) || "grcon-repost-source", mode: "read" });
    return addRoot(label || handle.name, handle, options);
  }
  async function permissionState(rootRecord, mode) {
    const handle = rootRecord && rootRecord.handle;
    if (!handle) return "denied";
    if (typeof handle.queryPermission !== "function") return "granted";
    try { return await handle.queryPermission({ mode: mode || "read" }); } catch (_) { return "prompt"; }
  }
  async function requestPermission(rootRecord, mode) {
    const handle = rootRecord && rootRecord.handle;
    if (!handle) return "denied";
    const current = await permissionState(rootRecord, mode);
    if (current === "granted") return current;
    if (typeof handle.requestPermission !== "function") return current;
    return handle.requestPermission({ mode: mode || "read" });
  }
  async function removeRoot(id) {
    const rootId = text(id);
    const db = await openDb();
    try {
      const tx = db.transaction([ROOTS, FILES], "readwrite");
      const done = transactionDone(tx);
      tx.objectStore(ROOTS).delete(rootId);
      const index = tx.objectStore(FILES).index("byRoot");
      const request = index.openCursor(IDBKeyRange.only(rootId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      await done;
      return true;
    } finally { db.close(); }
  }
  function normalizedFileName(name) { return text(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[–—]/g, "-").toUpperCase().replace(/\s+/g, " ").trim(); }
  function extensionOf(name) { const match = text(name).match(/\.([A-Z0-9]{1,10})$/i); return match ? match[1].toLowerCase() : ""; }
  function abortError() { const error = new Error("Indexação cancelada. O índice anterior foi preservado."); error.name = "AbortError"; return error; }
  function yieldFrame() { return new Promise((resolve) => root.setTimeout(resolve, 0)); }

  async function putFileBatch(entries) {
    if (!entries.length) return;
    const db = await openDb();
    try {
      const tx = db.transaction(FILES, "readwrite");
      const done = transactionDone(tx);
      const store = tx.objectStore(FILES);
      entries.forEach((entry) => store.put(entry));
      await done;
    } finally { db.close(); }
  }
  async function deleteGeneration(rootId, generation) {
    if (!generation) return;
    const db = await openDb();
    try {
      const tx = db.transaction(FILES, "readwrite");
      const done = transactionDone(tx);
      const index = tx.objectStore(FILES).index("byRootGeneration");
      const request = index.openCursor(IDBKeyRange.only([rootId, generation]));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      await done;
    } finally { db.close(); }
  }

  async function indexRoot(rootId, options) {
    const settings = options || {};
    const rootRecord = await getRoot(rootId);
    if (!rootRecord) throw new Error("Raiz de arquivos não localizada.");
    const permission = await permissionState(rootRecord, "read");
    if (permission !== "granted") {
      const error = new Error("A pasta precisa ser autorizada novamente antes da indexação.");
      error.code = "PERMISSION_REQUIRED";
      throw error;
    }
    const generation = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let count = 0;
    let batch = [];
    const indexedAt = new Date().toISOString();
    const signal = settings.signal;
    const walk = async (directory, pathParts) => {
      for await (const entry of directory.values()) {
        if (signal && signal.aborted) throw abortError();
        if (entry.kind === "directory") {
          await walk(entry, [...pathParts, entry.name]);
          continue;
        }
        if (entry.kind !== "file") continue;
        let file;
        try { file = await entry.getFile(); } catch (_) { continue; }
        const relativePath = [...pathParts, entry.name].join("/");
        batch.push({
          id: `${rootRecord.id}|${generation}|${relativePath}`,
          rootId: rootRecord.id,
          rootLabel: rootRecord.label,
          generation,
          name: entry.name,
          normalizedName: normalizedFileName(entry.name),
          relativePath,
          extension: extensionOf(entry.name),
          size: Number(file.size) || 0,
          lastModified: Number(file.lastModified) || 0,
          indexedAt,
        });
        count += 1;
        if (batch.length >= 250) {
          const flushing = batch;
          batch = [];
          await putFileBatch(flushing);
          if (typeof settings.onProgress === "function") settings.onProgress({ count, rootId: rootRecord.id, label: rootRecord.label });
          await yieldFrame();
        }
      }
    };
    try {
      await walk(rootRecord.handle, []);
      if (batch.length) await putFileBatch(batch);
      if (signal && signal.aborted) throw abortError();
      const previousGeneration = rootRecord.currentGeneration;
      const updated = { ...rootRecord, currentGeneration: generation, lastIndexedAt: indexedAt, indexedFiles: count, updatedAt: indexedAt };
      await putRoot(updated);
      if (previousGeneration && previousGeneration !== generation) await deleteGeneration(rootRecord.id, previousGeneration);
      if (typeof settings.onProgress === "function") settings.onProgress({ count, rootId: rootRecord.id, label: rootRecord.label, done: true });
      return updated;
    } catch (error) {
      await deleteGeneration(rootRecord.id, generation).catch(() => null);
      throw error;
    }
  }

  async function activeEntries(rootIds) {
    const roots = await listRoots();
    const allowed = new Set((rootIds || []).map(text).filter(Boolean));
    const activeRoots = roots.filter((record) => !allowed.size || allowed.has(record.id)).filter((record) => record.currentGeneration);
    if (!activeRoots.length) return [];
    const db = await openDb();
    try {
      const tx = db.transaction(FILES, "readonly");
      const done = transactionDone(tx);
      const store = tx.objectStore(FILES);
      const output = [];
      for (const rootRecord of activeRoots) {
        const values = await requestResult(store.index("byRootGeneration").getAll(IDBKeyRange.only([rootRecord.id, rootRecord.currentGeneration])));
        output.push(...(values || []));
      }
      await done;
      return output;
    } finally { db.close(); }
  }

  function isSessionEntry(entry) {
    return text(entry && entry.generation) === "session" || /^snapshot-/.test(text(entry && entry.rootId));
  }
  async function resolveEntry(indexEntry, options) {
    const entry = indexEntry || {};
    if (entry.__fileRef) return entry.__fileRef;
    // A pasta desta sessão não tem raiz autorizada nem índice persistente. Sem
    // a referência física o erro correto é pedir a pasta de novo, e não afirmar
    // que uma autorização deixou de valer.
    if (isSessionEntry(entry)) {
      const error = new Error(`A pasta selecionada apenas para esta sessão não está mais acessível${text(entry.name) ? ` para “${text(entry.name)}”` : ""}. Selecione a pasta novamente (ou autorize um local fixo) antes de preparar o lote.`);
      error.code = "SESSION_ENTRY_LOST";
      throw error;
    }
    const rootRecord = await getRoot(entry.rootId);
    if (!rootRecord || !rootRecord.handle) {
      const error = new Error("A raiz autorizada não está mais disponível."); error.code = "PERMISSION_REQUIRED"; throw error;
    }
    let permission = await permissionState(rootRecord, "read");
    if (permission !== "granted" && options && options.requestPermission) permission = await requestPermission(rootRecord, "read");
    if (permission !== "granted") { const error = new Error("A pasta precisa de autorização para acessar o arquivo."); error.code = "PERMISSION_REQUIRED"; throw error; }
    const parts = text(entry.relativePath).split("/").filter(Boolean);
    if (!parts.length) throw new Error("Caminho relativo inválido no índice.");
    let directory = rootRecord.handle;
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create: false });
    const handle = await directory.getFileHandle(parts[parts.length - 1], { create: false });
    const file = await handle.getFile();
    return file;
  }

  function snapshotEntries(files, label) {
    const rootId = `snapshot-${Date.now().toString(36)}`;
    return Array.from(files || []).map((file, index) => ({
      id: `${rootId}|${index}|${text(file.webkitRelativePath || file.name)}`,
      rootId,
      rootLabel: text(label) || "Pasta selecionada nesta sessão",
      generation: "session",
      name: text(file.name),
      normalizedName: normalizedFileName(file.name),
      relativePath: text(file.webkitRelativePath || file.name),
      extension: extensionOf(file.name),
      size: Number(file.size) || 0,
      lastModified: Number(file.lastModified) || 0,
      indexedAt: new Date().toISOString(),
      __fileRef: file,
    }));
  }

  async function uniqueFileHandle(directory, fileName) {
    const name = text(fileName) || "arquivo";
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const candidate = attempt ? `${stem} (${attempt})${ext}` : name;
      try {
        await directory.getFileHandle(candidate, { create: false });
      } catch (error) {
        if (error && error.name === "NotFoundError") return directory.getFileHandle(candidate, { create: true });
        throw error;
      }
    }
    throw new Error(`Não foi possível criar um nome livre para ${name}.`);
  }
  async function ensureSubdir(rootDir, name) {
    if (!name) return rootDir;
    return rootDir.getDirectoryHandle(text(name).replace(/[<>:"/\\|?*]/g, "_").trim() || "eGRDT", { create: true });
  }
  async function copyEntries(entries, options) {
    if (!supportsDirectoryPicker()) throw new Error("A cópia direta para pasta requer File System Access API em navegador Chromium compatível.");
    const settings = options || {};
    const destination = settings.destination || await root.showDirectoryPicker({ id: "grcon-repost-destination", mode: "readwrite" });
    let permission = typeof destination.queryPermission === "function" ? await destination.queryPermission({ mode: "readwrite" }) : "granted";
    if (permission !== "granted" && typeof destination.requestPermission === "function") permission = await destination.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("Permissão de escrita não concedida para a pasta de destino.");
    let copied = 0;
    const used = new Set();
    for (const item of entries || []) {
      if (settings.signal && settings.signal.aborted) throw abortError();
      // Ao duplicar por eGRDT, a repetição a evitar é o mesmo arquivo na mesma
      // pasta de destino — não o mesmo arquivo em pastas de eGRDTs diferentes.
      const signature = `${settings.duplicateAcrossEgrdts ? text(item.egrdtNumber) : ""}|${item.entry.rootId}|${item.entry.relativePath}`;
      if (used.has(signature)) continue;
      used.add(signature);
      const file = await resolveEntry(item.entry, { requestPermission: false });
      const targetDir = settings.organizeByEgrdt ? await ensureSubdir(destination, item.egrdtNumber) : destination;
      const targetHandle = await uniqueFileHandle(targetDir, file.name);
      const writable = await targetHandle.createWritable();
      try { await writable.write(file); await writable.close(); }
      catch (error) { try { await writable.abort(); } catch (_) { /* noop */ } throw error; }
      copied += 1;
      if (typeof settings.onProgress === "function") settings.onProgress({ copied, total: (entries || []).length, file: file.name });
    }
    return { copied, destination };
  }

  function totalSize(entries) { return (entries || []).reduce((sum, item) => sum + Number(item && item.entry && item.entry.size || item && item.size || 0), 0); }
  function zipSafe(entries) { return totalSize(entries) <= ZIP_SAFE_BYTES; }

  async function saveBatch(batch) {
    const record = { ...(batch || {}), id: text(batch && batch.id) || `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: text(batch && batch.createdAt) || new Date().toISOString(), updatedAt: new Date().toISOString() };
    const db = await openDb();
    try {
      const tx = db.transaction(BATCHES, "readwrite");
      const done = transactionDone(tx);
      tx.objectStore(BATCHES).put(clone(record));
      await done;
      return record;
    } finally { db.close(); }
  }

  return Object.freeze({ DB_NAME, DB_VERSION, ROOTS, FILES, BATCHES, ZIP_SAFE_BYTES, compatibility, supportsDirectoryPicker, isSessionEntry, listRoots, getRoot, addRoot, chooseRoot, permissionState, requestPermission, removeRoot, indexRoot, activeEntries, resolveEntry, snapshotEntries, copyEntries, totalSize, zipSafe, saveBatch });
});
