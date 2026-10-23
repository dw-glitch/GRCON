"use strict";
const assert = require("node:assert/strict");
const Core = require("../sigem_pw_dashboard_core.js");
const Scope = require("../sigem_pw_scope_fix.js");
const Revision = require("../sigem_pw_revision_core.js");
const Evolution = require("../sigem_pw_evolution_core.js");
const Readiness = require("../sigem_pw_readiness_core.js");
const Audit = require("../sigem_pw_audit_core.js");

const cv = "5900.00.0001.0100-ABC-CV-C1O-001";
const cv2 = "5900.00.0001.0100-ABC-CV-C1O-002";
const n1710 = "PR-5290.00-22313-955-C1O-121";
const et = "C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-321530";
assert.equal(Core.documentClass(cv), "CV");
assert.equal(Core.documentClass(cv.toLowerCase() + ".pdf"), "CV");
assert.equal(Scope.documentClass(cv), "CV");
assert.equal(Core.documentClass("5900.00.0001.0100-ABC-CVE-C1O-001"), Core.UNCLASSIFIED);
assert.equal(Core.documentClass("5900.00.0001.0100-ABC-MCV-C1O-001"), Core.UNCLASSIFIED);
assert.equal(Core.documentClass(n1710), "N-1710");
assert.equal(Core.documentClass(et), "ET");
assert.equal(Core.isCvDocumentCode(cv), true);
assert.equal(Core.isCvDocumentCode("cv-c1o-001"), true);
assert.equal(Core.isCvDocumentCode("REL-CVE-C1O-001"), false);

const sigem = [
  { document: cv, revision: "0", status: "Postado", sourceRow: 1 },
  { document: cv, revision: "A", status: "Em análise", sourceRow: 2 },
  { document: cv2, revision: "0", status: "Postado", sourceRow: 3 },
  { document: n1710, revision: "0", status: "Postado", sourceRow: 4 },
  { document: et, revision: "0", status: "Postado", sourceRow: 5 },
];
const pw = [
  { document: n1710, revision: "0", lastEmission: "Previsto" },
  { document: et, revision: "0", lastEmission: "Sim" },
];
const model = Core.createModel(sigem, pw, []);
assert.equal(model.normalizedSigem.filter(row => row.documentClass === "CV").length, 3);
const all = Core.aggregateModel(model, {}, { revisionScope: "all" });
assert.equal(all.summary.sigem, 5, "CV continua na Consulta Geral");
assert.equal(all.summary.cvNotApplicable, 3);
assert.equal(all.summary.gapSigemToPw, 0, "CV sem PW não gera pendências");
assert.equal(all.summary.sigemOnly, 0);
assert.equal(all.summary.classifiedTotal, 5);
assert.equal(all.lists.cvNotApplicable.length, 3);
assert.ok(all.lists.cvNotApplicable.every(row => row.documentClass === "CV" && row.pwEmission === "Não aplicável (CV)" && !row.inPw));
assert.equal(all.classes.find(row => row.documentClass === "CV").sigem, 3);
assert.equal(all.lists.toRegisterPw.length, 0);
assert.ok(!all.lists.differences.some(row => row.documentClass === "CV"));
const onlyCv = Core.aggregateModel(model, { documentClass: "CV" }, { revisionScope: "all" });
assert.equal(onlyCv.summary.sigem, 3);
assert.equal(onlyCv.summary.cvNotApplicable, 3);
assert.equal(onlyCv.summary.pwRegistered, 0);
const revZero = Core.aggregateModel(model, {}, { revisionScope: "revision0" });
assert.equal(revZero.summary.cvNotApplicable, 2);
assert.equal(revZero.summary.sigem, 4);
assert.equal(Revision.analyze(model).rows.some(row => row.documentClass === "CV"), false, "CV não é atraso de revisão no PW");

const withCvInPw = Core.aggregateModel(Core.createModel(sigem, [
  ...pw, { document: cv, revision: "0", lastEmission: "Sim" }
], []), {}, {revisionScope: "all"});
assert.equal(withCvInPw.summary.cvNotApplicable, 2, "CV sem mesma revisão PW continua sem pendência; emissão já registrada é respeitada");
assert.equal(withCvInPw.summary.pwEmitted, 2);
assert.equal(withCvInPw.lists.bothEmitted.some(row => row.documentClass === "CV"), true);

const explicitType = Core.createModel([
  { document: "REL-5290.00-22313-955-C1O-009", documentType: "CV", revision: "0" }
], [], []);
assert.equal(explicitType.normalizedSigem[0].documentClass, "CV", "tipo explícito CV também identifica Currículo");
assert.equal(Core.aggregateModel(explicitType, {}, {revisionScope: "all"}).summary.cvNotApplicable, 1);
const explicitDesc = Core.createModel([
  { document: "REL-5290.00-22313-955-C1O-009", documentTypeDesc: "Currículo", revision: "0" }
], [], []);
assert.equal(explicitDesc.normalizedSigem[0].documentClass, "CV");

const pwBase = Core.sanitizePwBase({
  meta: { fileName: "pw.csv", importedAt: "2026-10-23T12:00:00Z" },
  records: [...pw, { document: cv, revision: "A", lastEmission: "Previsto" }],
}, []);
assert.equal(pwBase.meta.scopeVersion, Core.PW_SCOPE_VERSION);
assert.equal(pwBase.records.find(row=>row.document===cv).documentClass, "CV");
assert.equal(Audit.buildAudit(pwBase, {}).status, "validated");
assert.equal(Audit.buildAudit(pwBase, {}).metrics.classes.CV, 1);
const assessed = Readiness.assess({
  sigem: {meta:{}, records:sigem},
  pw: {...pwBase, meta:{...pwBase.meta, scopeVersion:Core.PW_SCOPE_VERSION}},
  ld: {meta:null,records:[]}
}, all);
assert.deepEqual(assessed.failedChecks, [], "integração CV conserva balanço de qualidade");
const ev = Evolution.buildSnapshot("sigem", {meta:{fileName:"sigem.xlsx",sourceRowCount:sigem.length},records:sigem}, Evolution.buildLdUniverse([],[]));
assert.equal(ev.records.filter(row=>row.documentClass==="CV").length, 3);
console.log("sigem_pw_cv_curriculo: OK");
