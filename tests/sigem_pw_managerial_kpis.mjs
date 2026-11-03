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


// Cadastro e emissão são situações distintas; CV não depende do PW.
const a = "CR-5290.00-22313-911-C1O-001"; // cadastrado e emitido
const b = "CR-5290.00-22313-911-C1O-002"; // cadastrado, não emitido (Previsto)
const c = "CR-5290.00-22313-911-C1O-003"; // sem cadastro no PW
const d = "CV-5290.00-22313-122-C1O-004"; // CV: não aplicável ao PW
const e = "CR-5290.00-22313-911-C1O-005"; // cancelado: fora do universo
const report = reconcileManagerial(state(
  [ref(a), ref(b), ref(c), ref(d), ref(e, { status: "CANCELADO" })],
  [pw(a, "A", "Sim"), pw(b, "A", "Previsto")],
  [sigem(a), sigem(b)],
));
const s = report.summary;
assert.equal(s.active, 4, "cancelado não compõe o universo");
assert.equal(s.registered, 2);
assert.equal(s.emitted, 1);
assert.equal(s.pwApplicable, 3, "CV e cancelados não dependem do PW");
assert.equal(s.awaitingRegistration, 1, "apenas C aguarda cadastro");
assert.equal(s.registeredNotEmitted, 1, "apenas B está cadastrado e não emitido");
assert.equal(s.pwApplicable, s.awaitingRegistration + s.registeredNotEmitted + 1, "universo PW = aguardando + cadastrado/não emitido + emitido");
{
  const none = reconcileManagerial(state([ref(a)], [], []));
  assert.equal(none.summary.awaitingRegistration, 1);
  const unready = reconcileManagerial({ ...state([ref(a)], [], []), pw: { meta: null, records: [] } });
  assert.equal(unready.summary.awaitingRegistration, null, "base ausente nunca vira zero confirmado");
  assert.equal(unready.summary.registeredNotEmitted, null);
}
// Coluna ABA: a aba da LD de origem (filtro por classe de código no Excel).
{
  const withSheet = reconcileManagerial(state([ref(a, { sheetName: "N-1710" }), ref(d, { sheetName: "CV" }), ref(b, { documentClass: "ET", sheetName: "" })], [], []));
  assert.deepEqual(withSheet.rows.map(r => r.sheet), ["N-1710", "CV", "ET"]);
}
// Segmentos do gráfico PW somam o universo que depende do PW.
assert.equal(s.pwApplicable - s.awaitingRegistration - s.registeredNotEmitted, 1, "emitidos = restante");
console.log("sigem_pw_managerial_kpis: universo, cadastro, emissão, aguardando cadastro e CV/cancelados OK");
