import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const entry = new URL("../src/react/sigem-pw/services/sigemPwManagerial.ts", import.meta.url);
const js = ts.transpileModule(readFileSync(entry, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function("exports", "module", "require", js)(module.exports, module, require);
const { breakdownManagerial } = module.exports;

const row = (sheet, situation, actionCode, action = actionCode) => ({ sheet, situation, actionCode, action });
const rows = [
  row("N-1710", "Em conformidade", "NONE"), row("N-1710", "Em conformidade", "NONE"),
  row("N-1710", "Com pendência", "REGISTER_PW", "Cadastrar no PW"), row("N-1710", "Com pendência", "REGISTER_PW", "Cadastrar no PW"),
  row("N-1710", "Em andamento", "ISSUE_PW", "Emitir no PW"),
  row("ET", "Com pendência", "POST_SIGEM", "Postar no SIGEM"), row("ET", "Em conformidade", "NONE"),
  row("", "Dados insuficientes", "LOAD_SOURCES", "Atualizar bases"),
  row("CV", "Cancelado", "CHECK_CANCELLATION", "Conferir cancelamento"),
];
const result = breakdownManagerial(rows);
assert.equal(result.considered, 8, "cancelado fica fora da conta");
assert.equal(result.cancelled, 1);
const byClass = Object.fromEntries(result.byClass.map((c) => [c.sheet, c]));
assert.equal(byClass["N-1710"].total, 5);
assert.equal(byClass["N-1710"].counts["Com pendência"], 2);
assert.equal(byClass["N-1710"].compliantPercent, 40);
assert.equal(byClass["ET"].total, 2);
assert.ok(byClass["Sem classe"], "documento sem aba entra em 'Sem classe'");
assert.equal(byClass["CV"], undefined, "classe só com cancelados não aparece");
// Cada documento considerado aparece em exatamente uma classe e uma situação.
assert.equal(result.byClass.reduce((n, c) => n + c.total, 0), result.considered);
result.byClass.forEach((c) => assert.equal(Object.values(c.counts).reduce((a, b) => a + b, 0), c.total));
assert.deepEqual(result.byClass.map((c) => c.sheet), ["N-1710", "ET", "Sem classe"], "ordenadas por tamanho");
// Providências: só o que exige ação, ordenadas por frequência; "sem ação" não entra.
assert.deepEqual(result.byAction.map((a) => [a.actionCode, a.count]), [["REGISTER_PW", 2], ["LOAD_SOURCES", 1], ["ISSUE_PW", 1], ["POST_SIGEM", 1]]);
assert.equal(result.byAction[0].actionCode, "REGISTER_PW");
assert.equal(result.byAction[0].withPending, 2);
assert.ok(!result.byAction.some((a) => a.actionCode === "NONE" || a.actionCode === "CHECK_CANCELLATION"));
// Vazio
const empty = breakdownManagerial([]);
assert.equal(empty.considered, 0);
assert.deepEqual(empty.byClass, []);
// Integração no painel gerencial: filtros por classe e providência
const overview = readFileSync(new URL("../src/react/sigem-pw/components/SigemPwManagerialOverview.tsx", import.meta.url), "utf8");
assert.match(overview, /filterPwOperations/);
assert.match(overview, /documentClass: event.target.value/);
assert.match(overview, /action: event.target.value/);
console.log("sigem_pw_breakdown: OK");
