import assert from "node:assert/strict";
import { reconcileManagerial } from "../src/react/sigem-pw/services/sigemPwManagerial.ts";

const main = "CR-5290.00-22313-911-C1O-001";
const planned = "PR-5290.00-22313-122-C1O-002";
const outside = "PR-5290.00-22313-122-C1O-999";
const refs = [
  { document: main, canonicalDocument: main, documentKey: main, revision: "B", title: "Cronograma", status: "EMITIDO" },
  { document: planned, canonicalDocument: planned, documentKey: planned, revision: "0", title: "Plano", status: "EM EMISSÃO" },
  { document: outside, canonicalDocument: outside, documentKey: outside, revision: "0", status: "CANCELADO" },
];
const state = {
  ld: { meta: { fileName: "LD.xlsx" }, records: refs },
  pw: { meta: { companyColumn: "C" } },
  sigem: { meta: { fileName: "Consulta Geral" } },
  model: {
    normalizedPw: [
      { documentKey: main, document: main, revision: "0", lastEmission: "Não", state: "Cadastrado" },
      { documentKey: main, document: main, revision: "B", lastEmission: "Sim", state: "Cadastrado" },
      { documentKey: planned, document: planned, revision: "0", lastEmission: "Previsto", state: "Cadastrado" },
    ],
    normalizedSigem: [
      { documentKey: main, document: main, revision: "B", status: "Sem Comentários" },
    ],
  },
  result: { lists: { sigemN1710OutsideLd: [], pwN1710OutsideLd: [] } },
};
let report = reconcileManagerial(state);
assert.equal(report.ready, true);
assert.equal(report.summary.active, 2);
assert.equal(report.summary.registered, 2);
assert.equal(report.summary.emitted, 1);
assert.equal(report.summary.posted, 1);
assert.equal(report.summary.compliant, 1);
assert.equal(report.summary.pending, 0);
assert.equal(report.summary.cancelled, 1);
assert.equal(report.rows.find(r => r.code === planned)?.situation, "Em andamento");
assert.equal(report.rows.find(r => r.code === main)?.pwRevision, "B");

report = reconcileManagerial({ ...state, sigem: { meta: null, records: [] } });
assert.equal(report.ready, false);
assert.equal(report.summary.posted, null, "missing Consulta Geral must not be mistaken for zero postings");

report = reconcileManagerial({
  ...state,
  ld: { meta: { fileName: "LD.xlsx" }, records: [{ ...refs[0], referenceConflict: true }] },
});
assert.equal(report.summary.compliant, 0, "conflicting reference cannot be declared compliant");
assert.equal(report.summary.conflicts, 1);
console.log("SIGEM × PW: managerial KPIs, rev-B and missing-source safeguards OK");
