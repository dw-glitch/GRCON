'use strict';
// Actual compiled React app and Worker; local RPC fixtures for session failure/recovery.
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
for(const f of ['allocation_auditor_references.js','allocation_auditor_opinion.js','allocation_auditor_reaudit.js','allocation_auditor_core.js','allocation_auditor_assistant.js','allocation_auditor_corrections.js','allocation_auditor_learning.js','react-dist/allocation-auditor-app.js'])w.eval(fs.readFileSync(path.join(root,f),'utf8'));
const wait=async fn=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('DOM wait timed out');};
const button=t=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===t);
let failSessionWrite=true;
w.GrconCloud.state.client.rpc=async(_n,a)=>{
 if(a.operation==='session-write'&&failSessionWrite)return {error:{message:'Falha de rede simulada'}};
 return {data:a.operation==='sessions'?{sessions:[{id:'empty-session',updated_at:'2026-11-06T07:00:00Z'}]}:a.operation==='session-read'?{revision:1,payload:{messages:[{id:'empty',role:'assistant',text:'CONVERSA SEM AUDITORIA'}]}}:a.operation==='history'?{runs:[]}:a.operation==='rules'?{rules:[]}:a.operation==='begin'?{id:'qa-run'}:a.operation==='authorize'?{events:[]}:a.operation==='session-write'?{revision:++revision}:{ok:true}};
};
(async()=>{
 await wait(()=>w.document.querySelector('.aac-launcher'));w.document.querySelector('.aac-launcher').click();await wait(()=>w.document.querySelector('#aac-panel'));
 await wait(()=>button('Situação')&&!button('Situação').disabled);button('Situação').click();await wait(()=>button('Tentar salvar conversa'));
 assert.match(w.document.querySelector('[role="alert"]').textContent,/Conversa ainda não salva/);
 w.document.querySelector('[aria-label="Minimizar conversa"]').click();await wait(()=>!w.document.querySelector('#aac-panel'));w.document.querySelector('.aac-launcher').click();await wait(()=>button('Tentar salvar conversa'));
 failSessionWrite=false;await wait(()=>!button('Tentar salvar conversa').disabled);button('Tentar salvar conversa').click();await wait(()=>!button('Tentar salvar conversa')&&w.document.querySelector('footer [role="status"]').textContent==='Conversa salva.');
 assert.equal(w.document.querySelector('[role="alert"]'),null);
 const seed={rows:[{document:'IS-5290.00-22313-955-C1O-001',revision:'01',title:'DOCUMENTO TECNICO',record:{},output:{discipline:'ELE',workflow:'WF',databook:'',levels:[]},identity:{discipline:'ELE',eap:''}}]};
 await w.GrconAllocationAuditorUi.open(seed);await wait(()=>button('Auditar alocação')&&!button('Auditar alocação').disabled);button('Auditar alocação').click();await wait(()=>w.document.querySelector('.aac-plan'));
 const savedButton=()=>{const tab=w.document.getElementById('aac-tab-historico');if(tab&&tab.getAttribute('aria-selected')!=='true')tab.click();return w.document.querySelector('.aac-history button');};
 await wait(()=>savedButton()&&!savedButton().disabled);savedButton().click();await wait(()=>w.document.querySelector('.aac-messages').textContent.includes('CONVERSA SEM AUDITORIA'));
 assert.equal(w.document.querySelector('.aac-result'),null);assert.equal(w.document.querySelector('.aac-plan'),null);assert.ok(button('Auditar alocação atual'));assert.equal(errors.length,0);
 console.log(JSON.stringify({suite:'allocation_auditor_session_dom_phase2',passed:['network failure is visible','close and reopen preserves conversation','retry confirms conversation saved','empty session removes previous result and correction plan'],actualReact:true,actualWorker:true,limitations:'JSDOM and RPC fixtures; no visual or mobile homologation'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>dom.window.close());
