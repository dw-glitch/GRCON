"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const Evo = require(path.join(root, "sigem_pw_evolution_core.js"));

const et = (id) => "C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-" + id;
const s = (id, revision, extra = {}) => ({ document: et(id), revision, status: "Em análise", ...extra });
const p = (id, revision, lastEmission, extra = {}) => ({
  document: et(id),
  revision,
  revisionComplete: revision,
  state: lastEmission === "Previsto" ? "Cadastrado" : "Liberado",
  lastEmission,
  ...extra,
});
const universe = Evo.buildLdUniverse(
  ["A", "B", "C", "D", "E"].map((id) => ({ document: et(id), discipline: "INS" })),
  [],
);
const base = (system, records, importedAt) => Evo.buildSnapshot(system, {
  meta: { fileName: system.toUpperCase() + ".csv", importedAt, sourceRowCount: records.length },
  records,
}, universe);

(function normalizationIsExplicitAndNonDestructive() {
  const sigemEt = " c1o_rnest_u32_3.1.1.1_ins_rir_nt-pi-321530.pdf ";
  const pwEt = "C1O-RNEST-U32-3.1.1.1-INS-RIR-PI-321530";
  assert.equal(Evo.documentIdentity(sigemEt).key, Evo.documentIdentity(pwEt).key, "caixa, espaços, extensão, separadores e nt- equivalentes devem convergir");
  assert.equal(Evo.normalizeRevision(" Rev. a "), "A");
  assert.equal(Evo.normalizeRevision("rev B"), "B");

  const eapA = "C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-321530";
  const eapB = "C1O_RNEST_U32_3.1.1.2_INS_RIR_PI-321530";
  assert.notEqual(Evo.documentIdentity(eapA).key, Evo.documentIdentity(eapB).key, "EAP diferente não pode ser unido por normalização");

  const n1710A = "CE-5290.00-22313-856-C1O-001";
  const n1710B = "CE-5290.00-22313-856-C1O-002";
  assert.notEqual(Evo.documentIdentity(n1710A).key, Evo.documentIdentity(n1710B).key, "sequencial N-1710 diferente deve permanecer distinto");
})();

(function emissionSemanticsAreExplicit() {
  assert.deepEqual(Evo.emissionInfo("Sim"), {
    flag: "SIM", kind: "current", state: "emitted", emitted: true, recognized: true, reason: "Última emissão = SIM (evidência atual)",
  });
  assert.equal(Evo.emissionInfo("Não").kind, "historical");
  assert.equal(Evo.emissionInfo("Não").emitted, true, "NÃO preserva a semântica histórica vigente do Dashboard");
  assert.equal(Evo.emissionInfo("Previsto").emitted, false);
  assert.equal(Evo.emissionInfo("valor novo").kind, "unknown");
  assert.equal(Evo.emissionInfo("valor novo").emitted, false);
})();

const sigemCurrent = base("sigem", [
  s("A", "0"),
  s("A", "A"),
  s("B", "0"),
], "2026-10-05T08:00:00Z");

const pwRows = [
  p("A", "0", "Sim"),
  p("A", "A", "Não"),
  p("C", "0", "Previsto"),
  p("D", "0", "Valor inesperado"),
  p("E", "0", "Sim"),
  p("E", "0", "Sim"),
];
const pwCurrent = base("pw", pwRows, "2026-10-05T09:00:00Z");

(function auditExplainsRawToKpi() {
  const audit = pwCurrent.audit;
  assert.equal(audit.rawRecords, 6);
  assert.equal(audit.acceptedRecords, 5, "duplicidade técnica exata não entra duas vezes");
  assert.equal(audit.technicalDuplicates, 1);
  assert.equal(audit.documentRevisionRecords, 5);
  assert.equal(audit.uniqueDocuments, 4);
  assert.equal(audit.emittedDocumentRevisionRecords, 3);
  assert.equal(audit.emittedUniqueDocuments, 2, "A possui duas revisões emitidas, mas é um documento único");
  assert.equal(audit.notEmittedDocumentRevisionRecords, 1);
  assert.equal(audit.indeterminateEmissionDocumentRevisionRecords, 1);
  assert.deepEqual(audit.emissionBreakdown, { current: 2, historical: 1, planned: 1, unknown: 1, missing: 0 });
  assert.match(audit.emissionRule, /SIM.*NÃO.*PREVISTO/i);
  assert.equal(pwCurrent.analysisVersion, Evo.CALCULATION_VERSION);
})();

