const assert = require('node:assert/strict');
const C = require('../posting_conference_core.js');
const R = require('../posting_conference_refinement.js');
const header = ['Documento', 'Revisão', 'Modificado em', 'Incluido em', 'Status'];
const doc = 'C1O_RNEST_U32_3.8.9.1_TUB_REP_VM-320236';
const source = [
  [doc, '0', '12/03/2026 09:11:29', '04/03/2026 14:23:12', 'Recusado'],
  [doc, 'A', '31/03/2026 07:41:23', '23/03/2026 15:01:23', 'Sem Comentários'],
  [doc, 'B', '03/09/2026 12:04:47', '03/09/2026 12:04:46', 'Em Análise'],
];
function history(document, revision) {
  return [{ id: 'accuracy', generatedAt: '2026-09-03T12:00:00Z', files: [{ document, revision, grdtRevision: revision, sheet: 'ET' }] }];
}
function check(matrix, document, revision) {
  const parsed = C.parseMatrix(matrix);
  return R.enrichResult(C.reconcile(history(document, revision), parsed.records), parsed.records, C).rows[0];
}
assert.equal(R.parseSourceDate('12/03/2026 09:11:29'), Date.UTC(2026, 2, 12, 9, 11, 29));
assert.ok(Number.isNaN(R.parseSourceDate('31/02/2026 12:00:00')));
assert.ok(Number.isNaN(R.parseSourceDate('')));
assert.equal(R.parseSourceDate('2026-09-03T12:04:47Z'), Date.UTC(2026, 8, 3, 12, 4, 47));

const expected = { '0': 'Recusado', A: 'Sem Comentários', B: 'Em Análise' };
for (const rows of [source, source.slice().reverse(), [source[1], source[2], source[0]]]) {
  for (const revision of ['0', 'A', 'B']) {
    const result = check([header, ...rows], doc, revision);
    assert.equal(result.status, C.STATUSES.CONFIRMED);
    assert.equal(result.sigemStatus, expected[revision]);
    assert.equal(result.sigemStatusRevision, revision);
  }
  const newerThanBase = check([header, ...rows], doc, 'C');
  assert.equal(newerThanBase.status, C.STATUSES.REVISION_DIVERGENT);
}

const updated = [doc, 'B', '09/09/2026 10:00:00', '', 'Sem Comentários'];
assert.equal(check([header, ...source, updated], doc, 'B').status, C.STATUSES.CONFIRMED);
assert.equal(check([header, ...source, updated], doc, 'B').sigemStatus, 'Sem Comentários');
const conflict = [...updated]; conflict[4] = 'Recusado';
const duplicateStatus = check([header, updated, conflict], doc, 'B');
assert.equal(duplicateStatus.status, C.STATUSES.CONFIRMED);
assert.ok(['Sem Comentários', 'Recusado'].includes(duplicateStatus.sigemStatus));

assert.equal(check([header, [doc, 'B', '', '', '']], doc, 'B').status, C.STATUSES.CONFIRMED);
assert.equal(check([header, ...source], doc.replace('3.8.9.1', '3.8.9.2'), 'B').sigemStatus, '');
assert.equal(check([header, ...source], doc.replace('_REP_', '_RUFF_'), 'B').sigemStatus, '');
assert.equal(check([header, ...source], doc.replace('_VM-', '_nt-VM-'), 'B').status, C.STATUSES.CONFIRMED);
assert.equal(C.parseMatrix([['Documento', 'Revisão', 'Situação', 'Status'], [doc, 'B', 'Recusado', 'Em Análise']]).records[0].status, 'Em Análise');

console.log('OK — revisão exata confirma independentemente do Status; identidade documental e metadados SIGEM permanecem íntegros.');
