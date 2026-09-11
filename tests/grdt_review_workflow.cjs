"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Core = require("../core.js");
const Contracts = require("../grcon_contracts.js");
const Discipline = require("../discipline_resolver.js");

const workflowVariants = ["EM WORKFLOW", "Em Workflow", "em workflow", "Em workflow", " Em Workflow "];
for (const value of workflowVariants) {
  const normalized = Core.normalizeSigemStatus(value);
  assert.equal(normalized.normalized, "Em Análise", `normalização de ${JSON.stringify(value)}`);
  assert.equal(normalized.key, "EM ANALISE", `chave operacional de ${JSON.stringify(value)}`);
  assert.equal(Core.statusKind(value), "analysis", `statusKind de ${JSON.stringify(value)}`);
}
assert.equal(Core.statusKind("Em Análise"), "analysis");
assert.equal(Core.statusKind("Recusado"), "advance");
assert.equal(Core.normalizeSigemStatus("Recusado").normalized, "Recusado");

const original = "Em Workflow";
const operational = Core.normalizeSigemStatus(original).normalized;
assert.equal(
  Contracts.inferReasonCode({ status: original, statusOperational: operational, decision: "descartar", revision: "A" }),
  Contracts.CODES.IN_ANALYSIS_RECENT,
  "contratos devem tratar Em Workflow como Em Análise sem trocar o texto original",
);

const mixedOperationalStatuses = [
  ["Não Postado", "not_posted"],
  ["Em Análise", "analysis"],
  ["Em Workflow", "analysis"],
  ["Recusado", "advance"],
  ["Conforme Construído", "advance"],
];
for (const [status, expectedKind] of mixedOperationalStatuses) {
  assert.equal(Core.statusKind(status), expectedKind, `lote misto: ${status}`);
}

const manualDiscipline = Discipline.resolve(
  "5900.00.00.00-AAA-CV-TESTE-001",
  { discipline: "Disciplina não mapeada", sheet: "CV", source: "LD_001.xlsx", row: 10 },
  { sheetName: "CV", manualDiscipline: "QUALIDADE" },
);
assert.equal(manualDiscipline.valid, true);
assert.equal(manualDiscipline.requiresConfirmation, false);
assert.equal(manualDiscipline.discipline, "QUALIDADE");
assert.equal(manualDiscipline.manual, true);
assert.equal(manualDiscipline.disciplineOriginalLd, "Disciplina não mapeada");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const coreSource = fs.readFileSync(path.join(root, "core.js"), "utf8");
const contractSource = fs.readFileSync(path.join(root, "grcon_contracts.js"), "utf8");
const emissionSource = fs.readFileSync(path.join(root, "emission.js"), "utf8");

assert.match(appSource, /function rowRequiresManualResolution\(row\)/);
assert.match(appSource, /return Boolean\(!row\.hardBlock \|\| manualAllocationOverrideAllowed\(row\)\);/);
assert.doesNotMatch(appSource, /if \(!row \|\| row\.blockCode === "discipline_confirmation"[^\n]*return false;/);
assert.match(appSource, /Pode incluir na GRDT; antes de gerar, abra Editar GRDT/);
assert.match(appSource, /ajuste_manual_grdt/);
assert.match(coreSource, /statusOriginal: displayStatus \|\| "Sem status"/);
assert.match(coreSource, /statusOperational: normalizeSigemStatus/);
assert.match(contractSource, /item\.statusOperational \|\| item\.status/);
assert.match(emissionSource, /Abra Editar GRDT e escolha uma opção da lista oficial/);

// Filtros e virtualização trabalham com índices-fonte de state.results. Assim,
// selecionar/editar uma linha não depende da posição visual depois do filtro ou scroll.
assert.match(appSource, /for \(let index = 0; index < state\.results\.length; index \+= 1\)/);
assert.match(appSource, /return filteredResultIndices\(\)\.map\(\(index\) => state\.results\[index\]\)/);
assert.match(appSource, /visibleIndices: indices\.slice\(start, end\)/);
assert.match(appSource, /const index = Number\(rowElement\.dataset\.index\);[\s\S]{0,160}const row = state\.results\[index\];/);
assert.match(appSource, /state\.selected = new Set\(snapshot\.selectedIndices \|\| \[\]\)/);

console.log("OK: Revisar manual + Em Workflow=Em Análise + lote misto + persistência por índice-fonte validados.");
