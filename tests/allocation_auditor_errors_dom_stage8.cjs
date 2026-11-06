'use strict';
// Etapa 8 (RA-08, RA-11): falhas explicadas, prazo, cancelamento real e IA indisponível sem perder o cálculo. Run `vite build --mode allocation-auditor` before this test.
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
 postMessage(data){if(data.operation==='batch')audits++;if(globalThis.__hang?.has(data.operation)){globalThis.__hung=(globalThis.__hung||0)+1;return;}setTimeout(()=>{if(!this.stopped)void this.target.onmessage({data});},0);}
 terminate(){this.stopped=true;}
}
w.Worker=TestWorker;
for(const f of ['allocation_auditor_references.js','allocation_auditor_opinion.js','allocation_auditor_reaudit.js','allocation_auditor_fields.js','allocation_auditor_errors.js','allocation_auditor_core.js','allocation_auditor_assistant.js','allocation_auditor_corrections.js','allocation_auditor_learning.js','react-dist/allocation-auditor-app.js'])w.eval(fs.readFileSync(path.join(root,f),'utf8'));
const wait=async fn=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}console.error((w.document.querySelector('#aac-panel')||{}).textContent);throw Error('DOM wait timed out');};
const button=t=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===t);
w.fetch=async()=>({ok:false,status:503,json:async()=>({message:'IA indisponível. A auditoria por regras continua disponível.',code:'AI_NOT_CONFIGURED'})});
globalThis.__hang=new Set();
(async()=>{
 await wait(()=>w.document.querySelector('.aac-launcher'));w.document.querySelector('.aac-launcher').click();await wait(()=>w.document.querySelector('#aac-panel'));
 const seed={rows:[{document:'IS-5290.00-22313-955-C1O-001',revision:'01',title:'DOCUMENTO TECNICO',record:{},output:{discipline:'ELE',workflow:'WF',databook:'',levels:[]},identity:{discipline:'ELE',eap:''}}]};
 const tab=id=>w.document.getElementById('aac-tab-'+id);
 // 1. Prazo (watchdog): o lote trava, o prazo estoura, a mensagem explica e a tela continua usável.
 w.GrconAllocationAuditorUi.setDeadlines({batch:150,context:2000});
 await w.GrconAllocationAuditorUi.open(seed);await wait(()=>button('Auditar alocação')&&!button('Auditar alocação').disabled);
 globalThis.__hang.add('batch');button('Auditar alocação').click();
 await wait(()=>w.document.querySelector('.aac-error'));
 let box=w.document.querySelector('.aac-error').textContent;
 assert.match(box,/O que aconteceu:.*passou do prazo/);assert.match(box,/O que ficou comprometido:/);assert.match(box,/O que fazer:.*Retomar/);assert.match(box,/código TIMEOUT/);
 assert.equal(globalThis.__hung>=1,true,'o Worker recebeu a operação que travou');
 await wait(()=>!w.document.querySelector('.aac-progress'));
 // 2. Repetir depois do prazo funciona: Worker novo, sem resposta atrasada misturada.
 globalThis.__hang.delete('batch');await wait(()=>button('Auditar alocação')&&!button('Auditar alocação').disabled);button('Auditar alocação').click();
 await wait(()=>w.document.querySelector('.aac-result'));assert.equal(w.document.querySelector('.aac-error'),null,'erro anterior limpo ao repetir');
 // 3. Cancelamento real: o lote travado é interrompido na hora (Pausar = cancelar o Worker); não aparece como erro.
 globalThis.__hang.add('batch');await wait(()=>button('Reexecutar auditoria')&&!button('Reexecutar auditoria').disabled);button('Reexecutar auditoria').click();
 w.GrconAllocationAuditorUi.setDeadlines({batch:60000,context:60000,'assistant-package':60000});
 await wait(()=>button('Pausar análise'));button('Pausar análise').click();
 await wait(()=>!w.document.querySelector('.aac-progress'));
 assert.equal(w.document.querySelector('.aac-error'),null,'pausa/cancelamento não é erro');
 await wait(()=>/Análise pausada/i.test(w.document.querySelector('.aac-log').textContent));
 globalThis.__hang.clear();
 // 3b. Exportação travada: "Cancelar operação" interrompe a geração do pacote e nada parcial é entregue.
 await wait(()=>button('Auditar alocação')&&!button('Auditar alocação').disabled||button('Retomar análise')&&!button('Retomar análise').disabled);(button('Retomar análise')||button('Auditar alocação')).click();
 await wait(()=>w.document.querySelector('.aac-result')&&!w.document.querySelector('.aac-progress'));
 globalThis.__hang.add('assistant-package');await wait(()=>button('Baixar relatório e arquivos')&&!button('Baixar relatório e arquivos').disabled);button('Baixar relatório e arquivos').click();
 await wait(()=>button('Cancelar operação'));button('Cancelar operação').click();
 await wait(()=>!w.document.querySelector('.aac-progress'));assert.equal(w.document.querySelector('.aac-error'),null,'cancelar a exportação não é erro');
 await wait(()=>/interrompida a seu pedido/i.test(w.document.querySelector('.aac-log').textContent));globalThis.__hang.clear();
 // 4. IA indisponível: mensagem informativa; resultado determinístico intacto e relatório ainda disponível.
 await wait(()=>button('Reexecutar auditoria')&&!button('Reexecutar auditoria').disabled);button('Reexecutar auditoria').click();await wait(()=>w.document.querySelector('.aac-result')&&!w.document.querySelector('.aac-progress'));
 const textarea=w.document.querySelector('textarea[aria-label^="Mensagem"]');
 const rowsBefore=w.document.querySelector('.aac-result').textContent;
 const nativeSet=Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set;nativeSet.call(textarea,'Explique IS-5290.00-22313-955-C1O-001 rev 01');textarea.dispatchEvent(new w.Event('input',{bubbles:true}));
 await wait(()=>!button('Enviar').disabled);button('Enviar').click();
 await wait(()=>/AI_FAILED|código AI_FAILED/.test(w.document.querySelector('.aac-error')?.textContent||''));
 box=w.document.querySelector('.aac-error').textContent;assert.match(box,/IA/);assert.match(box,/auditoria por regras e todos os resultados continuam válidos/);
 assert.ok(w.document.querySelector('.aac-error-info'),'falha da IA é informativa, não alarme');
 assert.equal(w.document.querySelector('.aac-result').textContent,rowsBefore,'resultado determinístico não mudou');
 assert.ok(button('Baixar relatório e arquivos')||button('Ver pendências'),'relatório e pendências continuam disponíveis');
 // 5. Diagnóstico técnico seguro: só identificadores/etapas/códigos; sem documento, arquivo ou credencial.
 const diag=w.GrconAllocationAuditorUi&&JSON.parse(await (async()=>{let copied='';Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async t=>{copied=t;}},configurable:true});button('Copiar diagnóstico').click();await wait(()=>copied);return copied;})());
 assert.ok(Array.isArray(diag.operations)&&diag.operations.length>0);
 const raw=JSON.stringify(diag);assert.ok(!/IS-5290|DOCUMENTO TECNICO|access_token|Bearer|qa-token|\.xlsx/i.test(raw),'diagnóstico não vaza documento, arquivo nem credencial');
 assert.ok(diag.operations.some(o=>o.step==='batch'&&o.code==='TIMEOUT'),'registro mostra o prazo estourado por etapa');assert.ok(diag.operations.some(o=>o.code==='CANCELLED'));
 assert.ok(diag.operations.every(o=>o.operationId&&o.step&&typeof o.ms==='number'),'todo registro tem identificador, etapa e duração');
 assert.equal(errors.length,0);
 console.log(JSON.stringify({suite:'allocation_auditor_errors_dom_stage8',passed:['deadline watchdog with explained message','retry after timeout','real cancellation is not an error','export cancellation','AI failure keeps deterministic results','safe technical diagnostics']}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>dom.window.close());
