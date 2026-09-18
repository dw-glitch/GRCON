const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");

function loadAdapter(windowOverrides = {}) {
  const source = fs.readFileSync(path.join(root, "src/react/historico-analises/services/historicoAnalisesAdapter.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: "historicoAnalisesAdapter.ts",
  }).outputText;
  const testModule = { exports: {} };
  const listeners = new Map();
  const windowMock = {
    setTimeout,
    clearTimeout,
    alert: () => {},
    confirm: () => true,
    prompt: () => "Meu filtro",
    addEventListener(type, handler) {
      const list = listeners.get(type) || [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      listeners.set(type, (listeners.get(type) || []).filter((item) => item !== handler));
    },
    dispatchEvent(event) {
      for (const handler of listeners.get(event.type) || []) handler(event);
      return true;
    },
    ...windowOverrides,
  };
  const documentMock = {
    body: { appendChild() {} },
    createElement() {
      return { click() {}, remove() {}, set href(_v) {}, set download(_v) {} };
    },
    getElementById() { return null; },
  };
  const sandbox = {
    module: testModule,
    exports: testModule.exports,
    require,
    console,
    window: windowMock,
    document: documentMock,
    navigator: {},
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    Blob,
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    },
    Event: class Event { constructor(type) { this.type = type; } },
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(compiled, sandbox, { filename: "historicoAnalisesAdapter.test.cjs" });
  return { adapter: testModule.exports.historicoAnalisesAdapter, windowMock, listeners };
}

(async () => {
  const queryCalls = [];
  const documents = [
    {
      id: "doc-1", sessionId: "s1", document: "DOC-A", analyzedAt: "2026-09-18T10:00:00.000Z",
      statusDelivered: "Será incluído na eGRDT", sigemStatus: "Postado", allocationStatus: "Alocado",
      targetRevision: "B",
    },
    {
      id: "doc-2", sessionId: "s1", document: "DOC-B", analyzedAt: "2026-09-18T11:00:00.000Z",
      statusDelivered: "Precisa de conferência", sigemStatus: "Recusado", allocationStatus: "Não alocado",
      targetRevision: "C",
    },
  ];
  const core = {
    norm: (value) => String(value == null ? "" : value).trim().toUpperCase(),
    statusKey: (value) => String(value).includes("incluído") ? "READY" : "REVIEW",
    listSessions: async () => [{ id: "s1", analyzedAt: "2026-09-18T10:00:00.000Z", dateKey: "2026-09-18", total: 2 }],
    queryDocuments: async (filters, options) => {
      queryCalls.push({ filters, options });
      return { rows: documents, total: 2, counts: { READY: 1, REVIEW: 1 }, sessionIds: ["s1"] };
    },
    allDocuments: async () => documents,
    deleteSession: async () => true,
    clearAll: async () => true,
    exportBackup: async () => ({ schema: "grcon.analysis.history.backup.v1", sessions: [], documents: [] }),
    importBackup: async () => ({ sessions: 1, documents: 2 }),
    storageEstimate: async () => ({ usage: 1024, quota: 2048 }),
  };
  const history = [{
    id: "h1", egrdtNumber: "EGRDT-001", outputType: "PDF", documentCount: 1,
    files: [{ document: "DOC-A", revision: "A" }],
  }];
  const saved = [{ id: "f1", name: "Pendências", filter: { status: "REVIEW" } }];
  let confirmCalled = 0;
  let auditCalled = 0;
  const { adapter } = loadAdapter({
    GrconAnalysisHistory: core,
    GrconAnalysisHistoryReport: {
      buildWorkbook: async () => new ArrayBuffer(2),
      downloadName: () => "history.xlsx",
    },
    GrconHistory: { read: () => history },
    GrconMacro5Flow: {
      readSavedAnalysisFilters: () => saved,
      normalizeAnalysisFilter: (value) => value,
      saveAnalysisFilter: (name, filter) => ({ saved: true, item: { id: "f2", name, filter } }),
      deleteAnalysisFilter() {},
      analysisTimeline: (items) => items,
      relatedEgrdt: () => history[0],
    },
    GrconEnhancements: { confirmAction: async () => { confirmCalled += 1; return true; } },
    GrconAuditLog: { log: () => { auditCalled += 1; } },
    GRCONModuleLoader: { ensure: async () => {}, ensureModule: async () => {} },
  });

  const filters = { query: "", status: "ALL", startDate: "", endDate: "", sessionId: "" };
  const page = await adapter.queryDocuments(filters, 2, 200);
  assert.equal(page.total, 2);
  assert.equal(queryCalls.length, 1);
  assert.equal(queryCalls[0].options.offset, 200);
  assert.equal(queryCalls[0].options.limit, 200);

  assert.equal(await adapter.storageLabel(), "Armazenamento local usado pelo navegador: 1.0 KB de 2.0 KB disponíveis.");
  assert.deepEqual(adapter.readSavedFilters(), saved);
  assert.equal(adapter.saveFilter("Teste", filters).saved, true);

  const unified = await adapter.unifiedSearch("DOC-A");
  assert.equal(unified.historyCount, 1);
  assert.equal(unified.analysisCount, 1);
  assert.equal(unified.historyMatches[0].egrdtNumber, "EGRDT-001");
  assert.equal(unified.analysisMatches[0].document, "DOC-A");

  const detail = await adapter.detailContext(documents[0]);
  assert.equal(detail.related.id, "h1");
  assert.equal(detail.timeline.length, 2);

  assert.equal(await adapter.confirmClearHistory(), true);
  assert.equal(confirmCalled, 1);
  adapter.auditClearHistory();
  assert.equal(auditCalled, 1);

  const components = fs.readFileSync(path.join(root, "src/react/historico-analises/components/HistoricoAnalisesComponents.tsx"), "utf8");
  for (const text of [
    "Fazer backup", "Restaurar backup", "Excluir análise selecionada", "Limpar todo o histórico",
    "Busca geral", "Situação entregue", "Data inicial", "Data final", "Análise executada",
    "Hoje", "Últimos 7 dias", "Pendências", "Incluídos", "Salvar filtro atual", "Excluir filtro",
    "Analisado em", "Documento", "Revisão atual", "Próxima revisão", "Resultado GRCON",
    "SIGEM", "Alocação", "LD", "Motivo", "Baixar relatório",
    "Decisão desta análise", "Evidência e motivo", "Linha do tempo deste documento", "eGRDT relacionada",
    "Abrir eGRDT no histórico", "Preparar no SIGEM",
  ]) {
    assert.ok(components.includes(text), "UI React precisa preservar: " + text);
  }
  for (const id of [
    "analysis-history-search", "analysis-history-status", "analysis-history-start", "analysis-history-end",
    "analysis-history-session", "analysis-history-export", "analysis-history-clear",
    "analysis-history-delete-session", "analysis-history-backup", "analysis-history-restore",
    "analysis-history-result-count", "analysis-history-page-status", "analysis-history-previous",
    "analysis-history-next", "analysis-history-storage", "analysis-history-detail",
    "unified-search-text", "unified-search-btn", "unified-search-clear",
  ]) {
    assert.ok(components.includes(id), "ID de compatibilidade ausente: " + id);
  }

  const hook = fs.readFileSync(path.join(root, "src/react/historico-analises/hooks/useHistoricoAnalises.ts"), "utf8");
  assert.match(hook, /const PAGE_SIZE = 200/);
  assert.match(hook, /useDebouncedValue\(filters\.query, 300\)/);
  assert.match(hook, /Adapter\.subscribeUpdates/);
  assert.match(hook, /Adapter\.subscribeOpenDetail/);
  assert.match(hook, /Adapter\.confirmClearHistory/);
  assert.match(hook, /Adapter\.dispatchUpdated/);

  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const start = index.indexOf('id="analysis-history-module"');
  const end = index.indexOf('id="history-module"', start);
  const historyHtml = index.slice(start, end);
  assert.match(historyHtml, /id="grcon-analysis-history-root"/);
  assert.doesNotMatch(historyHtml, /id="analysis-history-body"/, "HTML legado não deve competir com React");

  const loader = fs.readFileSync(path.join(root, "grcon_module_loader.js"), "utf8");
  const groupStart = loader.indexOf('"analysis-history": [');
  const groupEnd = loader.indexOf("],", groupStart);
  const group = loader.slice(groupStart, groupEnd);
  assert.match(group, /analysis_history_core\.js/);
  assert.match(group, /analysis_history_report\.js/);
  assert.match(group, /react-dist\/historico-analises-app\.js/);
  assert.doesNotMatch(group, /analysis_history_app\.js/);

  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.match(sw, /react-dist\/historico-analises-app\.js/);
  assert.match(sw, /phase-a-history-react1/);
  assert.doesNotMatch(sw, /"analysis_history_app\.js"/);

  const vite = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");
  assert.match(vite, /historico-analises-app\.js/);
  assert.match(vite, /process\.env\.NODE_ENV/);

  const checklist = fs.readFileSync(path.join(root, "docs/react-phase-a-history-parity.md"), "utf8");
  assert.match(checklist, /Checklist de paridade/);
  assert.match(checklist, /Critério de remoção do legado/);

  console.log("historico_analises_react: OK — adapter, contratos, UI, loader, PWA e checklist validados.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
