const assert = require('node:assert/strict');
const H = require('../history_core.js');
const P = require('../sigem_posting_core.js');
const R = require('../history_report.js');
const doc = 'C1O_RNEST_U32_3.8.9.1_TUB_REP_VM-320236';
const record = { id: 'cloud-id', clientRecordId: 'stable-id', egrdtNumber: 'GR-1445', files: [] };
const file = { document: doc, revision: '0', grdtRevision: 'B', ldVersion: 'Rev. 42', ldPrazo: 'E30', allocation: 'C1O-ALOC-CM-0270-2026', sigemStatus: 'Aguardando retorno da alocação' };
const own = { id: 'posting-own', historyId: 'stable-id', egrdtNumber: 'old-number', status: P.STATUSES.POSTADO, files: [{ document: doc.replace('_VM-', '_nt-VM-'), revision: 'B' }] };
const old = { id: 'posting-other', egrdtNumber: 'GR-1200', status: P.STATUSES.POSTADO, files: [{ document: doc, revision: 'A' }] };
let relation = R.revisionRelation(record, file, [own, old]);
assert.equal(relation.posted, 'B', 'identidade estável e nt- reconhecidos mesmo após renumeração');
assert.match(relation.other, /Rev. A/);
assert.equal(R.revisionRelation(record, file, [{ ...own, files: [{ document: doc, revision: 'A' }] }]).posted, 'Não confirmada nesta GRDT');
assert.equal(R.revisionRelation(record, file, [own]).other, 'Sem outra revisão registrada como postada no GRCON');
for (const different of [doc.replace('3.8.9.1', '3.8.9.2'), doc.replace('_REP_', '_RUFF_')]) {
  assert.equal(R.revisionRelation(record, { ...file, document: different }, [own]).posted, 'Não confirmada nesta GRDT');
}
const cleaned = H.cleanRecord({ ...record, generatedAt: '2026-09-03T12:00:00Z', files: [file] });
const output = R.documentRows([cleaned], [own])[0];
assert.equal(output['REVISÃO ENVIADA NA GRDT'], 'B');
assert.equal(output['REVISÃO DESTA GRDT POSTADA'], 'B');
assert.equal(output['VERSÃO DA LD ENVIADA'], 'E30');
assert.equal(output['ALOCAÇÃO'], file.allocation);
assert.equal(output['STATUS SIGEM'], file.sigemStatus, 'snapshot histórico preservado');
assert.equal(R.documentRows([{ ...cleaned, files: [{ ...file, ldPrazo: '' }] }], [])[0]['VERSÃO DA LD ENVIADA'], '');
console.log('OK — dados do Histórico: revisão efetiva, vínculo estável, identidade ET, prazo, alocação e snapshot.');
