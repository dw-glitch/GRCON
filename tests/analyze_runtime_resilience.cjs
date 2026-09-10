const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.resolve(__dirname, "..");

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function testPerformanceWorkers() {
  const source = fs.readFileSync(path.join(rootDir, "performance_workers.js"), "utf8");
  const workerInstances = [];

  class FakeWorker {
    constructor(url, options) {
      this.url = String(url);
      this.options = options || {};
      this.messages = [];
      this.activeIndex = null;
      this.terminated = false;
      this.autoRespond = true;
      workerInstances.push(this);
    }

    postMessage(message) {
      this.messages.push(message);
      if (!this.autoRespond) return;
      queueMicrotask(() => {
        if (this.terminated || typeof this.onmessage !== "function") return;
        const { taskId, action, payload = {} } = message;
        if (action === "initialize") {
          this.activeIndex = payload.index;
          this.onmessage({ data: { taskId, type: "done", result: { initialized: true } } });
          return;
        }
        if (action === "triage" || action === "enrich") {
          this.onmessage({ data: {
            taskId,
            type: "chunk",
            chunk: [{ action, marker: this.activeIndex && this.activeIndex.marker || "none" }],
          } });
          this.onmessage({ data: { taskId, type: "done", result: { count: 1 } } });
          return;
        }
        this.onmessage({ data: { taskId, type: "done", result: { ok: true, action } } });
      });
    }

    terminate() {
      this.terminated = true;
    }
  }

  const dispatched = [];
  const context = {
    console,
    Worker: FakeWorker,
    URL,
    document: { baseURI: "https://grcon.test/" },
    performance,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init && init.detail; }
    },
    DOMException,
    dispatchEvent(event) { dispatched.push(event); return true; },
    addEventListener() {},
    GrconConfig: { APP_VERSION: "test" },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "performance_workers.js" });

  const perf = context.GrconPerformance;
  assert.ok(perf && perf.supported, "PerformanceCore deve ser criado com suporte a Worker");

  const normal = await perf.clearLdCache();
  assert.equal(normal.ok, true, "tarefa normal precisa resolver");
  assert.equal(perf.activeTasks().length, 0, "nenhuma Promise pode ficar pendente após done");

  const beforeMessageError = workerInstances.length;
  const stalledPromise = perf.clearLdCache();
  await flush();
  const ldWorker = workerInstances[workerInstances.length - 1];
  ldWorker.autoRespond = false;
  // A chamada anterior pode ter sido respondida automaticamente no microtask.
  // Inicia outra tarefa já com a resposta automática desativada.
  await stalledPromise;
  const pendingPromise = perf.clearLdCache();
  await flush();
  assert.equal(perf.activeTasks().length, 1, "a tarefa simulada deve estar pendente antes do messageerror");
  ldWorker.onmessageerror({});
  await assert.rejects(pendingPromise, /desserializada/i, "onmessageerror deve rejeitar a Promise do fluxo");
  assert.equal(perf.activeTasks().length, 0, "messageerror precisa encerrar todas as Promises do Worker afetado");
  assert.equal(ldWorker.terminated, true, "Worker inconsistente não deve ser reutilizado");
  assert.ok(workerInstances.length >= beforeMessageError, "o teste deve manter o ciclo de Worker observável");

  const recovered = await perf.clearLdCache();
  assert.equal(recovered.ok, true, "a próxima operação precisa criar/reutilizar Worker saudável e funcionar");

  const settingsA = {};
  const settingsB = {};
  await perf.initializeTriage({ marker: "A" }, [], settingsA);
  await perf.initializeTriage({ marker: "B" }, [], settingsB);

  const [triageA, triageB] = await Promise.all([
    perf.triage([{ id: "a" }], settingsA),
    perf.triage([{ id: "b" }], settingsB),
  ]);
  assert.equal(triageA[0].marker, "A", "a análise A não pode usar o índice da análise B");
  assert.equal(triageB[0].marker, "B", "a análise B deve usar seu próprio índice");

  const [enrichA, enrichB] = await Promise.all([
    perf.enrich([{ document: "A" }], settingsA),
    perf.enrich([{ document: "B" }], settingsB),
  ]);
  assert.equal(enrichA[0].marker, "A", "enriquecimento A deve reativar o contexto A");
  assert.equal(enrichB[0].marker, "B", "enriquecimento B deve reativar o contexto B");
  assert.equal(perf.activeTasks().length, 0, "fila de triagem deve terminar sem Promise pendente");

  assert.ok(dispatched.some((event) => event.type === "grcon:analysis-diagnostic"), "diagnóstico interno deve ser emitido sem depender do console");
}

