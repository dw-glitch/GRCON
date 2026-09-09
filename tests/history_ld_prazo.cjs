const assert = require('node:assert/strict');
globalThis.XLSX = require('../xlsx.full.min.js');
const Core = require('../core.js');
const History = require('../history_core.js');
const Report = require('../history_report.js');
const XLSX = globalThis.XLSX;
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
  ['DOCUMENTO', 'TÍTULO', 'REVISÃO', ' Prazo ', 'VERSÃO DA LD ENVIADA'],
  ['RL-5290.00-22313-911-C1O-001', 'Documento 1', '0', 'A01', 'E'],
  ['RL-5290.00-22313-911-C1O-002', 'Documento 2', '0', 'E30', 'E'],
  ['RL-5290.00-22313-911-C1O-003', 'Documento 3', '0', 'Primeiras versões', 'E'],
  ['RL-5290.00-22313-911-C1O-004', 'Documento 4', '0', '', 'E'],
]), 'N-1710');
const parsed = Core.parseWorkbook(workbook, 'LD_001_E.xlsx', 1, null);
assert.deepEqual(parsed.records.map(r => r.ldPrazo), ['A01', 'E30', 'Primeiras versões', '']);
assert.ok(parsed.records.every(r => r.ldVersion === 'E'));
const record = History.recordFromGenerated({
  fileName: 'GRDT-TESTE.xlsx',
  group: { entries: parsed.records.map((r, rowIndex) => ({ rowIndex, document: r.document })) },
}, parsed.records.map(record => ({ record })), { generatedAt: '2026-09-09T12:00:00Z' });
const restored = History.cleanRecord(JSON.parse(JSON.stringify(record)));
const rows = Report.documentRows([restored], []);
assert.deepEqual(rows.map(r => r['VERSÃO DA LD ENVIADA']), ['A01', 'E30', 'Primeiras versões', '']);
assert.equal(Object.keys(rows[0])[23], 'VERSÃO DA LD ENVIADA');
const legacy = History.cleanRecord({ ...record, files: [{ document: 'RL-LEGADO', ldVersion: 'E' }] });
assert.equal(Report.documentRows([legacy], [])[0]['VERSÃO DA LD ENVIADA'], '');
console.log('OK — Prazo da LD preservado na leitura, histórico e coluna X; legado sem prazo permanece vazio.');
