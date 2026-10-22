"use strict";

const assert = require("node:assert/strict");
const Dashboard = require("../sigem_pw_dashboard_core.js");
const Revision = require("../sigem_pw_revision_core.js");
const Evolution = require("../sigem_pw_evolution_core.js");
const Readiness = require("../sigem_pw_readiness_core.js");

const etSigem = "C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-123456";
const etPw = "C1O-RNEST-U32-3.1.1.1-INS-RIR-PI-123456";
const etAnotherTag = "C1O-RNEST-U32-3.1.1.1-INS-RIR-PI_123456";
const n1710 = "CE-5290.00-22313-856-C1O-001";
const n1710Another = "CE-5290.00-22313-856-C1O-002";
const n1710Bad = "CE_5290.00_22313_856_C1O_001";
const ld = [{ document: n1710 }, { document: n1710Another }];

assert.equal(Dashboard.documentClass(etSigem), "ET");
assert.equal(Dashboard.documentClass(etPw), "ET");
assert.equal(Dashboard.documentIdentity(etSigem).key, Dashboard.documentIdentity(etPw).key,
  "Somente os seis separadores estruturais ET podem ser conciliados");
assert.notEqual(Dashboard.documentIdentity(etSigem).key, Dashboard.documentIdentity(etAnotherTag).key,
  "Separadores dentro da TAG ET distinguem documentos");
assert.equal(Dashboard.documentClass(n1710), "N-1710");
assert.equal(Dashboard.canonicalDocumentCode(n1710), n1710,
  "O N-1710 usa hífens tanto no SIGEM quanto no PW");
assert.equal(Dashboard.documentClass(n1710Bad), Dashboard.UNCLASSIFIED,
  "O N-1710 não admite substituição global de hífens por underscores");

const csv = [
  '"NumeroDocumentoCliente";"RevisaoCompleta";"Revisao";"TipoDocumento";"o_statename";"Última emissão";"o_filename"',
  '"C1O-RNEST-U32-3.1.1.1-INS-RIR-PI-123456";"";"";"RIR";"";" Previsto ";""',
  '"CE-5290.00-22313-856-C1O-001";"";"";"CEQ";"";"PREVISTO";""',
].join("\r\n");
const parsed = Dashboard.parsePwCsv(csv, { fileName: "RHDD-teste.csv" });
assert.equal(parsed.meta.recordCount, 2);
assert.equal(parsed.meta.emittedDocumentCount, 0);
assert.equal(parsed.records.every((row) => row.emissionFlag === "PREVISTO" && !row.emittedEvidence), true);
assert.equal(parsed.records.every((row) => !row.revision && !row.fileName), true);

const sigem = [
  { document: etSigem, revision: "0", status: "Em análise" },
  { document: n1710, revision: "0", status: "Postado" },
];
const model = Dashboard.createModel(sigem, parsed.records, ld);
const rev0 = Dashboard.aggregateModel(model, {}, { revisionScope: "revision0" });
const all = Dashboard.aggregateModel(model, {}, { revisionScope: "all" });
for (const result of [rev0, all]) {
  assert.equal(result.summary.sigemOnly, 0, "Previsto no PW não deve gerar falso SIGEM sem PW");
  assert.equal(result.summary.matched, 2, "Os documentos previstos devem constar como cadastrados");
  assert.equal(result.summary.bothNotEmitted, 2);
  assert.equal(result.summary.pwEmitted, 0);
  assert.equal(result.summary.classifiedTotal, 2);
  assert.ok(result.lists.bothNotEmitted.every((row) => row.matchMode === "document-fallback"));
  assert.ok(result.lists.bothNotEmitted.every((row) => row.pwRevisionEvidence === "Não informada no PW"));
  assert.ok(result.lists.bothNotEmitted.every((row) => row.pwLastEmission.toUpperCase() === "PREVISTO"));
}
assert.ok(rev0.lists.all.every((row) => row.revision === "0"),
  "Revisão 0 não pode ser falsamente convertida em revisão PW");

const missingPwRevisionWithPriorEmission = Dashboard.aggregate(
  [{ document: etSigem, revision: "0" }, { document: etSigem, revision: "A" }],
  [{ document: etPw, revision: "0", lastEmission: "Sim" }, { document: etPw, revision: "", lastEmission: "Previsto" }],
);
const combined = Dashboard.aggregateModel(Dashboard.createModel(
  [{ document: etSigem, revision: "0" }, { document: etSigem, revision: "A" }],
  [{ document: etPw, revision: "0", lastEmission: "Sim" }, { document: etPw, revision: "", lastEmission: "Previsto" }],
), {}, { revisionScope: "revision0" });
assert.equal(combined.summary.pwRegistered, 1, "Previsto sem revisão não duplica cadastro explícito revisão 0");
assert.equal(combined.summary.pwEmitted, 1, "Previsto de revisão indeterminada não apaga emissão 0");
assert.equal(missingPwRevisionWithPriorEmission.summary.pwRegistered, 2);
assert.equal(missingPwRevisionWithPriorEmission.summary.pwEmitted, 1);

