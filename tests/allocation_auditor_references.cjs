'use strict';
// Etapa 3 — fontes, normas e referências documentais do Robô Auditor de Alocações.
// Cada bloco abaixo prova um critério de aceite: catálogo funcional, revisões não confundidas, origem registrada,
// falta de referência sem falsa conformidade, bloqueios visíveis, rastreabilidade integrada ao motor, nada normativo inventado.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../allocation_auditor_references.js');
const C = require('../allocation_auditor_core.js');
const Norms = require('../vendor/recon/allocation_normative_rules.js');
const inventory = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/allocation-auditor-source-inventory.json'), 'utf8'));
const CONTRACT = 'UHDT-D';
const build = (extra = {}) => R.buildCatalog({ contract: CONTRACT, inventory, ...extra });
const entry = (catalog, id) => catalog.entries.find(e => e.id === id);
const codes = e => e.blockers.map(b => b.code);

// 1. Localizado ≠ carregado ≠ validado ≠ homologado (escada em ordem; nada sobe sem o degrau anterior).
{
  const base = build();
  assert.equal(entry(base, 'caminho-data-book@E').level, 'localizado', 'arquivo encontrado não é carregado');
  assert.deepEqual(codes(entry(base, 'caminho-data-book@E')), ['REF-NAO-CARREGADA']);
  const loaded = build({ loadedBases: { databook: { name: 'Caminho Data Book Rev.E' } } });
  assert.equal(entry(loaded, 'caminho-data-book@E').level, 'carregado');
  const validated = build({ loadedBases: { databook: true }, validations: [{ kind: 'caminho-data-book', revision: 'E', by: 'Qualidade', at: '2026-11-06', evidence: 'Conferido com a planilha original' }] });
  assert.equal(entry(validated, 'caminho-data-book@E').level, 'validado');
  const homologated = build({ loadedBases: { databook: true }, validations: [{ kind: 'caminho-data-book', revision: 'E', by: 'Qualidade', at: '2026-11-06', evidence: 'ok' }], homologations: [{ kind: 'caminho-data-book', revision: 'E', by: 'Fiscalização', at: '2026-11-07' }] });
  assert.equal(entry(homologated, 'caminho-data-book@E').level, 'homologado');
  // Validação sem o que validar (nada carregado) não habilita nada.
  const orphan = build({ validations: [{ kind: 'caminho-data-book', revision: 'E', by: 'Qualidade', at: '2026-11-06', evidence: 'ok' }] });
  assert.equal(entry(orphan, 'caminho-data-book@E').level, 'localizado');
  assert.ok(codes(entry(orphan, 'caminho-data-book@E')).includes('REF-VALIDACAO-SEM-CARGA'));
  // Validação sem responsável ou sem evidência é ignorada; homologação exige validação antes.
  const weak = build({ loadedBases: { databook: true }, validations: [{ kind: 'caminho-data-book', revision: 'E', by: '', evidence: 'ok' }, { kind: 'caminho-data-book', revision: 'E', by: 'X', evidence: '' }], homologations: [{ kind: 'caminho-data-book', revision: 'E', by: 'Fiscalização', at: '2026-11-07' }] });
  assert.equal(entry(weak, 'caminho-data-book@E').level, 'carregado');
}

