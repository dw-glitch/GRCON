"use strict";
const assert = require("node:assert/strict");
const Core = require("../sigem_pw_dashboard_core.js");
const Scope = require("../sigem_pw_scope_fix.js");
const Revision = require("../sigem_pw_revision_core.js");
const Evolution = require("../sigem_pw_evolution_core.js");

const code = (n, origin = "C1O") => `PR-5290.00-22313-955-${origin}-${n}`;
const sigem = [
  { document: code("121"), revision: "0", status: "Postado" },
  { document: code("121"), revision: "A", status: "Postado" },
  { document: code("122"), revision: "0", status: "Postado" },
  { document: code("122", "C10"), revision: "0", status: "Postado" },
  { document: code("123", "C2O"), revision: "0", title: "C1O no título" },
  { document: code("124", "OUT"), revision: "0", status: "Postado" },
];
const pw = [
  { document: code("121"), revision: "0", lastEmission: "Sim" },
  { document: code("121"), revision: "A", lastEmission: "Previsto" },
  { document: code("121"), revision: "A", lastEmission: "Previsto", sourceRow: 9 },
  { document: code("122"), revision: "0", lastEmission: "Previsto" },
  { document: code("122", "C10"), revision: "0", lastEmission: "Sim" },
  { document: code("125", "C2O"), revision: "A", lastEmission: "Sim" },
];

assert.equal(Core.isC1OCode("pr-5290.00-22313-955-c1o-121"), true);
assert.equal(Core.isC1OCode("C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-121"), true);
assert.equal(Core.isC1OCode(code("121", "C10")), false, "zero não é letra O");
assert.equal(Core.isC1OCode(code("121", "C2O")), false);
assert.equal(Core.isC1OCode(""), false);
assert.equal(Core.isC1OCode(code("125", "OUT")), false);
const segregatedSigem = Core.partitionC1ORecords(sigem);
const segregatedPw = Core.partitionC1ORecords(pw);
assert.equal(segregatedSigem.eligible.length, 3);
assert.equal(segregatedSigem.outOfScope.length, 3);
assert.equal(segregatedPw.eligible.length, 4);
assert.equal(segregatedPw.outOfScope.length, 2);
assert.equal(Scope.scopeAudit(pw).excludedCount, 2);
const model = Scope.createModel(sigem, pw, []);
assert.equal(model.comparisonScope.sigemAccepted, 3);
assert.equal(model.comparisonScope.pwAccepted, 4);
assert.equal(model.comparisonScope.sigemOutOfScope, 3);
assert.equal(model.comparisonScope.pwOutOfScope, 2);
assert.ok(model.normalizedSigem.every((row) => Core.isC1OCode(row.document)));
assert.ok(model.normalizedPw.every((row) => Core.isC1OCode(row.document)));
const result = Scope.aggregateModel(model, {}, { revisionScope: "all" });
assert.equal(result.summary.sigem, 3);
assert.equal(result.summary.pwRegistered, 3);
assert.equal(result.summary.pwEmitted, 1);
assert.equal(result.summary.bothNotEmitted, 2, "Previsto permanece cadastrado e não emitido");
assert.equal(result.summary.bothEmitted, 1);
assert.equal(result.summary.pwExclusive, 0, "códigos excluídos não criam lacunas falsas");
assert.equal(result.quality.pwDuplicateExtraRows, 1);
assert.ok(result.lists.all.every((row) => Core.isC1OCode(row.document)));
assert.notEqual(Core.documentIdentity(code("121")).key, Core.documentIdentity(code("122")).key);
const revision = Revision.analyze(model);
assert.ok(revision.rows.every((row) => Core.isC1OCode(row.document)));
const universe = Evolution.buildLdUniverse([], []);
const historical = Evolution.buildSnapshot("pw", {
  meta: { fileName: "pw.csv", importedAt: "2026-10-23T12:00:00Z", sourceRowCount: pw.length },
  records: pw,
}, universe);
assert.ok(historical.records.every((row) => Core.isC1OCode(row.document)));
assert.equal(historical.audit.scopeDiscardedRecords, 2, "Evolução audita segregações sem contar em KPI");
console.log("sigem_pw_c1o_comparison: OK");
