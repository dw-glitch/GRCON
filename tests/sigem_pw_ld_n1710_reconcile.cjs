"use strict";
const assert = require("node:assert/strict");
const Core = require("../sigem_pw_dashboard_core.js");

const is = "IS-5290.00-22313-955-C1O-123";
const rl = "RL-5290.00-22313-955-C1O-002";
const extra = "CE-5290.00-22313-856-C1O-400";
const et = "C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-00001";
const sigem = [
  { document: is, revision: "0", status: "Postado" },
  { document: rl, revision: "0", status: "Postado" },
  { document: et, revision: "0", status: "Postado" },
];
const pw = [
  { document: is, revision: "A", company: "CSG", lastEmission: "Previsto" },
  { document: rl, revision: "0", company: "QTM", lastEmission: "Sim" },
  { document: et, revision: "0", company: "CSG", lastEmission: "Sim" },
  { document: is, revision: "0", company: "OTHER", lastEmission: "Sim" },
];
const ld = [{ document: is, revision: "A", sourceRow: 23 }, { document: extra, revision: "0", sourceRow: 24 }];
const options = { requireN1710Ld: true, ldAvailable: true };
assert.equal(Core.documentClass(is), "N-1710");
assert.equal(Core.n1710DocumentType(is), "IS");
assert.equal(Core.documentClass("I-IS-5290.00-22313-955-C1O-1234"), "N-1710");
assert.equal(Core.documentClass("IS-5290.00-22313-955-C10-123"), Core.UNCLASSIFIED);
assert.equal(Core.isN1710Candidate("IS-5290.00-22313-955-C1O-"), true);
assert.notEqual(Core.documentIdentity(is).key, Core.documentIdentity("IS-5290.00-22313-955-C1O-124").key);

const model = Core.createModel(sigem, pw, ld, options);
const all = Core.aggregateModel(model, {}, { revisionScope: "all" });
assert.equal(all.summary.sigem, 2, "SIGEM válido: IS na LD + ET fora da regra LD");
assert.equal(all.summary.pwRegistered, 2, "PW válido: IS na LD + ET");
assert.equal(all.classes.find(x => x.documentClass === "N-1710").sigem, 1);
assert.equal(all.lists.sigemN1710OutsideLd.length, 1);
assert.equal(all.lists.pwN1710OutsideLd.length, 1);
assert.equal(all.lists.ldWithoutSigem.length, 1);
assert.equal(all.lists.ldWithoutSigem[0].document, extra);
assert.equal(all.lists.sigemN1710OutsideLd[0].document, rl);
assert.equal(all.lists.sigemN1710OutsideLd[0].inPw, true, "registro fora da LD preserva evidência do PW QTM");
assert.equal(all.lists.sigemN1710OutsideLd[0].ldStatus, "NÃO");
assert.equal(all.lists.bothOtherRevision.length, 1);
assert.equal(all.lists.bothOtherRevision[0].document, is);
assert.equal(all.lists.bothOtherRevision[0].inPw, true, "revisão diferente não significa documento sem PW");
assert.equal(all.lists.bothOtherRevision[0].pwCompany, "CSG");
assert.equal(all.lists.bothOtherRevision[0].pwRegistrationStatus, "CADASTRADO — OUTRA REVISÃO");
assert.equal(all.lists.bothOtherRevision[0].ldStatus, "SIM");
assert.equal(all.lists.bothOtherRevision[0].ldSourceRow, 23);
assert.equal(all.lists.bothOtherRevision[0].ldRevision, "A");
assert.equal(all.quality.ldDocumentCount, 2);
assert.equal(all.quality.sigemN1710OutsideLd, 1);
assert.equal(all.quality.pwN1710OutsideLd, 1);
assert.equal(all.summary.classifiedTotal, all.lists.all.length);

const rev0 = Core.aggregateModel(model, {}, { revisionScope: "revision0" });
assert.equal(rev0.summary.sigem, 2);
assert.equal(rev0.lists.sigemN1710OutsideLd.length, 1);
assert.equal(rev0.summary.sigemOnly, 0, "PW na revisão A mantém a prova de cadastro do IS na visão revisão 0");

const noLd = Core.aggregateModel(Core.createModel(sigem, pw, [], {
  requireN1710Ld: true, ldAvailable: false,
}), {}, { revisionScope: "all" });
assert.equal(noLd.summary.sigem, 1, "na ausência da LD a família N-1710 não pode inflar SIGEM");
assert.equal(noLd.summary.pwRegistered, 1);
assert.equal(noLd.lists.sigemN1710OutsideLd.length, 0, "LD ausente não equivale a código ausente");
assert.equal(noLd.lists.ldUnavailableN1710.length, 4);
assert.ok(noLd.lists.ldUnavailableN1710.every(r => r.ldStatus === "LD INDISPONÍVEL"));

const candidatesModel = Core.createModel(
  [{ document: "IS-5290.00-22313-955-C1O-", revision: "0" }], [], ld, options);
const candidates = Core.aggregateModel(candidatesModel, {}, { revisionScope: "all" });
assert.equal(candidates.summary.sigem, 0);
assert.equal(candidates.lists.n1710Candidates.length, 1);
assert.equal(candidates.lists.n1710Candidates[0].ldStatus, "A CONFERIR");

const aligned = Core.aggregateModel(Core.createModel(
  [{ document: is, revision: "0" }],
  [{ document: is, revision: "0", lastEmission: "Previsto", company: "CSG" }],
  ld, options), {}, { revisionScope: "all" });
assert.equal(aligned.lists.bothNotEmitted.length, 1, "PREVISTO é cadastrado, não emitido");

const previous = Core.aggregateModel(Core.createModel(sigem, pw, ld), {}, { revisionScope: "all" });
assert.equal(previous.summary.sigem, 3, "sem opt-in legados preservam histórico e snapshot");
console.log("SIGEM × PW: LD obrigatória, IS N-1710, CSG/QTM, revisões, rastreabilidade e exclusões OK");
