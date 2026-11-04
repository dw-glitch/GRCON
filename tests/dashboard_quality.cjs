const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function loadDashboardModule() {
  const noop = () => {};
  const documentStub = {
    readyState: "loading",
    addEventListener: noop,
    documentElement: { dataset: {} },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {},
      dataset: {},
      setAttribute: noop,
      appendChild: noop,
      classList: { add: noop, remove: noop, toggle: noop },
    }),
    body: { classList: { add: noop, remove: noop, toggle: () => false } },
  };
  const storage = new Map();
  const windowStub = {
    document: documentStub,
    setTimeout,
    clearTimeout,
    console,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  };
  windowStub.window = windowStub;
  const context = vm.createContext(windowStub);
  context.document = documentStub;
  vm.runInContext(fs.readFileSync(path.join(root, "retomar.js"), "utf8"), context);
  return context.GrconHistoryDashboard._debug;
}

const debug = loadDashboardModule();
const Q = debug.buildProcessQuality;
const plain = (value) => JSON.parse(JSON.stringify(value));
assert.equal(typeof Q, "function");

const file = (document, extra = {}) => ({ document, discipline: "CIVIL", ...extra });
const records = [
  { generatedAt: "2026-10-10T12:00:00Z", files: [
    // mesmo documento em dois arquivos (PDF + nativo): conta UMA vez
    file("DOC-A", { historyClassification: { emissionKind: "FIRST_POSTING" } }),
    file("DOC-A", { historyClassification: { emissionKind: "FIRST_POSTING" } }),
    file("DOC-B", { discipline: "MECANICA", historyClassification: { emissionKind: "REPOST" }, manualRevisionOverride: true }),
    file("DOC-C", { discipline: "", manualRuleOverride: true, manualSigemSelectionAt: "2026-10-10T11:00:00Z" }),
  ] },
  { generatedAt: "2026-10-11T12:00:00Z", files: [
    // o mesmo documento em OUTRA eGRDT é outra emissão
    file("DOC-A", { historyClassification: { emissionKind: "NEW_REVISION" }, revisionManual: true }),
    file("DOC-D", { discipline: "MECANICA", manualCompositionOverride: true }),
  ] },
];
const q = Q(records);
assert.equal(q.documents, 5, "A(1) B C + A(2) D: documento conta uma vez por eGRDT");
assert.equal(q.classified, 3, "só A, B e A(2) trazem tipo de emissão");
assert.equal(Math.round(q.classifiedShare * 100), 60);
assert.deepEqual(plain(q.kinds), { FIRST_POSTING: 1, NEW_REVISION: 1, REPOST: 1 });
assert.equal(q.interventions.revision, 2, "B (manualRevisionOverride) e A(2) (revisionManual)");
assert.equal(q.interventions.rule, 1);
assert.equal(q.interventions.status, 1);
assert.equal(q.interventions.composition, 1);
assert.equal(q.withIntervention, 4, "B, C, A(2), D; DOC-C soma duas intervenções mas conta um documento");
assert.equal(Math.round(q.interventionShare * 100), 80);
assert.deepEqual(plain(q.disciplines.map((d) => [d.name, d.count])), [["CIVIL", 2], ["MECANICA", 2], ["Não informada", 1]]);

const empty = Q([]);
assert.equal(empty.documents, 0);
assert.equal(empty.interventionShare, 0, "sem documentos não pode dividir por zero");
assert.equal(empty.classifiedShare, 0);
assert.deepEqual(plain(Q([{ generatedAt: "2026-10-10T12:00:00Z", files: [] }]).disciplines), []);
assert.equal(Q([{ files: [{ discipline: "CIVIL" }] }]).documents, 0, "arquivo sem identificação do documento é ignorado");

console.log("OK — Dashboard, aba Qualidade do processo: tipo de emissão com cobertura, intervenções manuais e disciplinas, por documento e por eGRDT.");
