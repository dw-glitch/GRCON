"use strict";
// Propósito de emissão: o que a LD descreve precisa chegar à eGRDT, adaptado à
// lista oficial quando a grafia difere e sinalizado quando não existe equivalente.
const assert = require("node:assert/strict");
const C = require("../core.js");
const E = require("../emission.js");

// 1) Resolução tolerante, sempre devolvendo um valor oficial ou vazio.
const cases = [
  ["Para Construção", "Para Construção"],
  ["PARA CONSTRUCAO", "Para Construção"],
  ["  para   construção ", "Para Construção"],
  ["Para Construção - Rev. B", "Para Construção"],
  ["conforme construido", "Conforme Construído"],
  ["As-Built", "Conforme Construído"],
  ["IFC", "Para Construção"],
  ["Emitido p/ Comentários", ""],
  ["Algo que não existe", ""],
  ["", ""],
  [undefined, ""],
];
cases.forEach(([input, expected]) => assert.equal(C.resolvePurpose(input).purpose, expected, `resolvePurpose(${JSON.stringify(input)})`));
assert.equal(C.resolvePurpose("PARA CONSTRUCAO").adapted, true);
assert.equal(C.resolvePurpose("Para Construção").adapted, false);
assert.equal(C.resolvePurpose("Algo que não existe").original, "Algo que não existe");
assert.equal(C.resolvePurpose("Para Construção Conforme Construído").purpose, "");
C.EGRDT_OPTIONS.purposes.forEach((p) => assert.equal(C.resolvePurpose(p).purpose, p, `${p}: lista oficial é idempotente`));

// 2) buildEgrdtData usa a resolução (a grafia da LD não zera o campo).
const doc = "RL-5290.00-22313-91B-C1O-047";
const build = (purpose) => C.buildEgrdtData(doc, "A", `${doc}_A.pdf`, { document: doc, title: "T", discipline: "PLANEJAMENTO", format: "A4", documentType: "RL", purpose }, "N-1710", "A4");
assert.equal(build("PARA CONSTRUCAO").purpose, "Para Construção");
assert.equal(build("As Built").purpose, "Conforme Construído");
assert.equal(build("").purpose, "");

// 3) createPlan leva o propósito da LD à eGRDT e avisa sobre adaptação/ausência.
function plan(purpose, egrdtPurposeOverride) {
  const name = `${doc}_A.pdf`;
  const record = { document: doc, revision: "A", sheet: "N-1710", title: "RELATÓRIO", discipline: "PLANEJAMENTO", format: "A4", documentType: "RL", purpose };
  const finalName = C.proposedFileName(name, doc, "A", "N-1710");
  const files = [{ name, finalName, file: { name, size: 1 }, relativePath: name }];
  const egrdt = C.buildEgrdtData(doc, "A", finalName, record, "N-1710", "A4");
  if (egrdtPurposeOverride !== undefined) egrdt.purpose = egrdtPurposeOverride;
  const r = { document: doc, documentKey: C.key(doc), revision: "A", sheet: "N-1710", status: "Não Postado", sigemRevisionStatus: "Não Postado",
    decision: C.READY, record, purposeOriginalLd: purpose, files, finalName, name, egrdt };
  return E.createPlan([r], new Set([0]));
}
const ok = plan("Para Construção");
assert.equal(ok.items[0].purpose, "Para Construção");
assert.ok(!ok.warnings.some((w) => /propósito/i.test(w)), "propósito já oficial não gera aviso");

const adapted = plan("PARA CONSTRUCAO");
assert.equal(adapted.items[0].purpose, "Para Construção");
assert.ok(adapted.warnings.some((w) => /adaptado para “Para Construção”/.test(w)), "adaptação é avisada");

const unknown = plan("Algo que não existe");
assert.equal(unknown.items[0].purpose, "Algo que não existe", "valor da LD sem equivalente não é descartado em silêncio");
assert.ok(unknown.warnings.some((w) => /não consta na lista oficial/.test(w)));

const missing = plan("");
assert.equal(missing.items[0].purpose, "");
assert.ok(missing.warnings.some((w) => /não informa o propósito/.test(w)));

const diverged = plan("Para Construção", "Conforme Construído");
assert.ok(diverged.warnings.some((w) => /difere do descrito na LD/.test(w)), "edição manual divergente da LD fica registrada");
console.log("grdt_purpose: ok");