// 2. Inventário real: nenhum arquivo fica sem classe, e a revisão só vem do nome ou de validação por hash (nunca presumida).
{
  const kinds = inventory.files.map(f => R.classifyFile(f));
  assert.equal(kinds.filter(k => k.kind === 'desconhecido').length, 0, 'todo arquivo do inventário foi classificado');
  const et = inventory.files.filter(f => R.classifyFile(f).kind === 'et-codificacao');
  assert.equal(et.length, 4, 'quatro arquivos da ET');
  assert.deepEqual(et.map(f => R.classifyFile(f).revision).sort(), ['N', 'P', 'Q', 'R'], 'revisões N, P, Q e R separadas pelo nome do arquivo');
  const n1710Pdf = inventory.files.find(f => /^N-1710/.test(f.name));
  assert.equal(R.classifyFile(n1710Pdf).revision, null, '"(8)" no nome é contador de download, não revisão');
  // Arquivo sem revisão no nome: bloqueio explícito; validação por hash atribui a revisão.
  const anon = { files: [{ name: 'ET-5290.00-22000-912-1LV-001 - DEFINIÇÃO DE CODIFICAÇÃO DE DOCUMENTOS.pdf', sha256: 'a'.repeat(64), bytes: 10 }] };
  const unnamed = R.buildCatalog({ contract: CONTRACT, inventory: anon });
  const orphan = unnamed.entries.find(e => e.kind === 'et-codificacao' && !e.revision);
  assert.ok(codes(orphan).includes('REF-REVISAO-NAO-IDENTIFICADA'), 'sem revisão: não usar como N, P, Q ou R');
  const assigned = R.buildCatalog({ contract: CONTRACT, inventory: anon, validations: [{ kind: 'et-codificacao', revision: 'Q', sha256: 'a'.repeat(64), by: 'Qualidade', at: '2026-11-06', evidence: 'Capa do PDF informa Rev. Q' }] });
  const q = entry(assigned, 'et-codificacao@Q');
  assert.ok(q && q.files.some(f => f.sha256 === 'a'.repeat(64)) && /validação por hash/.test(q.files[0].revisionSource));
  // Anexo III — Apêndice A não foi localizado no inventário: aparece como ausente, com o bloqueio dito.
  const eap = entry(build(), 'anexo-iii-apendice-a@sem-revisao');
  assert.equal(eap.level, 'ausente');
  assert.deepEqual(codes(eap), ['REF-AUSENTE']);
}

// 3. Revisões diferentes não se confundem: a Rev. R não preenche lacunas das N, P e Q.
{
  const withR = build({ applicability: { confirmed: true, contract: CONTRACT, source: C.ET, revision: 'R', evidence: 'Capa da ET Rev. R' } });
  assert.equal(entry(withR, 'et-codificacao@R').level, 'validado');
  for (const rev of ['N', 'Q']) assert.notEqual(entry(withR, 'et-codificacao@' + rev).level, 'validado', 'validar a R não valida a ' + rev);
  const asP = build({ applicability: { confirmed: true, contract: CONTRACT, source: C.ET, revision: 'P', evidence: 'Capa da ET Rev. P' } });
  // Revisão P confirmada, mas só a Tabela 13 da P está carregada: as regras da P ficam bloqueadas (não se usa o validador da R).
  const rule717 = R.ruleAvailability(R.DEPENDENCIES.find(d => d.rule === 'ET-717-PRESERVE'), asP);
  assert.equal(rule717.state, 'bloqueada');
  assert.ok(rule717.blockers.some(b => b.code === 'REF-ESCOPO-NAO-CARREGADO'));
  const asN = build({ applicability: { confirmed: true, contract: CONTRACT, source: C.ET, revision: 'N', evidence: 'Capa da ET Rev. N' } });
  const ruleN = R.ruleAvailability(R.DEPENDENCIES.find(d => d.rule === 'ET-7173-NT'), asN);
  assert.equal(ruleN.state, 'bloqueada', 'validação humana da Rev. N sem carga da Rev. N não habilita regra');
  assert.ok(ruleN.blockers.some(b => b.code === 'REF-NAO-CARREGADA' || b.code === 'REF-VALIDACAO-SEM-CARGA'));
  // Aplicabilidade de outro contrato ou sem evidência não valida nada.
  const other = build({ applicability: { confirmed: true, contract: 'OUTRO', source: C.ET, revision: 'R', evidence: 'x' } });
  assert.notEqual(entry(other, 'et-codificacao@R').level, 'validado');
  const noEvidence = build({ applicability: { confirmed: true, contract: CONTRACT, source: C.ET, revision: 'R', evidence: '' } });
  assert.notEqual(entry(noEvidence, 'et-codificacao@R').level, 'validado');
  // Revisão da ET ainda não confirmada: as regras que dependem "da revisão aplicável" dizem isso.
  const unconfirmed = R.ruleAvailability(R.DEPENDENCIES.find(d => d.rule === 'ET-717-PRESERVE'), build());
  assert.ok(unconfirmed.blockers.some(b => b.code === 'REF-REVISAO-A-CONFIRMAR'));
}

