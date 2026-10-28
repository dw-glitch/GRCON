'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../core.js');
const E = require('../emission.js');
const H = require('../history_core.js');
const doc = 'C1O_RNEST_U32_3.8.9.1_TUB_REP_VM-320236';
const n1710 = 'RL-5290.00-22313-91B-C1O-001';
const record = (document = doc, revision = 'B') => ({ document, revision, sheet: document === doc ? 'ET' : 'N-1710',
  source: 'LD_001.xlsx', row: 2, title: 'RELATÓRIO DE INSPEÇÃO', format: 'A4', discipline: 'TUBULAÇÃO',
  documentType: document === doc ? 'REP' : 'RL', purpose: 'Para Construção', allocationStatus: 'ALOCADO' });
const history = (revision, status) => ({ ...record(doc, revision), sheet: 'Colar SIGEM', status, sigemStatus: status });
const triage = (name, records = [record()], events = []) => C.triageOne({ id: name, name, file: { name, size: 1 } }, C.buildIndex(records, events));

for (const document of [doc, n1710, '5900.00.00.00-AAA-CV-TESTE-001']) {
  for (const extension of ['pdf', 'DOCX', 'xlsx', 'dwg']) {
    for (const [suffix, revision] of [['', '0'], ['_0', '0'], ['_A', 'A'], ['_b', 'B'], ['_AA', 'AA'],
      ['_0001', '0'], ['_0001_0', '0'], ['_0001_C', 'C'], ['_REV_A', 'A'], ['_REV. A', 'A'],
      ['_#1', '#1'], ['_01', '01'], ['_A1', 'A1']]) {
      const result = C.fileRevisionEvidence(`pasta_B/${document}${suffix}.${extension}`, document);
      assert.equal(result.valid, true, suffix);
      assert.equal(result.revision, revision, suffix);
    }
    for (const suffix of ['_RIR', '_ERRADO', '_COPIA', '_A_B', '_A - COPIA', '_1A', '_9999_A_B']) {
      assert.equal(C.fileRevisionEvidence(`${document}${suffix}.${extension}`, document).valid, false, suffix);
    }
  }
}
assert.equal(C.fileRevisionEvidence(`${doc.replace('VM-', 'nt-VM-')}_A.pdf`, doc).revision, 'A');
assert.equal(C.fileRevisionEvidence(`${doc}0_A.pdf`, doc).valid, false, 'código vizinho não comprova revisão');
assert.equal(C.fileRevisionEvidence(`${doc}.pdf`, doc).revision, '0', 'underscores internos da ET fazem parte do código');

// The same physical file must never change revision as its SIGEM status evolves.
for (const status of ['Em Análise', 'Em Workflow', 'Sem Comentários', 'Recusado', 'Cancelado', 'Conforme Construído']) {
  const row = triage(`${doc}_A.pdf`, [record(doc, 'C')], [history('0', 'Sem Comentários'), history('A', status), history('B', 'Em Análise')]);
  assert.equal(row.revision, 'A', status);
  assert.equal(row.revisionSuggested, 'A', status);
  assert.equal(row.fileRevision, 'A', status);
  assert.equal(row.egrdt.revision, 'A', status);
  const legacyAnalysis = C.statusKind(status) === 'analysis';
  assert.equal(row.decision, legacyAnalysis ? C.REVIEW : C.DISCARD, status);
  assert.equal(row.status, legacyAnalysis ? 'Status SIGEM não confirmado' : status,
    'a LD isolada não confirma análise na Consulta Geral');
  assert.equal(row.hardBlock, false, 'marcação manual continua possível');
  assert.equal(row.finalName, `${doc}_A.pdf`);
  assert.match(C.decisionMessage(row).explanation, /revisão A/i);
}
const noSuffix = triage(`${doc}.pdf`, [record(doc, 'B')], [history('0', 'Sem Comentários')]);
assert.equal(noSuffix.revision, '0');
assert.equal(noSuffix.decision, C.DISCARD);
const correctB = triage(`${doc}_B.pdf`, [record(doc, '0')], [history('A', 'Sem Comentários')]);
assert.equal(correctB.revision, 'B');
assert.equal(correctB.decision, C.READY);
assert.equal(correctB.status, 'Não Postado');
const blankLd = triage(`${doc}_A.pdf`, [record(doc, '')]);
assert.equal(blankLd.revision, 'A', 'LD vazia não apaga uma revisão inequívoca no arquivo');
const unknown = triage(`${doc}_ERRADO.pdf`);
// Unrecognized suffix is preserved as identity, never silently stripped to
// borrow the LD record of the shorter document.
assert.equal(unknown.document, `${doc}_ERRADO`);
assert.equal(unknown.revision, '0');
assert.equal(unknown.decision, C.REVIEW);
assert.equal(unknown.hardBlock, false);

// Exercise the actual consolidation shared by legacy and Worker triage.
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = app.indexOf('  function mergePackageResults(');
const end = app.indexOf('  // A "Revisão do documento"', start);
const state = { ignoredFiles: [] };
const merge = Function('C', 'E', 'state', 'extensionOf', `${app.slice(start, end)}\nreturn mergePackageResults;`)(C, E, state, name => name.split('.').pop().toLowerCase());
const inputRows = ['_A.pdf', '_B.pdf', '_B.docx'].map(s => triage(doc + s, [record()], [history('A', 'Sem Comentários')]));
const merged = merge(inputRows);
assert.equal(merged.length, 2, 'A e B do mesmo documento ficam em linhas separadas');
assert.equal(merged.find(r => r.revision === 'A').files.length, 1);
assert.equal(merged.find(r => r.revision === 'B').files.length, 2);
assert.equal(merged.find(r => r.revision === 'A').decision, C.DISCARD);
assert.equal(merged.find(r => r.revision === 'B').decision, C.READY);
assert.equal(merged.reduce((n, r) => n + r.files.length + r.duplicateFiles.length, 0), inputRows.length);

