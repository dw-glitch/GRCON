const assert = require("node:assert/strict");
const Registry = require("../normative_registry.js");
const Versions = require("../normative_version_registry.js");
const Applicability = require("../normative_applicability.js");
const Engine = require("../normative_rule_engine.js");

const versions = Versions.createVersionRegistry(Versions.SEED);

assert.equal(Versions.norm("N-381"), "N-0381");
assert.equal(versions.get("N-1710", "Anexo A").revision, "W");
assert.equal(versions.get("N-1710", "Anexo B").revision, "CJ");
assert.equal(versions.get("N-1710", "Anexo G").revision, "CN");

const n2064 = versions.promotionDecision("N-2064", "body");
assert.equal(n2064.allowed, false);
assert.equal(n2064.code, "unconfirmed");

const n1710 = versions.promotionDecision("N-1710", "body");
assert.equal(n1710.allowed, true);

const sourceMissing = versions.promotionDecision("N-1692", "body");
assert.equal(sourceMissing.allowed, false);
assert.equal(sourceMissing.code, "source_missing");

const pipe = Registry.normalizeRule({
  ruleId: "test.pipe",
  norm: "N-1692",
  revision: "D",
  section: "4",
  title: "Pipe",
  description: "Scope",
  type: "mandatory",
  severity: "block",
  status: "active",
  applicability: { disciplines: ["TUBULAÇÃO"] },
  source: { part: "body" },
});
assert.equal(Applicability.evaluate(pipe, { discipline: "ELÉTRICA" }).status, Applicability.STATUS.NOT_APPLICABLE);
assert.equal(Applicability.evaluate(pipe, {}).status, Applicability.STATUS.UNDETERMINED);
assert.equal(Applicability.evaluate(pipe, { discipline: "tubulacao" }).status, Applicability.STATUS.APPLICABLE);

const registry = Registry.createRegistry();
registry.register({
  ruleId: "test.required",
  norm: "N-1710",
  revision: "N",
  section: "5.1",
  title: "Sete grupos",
  description: "Código N-1710 precisa respeitar a estrutura aplicável.",
  type: "mandatory",
  severity: "block",
  status: "active",
  applicability: { documentFamilies: ["N-1710"] },
  source: { part: "body" },
});
registry.register({
  ruleId: "test.recommended",
  norm: "N-1710",
  revision: "N",
  section: "1.3",
  title: "Aplicação recomendada a fabricante",
  description: "Prática recomendada não pode se tornar bloqueio apenas pela severidade configurada.",
  type: "recommended",
  severity: "block",
  status: "active",
  source: { part: "body" },
});
registry.register({
  ruleId: "test.outdated",
  norm: "N-2064",
  revision: "C",
  section: "4.1.1",
  title: "Fonte desatualizada",
  description: "Texto local antigo não pode bloquear como se fosse a revisão vigente.",
  type: "mandatory",
  severity: "block",
  status: "active",
  source: { part: "body" },
});
registry.register({
  ruleId: "test.source-missing",
  norm: "N-1692",
  revision: "D",
  section: "4",
  title: "Texto não auditado",
  description: "Revisão conhecida no catálogo sem texto-fonte auditado.",
  type: "mandatory",
  severity: "block",
  status: "active",
  source: { part: "body" },
});

const engine = Engine.createEngine({
  registry,
  versionRegistry: versions,
  evaluators: {
    "test.required": () => ({ passed: false }),
    "test.recommended": () => ({ passed: false }),
    "test.outdated": () => ({ passed: false }),
    "test.source-missing": () => ({ passed: false }),
  },
});

const results = engine.evaluate({ document: "RL-X", documentFamily: "N-1710" });
const byId = Object.fromEntries(results.map((item) => [item.ruleId, item]));

assert.equal(byId["test.required"].outcome, Engine.OUTCOME.BLOCK);
assert.equal(byId["test.recommended"].outcome, Engine.OUTCOME.WARNING);
assert.equal(byId["test.outdated"].outcome, Engine.OUTCOME.WARNING);
assert.equal(byId["test.outdated"].code, "source_not_promotable");
assert.equal(byId["test.source-missing"].outcome, Engine.OUTCOME.WARNING);
assert.equal(byId["test.source-missing"].code, "source_not_promotable");

const missingContext = engine.evaluate({ document: "RL-X" }).find((item) => item.ruleId === "test.required");
assert.equal(missingContext.outcome, Engine.OUTCOME.WARNING);
assert.equal(missingContext.code, "applicability_undetermined");

const snapshot = engine.createSnapshot(results, { generatedAt: "2026-09-30T18:00:00.000Z" });
assert.equal(snapshot.counts.blocks, 1);
assert.equal(snapshot.counts.warnings, 3);

console.log("normative_registry: OK — fonte desatualizada/ausente não bloqueia e prática recomendada permanece alerta.");