// 4. Vigência: a data da Rev. R é apenas "declarada"; só vira "documentada" com evidência; fora da vigência bloqueia.
{
  const base = build();
  assert.equal(entry(base, 'et-codificacao@R').effective.proof, 'declarada');
  assert.ok(entry(base, 'et-codificacao@R').notes.some(n => /pendente/.test(n)), 'comprovação documental pendente é dita');
  const documented = build({ applicability: { confirmed: true, contract: CONTRACT, source: C.ET, revision: 'R', evidence: 'Capa' }, validations: [{ kind: 'et-codificacao', revision: 'R', by: 'Qualidade', at: '2026-11-06', evidence: 'Capa', effective: { date: '24/08/2026', evidence: 'Folha de controle de revisões, p. 2' } }] });
  assert.equal(entry(documented, 'et-codificacao@R').effective.proof, 'documentada');
  const early = R.buildCatalog({ contract: CONTRACT, inventory, referenceDate: '2026-08-01', applicability: { confirmed: true, contract: CONTRACT, source: C.ET, revision: 'R', evidence: 'Capa' } });
  assert.ok(codes(entry(early, 'et-codificacao@R')).includes('REF-FORA-VIGENCIA'), 'data de referência anterior à vigência bloqueia');
}

// 5. Falta de referência nunca produz falsa conformidade (verificação por registro e motor).
{
  const record = { docKind: 'ET', tag: 'P-101', databook: 'A|B', workflow: 'WF', levels: ['1', '2'] };
  const none = R.verification(record, build());
  assert.equal(none.status, 'nao-verificado', 'sem validação nenhuma, nada é verificado');
  assert.ok(none.blocked.length >= 10 && none.verified.length === 0);
  const confirmed = build({ applicability: { confirmed: true, contract: CONTRACT, source: C.ET, revision: 'R', evidence: 'Capa da ET Rev. R' } });
  const partial = R.verification({ docKind: 'ET' }, confirmed);
  assert.deepEqual(partial.blocked.map(b => b.rule), ['N381-NUM'], 'ET Rev. R validada e carregada habilita as regras do Grupo 1–7; só a N-381 (ainda sem validação) segue bloqueada');
  assert.ok(partial.verified.every(rule => /^ET-/.test(rule)) && partial.verified.length >= 10);
  const n381 = { kind: 'n-381', revision: 'M', by: 'Qualidade', at: '2026-11-06', evidence: 'Conferida com a N-381 Rev. M' };
  const allEt = build({ applicability: { confirmed: true, contract: CONTRACT, source: C.ET, revision: 'R', evidence: 'Capa da ET Rev. R' }, validations: [n381] });
  assert.equal(R.verification({ docKind: 'ET' }, allEt).status, 'verificado', 'com a N-381 validada, todas as regras aplicáveis ao registro ficam verificáveis');
  const mixed = R.verification(record, confirmed);
  assert.equal(mixed.status, 'parcial', 'regras de TAG/EAP/Workflow seguem bloqueadas: verificação parcial');
  const blockedFamilies = R.groupBlocks(mixed).map(g => g.reference).join(' | ');
  assert.match(blockedFamilies, /Apêndice 3/); assert.match(blockedFamilies, /Apêndice A/); assert.match(blockedFamilies, /WORKFLOWS_UHDT-D/);
  // Workflow e EAP exigem HOMOLOGAÇÃO, não só validação.
  const wf = R.ruleAvailability(R.DEPENDENCIES.find(d => d.rule === 'WORKFLOW-UHDT-D'), build({ loadedBases: { workflow: true }, validations: [{ kind: 'workflows-uhdt-d', by: 'Qualidade', at: '2026-11-06', evidence: 'ok' }] }));
  assert.equal(wf.state, 'bloqueada');
  assert.ok(wf.blockers.some(b => b.code === 'REF-NAO-HOMOLOGADA'), 'validado, mas ainda sem homologação humana');
  const wfOk = R.ruleAvailability(R.DEPENDENCIES.find(d => d.rule === 'WORKFLOW-UHDT-D'), build({ loadedBases: { workflow: true }, validations: [{ kind: 'workflows-uhdt-d', by: 'Qualidade', at: '2026-11-06', evidence: 'ok' }], homologations: [{ kind: 'workflows-uhdt-d', by: 'Fiscalização', at: '2026-11-07' }] }));
  assert.equal(wfOk.state, 'verificavel');
  // Sinalizador que a tela já grava (homologated.eap = true) é confirmação humana: vale para a base CARREGADA, com a origem registrada.
  const flag = build({ loadedBases: { eap: true }, homologated: { eap: true } });
  const eapFlag = entry(flag, 'anexo-iii-apendice-a@sem-revisao');
  assert.equal(eapFlag.level, 'homologado');
  assert.equal(eapFlag.homologated.origin, 'sinalizador-existente', 'a origem da confirmação fica registrada');
  // Sem base carregada, o sinalizador não tem o que homologar (nada é inventado).
  assert.equal(entry(build({ homologated: { eap: true } }), 'anexo-iii-apendice-a@sem-revisao').level, 'ausente');
}

