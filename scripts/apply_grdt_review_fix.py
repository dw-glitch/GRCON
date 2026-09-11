from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: esperado 1 trecho para substituição, encontrado {count}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# 1) Núcleo: normalização central do status SIGEM sem perder o texto original.
replace_once(
    "core.js",
    '''  function statusKind(value) {
    const s = norm(value);
''',
    '''  function normalizeSigemStatus(value) {
    const original = text(value);
    const originalKey = norm(original);
    if (originalKey === "EM WORKFLOW" || originalKey === "EM ANALISE") {
      return Object.freeze({
        original,
        normalized: "Em Análise",
        key: "EM ANALISE",
        equivalentTo: "Em Análise",
      });
    }
    return Object.freeze({
      original,
      normalized: original,
      key: originalKey,
      equivalentTo: "",
    });
  }

  function statusKind(value) {
    const s = normalizeSigemStatus(value).key;
''',
)

replace_once("core.js", '      "EM WORKFLOW": "pending",\n', "")

replace_once(
    "core.js",
    '''      // Em Análise é a única exceção ao avanço automático: diferente de Em
      // Workflow e dos demais retornos, o documento já está sob análise em
      // andamento no SIGEM. O GRCON nunca prepara uma revisão nova por cima
      // de uma análise em aberto — para aqui e marca Em análise (descartar)
      // para conferência manual, mesmo sem avaliar as revisões seguintes.
''',
    '''      // Em Análise e Em Workflow são equivalentes operacionalmente: ambos
      // representam uma análise em andamento no SIGEM. O texto original vindo
      // da Consulta Geral permanece em displayStatus; apenas a regra de decisão
      // usa a normalização central para impedir uma nova revisão sobre análise aberta.
''',
)

replace_once(
    "core.js",
    '''        reason = traversed.length
          ? `A revisão ${revision} está com status oficial Em Análise na Colar SIGEM, depois de ${traversed.map((item) => `${item.revision} (${item.status})`).join(", ")}. O GRCON não avança para uma nova revisão enquanto a análise estiver em aberto.`
          : `A revisão ${revision} está com status oficial Em Análise na Colar SIGEM. O GRCON não avança para uma nova revisão enquanto a análise estiver em aberto.`;
''',
    '''        reason = traversed.length
          ? `A revisão ${revision} está com status oficial ${currentStatus} na Colar SIGEM, depois de ${traversed.map((item) => `${item.revision} (${item.status})`).join(", ")}. Para as regras do GRCON, este status equivale a Em Análise; não é preparada uma nova revisão enquanto a análise estiver em aberto.`
          : `A revisão ${revision} está com status oficial ${currentStatus} na Colar SIGEM. Para as regras do GRCON, este status equivale a Em Análise; não é preparada uma nova revisão enquanto a análise estiver em aberto.`;
''',
)

replace_once(
    "core.js",
    '''      status: displayStatus || "Sem status",
      decision,
''',
    '''      status: displayStatus || "Sem status",
      statusOriginal: displayStatus || "Sem status",
      statusOperational: normalizeSigemStatus(displayStatus || "Sem status").normalized,
      decision,
''',
)

replace_once(
    "core.js",
    '''    statusKind,
    normalizeRevision,
''',
    '''    normalizeSigemStatus,
    statusKind,
    normalizeRevision,
''',
)

# 2) Contratos: decisão usa status operacional; mensagens continuam vendo o original.
replace_once(
    "grcon_contracts.js",
    '''    const status = norm(item.status);
''',
    '''    const status = norm(item.statusOperational || item.status);
''',
)

# 3) App: Revisar por disciplina deixa de ser um bloqueio de seleção.
replace_once(
    "app.js",
    '''  function rowCanBeSelected(row) {
    if (!row || row.blockCode === "discipline_confirmation" || row.disciplineResolution && row.disciplineResolution.requiresConfirmation) return false;
    return Boolean(!row.hardBlock || manualAllocationOverrideAllowed(row));
  }

  function rowCanBeEdited(row) {
''',
    '''  function rowRequiresManualResolution(row) {
    return Boolean(row && (
      row.blockCode === "discipline_confirmation"
      || row.disciplineResolution && row.disciplineResolution.requiresConfirmation
    ));
  }

  function rowCanBeSelected(row) {
    if (!row) return false;
    // "Revisar" é uma pendência operacional, não um bloqueio por si só.
    // Apenas hardBlock continua impedindo a seleção, salvo a exceção controlada
    // de Não Alocado que já exige escolha manual explícita do operador.
    return Boolean(!row.hardBlock || manualAllocationOverrideAllowed(row));
  }

  function rowCanBeEdited(row) {
''',
)

replace_once(
    "app.js",
    '''      const selectionTitle = manualAllocationOverrideAllowed(row)
        ? "Marcar manualmente para incluir na GRDT; a LD continuará registrada como Não Alocado"
        : selectable ? "Marcar para incluir na GRDT final" : "Bloqueado por uma condição que não admite inclusão manual";
''',
    '''      const selectionTitle = manualAllocationOverrideAllowed(row)
        ? "Marcar manualmente para incluir na GRDT; a LD continuará registrada como Não Alocado"
        : rowRequiresManualResolution(row)
          ? "Pode incluir na GRDT; antes de gerar, abra Editar GRDT e conclua a pendência indicada"
          : selectable ? "Marcar para incluir na GRDT final" : "Bloqueado por uma condição técnica que não admite inclusão manual";
''',
)

