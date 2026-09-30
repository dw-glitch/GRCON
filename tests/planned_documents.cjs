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

// Consultas: a existência do código normalizado na versão compartilhada é a
// única autoridade para Alocado / Não alocado. Revisão e valor antigo da LD
// não participam da decisão.
const sharedV1 = {
  id: 'shared-v1',
  fileName: 'Documentos Previstos V1.xlsx',
  updatedAt: '2026-09-30T12:00:00Z',
  keys: new Set([C.key('DOC-001'), C.key('DOC-002')]),
};
assert.equal(Planned.classifyDocument('DOC-001', sharedV1).label, 'Alocado', 'caso 1 — documento existente');
assert.equal(Planned.classifyDocument('DOC-003', sharedV1).label, 'Não alocado', 'caso 2 — documento inexistente');
assert.equal(Planned.classifyDocument('DOC-001', sharedV1).label, 'Alocado', 'caso 3 — revisão não faz parte da chave');
assert.equal(Planned.classifyDocument(' doc-001  ', sharedV1).label, 'Alocado', 'caso 4 — normalização canônica');

const legacyRow = {
  situation: 'Localizado',
  allocated: 'NÃO — Não alocado',
  allocationKind: 'not_allocated',
  allocation: 'ALOC-ANTIGA-999',
};
const plannedRow = Planned.applyToConsultationRow(legacyRow, ' DOC-001 ', sharedV1);
assert.equal(plannedRow.allocated, 'Alocado');
assert.equal(plannedRow.allocationKind, 'allocated');
assert.equal(plannedRow.allocationSource, 'Documentos Previstos');
assert.equal(plannedRow.plannedDocumentsSnapshot, 'shared-v1');
// O número histórico da LD pode continuar visível como metadado, mas não
// influencia a classificação objetiva.
assert.equal(plannedRow.allocation, 'ALOC-ANTIGA-999');

const sharedV2 = {
  ...sharedV1,
  id: 'shared-v2',
  fileName: 'Documentos Previstos V2.xlsx',
  keys: new Set([C.key('DOC-001'), C.key('DOC-002'), C.key('DOC-003')]),
};
assert.equal(Planned.classifyDocument('DOC-003', sharedV1).label, 'Não alocado');
assert.equal(Planned.classifyDocument('DOC-003', sharedV2).label, 'Alocado', 'caso 5 — nova versão atualiza a decisão');

for (const user of ['owner', 'admin', 'operator']) {
  assert.equal(Planned.classifyDocument('DOC-002', sharedV2).label, 'Alocado', `caso 6 — ${user} usa o mesmo snapshot compartilhado`);
}

const unavailable = Planned.classifyDocument('DOC-001', null);
assert.equal(unavailable.available, false, 'caso 7 — indisponibilidade não vira Não alocado');
assert.equal(unavailable.label, '');
assert.equal(unavailable.kind, 'unavailable');
const unavailableRow = Planned.applyToConsultationRow(legacyRow, 'DOC-001', null);
assert.equal(unavailableRow.allocated, '');
assert.equal(unavailableRow.allocationKind, 'unavailable');

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

// Em produção, o PostgREST limita a resposta a 1.000 linhas mesmo quando o
// cliente pede mais. A leitura deve prosseguir até uma página vazia.
(async () => {
  const all = Array.from({ length: 27191 }, (_, index) => ({ document_key: `DOC-${String(index).padStart(6, '0')}` }));
  let pages = 0;
  const keys = await Planned.collectPages(async (after, requested) => {
    pages += 1;
    const start = after ? all.findIndex((item) => item.document_key === after) + 1 : 0;
    return all.slice(start, start + Math.min(requested, 1000));
  }, all.length, 2000);
  assert.equal(keys.size, all.length);
  assert.equal(pages, 29);
  await assert.rejects(() => Planned.collectPages(async () => all.slice(0, 1000), all.length), /não avançou/);
  console.log('OK — regra de alocação e leitura das 27.191 entradas com limite de 1.000 linhas por resposta.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