const ready = merged.find(r => r.revision === 'B');
let plan = E.createPlan([ready], [0]);
assert.deepEqual(plan.errors, []);
assert.equal(plan.entries.length, 2);
assert.ok(plan.entries.every(e => e.revision === 'B' && e.fileRevision === 'B'));
// Simulate a stale or incorrectly edited row reaching the generation boundary.
const stale = { ...ready, revision: 'C', egrdt: { ...ready.egrdt, revision: 'C' } };
plan = E.createPlan([stale], [0]);
assert.equal(plan.entries.length, 0);
assert.ok(plan.warnings.some(w => /excluído.*revisão do arquivo B/i.test(w)));
for (const options of [{ manualForceIndices: [0] }, {}]) {
  const row = options.manualForceIndices ? stale : { ...stale, revisionManual: true };
  plan = E.createPlan([row], [0], options);
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.entries.length, 2, 'manual não pode ser bloqueado pela divergência');
  assert.ok(plan.entries.every(e => e.manualRevisionOverride && e.fileRevision === 'B' && e.revision === 'C'));
  const generated = { official: { baseName: 'QA-REVISAO' }, group: { entries: plan.entries } };
  const saved = H.recordFromGenerated(generated, [row], { generatedAt: '2026-10-15T17:00:00Z' });
  assert.ok(saved.files.every(f => f.fileRevision === 'B' && f.manualRevisionOverride && f.grdtRevision === 'C'));
  assert.deepEqual(H.cleanRecord(JSON.parse(JSON.stringify(saved))).files, saved.files);
}
// A wrong first PDF must not deduplicate away the correct PDF in a stale row.
const mixedRecord = record(n1710, 'B');
const mixed = { document:n1710, sheet:'N-1710', revision:'B', record:mixedRecord,
  egrdt:C.buildEgrdtData(n1710, 'B', `${n1710}_0001_B.pdf`, mixedRecord, 'N-1710', 'A4'),
  files:['A', 'B'].map(rev => ({ name:`${n1710}_0001_${rev}.pdf`, file:{ size:1 } })) };
const mixedPlan = E.createPlan([mixed], [0]);
assert.deepEqual(mixedPlan.errors, []);
assert.equal(mixedPlan.entries.length, 1);
assert.equal(mixedPlan.entries[0].originalName, `${n1710}_0001_B.pdf`);
assert.ok(mixedPlan.warnings.some(w => /excluído.*revisão do arquivo A/i.test(w)));
const repost = merged.find(r => r.revision === 'A');
plan = E.createPlan([repost], [0], { manualForceIndices: [0] });
assert.deepEqual(plan.errors, []);
assert.equal(plan.entries[0].revision, 'A', 'reenvio manual mantém a revisão original');

// The allocation fast path must still identify the physical revision and
// recover existing LD metadata at the generation boundary after a manual choice.
for (const allocationStatus of ['NÃO ALOCADO','Não','Recusado']) {
  const blocked=triage(`${doc}_A.pdf`,[{...record(doc,'B'),allocationStatus}]);
  blocked.files=[{name:blocked.name,file:blocked.file,finalName:blocked.finalName}];
  assert.equal(blocked.hardBlock,true);assert.equal(blocked.revision,'A');
  assert.ok(E.createPlan([blocked],[0]).errors.length,'selection alone cannot authorize an allocation override');
  const manual=E.createPlan([blocked],[0],{manualForceIndices:[0]});
  assert.deepEqual(manual.errors,[]);assert.equal(manual.entries.length,1);
  assert.equal(manual.items[0].revision,'A');assert.equal(manual.items[0].format,'A4');
  assert.equal(manual.items[0].documentType,'RL');assert.equal(manual.items[0].manualAllocationOverride,true);
  assert.equal(blocked.record.allocationStatus,allocationStatus,'source allocation remains unchanged');
}

(async () => {
  // Run the real worker with the same index, without a browser-specific engine.
  const messages = [];
  const scope = { console, performance, setTimeout, clearTimeout, postMessage: message => messages.push(message) };
  scope.self = scope;
  const context = vm.createContext(scope);
  scope.importScripts = (...files) => files.forEach(file => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'workers', file), 'utf8'), context, { filename: file }));
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'workers/triage.worker.js'), 'utf8'), context);
  await scope.onmessage({ data: { taskId: 'init', action: 'initialize', payload: { index: C.buildIndex([record()], [history('A', 'Sem Comentários')]) } } });
  await scope.onmessage({ data: { taskId: 'triage', action: 'triage', payload: { inputs: ['_A.pdf', '_B.pdf', '.pdf'].map(s => ({ name: doc + s })) } } });
  assert.equal(messages.some(m => m.type === 'error'), false);
  const workerRows = messages.filter(m => m.type === 'chunk').flatMap(m => m.chunk);
  assert.deepEqual(workerRows.map(r => [r.revision, r.decision]), [['A', C.DISCARD], ['B', C.READY], ['0', C.READY]]);
  console.log('OK — revisão física, status exato, pacote por revisão, exclusão automática, override manual, histórico e Worker.');
})().catch(error => { console.error(error); process.exitCode = 1; });