# Auditoria das duas alterações manuais mais críticas antes da emissão.
replace_once(
    "app.js",
    '''  function applyRevisionOverride(row, rawValue) {
    if (!row) return { ok: false, error: "Documento inválido." };
    const normalized = C.normalizeRevision(rawValue);
''',
    '''  function auditManualGrdtChange(row, field, previousValue, nextValue, reason) {
    if (!row || String(previousValue || "") === String(nextValue || "")) return;
    const logger = window.GrconAuditLog && window.GrconAuditLog.log;
    if (typeof logger !== "function") return;
    const detail = JSON.stringify({
      document: row.document || row.name || "",
      field,
      previousValue: previousValue || "",
      nextValue: nextValue || "",
      reason: reason || "intervenção manual na triagem GRDT",
      at: new Date().toISOString(),
    });
    Promise.resolve(logger("ajuste_manual_grdt", detail)).catch(() => null);
  }

  function applyRevisionOverride(row, rawValue) {
    if (!row) return { ok: false, error: "Documento inválido." };
    const previousRevision = row.revision || "";
    const normalized = C.normalizeRevision(rawValue);
''',
)

replace_once(
    "app.js",
    '''    row.revision = normalized;
    row.revisionManual = normalized !== suggested;
''',
    '''    row.revision = normalized;
    row.revisionManual = normalized !== suggested;
    auditManualGrdtChange(row, "Revisão enviada na GRDT", previousRevision, normalized, "revisão definida manualmente antes da geração");
''',
)

replace_once(
    "app.js",
    '''        if (resolution && resolution.valid) {
          row.egrdt.discipline = resolution.discipline;
''',
    '''        if (resolution && resolution.valid) {
          const previousDiscipline = row.egrdt.discipline || row.disciplineResolution && row.disciplineResolution.discipline || "";
          row.egrdt.discipline = resolution.discipline;
''',
)

replace_once(
    "app.js",
    '''          row.disciplineOriginalLd = resolution.disciplineOriginalLd;
          row.disciplineResolution = resolution;
          if (row.blockCode === "discipline_confirmation") {
''',
    '''          row.disciplineOriginalLd = resolution.disciplineOriginalLd;
          row.disciplineResolution = resolution;
          auditManualGrdtChange(row, "Disciplina oficial eGRDT", previousDiscipline, resolution.discipline, "disciplina confirmada manualmente a partir da lista oficial");
          if (row.blockCode === "discipline_confirmation") {
''',
)

# 4) Testes de regressão: equivalência de status, contratos, disciplina e seleção.
Path("tests/grdt_review_workflow.cjs").write_text(
    '''"use strict";

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

assert.match(appSource, /function rowRequiresManualResolution\\(row\\)/);
assert.match(appSource, /return Boolean\\(!row\\.hardBlock \\|\\| manualAllocationOverrideAllowed\\(row\\)\\);/);
assert.doesNotMatch(appSource, /if \\(!row \\|\\| row\\.blockCode === "discipline_confirmation"[^\\n]*return false;/);
assert.match(appSource, /Pode incluir na GRDT; antes de gerar, abra Editar GRDT/);
assert.match(appSource, /ajuste_manual_grdt/);
assert.match(coreSource, /statusOriginal: displayStatus \\|\\| "Sem status"/);
assert.match(coreSource, /statusOperational: normalizeSigemStatus/);
assert.match(contractSource, /item\\.statusOperational \\|\\| item\\.status/);
assert.match(emissionSource, /Abra Editar GRDT e escolha uma opção da lista oficial/);

console.log("OK: Revisar manual + Em Workflow=Em Análise validados.");
''',
    encoding="utf-8",
)

package = Path("package.json")
package_text = package.read_text(encoding="utf-8")
needle = "node tests/analyze_runtime_resilience.cjs && node tests/sigem_pw_history.cjs"
if package_text.count(needle) != 1:
    raise SystemExit("package.json: ponto de inserção do novo teste não encontrado de forma inequívoca")
package.write_text(
    package_text.replace(
        needle,
        "node tests/analyze_runtime_resilience.cjs && node tests/grdt_review_workflow.cjs && node tests/sigem_pw_history.cjs",
        1,
    ),
    encoding="utf-8",
)

changelog = Path("CHANGELOG.md")
current = changelog.read_text(encoding="utf-8")
entry = '''## 2026-09-11 — Revisão manual da GRDT e equivalência Em Workflow / Em Análise

- `Revisar` deixou de bloquear a seleção quando a pendência é corrigível manualmente; disciplina pendente pode ser selecionada e precisa ser resolvida em `Editar GRDT` antes da emissão.
- `Em Workflow` agora usa a mesma regra operacional de `Em Análise`, preservando o status original e registrando também `statusOperational`.
- Escolhas manuais de disciplina e revisão passam pelo catálogo/normalizador existentes e geram evento de auditoria local quando disponível.
- Adicionado teste de regressão `tests/grdt_review_workflow.cjs`.

'''
if "## 2026-09-11 — Revisão manual da GRDT" not in current:
    changelog.write_text(entry + current, encoding="utf-8")