// 6. Integração com o motor: sem catálogo nada muda; com catálogo, bloqueio vira apontamento pendente — nunca "sem não conformidades".
{
  const doc = 'C1O_RNEST_U32_3.1.1.1_ELE_RIR_P-101';
  const record = { document: doc, revision: '0', title: 'RELATORIO DE INSPECAO DE RECEBIMENTO DO MOTOR P-101', tag: 'P-101' };
  const context = { contract: CONTRACT, records: [record], history: [], ldRecords: [], bases: {}, versions: {}, applicability: { confirmed: true, contract: CONTRACT, source: C.ET, revision: 'R', evidence: 'Capa da ET Rev. R' } };
  const without = C.auditRecord(record, context, C.prepare(context));
  assert.equal(without.verification, undefined, 'sem catálogo o resultado não ganha campo novo');
  const withCatalog = { ...context, references: build({ applicability: context.applicability }) };
  const row = C.auditRecord(record, withCatalog, C.prepare(withCatalog));
  assert.ok(row.verification && row.verification.catalog === withCatalog.references.fingerprint, 'o resultado registra qual catálogo o verificou');
  const blocks = row.findings.filter(f => f.id === 'REF-BLOCKED');
  assert.equal(blocks.length, 1, 'um único apontamento agregado por registro');
  assert.ok(blocks[0].evidence.length >= 2 && blocks[0].evidence.every(g => g.rules.length && g.reference), 'o detalhe (referência, exigido, regras) vai na evidência');
  assert.ok(blocks.every(f => f.severity === 'pending' && f.normativeProof === false && /Referência necessária/.test(f.message)));
  assert.notEqual(row.status, 'Sem não conformidades detectadas', 'verificação bloqueada nunca vira conformidade');
  assert.ok(['Verificações inconclusivas', 'Correções pendentes'].includes(row.status));
  assert.equal(C.summary([row]).clear, 0, 'o resumo não conta o registro como limpo');
  // Com tudo que o registro exige validado e carregado, não há bloqueio de referência.
  const complete = build({ applicability: context.applicability, loadedBases: { tags: true }, validations: [{ kind: 'anexo-i-apendice-3', by: 'Qualidade', at: '2026-11-06', evidence: 'ok' }, { kind: 'n-381', revision: 'M', by: 'Qualidade', at: '2026-11-06', evidence: 'ok' }] });
  const full = R.verification({ docKind: 'ET', tag: 'P-101' }, complete);
  assert.equal(full.status, 'verificado');
}

// 7. Rastreabilidade: regra → documento oficial → revisão → item → campo → evidência → resultado, e as regras existem de verdade.
{
  const matrix = R.traceMatrix(build({ applicability: { confirmed: true, contract: CONTRACT, source: C.ET, revision: 'R', evidence: 'Capa da ET Rev. R' } }));
  assert.equal(matrix.length, R.DEPENDENCIES.length);
  for (const row of matrix) for (const k of ['rule', 'family', 'officialDocument', 'revision', 'item', 'field', 'result']) assert.ok(row[k] !== undefined && row[k] !== '' || k === 'item', 'campo ' + k + ' presente em ' + row.rule);
  assert.ok(matrix.some(r => r.result === 'verificavel') && matrix.some(r => r.result === 'bloqueada'));
  assert.ok(matrix.filter(r => r.result === 'bloqueada').every(r => r.blockers.length > 0), 'todo bloqueio tem motivo');
  const known = new Set([...Norms.RULES.map(r => r.id), ...C.RULES.map(r => r.id)]);
  const extra = new Set(['TAG-ANEXO-I-AP3', 'EAP-ANEXO-III-APA', 'DATABOOK-CAMINHO', 'DATABOOK-PASTAS', 'WORKFLOW-UHDT-D']);
  for (const d of R.DEPENDENCIES) assert.ok(known.has(d.rule) || extra.has(d.rule), 'a regra ' + d.rule + ' existe no motor/registro normativo (nada inventado)');
  for (const id of known) assert.ok(R.DEPENDENCIES.some(d => d.rule === id), 'a regra ' + id + ' do registro normativo tem dependência de referência declarada');
  const finding = R.traceFinding({ id: 'ET-7173-NT' }, build({ applicability: { confirmed: true, contract: CONTRACT, source: C.ET, revision: 'R', evidence: 'x' } }));
  assert.equal(finding.rule, 'ET-7173-NT');
  assert.equal(R.traceFinding({ id: 'REGRA-INVENTADA' }, build()), null, 'regra desconhecida não ganha rastreio inventado');
}

