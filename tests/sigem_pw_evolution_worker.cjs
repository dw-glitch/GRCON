"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Evo = require("../sigem_pw_evolution_core.js");
const root = path.resolve(__dirname, "..");
let receive;
let response;
const sandbox = {
  console,
  addEventListener(type, handler) { if (type === "message") receive = handler; },
  postMessage(value) { response = JSON.parse(JSON.stringify(value)); },
};
sandbox.self = sandbox;
const context = vm.createContext(sandbox);
sandbox.importScripts = (...files) => files.forEach(file => vm.runInContext(
  fs.readFileSync(path.resolve(root, "workers", file), "utf8"), context, { filename: file },
));
vm.runInContext(fs.readFileSync(path.join(root, "workers/sigem_pw_evolution.worker.js"), "utf8"), context);
const doc = "C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-123456";
const outOfScope = "CE-1234.00-22313-856-C1O-001";
const quality = [{ document: "CE-5290.00-22313-856-C1O-001", discipline: "QUA" }, { document: outOfScope }];
const universe = Evo.buildLdUniverse([], [], { qualityRecords: quality });
const workerUniverse = vm.runInContext("GrconSigemPwEvolution.buildLdUniverse([], [], {qualityRecords:" + JSON.stringify(quality) + "})", context);
const makeBase = (records, importedAt) => ({ meta: { fileName: "fixture.csv", importedAt, sourceRowCount: records.length }, records });
const before = makeBase([{ document: doc, revision: "0", lastEmission: "Previsto" }], "2026-10-01T12:00:00Z");
const after = makeBase([
  { document: doc.replace("_PI-", "_nt-PI-"), revision: "0", lastEmission: "Sim", sourceRow: 2 },
  { document: doc.replaceAll("_", "-"), revision: "0", lastEmission: "Previsto", sourceRow: 3 },
  { document: quality[0].document, revision: "A", lastEmission: "Não", sourceRow: 4 },
  { document: outOfScope, revision: "0", lastEmission: "Sim", sourceRow: 5 },
], "2026-10-05T12:00:00Z");
const prepared = [before, after].map((base, i) => {
  const options = { snapshotId: "fixture-" + i };
  receive({ data: { type: "evolution-snapshot", requestId: i, system: "pw", base, universe: workerUniverse, options } });
  assert.equal(response.ok, true);
  assert.equal(response.requestId, i);
  const expected = JSON.parse(JSON.stringify(Evo.buildSnapshot("pw", base, universe, options)));
  assert.deepEqual(response.snapshot, expected, "worker and main thread must use identical identity, scope and emission rules");
  return expected;
});
assert.equal(prepared[1].audit.scopeDiscardedRecords, 1);
assert.equal(prepared[1].audit.emittedDocumentRevisionRecords, 2);
receive({ data: { type: "evolution-timeline", requestId: 10, sigem: [], pw: prepared } });
assert.equal(response.ok, true);
assert.equal(response.type, "evolution-timeline");
assert.deepEqual(response.timeline, Evo.buildDailyTimeline([], prepared));
console.log("sigem_pw_evolution_worker: snapshot/timeline parity, nt-, scope and emissions OK.");
