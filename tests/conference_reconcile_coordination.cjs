'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('posting_conference_app.js','utf8');
const start=source.indexOf('  function reconcileCurrent(options) {'),end=source.indexOf('\n  function statusChip',start);
assert.ok(start>0&&end>start);
const code='let reconcilePromise=null,pendingReconcile=null,reconcileGeneration=0;\n'+source.slice(start,end)+'\nreconcileCurrent';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 let calls=0,renders=0,release;const notices=[],events=[];
 const state={busy:false,result:null},wrap={scrollTop:47,scrollLeft:13};
 const root={GrconCloud:{state:{membership:{workspace_id:'A'},session:{user:{id:'u'}}}},
  GrconOperations:{paint:async()=>{}},dispatchEvent:event=>events.push(event)};
 const scope={state,root,History:{read:()=>[{id:'h'}]},Conference:{
  async reconcilePersisted(){const id=++calls;await new Promise(resolve=>release=resolve);return {id,summary:{total:id},base:{meta:{snapshotId:'s'},records:[]}};},
  loadAudit:async()=>[]},setBusy:value=>state.busy=value,currentOperation:null,
  el:()=>wrap,render(){renders++;wrap.scrollTop=0;wrap.scrollLeft=0;},notify:(...a)=>notices.push(a),CustomEvent:class{constructor(type,data){this.type=type;this.detail=data.detail;}},console,setTimeout};
 const reconcile=vm.runInNewContext(code,scope);
 const first=reconcile({reason:'first'});await tick();assert.equal(calls,1);
 const second=reconcile({reason:'second'});reconcile({reason:'third'});assert.equal(second,first);
 release();await tick();assert.equal(calls,2,'uma segunda execução agrupa os eventos recebidos durante a primeira');
 assert.equal(renders,0,'resultado ultrapassado não redesenha a tela');
 release();await first;assert.equal(renders,1);assert.equal(state.result.id,2);assert.equal(state.busy,false);
 assert.equal(wrap.scrollTop,47);assert.equal(wrap.scrollLeft,13);assert.equal(events.length,1);
 const pending=reconcile();await tick();root.GrconCloud.state.membership.workspace_id='B';release();await pending;
 assert.equal(state.result.id,2,'resposta do contrato anterior descartada');assert.equal(renders,1);
 assert.deepEqual(notices,[]);
 console.log('Conferência: agrupamento de eventos, resultado mais recente, rolagem, contexto e liberação dos controles aprovados.');
})().catch(e=>{console.error(e);process.exitCode=1});
