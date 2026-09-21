"use strict";

const assert = require("node:assert/strict");
const Scope = require("../sigem_pw_scope_fix.js");
const Evolution = require("../sigem_pw_evolution_core.js");

const n1710 = (sequence) => `RL-5290.00-22313-ABC-C1O-${String(sequence).padStart(3, "0")}`;
const et = (eap, tag = "PI-000001") => `C1O_RNEST_U32_${eap}_INS_RIR_${tag}`;
const sigem = (document, revision, extra = {}) => ({ document, revision, status: "Postado", ...extra });
const pw = (document, revision, extra = {}) => ({
  document,
  revision,
  revisionComplete: revision,
  state: "Liberado",
  lastEmission: "Sim",
  ...extra,
});

function aggregate(sigemRows, pwRows) {
  const model = Scope.createModel(sigemRows, pwRows);
  return { model, result: Scope.aggregateModel(model, {}) };
}

(function revisionsOfSameDocumentCountIndependently() {
  const doc = n1710(1);
  const { model, result } = aggregate(
    [sigem(doc, "0"), sigem(doc, "A"), sigem(doc, "B")],
    []
  );
  assert.equal(model.sigemAll.size, 1, "visão documental consolidada deve continuar disponível");
  assert.equal(model.sigemEntries.size, 3, "modelo de escopo deve preservar código + revisão");
  assert.equal(result.summary.sigem, 3);
  assert.equal(result.summary.sigemOnly, 3);
})();

(function exactDuplicateDoesNotDoubleCount() {
  const doc = n1710(1);
  const { model, result } = aggregate(
    [sigem(doc, "0"), sigem(doc, "0"), sigem(doc, "A")],
    []
  );
  assert.equal(model.sigemEntries.size, 2);
  assert.equal(result.summary.sigem, 2);
})();

(function distinctDocumentsAndRevisionsAreAdditive() {
  const rows = [sigem(n1710(1), "0"), sigem(n1710(2), "0"), sigem(n1710(2), "A")];
  const { result } = aggregate(rows, []);
  assert.equal(result.summary.sigem, 3);
})();

(function comparisonUsesDocumentPlusRevision() {
  const doc = n1710(1);
  const { result } = aggregate(
    [sigem(doc, "0"), sigem(doc, "A"), sigem(doc, "B")],
    [pw(doc, "0"), pw(doc, "A")]
  );
  assert.equal(result.summary.sigem, 3);
  assert.equal(result.summary.pwRegistered, 2);
  assert.equal(result.summary.matched, 2);
  assert.equal(result.summary.gapSigemToPw, 1);
  assert.deepEqual(result.lists.sigemOnly.map((row) => row.revision), ["B"]);
})();

(function filtersKeepRevisionGranularity() {
  const docA = n1710(1);
  const docB = et("3.1.1.1", "PI-000002");
  const { model } = aggregate(
    [sigem(docA, "0"), sigem(docA, "A"), sigem(docB, "0"), sigem(docB, "A")],
    []
  );
  assert.equal(Scope.aggregateModel(model, { documentClass: "N-1710" }).summary.sigem, 2);
  assert.equal(Scope.aggregateModel(model, { documentClass: "ET" }).summary.sigem, 2);
})();

(function eapRemainsPartOfDocumentIdentity() {
  const { result } = aggregate(
    [sigem(et("3.1.1.1"), "0"), sigem(et("3.1.1.2"), "0")],
    []
  );
  assert.equal(result.summary.sigem, 2, "EAPs diferentes não podem ser consolidadas");
})();

(function evolutionCountsEveryNewRevision() {
  const doc = n1710(1);
  const universe = Evolution.buildLdUniverse([{ document: doc }], []);
  const snapshot = (date, revisions) => Evolution.buildSnapshot("sigem", {
    meta: { fileName: "sigem.xlsx", importedAt: `${date}T12:00:00Z`, sourceRowCount: revisions.length, recordCount: revisions.length },
    records: revisions.map((revision, index) => sigem(doc, revision, { sourceRow: index + 2 })),
  }, universe);

  const day1 = snapshot("2026-09-01", ["0"]);
  const day5 = snapshot("2026-09-05", ["0", "A"]);
  const day10 = snapshot("2026-09-10", ["0", "A", "B"]);

  assert.equal(day1.records.length, 1);
  assert.equal(day5.records.length, 2);
  assert.equal(day10.records.length, 3);
  assert.equal(Evolution.compareSnapshots(day1, day5).added.length, 1);
  assert.equal(Evolution.compareSnapshots(day5, day10).added.length, 1);
  assert.deepEqual(
    Evolution.buildDailyTimeline([day1, day5, day10], []).map((row) => [row.date, row.sigemAdded]),
    [["2026-09-05", 1], ["2026-09-10", 1]]
  );
})();

console.log("sigem_pw_revision_counting: OK — contagem por documento + revisão protegida no caminho de escopo.");
