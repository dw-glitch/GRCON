const assert = require("node:assert/strict");
const Core = require("../sigem_pw_dashboard_core.js");
const Scope = require("../sigem_pw_scope_fix.js");

const inScope = "CR-5290.00-22313-911-C1O-001";
const outside = "PR-5290.00-22313-122-C1O-999";
const et = "C1O_RNEST_U32_3.1.1.1_INS_RIR_nt-PI-321530";
const cv = "5900.00.0001.0100-ABC-CV-C1O-001";
const ld = Core.parseLdMatrix([
  ["ITEM", "DOCUMENTO", "REVISÃO", "TÍTULO", "STATUS"],
  ["1", inScope, "B", "Cronograma", "EMITIDO"],
  ["2", et, "0", "RIR", "EMITIDO"],
  ["3", cv, "0", "Currículo", "EM EMISSÃO"],
], { fileName: "LD-001.xlsx", importedAt: "2026-10-29T00:00:00Z" });

assert.equal(ld.records.length, 3, "reference parser preserves recognized ET/N-1710/CV classes");
assert.equal(ld.records[0].status, "EMITIDO");
const pw = [
  { document: inScope, revision: "0", company: "CSG", lastEmission: "Não" },
  { document: inScope, revision: "B", company: "CSG", lastEmission: "Sim" },
  { document: outside, revision: "0", company: "CSG", lastEmission: "Sim" },
  { document: et, revision: "0", company: "QTM", lastEmission: "Previsto" },
];
const sigem = [
  { document: inScope, revision: "B", status: "Recusado" },
  { document: outside, revision: "0", status: "Sem Comentários" },
  { document: cv, revision: "0", status: "Sem Comentários" },
];
const strict = Scope.createModel(sigem, pw, ld.records, {
  requireN1710Ld: true,
  requireDocumentReference: true,
  ldAvailable: true,
  sigemAvailable: true,
  pwAvailable: true,
});
assert.deepEqual([...new Set(strict.normalizedPw.map(row => row.documentKey))].sort(),
  [Core.documentIdentity(inScope).key, Core.documentIdentity(et).key].sort(),
  "outside code must not count in official PW entries");
assert.ok(strict.normalizedSigem.every(row => row.documentKey !== Core.documentIdentity(outside).key));
assert.ok(strict.excludedSigemN1710.some(row => row.documentKey === Core.documentIdentity(outside).key));
assert.ok(strict.excludedPwN1710.some(row => row.documentKey === Core.documentIdentity(outside).key));
const summary = Scope.aggregateModel(strict, {}, { revisionScope: "all" });
assert.ok(summary.lists.all.every(row => row.document !== outside));
assert.ok(summary.lists.pwN1710OutsideLd.some(row => row.document === outside));
assert.ok(strict.normalizedPw.some(row => row.documentKey === Core.documentIdentity(et).key &&
  row.emittedEvidence === false), "Previsto is a registration without emission");

const legacy = Scope.createModel(sigem, pw, ld.records);
assert.ok(legacy.normalizedPw.some(row => row.documentKey === Core.documentIdentity(outside).key),
  "legacy snapshots preserve previous semantics without opt-in");
console.log("SIGEM × PW: all-class reference scope, audit, revisions and wrapper settings OK");
