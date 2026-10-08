const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const code=fs.readFileSync(require.resolve('../contract_storage.js'),'utf8');
function boot(cached){ class Storage{ constructor(){this.data=new Map()}getItem(k){return this.data.get(k)??null}setItem(k,v){this.data.set(k,String(v))}removeItem(k){this.data.delete(k)}}
 const localStorage=new Storage();if(cached)localStorage.setItem('grcon.cloud.membership.v1',JSON.stringify(cached));
 const opened=[];const window={localStorage,Storage,indexedDB:{open:(name)=>opened.push(name),deleteDatabase:(name)=>opened.push(name)},addEventListener(){},BroadcastChannel:class{constructor(name){this.name=name}}};
 vm.runInNewContext(code,{window});return {window,opened};}
const legacy=boot({workspaceId:'UHDT',contractCode:'UHDT-D'});legacy.window.localStorage.setItem('grcon.egrdt.history.v1','legacy');assert.equal(legacy.window.localStorage.data.get('grcon.egrdt.history.v1'),'legacy');
const other=boot({workspaceId:'UGH',contractCode:'UGH'});other.window.localStorage.setItem('grcon.egrdt.history.v1','ugh');assert.equal(other.window.localStorage.data.get('grcon.egrdt.history.v1::contract::UGH'),'ugh');assert.equal(other.window.localStorage.data.get('grcon.egrdt.history.v1'),undefined);
other.window.localStorage.setItem('grcon.cloud.auth.v1','auth');assert.equal(other.window.localStorage.data.get('grcon.cloud.auth.v1'),'auth');
other.window.indexedDB.open('grcon-sigem-pw-history');assert.deepEqual(other.opened,['grcon-sigem-pw-history::contract::UGH']);
assert.equal(other.window.GrconContractStorage.needsReload({workspace_id:'UGH',contract_code:'UGH'}),false);assert.equal(other.window.GrconContractStorage.needsReload({workspace_id:'UHDT',contract_code:'UHDT-D'}),true);
console.log('Contract storage: UHDT keys preserved, other operational stores isolated, auth shared, context reload verified.');
// Exercise the actual background processor, where the cloud singleton does not exist.
(async()=>{
 const worker={performance:{now:()=>0},postMessage(){}};worker.self=worker;worker.globalThis=worker;
 const context=vm.createContext(worker);
 worker.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(require.resolve(file),'utf8'),context,{filename:file}));
 vm.runInContext(fs.readFileSync(require.resolve('../workers/triage.worker.js'),'utf8'),context);
 const initialize=contractContext=>worker.onmessage({data:{taskId:'qa',action:'initialize',payload:{index:{documents:[]},settings:{contractContext}}}});
 await initialize({code:'UGH',settings:{inheritLegacyRules:false}});
 assert.equal(worker.TriagemCore.validateDocumentCode('DOCUMENTO-DO-CONTRATO','N-1710').validationSkipped,true);
 await initialize({code:'UHDT-D',settings:{inheritLegacyRules:true}});
 assert.equal(worker.TriagemCore.validateDocumentCode('DOCUMENTO-DO-CONTRATO','N-1710').valid,false);
 await initialize({code:'UGH',settings:{inheritLegacyRules:true}});
 assert.equal(worker.TriagemCore.validateDocumentCode('DOCUMENTO-DO-CONTRATO','N-1710').valid,false);
 console.log('Background triage: contract rule opt-in and legacy UHDT validation verified.');
})().catch(error=>{console.error(error);process.exitCode=1});