(function documentRevisionStateIsExclusiveAcrossTechnicalVariants() {
  const mixed = base("pw", [
    p("C", "0", "Previsto", { sourceRow: 2, fileName: "c-previsto.pdf" }),
    p("C", "0", "Valor inesperado", { sourceRow: 3, fileName: "c-desconhecido.pdf" }),
  ], "2026-10-05T09:00:00Z");
  assert.equal(mixed.audit.documentRevisionRecords, 1);
  assert.equal(mixed.audit.technicalVariantsSameDocumentRevision, 1);
  assert.equal(mixed.audit.notEmittedTechnicalRecords, 1);
  assert.equal(mixed.audit.indeterminateEmissionTechnicalRecords, 1);
  assert.equal(mixed.audit.notEmittedDocumentRevisionRecords, 0);
  assert.equal(mixed.audit.indeterminateEmissionDocumentRevisionRecords, 1, "uma chave doc+rev deve ocupar um único estado final");
})();

(function evidenceIsIndependentOfSourceOrderAndDrillDownMatchesKpi() {
  for (const flags of [["Sim", "Previsto"], ["Previsto", "Sim"], ["Não", "Previsto"], ["Previsto", "Não"], ["Sim", "Valor inesperado"], ["Valor inesperado", "Sim"], ["Previsto", "Valor inesperado"], ["Valor inesperado", "Previsto"]]) {
    const mixed = base("pw", flags.map((flag, i) => p("C", "0", flag, { sourceRow: i + 2, fileName: "variant-" + i + ".pdf" })), "2026-10-05T09:00:00Z");
    const rows = Evo.documentRevisionRecords(mixed.records);
    assert.equal(rows.length, mixed.audit.documentRevisionRecords);
    const expected = flags.some(flag => ["Sim", "Não"].includes(flag)) ? "emitted" : "indeterminate";
    assert.equal(rows[0].emissionState, expected, "source order cannot change a document+revision state: " + flags);
    assert.equal(rows.filter(row => row.emissionState === "emitted").length, mixed.audit.emittedDocumentRevisionRecords);
    assert.equal(rows.filter(row => row.emissionState === "not-emitted").length, mixed.audit.notEmittedDocumentRevisionRecords);
    assert.equal(rows.filter(row => row.emissionState === "indeterminate").length, mixed.audit.indeterminateEmissionDocumentRevisionRecords);
  }
})();

(function newDocumentsCountPhysicalDocumentsOnce() {
  const before = base("sigem", [s("A", "0")], "2026-10-01T08:00:00Z");
  const after = base("sigem", [s("A", "0"), s("B", "0"), s("B", "A")], "2026-10-05T08:00:00Z");
  const delta = Evo.compareSnapshots(before, after).documentRevision;
  assert.equal(delta.added.length, 2);
  assert.equal(delta.newDocuments.length, 1, "two revisions of a newly seen document still represent one new document");
})();

(function currentRelationsAreDocumentRevisionBased() {
  const relation = Evo.currentRelations(sigemCurrent.records, pwCurrent.records);
  assert.equal(relation.both.length, 2);
  assert.equal(relation.bothEmitted.length, 2);
  assert.equal(relation.bothNotEmitted.length, 0);
  assert.equal(relation.onlySigem.length, 1);
  assert.equal(relation.onlySigem[0].document, et("B"));
  assert.equal(relation.onlyPw.length, 3);
  assert.equal(relation.pwOnlyEmitted.length, 1);
  assert.equal(relation.pwOnlyNotEmitted.length, 1);
  assert.equal(relation.pwOnlyIndeterminate.length, 1);
})();

(function newDocumentAndNewRevisionAreNotConfused() {
  const sigemPrevious = base("sigem", [s("A", "0")], "2026-10-01T08:00:00Z");
  const pwPrevious = base("pw", [p("A", "0", "Sim"), p("C", "0", "Previsto")], "2026-10-01T09:00:00Z");
  const comparison = Evo.comparePeriod(sigemPrevious, sigemCurrent, pwPrevious, pwCurrent);

  assert.equal(comparison.sigem.documentRevision.added.length, 2);
  assert.equal(comparison.sigem.documentRevision.newDocuments.length, 1);
  assert.equal(comparison.sigem.documentRevision.newDocuments[0].document, et("B"));
  assert.equal(comparison.sigem.documentRevision.newRevisions.length, 1);
  assert.equal(comparison.sigem.documentRevision.newRevisions[0].revision, "A");

  assert.equal(comparison.pw.documentRevision.added.length, 3);
  assert.equal(comparison.pw.documentRevision.newDocuments.length, 2);
  assert.equal(comparison.pw.documentRevision.newRevisions.length, 1);
  assert.equal(comparison.pw.documentRevision.newRevisions[0].revision, "A");
  assert.equal(comparison.pwEmissions.length, 2, "somente novas entradas emitidas/transições determináveis devem formar novas emissões");
})();

