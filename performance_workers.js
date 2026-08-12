(function (root) {
  "use strict";

  const WORKER_URLS = Object.freeze({
    ld: "workers/ld.worker.js",
    triage: "workers/triage.worker.js",
    export: "workers/export.worker.js",
  });
  const workers = new Map();
  const pending = new Map();
  const metrics = {};
  let counter = 0;

  function appVersion() {
    return String(root.GrconConfig && root.GrconConfig.APP_VERSION || "5.32.5");
  }

  function supported() {
    return typeof Worker === "function" && typeof URL === "function";
  }

  function emit(detail) {
    try {
      root.dispatchEvent(new CustomEvent("grcon:performance-metrics", { detail }));
    } catch (_) {
      // Métricas são informativas e não podem interromper a análise.
    }
  }

  function setMetric(value) {
    if (!value || !value.stage) return;
    metrics[value.stage] = value;
    emit({ metrics: { ...metrics } });
  }

  function rejectTasks(kind, error) {
    for (const [taskId, task] of [...pending]) {
      if (task.kind !== kind) continue;
      pending.delete(taskId);
      task.reject(error);
    }
  }

  function worker(kind) {
    if (workers.has(kind)) return workers.get(kind);
    if (!supported()) throw new Error("Web Workers não são suportados neste navegador.");
    if (!WORKER_URLS[kind]) throw new Error(`Worker desconhecido: ${kind}.`);

    const url = new URL(WORKER_URLS[kind], document.baseURI);
    const instance = new Worker(url, { name: `grcon-${kind}` });
    instance.onmessage = (event) => {
      const message = event.data || {};
      const task = pending.get(message.taskId);
      if (!task) return;
      if (message.type === "progress") {
        if (task.onProgress) task.onProgress(message);
        return;
      }
      if (message.type === "chunk") {
        task.chunks.push(...(message.chunk || []));
        return;
      }
      if (message.metrics) setMetric(message.metrics);
      if (message.type === "done") {
        pending.delete(message.taskId);
        task.resolve(task.collectChunks ? { result: message.result, chunks: task.chunks } : message.result);
        return;
      }
      if (message.type === "cancelled") {
        pending.delete(message.taskId);
        task.reject(new DOMException(message.error || "Processamento cancelado.", "AbortError"));
        return;
      }
      if (message.type === "error") {
        pending.delete(message.taskId);
        const error = new Error(message.error || "Falha no Worker.");
        error.stack = message.stack || error.stack;
        task.reject(error);
      }
    };
    instance.onerror = (event) => {
      rejectTasks(kind, new Error(event.message || `Falha no Worker ${kind}.`));
      workers.delete(kind);
    };
    workers.set(kind, instance);
    return instance;
  }

  function run(kind, action, payload, options) {
    const settings = options || {};
    const taskId = `${kind}-${Date.now()}-${++counter}`;
    return new Promise((resolve, reject) => {
      pending.set(taskId, {
        kind,
        resolve,
        reject,
        onProgress: settings.onProgress,
        chunks: [],
        collectChunks: Boolean(settings.collectChunks),
      });
      try {
        worker(kind).postMessage({ taskId, action, payload }, settings.transfer || []);
      } catch (error) {
        pending.delete(taskId);
        reject(error);
      }
    });
  }

  function cancel(kind) {
    const target = workers.get(kind);
    if (target) {
      target.terminate();
      workers.delete(kind);
    }
    for (const [taskId, task] of [...pending]) {
      if (kind && task.kind !== kind) continue;
      pending.delete(taskId);
      task.reject(new DOMException("Processamento cancelado pelo usuário.", "AbortError"));
    }
    emit({ cancelled: kind || "all", metrics: { ...metrics } });
  }

  async function loadLd(file, profile, onProgress) {
    const profileKey = JSON.stringify(profile || {});
    const key = `${appVersion()}|${file.name}|${file.size}|${file.lastModified}|${profileKey}`;
    const lookup = await run("ld", "lookup", { key }, { onProgress });
    if (lookup && lookup.cacheHit) {
      setMetric({
        stage: "ld-cache-hit",
        durationMs: 0,
        records: lookup.parsed.records.length,
        history: lookup.parsed.history.length,
        cacheLayer: lookup.cacheLayer || "indexeddb",
      });
      return lookup;
    }
    const readStarted = performance.now();
    const buffer = await file.arrayBuffer();
    setMetric({ stage: "ld-file-read", durationMs: performance.now() - readStarted, bytes: buffer.byteLength });
    return run("ld", "parse", {
      key,
      buffer,
      name: file.name,
      lastModified: file.lastModified,
      profile: profile || null,
    }, { onProgress, transfer: [buffer] });
  }

  async function initializeTriage(index, catalogEntries, settings, onProgress) {
    return run("triage", "initialize", { index, catalogEntries, settings }, { onProgress });
  }

  async function triage(inputs, settings, onProgress) {
    const value = await run("triage", "triage", { inputs, settings }, { onProgress, collectChunks: true });
    return value.chunks;
  }

  async function enrich(rows, settings, onProgress) {
    const value = await run("triage", "enrich", { rows, settings }, { onProgress, collectChunks: true });
    return value.chunks;
  }

  async function buildReport(payload, onProgress) {
    return run("export", "report", payload, { onProgress });
  }

  async function buildEgrdts(payload, onProgress) {
    return run("export", "egrdts", payload, { onProgress });
  }

  async function buildPackage(payload, onProgress) {
    return run("export", "package", payload, { onProgress });
  }

  function memorySnapshot() {
    const memory = performance && performance.memory;
    return memory ? {
      usedMb: Math.round(memory.usedJSHeapSize / 1048576),
      totalMb: Math.round(memory.totalJSHeapSize / 1048576),
      limitMb: Math.round(memory.jsHeapSizeLimit / 1048576),
    } : null;
  }

  root.GrconPerformance = Object.freeze({
    get version() { return appVersion(); },
    supported: supported(),
    loadLd,
    initializeTriage,
    triage,
    enrich,
    buildReport,
    buildEgrdts,
    buildPackage,
    cancel,
    cancelAll: () => cancel(),
    clearLdCache: () => run("ld", "clear-cache", {}),
    metrics: () => ({ ...metrics }),
    memorySnapshot,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
