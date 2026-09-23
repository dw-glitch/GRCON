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

function base(document, revision, status, sourceRow = 2, modifiedAt = '14/09/2026 13:00:00') {
  const displayed = C.displayDocument(document);
  return [{
    id: `${C.documentIdentity(displayed)}|${revision}|${sourceRow}`,
    document: displayed,
    documentIdentity: C.documentIdentity(displayed),
    searchKeys: C.documentKeys(displayed),
    revision: C.normalizeRevision(revision),
    status,
    modifiedAt,
    sourceRow,
  }];
}

function reconcile(document, sentRevision, records, previousState) {
  return C.reconcile(history(document, sentRevision), records, previousState, { now: '2026-09-14T14:00:00Z' });
}

assert.equal(C.isPostedSigemStatus('Em Análise'), true);
assert.equal(C.isPostedSigemStatus('Em Analise'), true);
assert.equal(C.isPostedSigemStatus('em análise'), true);
assert.equal(C.isPostedSigemStatus('  Em\u00a0Workflow  '), true);
assert.equal(C.isPostedSigemStatus('Recusado'), false);
assert.equal(C.isPostedSigemStatus('Sem Comentários'), false);
assert.equal(Rule.isPostedSigemStatus('Em Análise', C), true);

let result = reconcile('DOC-POST-1', 'A', base('DOC-POST-1', 'B', 'Em Análise'));
assert.equal(result.rows[0].status, C.STATUSES.CONFIRMED);
assert.equal(result.rows[0].postingEvidenceRevision, 'B');
assert.equal(result.rows[0].postingEvidenceStatus, 'Em Análise');
assert.match(result.rows[0].note, /revisão posterior/i);

result = reconcile('DOC-POST-2', 'A', base('DOC-POST-2', 'B', 'Em Workflow'));
assert.equal(result.rows[0].status, C.STATUSES.CONFIRMED);
assert.equal(result.rows[0].postingEvidenceRevision, 'B');

result = reconcile('DOC-POST-3', 'B', base('DOC-POST-3', 'A', 'Em Workflow'));
assert.equal(result.rows[0].status, C.STATUSES.REVISION_DIVERGENT);

result = reconcile('DOC-POST-4', 'B', base('DOC-POST-4', 'B', 'Em Workflow'));
assert.equal(result.rows[0].status, C.STATUSES.CONFIRMED);

result = reconcile('DOC-POST-5', 'A', base('DOC-POST-5', 'B', 'Recusado'));
assert.equal(result.rows[0].status, C.STATUSES.REVISION_DIVERGENT);

result = reconcile('DOC-POST-6', 'B', base('DOC-POST-6', 'B', 'Recusado'));
assert.equal(result.rows[0].status, C.STATUSES.REVISION_DIVERGENT);
assert.equal(result.rows[0].sigemStatus, 'Recusado');

result = reconcile('DOC-POST-7', 'B', base('DOC-POST-7', 'B', 'Sem Comentários'));
assert.equal(result.rows[0].status, C.STATUSES.REVISION_DIVERGENT);
assert.equal(result.rows[0].sigemStatus, 'Sem Comentários');

const raw = reconcile('DOC-POST-8', 'A', base('DOC-POST-8', 'B', 'Em Análise'));
assert.strictEqual(Rule.applyResult(raw, base('DOC-POST-8', 'B', 'Em Análise'), C), raw, 'status_rule não pode manter uma segunda engine de promoção');

console.log('OK — o core decide postagem por documento + revisão + status SIGEM; status_rule é apenas compatibilidade.');
