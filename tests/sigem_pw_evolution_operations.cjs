"use strict";
// A Evolução mostra os MESMOS seis indicadores da Visão gerencial, por base salva, com a variação
// desde a base anterior. Este teste garante a paridade: as mesmas bases têm de dar os mesmos totais
// pelo painel gerencial (estado do módulo) e pela Evolução (snapshots salvos), em Revisão 0 e Todas.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Core = require("../sigem_pw_dashboard_core.js");
const Evo = require("../sigem_pw_evolution_core.js");

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
const { buildEvolutionOperations } = importTs("src/react/sigem-pw/evolution/services/evolutionOperations.ts");

const doc = (n) => `RL-5290.00-22313-ABC-C1O-${String(n).padStart(3, "0")}`;
const ref = (n) => ({ document: doc(n), revision: "0", status: "EMITIDO", documentClass: "N-1710", title: `Documento ${n}`, referenceSources: ["LD.xlsx"] });
const sig = (n, rev) => ({ document: doc(n), revision: rev, status: "Em análise" });
const pw = (n, rev, emission, company = "CSG") => ({ document: doc(n), revision: rev, revisionComplete: rev, lastEmission: emission, state: emission === "Previsto" ? "Previsto" : "Liberado", company });

const ld = { meta: { fileName: "LDs ativas" }, records: [1, 2, 3, 4, 5, 6].map(ref) };
// Base anterior: pouco SIGEM, PW só previsto. Base atual: mais revisões, algumas emitidas.
const sigemOld = [sig(1, "0"), sig(2, "0"), sig(3, "0")];
const pwOld = [pw(1, "0", "Previsto"), pw(2, "0", "Previsto")];
const sigemNew = [sig(1, "0"), sig(1, "A"), sig(2, "0"), sig(3, "0"), sig(3, "A"), sig(4, "0"), sig(5, "")];
const pwNew = [
  pw(1, "0", "Sim"), pw(1, "A", "Previsto"), pw(2, "0", "Previsto"), pw(3, "0", "Sim"),
  pw(4, "", "Previsto"), // previsto sem revisão: comprova cadastro do código
  pw(6, "0", "Sim", "OUTRA"), // empresa fora de CSG/QTM não comprova cadastro
];

function dashboardState(sigemRecords, pwRecords) {
  return { ld, sigem: { meta: { fileName: "C.xlsx" }, records: sigemRecords }, pw: { meta: { fileName: "PW.csv", companyColumn: "C" }, records: pwRecords, sourceRecords: pwRecords }, model: {}, analysisError: "" };
}
function snapshot(system, records, name, importedAt) {
  const universe = Evo.buildLdUniverse(ld.records, []);
  const built = Evo.buildSnapshot(system, { meta: { fileName: name, importedAt, sourceRowCount: records.length, recordCount: records.length, companyColumn: system === "pw" ? "C" : undefined }, records, sourceRecords: system === "pw" ? records : undefined }, universe, { snapshotId: `${system}:${name}` });
  return { ...built, importedAt };
}
const sigemPrev = snapshot("sigem", sigemOld, "C-antiga.xlsx", "2026-11-01T10:00:00Z");
const sigemCur = snapshot("sigem", sigemNew, "C-nova.xlsx", "2026-11-04T10:00:00Z");
const pwPrev = snapshot("pw", pwOld, "PW-antiga.csv", "2026-11-01T10:00:00Z");
const pwCur = snapshot("pw", pwNew, "PW-nova.csv", "2026-11-04T10:00:00Z");

for (const scope of ["all", "revision0"]) {
  const gerencialAtual = filterPwOperations(computePwOperations(dashboardState(sigemNew, pwNew)), { revisionScope: scope });
  const gerencialAnterior = filterPwOperations(computePwOperations(dashboardState(sigemOld, pwOld)), { revisionScope: scope });
  const view = buildEvolutionOperations({ ld, scope, sigemCurrent: sigemCur, pwCurrent: pwCur, sigemPrevious: sigemPrev, pwPrevious: pwPrev });
  assert.equal(view.ready, true, view.reason);
  for (const key of ["sigem", "registerSigem", "registerAbsent", "registered", "issue", "issued"]) {
    assert.equal(view.current[key], gerencialAtual.totals[key], `${scope}: ${key} atual igual ao da Visão gerencial`);
    assert.equal(view.previous[key], gerencialAnterior.totals[key], `${scope}: ${key} anterior igual ao da Visão gerencial`);
  }
  assert.equal(view.current.revisions, gerencialAtual.rows.length, `${scope}: revisões no escopo`);
  assert.equal(view.previous.revisions, gerencialAnterior.rows.length);
  assert.equal(view.current.registered, view.current.issue + view.current.issued, "Cadastradas = a emitir + emitidas");
}

