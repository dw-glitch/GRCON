"use strict";
// Abas por revisão na relação de trabalho do PW: só recortam as linhas; nenhuma regra de contagem muda.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Core = require("../sigem_pw_dashboard_core.js");
const cache = new Map();
function importTs(file) {
  const resolved = path.resolve(__dirname, "..", file);
  if (cache.has(resolved)) return cache.get(resolved).exports;
  const module = { exports: {} }; cache.set(resolved, module);
  const code = ts.transpileModule(fs.readFileSync(resolved, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: resolved }).outputText;
  new Function("require", "module", "exports", code)((name) => name.startsWith(".") ? importTs(path.join(path.dirname(file), name + ".ts")) : require(name), module, module.exports);
  return module.exports;
}
global.window = { GrconSigemPwDashboard: Core };
const { computePwOperations, filterPwOperations } = importTs("src/react/sigem-pw/services/sigemPwOperations.ts");

const doc = (n) => `RL-5290.00-22313-ABC-C1O-${String(n).padStart(3, "0")}`;
const ref = (n) => ({ document: doc(n), revision: "0", status: "EMITIDO", documentClass: "N-1710", title: `Doc ${n}`, referenceSources: ["LD.xlsx"] });
const sig = (n, rev) => ({ document: doc(n), revision: rev, status: "Em análise" });
const pw = (n, rev, emission) => ({ document: doc(n), revision: rev, revisionComplete: rev, lastEmission: emission, state: "Liberado", company: "CSG" });
const state = {
  ld: { meta: { fileName: "LD" }, records: [1, 2, 3].map(ref) },
  sigem: { meta: { fileName: "C" }, records: [sig(1, "0"), sig(1, "A"), sig(2, "0"), sig(2, "A"), sig(2, "B"), sig(3, "0")] },
  pw: { meta: { fileName: "PW", companyColumn: "C" }, records: [pw(1, "0", "Sim"), pw(2, "0", "Previsto"), pw(2, "A", "Sim")], sourceRecords: [pw(1, "0", "Sim"), pw(2, "0", "Previsto"), pw(2, "A", "Sim")] },
  model: {}, analysisError: "",
};
const base = computePwOperations(state);
assert.equal(base.ready, true);
const all = filterPwOperations(base, {});
const byRevision = new Map();
for (const row of all.rows) byRevision.set(row.revision, (byRevision.get(row.revision) || 0) + 1);
assert.ok(byRevision.size >= 3, "há mais de uma revisão");

// Cada aba mostra só a própria revisão e as contagens das abas somam o total.
let sum = 0;
for (const [revision, count] of byRevision) {
  const tab = filterPwOperations(base, { revision });
  assert.equal(tab.rows.length, count, `aba ${revision}`);
  assert.ok(tab.rows.every((row) => row.revision === revision));
  sum += tab.rows.length;
}
assert.equal(sum, all.rows.length, "as abas somam o total");
// Sem aba (vazio) = comportamento de antes; revisão inexistente = nenhuma linha.
assert.deepEqual(filterPwOperations(base, { revision: "" }).totals, all.totals);
assert.equal(filterPwOperations(base, { revision: "Z" }).rows.length, 0);
// A aba combina com os demais filtros (escopo, classe, indicador) sem alterar as regras: Revisão 0 + aba 0 = escopo Revisão 0.
assert.deepEqual(filterPwOperations(base, { revisionScope: "revision0", revision: "0" }).totals, filterPwOperations(base, { revisionScope: "revision0" }).totals);
assert.equal(filterPwOperations(base, { revisionScope: "revision0", revision: "A" }).rows.length, 0, "Revisão 0 + aba A não tem linhas");
// Os totais da aba são os do motor, restritos às linhas da revisão.
const tabA = filterPwOperations(base, { revision: "A" });
assert.equal(tabA.totals.registered, tabA.totals.issue + tabA.totals.issued, "Cadastradas = a emitir + emitidas também por aba");

// Tela: abas com contagem, filtro por clique, escopo e limpar filtros voltam para "Todas".
const overview = fs.readFileSync(path.join(__dirname, "..", "src/react/sigem-pw/components/SigemPwManagerialOverview.tsx"), "utf8");
assert.match(overview, /className="spw-revision-tabs" role="group" aria-label="Revisão de documento"/);
assert.match(overview, /revisionTabs\.items\.length > 1 \|\| filters\.revision/, "com aba ativa o grupo não some");
assert.match(overview, /if \(filters\.revision && !counts\.has\(filters\.revision\)\) counts\.set\(filters\.revision, 0\)/, "aba ativa continua listada mesmo com 0");
assert.match(overview, /data-revision-tab=\{item\.key\} aria-pressed=\{filters\.revision === item\.key\}/);
assert.match(overview, /filterPwOperations\(base, \{ \.\.\.filters, revision: "" \}\)/, "contagem respeita os demais filtros");
assert.match(overview, /value\.revisionScope !== undefined && value\.revision === undefined/, "trocar o escopo limpa a aba");
assert.match(overview, /revision: ""\s*\}\);\s*setPage\(1\); broadcastRevisionScope\("all"\)/, "Limpar filtros limpa a aba");
console.log("sigem_pw_revision_tabs: OK");
