'use strict';
// Preparação de aprendizado: React real, serviço real e Worker real. RPC de identidade é fixture.
// Run `vite build --mode allocation-auditor` before this test.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),root=path.resolve(__dirname,'..'),dir=path.join(root,'workers');
const dom=new JSDOM('<section id="allocation-generator-module"><div id="grcon-allocation-auditor-root"></div></section>',{url:'https://qa.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
const errors=[];let audits=0,revision=0;
w.addEventListener('error',e=>errors.push(e.message));w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});
w.GrconCloud={state:{session:{user:{id:'qa'},access_token:'qa'},membership:{contract_id:'QA',workspace_id:'QA',role:'operator'},client:{rpc:async(_n,a)=>({data:a.operation==='sessions'?{sessions:[]}:a.operation==='history'?{runs:[]}:a.operation==='rules'?{rules:[]}:a.operation==='begin'?{id:'qa-run'}:a.operation==='authorize'?{events:[]}:a.operation==='session-write'?{revision:++revision}:{ok:true}})}}};
w.GRCONModuleLoader={ensure:async()=>{}};w.GrconAllocationGeneratorUi={assistantEnabled:()=>true,auditContext:async()=>({versions:{},bases:{},ldRecords:[]})};
class TestWorker{
 constructor(){const b={console,Date,Promise,TextEncoder,TextDecoder,Blob,URL,Uint8Array,ArrayBuffer,DataView,atob,btoa,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout};b.self=b;b.globalThis=b;
  b.postMessage=result=>{if(!this.stopped)setTimeout(()=>this.onmessage?.({data:structuredClone(result)}),0);};const c=vm.createContext(b);b.importScripts=(...files)=>files.forEach(p=>vm.runInContext(fs.readFileSync(path.resolve(dir,p),'utf8'),c));vm.runInContext(fs.readFileSync(path.join(dir,'allocation-auditor.worker.js'),'utf8'),c);this.target=b;
 }
 postMessage(data){if(data.operation==='context'){globalThis.__lastContext=data.input;globalThis.__contextCalls=(globalThis.__contextCalls||0)+1;}if(data.operation==='batch')audits++;setTimeout(()=>{if(!this.stopped)void this.target.onmessage({data});},0);}
 terminate(){this.stopped=true;}
}
w.Worker=TestWorker;
for(const f of ['allocation_auditor_references.js','allocation_auditor_opinion.js','allocation_auditor_reaudit.js','allocation_auditor_fields.js','allocation_auditor_errors.js','allocation_auditor_core.js','allocation_auditor_assistant.js','allocation_auditor_corrections.js','allocation_auditor_learning.js','react-dist/allocation-auditor-app.js'])w.eval(fs.readFileSync(path.join(root,f),'utf8'));
const wait=async fn=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}console.error((w.document.querySelector('#aac-panel')||{textContent:'sem painel'}).textContent.slice(0,1500));throw Error('DOM wait timed out');};
const button=t=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===t);

let downloads=0;const rpcCalls=[];
w.URL.createObjectURL=()=> 'blob:qa';w.URL.revokeObjectURL=()=>{};
w.HTMLAnchorElement.prototype.click=function(){downloads++;assert.equal(this.download,'GRCON_Preparacao_Aprendizado.xlsx');};
w.GrconCloud.state.client.rpc=async(_n,a)=>{rpcCalls.push(a.operation);return {data:a.operation==='list'?{validations:[],canRegister:false}:a.operation==='sessions'?{sessions:[]}:a.operation==='history'?{runs:[]}:a.operation==='rules'?{rules:[]}:a.operation==='session-write'?{revision:++revision}:{ok:true}};};
const X=require('../xlsx.full.min.js');
function fixture(){const b=X.utils.book_new();for(const name of ['HISTORICO A','HISTORICO B'])X.utils.book_append_sheet(b,X.utils.aoa_to_sheet([['DOCUMENTO','REVISAO','TITULO','ALOCAÇÃO','VERSÃO DA LD','Retorno da Fiscal 01','Resposta da Fiscal 01'],['DOC-001','','','0001','E',46322,'Corrigir título']]),name);const bytes=Buffer.from(X.write(b,{type:'array',bookType:'xlsx'}));return {name:'HISTORICO-QA.xlsx',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}
function upload(file){const input=w.document.querySelector('.aac-learning-preparation input');Object.defineProperty(input,'files',{configurable:true,value:[file]});input.dispatchEvent(new w.Event('change',{bubbles:true}));}
(async()=>{try{
 await wait(()=>w.document.querySelector('.aac-launcher'));w.document.querySelector('.aac-launcher').click();await wait(()=>w.document.querySelector('#aac-panel'));
 w.document.getElementById('aac-tab-arquivos').click();await wait(()=>w.document.querySelector('.aac-learning-preparation input'));
 assert.match(w.document.querySelector('.aac-learning-preparation').textContent,/não treina nem ativa/);
 upload(fixture());await wait(()=>w.document.querySelector('.aac-learning-preparation select'));
 const select=w.document.querySelector('.aac-learning-preparation select'),download=()=>[...w.document.querySelectorAll('.aac-learning-preparation button')][0];
 assert.equal(select.options.length,3);assert.equal(select.value,'');assert.equal(download().disabled,true,'duas abas exigem escolha explícita');
 Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype,'value').set.call(select,'HISTORICO B');select.dispatchEvent(new w.Event('change',{bubbles:true}));await wait(()=>!download().disabled);
 download().click();await wait(()=>downloads===1&&w.document.querySelector('.aac-learning-preparation').textContent.includes('Registros preservados: 1'));
 assert.match(w.document.querySelector('.aac-learning-preparation').textContent,/Revisão ausente: 1; título enviado ausente: 1/);
 assert.equal(audits,0,'preparação não inicia auditoria ou mistura os retornos com alocação preventiva');
 assert.ok(!rpcCalls.some(op=>['begin','chunk','input-chunk','candidate','register','rule-state'].includes(op)),'preparação não grava em banco nem ativa aprendizado');
 upload({name:'corrompido.xlsx',size:3,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer});await wait(()=>w.document.querySelector('.aac-learning-preparation').textContent.includes('Não foi possível ler'));
 assert.equal(downloads,1);assert.equal(w.document.querySelector('.aac-learning-preparation select'),null,'falha limpa as opções antigas');
 upload({name:'lento.xlsx',size:3,arrayBuffer:async()=>new Promise(()=>{})});await wait(()=>button('Cancelar preparação'));button('Cancelar preparação').click();await wait(()=>w.document.querySelector('.aac-learning-preparation').textContent.includes('Preparação cancelada'));assert.equal(downloads,1);
 w.document.getElementById('aac-tab-conversa').click();await wait(()=>!w.document.querySelector('.aac-learning-preparation'));assert.equal(Boolean(w.document.querySelector('.aac-learning-preparation')),false);assert.deepEqual(errors,[]);
 console.log('allocation_auditor_ml_preparation_dom_stage14: real React/service/Worker, explicit sheet, disabled guards, download, didactic gap counts, corruption recovery, no audit or database write passed');
 }finally{dom.window.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