// Valores esperados (regras do #403): previsto sem revisão cadastra o código; outra empresa não comprova cadastro.
{
  const all = buildEvolutionOperations({ ld, scope: "all", sigemCurrent: sigemCur, pwCurrent: pwCur, sigemPrevious: sigemPrev, pwPrevious: pwPrev });
  assert.equal(all.current.issued, 2, "emitidas: 1 rev 0 e 3 rev 0");
  assert.ok(all.current.registered >= all.current.issued);
  assert.ok(all.movement.newlyIssued >= 2, "as duas emissões novas aparecem como movimento");
  assert.ok(all.movement.newInSigem >= 1);
  const rev0 = buildEvolutionOperations({ ld, scope: "revision0", sigemCurrent: sigemCur, pwCurrent: pwCur, sigemPrevious: sigemPrev, pwPrevious: pwPrev });
  assert.ok(rev0.current.revisions < all.current.revisions, "revisão 0 mostra menos revisões que todas");
}

// Sem base anterior: só a situação atual, sem inventar variação.
{
  const solo = buildEvolutionOperations({ ld, scope: "all", sigemCurrent: sigemCur, pwCurrent: pwCur, sigemPrevious: null, pwPrevious: null });
  assert.equal(solo.ready, true); assert.equal(solo.previous, null); assert.equal(solo.movement, null);
  assert.deepEqual(solo.previousUsed, { sigem: false, pw: false });
}
// Só PW anterior: o SIGEM atual vale nos dois lados e o aviso diz isso.
{
  const half = buildEvolutionOperations({ ld, scope: "all", sigemCurrent: sigemCur, pwCurrent: pwCur, sigemPrevious: null, pwPrevious: pwPrev });
  assert.deepEqual(half.previousUsed, { sigem: false, pw: true });
  assert.equal(half.previous.sigem, half.current.sigem, "SIGEM igual nos dois lados quando não há SIGEM anterior");
}
// Sem LD ou sem bases: indisponível, nunca zeros enganosos.
assert.equal(buildEvolutionOperations({ ld: undefined, scope: "all", sigemCurrent: sigemCur, pwCurrent: pwCur, sigemPrevious: null, pwPrevious: null }).ready, false);
assert.equal(buildEvolutionOperations({ ld, scope: "all", sigemCurrent: null, pwCurrent: pwCur, sigemPrevious: null, pwPrevious: null }).ready, false);

// Telas: painel novo ligado à Evolução, escopo único do módulo e vocabulário da Visão gerencial.
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const app = read("src/react/sigem-pw/evolution/SigemPwEvolutionApp.tsx");
const panel = read("src/react/sigem-pw/evolution/EvolutionOperationsPanel.tsx");
const overview = read("src/react/sigem-pw/components/SigemPwManagerialOverview.tsx");
const adapter = read("src/react/sigem-pw/evolution/services/sigemPwEvolutionAdapter.ts");
const bootstrap = read("sigem_pw_dashboard_bootstrap.js");
assert.match(app, /<EvolutionOperationsPanel/);
assert.match(adapter, /buildEvolutionOperations\(/);
assert.match(adapter, /state\.operations = operationsView\(\)/);
for (const label of ["Constam no SIGEM", "A cadastrar no PW — já constam no SIGEM", "A cadastrar no PW — não constam no SIGEM", "Cadastradas no PW", "A emitir no PW", "Emitidas no PW"]) {
  assert.ok(panel.includes(label), `Evolução usa o rótulo da Visão gerencial: ${label}`);
}
assert.match(panel, /desde a base anterior/);
assert.doesNotMatch(panel.replace(/revisions|\/\/.*$/gm, ""), /\bpares?\b/i, "sem 'pares' na tela");
// Revisão 0 / Todas é uma escolha só: Visão gerencial e Evolução trocam pelo mesmo evento.
assert.match(overview, /grcon:sigem-pw-revision-scope-changed/);
assert.match(overview, /broadcastRevisionScope\(value\.revisionScope\)/);
assert.match(overview, /addEventListener\(REVISION_SCOPE_EVENT/);
// O botão Evolução abre "Auditoria avançada" onde a seção mora.
assert.match(bootstrap, /details\.open = true/);
console.log("sigem_pw_evolution_operations: OK");
