"use strict";
// O gráfico colorido (barra segmentada + medidor) volta à visão do SIGEM × PW,
// alimentado pelos MESMOS totais dos cinco indicadores, da relação e do Excel.
// Nenhuma regra de contagem mora no gráfico.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const charts = read("src/react/sigem-pw/components/SigemPwKpiCharts.tsx");
const overview = read("src/react/sigem-pw/components/SigemPwManagerialOverview.tsx");

// Integração: usa os totais filtrados do relatório operacional e filtra a relação.
assert.match(overview, /import \{ SigemPwKpiCharts \}/);
assert.match(overview, /<SigemPwKpiCharts totals=\{report\.totals\} pairs=\{report\.rows\.length\} reconciliation=\{base\.reconciliation\}/);
assert.match(overview, /change\(\{ indicator: filters\.indicator === key \? "all" : key \}\)/, "clicar no gráfico filtra a relação");
assert.match(overview, /onRevisionScopeChange=\{\(value\) => change\(\{ revisionScope: value \}\)\}/);
assert.match(overview, /spw-operation-kpis/, "os cinco indicadores continuam");
// As quatro partes da barra são exatamente as ações operacionais, na mesma ordem de prioridade.
for (const key of ["issued", "issue", "registerSigem", "registerAbsent"]) assert.match(charts, new RegExp(`key: "${key}"`), `${key} na barra`);
assert.match(charts, /<SegmentedBar title="Trabalho da equipe PW" segments=\{pwSegments\} total=\{pairs\}/, "o total da barra é o número de pares do escopo");
assert.match(charts, /<Meter label="Constam nas LDs ativas" value=\{inLd\} total=\{consulted\}/);
assert.match(charts, /revisionScope === "revision0" \? reconciliation\.revision0 : reconciliation/, "conferência da Consulta Geral acompanha o filtro de revisão");
assert.match(charts, /<Meter label="Cadastradas no PW" value=\{totals\.registered\} total=\{pairs\}/, "quantidade cadastrada no PW no gráfico");
assert.doesNotMatch(charts, /reconcileManagerial|breakdownManagerial|ManagerialSummary/, "o gráfico não recalcula nada: só exibe os totais recebidos");
// Cor nunca é o único sinal: ícone, número e porcentagem por parte, mais tabela alternativa.
assert.match(charts, /ToneIcon/);
assert.match(charts, /Ver como tabela/);
// Regras novas intactas: o motor operacional continua sendo o de #403.
const ops = read("src/react/sigem-pw/services/sigemPwOperations.ts");
assert.match(ops, /export const PW_ACTIONS = \["Cadastrar no PW", "Emitir no PW", "Concluído"\] as const/);
assert.match(ops, /registerSigem|registerAbsent/);
// Nomenclatura didática: "pares" saiu da tela e do Excel; a unidade é "revisão de documento".
const workbook = read("src/react/sigem-pw/services/sigemPwCoordinatorWorkbook.ts");
for (const [name, source] of [["gráfico", charts], ["visão", overview], ["Excel", workbook], ["motor", ops]]) {
  const visible = source.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
  assert.doesNotMatch(visible.replace(/pairs|pair\(|inScopePairs|outsidePairs|seenPairs/g, ""), /\bpares?\b|\bPARES\b|par\(es\)/i, `${name}: a palavra "pares" não deve aparecer na tela nem no Excel`);
}
assert.match(overview, /Como ler os números/);
assert.match(overview, /Entenda os números/);
assert.match(overview, /2 revisões de documentos/);
for (const label of ["Constam no SIGEM", "A cadastrar no PW — já constam no SIGEM", "A cadastrar no PW — não constam no SIGEM", "Cadastradas no PW", "A emitir no PW", "Emitidas no PW"]) {
  assert.ok(ops.includes(label), `rótulo claro: ${label}`);
}

// Evolução e demais telas do SIGEM × PW usam o mesmo vocabulário: "revisão de documento", sem "doc+rev".
{
  const walk = (dir) => fs.readdirSync(path.join(__dirname, "..", dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : /\.(ts|tsx)$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
  const offenders = walk("src/react/sigem-pw").filter((file) => /doc\+rev|doc\. \+ revis|[Dd]ocumento \+ [Rr]evis/.test(read(file)));
  assert.deepEqual(offenders, [], "nenhuma tela do SIGEM × PW volta a usar 'documento + revisão' ou 'doc+rev'");
  const evolution = read("src/react/sigem-pw/evolution/SigemPwEvolutionApp.tsx");
  for (const label of ["Emitidas no PW", "Cadastradas no PW atual", "Não emitidas no PW atual", "Revisões de documentos novas"]) assert.ok(evolution.includes(label), `Evolução: ${label}`);
}
console.log("sigem_pw_kpi_charts: OK");