// 8. Origem e determinismo: mesmo insumo → mesmo catálogo; qualquer validação muda a impressão digital.
{
  const a = build(), b = build();
  assert.equal(a.fingerprint, b.fingerprint);
  const validated = build({ validations: [{ kind: 'et-codificacao', revision: 'R', by: 'Qualidade', at: '2026-11-06', evidence: 'Capa da ET Rev. R' }] });
  assert.notEqual(validated.fingerprint, a.fingerprint, 'impressão digital muda com a validação (invalida o cache de resultados)');
  const rows = R.exportRows(a);
  assert.equal(rows.references.length, a.entries.length + 1);
  assert.equal(rows.trace.length, R.DEPENDENCIES.length + 1);
  assert.ok(rows.trace.slice(1).every(r => r[8] === 'BLOQUEADA'), 'sem validação, toda regra aparece como BLOQUEADA no Excel');
  assert.ok(rows.references.slice(1).every(r => String(r[1]) && String(r[3])), 'cada referência exportada traz tipo e nível');
  assert.deepEqual(R.LEVELS, ['ausente', 'localizado', 'carregado', 'validado', 'homologado']);
}

// 9. RA-07 — "nunca forçar flags": o que se sustenta só em sinalizador é identificado; registro completo e aplicabilidade confirmada não.
{
  const flagged = build({ loadedBases: { eap: true }, homologated: { eap: true } });
  assert.equal(entry(flagged, 'anexo-iii-apendice-a@sem-revisao').demonstration, 'sinalizador');
  const v = R.verification({ docKind: 'ET', eap: '5.7.3.1' }, flagged);
  assert.ok(v.flagOnly.some(x => x.rule === 'EAP-ANEXO-III-APA'), 'regra liberada só pelo sinalizador é listada');
  const full = build({ loadedBases: { eap: true }, validations: [{ kind: 'anexo-iii-apendice-a', by: 'Qualidade', at: '2026-11-06', evidence: 'Conferido com o Anexo III' }], homologations: [{ kind: 'anexo-iii-apendice-a', by: 'Fiscalização', at: '2026-11-07' }] });
  assert.equal(entry(full, 'anexo-iii-apendice-a@sem-revisao').demonstration, 'registro completo');
  assert.equal(R.verification({ docKind: 'ET', eap: '5.7.3.1' }, full).flagOnly.length, 0);
  const app = build({ applicability: { confirmed: true, contract: CONTRACT, source: C.ET, revision: 'R', evidence: 'Capa da ET Rev. R' } });
  assert.equal(entry(app, 'et-codificacao@R').demonstration, 'confirmação de aplicabilidade');
  // No motor: apontamento de sugestão (nunca bloqueia nem vira conformidade) e coluna "Demonstração" no Excel.
  const doc = 'C1O_RNEST_U32_5.7.3.1_ELE_TEST_TAG-A';
  const rec = { document: doc, revision: '0', title: 'RELATORIO DE INSPECAO DE RECEBIMENTO', eap: '5.7.3.1' };
  const context = { contract: CONTRACT, records: [rec], history: [], ldRecords: [], bases: {}, versions: {}, homologated: { eap: true }, applicability: { confirmed: true, contract: CONTRACT, source: C.ET, revision: 'R', evidence: 'Capa' } };
  context.references = R.buildCatalog({ contract: CONTRACT, applicability: context.applicability, homologated: context.homologated, loadedBases: { eap: true } });
  const row = C.auditRecord(rec, context, C.prepare(context));
  const f = row.findings.find(x => x.id === 'REF-FLAG-ONLY');
  assert.ok(f && f.severity === 'suggestion' && /sinalizador/.test(f.message));
  assert.ok(row.verification.flagOnly.includes('EAP-ANEXO-III-APA'));
  const rows = R.exportRows(flagged);
  assert.equal(rows.references[0].at(-1), 'Demonstração'); assert.equal(rows.trace[0].at(-1), 'Demonstração');
  assert.ok(rows.references.some(r => r.at(-1) === 'sinalizador'));
}

console.log('allocation_auditor_references: escada localizado/carregado/validado/homologado, revisões N/P/Q/R separadas, vigência, bloqueios sem falsa conformidade, rastreabilidade integrada ao motor e ao Excel OK');
