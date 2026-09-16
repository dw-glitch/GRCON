(function (root, factory) {
  const safeRequire = (path) => {
    if (typeof require !== "function") return null;
    try { return require(path); } catch (_) { return null; }
  };
  const api = factory(
    root.GrconSigemPwDashboard || safeRequire("./sigem_pw_dashboard_core.js"),
    // Resolva a dependência no momento do uso. Em uma aba antiga/cacheada, este
    // arquivo pode ser avaliado antes de revision_core; capturar o valor aqui
    // congelaria null na closure e faria recordActiveBases chamar null.analyze.
    () => root.GrconSigemPwRevision || safeRequire("./sigem_pw_revision_core.js")
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconSigemPwHistory = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Dashboard, getRevision) {
  "use strict";

  const DB_NAME = "grcon-sigem-pw-history";
  const DB_VERSION = 1;
  const CALCULATION_VERSION = "sigem-pw-history-2";
  const STORES = Object.freeze({
    sourceSnapshots: "sourceSnapshots",
    comparisonSnapshots: "comparisonSnapshots",
    workingSets: "workingSets",
    snapshotChanges: "snapshotChanges",
    meta: "meta",
  });
  const SYSTEMS = Object.freeze({ SIGEM: "sigem", PW: "pw" });
  const CLASSES = Object.freeze(["ET", "N-1710"]);
  const PENDING_STATES = new Set(["post-pw", "post-sigem", "awaiting-emission", "review"]);
  const WORKING_KEYS = Object.freeze({ sigem: "latest:sigem", pw: "latest:pw", comparison: "latest:comparison" });

  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
  function norm(value) { return Dashboard && Dashboard.norm ? Dashboard.norm(value) : text(value).toUpperCase(); }
  function nowIso() { return new Date().toISOString(); }
  function resolveRevisionRuntime(required) {
    const revision = typeof getRevision === "function" ? getRevision() : null;
    const ready = revision
      && (typeof revision.analyze === "function" || typeof revision.analyzeAsync === "function");
    if (required && !ready) {
      throw new Error("O motor de revisão do Dashboard SIGEM × PW não está disponível. A base vigente foi preservada; reabra o módulo e tente novamente.");
    }
    return revision;
  }
  function revisionOf(record) {
    const revision = resolveRevisionRuntime(false);
    return revision && revision.revisionValue
      ? revision.revisionValue(record)
      : text(record && (record.revision || record.revisionComplete));
  }
  function currentStatus(document, system) { return system === SYSTEMS.PW ? text(document && document.current && document.current.state) : text(document && document.current && document.current.status); }
  function isComparable(document) {
    if (!document || !CLASSES.includes(text(document.documentClass))) return false;
    const revision = resolveRevisionRuntime(false);
    if (revision && typeof revision.comparableDocument === "function") return revision.comparableDocument(document);
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

  // Fingerprint lógico do conteúdo relevante. Nome de arquivo e ordem das linhas
  // não participam, portanto renomear a mesma base não infla o histórico.
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
    const aggregate = Dashboard.aggregateModel(model);
    const entryTotal = system === SYSTEMS.PW ? aggregate.summary.pwRegistered : aggregate.summary.sigem;
    const entryClasses = Object.fromEntries(CLASSES.map((documentClass) => {
      const row = aggregate.classes.find((item) => item.documentClass === documentClass);
      return [documentClass, Number(row && (system === SYSTEMS.PW ? row.pwRegistered : row.sigem) || 0)];
    }));
    const emittedEntryClasses = system === SYSTEMS.PW ? Object.fromEntries(CLASSES.map((documentClass) => {
      const row = aggregate.classes.find((item) => item.documentClass === documentClass);
      return [documentClass, Number(row && row.pwEmitted || 0)];
    })) : null;
    const meta = base && base.meta || {};
    const nonComparableRecognized = allDocuments.filter((document) => !isComparable(document)).length;
    return {
      rawRecords: Number(meta.sourceRowCount || meta.recordCount || (normalized && normalized.length) || 0),
      validRecords: Number(meta.recordCount || (normalized && normalized.length) || 0),
      comparableDocuments: comparable.length,
      revisionEntries: entryTotal,
      allRecognizedDocuments: allDocuments.length,
      outsideScope: nonComparableRecognized,
      invalidRecords: Number(meta.invalidCount || 0),
      unclassified: allDocuments.filter((document) => !CLASSES.includes(text(document.documentClass))).length,
      classes: classCounts(comparable, false),
      revisionClasses: entryClasses,
      emittedDocuments: system === SYSTEMS.PW ? emitted.length : null,
      emittedRevisionEntries: system === SYSTEMS.PW ? aggregate.summary.pwEmitted : null,
      emittedByClass: system === SYSTEMS.PW ? classCounts(comparable, true) : null,
      emittedRevisionByClass: emittedEntryClasses,
      notEmittedDocuments: system === SYSTEMS.PW ? comparable.length - emitted.length : null,
      notEmittedRevisionEntries: system === SYSTEMS.PW ? aggregate.summary.gapPwToEmitted : null,
      statusDistribution: distribution(comparable, (document) => document.status),
      duplicateRevisionCount: Number(meta.duplicateRevisionCount || 0),
      unknownEmissionCount: Number(meta.unknownEmissionCount || 0),
    };
  }

  function buildSourceSnapshot(system, base, model, options) {
    if (![SYSTEMS.SIGEM, SYSTEMS.PW].includes(system)) throw new Error("Sistema de snapshot inválido.");
    if (!base || !base.meta || !Array.isArray(base.records)) throw new Error(`Base ${system.toUpperCase()} inválida para snapshot.`);
    const documents = minimalDocuments(system, model);
    const fingerprint = contentFingerprint(system, base.records);
    const sourceImportedAt = text(base.meta.importedAt) || nowIso();
    const importedAt = text(options && options.effectiveAt) || sourceImportedAt;
    const snapshot = {
      id: `${system}:${fingerprint}`,
      kind: "source",
      system,
      fingerprint,
      importedAt,
      sourceImportedAt,
      recordedAt: text(options && options.recordedAt) || nowIso(),
      fileName: text(base.meta.fileName),
      fileSize: Number(base.meta.fileSize || 0),
      lastModified: Number(base.meta.lastModified || 0),
      calculationVersion: CALCULATION_VERSION,
      sourceVersion: Number(base.meta.version || 0),
      metrics: sourceMetrics(system, base, model, documents),
      delta: null,
    };
    return { snapshot, documents };
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

  function sourceChangeDetails(previousDocuments, currentDocuments, delta) {
    const previous = mapByKey(previousDocuments), current = mapByKey(currentDocuments);
    const rows = (keys, mode) => (keys || []).map((key) => ({ key, before: previous.get(key) || null, after: current.get(key) || null, mode }));
    return {
      entered: rows(delta && delta.keys && delta.keys.entered, "entered"),
      exited: rows(delta && delta.keys && delta.keys.exited, "exited"),
      changedRevision: rows(delta && delta.keys && delta.keys.changedRevision, "changed-revision"),
      changedStatus: rows(delta && delta.keys && delta.keys.changedStatus, "changed-status"),
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
    const revision = resolveRevisionRuntime(false);
    const s = revision && revision.SITUATIONS || {};
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
    const aggregate = Dashboard.aggregateModel(model);
    const revisionRows = revisionAnalysis && Array.isArray(revisionAnalysis.rows) ? revisionAnalysis.rows : [];
    return CLASSES.map((documentClass) => {
      const entryMetrics = aggregate.classes.find((item) => item.documentClass === documentClass) || {};
      const rows = revisionRows.filter((row) => row.documentClass === documentClass);
      const docs = comparisonDocs.filter((row) => row.documentClass === documentClass);
      const states = countStates(docs);
      const alignedEntries = aggregate.lists.aligned.filter((row) => row.documentClass === documentClass).length;
      const rc = { updated: 0, previous: 0, notFound: 0, awaitingEmission: 0, pwAhead: 0, review: 0 };
      const revision = resolveRevisionRuntime(false);
      const situations = revision && revision.SITUATIONS || {};
      for (const row of rows) {
        if (row.situation === situations.UPDATED) rc.updated += 1;
        else if (row.situation === situations.PREVIOUS) rc.previous += 1;
        else if (row.situation === situations.NOT_FOUND) rc.notFound += 1;
        else if (row.situation === situations.AWAITING_EMISSION) rc.awaitingEmission += 1;
        else if (row.situation === situations.PW_AHEAD) rc.pwAhead += 1;
        else rc.review += 1;
      }
      return {
        documentClass,
        sigem: Number(entryMetrics.sigem || 0),
        pwRegistered: Number(entryMetrics.pwRegistered || 0),
        pwEmitted: Number(entryMetrics.pwEmitted || 0),
        matched: Number(entryMetrics.matched || 0),
        sigemOnly: Number(entryMetrics.gapSigemToPw || 0),
        pwOnly: Number(entryMetrics.pwExclusive || 0),
        aligned: alignedEntries,
        postPw: Number(entryMetrics.gapSigemToPw || 0),
        postSigem: Number(entryMetrics.pwExclusive || 0),
        awaitingEmission: Number(entryMetrics.gapPwToEmitted || 0),
        documentStates: states,
        pwPrevious: rc.previous,
        notFoundPw: rc.notFound,
        correctRegisteredNotEmitted: rc.awaitingEmission,
        coverage: entryMetrics.sigem ? Number(entryMetrics.matched || 0) / entryMetrics.sigem : null,
        emissionRate: entryMetrics.pwRegistered ? Number(entryMetrics.pwEmitted || 0) / entryMetrics.pwRegistered : null,
      };
    });
  }

  function buildComparisonSnapshot(sigemSnapshot, pwSnapshot, model, revisionAnalysis, options) {
    if (!sigemSnapshot || !pwSnapshot) throw new Error("As duas bases são necessárias para registrar um comparativo.");
    const documents = comparisonDocuments(model, revisionAnalysis);
    const states = countStates(documents);
    const counts = revisionAnalysis && revisionAnalysis.counts || {};
    const aggregate = Dashboard.aggregateModel(model);
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
        sigem: aggregate.summary.sigem,
        pwRegistered: aggregate.summary.pwRegistered,
        pwEmitted: aggregate.summary.pwEmitted,
        matched: aggregate.summary.matched,
        exclusiveSigem: aggregate.summary.gapSigemToPw,
        exclusivePw: aggregate.summary.pwExclusive,
        postPw: aggregate.summary.gapSigemToPw,
        postSigem: aggregate.summary.pwExclusive,
        awaitingEmission: aggregate.summary.gapPwToEmitted,
        aligned: aggregate.lists.aligned.length,
        review: states.review,
        documentStates: states,
        pwPrevious: Number(counts.previous || 0),
        notFoundPw: Number(counts.notFound || 0),
        correctRegisteredNotEmitted: Number(counts.awaitingEmission || 0),
        coverage: aggregate.summary.sigem ? aggregate.summary.matched / aggregate.summary.sigem : null,
        emissionRate: aggregate.summary.pwRegistered ? aggregate.summary.pwEmitted / aggregate.summary.pwRegistered : null,
        classes: classComparisonMetrics(model, revisionAnalysis, documents),
      },
      delta: null,
    };
    return { snapshot, documents };
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

  function transitionDetails(previousDocuments, currentDocuments, transition) {
    const previous = mapByKey(previousDocuments), current = mapByKey(currentDocuments);
    const rows = (keys, mode) => (keys || []).map((key) => ({ key, before: previous.get(key) || null, after: current.get(key) || null, mode }));
    return {
      resolved: rows(transition && transition.keys && transition.keys.resolved, "resolved"),
      newPending: rows(transition && transition.keys && transition.keys.newPending, "new-pending"),
      becameAligned: rows(transition && transition.keys && transition.keys.becameAligned, "became-aligned"),
      changedRevision: rows(transition && transition.keys && transition.keys.changedRevision, "changed-revision"),
      changedState: rows(transition && transition.keys && transition.keys.changedState, "changed-state"),
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
        if (!db.objectStoreNames.contains(STORES.workingSets)) db.createObjectStore(STORES.workingSets, { keyPath: "key" });
        if (!db.objectStoreNames.contains(STORES.snapshotChanges)) db.createObjectStore(STORES.snapshotChanges, { keyPath: "snapshotId" });
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
  async function loadWorkingSet(key) {
    return withDb(async (db) => requestValue(db.transaction(STORES.workingSets, "readonly").objectStore(STORES.workingSets).get(key)));
  }
  async function loadSnapshotChanges(snapshotId) {
    const record = await withDb(async (db) => requestValue(db.transaction(STORES.snapshotChanges, "readonly").objectStore(STORES.snapshotChanges).get(snapshotId)));
    return record && record.value || null;
  }

  async function updateSourceSnapshotDate(system, snapshotId, importedAtValue) {
    if (![SYSTEMS.SIGEM, SYSTEMS.PW].includes(system)) throw new Error("Sistema de snapshot inválido.");
    const parsed = new Date(importedAtValue);
    if (!text(snapshotId) || Number.isNaN(parsed.getTime())) throw new Error("Informe uma data válida para o snapshot.");
    const importedAt = parsed.toISOString();
    const current = await getSnapshot(STORES.sourceSnapshots, snapshotId);
    if (!current) return null;
    if (current.system !== system) throw new Error("O snapshot não pertence ao sistema informado.");
    const updated = {
      ...current,
      sourceImportedAt: text(current.sourceImportedAt) || text(current.importedAt),
      importedAt,
      effectiveAt: importedAt,
      dateEditedAt: nowIso(),
    };
    return withDb((db) => new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.sourceSnapshots, STORES.comparisonSnapshots], "readwrite");
      tx.objectStore(STORES.sourceSnapshots).put(updated);
      const comparisons = tx.objectStore(STORES.comparisonSnapshots);
      const request = comparisons.getAll();
      request.onsuccess = () => {
        (request.result || []).forEach((comparison) => {
          if (comparison.sigemSnapshotId !== snapshotId && comparison.pwSnapshotId !== snapshotId) return;
          comparisons.put({
            ...comparison,
            ...(system === SYSTEMS.SIGEM ? { sigemImportedAt: importedAt } : { pwImportedAt: importedAt }),
          });
        });
      };
      tx.oncomplete = () => resolve(updated);
      tx.onerror = () => reject(tx.error || new Error("Falha ao atualizar a data do snapshot."));
      tx.onabort = () => reject(tx.error || new Error("A atualização da data foi cancelada."));
    }));
  }

  async function persistSnapshot(storeName, snapshot, documents, workingKey, changes) {
    const existing = await getSnapshot(storeName, snapshot.id);
    if (existing) return { created: false, snapshot: existing, duplicate: true };
    return withDb((db) => new Promise((resolve, reject) => {
      const tx = db.transaction([storeName, STORES.workingSets, STORES.snapshotChanges], "readwrite");
      tx.objectStore(storeName).add(snapshot);
      tx.objectStore(STORES.workingSets).put({ key: workingKey, snapshotId: snapshot.id, documents: documents || [] });
      if (changes) tx.objectStore(STORES.snapshotChanges).put({ snapshotId: snapshot.id, value: changes });
      tx.oncomplete = () => resolve({ created: true, snapshot, duplicate: false });
      tx.onerror = () => reject(tx.error || new Error("Falha ao registrar snapshot."));
      tx.onabort = () => reject(tx.error || new Error("Registro do snapshot foi cancelado."));
    }));
  }

  async function deleteSnapshot(storeName, snapshotId) {
    return withDb((db) => new Promise((resolve, reject) => {
      const tx = db.transaction([storeName, STORES.workingSets, STORES.snapshotChanges], "readwrite");
      tx.objectStore(storeName).delete(snapshotId);
      tx.objectStore(STORES.snapshotChanges).delete(snapshotId);
      const working = tx.objectStore(STORES.workingSets);
      [WORKING_KEYS.sigem, WORKING_KEYS.pw, WORKING_KEYS.comparison].forEach((key) => {
        const request = working.get(key);
        request.onsuccess = () => { if (request.result && request.result.snapshotId === snapshotId) working.delete(key); };
      });
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

  async function recordSource(system, base, model, options) {
    const values = typeof options === "string" ? { recordedAt: options } : options || {};
    const built = buildSourceSnapshot(system, base, model, values);
    const existing = await getSnapshot(STORES.sourceSnapshots, built.snapshot.id);
    if (existing) return { created: false, duplicate: true, snapshot: existing };
    const history = await listSourceSnapshots(system);
    const previous = history.length ? history[history.length - 1] : null;
    const workingKey = WORKING_KEYS[system];
    const working = await loadWorkingSet(workingKey);
    let changes = null;
    if (previous && working && working.snapshotId === previous.id) {
      const delta = compareSourceDocuments(working.documents || [], built.documents);
      built.snapshot.delta = {
        previousSnapshotId: previous.id,
        entered: delta.entered,
        exited: delta.exited,
        remained: delta.remained,
        changedRevision: delta.changedRevision,
        changedStatus: delta.changedStatus,
      };
      changes = sourceChangeDetails(working.documents || [], built.documents, delta);
    }
    return persistSnapshot(STORES.sourceSnapshots, built.snapshot, built.documents, workingKey, changes);
  }

  async function recordComparison(sigemSnapshot, pwSnapshot, model, revisionAnalysis, recordedAt) {
    const built = buildComparisonSnapshot(sigemSnapshot, pwSnapshot, model, revisionAnalysis, { recordedAt });
    const existing = await getSnapshot(STORES.comparisonSnapshots, built.snapshot.id);
    if (existing) return { created: false, duplicate: true, snapshot: existing };
    const history = await listComparisonSnapshots();
    const previous = history.length ? history[history.length - 1] : null;
    const working = await loadWorkingSet(WORKING_KEYS.comparison);
    let changes = null;
    if (previous && working && working.snapshotId === previous.id) {
      const transition = compareComparisonDocuments(working.documents || [], built.documents);
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
      changes = transitionDetails(working.documents || [], built.documents, transition);
    }
    return persistSnapshot(STORES.comparisonSnapshots, built.snapshot, built.documents, WORKING_KEYS.comparison, changes);
  }

  async function captureRecordingCheckpoint() {
    return withDb(async (db) => {
      const values = await requestValue(db.transaction(STORES.workingSets, "readonly").objectStore(STORES.workingSets).getAll());
      return { workingSets: values || [] };
    });
  }

  function rollbackToken(recorded, checkpoint) {
    const sourceResults = [recorded && recorded.sigem, recorded && recorded.pw].filter(Boolean);
    const comparisonResult = recorded && recorded.comparison;
    return {
      sourceSnapshotIds: sourceResults.filter((item) => item.created && item.snapshot && item.snapshot.id).map((item) => item.snapshot.id),
      comparisonSnapshotIds: comparisonResult && comparisonResult.created && comparisonResult.snapshot
        ? [comparisonResult.snapshot.id]
        : [],
      workingSets: checkpoint && Array.isArray(checkpoint.workingSets) ? checkpoint.workingSets : [],
    };
  }

  async function rollbackRecordedActiveBases(recorded) {
    const token = recorded && recorded.rollbackToken ? recorded.rollbackToken : recorded;
    if (!token) return false;
    const sourceIds = new Set(token.sourceSnapshotIds || []);
    const comparisonIds = new Set(token.comparisonSnapshotIds || []);
    const previousWorking = new Map((token.workingSets || []).map((item) => [item.key, item]));
    return withDb((db) => new Promise((resolve, reject) => {
      const tx = db.transaction([
        STORES.sourceSnapshots,
        STORES.comparisonSnapshots,
        STORES.workingSets,
        STORES.snapshotChanges,
        STORES.meta,
      ], "readwrite");
      const sources = tx.objectStore(STORES.sourceSnapshots);
      const comparisons = tx.objectStore(STORES.comparisonSnapshots);
      const working = tx.objectStore(STORES.workingSets);
      const changes = tx.objectStore(STORES.snapshotChanges);
      const meta = tx.objectStore(STORES.meta);
      sourceIds.forEach((id) => {
        sources.delete(id);
        changes.delete(id);
        meta.delete(`sourcePayload:${id}`);
      });
      comparisonIds.forEach((id) => {
        comparisons.delete(id);
        changes.delete(id);
      });
      Object.values(WORKING_KEYS).forEach((key) => {
        if (previousWorking.has(key)) working.put(previousWorking.get(key));
        else working.delete(key);
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("Falha ao desfazer o registro histórico incompleto."));
      tx.onabort = () => reject(tx.error || new Error("O rollback do histórico foi cancelado."));
    }));
  }

  async function recordActiveBases(sigemBase, pwBase, options) {
    const hasSigem = Boolean(sigemBase && sigemBase.meta && Array.isArray(sigemBase.records));
    const hasPw = Boolean(pwBase && pwBase.meta && Array.isArray(pwBase.records));
    if (!hasSigem && !hasPw) return { sigem: null, pw: null, comparison: null, rollbackToken: null };
    const checkpoint = await captureRecordingCheckpoint();
    const recordedAt = text(options && options.recordedAt) || nowIso();
    const hasLdRecords = Array.isArray(options && options.ldRecords);
    const model = hasLdRecords
      ? Dashboard.createModel(hasSigem ? sigemBase.records : [], hasPw ? pwBase.records : [], options.ldRecords)
      : Dashboard.createModel(hasSigem ? sigemBase.records : [], hasPw ? pwBase.records : []);
    const effectiveAt = text(options && options.effectiveAt);
    const changedSystem = text(options && options.changedSystem);
    const sourceOptions = (system) => ({ recordedAt, effectiveAt: changedSystem === system ? effectiveAt : "" });
    let sigem = null;
    let pw = null;
    let comparison = null;
    try {
      sigem = hasSigem ? await recordSource(SYSTEMS.SIGEM, sigemBase, model, sourceOptions(SYSTEMS.SIGEM)) : null;
      pw = hasPw ? await recordSource(SYSTEMS.PW, pwBase, model, sourceOptions(SYSTEMS.PW)) : null;
      if (hasSigem && hasPw) {
        const sigemSnapshot = sigem && sigem.snapshot || buildSourceSnapshot(SYSTEMS.SIGEM, sigemBase, model, { recordedAt }).snapshot;
        const pwSnapshot = pw && pw.snapshot || buildSourceSnapshot(SYSTEMS.PW, pwBase, model, { recordedAt }).snapshot;
        const revision = resolveRevisionRuntime(true);
        const revisionAnalysis = typeof revision.analyzeAsync === "function"
          ? await revision.analyzeAsync(model, { chunkSize: 500 })
          : revision.analyze(model);
        comparison = await recordComparison(sigemSnapshot, pwSnapshot, model, revisionAnalysis, recordedAt);
      }
      const result = { sigem, pw, comparison };
      result.rollbackToken = rollbackToken(result, checkpoint);
      return result;
    } catch (error) {
      const partial = { sigem, pw, comparison };
      partial.rollbackToken = rollbackToken(partial, checkpoint);
      try {
        await rollbackRecordedActiveBases(partial);
      } catch (rollbackError) {
        throw new Error(`${error.message || "Falha ao registrar o histórico."} O histórico parcial não pôde ser revertido: ${rollbackError.message || "falha desconhecida"}`);
      }
      throw error;
    }
  }

  return Object.freeze({
    DB_NAME, DB_VERSION, CALCULATION_VERSION, STORES, SYSTEMS, CLASSES, PENDING_STATES, WORKING_KEYS,
    text, norm, resolveRevisionRuntime, isComparable, contentFingerprint, minimalDocuments, sourceMetrics, buildSourceSnapshot,
    compareSourceDocuments, sourceChangeDetails, relationSets, revisionState, comparisonDocuments, countStates,
    classComparisonMetrics, buildComparisonSnapshot, compareComparisonDocuments, transitionDetails, metricDelta,
    openDb, getSnapshot, listSourceSnapshots, listComparisonSnapshots, loadWorkingSet, loadSnapshotChanges, updateSourceSnapshotDate,
    persistSnapshot, deleteSnapshot, clearHistory, recordSource, recordComparison,
    captureRecordingCheckpoint, rollbackToken, rollbackRecordedActiveBases, recordActiveBases,
  });
});
