'use strict';
// Etapa 4 (parcial) — RA-02: campo preenchido é COMPARADO com a LD (não basta existir), TAG × Grupo 7 da ET;
// e o estado final / decisões não tratam proposta ou alteração de campo como prova de correção (T13, T14, T15 da matriz independente).
const assert = require('node:assert/strict');
const C = require('../allocation_auditor_core.js');
const A = require('../allocation_auditor_corrections.js');
require('../allocation_auditor_package.js');
const P = global.GrconAllocationAuditPackage;

const document = 'IS-5290.00-22313-955-C1O-001';
const row = { document, revision: '0', title: 'TITULO CORRETO', discipline: 'ELE', workflow: 'WF', eap: '5.7.3.1', tag: 'TAG-A', databook: 'U32|QUALIDADE|ELETRICA', levels: ['L1', '', 'L3'] };
const ld = { ...row, source: 'LD-5290.00-22313-91A-C1O-001.xlsx', sheet: 'ELE', row: 2, titleColumn: 3 };
const ctx = { contract: 'QA', records: [row], ldRecords: [ld], bases: { databook: [{ databook: row.databook }], eap: [{ code: '5.7.3.1', levels: row.levels, source: 'QA' }], workflows: [{ workflow: 'WF' }] }, homologated: { eap: true }, versions: { databook: 'QA', eap: 'QA' } };
const run = (r, patch = {}) => C.auditRecord(r, { ...ctx, ...patch, records: [r] });
const ids = r => r.findings.map(f => f.id);

// 1. Referência íntegra continua sem apontamentos (nenhum falso positivo).
assert.deepEqual(ids(run(row)), []);

// 2. Título diferente da LD: erro com os dois valores e a origem na evidência; a proposta não vira correção.
{
  const r = run({ ...row, title: 'TITULO DIVERGENTE' });
  const f = r.findings.find(x => x.id === 'LD-TITLE-MISMATCH');
  assert.ok(f && f.field === 'title' && f.severity === 'error', 'título divergente da LD é erro');
  assert.equal(f.evidence[0].alocacao, 'TITULO DIVERGENTE'); assert.equal(f.evidence[0].ld, 'TITULO CORRETO');
  assert.equal(f.evidence[0].file, ld.source); assert.equal(f.evidence[0].row, 2);
  const proposal = r.recommendations.find(x => x.field === 'title' && x.after === 'TITULO CORRETO');
  assert.ok(proposal && proposal.proposal === true, 'o valor da LD aparece como PROPOSTA (decisão humana), não como correção aplicada');
  assert.notEqual(r.status, 'Sem não conformidades detectadas');
}

// 3. Só a forma muda (maiúsculas/acentos/espaços): sugestão, não erro.
{
  const r = run({ ...row, title: 'titulo  correto' });
  const f = r.findings.find(x => x.id === 'LD-TITLE-FORMAT');
  assert.ok(f && f.severity === 'suggestion', 'diferença só de forma é sugestão');
  assert.ok(!ids(r).includes('LD-TITLE-MISMATCH'));
}

// 4. Valor copiado da LD (campo vazio na alocação) não é "comparado consigo mesmo".
{
  const r = run({ ...row, title: '', tag: '' });
  assert.ok(!ids(r).some(id => /^LD-(TITLE|TAG)-/.test(id)));
  assert.equal(r.valueOrigins.title.kind, 'LD');
}

// 5. Disciplina e EAP divergentes da LD também são apontadas; iguais não.
{
  const r = run({ ...row, discipline: 'CIV', eap: '5.7.3.2' });
  assert.ok(ids(r).includes('LD-DISCIPLINE-MISMATCH') && ids(r).includes('LD-EAP-MISMATCH'));
  assert.ok(!ids(run(row)).includes('LD-EAP-MISMATCH'));
}

// 6. TAG: diverge da LD e do Grupo 7 do código (duas vias independentes); "_" e "/" valem como "-"; nt- não tem TAG para comparar.
{
  const code = 'C1O_RNEST_U32_5.7.3.1_ELE_TEST_TAG-A';
  const app = { confirmed: true, contract: 'QA', source: C.ET, revision: 'R', evidence: 'Fonte sintética QA' };
  const r = run({ ...row, document: code, tag: 'TAG-B' }, { ldRecords: [{ ...ld, document: code }], bases: { ...ctx.bases, appendix: [{ tag: 'TAG-A' }] }, applicability: app });
  assert.ok(ids(r).includes('LD-TAG-MISMATCH') && ids(r).includes('TAG-GROUP7-MISMATCH'), 'TAG × LD e TAG × Grupo 7');
  const g7 = r.findings.find(x => x.id === 'TAG-GROUP7-MISMATCH');
  assert.equal(g7.evidence[0].grupo7, 'TAG-A'); assert.equal(g7.evidence[0].informada, 'TAG-B'); assert.equal(g7.severity, 'error');
  const slash = run({ ...row, document: 'C1O_RNEST_U32_5.7.3.1_ELE_TEST_P_101', tag: 'P/101' }, { ldRecords: [{ ...ld, document: 'C1O_RNEST_U32_5.7.3.1_ELE_TEST_P_101', tag: 'P/101' }], applicability: app });
  assert.ok(!ids(slash).includes('TAG-GROUP7-MISMATCH'), '"_" e "/" valem como "-" na comparação com o Grupo 7');
  const nt = run({ ...row, document: 'C1O_RNEST_U32_5.7.3.1_ELE_TEST_nt-EMT-01', tag: 'QUALQUER' }, { ldRecords: [{ ...ld, document: 'C1O_RNEST_U32_5.7.3.1_ELE_TEST_nt-EMT-01', tag: 'QUALQUER' }], applicability: app });
  assert.ok(!ids(nt).includes('TAG-GROUP7-MISMATCH'), 'item nt- não é comparado com TAG');
}

