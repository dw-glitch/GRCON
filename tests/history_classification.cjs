const assert = require('node:assert/strict');
const C = require('../history_classification.js');
const E = require('../emission.js');
const P = require('../posting_batch_planner.js');
const H = require('../history_core.js');
const records = [
 { id:'a', egrdtNumber:'1001', generatedAt:'2026-01-01', files:[{document:'X',revision:'A'},{document:'X',revision:'A',finalName:'X.docx'}]},
 { id:'b', egrdtNumber:'1002', generatedAt:'2026-01-02', files:[{document:'X',revision:'B'}]},
 { id:'c', egrdtNumber:'1003', generatedAt:'2026-01-03', files:[{document:'X',revision:'B'}]},
 { id:'d', egrdtNumber:'1004', generatedAt:'2026-01-04', files:[{document:'Y',revision:'C'}]},
];
const index=C.buildIndex(records);
assert.equal(C.classify('N','0',index).emissionKind,'FIRST_POSTING');
assert.equal(C.classify('X','C',index).emissionKind,'NEW_REVISION');
const repost=C.classify('x','Rev. B',index);
assert.equal(repost.emissionKind,'REPOST');assert.equal(repost.previousGrdt,'1003');assert.equal(repost.originalEmissionId,'b');assert.equal(repost.occurrenceCount,2);assert.equal(repost.repostCount,1);
assert.equal(C.classify('NT-X','A',index).occurrenceCount,1);
const regressive=C.classify('Y','B',index);assert.equal(regressive.emissionKind,'NEW_REVISION');assert.ok(regressive.warnings.includes('Existe revisão posterior no Histórico.'));
assert.equal(C.classify('Y','0',index).emissionKind,'NEW_REVISION');
assert.equal(C.classify('N','A',C.buildIndex(records,{complete:false})).classificationStatus,'UNCONFIRMED');
assert.equal(C.classify('X','B',C.buildIndex(records,{complete:false})).emissionKind,'REPOST');
assert.equal(C.classify('X','C',C.buildIndex(records,{complete:false})).emissionKind,'');
assert.equal(C.classify('X','',index).emissionKind,'');
assert.equal(C.classify('X','B',C.buildIndex([...records].reverse())).previousGrdt,'1003');
const unrecorded=C.buildIndex([{id:'old',egrdtNumber:'1',files:[{document:'X'}]}]);assert.equal(C.classify('X','0',unrecorded).emissionKind,'');
assert.equal(C.classify('X','B',C.buildIndex(records.map(r=>({...r,workspaceId:'other'})),{workspaceId:'current'})).emissionKind,'FIRST_POSTING');
const roundTrip=H.cleanRecord({id:'new',egrdtNumber:'2000',files:[{document:'X',revision:'B',historyClassification:repost}]});
assert.deepEqual(H.cleanRecord(JSON.parse(JSON.stringify(roundTrip))).files[0].historyClassification,roundTrip.files[0].historyClassification);
assert.equal(H.cleanRecord(records[0]).files[0].historyClassification,null);
const make=n=>({entries:Array.from({length:n},(_,i)=>({document:'DOC'+i,item:{discipline:i%2?'ELÉTRICA':'INSTRUMENTAÇÃO'},historyClassification:{emissionKind:i<35?'FIRST_POSTING':'REPOST'}}))});
const split=(plan,size,discipline,mode)=>P.split(plan,size,discipline,mode,E.splitPlan);
assert.deepEqual(split(make(55),48,'limit-only','mixed').map(g=>g.entries.length),[48,7]);
assert.deepEqual(split(make(55),48,'limit-only','separate').map(g=>g.entries.length),[35,20]);
for(const n of [48,49,96,97,110,1000,3000]) for(const discipline of ['discipline','limit-only']) for(const mode of ['mixed','separate']) {
 const plan=make(n),groups=split(plan,48,discipline,mode);
 assert.equal(groups.flatMap(g=>g.entries).length,n);assert.equal(new Set(groups.flatMap(g=>g.entries)).size,n);assert.ok(groups.every(g=>g.entries.length<=48));
 for(const g of groups){assert.ok(g.originalIndices.every((v,i,a)=>i===0||v>a[i-1]));if(mode==='separate')assert.equal(new Set(g.entries.map(e=>e.historyClassification.emissionKind==='REPOST')).size,1);if(discipline==='discipline')assert.equal(new Set(g.entries.map(e=>e.item.discipline)).size,1);}
}
assert.ok(split(make(55),10,'limit-only','separate').every(g=>g.entries.length<=10));
const many=Array.from({length:5000},(_,i)=>({id:String(i),egrdtNumber:String(i),generatedAt:'2026-01-01',files:[{document:'D'+i,revision:'0'}]}));
const started=performance.now(),big=C.buildIndex(many);for(let i=0;i<3000;i++)assert.equal(C.classify('D'+i,'0',big).emissionKind,'REPOST');
console.log(`Classification, roundtrip and batch planner passed; 5000-history / 3000-input: ${Math.round(performance.now()-started)} ms`);