const pwUnmatched = { document: n1710Another, lastEmission: "Previsto", revision: "" };
const onlyRev0 = Dashboard.aggregateModel(Dashboard.createModel(sigem, [...parsed.records, pwUnmatched], ld), {}, { revisionScope: "revision0" });
const onlyAll = Dashboard.aggregateModel(Dashboard.createModel(sigem, [...parsed.records, pwUnmatched], ld), {}, { revisionScope: "all" });
assert.equal(onlyRev0.summary.pwOnlyNotEmitted, 1, "Previsto sem revisão deve contar como cadastro PW até na visão inicial");
assert.equal(onlyRev0.lists.pwOnlyNotEmitted[0].revision, "Não informada no PW",
  "Presença sem revisão não deve virar revisão 0 inventada");
assert.equal(onlyAll.summary.pwOnlyNotEmitted, 1, "Cadastro previsto exclusivo deve constar na visão geral");


// Regressão extraída da estrutura real RHDD(2).csv: Previsto vem SEM
// RevisaoCompleta, Revisao, o_filename ou estado PW. A LD pode estar ausente.
const noLd = Dashboard.sanitizePwBase({ ...parsed, sourceRecords: parsed.records }, { meta: null, records: [] });
assert.equal(noLd.meta.recordCount, 2, "O N-1710 previsto não pode ser descartado por não estar na LD");
assert.equal(noLd.meta.plannedRegisteredCount, 2);
assert.equal(noLd.meta.registeredWithoutQualityLdCount, 1);
assert.equal(noLd.records.find((row) => row.document === n1710).documentClass, "N-1710");

const fromOldScope = Dashboard.sanitizePwBase({
  meta: { ...noLd.meta, scopeVersion: 4 },
  records: noLd.records.filter((row) => row.documentClass === "ET"),
  sourceRecords: parsed.records,
}, []);
assert.equal(fromOldScope.records.length, 2, "Deve restaurar códigos antes descartados ao reprocessar a base");
assert.equal(fromOldScope.meta.scopeVersion, Dashboard.PW_SCOPE_VERSION);

const modelNoLd = Dashboard.createModel(sigem, noLd.records, []);
const resultNoLd = Dashboard.aggregateModel(modelNoLd, {}, { revisionScope: "revision0" });
assert.equal(resultNoLd.summary.bothNotEmitted, 2);
assert.equal(resultNoLd.summary.sigemOnly, 0);
assert.equal(resultNoLd.summary.pwRegistered, 2);
assert.equal(resultNoLd.summary.pwEmitted, 0);
assert.equal(Dashboard.aggregateModel(modelNoLd, {}, { revisionScope: "all" }).summary.matched, 2);
const noLdReady = Readiness.assess({
  sigem: { meta: { snapshotId: "sigem-test" }, records: sigem },
  pw: noLd,
  ld: { meta: null, records: [] },
}, resultNoLd);
assert.equal(noLdReady.ready, true, "A ausência da LD não pode bloquear comprovação de cadastro no PW");
assert.ok(!noLdReady.failedChecks.includes("quality-ld"));

const revisionResult = Revision.analyze(model);
const n1710Revision = revisionResult.rows.find((row) => row.document === n1710);
assert.equal(n1710Revision.situation, Revision.SITUATIONS.AWAITING_EMISSION);
assert.equal(n1710Revision.pwRevision, "Não informada no PW");
assert.match(n1710Revision.reason, /revisão ou emissão/i);
assert.equal(Revision.historyForRows(model.pwAll.get(Dashboard.documentIdentity(n1710).key).rows, "pw")[0].revision,
  "Não informada no PW");

const modelWithHistoricalPw = Dashboard.createModel(
  [{ document: etSigem, revision: "A", status: "Postado" }],
  [{ document: etPw, revision: "0", state: "Liberado", lastEmission: "Sim" },
   { document: etPw, revision: "", lastEmission: "Previsto" }],
);
const historical = Revision.analyze(modelWithHistoricalPw).rows[0];
assert.equal(historical.situation, Revision.SITUATIONS.REVIEW,
  "Não afirmar que a revisão prevista desconhecida é a revisão A");
assert.equal(historical.lastEmittedPwRevision, "0");
assert.match(historical.reason, /cadastrado|cadastro/i);


// A conciliação atual da Evolução, em "todas as revisões", deve enxergar
// documentos previstos sem revisão, sem inventar qual revisão foi cadastrada.
const evolutionMatch = Evolution.currentRelations(
  [{ document: etSigem, revision: "0" }],
  [{ document: etPw, revision: "", emissionKind: "planned", emissionState: "not-emitted", emitted: false }],
);
assert.equal(evolutionMatch.bothNotEmitted.length, 1);
assert.equal(evolutionMatch.onlySigem.length, 0);
assert.equal(evolutionMatch.onlyPw.length, 0);
assert.equal(evolutionMatch.both[0].matchMode, "document-fallback");

const evolutionHistorical = Evolution.currentRelations(
  [{ document: etSigem, revision: "0" }, { document: etSigem, revision: "A" }],
  [{ document: etPw, revision: "0", emissionKind: "current", emissionState: "emitted", emitted: true },
   { document: etPw, revision: "", emissionKind: "planned", emissionState: "not-emitted", emitted: false }],
);
assert.equal(evolutionHistorical.bothEmitted.length, 1);
assert.equal(evolutionHistorical.bothNotEmitted.length, 1);
assert.equal(evolutionHistorical.onlyPw.length, 0);
assert.equal(evolutionHistorical.onlySigem.length, 0);

console.log("SIGEM × PW: previsto sem revisão, ET com equivalência estrutural e N-1710 preservado — OK");
