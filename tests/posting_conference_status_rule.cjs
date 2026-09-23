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

for (const status of ['Em Análise', 'Em Workflow', 'Recusado', 'Sem Comentários', 'Conforme Construído', 'Pendente Certificação']) {
  const result = reconcile('DOC-EXACT', 'B', base('DOC-EXACT', 'B', status));
  assert.equal(result.rows[0].status, C.STATUSES.CONFIRMED, status);
  assert.equal(result.rows[0].postingEvidenceRevision, 'B');
  assert.equal(result.rows[0].postingEvidenceStatus, status);
}

let result = reconcile('DOC-LATER', 'A', base('DOC-LATER', 'B', 'Em Análise'));
assert.equal(result.rows[0].status, C.STATUSES.REVISION_DIVERGENT);
assert.equal(Rule.revisionProvesPosting('B', 'A', C), false);
assert.equal(Rule.revisionProvesPosting('B', 'B', C), true);

result = reconcile('DOC-OLDER', 'B', base('DOC-OLDER', 'A', 'Em Workflow'));
assert.equal(result.rows[0].status, C.STATUSES.REVISION_DIVERGENT);

const raw = reconcile('DOC-FACADE', 'B', base('DOC-FACADE', 'B', 'Recusado'));
assert.strictEqual(Rule.applyResult(raw, base('DOC-FACADE', 'B', 'Recusado'), C), raw, 'status_rule não pode manter uma segunda engine de promoção');

console.log('OK — o core decide por documento + revisão; Status SIGEM é metadado e status_rule é apenas compatibilidade.');