(function indeterminateToEmittedIsNotInventedAsNewEmission() {
  const before = base("pw", [p("D", "0", "Valor inesperado")], "2026-10-01T09:00:00Z");
  const after = base("pw", [p("D", "0", "Sim")], "2026-10-05T09:00:00Z");
  const delta = Evo.compareSnapshots(before, after);
  assert.equal(delta.added.length, 0);
  assert.equal(delta.metadataChanged.length, 1);
  assert.equal(Evo.emissionTransitions(delta).length, 0, "estado anterior indeterminado não permite afirmar que a emissão ocorreu entre snapshots");
  assert.equal(delta.documentRevisionEmissions.transitions.length, 0);
  assert.equal(delta.documentRevisionEmissions.indeterminateToEmitted.length, 1);
})();

(function technicalMultiplicityDoesNotInflatePrimaryEmissionKpi() {
  const before = base("pw", [p("C", "0", "Previsto", { fileName: "c-previsto.pdf" })], "2026-10-01T09:00:00Z");
  const after = base("pw", [
    p("C", "0", "Sim", { fileName: "c-emissao-a.pdf", sourceRow: 2 }),
    p("C", "0", "Sim", { fileName: "c-emissao-b.pdf", sourceRow: 3 }),
  ], "2026-10-05T09:00:00Z");
  const delta = Evo.compareSnapshots(before, after);
  assert.equal(Evo.emissionTransitions(delta).length, 2, "movimento técnico permanece auditável para compatibilidade");
  assert.equal(delta.documentRevisionEmissions.transitions.length, 1, "KPI principal deve contar uma única transição documento + revisão");
})();

(function largeDocumentRevisionDeltaRemainsIndexed() {
  const size = 20000;
  const before = new Array(size);
  const after = new Array(size + 500);
  for (let i = 0; i < size; i += 1) {
    const row = { document: et("P" + String(i).padStart(5, "0")), revision: "0", documentKey: "DOC-" + i, documentRevisionKey: "DOC-" + i + "|0", sourceRow: i + 2 };
    before[i] = row;
    after[i] = row;
  }
  for (let i = 0; i < 500; i += 1) {
    const index = size + i;
    after[index] = { document: et("P" + String(i).padStart(5, "0")), revision: "A", documentKey: "DOC-" + i, documentRevisionKey: "DOC-" + i + "|A", sourceRow: index + 2 };
  }
  const started = performance.now();
  const delta = Evo.documentRevisionDelta(before, after);
  const elapsed = performance.now() - started;
  assert.equal(delta.added.length, 500);
  assert.equal(delta.newRevisions.length, 500);
  assert.ok(elapsed < 3000, "delta 20k deve permanecer linear/rápido; medido " + elapsed.toFixed(1) + " ms");
  console.log("auditability doc+rev perf 20k=" + elapsed.toFixed(1) + "ms");
})();

(function sourceContractsGuardSelectionAndCacheRegression() {
  const adapter = fs.readFileSync(path.join(root, "src/react/sigem-pw/evolution/services/sigemPwEvolutionAdapter.ts"), "utf8");
  const app = fs.readFileSync(path.join(root, "src/react/sigem-pw/evolution/SigemPwEvolutionApp.tsx"), "utf8");
  const domain = fs.readFileSync(path.join(root, "src/react/sigem-pw/evolution/types/domain.ts"), "utf8");
  const worker = fs.readFileSync(path.join(root, "workers/sigem_pw_evolution.worker.js"), "utf8");
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.match(adapter, /PREFERENCES_KEY/);
  assert.match(adapter, /sessionStorage/);
  assert.match(adapter, /preparedSnapshotCache/);
  assert.match(adapter, /evolutionPrepared:sigem-pw-evolution-audit-v4/);
  assert.match(adapter, /timelineCache/);
  assert.match(adapter, /preferredSelections/);
  assert.match(adapter, /sigem_pw_evolution\.worker\.js/);
  assert.match(adapter, /buildSnapshotOffThread/);
  assert.doesNotMatch(adapter, /\.getAll\(\)/, "Evolução não deve reler todos os payloads do histórico quando há cache");
  assert.match(adapter, /exportAuditWorkbook/);
  assert.match(worker, /sigem_pw_evolution_core\.js/);
  assert.match(worker, /evolution-snapshot/);
  assert.match(sw, /workers\/sigem_pw_evolution\.worker\.js/);
  assert.match(app, /Como foi calculado\?/);
  assert.match(app, /Diagnóstico da contagem/);
  assert.match(app, /PW cadastrado/);
  assert.match(app, /PW emitido/);
  assert.match(app, /SIGEM ativo/);
  assert.match(app, /PW ativo/);
  assert.match(domain, /documentRevisionRecords/);
  assert.match(domain, /emittedUniqueDocuments/);
  assert.match(domain, /indeterminateEmissionDocumentRevisionRecords/);
  assert.match(app, /Emissão indeterminada/);
})();

console.log("sigem_pw_evolution_auditability: OK — granularidade dupla, emissão, diagnóstico, cache e rastreabilidade validados.");
