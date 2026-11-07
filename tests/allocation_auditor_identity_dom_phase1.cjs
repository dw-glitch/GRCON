'use strict';
// Actual compiled React app and Worker; simulated DOM, file transport and RPC.
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
 postMessage(data){if(data.operation==='batch')audits++;setTimeout(()=>{if(!this.stopped)void this.target.onmessage({data});},0);}
 terminate(){this.stopped=true;}
}
w.Worker=TestWorker;
for(const f of ['allocation_auditor_references.js','allocation_auditor_opinion.js','allocation_auditor_reaudit.js','allocation_auditor_fields.js','allocation_auditor_errors.js','allocation_auditor_core.js','allocation_auditor_assistant.js','allocation_auditor_corrections.js','allocation_auditor_learning.js','react-dist/allocation-auditor-app.js'])w.eval(fs.readFileSync(path.join(root,f),'utf8'));
const wait=async fn=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('DOM wait timed out');};
const button=t=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===t);
(async()=>{
 await wait(()=>w.document.querySelector('.aac-launcher'));w.document.querySelector('.aac-launcher').click();await wait(()=>w.document.querySelector('#aac-panel'));
 const X=require('../xlsx.full.min.js'),wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([['DOCUMENTO','REVISAO'],['IS-5290.00-22313-955-C1O-001','01']]),'GERAL');const bytes=new Uint8Array(X.write(wb,{type:'array',bookType:'xlsx'}));
 const file={name:'EXTERNA.xlsx',size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
 const input=w.document.querySelector('input[type="file"]');Object.defineProperty(input,'files',{value:[file],configurable:true});input.dispatchEvent(new w.Event('change',{bubbles:true}));
 await wait(()=>w.document.querySelector('[aria-label="Confirmar identificação das alocações"]'));
 assert.equal(audits,0,'Unidentified allocation cannot start automatically');assert.equal(button('Confirmar identificação e auditar').disabled,true);
 assert.match(w.document.querySelector('.aac-messages').textContent,/Informe o número\/código/);
 w.document.querySelector('[aria-label="Minimizar conversa"]').click();await wait(()=>!w.document.querySelector('#aac-panel'));w.document.querySelector('.aac-launcher').click();await wait(()=>w.document.querySelector('[aria-label="Confirmar identificação das alocações"]'));
 w.document.querySelector('[aria-label="Confirmar identificação das alocações"] input[type="checkbox"]').click();await wait(()=>!button('Confirmar identificação e auditar').disabled);button('Confirmar identificação e auditar').click();
 await wait(()=>w.document.querySelector('.aac-plan'));assert.equal(audits,1);assert.equal(w.document.querySelector('[aria-label="Confirmar identificação das alocações"]'),null);
 assert.match(w.document.querySelector('.aac-result').textContent,/1 de 1/);assert.match(w.document.querySelector('.aac-result').textContent,/[1-9]\d* documento\(s\) com verificação pendente/);assert.equal(errors.length,0);
 console.log(JSON.stringify({suite:'allocation_auditor_identity_dom_phase1',passed:['real React upload','identification gate','empty confirmation disabled','close and reopen preserves pending identity','explicit draft confirmation starts Worker','result retains pending checks'],limitations:'JSDOM; file transport and RPC fixtures; no pixel or mobile verification'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>dom.window.close());
