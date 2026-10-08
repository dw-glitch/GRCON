'use strict';
const assert = require('node:assert/strict');
const E = require('../emission.js');
const H = require('../history_core.js');
const R = require('../history_report.js');
const ExcelJS = require('../exceljs.min.js');

(async () => {
  const code = 'RL-5290.00-22313-856-C1O-017';
  const local = { name: code + '_A.docx', size: 12, lastModified: 1791374400000,
    arrayBuffer() { throw new Error('Não recalcular o binário na emissão'); } };
  const row = { document: code, sheet: 'N-1710', revision: 'B',
    record: { discipline: 'CIVIL', title: 'QA', purpose: 'Para Construção' },
    egrdt: { format: 'A4', discipline: 'CIVIL', documentType: 'RL', purpose: 'Para Construção' },
    files: [{ name: local.name, file: local }] };
  const plan = E.createPlan([row], [0]);
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.entries[0].fileProvenance.revision, 'A', 'revisão do arquivo original é separada da revisão gerada B');
  assert.equal(plan.entries[0].fileProvenance.source, 'local');
  assert.equal(plan.entries[0].fileProvenance.lastModified, local.lastModified);
  const et = 'C1O_RNEST_U32_3.8.9.1_TUB_REP_VM-320236';
  const virtual = E.createPlan([{ ...row, document: et, sheet: 'ET', files: [], virtualFileName: et + '_A.pdf' }], [0]);
  assert.equal(virtual.entries[0].fileProvenance, null, 'registro sem binário não inventa origem local');

  const metadata = { id: 'cofre-versao-77', sequence: 77, fileName: local.name, revision: 'A',
    format: 'docx', sizeBytes: 12, sha256: 'a'.repeat(64), createdAt: '2026-10-07T12:00:00Z', verifiedAt: '2026-10-07T12:01:00Z' };
  global.GrconDocumentVault = { lookupSource: file => file === local ? metadata : null };
  const vaultPlan = E.createPlan([row], [0]);
  delete global.GrconDocumentVault;
  const entry = vaultPlan.entries[0];
  const generated = { official: { baseName: 'QA-PROVENIENCIA' }, group: { entries: [entry] } };
  const record = H.recordFromGenerated(generated, [row], { generatedAt: '2026-10-08T08:00:00Z' });
  const expected = { ...record.files[0].fileProvenance };
  metadata.sha256 = 'b'.repeat(64); metadata.sequence = 78;
  entry.fileProvenance.sha256 = 'c'.repeat(64);
  assert.deepEqual(record.files[0].fileProvenance, expected, 'histórico permanece congelado após alteração da fonte e do plano');
  const data = new Map();
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  H.saveMany([record], storage);
  const restored = H.read(storage)[0];
  assert.deepEqual(restored.files[0].fileProvenance, expected);
  assert.equal(H.filter([restored], expected.vaultFileId).length, 1);
  assert.equal(H.filter([restored], expected.sha256).length, 1);
  const report = R.documentRows([restored])[0];
  assert.equal(report['REVISÃO ENVIADA NA GRDT'], 'B');
  assert.equal(report['REVISÃO DO ARQUIVO UTILIZADO'], 'A');
  assert.equal(report['ID DO ARQUIVO NO COFRE'], metadata.id);
  assert.equal(report['SHA-256 DO ARQUIVO UTILIZADO'], expected.sha256);
  assert.equal(E.manifestRows(vaultPlan)[0]['ORIGEM DO ARQUIVO'], 'Cofre');

  const unsafe = H.cleanRecord({ ...record, files: [{ ...record.files[0], fileProvenance: {
    ...expected, sizeBytes: Infinity, object_key: 'privado', access_token: 'segredo', url: 'https://privado', binary: 'nao-persistir' } }] });
  assert.equal(unsafe.files[0].fileProvenance.sizeBytes, 0);
  for (const key of ['object_key', 'access_token', 'url', 'binary']) assert.equal(Object.hasOwn(unsafe.files[0].fileProvenance, key), false);
  const old = H.cleanRecord({ ...record, files: [{ document: code, originalName: local.name, vaultFileId: 'legado-sem-snapshot' }] });
  assert.equal(old.files[0].fileProvenance, null);
  assert.equal(R.documentRows([old])[0]['ORIGEM DO ARQUIVO UTILIZADO'], 'Não registrada');

  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await R.buildWorkbook([restored], { brandAssets: null }));
  const values = [];
  book.getWorksheet('Documentos').eachRow(row => row.eachCell(cell => values.push(cell.value)));
  assert.ok(values.includes(expected.sha256), 'SHA congelado está no XLSX gerado');
  assert.ok(values.includes(expected.vaultFileId));
  console.log('file_provenance: origem física, revisão original/gerada, snapshot imutável, persistência, busca, segurança e Excel OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
