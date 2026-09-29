const assert = require('node:assert/strict');
const H = require('../history_core.js');
const R = require('../history_report.js');

const doc = 'C1O_RNEST_U32_3.8.9.1_TUB_REP_VM-320236';
const record = { id: 'cloud-id', clientRecordId: 'stable-id', egrdtNumber: 'GR-1445', files: [] };
const file = {
  document: doc,
  revision: '0',
  grdtRevision: 'B',
  ldVersion: 'Rev. 42',
  ldPrazo: 'E30',
  allocation: 'C1O-ALOC-CM-0270-2026',
  sigemStatus: 'Aguardando retorno da alocação',
  purpose: 'Para Construção',
};

const cleaned = H.cleanRecord({ ...record, generatedAt: '2026-09-03T12:00:00Z', files: [file] });
const output = R.documentRows([cleaned])[0];

assert.equal(output['REVISÃO ENVIADA NA GRDT'], 'B');
assert.equal(output['PROPÓSITO'], 'Para Construção');
assert.equal(output['VERSÃO DA LD ENVIADA'], 'E30');
assert.equal(output['ALOCAÇÃO'], file.allocation);
assert.equal(output['STATUS SIGEM'], file.sigemStatus, 'snapshot histórico preservado');
assert.equal(R.documentRows([{ ...cleaned, files: [{ ...file, ldPrazo: '' }] }])[0]['VERSÃO DA LD ENVIADA'], '');
assert.equal(Object.prototype.hasOwnProperty.call(output, 'REVISÃO DESTA GRDT POSTADA'), false);
assert.equal(typeof R.revisionRelation, 'undefined');

console.log('OK — Histórico preserva revisão gerada, propósito, prazo, alocação e snapshot sem depender do workflow aposentado.');
