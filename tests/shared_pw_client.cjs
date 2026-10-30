'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('shared_pw_query_app.js','utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
const records=Array.from({length:2001},(_,i)=>({document:'DOC-'+i,revision:i%2?'A':'0',lastEmission:i%3?'Sim':'Previsto',sourceRow:i+2}));
let versions=[{snapshot_id:'pw-1',file_name:'PW.csv',version:1,record_count:records.length,status:'active',metadata:{importedAt:'2026-10-20T10:00:00Z'}}];
let corrupt=false,delay=null,concurrency=0,maximum=0;
let uploaded=[];let publishedMetadata=null;
async function rpc(name,{target_workspace,operation,input}){
 assert.equal(name,'grcon_pw_base');
 if(target_workspace!=='A')return {data:{versions:[],snapshot:null}};
 if(operation==='list')return {data:{versions:copy(versions)}};
 if(operation==='current')return {data:{snapshot:versions.find(v=>v.status==='active')||null}};
 if(operation==='begin'){publishedMetadata=copy(input.metadata);uploaded=[];return {data:{id:'pending-test'}};}
 if(operation==='chunk'){uploaded.push(...copy(input.rows));return {data:{ok:true}};}
 if(operation==='publish')return {data:{ok:true}};
 if(operation==='page'){
  concurrency++;maximum=Math.max(maximum,concurrency);
  if(delay)await delay;
  await new Promise(r=>setTimeout(r,1));concurrency--;
  const rows=records.slice(input.after,input.after+1000).map((payload,i)=>({row_number:input.after+i+1,payload:copy(payload)}));
  if(corrupt&&input.after===1000)rows.pop();
  return {data:{rows}};
 }
 throw Error('Operação inesperada: '+operation);
}
function client(){
 const storage=new Map();let saves=0;
 const events={};const root={setTimeout,clearTimeout,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
  addEventListener(name,fn){(events[name]??=[]).push(fn);},dispatchEvent(event){for(const fn of events[event.type]||[])fn(event);},
  GrconCloud:{state:{session:{user:{id:'user'}},membership:{workspace_id:'A',role:'operator'},online:true,client:{rpc}}},
  GrconSigemPwDashboard:{PW_BASE_KEY:'pw',kvGet:async(k,f)=>copy(storage.get(k)??f),kvSet:async(k,v)=>storage.set(k,copy(v)),
   loadPwBase:async()=>copy(storage.get('pw')||{meta:null,records:[]}),savePwBase:async base=>{saves++;storage.set('pw',copy(base));return base;}}};
 root.window=root;vm.runInNewContext(source,root);
 return {root,api:root.GrconSharedPwQuery,storage,saves:()=>saves};
}
(async()=>{
 const a=client(),b=client();await a.api.refresh();await b.api.refresh();
 assert.deepEqual(a.storage.get('pw'),b.storage.get('pw'),'computadores independentes recebem a mesma fonte');
 assert.equal(a.storage.get('pw').sourceRecords.length,2001);assert.equal(a.api.canPublish(),true);assert.equal(a.api.canEditDate(),false);
 await assert.rejects(a.api.setReferenceDate('2026-10-21','pw-1'),/Somente/);
 a.root.GrconCloud.state.membership.role='admin';assert.equal(a.api.canEditDate(),true);
 a.root.GrconCloud.state.membership.role='operator';
 assert.ok(maximum<=4);const saved=a.saves();await a.api.refresh();assert.equal(a.saves(),saved,'abrir novamente não regrava base inalterada');
 versions=[{...versions[0],snapshot_id:'pw-2',version:2}, {...versions[0],status:'archived'}];corrupt=true;
 await a.api.refresh();assert.equal(a.storage.get('pw').meta.snapshotId,'pw-1');assert.equal(a.api.state.stale,true);assert.match(a.api.state.error,/incompleto/);
 corrupt=false;await a.api.refresh();assert.equal(a.storage.get('pw').meta.snapshotId,'pw-2');
 assert.equal((await a.api.loadSnapshot('pw-1')).records.length,2001,'histórico acessível sem ativar como atual');
 a.root.GrconCloud.state.online=false;await a.api.refresh();assert.equal(a.api.current().meta.snapshotId,'pw-2');assert.equal(a.api.state.stale,true);
 a.root.GrconCloud.state.online=true;versions=[{...versions[0],snapshot_id:'pw-3',version:3}];
 let release;delay=new Promise(r=>release=r);const pending=a.api.refresh();
 for(let i=0;!concurrency&&i<100;i++)await new Promise(r=>setTimeout(r,1));
 a.root.GrconCloud.state.membership.workspace_id='B';a.root.dispatchEvent(new a.root.CustomEvent('grcon:contract-context-changed',{detail:{}}));release();await pending;delay=null;
 assert.equal(a.api.current(),null,'resposta antiga não repovoa outro contrato');
 await a.api.refresh();assert.equal(a.storage.get('pw').meta,null,'PW compartilhado anterior não aparece como base vigente do outro contrato');
 // Fase de fidelidade PW: dados brutos sem código são rastreados, sem entrar
 // nas relações classificadas nem ser confundidos com documentos oficiais.
 const valid=copy(records[1005]);
 records[1005]={document:'',pwRawInvalid:true,pwRawCells:['','Orfão de teste'],sourceRow:1007};
 versions=[{...versions[0],snapshot_id:'pw-raw',version:4,record_count:records.length,status:'active'}];
 const c=client();await c.api.refresh();
 const raw=c.api.current();
 assert.equal(raw.sourceRecords.length,2001);
 assert.equal(raw.records.length,2000,'linha sem código não deve entrar no modelo');
 assert.equal(raw.sourceRecords[1005].pwRawInvalid,true);
 await c.api.publish(raw);
 assert.equal(uploaded.length,2001,'publicação conserva todas as linhas de origem');
 assert.equal(uploaded[1005].pwRawInvalid,true);
 assert.equal(publishedMetadata.sharedSchemaVersion,2);
 await assert.rejects(c.api.publish({meta:{fileName:'invalid.csv'},sourceRecords:[{document:'',pwRawInvalid:true,pwRawCells:[]}]}),/Base PW inválida/);
 records[1005]=valid;
 console.log('PW cliente: duas sessões, 2.001 linhas, leitura paralela, cache, snapshot incompleto, histórico, offline e troca de contexto aprovados.');
})().catch(e=>{console.error(e);process.exitCode=1});