// 7. Estado final (T14): uma alteração de campo não comprova resolver todos os apontamentos do campo.
{
  const frow = { lineage: 'r', findings: [{ id: 'TITLE-FORMAT', field: 'title', severity: 'error' }, { id: 'OTHER-TITLE-ERROR', field: 'title', severity: 'error' }] };
  const generic = P.finalState([frow], [{ changes: [{ lineage: 'r', field: 'title', verified: true }] }], [], '');
  assert.equal(generic.uncorrectedErrors, 1, 'uma alteração genérica resolve no máximo um erro do campo');
  assert.notEqual(generic.state, 'Pronta para conferência final e envio', 'com erro não corrigido o pacote nunca fica pronto');
  const explicit = P.finalState([frow], [{ changes: [{ lineage: 'r', field: 'title', verified: true, findingIds: ['TITLE-FORMAT', 'OTHER-TITLE-ERROR'] }] }], [], '');
  assert.equal(explicit.uncorrectedErrors, 0, 'a alteração que cita os dois achados resolve os dois');
  const two = P.finalState([frow], [{ changes: [{ lineage: 'r', field: 'title', verified: true }, { lineage: 'r', field: 'title', verified: true }] }], [], '');
  assert.equal(two.uncorrectedErrors, 0, 'duas alterações verificadas cobrem dois erros');
  const none = P.finalState([frow], [], [], '');
  assert.equal(none.uncorrectedErrors, 2);
}

// 8. Estado final (T13): proposta de correção em aberto exige revisão; com alteração verificada, deixa de estar em aberto.
{
  const withProposal = { lineage: 'p', findings: [], recommendations: [{ field: 'workflow', before: 'OLD', after: 'NEW' }] };
  const open = P.finalState([withProposal], [], [], '');
  assert.equal(open.openProposals, 1);
  assert.notEqual(open.state, 'Pronta para conferência final e envio', 'proposta em aberto nunca é "Pronta para envio"');
  const closed = P.finalState([withProposal], [{ changes: [{ lineage: 'p', field: 'workflow', verified: true }] }], [], '');
  assert.equal(closed.openProposals, 0);
  assert.equal(closed.state, 'Pronta para conferência final e envio');
  const clear = P.finalState([{ lineage: 'c', findings: [], recommendations: [] }], [], [], '');
  assert.equal(clear.state, 'Pronta para conferência final e envio', 'sem pendências a linha segue pronta');
}

// 9. Decisão vigente (T15): a última decisão por (linhagem, campo, valor) manda; revogar remove a autorização.
{
  const base = { lineage: 'r', document: 'D', revision: '0', officialAllocation: true, sourceHash: 'a'.repeat(64), sourceRow: 2, workflow: 'OLD', origin: { revision: '0', file: 'LD.xlsx' }, findings: [], recommendations: [{ field: 'workflow', before: 'OLD', after: 'NEW', evidence: ['LD exata'], confidence: 'fonte documental exata' }] };
  const accepted = { lineage: 'r', field: 'workflow', after: 'NEW', decision: 'accepted' }, rejected = { lineage: 'r', field: 'workflow', after: 'NEW', decision: 'rejected' };
  assert.equal(A.plan([base], { contract: 'QA' }, null, [accepted]).items[0].authorized, true);
  assert.equal(A.plan([base], { contract: 'QA' }, null, [accepted, rejected]).items[0].authorized, false, 'aceitar e depois rejeitar: não autorizada');
  assert.equal(A.plan([base], { contract: 'QA' }, null, [accepted, rejected, accepted]).items[0].authorized, true, 'reaceitar volta a autorizar');
  const stamped = A.plan([base], { contract: 'QA' }, null, [{ ...rejected, at: '2026-11-06T12:00:00Z' }, { ...accepted, at: '2026-11-06T10:00:00Z' }]);
  assert.equal(stamped.items[0].authorized, false, 'com data, vale a decisão mais recente mesmo fora de ordem no vetor');
}

console.log('allocation_auditor_stage4_comparison: título/TAG/disciplina/EAP × LD, TAG × Grupo 7, estado final sem prova por campo, propostas abertas e decisão vigente OK');
