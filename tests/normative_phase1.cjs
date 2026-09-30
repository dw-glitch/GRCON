"use strict";

const assert = require("node:assert/strict");
const Applicability = require("../normative_applicability.js");
const Versions = require("../normative_version_registry.js");
const Registry = require("../normative_registry.js");
const Engine = require("../normative_rule_engine.js");

function check(name, fn) {
  try {
    fn();
    process.stdout.write(`✓ ${name}\n`);
  } catch (error) {
    process.stderr.write(`✗ ${name}: ${error && error.message || error}\n`);
    throw error;
  }
}

check("registro inicial contém N-2064, N-1710 e N-381 com revisão explícita", () => {
  const registry = Registry.create();
  const norms = registry.versions.list();
  assert.equal(norms.find((item) => item.norma === "N-2064").revision, "C");
  assert.equal(norms.find((item) => item.norma === "N-1710").revision, "N");
  assert.equal(norms.find((item) => item.norma === "N-381").revision, "M");
});

check("ET RNEST Rev. P é fonte contratual confirmada e escopada ao projeto", () => {
  const registry = Registry.create();
  const et = registry.versions.get("ET-5290.00-22000-912-1LV-001", "P");
  assert.equal(et.status, "source-confirmed");
  const rule = registry.getRule("ET5290P-7.1.7.3-NT-PREFIX");
  assert.equal(Applicability.matches(rule.applicability, { project: "RNEST" }), true);
  assert.equal(Applicability.matches(rule.applicability, { project: "OUTRO" }), false);
  assert.equal(rule.type, "contractual");
  assert.equal(rule.promotionState, "candidate");
});

check("regra N-1710 não se aplica fora do contexto N-1710", () => {
  const registry = Registry.create();
  const rule = registry.getRule("N1710-5.1-SEVEN-GROUPS");
  assert.equal(Applicability.matches(rule.applicability, { isN1710: false, discipline: "TUBULAÇÃO" }), false);
  assert.equal(Applicability.matches(rule.applicability, { isN1710: true, discipline: "TUBULAÇÃO" }), true);
});

check("registro de regra não sobrescreve silenciosamente o histórico", () => {
  const registry = Registry.create();
  const existing = registry.getRule("N2064-4.2.1-REVISION-ALPHABET");
  assert.equal(registry.registerRule(existing).ruleId, existing.ruleId);
  assert.throws(() => registry.registerRule({ ...existing, title: "Título divergente" }), /já existe com conteúdo diferente/i);
});

check("N-2064 C é detectada como divergente do catálogo de referência", () => {
  const registry = Registry.create();
  const n2064 = registry.versions.get("N-2064", "C");
  assert.equal(n2064.status, "catalog-mismatch");
  assert.equal(n2064.catalogRevision, "D");
});

check("norma sem revisão de catálogo permanece não confirmada", () => {
  const registry = Registry.create();
  const n1710 = registry.versions.get("N-1710", "N");
  assert.equal(n1710.status, "catalog-unconfirmed");
});

check("divergência entre arquivo e catálogo é detectada", () => {
  const versions = Versions.create([{
    norma: "N-9999",
    revision: "B",
    editionDate: "2026-01",
    catalogRevision: "C",
    catalogDate: "2026-09",
  }]);
  assert.equal(versions.get("N-9999", "B").status, "catalog-mismatch");
});

check("regra candidata nunca bloqueia produção", () => {
  const registry = Registry.create();
  const rule = registry.getRule("N2064-4.2.1-REVISION-ALPHABET");
  const result = Engine.evaluateRule(rule, {}, {
    "revision.alphabet": () => ({ valid: false, message: "Revisão inválida" }),
  });
  assert.equal(result.outcome, Engine.OUTCOMES.INFORMATION);
  assert.equal(result.enforced, false);
});

check("regra obrigatória ativa e confirmada pode bloquear", () => {
  const rule = {
    ...Registry.BASE_RULES[1],
    promotionState: "active",
    normStatus: "current",
    type: "mandatory",
    severity: "high",
  };
  const result = Engine.evaluateRule(rule, {}, {
    "revision.alphabet": () => ({ valid: false, found: "I", expected: "A-H/J-N/P-Z" }),
  });
  assert.equal(result.outcome, Engine.OUTCOMES.BLOCK);
  assert.equal(result.enforced, true);
});

check("vigência incerta degrada bloqueio para alerta", () => {
  const rule = {
    ...Registry.BASE_RULES[1],
    promotionState: "active",
    normStatus: "catalog-unconfirmed",
    type: "mandatory",
    severity: "high",
  };
  const result = Engine.evaluateRule(rule, {}, {
    "revision.alphabet": () => ({ valid: false }),
  });
  assert.equal(result.outcome, Engine.OUTCOMES.WARNING);
  assert.equal(result.enforced, false);
});

check("prática recomendada ativa gera alerta, não bloqueio", () => {
  const rule = {
    ruleId: "TEST-PR",
    norma: "N-TEST",
    revision: "A",
    section: "1",
    title: "Prática recomendada",
    type: "recommended",
    severity: "high",
    promotionState: "active",
    normStatus: "current",
    validatorId: "recommended.test",
    applicability: {},
    source: {},
  };
  const result = Engine.evaluateRule(rule, {}, { "recommended.test": () => false });
  assert.equal(result.outcome, Engine.OUTCOMES.WARNING);
});

check("resumo do motor separa conformidade, alerta, bloqueio e não aplicável", () => {
  const rules = [
    {
      ruleId: "A", norma: "N-X", revision: "A", section: "1", title: "A",
      type: "mandatory", severity: "high", promotionState: "active", normStatus: "current",
      validatorId: "a", applicability: {}, source: {},
    },
    {
      ruleId: "B", norma: "N-X", revision: "A", section: "2", title: "B",
      type: "recommended", severity: "medium", promotionState: "active", normStatus: "current",
      validatorId: "b", applicability: {}, source: {},
    },
    {
      ruleId: "C", norma: "N-X", revision: "A", section: "3", title: "C",
      type: "mandatory", severity: "high", promotionState: "active", normStatus: "current",
      validatorId: "c", applicability: { n1710Only: true }, source: {},
    },
  ];
  const summary = Engine.evaluate(rules, { isN1710: false }, {
    a: () => true,
    b: () => false,
    c: () => false,
  });
  assert.deepEqual(summary.counts, {
    compliant: 1,
    warnings: 1,
    blocks: 0,
    notApplicable: 1,
    information: 0,
  });
});

process.stdout.write("Normative Phase 1: OK\n");