function testAnalyzeGuard() {
  const source = fs.readFileSync(path.join(rootDir, "analysis_runtime_guard.js"), "utf8");
  const documentListeners = new Map();
  const rootListeners = new Map();
  const observers = [];

  const mainButton = { id: "analyze", disabled: false };
  const sgparButton = { id: "sgpar-analyze", disabled: false };
  const toast = { id: "toast", textContent: "" };

  const documentMock = {
    readyState: "complete",
    addEventListener(type, handler, options) {
      const list = documentListeners.get(type) || [];
      list.push({ handler, options });
      documentListeners.set(type, list);
    },
    getElementById(id) {
      return id === "analyze" ? mainButton : id === "sgpar-analyze" ? sgparButton : id === "toast" ? toast : null;
    },
  };

  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; this.target = null; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() {}
  }

  const context = {
    console,
    document: documentMock,
    MutationObserver: FakeMutationObserver,
    performance,
    setTimeout,
    clearTimeout,
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init && init.detail; }
    },
    addEventListener(type, handler) {
      const list = rootListeners.get(type) || [];
      list.push(handler);
      rootListeners.set(type, list);
    },
    dispatchEvent() { return true; },
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "analysis_runtime_guard.js" });

  const guard = context.GrconAnalyzeRuntimeGuard;
  assert.ok(guard && guard.status().installed, "guard deve ser instalado uma única vez");
  const clickRegistration = (documentListeners.get("click") || [])[0];
  assert.ok(clickRegistration, "guard deve registrar captura do clique");
  assert.equal(clickRegistration.options, true, "proteção precisa atuar na fase de captura, antes de analyze()");

  const makeEvent = (button) => {
    const counters = { prevent: 0, stop: 0 };
    return {
      target: { closest(selector) { return selector === "button" ? button : null; } },
      isTrusted: true,
      preventDefault() { counters.prevent += 1; },
      stopImmediatePropagation() { counters.stop += 1; },
      counters,
    };
  };

  const first = makeEvent(mainButton);
  clickRegistration.handler(first);
  assert.equal(first.counters.prevent, 0, "primeiro clique precisa chegar ao analyze()");
  assert.equal(first.counters.stop, 0, "primeiro clique não pode ser bloqueado");
  assert.equal(guard.status().locked, true, "execução deve ficar protegida até terminar");

  const second = makeEvent(mainButton);
  clickRegistration.handler(second);
  assert.equal(second.counters.prevent, 1, "segundo clique concorrente deve ser bloqueado");
  assert.equal(second.counters.stop, 1, "segundo clique não pode alcançar listeners do botão");

  guard.releaseForTest();
  const third = makeEvent(mainButton);
  clickRegistration.handler(third);
  assert.equal(third.counters.prevent, 0, "nova análise deve funcionar depois da anterior terminar");
  guard.releaseForTest();

  const rejectionHandlers = rootListeners.get("unhandledrejection") || [];
  assert.equal(rejectionHandlers.length, 1, "diagnóstico de rejection externa deve ser único");
  let prevented = false;
  rejectionHandlers[0]({
    reason: {
      message: "The message port closed before a response was received.",
      stack: "Error: runtime.lastError\n    at chrome-extension://example/content.js:1:1",
    },
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, false, "erro comprovadamente externo deve ser diagnosticado, não suprimido globalmente");
  assert.equal(guard.status().locked, false, "erro de extensão não pode alterar o estado da análise");

  assert.ok(observers.some((observer) => observer.target === mainButton), "guard deve observar a transição real do estado busy");
}

function testStaticBoundaries() {
  const app = fs.readFileSync(path.join(rootDir, "app.js"), "utf8");
  const performanceWorkers = fs.readFileSync(path.join(rootDir, "performance_workers.js"), "utf8");
  const guard = fs.readFileSync(path.join(rootDir, "analysis_runtime_guard.js"), "utf8");
  const serviceWorkerRegistration = fs.readFileSync(path.join(rootDir, "grcon_service_worker.js"), "utf8");
  const serviceWorker = fs.readFileSync(path.join(rootDir, "sw.js"), "utf8");

  const analyzeBindings = app.match(/els\.analyze\.addEventListener\("click", analyze\);/g) || [];
  assert.equal(analyzeBindings.length, 1, "app.js deve registrar exatamente um listener que inicia analyze()");
  assert.match(app, /if \(!state\.analysisAt \|\| !state\.results\.length\)/, "geração deve continuar condicionada a análise documental válida");
  assert.match(app, /finally \{\s*setBusy\(false\);\s*updateInputMeta\(\);\s*\}/s, "analyze deve sempre restaurar o estado de UI");

  for (const [name, source] of [
    ["app.js", app],
    ["performance_workers.js", performanceWorkers],
    ["grcon_service_worker.js", serviceWorkerRegistration],
    ["sw.js", serviceWorker],
  ]) {
    assert.doesNotMatch(source, /\b(?:chrome|browser)\.runtime\b/, `${name} não pode depender da mensageria de extensões`);
  }
  assert.match(guard, /chrome\|moz\|edge\|safari-web-extension/, "guard pode reconhecer origem externa apenas para diagnóstico");
  assert.doesNotMatch(guard, /console\.clear\s*\(/, "correção não pode limpar o console");
  assert.doesNotMatch(guard, /message\.includes\(["']message port/i, "não pode existir filtro genérico por texto do erro");
}

(async () => {
  await testPerformanceWorkers();
  testAnalyzeGuard();
  testStaticBoundaries();
  console.log("OK — resiliência de analyze(): Worker terminal, isolamento de contexto, clique único e fronteira de extensão validados.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
