'use strict';
// Etapa 6 (RA-13): chat real (React + Worker). Run `vite build --mode allocation-auditor` before this test.
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
w.GrconCloud.state.client.rpc=async(_n,a)=>({data:a.operation==='sessions'?{sessions:[]}:a.operation==='history'?{runs:[]}:a.operation==='rules'?{rules:[]}:a.operation==='session-write'?{id:a.input?.id||'s',revision:++revision}:{}});
(async()=>{
 await wait(()=>w.document.querySelector('.aac-launcher'));w.document.querySelector('.aac-launcher').click();await wait(()=>w.document.querySelector('#aac-panel'));
 const panel=w.document.querySelector('#aac-panel');
 // Estrutura: etapas, abas por teclado, nenhum acordeão, composer visível, ação principal única.
 assert.equal(panel.querySelectorAll('details,summary').length,0,'nenhum acordeão no chat');
 assert.equal(panel.querySelectorAll('[role="tab"]').length,4);assert.equal(panel.querySelector('[role="tablist"]').getAttribute('aria-label'),'Seções do auditor');
 assert.equal(panel.querySelectorAll('.aac-stages li').length,6);assert.equal(panel.querySelector('[aria-current="step"]').textContent.includes('Alocação'),true);
 assert.ok(panel.querySelector('.aac-start'),'início guiado: número, alocação atual ou arquivo');assert.ok(panel.querySelector('.aac-start-number input'));
 assert.ok(panel.querySelector('textarea[aria-label^="Mensagem"]'));
 const tab=id=>w.document.getElementById('aac-tab-'+id);
 tab('conversa').focus();tab('conversa').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await wait(()=>tab('pendencias').getAttribute('aria-selected')==='true');
 assert.match(w.document.querySelector('.aac-pend').textContent,/Ainda não há resultados/);tab('conversa').click();
 // Resultado: Ver pendências mostra as ocorrências dentro da interface.
 const seed={rows:[{document:'IS-5290.00-22313-955-C1O-001',revision:'01',title:'DOCUMENTO TECNICO',record:{},output:{discipline:'ELE',workflow:'WF',databook:'',levels:[]},identity:{discipline:'ELE',eap:''}}]};
 await w.GrconAllocationAuditorUi.open(seed);await wait(()=>button('Auditar alocação')&&!button('Auditar alocação').disabled);
 assert.equal([...panel.querySelectorAll('button')].filter(b=>b.textContent==='Auditar alocação').length,1,'uma única ação principal de auditar');
 button('Auditar alocação').click();await wait(()=>w.document.querySelector('.aac-result'));
 await wait(()=>button('Ver pendências'));
 assert.equal([...panel.querySelectorAll('button')].filter(b=>/^Baixar/.test(b.textContent)).length,1,'um único botão de download');
 assert.match(panel.querySelector('.aac-result').textContent,/1 de 1 documentos analisados/);assert.match(panel.querySelector('.aac-result').textContent,/Impedimentos|impedimento|verificação/i);
 button('Ver pendências').click();await wait(()=>w.document.querySelector('.aac-item'));
 const first=w.document.querySelector('.aac-item').textContent;
 for(const label of ['Por que importa','O que fazer','Onde corrigir','Como verificar','Campo'])assert.ok(first.includes(label),'orientação individual: '+label);
 assert.ok(w.document.querySelectorAll('.aac-item').length>=1);
 // Filtros e busca atuam sobre a lista; busca sem resultado explica o que ajustar.
 const search=w.document.querySelector('.aac-pend input[type="search"]');
 const nativeSet=Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set;nativeSet.call(search,'zzzz-inexistente');search.dispatchEvent(new w.Event('input',{bubbles:true}));
 await wait(()=>w.document.querySelectorAll('.aac-item').length===0);assert.match(w.document.querySelector('.aac-pend').textContent,/Nenhum item neste filtro/);
 nativeSet.call(search,'');search.dispatchEvent(new w.Event('input',{bubbles:true}));await wait(()=>w.document.querySelectorAll('.aac-item').length>=1);
 // Reauditoria: reexecutar compara o resultado anterior com o novo e mostra o resumo no cartão e nas pendências.
 tab('conversa').click();await wait(()=>button('Reexecutar auditoria')&&!button('Reexecutar auditoria').disabled);button('Reexecutar auditoria').click();
 await wait(()=>/Reauditoria de 1 documento/.test(w.document.querySelector('.aac-result')?.textContent||''));
 assert.match(w.document.querySelector('.aac-result').textContent,/persistente\(s\)/,'a comparação diz o que persiste');
 tab('pendencias').click();await wait(()=>w.document.querySelector('.aac-item'));
 assert.ok([...w.document.querySelectorAll('.aac-status')].some(x=>x.textContent==='Persiste após a correção'),'itens que persistem ganham o rótulo da reauditoria');
 // Minimizar e reabrir preserva a aba e o resultado.
 w.document.querySelector('[aria-label="Minimizar conversa"]').click();await wait(()=>!w.document.querySelector('#aac-panel'));
 assert.match(w.document.querySelector('.aac-launcher').textContent,/pendências|Ver resultado|\d/);
 w.document.querySelector('.aac-launcher').click();await wait(()=>w.document.querySelector('.aac-item'));
 assert.equal(w.document.getElementById('aac-tab-pendencias').getAttribute('aria-selected'),'true');
 // Mensagem de recuperação com o que aconteceu / comprometido / fazer.
 tab('arquivos').click();await wait(()=>w.document.querySelector('.aac-files'));assert.ok(w.document.querySelector('.aac-files input[type="file"]'));
 assert.equal(errors.length,0);
 console.log(JSON.stringify({suite:'allocation_auditor_chat_dom_stage6',passed:['no accordions','tabs by keyboard','six stages','guided start','single primary audit action','single download action','pendências inside the UI with guidance','filter and search','reaudit comparison in card and list','minimize and reopen keeps tab']}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>dom.window.close());
