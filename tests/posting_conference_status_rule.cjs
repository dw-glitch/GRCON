const assert = require('node:assert/strict');
const C = require('../posting_conference_core.js');
const Rule = require('../posting_conference_status_rule.js');

function history(document, revision) {
  return [{
    id: `h-${document}-${revision}`,
    clientRecordId: `stable-${document}-${revision}`,
    egrdtNumber: '0130870-C1O-PGV-G-0999-2026 - eGRDT',
    generatedAt: '2026-09-14T12:00:00Z',
    files: [{ document, revision, grdtRevision: revision, sheet: 'ET', discipline: 'TUB' }],
  }];
}

function base(document, revision, status, sourceRow = 2) {
  const displayed = C.displayDocument(document);
  return [{
    id: `${C.documentIdentity(displayed)}|${revision}|${sourceRow}`,
    document: displayed,
    documentIdentity: C.documentIdentity(displayed),
    searchKeys: C.documentKeys(displayed),
    revision: C.normalizeRevision(revision),
    status,
    sourceRow,
  }];
}

function reconcileWithRule(document, sentRevision, records) {
  const raw = C.reconcile(history(document, sentRevision), records, null, { now: '2026-09-14T14:00:00Z' });
  return { raw, adjusted: Rule.applyResult(raw, records, C) };
}

assert.equal(Rule.isPostedSigemStatus('Em Análise', C), true);
assert.equal(Rule.isPostedSigemStatus('Em Analise', C), true);
assert.equal(Rule.isPostedSigemStatus('Em Workflow', C), true);
assert.equal(Rule.isPostedSigemStatus('Recusado', C), false);

let result = reconcileWithRule('DOC-POST-1', 'A', base('DOC-POST-1', 'B', 'Em Análise'));
assert.equal(result.raw.rows[0].status, C.STATUSES.REVISION_DIVERGENT);
assert.equal(result.adjusted.rows[0].status, C.STATUSES.CONFIRMED);
assert.equal(result.adjusted.rows[0].postingEvidenceRevision, 'B');
assert.equal(result.adjusted.rows[0].postingEvidenceStatus, 'Em Análise');
assert.match(result.adjusted.rows[0].note, /revisão posterior/i);

result = reconcileWithRule('DOC-POST-2', 'A', base('DOC-POST-2', 'B', 'Em Workflow'));
assert.equal(result.raw.rows[0].status, C.STATUSES.REVISION_DIVERGENT);
assert.equal(result.adjusted.rows[0].status, C.STATUSES.CONFIRMED);
assert.equal(result.adjusted.rows[0].postingEvidenceRevision, 'B');
assert.equal(result.adjusted.rows[0].postingEvidenceStatus, 'Em Workflow');

result = reconcileWithRule('DOC-POST-3', 'B', base('DOC-POST-3', 'A', 'Em Workflow'));
assert.equal(result.raw.rows[0].status, C.STATUSES.REVISION_DIVERGENT);
assert.equal(result.adjusted.rows[0].status, C.STATUSES.REVISION_DIVERGENT, 'revisão anterior não pode provar uma revisão mais nova');

result = reconcileWithRule('DOC-POST-4', 'B', base('DOC-POST-4', 'B', 'Em Workflow'));
assert.equal(result.raw.rows[0].status, C.STATUSES.CONFIRMED);
assert.equal(result.adjusted.rows[0].status, C.STATUSES.CONFIRMED);

result = reconcileWithRule('DOC-POST-5', 'A', base('DOC-POST-5', 'B', 'Recusado'));
assert.equal(result.raw.rows[0].status, C.STATUSES.REVISION_DIVERGENT);
assert.equal(result.adjusted.rows[0].status, C.STATUSES.REVISION_DIVERGENT, 'somente Em Análise/Em Workflow promovem revisão posterior');

console.log('OK — Em Análise e Em Workflow confirmam postagem da mesma revisão ou de revisão posterior, sem falso positivo para revisão anterior.');
