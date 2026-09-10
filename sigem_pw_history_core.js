(function (root, factory) {
  const safeRequire = (path) => {
    if (typeof require !== "function") return null;
    try { return require(path); } catch (_) { return null; }
  };
  const api = factory(
    root.GrconSigemPwDashboard || safeRequire("./sigem_pw_dashboard_core.js"),
    root.GrconSigemPwRevision || safeRequire("./sigem_pw_revision_core.js")
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconSigemPwHistory = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Dashboard, Revision) {
  "use strict";

  const DB_NAME = "grcon-sigem-pw-history";
  const DB_VERSION = 1;
  const CALCULATION_VERSION = "sigem-pw-history-1";
  const STORES = Object.freeze({
    sourceSnapshots: "sourceSnapshots",
    comparisonSnapshots: "comparisonSnapshots",
    snapshotDocuments: "snapshotDocuments",
    meta: "meta",
  });
  const SYSTEMS = Object.freeze({ SIGEM: "sigem", PW: "pw" });
  const CLASSES = Object.freeze(["ET", "N-1710", "CV"]);
  const PENDING_STATES = new Set(["post-pw", "post-sigem", "awaiting-emission", "review"]);

  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
  function norm(value) { return Dashboard && Dashboard.norm ? Dashboard.norm(value) : text(value).toUpperCase(); }
  function nowIso() { return new Date().toISOString(); }
  function revisionOf(record) { return Revision && Revision.revisionValue ? Revision.revisionValue(record) : text(record && (record.revision || record.revisionComplete)); }
  function currentStatus(document, system) { return system === SYSTEMS.PW ? text(document && document.current && document.current.state) : text(document && document.current && document.current.status); }
  function isComparable(document) {
    if (!document || !CLASSES.includes(text(document.documentClass))) return false;
    if (Revision && typeof Revision.comparableDocument === "function") return Revision.comparableDocument(document);
    return true;
  }
  function distribution(items, selector) {
    const counts = new Map();
    for (const item of items || []) {
      const label = text(selector(item)) || "Sem informação";
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
  }
  function classCounts(documents, emittedOnly) {
    const counts = Object.fromEntries(CLASSES.map((name) => [name, 0]));
    for (const document of documents || []) {
      if (!CLASSES.includes(document.documentClass)) continue;
      if (emittedOnly && !document.emitted) continue;
      counts[document.documentClass] += 1;
    }
    return counts;
  }

  // Fingerprint sem nome de arquivo: a mesma base com nome diferente não infla o histórico,
  // enquanto conteúdo relevante diferente produz outro identificador.
  function hash32(source, seed) {
    let hash = (seed >>> 0) || 2166136261;
    const value = String(source || "");
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
  }
  function contentFingerprint(system, records) {
    const tuples = (records || []).map((record) => {
      const key = text(record.documentKey) || text(Dashboard && Dashboard.documentIdentity ? Dashboard.documentIdentity(record.document).key : record.document);
      if (system === SYSTEMS.PW) {
        return [key, revisionOf(record), text(record.state), text(record.lastEmission), text(record.discipline), text(record.documentType)].map(norm).join("|");
      }
      return [key, revisionOf(record), text(record.status), text(record.documentType), text(record.discipline)].map(norm).join("|");
    }).sort();
    let first = hash32(`${system}|${tuples.length}`, 2166136261);
    let second = hash32(`${tuples.length}|${system}`, 2246822519);
    for (const tuple of tuples) {
      first = hash32(tuple, first);
      second = hash32(tuple.split("").reverse().join(""), second);
    }
    return `${system}-${tuples.length.toString(36)}-${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
  }

  function minimalDocuments(system, model) {
    const source = system === SYSTEMS.PW ? model && model.pwAll : model && model.sigemAll;
    if (!(source instanceof Map)) return [];
    const output = [];
    source.forEach((document, key) => {
      if (!isComparable(document)) return;
      const current = document.current || {};
      output.push({
        key,
        document: text(document.document),
        documentClass: text(document.documentClass),
        revision: revisionOf(current),
        status: currentStatus(document, system),
        emitted: system === SYSTEMS.PW ? Boolean(document.emitted) : null,
      });
    });
    return output.sort((a, b) => a.key.localeCompare(b.key));
  }

  function sourceMetrics(system, base, model, docs) {
    const sourceAll = system === SYSTEMS.PW ? model.pwAll : model.sigemAll;
    const normalized = system === SYSTEMS.PW ? model.normalizedPw : model.normalizedSigem;
    const comparable = docs || minimalDocuments(system, model);
    const allDocuments = sourceAll instanceof Map ? [...sourceAll.values()] : [];
    const emitted = system === SYSTEMS.PW ? comparable.filter((document) => document.emitted) : [];
    const meta = base && base.meta || {};
    return {
      rawRecords: Number(meta.sourceRowCount || meta.recordCount || (normalized && normalized.length) || 0),
      validRecords: Number(meta.recordCount || (normalized && normalized.length) || 0),
      comparableDocuments: comparable.length,
      allRecognizedDocuments: allDocuments.length,
      outsideScope: Math.max(0, allDocuments.length - comparable.length) + Number(meta.invalidCount || 0),
      unclassified: allDocuments.filter((document) => !CLASSES.includes(text(document.documentClass))).length,
      classes: classCounts(comparable, false),
      emittedDocuments: system === SYSTEMS.PW ? emitted.length : null,
      emittedByClass: system === SYSTEMS.PW ? classCounts(comparable, true) : null,
      notEmittedDocuments: system === SYSTEMS.PW ? comparable.length - emitted.length : null,
      statusDistribution: distribution(comparable, (document) => document.status),
      invalidCount: Number(meta.invalidCount || 0),
      duplicateRevisionCount: Number(meta.duplicateRevisionCount || 0),
      unknownEmissionCount: Number(meta.unknownEmissionCount || 0),
    };
  }

  function buildSourceSnapshot(system, base, model, options) {
    if (![SYSTEMS.SIGEM, SYSTEMS.PW].includes(system)) throw new Error("Sistema de snapshot inválido.");
    if (!base || !base.meta || !Array.isArray(base.records)) throw new Error(`Base ${system.toUpperCase()} inválida para snapshot.`);
    const docs = minimalDocuments(system, model);
    const fingerprint = contentFingerprint(system, base.records);
    const importedAt = text(base.meta.importedAt) || nowIso();
    const snapshot = {
      id: `${system}:${fingerprint}`,
      kind: "source",
      system,
      fingerprint,
      importedAt,
      recordedAt: text(options && options.recordedAt) || nowIso(),
      fileName: text(base.meta.fileName),
      fileSize: Number(base.meta.fileSize || 0),
      lastModified: Number(base.meta.lastModified || 0),
      calculationVersion: CALCULATION_VERSION,
      sourceVersion: Number(base.meta.version || 0),
      metrics: sourceMetrics(system, base, model, docs),
      delta: null,
    };
    return { snapshot, documents: docs };
  }

  function mapByKey(documents) { return new Map((documents || []).map((document) => [document.key, document])); }
  function compareSourceDocuments(previousDocuments, currentDocuments) {
    const previous = mapByKey(previousDocuments), current = mapByKey(currentDocuments);
    const entered = [], exited = [], changedRevision = [], changedStatus = [];
    current.forEach((document, key) => {
      const before = previous.get(key);
      if (!before) { entered.push(key); return; }
      if (norm(before.revision) !== norm(document.revision)) changedRevision.push(key);
      if (norm(before.status) !== norm(document.status) || Boolean(before.emitted) !== Boolean(document.emitted)) changedStatus.push(key);
    });
    previous.forEach((document, key) => { if (!current.has(key)) exited.push(key); });
    return {
      entered: entered.length,
      exited: exited.length,
      remained: current.size - entered.length,
      changedRevision: changedRevision.length,
      changedStatus: changedStatus.length,
      keys: { entered, exited, changedRevision, changedStatus },
    };
  }

  function relationSets(model) {
    const sigem = new Set(), pw = new Set(), emitted = new Set();
    if (model && model.sigemAll instanceof Map) model.sigemAll.forEach((document, key) => { if (isComparable(document)) sigem.add(key); });
    if (model && model.pwAll instanceof Map) model.pwAll.forEach((document, key) => { if (isComparable(document)) { pw.add(key); if (document.emitted) emitted.add(key); } });
    const both = new Set(), sigemOnly = new Set(), pwOnly = new Set();
    sigem.forEach((key) => { if (pw.has(key)) both.add(key); else sigemOnly.add(key); });
    pw.forEach((key) => { if (!sigem.has(key)) pwOnly.add(key); });
    return { sigem, pw, emitted, both, sigemOnly, pwOnly };
  }
  function revisionState(row) {
    if (!row) return "review";
    const s = Revision && Revision.SITUATIONS || {};
    if (row.situation === s.UPDATED) return "aligned";
    if (row.situation === s.AWAITING_EMISSION) return "awaiting-emission";
    if (row.situation === s.PREVIOUS || row.situation === s.NOT_FOUND) return "post-pw";
    if (row.situation === s.PW_AHEAD) return "post-sigem";
    return "review";
  }
  function comparisonDocuments(model, revisionAnalysis) {
    const output = new Map();
    const rows = revisionAnalysis && Array.isArray(revisionAnalysis.rows) ? revisionAnalysis.rows : [];
    for (const row of rows) {
      output.set(row.key, {
        key: row.key,
        document: text(row.document),
        documentClass: text(row.documentClass),
        state: revisionState(row),
        situation: text(row.situation),
        sigemRevision: text(row.sigemRevision),
        pwRevision: text(row.pwRevision),
        pwEmittedRevision: text(row.lastEmittedPwRevision),
        reason: text(row.reason),
      });
    }
    const sets = relationSets(model);
    sets.pwOnly.forEach((key) => {
      const document = model.pwAll.get(key);
      const current = document && document.current || {};
      output.set(key, {
        key,
        document: text(document && document.document),
        documentClass: text(document && document.documentClass),
        state: "post-sigem",
        situation: "pw-exclusive",
        sigemRevision: "",
        pwRevision: revisionOf(current),
        pwEmittedRevision: document && document.emitted ? revisionOf(current) : "",
        reason: "Documento comparável localizado no ProjectWise sem correspondência válida na última base SIGEM.",
      });
    });
    return [...output.values()].sort((a, b) => a.key.localeCompare(b.key));
  }
  function countStates(documents) {
    const counts = { aligned: 0, postPw: 0, postSigem: 0, awaitingEmission: 0, review: 0 };
    for (const document of documents || []) {
      if (document.state === "aligned") counts.aligned += 1;
      else if (document.state === "post-pw") counts.postPw += 1;
      else if (document.state === "post-sigem") counts.postSigem += 1;
      else if (document.state === "awaiting-emission") counts.awaitingEmission += 1;
      else counts.review += 1;
    }
    return counts;
  }
  function classComparisonMetrics(model, revisionAnalysis, comparisonDocs) {
    const sets = relationSets(model);
    const revisionRows = revisionAnalysis && Array.isArray(revisionAnalysis.rows) ? revisionAnalysis.rows : [];
    return CLASSES.map((documentClass) => {
      const sigem = new Set([...sets.sigem].filter((key) => model.sigemAll.get(key)?.documentClass === documentClass));
      const pw = new Set([...sets.pw].filter((key) => model.pwAll.get(key)?.documentClass === documentClass));
      const emitted = new Set([...sets.emitted].filter((key) => model.pwAll.get(key)?.documentClass === documentClass));
      const rows = revisionRows.filter((row) => row.documentClass === documentClass);
      const docs = comparisonDocs.filter((row) => row.documentClass === documentClass);
      const states = countStates(docs);
      let matched = 0, sigemOnly = 0, pwOnly = 0;
      sigem.forEach((key) => { if (pw.has(key)) matched += 1; else sigemOnly += 1; });
      pw.forEach((key) => { if (!sigem.has(key)) pwOnly += 1; });
      const rc = { updated: 0, previous: 0, notFound: 0, awaitingEmission: 0, pwAhead: 0, review: 0 };
      for (const row of rows) {
        const s = Revision && Revision.SITUATIONS || {};
        if (row.situation === s.UPDATED) rc.updated += 1;
        else if (row.situation === s.PREVIOUS) rc.previous += 1;
        else if (row.situation === s.NOT_FOUND) rc.notFound += 1;
        else if (row.situation === s.AWAITING_EMISSION) rc.awaitingEmission += 1;
        else if (row.situation === s.PW_AHEAD) rc.pwAhead += 1;
        else rc.review += 1;
      }
      return {
        documentClass,
        sigem: sigem.size,
        pwRegistered: pw.size,
        pwEmitted: emitted.size,
        matched,
        sigemOnly,
        pwOnly,
        aligned: states.aligned,
        postPw: states.postPw,
        postSigem: states.postSigem,
        awaitingEmission: states.awaitingEmission,
        pwPrevious: rc.previous,
        notFoundPw: rc.notFound,
        correctRegisteredNotEmitted: rc.awaitingEmission,
        coverage: sigem.size ? matched / sigem.size : null,
        emissionRate: pw.size ? emitted.size / pw.size : null,
      };
    });
  }

  function buildComparisonSnapshot(sigemSnapshot, pwSnapshot, model, revisionAnalysis, options) {
    if (!sigemSnapshot || !pwSnapshot) throw new Error("As duas bases são necessárias para registrar um comparativo.");
    const sets = relationSets(model);
    const docs = comparisonDocuments(model, revisionAnalysis);
    const states = countStates(docs);
    const counts = revisionAnalysis && revisionAnalysis.counts || {};
    const snapshot = {
      id: `comparison:${sigemSnapshot.fingerprint}:${pwSnapshot.fingerprint}`,
      kind: "comparison",
      importedAt: text(options && options.recordedAt) || nowIso(),
      recordedAt: text(options && options.recordedAt) || nowIso(),
      calculationVersion: CALCULATION_VERSION,
      sigemSnapshotId: sigemSnapshot.id,
      pwSnapshotId: pwSnapshot.id,
      sigemFingerprint: sigemSnapshot.fingerprint,
      pwFingerprint: pwSnapshot.fingerprint,
      sigemFileName: sigemSnapshot.fileName,
      pwFileName: pwSnapshot.fileName,
      sigemImportedAt: sigemSnapshot.importedAt,
      pwImportedAt: pwSnapshot.importedAt,
      metrics: {
        sigem: sets.sigem.size,
        pwRegistered: sets.pw.size,
        pwEmitted: sets.emitted.size,
        matched: sets.both.size,
        exclusiveSigem: sets.sigemOnly.size,
        exclusivePw: sets.pwOnly.size,
        postPw: states.postPw,
        postSigem: states.postSigem,
        awaitingEmission: states.awaitingEmission,
        aligned: states.aligned,
        review: states.review,
        pwPrevious: Number(counts.previous || 0),
        notFoundPw: Number(counts.notFound || 0),
        correctRegisteredNotEmitted: Number(counts.awaitingEmission || 0),
        coverage: sets.sigem.size ? sets.both.size / sets.sigem.size : null,
        emissionRate: sets.pw.size ? sets.emitted.size / sets.pw.size : null,
        classes: classComparisonMetrics(model, revisionAnalysis, docs),
      },
      delta: null,
    };
    return { snapshot, documents: docs };
  }

  function compareComparisonDocuments(previousDocuments, currentDocuments) {
    const previous = mapByKey(previousDocuments), current = mapByKey(currentDocuments);
    const resolved = [], newPending = [], becameAligned = [], changedRevision = [], changedState = [];
    current.forEach((document, key) => {
      const before = previous.get(key);
      if (!before) {
        if (PENDING_STATES.has(document.state)) newPending.push(key);
        return;
      }
      if (PENDING_STATES.has(before.state) && document.state === "aligned") resolved.push(key);
      if (!PENDING_STATES.has(before.state) && PENDING_STATES.has(document.state)) newPending.push(key);
      if (before.state !== "aligned" && document.state === "aligned") becameAligned.push(key);
      if (norm(before.sigemRevision) !== norm(document.sigemRevision) || norm(before.pwRevision) !== norm(document.pwRevision)) changedRevision.push(key);
      if (before.state !== document.state) changedState.push(key);
    });
    return {
      resolved: resolved.length,
      newPending: newPending.length,
      becameAligned: becameAligned.length,
      changedRevision: changedRevision.length,
      changedState: changedState.length,
      keys: { resolved, newPending, becameAligned, changedRevision, changedState },
    };
  }

  function metricDelta(previous, current) {
    if (!previous || !current) return null;
    const fields = ["sigem", "pwRegistered", "pwEmitted", "matched", "exclusiveSigem", "exclusivePw", "postPw", "postSigem", "awaitingEmission", "aligned", "review"];
    const output = {};
    for (const field of fields) output[field] = Number(current[field] || 0) - Number(previous[field] || 0);
    if (Number.isFinite(current.coverage) && Number.isFinite(previous.coverage)) output.coverage = current.coverage - previous.coverage;
    if (Number.isFinite(current.emissionRate) && Number.isFinite(previous.emissionRate)) output.emissionRate = current.emissionRate - previous.emissionRate;
    return output;
  }

  function openDb() {
    if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB indisponível neste navegador."));
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORES.sourceSnapshots)) {
          const store = db.createObjectStore(STORES.sourceSnapshots, { keyPath: "id" });
          store.createIndex("system", "system", { unique: false });
          store.createIndex("systemFingerprint", ["system", "fingerprint"], { unique: true });
          store.createIndex("importedAt", "importedAt", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.comparisonSnapshots)) {
          const store = db.createObjectStore(STORES.comparisonSnapshots, { keyPath: "id" });
          store.createIndex("importedAt", "importedAt", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.snapshotDocuments)) {
          const store = db.createObjectStore(STORES.snapshotDocuments, { keyPath: ["snapshotId", "key"] });
          store.createIndex("snapshotId", "snapshotId", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Falha ao abrir o histórico SIGEM × PW."));
      request.onblocked = () => reject(new Error("A atualização do histórico local foi bloqueada por outra aba. Feche abas antigas do GRCON e tente novamente."));
    });
  }

  async function withDb(callback) {
    const db = await openDb();
    try { return await callback(db); } finally { db.close(); }
  }
  function requestValue(request) { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error("Falha em operação IndexedDB.")); }); }
  async function getSnapshot(storeName, id) { return withDb(async (db) => requestValue(db.transaction(storeName, "readonly").objectStore(storeName).get(id))); }
  async function listSnapshots(storeName) {
    return withDb(async (db) => {
      const values = await requestValue(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
      return (values || []).sort((a, b) => Date.parse(a.importedAt || a.recordedAt || 0) - Date.parse(b.importedAt || b.recordedAt || 0));
    });
  }
  async function listSourceSnapshots(system) { return (await listSnapshots(STORES.sourceSnapshots)).filter((snapshot) => snapshot.system === system); }
  async function listComparisonSnapshots() { return listSnapshots(STORES.comparisonSnapshots); }
  async function loadSnapshotDocuments(snapshotId) {
    return withDb(async (db) => {
      const store = db.transaction(STORES.snapshotDocuments, "readonly").objectStore(STORES.snapshotDocuments);
      const index = store.index("snapshotId");
      const range = typeof IDBKeyRange !== "undefined" ? IDBKeyRange.only(snapshotId) : snapshotId;
      const values = await requestValue(index.getAll(range));
      return (values || []).map((record) => record.value);
    });
  }
  async function insertSnapshot(storeName, snapshot, documents) {
    const existing = await getSnapshot(storeName, snapshot.id);
    if (existing) return { created: false, snapshot: existing, duplicate: true };
    return withDb((db) => new Promise((resolve, reject) => {
      const tx = db.transaction([storeName, STORES.snapshotDocuments], "readwrite");
      tx.objectStore(storeName).add(snapshot);
      const docs = tx.objectStore(STORES.snapshotDocuments);
      for (const document of documents || []) docs.put({ snapshotId: snapshot.id, key: document.key, value: document });
      tx.oncomplete = () => resolve({ created: true, snapshot, duplicate: false });
      tx.onerror = () => reject(tx.error || new Error("Falha ao registrar snapshot."));
      tx.onabort = () => reject(tx.error || new Error("Registro do snapshot foi cancelado."));
    }));
  }
  async function deleteSnapshot(storeName, snapshotId) {
    return withDb((db) => new Promise((resolve, reject) => {
      const tx = db.transaction([storeName, STORES.snapshotDocuments], "readwrite");
      tx.objectStore(storeName).delete(snapshotId);
      const docStore = tx.objectStore(STORES.snapshotDocuments);
      const index = docStore.index("snapshotId");
      const range = typeof IDBKeyRange !== "undefined" ? IDBKeyRange.only(snapshotId) : snapshotId;
      const cursor = index.openCursor(range);
      cursor.onsuccess = () => { const value = cursor.result; if (!value) return; value.delete(); value.continue(); };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("Falha ao excluir snapshot."));
    }));
  }
  async function clearHistory() {
    return withDb((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(Object.values(STORES), "readwrite");
      Object.values(STORES).forEach((store) => tx.objectStore(store).clear());
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("Falha ao limpar histórico SIGEM × PW."));
    }));
  }

  async function recordSource(system, base, model, recordedAt) {
    const built = buildSourceSnapshot(system, base, model, { recordedAt });
    const existing = await getSnapshot(STORES.sourceSnapshots, built.snapshot.id);
    if (existing) return { created: false, duplicate: true, snapshot: existing };
    const history = await listSourceSnapshots(system);
    const previous = history.length ? history[history.length - 1] : null;
    if (previous) {
      const previousDocs = await loadSnapshotDocuments(previous.id);
      built.snapshot.delta = compareSourceDocuments(previousDocs, built.documents);
      built.snapshot.delta.previousSnapshotId = previous.id;
    }
    return insertSnapshot(STORES.sourceSnapshots, built.snapshot, built.documents);
  }

  async function recordComparison(sigemSnapshot, pwSnapshot, model, revisionAnalysis, recordedAt) {
    const built = buildComparisonSnapshot(sigemSnapshot, pwSnapshot, model, revisionAnalysis, { recordedAt });
    const existing = await getSnapshot(STORES.comparisonSnapshots, built.snapshot.id);
    if (existing) return { created: false, duplicate: true, snapshot: existing };
    const history = await listComparisonSnapshots();
    const previous = history.length ? history[history.length - 1] : null;
    if (previous) {
      const previousDocs = await loadSnapshotDocuments(previous.id);
      const transition = compareComparisonDocuments(previousDocs, built.documents);
      built.snapshot.delta = {
        previousSnapshotId: previous.id,
        metrics: metricDelta(previous.metrics, built.snapshot.metrics),
        transitions: {
          resolved: transition.resolved,
          newPending: transition.newPending,
          becameAligned: transition.becameAligned,
          changedRevision: transition.changedRevision,
          changedState: transition.changedState,
        },
      };
    }
    return insertSnapshot(STORES.comparisonSnapshots, built.snapshot, built.documents);
  }

  async function recordActiveBases(sigemBase, pwBase, options) {
    const hasSigem = Boolean(sigemBase && sigemBase.meta && Array.isArray(sigemBase.records));
    const hasPw = Boolean(pwBase && pwBase.meta && Array.isArray(pwBase.records));
    if (!hasSigem && !hasPw) return { sigem: null, pw: null, comparison: null };
    const recordedAt = text(options && options.recordedAt) || nowIso();
    const model = Dashboard.createModel(hasSigem ? sigemBase.records : [], hasPw ? pwBase.records : []);
    const sigem = hasSigem ? await recordSource(SYSTEMS.SIGEM, sigemBase, model, recordedAt) : null;
    const pw = hasPw ? await recordSource(SYSTEMS.PW, pwBase, model, recordedAt) : null;
    let comparison = null;
    if (hasSigem && hasPw) {
      const sigemSnapshot = sigem && sigem.snapshot || buildSourceSnapshot(SYSTEMS.SIGEM, sigemBase, model, { recordedAt }).snapshot;
      const pwSnapshot = pw && pw.snapshot || buildSourceSnapshot(SYSTEMS.PW, pwBase, model, { recordedAt }).snapshot;
      const revisionAnalysis = Revision && typeof Revision.analyzeAsync === "function"
        ? await Revision.analyzeAsync(model, { chunkSize: 500 })
        : Revision.analyze(model);
      comparison = await recordComparison(sigemSnapshot, pwSnapshot, model, revisionAnalysis, recordedAt);
    }
    return { sigem, pw, comparison };
  }

  return Object.freeze({
    DB_NAME, DB_VERSION, CALCULATION_VERSION, STORES, SYSTEMS, CLASSES, PENDING_STATES,
    text, norm, isComparable, contentFingerprint, minimalDocuments, sourceMetrics, buildSourceSnapshot,
    compareSourceDocuments, relationSets, revisionState, comparisonDocuments, countStates,
    classComparisonMetrics, buildComparisonSnapshot, compareComparisonDocuments, metricDelta,
    openDb, getSnapshot, listSourceSnapshots, listComparisonSnapshots, loadSnapshotDocuments,
    insertSnapshot, deleteSnapshot, clearHistory, recordSource, recordComparison, recordActiveBases,
  });
});