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
  const triageContexts = new WeakMap();
  let triageSerial = Promise.resolve();
  let counter = 0;
  let contextCounter = 0;

  // Este timeout é somente um fusível de última linha. O fluxo normal é
  // concluído por onmessage/onerror/onmessageerror. Ele existe para garantir
  // que uma Promise nunca fique pendente para sempre caso o navegador mate um
  // Worker sem entregar um evento terminal (suspensão, falta de memória etc.).
  const BASE_TASK_TIMEOUT_MS = 15 * 60 * 1000;
  const MAX_TASK_TIMEOUT_MS = 30 * 60 * 1000;

  function appVersion() {
    return String(root.GrconConfig && root.GrconConfig.APP_VERSION || "5.32.24");
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

  function diagnostic(stage, detail) {
    const payload = { stage, at: Date.now(), ...(detail || {}) };
    try {
      root.dispatchEvent(new CustomEvent("grcon:analysis-diagnostic", { detail: payload }));
    } catch (_) {
      // Diagnóstico nunca participa do resultado documental.
    }
    if (root.GRCON_DEBUG_ANALYZE === true && root.console && typeof root.console.debug === "function") {
      root.console.debug(`[GRCON Analyze][${stage}]`, payload);
    }
  }

  function setMetric(value) {
    if (!value || !value.stage) return;
    metrics[value.stage] = value;
    emit({ metrics: { ...metrics } });
  }

  function taskTimeoutMs(kind, action, payload) {
    let estimated = BASE_TASK_TIMEOUT_MS;
    if (kind === "triage") {
      const amount = Number(payload && ((payload.inputs && payload.inputs.length) || (payload.rows && payload.rows.length))) || 0;
      estimated += Math.min(10 * 60 * 1000, amount * 25);
    } else if (kind === "ld") {
      const bytes = Number(payload && payload.buffer && payload.buffer.byteLength) || 0;
      estimated += Math.min(8 * 60 * 1000, Math.ceil(bytes / (1024 * 1024)) * 2500);
    } else if (kind === "export") {
      estimated += 10 * 60 * 1000;
    }
    return Math.min(MAX_TASK_TIMEOUT_MS, estimated);
  }

  function settleTask(taskId, outcome, value) {
    const task = pending.get(taskId);
    if (!task || task.settled) return false;
    task.settled = true;
    pending.delete(taskId);
    if (task.watchdog) clearTimeout(task.watchdog);
    const durationMs = typeof performance !== "undefined" && performance.now
      ? performance.now() - task.startedAt
      : Date.now() - task.startedAtEpoch;
    diagnostic(outcome === "resolve" ? "worker-done" : "worker-failed", {
      kind: task.kind,
      action: task.action,
      taskId,
      durationMs,
      message: outcome === "reject" ? String(value && value.message || value || "") : "",
    });
    if (outcome === "resolve") task.resolve(value);
    else task.reject(value instanceof Error || value instanceof DOMException ? value : new Error(String(value || "Falha no Worker.")));
    return true;
  }

  function rejectTasks(kind, error) {
    for (const [taskId, task] of [...pending]) {
      if (kind && task.kind !== kind) continue;
      settleTask(taskId, "reject", error);
    }
  }

  function disposeWorker(kind, error) {
    const instance = workers.get(kind);
    if (instance) {
      workers.delete(kind);
      try {
        instance.onmessage = null;
        instance.onerror = null;
        instance.onmessageerror = null;
        instance.terminate();
      } catch (_) {
        // A instância já pode ter sido encerrada pelo navegador.
      }
    }
    if (error) rejectTasks(kind, error);
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
      if (!task || task.kind !== kind) return;
      if (message.type === "progress") {
        if (task.onProgress) {
          try { task.onProgress(message); }
          catch (error) { diagnostic("progress-listener", { kind, action: task.action, message: String(error && error.message || error) }); }
        }
        return;
      }
      if (message.type === "chunk") {
        task.chunks.push(...(message.chunk || []));
        return;
      }
      if (message.metrics) setMetric(message.metrics);
      if (message.type === "done") {
        const result = task.collectChunks ? { result: message.result, chunks: task.chunks } : message.result;
        settleTask(message.taskId, "resolve", result);
        return;
      }
      if (message.type === "cancelled") {
        settleTask(message.taskId, "reject", new DOMException(message.error || "Processamento cancelado.", "AbortError"));
        return;
      }
      if (message.type === "error") {
        const error = new Error(message.error || "Falha no Worker.");
        error.stack = message.stack || error.stack;
        settleTask(message.taskId, "reject", error);
      }
    };
    instance.onerror = (event) => {
      const error = new Error(event && event.message || `Falha no Worker ${kind}.`);
      diagnostic("worker-error", { kind, message: error.message });
      disposeWorker(kind, error);
    };
    instance.onmessageerror = () => {
      const error = new Error(`O Worker ${kind} recebeu ou devolveu uma mensagem que não pôde ser desserializada.`);
      diagnostic("worker-message-error", { kind, message: error.message });
      disposeWorker(kind, error);
    };
    workers.set(kind, instance);
    diagnostic("worker-ready", { kind, url: url.href });
    return instance;
  }

  function run(kind, action, payload, options) {
    const settings = options || {};
    const taskId = `${kind}-${Date.now()}-${++counter}`;
    return new Promise((resolve, reject) => {
      const startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      const task = {
        kind,
        action,
        resolve,
        reject,
        onProgress: settings.onProgress,
        chunks: [],
        collectChunks: Boolean(settings.collectChunks),
        settled: false,
        watchdog: null,
        startedAt,
        startedAtEpoch: Date.now(),
      };
      pending.set(taskId, task);
      const timeoutMs = Number(settings.timeoutMs) > 0
        ? Number(settings.timeoutMs)
        : taskTimeoutMs(kind, action, payload);
      task.watchdog = setTimeout(() => {
        if (!pending.has(taskId)) return;
        const error = new Error(`O processamento ${kind}/${action} não respondeu ao evento terminal esperado. A tarefa foi encerrada com segurança.`);
        error.code = "GRCON_WORKER_TIMEOUT";
        diagnostic("worker-timeout", { kind, action, taskId, timeoutMs });
        // Um Worker que perdeu a resposta terminal não é reutilizado: todas as
        // tarefas que dependiam da mesma instância são rejeitadas de forma
        // explícita e uma próxima execução criará uma instância limpa.
        disposeWorker(kind, error);
      }, timeoutMs);

      diagnostic("worker-start", { kind, action, taskId, timeoutMs });
      try {
        worker(kind).postMessage({ taskId, action, payload }, settings.transfer || []);
      } catch (error) {
        settleTask(taskId, "reject", error);
      }
    });
  }

  function enqueueTriage(operation) {
    const result = triageSerial.then(operation, operation);
    // A fila precisa sobreviver a uma falha: a rejeição é devolvida apenas ao
    // chamador daquela operação; a próxima análise ainda pode executar.
    triageSerial = result.catch(() => undefined);
    return result;
  }

  function cancel(kind) {
    if (kind) disposeWorker(kind, new DOMException("Processamento cancelado pelo usuário.", "AbortError"));
    else {
      for (const workerKind of [...workers.keys()]) {
        disposeWorker(workerKind, new DOMException("Processamento cancelado pelo usuário.", "AbortError"));
      }
      rejectTasks(null, new DOMException("Processamento cancelado pelo usuário.", "AbortError"));
    }
    emit({ cancelled: kind || "all", metrics: { ...metrics } });
    diagnostic("cancelled", { kind: kind || "all" });
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
    if (!index) throw new Error("A triagem não recebeu o índice consolidado da LD.");
    const context = {
      id: `analysis-context-${Date.now()}-${++contextCounter}`,
      index,
      catalogEntries: catalogEntries || [],
      settings: settings || {},
      onProgress,
    };
    if (settings && typeof settings === "object") triageContexts.set(settings, context);
    diagnostic("triage-context", { contextId: context.id });
    return { initialized: true, contextId: context.id };
  }

  async function triage(inputs, settings, onProgress) {
    const context = settings && typeof settings === "object" ? triageContexts.get(settings) : null;
    return enqueueTriage(async () => {
      if (context) {
        await run("triage", "initialize", {
          index: context.index,
          catalogEntries: context.catalogEntries,
          settings: context.settings,
        }, { onProgress: context.onProgress });
      }
      const value = await run("triage", "triage", { inputs, settings }, { onProgress, collectChunks: true });
      return value.chunks;
    }).catch((error) => {
      if (settings && typeof settings === "object") triageContexts.delete(settings);
      throw error;
    });
  }

  async function enrich(rows, settings, onProgress) {
    const context = settings && typeof settings === "object" ? triageContexts.get(settings) : null;
    try {
      return await enqueueTriage(async () => {
        // Reaplica o índice pertencente a ESTA análise. Assim uma segunda
        // execução, mesmo que seja iniciada programaticamente, nunca consegue
        // trocar o activeIndex antes do enriquecimento da primeira.
        if (context) {
          await run("triage", "initialize", {
            index: context.index,
            catalogEntries: context.catalogEntries,
            settings: context.settings,
          }, { onProgress: context.onProgress });
        }
        const value = await run("triage", "enrich", { rows, settings }, { onProgress, collectChunks: true });
        return value.chunks;
      });
    } catch (error) {
      if (error && error.name === "AbortError") throw error;
      // A triagem documental já terminou antes desta etapa. O enriquecimento
      // atual acrescenta timeline/assistência, mas o próprio app reaplica o
      // Databook autoritativo da LD em seguida. Logo uma falha de Worker aqui é
      // recuperável e não deve apagar resultados válidos nem bloquear a eGRDT.
      diagnostic("enrichment-recoverable", {
        message: String(error && error.message || error || "Falha no enriquecimento"),
        rows: Array.isArray(rows) ? rows.length : 0,
      });
      return (rows || []).map((_, index) => ({
        index,
        timeline: null,
        databookAssistant: null,
        applyDatabook: false,
        databook: "",
        recoverableError: String(error && error.message || error || ""),
      }));
    } finally {
      if (settings && typeof settings === "object") triageContexts.delete(settings);
    }
  }

  async function buildReport(payload, onProgress) {
    return run("export", "report", payload, { onProgress });
  }

  async function buildEgrdts(payload, onProgress) {
    return run("export", "egrdts", payload, { onProgress });
  }

  async function preparePackageFiles(payload, onProgress) {
    const source = payload || {};
    if (!source.includeFiles) return { payload: source, transfer: [] };

    const FileAccess = root.GrconFileAccess;
    if (!FileAccess || typeof FileAccess.read !== "function") return { payload: source, transfer: [] };

    // Não mandamos para o Worker a referência original do File selecionado na
    // unidade de rede. O Chromium pode manter essa referência ligada ao caminho
    // físico e ela deixa de existir entre a seleção e a compactação. Lemos aqui,
    // imediatamente antes da exportação, e enviamos bytes estáveis em memória.
    const groups = (source.groups || []).map((group) => ({
      ...group,
      entries: (group.entries || []).map((entry) => ({ ...entry })),
    }));
    const entries = groups.flatMap((group) => group.entries || []).filter((entry) => entry && entry.file);
    const transfer = [];
    const snapshots = new WeakMap();
    let completed = 0;

    for (const entry of entries) {
      const file = entry.file;
      // Já estabilizado por uma chamada anterior: não lê nem transfere de novo.
      if (file instanceof ArrayBuffer || ArrayBuffer.isView(file)) {
        completed += 1;
        continue;
      }

      let buffer = snapshots.get(file);
      if (!buffer) {
        buffer = await FileAccess.read(file, {
          context: "o arquivo da pasta documental",
          retries: 3,
        });
        snapshots.set(file, buffer);
        transfer.push(buffer);
      }
      entry.file = new Uint8Array(buffer);
      completed += 1;
      if (onProgress && (completed === entries.length || completed % 8 === 0)) {
        onProgress({
          type: "progress",
          progress: entries.length ? (completed / entries.length) * 0.12 : 0.12,
          message: `Estabilizando arquivos da pasta de rede (${completed}/${entries.length})`,
        });
      }
    }

    return { payload: { ...source, groups }, transfer };
  }

  async function buildPackage(payload, onProgress) {
    const prepared = await preparePackageFiles(payload, onProgress);
    const workerProgress = onProgress ? (message) => {
      const value = message || {};
      onProgress({
        ...value,
        progress: 0.12 + Math.max(0, Math.min(1, Number(value.progress) || 0)) * 0.88,
      });
    } : null;
    return run("export", "package", prepared.payload, { onProgress: workerProgress, transfer: prepared.transfer });
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
    activeTasks: () => [...pending].map(([taskId, task]) => ({ taskId, kind: task.kind, action: task.action, startedAt: task.startedAtEpoch })),
    memorySnapshot,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
