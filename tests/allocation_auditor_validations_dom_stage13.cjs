'use strict';
// RA-07: registro de validações de referências na tela (React real + Worker). Run `vite build --mode allocation-auditor` before this test.
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
// ---- servidor simulado do registro de validações ----
let role='owner',missing=false,registryOffline=false,registerLostAck=0,store=[],calls=[];
w.GrconCloud.state.client.rpc=async(name,a)=>{
 if(name==='grcon_allocation_reference_validations'){
  calls.push({op:a.operation,input:a.input});
  if(missing)return {error:{message:'Could not find the function public.grcon_allocation_reference_validations(operation, input, target_workspace) in the schema cache'}};
  if(a.operation==='list'&&registryOffline)return {error:{message:'Falha de rede ao consultar validações'}};
  if(a.operation==='list')return {data:{validations:store.filter(v=>!v.revoked),canRegister:['owner','admin'].includes(role)}};
  if(!['owner','admin'].includes(role))return {error:{message:'Somente o proprietário ou administrador do contrato registra validações.'}};
  if(a.operation==='register'){const i=a.input,previous=store.find(v=>v.request_id===i.requestId);if(previous)return {data:{id:previous.id}};store.push({request_id:i.requestId,id:'v'+(store.length+1),record_type:i.recordType,kind:i.kind,revision:i.revision||null,sha256:null,responsible:i.responsible,validated_on:i.validatedOn,evidence:i.evidence,effective_date:i.effectiveDate||null,effective_evidence:i.effectiveEvidence||null});if(registerLostAck-- >0)return {error:{message:'Resposta perdida depois da gravação'}};return {data:{id:'v'+store.length}};}
  if(a.operation==='revoke'){const v=store.find(x=>x.id===a.input.id);v.revoked=true;v.reason=a.input.reason;return {data:{ok:true}};}
 }
 return {data:a.operation==='begin'?{id:'qa-run'}:a.operation==='sessions'?{sessions:[]}:a.operation==='history'?{runs:[]}:a.operation==='rules'?{rules:[]}:a.operation==='session-write'?{id:a.input?.id||'s',revision:++revision}:{}};
};
const setValue=(el,value)=>{const proto=el.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:el.tagName==='SELECT'?w.HTMLSelectElement.prototype:w.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new w.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
const field=label=>[...w.document.querySelectorAll('.aac-validations label')].find(l=>l.textContent.startsWith(label)).querySelector('input,select,textarea');
(async()=>{
 await wait(()=>w.document.querySelector('.aac-launcher'));w.document.querySelector('.aac-launcher').click();await wait(()=>w.document.querySelector('#aac-panel'));
 const tab=id=>w.document.getElementById('aac-tab-'+id);
 // 1. proprietário: vê a explicação, a lista vazia e o formulário
 tab('arquivos').click();await wait(()=>[...w.document.querySelectorAll('.aac-validations button')].some(b=>b.textContent==='Registrar validação'));
 assert.match(w.document.querySelector('.aac-validations').textContent,/Localizado, carregado, validado e homologado são coisas diferentes/);assert.match(w.document.querySelector('.aac-validations').textContent,/Nenhuma validação registrada/);
 const submit=()=>[...w.document.querySelectorAll('.aac-validations form button[type=submit]')].find(b=>b.textContent.startsWith('Registrar '));
 assert.equal(submit().disabled,true,'sem responsável e evidência não registra');
 // ET exige revisão (nunca presumida)
 setValue(field('Responsável'),'Maria Souza');setValue(field('Evidência (documento'),'Ata de validação 12/2026');await wait(()=>true);
 assert.equal(submit().disabled,true,'ET sem revisão não registra');assert.match(submit().closest('form').textContent,/obrigatória: a revisão da ET nunca é presumida/);
 setValue(field('Revisão'),'R');await wait(()=>!submit().disabled);
 // vigência: data sem evidência trava
 setValue(field('Início da vigência'),'24/08/2026');await wait(()=>submit().disabled);assert.match(submit().closest('form').textContent,/andam juntas/);
 setValue(field('Evidência da vigência'),'Memorial UHDT-D, seção 3');await wait(()=>!submit().disabled);
 registerLostAck=1;submit().click();await wait(()=>store.length===1&&w.document.querySelector('.aac-error')&&!submit().disabled);
 assert.equal(field('Evidência (documento').value,'Ata de validação 12/2026','falha preserva a evidência preenchida');
 const retryId=calls.find(c=>c.op==='register').input.requestId;submit().click();await wait(()=>store.length===1&&w.document.querySelector('.aac-validation-list li'));
 assert.equal(calls.filter(c=>c.op==='register').at(-1).input.requestId,retryId,'reenvio após resposta perdida não duplica a validação');
 const sent=calls.find(c=>c.op==='register').input;assert.ok(/^[0-9a-f-]{36}$/.test(sent.requestId),'cada registro tem requestId (idempotência)');assert.deepEqual([sent.recordType,sent.kind,sent.revision,sent.responsible,sent.effectiveDate],['validacao','et-codificacao','R','Maria Souza','24/08/2026']);
 assert.match(w.document.querySelector('.aac-validation-list').textContent,/Validação · ET-5290.*rev\. R/s);assert.match(w.document.querySelector('.aac-validation-list').textContent,/Maria Souza/);assert.match(w.document.querySelector('.aac-validation-list').textContent,/Ata de validação 12\/2026/);
 // 2. a validação chega ao motor: contexto enviado ao Worker traz o registro com responsável, data e evidência
 tab('conversa').click();
 const seed={rows:[{document:'IS-5290.00-22313-955-C1O-001',revision:'01',title:'DOCUMENTO TECNICO',record:{},output:{discipline:'ELE',workflow:'WF',databook:'',levels:[]},identity:{discipline:'ELE',eap:''}}]};
 await w.GrconAllocationAuditorUi.open(seed);await wait(()=>button('Auditar alocação')&&!button('Auditar alocação').disabled);button('Auditar alocação').click();await wait(()=>w.document.querySelector('.aac-result'));
 const ctx=globalThis.__lastContext;assert.equal(ctx.referenceValidations.length,1);const v=ctx.referenceValidations[0];
 assert.deepEqual([v.kind,v.revision,v.by,v.at,v.evidence,v.origin],['et-codificacao','R','Maria Souza',String(sent.validatedOn).split('-').reverse().join('/'),'Ata de validação 12/2026','registro']);assert.equal(v.effective.date,'24/08/2026');assert.equal(ctx.referenceHomologations.length,0);
 // Falha na consulta não reutiliza aprovações do carregamento anterior.
 registryOffline=true;await service_reload();tab('conversa').click();await wait(()=>button('Reexecutar auditoria')&&!button('Reexecutar auditoria').disabled);const offlineCalls=globalThis.__contextCalls;button('Reexecutar auditoria').click();await wait(()=>globalThis.__contextCalls>offlineCalls&&!w.document.querySelector('.aac-progress'));assert.equal(globalThis.__lastContext.referenceValidations.length,0,'aprovação antiga não entra no motor quando a consulta falha');registryOffline=false;await service_reload();await wait(()=>w.document.querySelector('.aac-validations select'));
 // A escolha da revisão é uma ação operacional explícita, sem homologar a fonte.
 setValue(field('Escopo da conferência'),'R');setValue(field('Referência que determina'),'Contrato QA, revisão aplicável R');const chooseRevision=()=>[...w.document.querySelectorAll('.aac-validations button')].find(b=>b.textContent==='Definir revisão da conferência');await wait(()=>!chooseRevision().disabled);chooseRevision().click();tab('conversa').click();await wait(()=>button('Auditar alocação')&&!button('Auditar alocação').disabled);const choiceCalls=globalThis.__contextCalls;button('Auditar alocação').click();await wait(()=>globalThis.__contextCalls>choiceCalls&&!w.document.querySelector('.aac-progress'));assert.equal(globalThis.__lastContext.applicability.revision,'R');assert.equal(globalThis.__lastContext.applicability.evidence,'Contrato QA, revisão aplicável R');
 // 3. revogar exige motivo; o registro some da lista (e do próximo contexto)
 tab('arquivos').click();await wait(()=>w.document.querySelector('.aac-validation-list li'));
 await wait(()=>{const b=[...w.document.querySelectorAll('.aac-validation-list button')].find(b=>b.textContent==='Revogar');return b&&!b.disabled;});
 [...w.document.querySelectorAll('.aac-validation-list button')].find(b=>b.textContent==='Revogar').click();await wait(()=>w.document.querySelector('[aria-label="Motivo da revogação"]'));
 const confirm=()=>[...w.document.querySelectorAll('.aac-validation-list button')].find(b=>b.textContent==='Confirmar revogação');
 assert.equal(confirm().disabled,true);setValue(w.document.querySelector('[aria-label="Motivo da revogação"]'),'Substituída pela Rev. S');await wait(()=>!confirm().disabled);confirm().click();
 await wait(()=>!w.document.querySelector('.aac-validation-list li'));assert.equal(store[0].reason,'Substituída pela Rev. S');
 // 4. perfil sem permissão: lista visível, sem formulário, com a regra dita
 role='operator';store.push({id:'vx',record_type:'validacao',kind:'n-381',revision:'M',responsible:'Joana Lima',validated_on:'2026-11-01',evidence:'Registro anterior'});
 await service_reload();
 await wait(()=>!submit()&&w.document.querySelector('.aac-validation-list li'));assert.match(w.document.querySelector('.aac-validations').textContent,/Somente o proprietário ou administrador do contrato registra/);
 assert.ok(![...w.document.querySelectorAll('.aac-validation-list button')].some(b=>b.textContent==='Revogar'),'sem permissão não há botão de revogar');
 // 5. banco sem a atualização: aviso claro (não é erro), sem formulário, e a auditoria segue
 missing=true;await service_reload(true);
 await wait(()=>w.document.querySelector('.aac-validations .aac-warn'));assert.match(w.document.querySelector('.aac-validations .aac-warn').textContent,/ainda não está disponível neste ambiente/);assert.ok(!submit());
 tab('conversa').click();await wait(()=>button('Reexecutar auditoria')&&!button('Reexecutar auditoria').disabled);const before=globalThis.__contextCalls;button('Reexecutar auditoria').click();await wait(()=>globalThis.__contextCalls>before&&!w.document.querySelector('.aac-progress')&&w.document.querySelector('.aac-result'));
 assert.equal((w.document.querySelector('.aac-error')||{textContent:''}).textContent,'','a falta do registro de validações não derruba a auditoria');assert.equal(globalThis.__lastContext.referenceValidations.length,0);
 assert.equal(errors.length,0);
 console.log(JSON.stringify({suite:'allocation_auditor_validations_dom_stage13',passed:['form guards (responsible, evidence, ET revision, effective pair)','register with requestId','validation reaches the engine context','revoke needs a reason','read-only for non-admins','database without the function degrades with a notice']}));
 async function service_reload(){tab('conversa').click();await new Promise(r=>setTimeout(r,30));tab('arquivos').click();await new Promise(r=>setTimeout(r,50));} // reabrir a aba Arquivos recarrega a lista
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>dom.window.close());
