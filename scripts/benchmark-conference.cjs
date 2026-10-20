'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {performance} = require('node:perf_hooks');
const C = require('../posting_conference_core.js');
const count = Math.max(100, Math.min(50000, Number(process.env.GRCON_BENCH_DOCUMENTS) || 10000));
const history = Array.from({length:count},(_,i)=>({id:'h'+i,egrdtNumber:'GRDT-'+i,
  generatedAt:'2026-10-19T10:00:00Z',files:[{document:'DOC-'+i,revision:'0'}]}));
const base = history.map(item=>({document:item.files[0].document,revision:'0',status:'Em análise'}));
const settings={now:'2026-10-20T10:00:00Z',baseReferenceDate:'2026-10-20',scope:'synthetic'};
const started=performance.now(), full=C.reconcile(history,base,null,settings), fullMs=performance.now()-started;
const engine=C.createReconciler();let result=engine.reconcile(history,base,null,settings);
result=engine.reconcile(history,base,result.state,settings);
const warm=performance.now();result=engine.reconcile(history,base,result.state,settings);
const unchangedMs=performance.now()-warm, unchangedMetrics=engine.metrics();
assert.equal(unchangedMetrics.compared,0);assert.equal(result.summary.confirmed,count);
history[0].files[0].title='Uma alteração';
const changed=performance.now();const incremental=engine.reconcile(history,base,result.state,settings);
const changedMs=performance.now()-changed;
assert.deepEqual(incremental,C.reconcile(history,base,result.state,settings));
assert.equal(engine.metrics().compared,1);assert.equal(full.summary.total,count);
const output={schema:'grcon.conference.benchmark.v1',runtime:process.version,documents:count,
  fullMs:+fullMs.toFixed(2),unchangedMs:+unchangedMs.toFixed(2),singleChangeMs:+changedMs.toFixed(2),
  unchanged:unchangedMetrics,singleChange:engine.metrics(),heapMB:+(process.memoryUsage().heapUsed/1048576).toFixed(1),
  synthetic:true,notice:'Medições locais; não representam latência nem capacidade de produção.'};
fs.mkdirSync('artifacts/evolution',{recursive:true});
fs.writeFileSync('artifacts/evolution/conference-benchmark.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output));
