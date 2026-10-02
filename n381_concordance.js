(function (root, factory) {
  const local = name => typeof module === 'object' && module.exports ? require(name) : null;
  const api = factory(root.GrconNormativeRegistry || local('./normative_registry.js'), root.GrconNormativeVersionRegistry || local('./normative_version_registry.js'), root.GrconNormativeRuleEngine || local('./normative_rule_engine.js'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GrconN381Concordance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Registry, Versions, Engine) {
  'use strict';
  const VERSION = 'n381-concordance-1';
  const versions = Versions.createVersionRegistry(Versions.SEED);
  const text = value => String(value ?? '').trim();
  const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').toUpperCase();
  const fields = {
    documentNumber: /^(?:NUMERO(?: DO DOCUMENTO)?|DOCUMENTO|CODIGO(?: DO DOCUMENTO)?|N[º°O.]*)\s*[:=]\s*(.+)$/,
    revision: /^(?:REVISAO(?: ATUAL)?|REV\.?|REVISION)\s*(?:[:=]\s*|\s+)([#A-Z0-9]+)\s*$/,
    title: /^(?:TITULO|TITLE)\s*[:=]\s*(.+)$/,
    category: /^(?:CATEGORIA|TIPO DE DOCUMENTO)\s*[:=]\s*(.+)$/,
    revisionDate: /^(?:DATA(?: DA EMISSAO| DA REVISAO)?|DATE)\s*[:=]\s*(.+)$/,
    purpose: /^(?:FINALIDADE|PROPOSITO)\s*[:=]\s*(.+)$/,
    executor: /^(?:EXECUCAO|EXECUTOR|EXEC\.?|ELABORACAO)\s*[:=]\s*(.+)$/,
    checker: /^(?:VERIFICACAO|VERIFICADOR|VERIF\.?)\s*[:=]\s*(.+)$/,
    approver: /^(?:APROVACAO|APROVADOR|APROV\.?)\s*[:=]\s*(.+)$/,
    project: /^(?:PROJETO|PROGRAMA|PROJECT)\s*[:=]\s*(.+)$/,
    classification: /^(?:CLASSIFICACAO|GRAU DE SIGILO)\s*[:=]\s*(.+)$/,
    sheet: /^(?:FOLHA|PAGINA)\s*[:=]\s*(\d+\s*(?:DE|\/)\s*\d+)$/,
    format: /^FORMATO\s*[:=]\s*(.+)$/,
  };
  // Only explicit labels are evidence. Ambiguous repeated values, body prose,
  // filenames and revision-history tables are never inferred as a current legend.
  function extractPage(lines, pageNumber = 1, dimensions = {}) {
    const values = {}, ambiguous = [];
    const rawLines = Array.isArray(lines) ? lines : text(lines).split(/\r?\n/);
    const input = rawLines.flatMap(line => norm(line).split(/\s+(?=(?:REVISAO(?: ATUAL)?|REV\.?|FOLHA|PAGINA|TITULO|CATEGORIA|FORMATO|CLASSIFICACAO|PROJETO)\s*[:=])/));
    for (const [field, pattern] of Object.entries(fields)) {
      const candidates = [...new Set(input.map(line => norm(line).match(pattern)?.[1]).filter(Boolean).map(text).filter(value => field !== 'documentNumber' || /^[A-Z0-9][A-Z0-9._/-]{3,}$/.test(value)))];
      if (candidates.length === 1) values[field] = candidates[0];
      else if (candidates.length > 1) ambiguous.push(field);
    }
    return { pageNumber, values, ambiguous, textReadable: input.some(line => /[A-Za-zÀ-ÿ0-9]{3}/.test(text(line))), ...dimensions };
  }
  function rule(id, title, section, severity, type = 'mandatory') {
    return Registry.normalizeRule({ ruleId: id, norm: 'N-0381', revision: 'M', section, title, description: title,
      type, severity, status: 'active', source: { kind: type === 'operational' ? 'operational' : 'pdf', part: 'body', label: type === 'operational' ? 'Concordância operacional GRCON; campos da N-381 M' : 'N-381 M, 05/2022, errata 06/2022' },
      correctionHint: 'Confira a legenda e a fonte indicada; corrija o arquivo ou o valor de destino antes de gerar.', overrideAllowed: false });
  }
  function audit(options = {}) {
    const results = [], expected = options.expected || {}, pages = options.inspection?.pages || [];
    const scope = options.applicability === 'confirmed';
    function check(id, title, section, passed, found, wanted, severity = 'warning', type = 'mandatory') {
      const r = rule(id, title, section, severity, type);
      results.push(Engine.evaluateRule(r, { document: expected.documentNumber }, () => ({ passed, message: title, valueFound: text(found), valueExpected: text(wanted) }), options.versions || versions));
    }
    if (options.applicability === 'not-applicable') {
      check('n381.scope', 'Documento declarado fora do escopo da N-381; apenas concordância operacional será verificada.', '1.3–1.6', true, 'Não aplicável', 'Aplicabilidade contratual');
    } else if (!scope) {
      check('n381.scope', 'Aplicabilidade contratual da N-381 não confirmada; requisitos normativos permanecem como alertas.', '1.3–1.6', undefined, 'Não confirmada', 'Confirmar projeto/contrato');
    }
    if (options.cover && options.applicability !== 'not-applicable') {
      const cover = options.cover;
      for (const [field, label, section] of [['executor', 'Execução', '3.5.4 campo 8'], ['checker', 'Verificação', '3.5.4 campo 9'], ['approver', 'Aprovação', '3.5.4 campo 10'], ['revisionDate', 'Data', '3.5.4 campo 13']]) {
        check(`n381.cover.${field}`, `${label}: ${text(cover[field]) ? 'campo informado' : 'preencha o campo da capa'}.`, section, Boolean(text(cover[field])), cover[field], 'Campo preenchido', scope ? 'block' : 'warning');
      }
      if (text(cover.executor) && text(cover.checker)) check('n381.cover.distinct-responsibles', 'Execução e verificação devem ter responsáveis diferentes.', '3.5.4 campos 8–9, nota 2', norm(cover.executor) !== norm(cover.checker), `${cover.executor} / ${cover.checker}`, 'Responsáveis distintos', scope ? 'block' : 'warning');
      if (text(cover.revision) && norm(cover.revision) !== '0') check('n381.cover.original-emission', 'Confira a preservação dos dados da emissão original (revisão 0). O preenchimento da nova capa não comprova o histórico de responsáveis e datas.', '3.5.4 campos 22–25, notas 1–2', undefined, 'Histórico de emissão original não comprovado', 'Dados da emissão original preservados; exceção de versão preliminar exige contexto');
      for (const [field, label] of [['project', 'Projeto'], ['classification', 'Classificação documental']]) {
        if (!text(cover[field])) check(`n381.cover.${field}`, `${label}: sem evidência suficiente; confira a legenda original e as condições do contrato.`, '3.5.4 campos 3/27', undefined, 'Não identificado', 'Conferência manual; classificação pode estar no AIP');
      }
    }
    if (!pages.length) check('n381.pdf.unavailable', 'Conferência interna inconclusiva: não há texto de PDF disponível.', '3.5.1/3.5.4', undefined, options.inspection?.reason || 'Sem extração', 'PDF textual com legenda identificável');
    if (options.inspection?.status === 'partial') check('n381.pdf.partial', 'Extração parcial: páginas não lidas precisam de conferência manual.', '3.5.1', undefined, `${pages.length} de ${options.inspection.totalPages}`, 'Todas as páginas');
    for (const page of pages) {
      const replaced = options.replaceFirstPage && page.pageNumber === 1;
      const prefix = `n381.page.${page.pageNumber}`;
      if (!page.textReadable || (!page.values.documentNumber && !page.values.revision)) {
        check(`${prefix}.inconclusive`, `Página ${page.pageNumber}: legenda não identificada com segurança; conferência manual necessária.`, '3.5.1', undefined, page.textReadable ? 'Texto sem legenda inequívoca' : 'Sem texto legível', 'Número e revisão explicitamente identificados');
      }
      if (page.textReadable && (page.values.documentNumber || page.values.revision)) {
        for (const [field, label] of [['documentNumber', 'número do documento'], ['revision', 'revisão atual']]) {
          if (!page.values[field]) check(`${prefix}.missing.${field}`, `Página ${page.pageNumber}: ${label} não identificado com segurança; confira a legenda manualmente.`, '3.5.4 campos 15–16', undefined, 'Não identificado', 'Valor atual inequívoco');
        }
      }
      for (const field of page.ambiguous || []) check(`${prefix}.ambiguous.${field}`, `Página ${page.pageNumber}: ${field} possui mais de um valor; não foi tomada decisão bloqueante.`, '3.5.4', undefined, 'Ambíguo', 'Valor atual inequívoco');
      for (const [field, section] of [['documentNumber', '3.5.4 campo 15'], ['revision', '3.5.4 campo 16'], ['title', '3.5.4 campo 5'], ['category', '3.5.4 campo 12'], ['revisionDate', '3.5.4 campo 13'], ['purpose', '3.5.4 campo 19'], ['executor', '3.5.4 campo 8'], ['checker', '3.5.4 campo 9'], ['approver', '3.5.4 campo 10'], ['project', '3.5.4 campo 3'], ['classification', '3.5.4 campo 27'], ['format', '3.5.4 campo 26']]) {
        const found = page.values[field], wanted = expected[field];
        if (!found || !wanted) continue;
        const same = norm(found) === norm(wanted);
        const critical = field === 'documentNumber' || (field === 'revision' && !options.revisionBySheet);
        const label = { revision: 'revisão', documentNumber: 'número do documento', title: 'título', category: 'categoria', revisionDate: 'data', purpose: 'finalidade', executor: 'execução', checker: 'verificação', approver: 'aprovação', project: 'projeto', classification: 'classificação', format: 'formato' }[field];
        check(`${prefix}.${field}`, `Página ${page.pageNumber}: ${label} ${same ? 'consistente' : 'divergente'}${replaced ? '; a capa de origem será substituída' : options.revisionBySheet && field === 'revision' ? '; controle de revisão por folha declarado' : ''}.`, section, same, found, wanted, critical && !replaced ? 'block' : 'warning', 'operational');
      }
      if (scope && page.widthMm && page.heightMm) {
        const small = Math.min(page.widthMm, page.heightMm), large = Math.max(page.widthMm, page.heightMm);
        check(`${prefix}.minimum-format`, `Página ${page.pageNumber}: dimensões físicas ${small >= 208 && large >= 295 ? 'compatíveis com o mínimo A4' : 'menores que A4; confira o formato'}.`, '3.1.1–3.1.3', small >= 208 && large >= 295, `${page.widthMm.toFixed(1)} × ${page.heightMm.toFixed(1)} mm`, 'A4 ou maior', 'warning');
      }
      if (page.values.sheet && !replaced) {
        const sheet = page.values.sheet.match(/^(\d+)\s*(?:DE|\/)\s*(\d+)$/);
        if (sheet && options.inspection.totalPages) check(`${prefix}.sheet`, `Página ${page.pageNumber}: total declarado na legenda ${Number(sheet[2]) === options.inspection.totalPages ? 'consistente' : 'divergente'}.`, '3.5.4 campo 14', Number(sheet[2]) === options.inspection.totalPages, sheet[2], options.inspection.totalPages);
      }
    }
    // Different revisions in LD/Consulta/old emissions are historical references,
    // not evidence that the newly selected manual revision is invalid.
    for (const [index, reference] of (options.references || []).entries()) {
      if (norm(reference.documentNumber || reference.document) !== norm(expected.documentNumber)) continue;
      if (reference.title && expected.title) check(`n381.reference.${index}.title`, `Título × ${text(reference.source) || 'fonte de referência'}: ${norm(reference.title) === norm(expected.title) ? 'consistente' : 'divergente'}.`, '3.5.4 campo 5', norm(reference.title) === norm(expected.title), reference.title, expected.title, 'warning', 'operational');
    }
    return { ...Engine.createSnapshot(results), concordanceVersion: VERSION, extraction: { status: options.inspection?.status || 'unavailable', totalPages: options.inspection?.totalPages || 0, inspectedPages: pages.length }, applicability: options.applicability || 'unknown', revisionBySheet: options.revisionBySheet === true, references: (options.references || []).map(r => ({ source: text(r.source), document: text(r.documentNumber || r.document), revision: text(r.revision), title: text(r.title) })) };
  }
  return Object.freeze({ VERSION, versions, extractPage, audit });
});
