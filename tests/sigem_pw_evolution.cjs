const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const Evo = require('../sigem_pw_evolution_core.js');

function s(document, revision, extra={}) { return { document, revision, status:'Em análise', ...extra }; }
function p(document, revision, extra={}) { return { document, revision, revisionComplete: revision, state:'Liberado', lastEmission:'Sim', ...extra }; }
function snap(system, records) { return Evo.buildSnapshot(system, { meta:{ fileName:`${system}.xlsx`, importedAt:'2026-09-11T12:00:00Z', sourceRowCount:records.length, recordCount:records.length }, records }, Evo.buildLdUniverse(records.map(r=>({document:r.document, revision:r.revision, discipline:'DOC'})), [])); }

const A='RL-5290.00-22313-ABC-C1O-001';
const B='CE-5290.00-22313-856-C1O-002';
const C='DE-5290.00-22313-001-C1O-003';
const D='PR-5290.00-22313-XYZ-C1O-004';

(function noChange(){
  const before=snap('sigem',[s(A,'0'),s(B,'0')]);
  const after=snap('sigem',[s(A,'0'),s(B,'0')]);
  const d=Evo.compareSnapshots(before,after); assert.equal(d.added.length,0); assert.equal(d.removed.length,0); assert.equal(d.net,0);
})();
(function newDocument(){
  const d=Evo.compareSnapshots(snap('sigem',[s(A,'0')]),snap('sigem',[s(A,'0'),s(B,'0')])); assert.equal(d.added.length,1); assert.equal(d.added[0].document,B);
})();
(function newRevision(){
  const d=Evo.compareSnapshots(snap('sigem',[s(A,'0')]),snap('sigem',[s(A,'0'),s(A,'A')])); assert.equal(d.added.length,1); assert.equal(d.added[0].revision,'A');
})();
(function twoNewRevisions(){
  const d=Evo.compareSnapshots(snap('sigem',[s(A,'0')]),snap('sigem',[s(A,'0'),s(A,'A'),s(A,'B')])); assert.equal(d.added.length,2);
})();
(function reorder(){
  const before=snap('sigem',[s(A,'0'),s(B,'0'),s(C,'0')]);
  const after=snap('sigem',[s(C,'0'),s(A,'0'),s(B,'0')]);
  const d=Evo.compareSnapshots(before,after); assert.equal(d.added.length,0); assert.equal(d.removed.length,0);
})();
(function inAndOut(){
  const d=Evo.compareSnapshots(snap('sigem',[s(A,'0'),s(B,'0'),s(C,'0')]),snap('sigem',[s(A,'0'),s(C,'0'),s(D,'0')]));
  assert.equal(d.added.length,1); assert.equal(d.added[0].document,D); assert.equal(d.removed.length,1); assert.equal(d.removed[0].document,B); assert.equal(d.net,0);
})();
(function externalScope(){
  const ext='RL-5290.00-22399-ABC-C1O-999';
  const universe=Evo.buildLdUniverse([{document:A}],[]);
  const built=Evo.buildSnapshot('pw',{meta:{sourceRowCount:2,recordCount:2},records:[p(A,'0'),p(ext,'0')]},universe);
  assert.equal(built.records.length,1); assert.equal(built.rejected.length,1); assert.ok(built.rejected[0].reason);
})();
(function sameCodeThreeRevisions(){
  const built=snap('sigem',[s(A,'A'),s(A,'B'),s(A,'C')]); assert.equal(built.records.length,3); assert.equal(built.audit.uniqueDocuments,1);
})();
(function multisetSameOccurrence(){
  const universe=Evo.buildLdUniverse([{document:A}],[]);
  const before=Evo.buildSnapshot('sigem',{meta:{sourceRowCount:1,recordCount:1},records:[s(A,'A',{status:'X'})]},universe);
  const after=Evo.buildSnapshot('sigem',{meta:{sourceRowCount:2,recordCount:2},records:[s(A,'A',{status:'X'}),s(A,'A',{status:'Y'})]},universe);
  const d=Evo.compareSnapshots(before,after); assert.equal(d.added.length,1,'multiplicidade precisa contar +1');
})();
(function statusChangeAloneIsNotNew(){
  const universe=Evo.buildLdUniverse([{document:A}],[]);
  const before=Evo.buildSnapshot('sigem',{meta:{sourceRowCount:1},records:[s(A,'A',{status:'Em análise'})]},universe);
  const after=Evo.buildSnapshot('sigem',{meta:{sourceRowCount:1},records:[s(A,'A',{status:'Aprovado'})]},universe);
  const d=Evo.compareSnapshots(before,after); assert.equal(d.added.length,0); assert.equal(d.removed.length,0); assert.equal(d.metadataChanged.length,1);
})();
(function exactTechnicalDuplicatesCollapse(){
  const universe=Evo.buildLdUniverse([{document:A}],[]);
  const built=Evo.buildSnapshot('sigem',{meta:{sourceRowCount:2},records:[s(A,'A'),s(A,'A')]},universe);
  assert.equal(built.records.length,1); assert.equal(built.duplicates.length,1);
})();
(function ldUniverseRequiredWhenAvailable(){
  const universe=Evo.buildLdUniverse([{document:A,tag:'TAG-1',discipline:'DOC'}],[]);
  const built=Evo.buildSnapshot('sigem',{meta:{sourceRowCount:2},records:[s(A,'A'),s(B,'0')]},universe);
  assert.equal(built.records.length,1); assert.equal(built.rejected[0].reason,'nao_encontrado_nas_lds'); assert.equal(built.records[0].tag,'TAG-1');
})();
(function crossSystemClassification(){
  const ld=Evo.buildLdUniverse([{document:A},{document:B},{document:C}],[]);
  const sb=Evo.buildSnapshot('sigem',{meta:{sourceRowCount:1},records:[s(A,'0')]},ld);
  const sc=Evo.buildSnapshot('sigem',{meta:{sourceRowCount:3},records:[s(A,'0'),s(B,'A'),s(C,'0')]},ld);
  const pb=Evo.buildSnapshot('pw',{meta:{sourceRowCount:1},records:[p(A,'0')]},ld);
  const pc=Evo.buildSnapshot('pw',{meta:{sourceRowCount:2},records:[p(A,'0'),p(C,'0')]},ld);
  const period=Evo.comparePeriod(sb,sc,pb,pc);
  assert.equal(period.sigem.added.length,2); assert.equal(period.pw.added.length,1);
  assert.equal(period.relation.newInBoth.length,1); assert.equal(period.relation.newSigemMissingPw.length,1); assert.equal(period.relation.newSigemMissingPw[0].document,B);
})();
(function performanceLinear(){
  const count=20000; const ldRows=[]; const before=[]; const after=[];
  for(let i=0;i<count;i++){
    const doc=`ABC_RNEST_U32_1.1.1.1_REP_TAG${String(i).padStart(5,'0')}_001`;
    ldRows.push({document:doc}); before.push(s(doc,'0')); after.push(s(doc,'0'));
  }
  for(let i=0;i<250;i++) after.push(s(before[i].document,'A'));
  const universe=Evo.buildLdUniverse(ldRows,[]);
  const a=Evo.buildSnapshot('sigem',{meta:{sourceRowCount:before.length},records:before},universe);
  const b=Evo.buildSnapshot('sigem',{meta:{sourceRowCount:after.length},records:after},universe);
  const start=performance.now(); const d=Evo.compareSnapshots(a,b); const ms=performance.now()-start;
  assert.equal(a.records.length,count); assert.equal(d.added.length,250); assert.ok(ms<1500,`20k comparison too slow: ${ms.toFixed(1)}ms`);
  console.log(`evolution perf 20k=${ms.toFixed(1)}ms`);
})();

