(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./normative_applicability.js"));
  } else {
    root.NormativeRuleEngine = factory(root.NormativeApplicability);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Applicability) {
  "use strict";

  const OUTCOMES = Object.freeze({
    COMPLIANT: "CONFORME",
    WARNING: "ALERTA",
    BLOCK: "BLOQUEIO",
    NOT_APPLICABLE: "NÃO APLICÁVEL",
    INFORMATION: "INFORMAÇÃO",
  });

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function uncertainSource(rule) {
    const status = text(rule && rule.normStatus).toLowerCase();
    return ["catalog-unconfirmed", "catalog-mismatch", "unknown", "superseded", "cancelled"].includes(status);
  }

  function outcomeFor(rule, invalid) {
    if (!invalid) return OUTCOMES.COMPLIANT;
    if (uncertainSource(rule)) return OUTCOMES.WARNING;
    if (rule && (rule.type === "mandatory" || rule.type === "contractual")
        && ["critical", "high"].includes(text(rule.severity))) return OUTCOMES.BLOCK;
    return OUTCOMES.WARNING;
  }

  function normalizeValidatorResult(result) {
    if (result === true) return { valid: true };
    if (result === false) return { valid: false };
    const item = result && typeof result === "object" ? result : {};
    return {
      valid: item.valid !== false,
      message: text(item.message),
      found: item.found,
      expected: item.expected,
      dataSource: text(item.dataSource),
      overrideAllowed: item.overrideAllowed,
      details: item.details,
    };
  }

  function evaluateRule(rule, context, validators) {
    const applies = !Applicability || Applicability.matches(rule && rule.applicability, context);
    const base = {
      ruleId: text(rule && rule.ruleId),
      norma: text(rule && rule.norma),
      revision: text(rule && rule.revision),
      section: text(rule && rule.section),
      title: text(rule && rule.title),
      type: text(rule && rule.type),
      severity: text(rule && rule.severity),
      source: rule && rule.source || {},
      normStatus: text(rule && rule.normStatus),
      correctionHint: text(rule && rule.correctionHint),
    };

    if (!applies) {
      return { ...base, outcome: OUTCOMES.NOT_APPLICABLE, applies: false, message: "Regra fora do escopo deste documento." };
    }

    if (text(rule && rule.promotionState) !== "active") {
      return {
        ...base,
        outcome: OUTCOMES.INFORMATION,
        applies: true,
        enforced: false,
        message: "Regra catalogada, mas ainda não promovida para validação de produção.",
      };
    }

    const validatorId = text(rule && rule.validatorId);
    const validator = validators && validatorId ? validators[validatorId] : null;
    if (typeof validator !== "function") {
      return {
        ...base,
        outcome: OUTCOMES.INFORMATION,
        applies: true,
        enforced: false,
        message: validatorId
          ? `Validador “${validatorId}” ainda não implementado.`
          : "Regra sem validador executável.",
      };
    }

    let checked;
    try {
      checked = normalizeValidatorResult(validator(context || {}, rule));
    } catch (error) {
      return {
        ...base,
        outcome: OUTCOMES.WARNING,
        applies: true,
        enforced: false,
        message: `Falha ao executar a regra: ${error && error.message || "erro desconhecido"}`,
      };
    }

    const outcome = outcomeFor(rule, checked.valid === false);
    return {
      ...base,
      outcome,
      applies: true,
      enforced: outcome === OUTCOMES.BLOCK,
      message: checked.message || (checked.valid ? "Regra atendida." : "Regra não atendida."),
      found: checked.found,
      expected: checked.expected,
      dataSource: checked.dataSource,
      overrideAllowed: checked.overrideAllowed === undefined ? Boolean(rule && rule.overrideAllowed) : Boolean(checked.overrideAllowed),
      details: checked.details,
    };
  }

  function evaluate(rules, context, validators) {
    const results = (rules || []).map((rule) => evaluateRule(rule, context, validators));
    const counts = {
      compliant: results.filter((item) => item.outcome === OUTCOMES.COMPLIANT).length,
      warnings: results.filter((item) => item.outcome === OUTCOMES.WARNING).length,
      blocks: results.filter((item) => item.outcome === OUTCOMES.BLOCK).length,
      notApplicable: results.filter((item) => item.outcome === OUTCOMES.NOT_APPLICABLE).length,
      information: results.filter((item) => item.outcome === OUTCOMES.INFORMATION).length,
    };
    return { results, counts, hasBlock: counts.blocks > 0 };
  }

  return { OUTCOMES, uncertainSource, outcomeFor, normalizeValidatorResult, evaluateRule, evaluate };
});
