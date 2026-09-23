const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../posting_conference_core.js');
const R = require('../posting_conference_refinement.js');

function history(document, revision, generatedAt = '2026-09-23T09:00:00Z') {
  return [{
    id: `h-${document}-${revision}`,
    clientRecordId: `stable-${document}-${revision}`,
    egrdtNumber: '0130870-C1O-PGV-G-1624-2026 - eGRDT',
    generatedAt,
    files: [{ document, revision, grdtRevision: revision, sheet: 'ET', discipline: 'TUB' }],
  }];
}

function matrix(document, rows) {
  return [
    ['Documento', 'Revisão', 'Modificado em', 'Incluido em', 'Status'],
    ...rows.map(([revision, modifiedAt, status, includedAt = '']) => [document, revision, modifiedAt, includedAt, status]),
  ];
}

function run(document, revision, rows, previousState = null) {
  const parsed = C.parseMatrix(matrix(document, rows));
  return R.enrichResult(
    C.reconcile(history(document, revision), parsed.records, previousState, { now: '2026-09-23T14:00:00Z', waitHours: 48 }),
    parsed.records,
    C
  ).rows[0];
}

const doc = 'RL-5290.00-22313-970-C1O-009';

assert.equal(run(doc, 'B', [['B', '23/09/2026 10:00:00', 'Em Análise']]).status, C.STATUSES.CONFIRMED);
assert.equal(run(doc, 'B', [['B', '23/09/2026 10:00:00', 'Em Workflow']]).status, C.STATUSES.CONFIRMED);
assert.notEqual(run(doc, 'B', [['B', '23/09/2026 10:00:00', 'Recusado']]).status, C.STATUSES.CONFIRMED);
assert.notEqual(run(doc, 'B', [['B', '23/09/2026 10:00:00', 'Sem Comentários']]).status, C.STATUSES.CONFIRMED);

let row = run(doc, 'A', [['B', '23/09/2026 10:00:00', 'Em Análise']]);
assert.equal(row.status, C.STATUSES.CONFIRMED);
assert.equal(row.revisionFound, 'B');
assert.match(row.note, /revisão posterior/i);

row = run(doc, 'B', [
  ['0', '21/09/2026 10:00:00', 'Recusado'],
  ['A', '22/09/2026 10:00:00', 'Sem Comentários'],
  ['B', '23/09/2026 10:00:00', 'Em Análise'],
]);
assert.equal(row.status, C.STATUSES.CONFIRMED);
assert.equal(row.sigemStatus, 'Em Análise');
assert.equal(row.sigemStatusRevision, 'B');

const previousConfirmed = C.reconcile(history(doc, 'B'), C.parseMatrix(matrix(doc, [
  ['B', '22/09/2026 10:00:00', 'Em Análise'],
])).records, null, { now: '2026-09-22T14:00:00Z' });
const refreshed = C.reconcile(history(doc, 'B'), C.parseMatrix(matrix(doc, [
  ['B', '23/09/2026 10:00:00', 'Recusado'],
])).records, previousConfirmed.state, { now: '2026-09-23T14:00:00Z' });
assert.notEqual(refreshed.rows[0].status, C.STATUSES.CONFIRMED, 'confirmação histórica não pode substituir a Consulta Geral atual');
assert.equal(refreshed.rows[0].historicalPreserved, true);
assert.equal(refreshed.rows[0].firstConfirmedAt, previousConfirmed.rows[0].firstConfirmedAt);

row = run(doc, 'B', [
  ['B', '22/09/2026 08:00:00', 'Recusado'],
  ['B', '23/09/2026 10:00:00', 'Em Análise'],
]);
assert.equal(row.status, C.STATUSES.CONFIRMED);
assert.equal(row.sigemStatus, 'Em Análise');

const permutations = [
  [
    ['0', '21/09/2026 10:00:00', 'Recusado'],
    ['A', '22/09/2026 10:00:00', 'Sem Comentários'],
    ['B', '23/09/2026 10:00:00', 'Em Análise'],
  ],
  [
    ['B', '23/09/2026 10:00:00', 'Em Análise'],
    ['A', '22/09/2026 10:00:00', 'Sem Comentários'],
    ['0', '21/09/2026 10:00:00', 'Recusado'],
  ],
  [
    ['A', '22/09/2026 10:00:00', 'Sem Comentários'],
    ['0', '21/09/2026 10:00:00', 'Recusado'],
    ['B', '23/09/2026 10:00:00', 'Em Análise'],
  ],
].map(rows => {
  const r = run(doc, 'B', rows);
  return [r.status, r.sigemStatus, r.sigemStatusRevision, r.revisionFound];
});
assert.deepEqual(permutations[0], permutations[1]);
assert.deepEqual(permutations[0], permutations[2]);

row = run(doc, 'B', [
  ['B', '23/09/2026 10:00:00', 'Em Análise'],
  ['B', '23/09/2026 10:00:00', 'Recusado'],
]);
assert.equal(row.status, C.STATUSES.REVIEW);
assert.equal(row.sigemStatus, '');
assert.match(row.note, /ambígu/i);

for (const status of ['Em Análise', 'EM ANALISE', 'em análise', '  Em\u00a0Workflow  ']) {
  assert.equal(C.isPostedSigemStatus(status), true, status);
}

assert.equal(C.parseSourceDate('23/09/2026 10:42:17'), Date.UTC(2026, 8, 23, 10, 42, 17));
assert.ok(Number.isNaN(C.parseSourceDate('31/02/2026 10:42:17')));

const sourceStatusRule = fs.readFileSync(path.join(__dirname, '..', 'posting_conference_status_rule.js'), 'utf8');
assert.doesNotMatch(sourceStatusRule, /status:\s*Conference\.STATUSES\.CONFIRMED/, 'status_rule não deve promover CONFIRMADO');
const sourceRefinement = fs.readFileSync(path.join(__dirname, '..', 'posting_conference_refinement.js'), 'utf8');
const importBlock = sourceRefinement.match(/async importWorkbook\([\s\S]*?\n      \},/)?.[0] || '';
assert.doesNotMatch(importBlock, /saveBase\(/, 'refinement não deve quebrar atomicidade regravando a base após import');

const manyRecords = [];
for (let i = 0; i < 25000; i += 1) {
  const code = `DOC-${String(i).padStart(5, '0')}`;
  manyRecords.push({
    document: code,
    documentIdentity: C.documentIdentity(code),
    searchKeys: C.documentKeys(code),
    revision: 'A',
    status: 'Em Análise',
    modifiedAt: '23/09/2026 10:00:00',
    sourceRow: i + 2,
  });
}
const index = C.buildBaseIndex(manyRecords);
assert.ok(index instanceof Map);
assert.equal(index.get(C.norm('DOC-24999')).length, 1);

console.log('OK — Consulta Geral atual é a fonte operacional, com status/revisão/data/ambiguidade e histórico apenas informativo.');
