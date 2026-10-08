"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const source = fs.readFileSync(require("node:path").join(__dirname, "../src/react/sigem-pw/services/sharedSigemHistoryCompatibility.ts"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
(async () => {
  const current = { meta: { snapshotId: "current", referenceDate: "2026-10-07" }, records: [{ document: "CURRENT", revision: "0", status: "Emitido" }] };
  const rows = Array.from({ length: 2501 }, (_, i) => ({ document: `DOC-${i}`, revision: "0", status: "Emitido" }));
  const versions = [{ snapshot_id: "old", record_count: rows.length, metadata: { referenceDate: "2026-10-01" }, file_name: "Anterior.xlsx" }];
  const calls = [], events = [], projections = [];
  let switchWorkspace = false, incomplete = false;
  const oldState = { shared: current }, refresh = async () => current;
  const original = Object.freeze({ state: oldState, current: () => current, refresh, setReferenceDate: async value => { current.meta.referenceDate = value; return current; } });
  const window = { GrconSharedSigemQuery: original, dispatchEvent: event => events.push(event),
    GrconCloud: { state: { online: true, membership: { workspace_id: "one", role: "owner" }, client: { rpc: async (name, args) => {
      calls.push({ name, args });
      if (switchWorkspace) window.GrconCloud.state.membership.workspace_id = "two";
      if (name.endsWith("versions")) return { data: versions };
      if (name.endsWith("page")) return { data: incomplete ? [] : rows.slice(args.after_row, args.after_row + 1000).map((payload, i) => ({ row_number: args.after_row + i + 1, payload })) };
      if (name.endsWith("set_date")) { versions[0].metadata.referenceDate = args.reference_date; return { data: versions[0].metadata }; }
      if (name.endsWith("activate")) return { data: args.target_snapshot };
      if (name.endsWith("delete")) return { data: { removedSnapshotId: args.target_snapshot, removedWasCurrent: false, activeSnapshotId: "current" } };
      throw new Error(name);
    } } } },
    GrconSigemPwDashboard: { updateSnapshotMetadata: async (...args) => projections.push(args) },
    GrconSigemPwHistory: { contentFingerprint: () => "old-content", updateSourceSnapshotDate: async (...args) => projections.push(args) },
  };
  const sandbox = { exports: {}, window, setTimeout, clearTimeout, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } };
  vm.runInNewContext(js, sandbox);
  const ensure = sandbox.exports.ensureSharedSigemHistoryCompatibility;
  const api = ensure();
  assert.equal(api.state, oldState); assert.equal(api.refresh, refresh); assert.equal(api.current(), current);
  assert.equal(ensure(), api, "upgrade is idempotent");
  assert.equal((await api.listVersions()).length, 1);
  const base = await api.loadSnapshot("old");
  assert.equal(base.records.length, 2501); assert.equal(base.meta.snapshotId, "old");
  assert.equal(calls.filter(c => c.name.endsWith("page")).length, 3, "history is paginated");
  await api.loadSnapshot("old");
  assert.equal(calls.filter(c => c.name.endsWith("page")).length, 3, "payload is reused");
  assert.equal(api.current(), current, "historical analysis never changes official source");
  await api.setReferenceDate("2026-09-30", "old");
  assert.equal(current.meta.referenceDate, "2026-10-07", "old API cannot redirect historical date to current base");
  assert.equal(versions[0].metadata.referenceDate, "2026-09-30"); assert.equal(projections.length, 2); assert.equal(events.length, 1);
  assert.equal(api.canManageHistory(), true);
  await api.activateVersion("old");
  assert.ok(calls.some(c => c.name.endsWith("activate") && c.args.target_snapshot === "old"));
  const deletion = await api.deleteVersion("old");
  assert.equal(deletion.activeSnapshotId, "current");
  assert.ok(calls.some(c => c.name.endsWith("delete") && c.args.target_snapshot === "old"));
  assert.equal(events.filter(event => event.type === "grcon:shared-sigem-metadata-invalidated").length, 2);
  await assert.rejects(api.loadSnapshot("deleted"), /excluída/);
  window.GrconCloud.state.membership.role = "viewer";
  assert.equal(api.canManageHistory(), false);
  await assert.rejects(api.setReferenceDate("2026-09-29", "old"), /permissão/);
  await assert.rejects(api.activateVersion("old"), /proprietário/);
  await assert.rejects(api.deleteVersion("old"), /proprietário/);
  window.GrconCloud.state.membership.role = "owner";
  versions[0].metadata.referenceDate = "2026-09-28"; incomplete = true;
  await api.listVersions();
  await assert.rejects(api.loadSnapshot("old"), /incompletos/);
  incomplete = false; switchWorkspace = true;
  await assert.rejects(api.listVersions(), /contrato mudou/);
  const modern = Object.freeze({ listVersions() {}, loadSnapshot() {}, activateVersion() {}, deleteVersion() {} });
  window.GrconSharedSigemQuery = modern;
  assert.equal(ensure(), modern, "modern implementation is untouched");
  window.GrconSharedSigemQuery = undefined; assert.equal(ensure(), undefined);
  console.log("shared_sigem_history_compatibility: old/new API, pagination, cache invalidation, historical identity/date, activate/delete, permissions, incomplete data and contract isolation OK");
})().catch(error => { console.error(error); process.exitCode = 1; });
