'use strict';
const assert = require('node:assert/strict');
const C = require('../posting_conference_core.js');
const clone = value => JSON.parse(JSON.stringify(value));
const engine = C.createReconciler();
let previous = null;
let history = Array.from({length: 240}, (_, i) => ({id: 'h'+i, egrdtNumber: 'GRDT-'+i,
  generatedAt: '2026-10-19T10:00:00Z', workspaceId: 'A',
  files: [{document: 'DOC-'+i, revision: i%3 ? '0' : 'A', title: 'Título '+i, purpose: 'Construção'}]}));
let base = Array.from({length: 180}, (_, i) => ({document: 'DOC-'+i, revision: i%4 ? '0' : 'A',
  status: 'Em análise', sourceRow: i+2}));
let options = {now: '2026-10-20T10:00:00Z', waitHours: 48, baseReferenceDate: '2026-10-20', scope: 'account:A'};
function check(label, settings = {}) {
  const actual = engine.reconcile(history, base, previous, {...options, ...settings});
  const reference = C.reconcile(history, base, previous, {...options, ...settings});
  assert.deepEqual(actual, reference, label);
  previous = clone(actual.state);
  return actual;
}
check('primeira leitura'); check('evidência de confirmação persistida'); check('mesma base e histórico');
assert.equal(engine.metrics().compared, 0);
assert.equal(engine.metrics().reused, history.length);
history[2].files[0].title = 'Título editado';
check('edição em memória sem trocar a referência'); assert.equal(engine.metrics().compared, 1);
history.push({id:'new', egrdtNumber:'GRDT-999', generatedAt:'2026-10-20T09:00:00Z', workspaceId:'A', files:[{document:'DOC-2',revision:'B'}]});
let result = check('nova revisão altera o julgamento do último envio');
assert.equal(result.rows.find(row=>row.historyId==='h2').superseded,true);
history.pop(); result = check('exclusão da última emissão devolve a anterior à situação vigente');
assert.equal(result.rows.find(row=>row.historyId==='h2').superseded,false);
assert.equal(engine.metrics().cachedRows,history.length);
base[0].status='Recusado'; check('alteração do Status SIGEM na mesma revisão');
assert.equal(engine.metrics().indexRebuilt,true);
base[0].revision='B'; check('revisão da base alterada');
base.splice(0,2); check('remoção da evidência mantém memória histórica');
check('passagem exata da janela', {now:'2026-10-21T10:00:00Z'});
check('fim da janela', {now:'2026-10-21T10:00:00.001Z'});
check('preferência alterada', {waitHours:120});
check('base anterior à emissão', {baseReferenceDate:'2026-10-17'});
check('troca de conta/contrato', {scope:'account:B'}); assert.equal(engine.metrics().reused,0);
check('cálculo completo forçado', {forceFull:true}); assert.equal(engine.metrics().reused,0);
const snapshot = check('resultado isolado');
const saved = clone(previous);
snapshot.rows[0].revisionsFound.push('RESULTADO ADULTERADO');
snapshot.rows[0].searchKeys.push('OUTRO DOCUMENTO');
previous=saved;check('alteração externa do resultado não contamina cache');
base=[]; check('sem base não afirma ausência');
history=[]; check('histórico vazio elimina cache');assert.equal(engine.metrics().cachedRows,0);
engine.clear(); assert.equal(engine.metrics().cachedRows,0);
for (const now of ['2026-10-20T10:00:00Z','2026-10-20T11:00:00Z']) {
  const h=[{id:'fresh',generatedAt:'2026-10-19T10:00:00Z',files:[{document:'FRESH',revision:'0'}]}], b=[{document:'FRESH',revision:'0'}];
  assert.deepEqual(engine.reconcile(h,b,null,{now}),C.reconcile(h,b,null,{now}),'primeira confirmação sem estado anterior usa o horário desta execução');
}
console.log('Conferência incremental: paridade integral, mutações, último envio, exclusões, tempo, preferências, contexto e isolamento aprovados.');
