const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(rootDir, name), "utf8");
const Dashboard = require("../sigem_pw_dashboard_core.js");
const Conference = require("../posting_conference_core.js");
const History = require("../sigem_pw_history_core.js");
const dashboardApp = read("sigem_pw_dashboard_app.js");
const historyCore = read("sigem_pw_history_core.js");
const conferenceCore = read("posting_conference_core.js");

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `função ${name} deve existir`);
  return source.slice(start, end);
}

(function sharedKvStoreSupportsBothSchemas() {
  const payload = { meta: { fileName: "base.xlsx" }, records: [{ document: "DOC-1" }] };
  assert.deepEqual(Dashboard.storedValue({ key: "current-base", value: payload }, null), payload);
  assert.deepEqual(Conference.storedValue(payload, null), payload);

  let inline = null;
  Dashboard.putKv({ keyPath: "key", put(value) { inline = value; } }, "base", payload);
  assert.deepEqual(inline, { key: "base", value: payload });

  let outOfLine = null;
  Conference.putKv({ keyPath: null, put(value, key) { outOfLine = { value, key }; } }, "base", payload);
  assert.deepEqual(outOfLine, { value: payload, key: "base" });
})();

(function consultationIsPreparedWithoutEarlyWrite() {
  const sigem = functionBody(dashboardApp, "importSigem", "parsePwFile");
  assert.match(sigem, /Conference\.prepareWorkbookImport/);
  assert.doesNotMatch(sigem, /Conference\.importWorkbook/);
  assert.ok(sigem.indexOf("prepareWorkbookImport") < sigem.indexOf("registerHistoryBeforeActivation"));
  assert.ok(sigem.indexOf("registerHistoryBeforeActivation") < sigem.indexOf("Core.saveSigemBase"));
  assert.ok(sigem.indexOf("Core.saveSigemBase") < sigem.indexOf("Conference.commitPreparedImport"));
  assert.match(conferenceCore, /await kvSetMany\(\[\s*\[BASE_KEY, prepared\.base\],\s*\[STATE_KEY, prepared\.state\],\s*\[AUDIT_KEY, prepared\.audit\]/);
})();

(function rollbackTokenOnlyContainsCreatedSnapshots() {
  const checkpoint = { workingSets: [{ key: "latest:sigem", snapshotId: "old", documents: [] }] };
  const token = History.rollbackToken({
    sigem: { created: true, snapshot: { id: "sigem:new" } },
    pw: { created: false, snapshot: { id: "pw:existing" } },
    comparison: { created: true, snapshot: { id: "comparison:new" } },
  }, checkpoint);
  assert.deepEqual(token.sourceSnapshotIds, ["sigem:new"]);
  assert.deepEqual(token.comparisonSnapshotIds, ["comparison:new"]);
  assert.deepEqual(token.workingSets, checkpoint.workingSets);
})();

(function everyActivationHasRestorationPath() {
  const register = functionBody(dashboardApp, "registerHistoryBeforeActivation", "importSigem");
  const sigem = functionBody(dashboardApp, "importSigem", "parsePwFile");
  const pw = functionBody(dashboardApp, "importPw", "importLd");
  const ld = functionBody(dashboardApp, "importLd", "rebuildModel");
  assert.match(register, /History\.rollbackRecordedActiveBases\(recorded\)/);
  [sigem, pw, ld].forEach((body) => assert.match(body, /rollbackStagedImport\(recorded/));
  assert.match(historyCore, /const checkpoint = await captureRecordingCheckpoint\(\)/);
  assert.match(historyCore, /await rollbackRecordedActiveBases\(partial\)/);
  assert.match(historyCore, /meta\.delete\(`sourcePayload:\$\{id\}`\)/);
})();

(function previousBasesAreClearedExactlyOnce() {
  const reset = functionBody(dashboardApp, "clearPreStage7BasesOnce", "refreshBases");
  const refresh = functionBody(dashboardApp, "refreshBases", "activate");
  [
    "Core.SIGEM_BASE_KEY",
    "Core.PW_BASE_KEY",
    "Core.LD_BASE_KEY",
    "Core.HISTORY_KEY",
    "Core.LEGACY_SIGEM_BASE_KEY",
    "Core.LEGACY_PW_BASE_KEY",
  ].forEach((key) => assert.match(reset, new RegExp(key.replace(".", "\\."))));
  assert.match(reset, /History\.clearHistory\(\)/);
  assert.match(reset, /PRE_STAGE7_RESET_KEY/);
  assert.ok(refresh.indexOf("clearPreStage7BasesOnce") < refresh.indexOf("Core.loadBases"));
  assert.doesNotMatch(dashboardApp, /indexedDB\.deleteDatabase/);
})();

(function businessScopeRemainsUnchanged() {
  assert.deepEqual(Dashboard.SCOPE_CLASSES, ["ET", "N-1710"]);
  assert.match(Dashboard.EMISSION_RULE, /código \+ revisão/i);
  assert.match(Dashboard.EMISSION_RULE, /0 e A.*duas entradas/i);
})();

console.log("sigem_pw_stage7_atomic_import: OK — preparação, persistência compartilhada e rollback integral validados.");
