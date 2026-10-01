(function (root, factory) {
  const local = name => typeof module === 'object' && module.exports ? require(name) : null;
  const api = factory(root.GrconNormativeRegistry || local('./normative_registry.js'), root.GrconNormativeVersionRegistry || local('./normative_version_registry.js'), root.GrconNormativeApplicability || local('./normative_applicability.js'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GrconNormativeRuleEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (R, V, A) {
  'use strict';
  if (!R || !V || !A) throw new Error('Infraestrutura normativa incompleta.');
  const VERSION = 'normative-engine-2';
  const OUTCOME = Object.freeze({ COMPLIANT: 'CONFORME', WARNING: 'ALERTA', BLOCK: 'BLOQUEIO', NOT_APPLICABLE: 'NÃO APLICÁVEL' });
  const text = value => String(value ?? '').trim();
  function base(rule, context, extra = {}) {
    return Object.freeze({ ruleId: rule.ruleId, norm: rule.norm, revision: rule.revision, section: rule.section,
      ruleType: rule.type, configuredSeverity: rule.severity, source: rule.source, document: text(context?.document),
      message: '', valueFound: '', valueExpected: '', overrideAllowed: false, correctionHint: text(rule.correctionHint), ...extra });
  }
  function evaluateRule(rule, context, evaluator, versions) {
    const applicability = A.evaluate(rule, context);
    if (applicability.status === A.STATUS.NOT_APPLICABLE) return base(rule, context, { outcome: OUTCOME.NOT_APPLICABLE, code: 'not_applicable', message: applicability.reason, applicability: applicability.status });
    if (applicability.status === A.STATUS.UNDETERMINED) return base(rule, context, { outcome: OUTCOME.WARNING, code: 'applicability_undetermined', message: applicability.reason, applicability: applicability.status, missingContext: applicability.missing });
    const part = rule.source?.part || 'body';
    const entry = versions.get(rule.norm, part);
    const decision = versions.promotionDecision(entry || rule.norm, part);
    const provenance = { sourceStatus: entry?.status || 'missing', applicability: applicability.status };
    if (!decision.allowed) return base(rule, context, { ...provenance, outcome: OUTCOME.WARNING, code: 'source_not_promotable', message: decision.reason });
    // Uma fonte ativa de outra revisão não torna vigente a regra antiga.
    if (text(rule.revision).toUpperCase() !== text(entry.revision).toUpperCase()) return base(rule, context, { ...provenance, outcome: OUTCOME.WARNING, code: 'rule_revision_mismatch', message: `Regra Rev. ${rule.revision} diverge da fonte Rev. ${entry.revision}; decisão bloqueante não foi tomada.` });
    if (typeof evaluator !== 'function') return base(rule, context, { ...provenance, outcome: OUTCOME.WARNING, code: 'evaluator_missing', message: 'Regra cadastrada sem avaliador; nenhuma decisão bloqueante foi tomada.' });
    let raw;
    try { raw = evaluator(context, rule) || {}; }
    catch (_) { return base(rule, context, { ...provenance, outcome: OUTCOME.WARNING, code: 'evaluator_failed', message: 'Não foi possível concluir esta verificação. Confira os dados antes de emitir.' }); }
    if (typeof raw.passed !== 'boolean') return base(rule, context, { ...provenance, outcome: OUTCOME.WARNING, code: 'evaluation_undetermined', message: text(raw.message) || 'Evidência insuficiente para decidir esta regra.', valueFound: text(raw.valueFound), valueExpected: text(raw.valueExpected) });
    if (raw.passed) return base(rule, context, { ...provenance, outcome: OUTCOME.COMPLIANT, code: text(raw.code || 'compliant'), message: text(raw.message || 'Regra atendida.'), valueFound: text(raw.valueFound), valueExpected: text(raw.valueExpected) });
    const canBlock = rule.status === 'active' && rule.severity === 'block' && !['recommended', 'informational'].includes(rule.type);
    return base(rule, context, { ...provenance, outcome: canBlock ? OUTCOME.BLOCK : OUTCOME.WARNING, code: text(raw.code || (canBlock ? 'rule_failed' : 'rule_warning')), message: text(raw.message || rule.description), valueFound: text(raw.valueFound), valueExpected: text(raw.valueExpected), overrideAllowed: canBlock && rule.overrideAllowed === true });
  }
  function snapshot(results, meta = {}) {
    const entries = Array.isArray(results) ? results : [], norms = new Map();
    for (const item of entries) if (item.norm && item.outcome !== OUTCOME.NOT_APPLICABLE) {
      const part = item.source?.part || 'body';
      norms.set(`${item.norm}|${part}|${item.revision}`, Object.freeze({ norm: item.norm, part, revision: item.revision, sourceStatus: item.sourceStatus || '' }));
    }
    return Object.freeze({ normativeValidationVersion: VERSION, generatedAt: text(meta.generatedAt) || new Date().toISOString(),
      rulesChecked: Object.freeze([...new Set(entries.map(item => item.ruleId))]), results: Object.freeze([...entries]),
      warnings: Object.freeze(entries.filter(item => item.outcome === OUTCOME.WARNING)), blocks: Object.freeze(entries.filter(item => item.outcome === OUTCOME.BLOCK)),
      overrides: Object.freeze([]), normsApplied: Object.freeze([...norms.values()]),
      counts: Object.freeze({ compliant: entries.filter(item => item.outcome === OUTCOME.COMPLIANT).length, warnings: entries.filter(item => item.outcome === OUTCOME.WARNING).length, blocks: entries.filter(item => item.outcome === OUTCOME.BLOCK).length, notApplicable: entries.filter(item => item.outcome === OUTCOME.NOT_APPLICABLE).length }) });
  }
  function createEngine(options = {}) {
    const registry = options.registry || R.createRegistry(), versions = options.versionRegistry || V.createVersionRegistry(V.SEED), evaluators = new Map(Object.entries(options.evaluators || {}));
    return Object.freeze({ registry, versionRegistry: versions,
      registerEvaluator: (id, fn) => { if (typeof fn !== 'function') throw new Error('Avaliador deve ser função.'); evaluators.set(text(id), fn); },
      evaluate: (context = {}, filters = {}) => Object.freeze(registry.list({ status: 'active', ...filters }).map(rule => evaluateRule(rule, context, evaluators.get(rule.ruleId), versions))), createSnapshot: snapshot });
  }
  return Object.freeze({ VERSION, OUTCOME, evaluateRule, createSnapshot: snapshot, createEngine });
});
