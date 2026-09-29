const assert = require('node:assert/strict');
const X = require('../xlsx.full.min.js');
global.XLSX = X;
const C = require('../core.js');
const Planned = require('../planned_documents_core.js');

const code = 'C1O_RNEST_U32_3.8.9.1_TUB_REP_VM-320236';
const oddCode = 'C1O_RNEST_U32_3.1.1.1_ELE_RIR_CJZ 32902';
const sheet = X.utils.aoa_to_sheet([
  ['DOCUMENTOS PREVISTOS'], [], [], [],
  ['DOCUMENTO', 'DESCRIÇÃO', 'JA_EMITIDO_NO_SIGEM'],
  [code, 'Primeiro', 'N'],
  [code, 'Repetido', 'S'],
  [oddCode, 'Com espaço', 'N'],
  ['SIGEM - Sistema Integrado de Gerenciamento de Empreendimentos'],
]);
const workbook = { SheetNames: ['Sheet1'], Sheets: { Sheet1: sheet } };
const parsed = Planned.parseWorkbook(workbook);
assert.equal(parsed.count, 2);
assert.equal(parsed.ignored, 1);
assert.deepEqual(parsed.keys, [code, oddCode].sort());

const source = [
  { document: code, allocationStatus: 'NÃO ALOCADO', allocation: '', sheet: 'TUB' },
  { document: oddCode, allocationStatus: '', allocation: '', sheet: 'ELE' },
  { document: 'C1O_RNEST_U32_3.8.9.1_TUB_REP_VM-999999', allocationStatus: 'ALOCADO', allocation: 'ALOC-1000', sheet: 'TUB' },
];
const snapshot = { id: 'snapshot-1', fileName: 'Documentos Previstos.xlsx', keys: new Set(parsed.keys) };
const applied = Planned.applyToRecords(source, snapshot);
assert.deepEqual(applied.map((item) => C.allocationEvidenceState(item).kind),
  ['allocated', 'allocated', 'not_allocated']);
assert.ok(applied.every((item) => C.allocationEvidenceState(item).evidence === 'planned-documents'));
assert.equal(source[0].allocationStatus, 'NÃO ALOCADO');
assert.equal(source[2].allocationStatus, 'ALOCADO');
assert.equal(C.allocationEvidenceState(applied[2]).allocationNumber, 'ALOC-1000');
assert.equal(Planned.applyToRecords(source, null), source);
assert.throws(() => Planned.parseWorkbook({ SheetNames: ['Outra'], Sheets: { Outra: X.utils.aoa_to_sheet([['Código'], [code]]) } }), /DOCUMENTO/);

const technical = { document: code, revision: '0', sheet: 'ET', source: 'LD.xlsx',
  allocationStatus: 'NÃO ALOCADO', status: 'Não Postado', sigemStatus: 'Não Postado' };
function triage(keys) {
  const records = Planned.applyToRecords([technical], { ...snapshot, keys });
  return C.triageOne({ id: code, name: `${code}.pdf` }, C.buildIndex(records, []), {});
}
const allocated = triage(new Set([code]));
assert.equal(allocated.decision, C.READY);
assert.equal(allocated.allocationFinding.kind, 'allocated');
const absent = triage(new Set());
assert.equal(absent.hardBlock, true);
assert.equal(absent.allocationFinding.kind, 'not_allocated');
assert.match(absent.reason, /não consta.*Documentos Previstos/i);
console.log('OK — DOCUMENTO decide alocação, S/N não altera, duplicatas e rodapé não entram, LD original preservada.');
