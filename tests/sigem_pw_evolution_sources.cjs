"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.join(__dirname, "..");
const exportsByFile = new Map();
function load(file, window, document) {
  const full = path.resolve(file);
  if (exportsByFile.has(full)) return exportsByFile.get(full);
  const source = fs.readFileSync(full, "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  exportsByFile.set(full, exports);
  vm.runInNewContext(code, { exports, window, document, console, performance, Error, setTimeout, clearTimeout,
    require: name => load(path.resolve(path.dirname(full), name + ".ts"), window, document) }, { filename: full });
  return exports;
}

(async () => {
  const Dashboard = require("../sigem_pw_dashboard_core.js");
  const Evolution = require("../sigem_pw_evolution_core.js");
  const record = n => ({ document: `C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-${n}`, revision: "0", status: "Postado", lastEmission: "SIM" });
  const base = (kind, id, day, records) => ({ meta: { kind, snapshotId: id, importedAt: `2026-10-${day}T12:00:00Z`, fileName: `${id}.xlsx` }, records });
  let history = { version: 3, snapshots: [base("sigem", "s1", "01", [record(1)]), base("sigem", "s2", "02", [record(1), record(2)]),
    base("pw", "p1", "01", [record(1)]), base("pw", "p2", "02", [record(1), record(2)])] };
  const persisted = new Map();
  const listeners = new Map();
  const window = { setTimeout, clearTimeout, sessionStorage: { getItem: () => null, setItem() {} },
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
    GrconSigemPwEvolution: Evolution,
    GrconSigemPwDashboard: { loadHistory: async () => history },
    GrconSigemPwHistory: { contentFingerprint: (system, records) => `${system}-${records.length}`, STORES: { meta: "meta" },
      listSourceSnapshots: async () => [], openDb: async () => ({ close() {}, transaction: () => {
        const tx = { objectStore: () => ({ keyPath: "key", get(key) {
          const req = {}; queueMicrotask(() => { req.result = persisted.get(key); req.onsuccess(); }); return req;
        }, put(row) { persisted.set(row.key, row); } }) };
        setTimeout(() => tx.oncomplete?.(), 0); return tx;
      } }) },
    GrconSigemPwDashboardUi: { state: { ld: { meta: null, records: [] } } },
    GrconCloud: { state: { user: { id: "user1" }, online: false, membership: { workspace_id: "one" } } },
  };
  const document = { getElementById: () => null, documentElement: { dataset: {} } };
  const { sigemPwEvolutionAdapter: adapter } = load(path.join(root, "src/react/sigem-pw/evolution/services/sigemPwEvolutionAdapter.ts"), window, document);
  await adapter.activate();
  assert.equal(adapter.state.sigem.length, 2, "missing LD must not erase saved SIGEM bases");
  assert.equal(adapter.state.pw.length, 2, "full Dashboard PW history must be visible without legacy source payloads");
  assert.equal(adapter.state.comparison, null, "missing LD must not yield invented zero counts");
  assert.ok(adapter.state.sigem.every(item => item.unavailableReason));
  window.GrconSigemPwDashboardUi.state.ld = { meta: { snapshotId: "ld" }, records: [{ document: "RL-5290.00-22313-ABC-C1O-001", revision: "0" }] };
  await adapter.refresh(true);
  assert.equal(adapter.state.selections.sigemPrev, "s1"); assert.equal(adapter.state.selections.pwPrev, "p1");
  assert.equal(adapter.state.comparison.sigem.added.length, 1);
  adapter.setSelection("pwCurrent", "p1"); await adapter.refresh();
  assert.equal(adapter.state.selections.pwCurrent, "p1", "refresh preserves selected history");

  let loads = 0, fail = false;
  let versions = [{ snapshot_id: "remote1", file_name: "Consulta anterior.xlsx", record_count: 1, version: 1,
    published_at: "2026-10-04T12:00:00Z", metadata: { referenceDate: "2026-09-30" } },
    { snapshot_id: "remote2", file_name: "Consulta atual.xlsx", record_count: 2, version: 2,
      published_at: "2026-10-05T12:00:00Z", metadata: {} }];
  window.GrconSharedSigemQuery = { listVersions: async () => versions, activateVersion() {}, deleteVersion() {}, loadSnapshot: async (id, supplied) => {
    assert.equal(supplied, versions, "reuse one authorized version catalogue"); loads++;
    if (fail) throw new Error("Banco temporariamente indisponível");
    return base("sigem", id, "05", id === "remote1" ? [record(1)] : [record(1), record(2)]);
  } };
  window.GrconCloud.state.online = true;
  await adapter.refresh();
  assert.equal(adapter.state.sigem.length, 4); assert.equal(loads, 2);
  assert.equal(adapter.state.sigem.find(item => item.id === "remote1").importedAt, "2026-09-30T12:00:00.000Z", "operational date governs ordering");
  await adapter.refresh(); assert.equal(loads, 2, "prepared snapshots avoid repetitive remote reads");
  versions = [...versions, { ...versions[1], snapshot_id: "remote3", version: 3 }]; fail = true;
  await adapter.refresh();
  assert.match(adapter.state.error, /temporariamente/);
  assert.ok(adapter.state.sigem.find(item => item.id === "remote3").unavailableReason, "failure is visible, not disappearance");
  assert.equal(adapter.state.pw.length, 2, "SIGEM failure must preserve PW sources");
  fail = false; await adapter.refresh();
  assert.equal(adapter.state.sigem.find(item => item.id === "remote3").unavailableReason, undefined, "retry recovers historical source");
  window.GrconSigemPwHistory.listSourceSnapshots = async system => system === "sigem" ? [{ id: "legacy-shared", importedAt: "2026-09-29T12:00:00Z" }] : [];
  persisted.set("sourcePayload:legacy-shared", { value: { ...base("sigem", "remote1", "01", [record(1)]), snapshotId: "legacy-shared",
    meta: { source: "shared-general-query", snapshotId: "remote1" } } });
  await adapter.refresh();
  assert.equal(adapter.state.sigem.length, 5, "raw shared payload does not create a second version");
  assert.equal(adapter.state.sigem.some(item => item.id === "legacy-shared"), false);
  versions = versions.filter(item => item.snapshot_id !== "remote1");
  await adapter.refresh();
  assert.equal(adapter.state.sigem.some(item => item.id === "remote1" || item.id === "legacy-shared"), false,
    "an excluded shared version stays excluded even when its raw local payload survives");

  const { buildEvolutionSourceCatalog } = load(path.join(root, "src/react/sigem-pw/evolution/services/evolutionSourceCatalog.ts"), window, document);
  const projected = base("sigem", "remote1", "01", [record(1)]);
  projected.meta.source = "shared-general-query"; projected.meta.historySourceSnapshotId = "legacy";
  const catalog = buildEvolutionSourceCatalog({ sigem: [{ id: "legacy" }], pw: [] }, { version: 3, snapshots: [projected] }, [{ ...versions[0], snapshot_id: "remote1" }], () => "fp");
  assert.equal(catalog.metadata.sigem.length, 1, "one import cannot become two versions from duplicate projections");
  assert.equal(catalog.aliases.get("legacy"), "remote1");
  assert.equal(buildEvolutionSourceCatalog({ sigem: [{ id: "legacy" }], pw: [] }, { version: 3, snapshots: [projected] }, [], () => "fp").metadata.sigem.length, 0,
    "deleted shared version cannot be resurrected from its local projection");

  const unsubscribe = adapter.subscribeExternalEvents();
  assert.ok(listeners.has("grcon:shared-sigem-updated")); assert.ok(listeners.has("grcon:shared-sigem-metadata-invalidated"));
  let resolveVersions; window.GrconSharedSigemQuery.listVersions = () => new Promise(resolve => { resolveVersions = resolve; });
  const pending = adapter.refresh();
  while (!resolveVersions) await new Promise(resolve => setTimeout(resolve, 0));
  window.GrconCloud.state.membership.workspace_id = "two";
  listeners.get("grcon:contract-context-changed")();
  resolveVersions(versions); await pending;
  assert.equal(adapter.state.sigem.length, 0, "old contract response cannot repopulate the list");
  unsubscribe();
  console.log("sigem_pw_evolution_sources: full/local/shared histories, missing LD, duplicates, dates, cache, retry, selection and contract race OK");
})().catch(error => { console.error(error); process.exitCode = 1; });
