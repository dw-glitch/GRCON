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

for (const status of [
  'Em Análise',
  'Em Workflow',
  'Sem Comentários',
  'Recusado',
  'Conforme Construído',
  'Pendente Certificação',
  'Com Comentários',
  'Para Construção',
]) {
  const row = run(doc, 'B', [['B', '23/09/2026 10:00:00', status]]);
  assert.equal(row.status, C.STATUSES.CONFIRMED, status);
  assert.equal(row.revisionFound, 'B');
  assert.equal(row.sigemStatus, status);
}

let row = run(doc, 'A', [['B', '23/09/2026 10:00:00', 'Em Análise']]);
assert.equal(row.status, C.STATUSES.REVISION_DIVERGENT);
assert.equal(row.revisionFound, 'B');

row = run(doc, 'B', [
  ['0', '21/09/2026 10:00:00', 'Recusado'],
  ['A', '22/09/2026 10:00:00', 'Sem Comentários'],
  ['B', '23/09/2026 10:00:00', 'Pendente Certificação'],
]);
assert.equal(row.status, C.STATUSES.CONFIRMED);
assert.equal(row.sigemStatus, 'Pendente Certificação');
assert.equal(row.sigemStatusRevision, 'B');

const previousConfirmed = C.reconcile(history(doc, 'B'), C.parseMatrix(matrix(doc, [
  ['B', '22/09/2026 10:00:00', 'Em Análise'],
])).records, null, { now: '2026-09-22T14:00:00Z' });
const refreshed = C.reconcile(history(doc, 'B'), C.parseMatrix(matrix(doc, [
  ['B', '23/09/2026 10:00:00', 'Recusado'],
])).records, previousConfirmed.state, { now: '2026-09-23T14:00:00Z' });
assert.equal(refreshed.rows[0].status, C.STATUSES.CONFIRMED, 'mudar apenas Status não pode remover a confirmação');
assert.equal(refreshed.rows[0].historicalPreserved, false);
assert.equal(refreshed.rows[0].firstConfirmedAt, previousConfirmed.rows[0].firstConfirmedAt);

const missingCurrent = C.reconcile(history(doc, 'B', '2026-09-20T09:00:00Z'), C.parseMatrix(matrix('OUTRO-DOC', [
  ['B', '23/09/2026 10:00:00', 'Em Análise'],
])).records, previousConfirmed.state, { now: '2026-09-23T14:00:00Z', waitHours: 48 });
assert.equal(missingCurrent.rows[0].status, C.STATUSES.NOT_FOUND, 'a base atual deve prevalecer sobre confirmação histórica');
assert.equal(missingCurrent.rows[0].historicalPreserved, true);

row = run(doc, 'B', [
  ['B', '23/09/2026 10:00:00', 'Sem Comentários'],
  ['B', '23/09/2026 10:00:00', 'Recusado'],
]);
assert.equal(row.status, C.STATUSES.CONFIRMED, 'Status conflitante não altera a existência do par documento+revisão');
assert.equal(row.revisionFound, 'B');

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
    status: i % 2 ? 'Recusado' : 'Sem Comentários',
    modifiedAt: '23/09/2026 10:00:00',
    sourceRow: i + 2,
  });
}
const index = C.buildBaseIndex(manyRecords);
assert.ok(index instanceof Map);
assert.equal(index.get(C.norm('DOC-24999')).length, 1);

console.log('OK — documento + revisão presentes confirmam postagem; Status SIGEM é apenas informativo.');
