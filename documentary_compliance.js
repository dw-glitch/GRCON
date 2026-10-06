(function (root, factory) {
  const local = name => typeof module === 'object' && module.exports ? require(name) : null;
  const api = factory(root, root.TriagemCore || local('./core.js'), root.GrconNormativeRegistry || local('./normative_registry.js'), root.GrconNormativeVersionRegistry || local('./normative_version_registry.js'), root.GrconNormativeRuleEngine || local('./normative_rule_engine.js'), root.GrconN1710Parser || local('./n1710_parser.js'), root.GrconN2064Lifecycle || local('./n2064_revision_lifecycle.js'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GrconDocumentaryCompliance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, Core, Registry, Versions, Engine, Parser, Lifecycle) {
  'use strict';
  const VERSION = 'documentary-compliance-1';
  const versions = Versions.createVersionRegistry(Versions.SEED);
  const cache = new WeakMap();
  const text = value => String(value ?? '').trim();
  function check(input, context, evaluator) {
    const rule = Registry.normalizeRule({ status: 'active', overrideAllowed: false, severity: 'warning', type: 'mandatory',
      title: input.message, description: input.message, ...input });
    const result = Engine.evaluateRule(rule, context, evaluator, versions);
    return result.code === 'source_not_promotable'
      ? Object.freeze({ ...result, message: `${input.message} ${result.message}` }) : result;
  }
  function audit(input = {}) {
    const context = { ...input, document: text(input.document), documentFamily: input.documentFamily || (Core.isN1710Context(input.sheet, input.document) ? 'N-1710' : 'OUTROS') };
    const results = [];
    const contract = root.GrconCloud?.state?.contract;
    if (contract && contract.code !== 'UHDT-D' && contract.settings?.inheritLegacyRules !== true) {
      return Object.freeze({ ...Engine.createSnapshot([]), normativeValidationVersion: VERSION, engineVersion: Engine.VERSION,
        document: context.document, revision: text(input.revision), components: null, outcome: 'NÃO APLICÁVEL',
        information: Object.freeze([]), warnings: Object.freeze([]), lifecycleFindings: Object.freeze([]), policy: 'advisory',
        explanation: 'Regras normativas do contrato ainda não configuradas. Regras da UHDT não herdadas.' });
    }
    let components = null;
    if (context.documentFamily === 'N-1710') {
      const parsed = Parser.evaluate(context.document, { expectedCategory: input.documentType });
      components = parsed.groups;
      for (const item of parsed.checks) {
        results.push(check({ ruleId: item.id, norm: item.norm, revision: item.annexRevision || item.bodyRevision,
          section: item.section, message: item.message, severity: item.status === Parser.STATUS.UNVERIFIED ? 'info' : 'warning',
          type: item.status === Parser.STATUS.UNVERIFIED ? 'informational' : 'mandatory',
          applicability: { documentFamilies: ['N-1710'] }, source: { kind: 'pdf', label: item.annex ? `Anexo ${item.annex}` : 'Corpo N-1710', part: item.annex ? `Anexo ${item.annex}` : 'body' },
          correctionHint: 'Confira o componente na LD, no código e no anexo aplicável; mantenha eventual exceção contratual registrada.' }, context,
          () => ({ passed: item.status === Parser.STATUS.PASS ? true : item.status === Parser.STATUS.UNVERIFIED ? undefined : false, message: item.message, valueFound: item.value || '', valueExpected: item.expected || '' })));
      }
    }
    const revision = Core.revisionInfo(input.revision);
    for (const message of revision.warnings || []) results.push(check({ ruleId: 'n2064.revision.recommendation', norm: 'N-2064', revision: 'D', section: '4.2.3', message,
      severity: 'info', type: 'recommended', source: { kind: 'comparison', label: 'N-2064 D: fonte primária pendente', part: 'body' } }, context, () => ({ passed: false, message })));
    const hasLifecycleContext = input.previousRevision !== undefined || input.action || input.purposeChanged;
    const lifecycle = hasLifecycleContext ? Lifecycle.audit(input) : { errors: [], warnings: [] };
    if (hasLifecycleContext) {
      for (const [index, message] of [...lifecycle.errors, ...lifecycle.warnings].entries()) {
        results.push(check({ ruleId: `n2064.lifecycle.${index}`, norm: 'N-2064', revision: 'D', section: '4.1–5.3', message,
          source: { kind: 'comparison', label: 'N-2064 D: fonte primária pendente', part: 'body' }, correctionHint: message }, context, () => ({ passed: false, message })));
      }
    }
    // Nenhuma falha de interpretação ou fonte pendente altera o bloqueio operacional.
    const snapshot = Engine.createSnapshot(results);
    const warnings = results.filter(item => item.outcome === Engine.OUTCOME.WARNING && item.configuredSeverity !== 'info');
    const information = results.filter(item => item.outcome === Engine.OUTCOME.WARNING && item.configuredSeverity === 'info');
    return Object.freeze({ ...snapshot, normativeValidationVersion: VERSION, engineVersion: Engine.VERSION,
      document: context.document, revision: text(input.revision), components,
      outcome: !results.length ? 'NÃO APLICÁVEL' : snapshot.blocks.length ? 'BLOQUEIO' : warnings.length ? 'ALERTA' : 'CONFORME',
      information: Object.freeze(information), policy: 'advisory', warnings: Object.freeze(warnings),
      lifecycleFindings: Object.freeze([...lifecycle.errors, ...lifecycle.warnings]) });
  }
  function auditRow(row, item) {
    const data = item || row.egrdt || row.item || row;
    const input = { ...data, document: data.document || row.document, revision: data.revision || row.revision, sheet: row.sheet,
      action: row.documentaryAction || (/CANCEL/i.test(data.purpose || '') ? 'cancel' : ''), previousRevision: row.previousRevision,
      previouslyEmitted: row.previouslyEmitted ?? (row.grdt || row.sourceEgrdt ? true : undefined),
      purposeChanged: row.purposeChanged, replacementDocument: row.substituiDocumento, newRevision: row.newRevision };
    const signature = JSON.stringify(input) + versions.generation();
    const previous = cache.get(row);
    if (previous?.signature === signature) return previous.value;
    const value = audit(input);
    cache.set(row, { signature, value });
    row.normativeValidation = value;
    return value;
  }
  function summary(rows) {
    const counts = { compliant: 0, warnings: 0, blocks: 0, information: 0, notApplicable: 0 };
    for (const row of rows || []) {
      const value = auditRow(row);
      counts[value.outcome === 'NÃO APLICÁVEL' ? 'notApplicable' : value.outcome === 'BLOQUEIO' ? 'blocks' : value.outcome === 'ALERTA' ? 'warnings' : 'compliant']++;
      if (value.information.length) counts.information++;
    }
    return counts;
  }
  function combine(snapshots) {
    const values = (snapshots || []).filter(Boolean);
    if (!values.length) return null;
    const result = Engine.createSnapshot(values.flatMap(value => value.results || [...(value.warnings || []), ...(value.blocks || []), ...(value.information || [])]));
    const norms = new Map();
    values.forEach(value => (value.normsApplied || []).forEach(norm => norms.set(`${norm.norm}|${norm.part}|${norm.revision}`, norm)));
    return { ...result, normativeValidationVersion: VERSION, engineVersion: Engine.VERSION, policy: 'advisory',
      rulesChecked: [...new Set(values.flatMap(value => value.rulesChecked || []))], normsApplied: [...norms.values()],
      counts: values.reduce((counts, value) => { for (const key of Object.keys(counts)) counts[key] += value.counts?.[key] || 0; return counts; }, { compliant: 0, warnings: 0, blocks: 0, notApplicable: 0 }),
      warnings: result.warnings.filter(item => item.configuredSeverity !== 'info'), information: result.warnings.filter(item => item.configuredSeverity === 'info'),
      documents: values.map(value => ({ document: value.document, revision: value.revision, outcome: value.outcome, components: value.components, lifecycleFindings: value.lifecycleFindings })) };
  }
  return Object.freeze({ VERSION, versions, audit, auditRow, summary, combine });
});
