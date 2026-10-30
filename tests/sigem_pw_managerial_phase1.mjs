import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const entry = new URL("../src/react/sigem-pw/services/sigemPwManagerial.ts", import.meta.url);
const js = ts.transpileModule(readFileSync(entry, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function("exports", "module", "require", js)(module.exports, module, require);
const { reconcileManagerial, assessSigemReview } = module.exports;

const code = "CR-5290.00-22313-911-C1O-001";
const cv = "CV-5290.00-22313-122-C1O-001";
const cve = "CVE-5290.00-22313-122-C1O-002";
const ref = (document, extra = {}) => ({
  documentKey: document, canonicalDocument: document, document,
  documentClass: document.startsWith("CV-") ? "CV" : "N-1710",
  title: "Documentação sintética", revision: "A", status: "EMITIDO", ...extra,
});
const pw = (document, rev = "A", emission = "Sim", extra = {}) => ({
  documentKey: document, document, revision: rev, state: "Cadastrado", lastEmission: emission, ...extra,
});
const sigem = (document, rev = "A", status = "Sem Comentários", extra = {}) => ({
  documentKey: document, document, revision: rev, status, ...extra,
});
const state = (refs, pwRows = [], sigemRows = []) => ({
  ld: { meta: { fileName: "LD-de-teste.xlsx" }, records: refs },
  pw: { meta: { companyColumn: "C" }, records: pwRows },
  sigem: { meta: { fileName: "Consulta Geral atual" }, records: sigemRows },
  model: { normalizedPw: pwRows, normalizedSigem: sigemRows },
  result: { lists: { sigemN1710OutsideLd: [], pwN1710OutsideLd: [] } },
});
const only = input => {
  const report = reconcileManagerial(input);
  assert.equal(report.rows.length, 1);
  return { row: report.rows[0], summary: report.summary, ready: report.ready };
};

assert.equal(assessSigemReview("Sem Comentários"), "favorable");
assert.equal(assessSigemReview("Com Comentários"), "remarks");
assert.equal(assessSigemReview("Em análise"), "pending");
assert.equal(assessSigemReview("Em Workflow"), "pending");
assert.equal(assessSigemReview("Recusado"), "rejected");
assert.equal(assessSigemReview("Conforme Construído"), "unknown");

{
  const { row, summary } = only(state([ref(cv)], [], [sigem(cv)]));
  assert.equal(row.pwNotApplicable, true);
  assert.equal(row.situation, "Em conformidade", "CV posted and approved must not need PW");
  assert.equal(row.actionCode, "NONE");
  assert.equal(summary.compliant, 1);
  assert.equal(summary.registered, 0);
  assert.equal(summary.emitted, 0);
}
{
  const { row, summary } = only(state([ref(cv)], [], [sigem(cv, "A", "Em análise")]));
  assert.equal(row.actionCode, "WAIT_REVIEW", "CV must not be instructed to register/issue in PW");
  assert.equal(summary.pending, 1);
}
{
  const { row } = only(state([ref(cv)], [], []));
  assert.equal(row.actionCode, "POST_SIGEM", "CV without SIGEM needs SIGEM action only");
}
{
  const { row } = only(state([ref(cve, { documentClass: "Não classificado" })], [], [sigem(cve)]));
  assert.equal(row.pwNotApplicable, false, "CVE must not be mistaken for CV");
  assert.equal(row.actionCode, "REGISTER_PW");
}
{
  const { row, summary } = only(state([ref(code)], [pw(code)], [
    sigem(code, "B", "Recusado"), sigem(code, "A", "Sem Comentários"),
  ]));
  assert.equal(row.sigemRevision, "A", "displayed SIGEM revision must be the assessed revision");
  assert.equal(row.sigemStatus, "Sem Comentários", "status and revision must be from same record");
  assert.equal(row.situation, "Em conformidade");
  assert.equal(summary.compliant, 1);
}
{
  const { row } = only(state([ref(code)], [pw(code)], [sigem(code, "B", "Recusado")]));
  assert.equal(row.sigemPosted, true);
  assert.equal(row.sigemRevision, "B");
  assert.equal(row.sigemStatus, "", "never show another revision's status in the main cell");
  assert.equal(row.sigemReviewOutcome, "other-revision");
  assert.equal(row.actionCode, "ALIGN_SIGEM_REVISION");
}
{
  const { row } = only(state([ref(code)], [pw(code)], [
    sigem(code, "A", "Sem Comentários"), sigem(code, "A", "Recusado"),
  ]));
  assert.equal(row.sigemReviewOutcome, "rejected", "without dates a refusal prevents false compliance");
  assert.equal(row.sigemStatus, "Recusado");
  assert.equal(row.actionCode, "REVIEW_REJECTION");
}
{
  const { row } = only(state([ref(code)], [pw(code)], [
    sigem(code, "A", "Recusado", { stateChangedAt: "2026-01-01T10:00:00Z" }),
    sigem(code, "A", "Sem Comentários", { stateChangedAt: "2026-01-05T10:00:00Z" }),
  ]));
  assert.equal(row.sigemReviewOutcome, "favorable", "explicit newer source evidence can supersede older refusal");
  assert.equal(row.sigemStatus, "Sem Comentários");
  assert.equal(row.situation, "Em conformidade");
}
{
  const { row } = only(state([ref(code)], [pw(code)], [sigem(code, "A", "Com Comentários")]));
  assert.equal(row.actionCode, "ADDRESS_REMARKS");
  assert.equal(row.situation, "Com pendência");
}
{
  const { row } = only(state([ref(code)], [pw(code)], [sigem(code, "A", "Em Workflow")]));
  assert.equal(row.sigemReviewOutcome, "pending");
  assert.equal(row.actionCode, "WAIT_REVIEW");
}
{
  const { row, summary } = only(state([ref(code)], [pw(code)], [sigem(code, "A", "Conforme Construído")]));
  assert.equal(row.actionCode, "CONFIRM_SIGEM_STATUS");
  assert.equal(summary.compliant, 0);
}
{
  const { row } = only(state([ref(code, { revision: "" })], [pw(code)], [sigem(code)]));
  assert.equal(row.actionCode, "CONFIRM_REFERENCE_REVISION", "unknown ref revision is not PW mismatch");
  assert.equal(row.situation, "Dados insuficientes");
}
{
  const { row, summary } = only(state([ref(code)], [
    pw(code, "B", "Sim"), pw(code, "Rev. A", "Sim"),
  ], [sigem(code, "Rev. A")]));
  assert.equal(row.pwRevision, "Rev. A", "choose emitted PW row matching reference");
  assert.equal(row.sigemReviewOutcome, "favorable");
  assert.equal(summary.compliant, 1);
}
{
  const report = reconcileManagerial(state([ref(code), ref(code)], [pw(code)], [sigem(code)]));
  assert.equal(report.rows.length, 1, "document-level KPIs cannot double count duplicate reference rows");
  assert.equal(report.summary.active, 1);
}
{
  const { row } = only(state([ref(code)], [], [sigem(code)]));
  assert.equal(row.actionCode, "REGISTER_PW", "normal N-1710 remains PW dependent");
}
console.log("SIGEM × PW Phase 1: CV exemptions, revision evidence, review precedence, action codes and unique KPI rules OK");
