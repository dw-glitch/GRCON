const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(rootDir, "sigem_pw_history_postmerge.js"), "utf8");

const listeners = new Map();
const documentListeners = new Map();
let heavyActivations = 0;
let lightRefreshes = 0;
let recordCalls = 0;

const originalState = {
  ready: true,
  sourceSigem: [],
  sourcePw: [],
  comparisons: [],
  documentClass: "",
  selectedSnapshotId: "",
};

const root = {
  GrconSigemPwDashboardUi: {
    state: {
      sigem: { meta: { importedAt: "2026-09-10T10:00:00Z", fileName: "sigem.xlsx", recordCount: 20000 } },
      pw: { meta: { importedAt: "2026-09-10T10:05:00Z", fileName: "pw.csv", recordCount: 19000 } },
    },
  },
  GrconSigemPwHistory: { loadSnapshotChanges: async () => null },
  GrconSigemPwHistoryUi: {
    state: originalState,
    activate: async () => { heavyActivations += 1; },
    refresh: async () => { lightRefreshes += 1; },
    recordCurrent: async () => { recordCalls += 1; return { ok: true }; },
  },
  addEventListener(name, handler) { listeners.set(name, handler); },
};

const document = {
  addEventListener(name, handler, capture) { documentListeners.set(`${name}:${capture ? "capture" : "bubble"}`, handler); },
  getElementById() { return null; },
};

vm.runInNewContext(source, {
  window: root,
  document,
  Intl,
  Date,
  Number,
  String,
  Math,
  Object,
  Array,
  setTimeout,
  console,
});

assert.ok(root.GrconSigemPwHistoryPostMerge, "patch deve expor marcador de carregamento");
assert.equal(documentListeners.has("click:capture"), true, "detalhamento deve interceptar o clique antes do listener legado");

(async () => {
  await root.GrconSigemPwHistoryUi.activate();
  await root.GrconSigemPwHistoryUi.activate();
  assert.equal(heavyActivations, 1, "mesmas bases não devem recalcular o comparativo ao reabrir o dashboard");
  assert.equal(lightRefreshes, 1, "reabertura sem alteração deve apenas reler/renderizar o histórico");

  root.GrconSigemPwDashboardUi.state.pw.meta.importedAt = "2026-09-10T11:05:00Z";
  await root.GrconSigemPwHistoryUi.activate();
  assert.equal(heavyActivations, 2, "mudança real de base deve recalcular");

  await root.GrconSigemPwHistoryUi.recordCurrent("manual");
  assert.equal(recordCalls, 1, "recordCurrent original deve continuar acessível");

  assert.match(source, /metricFor\(snapshot\)/, "drawer deve calcular métricas pelo filtro selecionado");
  assert.match(source, /filterChanges\(rows\)/, "listas de mudanças devem respeitar a classe documental");
  assert.match(source, /documentClass === documentClass/, "filtro deve comparar explicitamente a classe documental");
  assert.match(source, /runtime\.lastBaseToken/, "patch deve manter token das bases da sessão");
  console.log("sigem_pw_history_postmerge: OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