(function sourceContracts(){
  const fs=require('node:fs'); const path=require('node:path'); const rootDir=path.resolve(__dirname,'..');
  const app=fs.readFileSync(path.join(rootDir,'sigem_pw_evolution_app.js'),'utf8');
  const bootstrap=fs.readFileSync(path.join(rootDir,'sigem_pw_dashboard_bootstrap.js'),'utf8');
  const scope=fs.readFileSync(path.join(rootDir,'sigem_pw_scope_fix.js'),'utf8');
  assert.match(app,/Novos no SIGEM/); assert.match(app,/Novos no PW/); assert.match(app,/Ainda não no PW/);
  assert.match(app,/Cadastrados no SIGEM/); assert.match(app,/Encontrados no ProjectWise/); assert.match(app,/bookType\s*:\s*"xlsx"/);
  assert.match(app,/LD necessária para calcular a evolução/); assert.match(app,/spw-evo-filter-document-type/); assert.match(app,/spw-evo-filter-source/); assert.match(app,/data-evo-select/);
  assert.match(bootstrap,/sigem_pw_evolution_core\.js/); assert.match(bootstrap,/sigem_pw_evolution_app\.js/);
  assert.match(scope,/scopeDiscardedRecords/); assert.match(scope,/SCOPE_VERSION = 3/);
})();

console.log('sigem_pw_evolution: OK — movimentação por registros/multiconjunto, LD, auditoria, drill-down e desempenho validados.');
