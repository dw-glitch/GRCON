'use strict';
// Real production TypeScript services + real RPC migrations in local PGlite.
// Worker transport/calculation and generator references are controlled fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite'),ts=require('typescript'),C=require('../allocation_auditor_core.js'),X=require('../xlsx.full.min.js'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..'),u=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),checks=[];
const migration='20261107120803_allocation_auditor_complete_checkpoint.sql';
const canonical=v=>v&&typeof v.toJSON==='function'?canonical(v.toJSON()):JSON.stringify(v===undefined?null:v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,JSON.parse(canonical(v[k]))])):v);
const digest=async v=>Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(v)))).toString('hex');
const code=name=>ts.transpileModule(fs.readFileSync(path.join(root,'src/react/allocation-auditor',name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const db=new PGlite();let actor=11,legacyServer=false,noHistory=false,beginCalls=0,failOperation='',loseResponse='',faultPage='',pauseAt=0,batchCalls=0,service,reference={versions:{},bases:{},ldRecords:[],centralHistory:[]};
async function as(n){actor=n;await db.exec(`reset role;set request.jwt.claim.sub='${n?u(n):''}';set role authenticated;`);}
async function rpc(operation,input={},ws=u(1),name='grcon_allocation_auditor'){
 if(failOperation===operation)throw Error('Falha sintética em '+operation);
 if(legacyServer&&['input-chunk','input-detail'].includes(operation))throw Error('Operação não reconhecida.'); // servidor ainda sem a migração do checkpoint
 if(operation==='history'&&noHistory)return {runs:[]};
 if(operation==='begin')beginCalls++;
 const r=(await db.query('select public.'+name+'($1,$2,$3::jsonb) r',[ws,operation,JSON.stringify(input)])).rows[0].r;
 if(loseResponse===operation){loseResponse='';throw Error('Resposta perdida após gravar '+operation);}
 if(faultPage===operation&&r.rows?.length>1)r.rows.reverse();return r;
}
const cloud={session:{user:{id:u(11)}},membership:{workspace_id:u(1),contract_id:u(3),role:'operator'},client:{rpc:async(name,{operation,input})=>{try{return {data:await rpc(operation,input,u(1),name)};}catch(e){return {error:{message:e.message}};}}}};
const listeners=new Map(),g={GrconCloud:{state:cloud},GrconAllocationAuditorCore:C,GrconAllocationAssistant:{groups:()=>[]},GrconAllocationCorrections:{plan:rows=>({analyzed:rows.length,pending:rows.length,items:[]})},GRCONModuleLoader:{ensure:async()=>{}},GrconAllocationGeneratorUi:{clearAuditLd(){reference={...reference,ldRecords:[]};},auditContext:async()=>structuredClone(reference),importAuditLd:async files=>{reference={...reference,ldRecords:files.flatMap(f=>f.ldRecords||[])};}},addEventListener:(n,fn)=>{const list=listeners.get(n)||[];list.push(fn);listeners.set(n,list);}};
class FakeWorker{
 postMessage({id,operation,input}){queueMicrotask(async()=>{try{let result;
  if(operation==='context'){this.context=input;this.prepared=C.prepare(input);result={};}
  else if(operation==='batch'){batchCalls++;result=this.context.records.slice(input.first,input.first+input.count).map(r=>C.auditRecord(r,this.context,this.prepared));}
  else if(operation==='summarize')result={groups:[],summary:C.summary(input.rows)};
  else if(operation==='fingerprint')result=Buffer.from(await webcrypto.subtle.digest('SHA-256',await input.file.arrayBuffer())).toString('hex');
  else if(operation==='inspect'||operation==='parse'){
   const bytes=await input.file.arrayBuffer(),book=X.read(bytes,{type:'array',cellNF:true,sheetStubs:true});
   if(operation==='inspect')result=book.SheetNames.map(name=>({name,...C.parseWorksheet(book.Sheets[name],X,{sourceSheet:name})}));
   else {const sha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex');result={...C.parseWorksheet(book.Sheets[input.sheet],X,{contract:input.contract,sourceHash:sha256,sourceFile:input.file.name,sourceSheet:input.sheet,allocation:input.allocation||''}),sha256};}
  }else throw Error(operation);
  this.onmessage({data:{id,result}});if(operation==='batch'&&pauseAt&&input.first+result.length>=pauseAt)service.cancel();
 }catch(e){this.onmessage({data:{id,error:e.message}});}});}
 terminate(){}
}
function loadService(){const mod={exports:{}};vm.runInNewContext(code('service.ts'),{module:mod,exports:mod.exports,window:g,Worker:FakeWorker,crypto:webcrypto,setTimeout,clearTimeout,TextEncoder,Promise,Blob,URL,console});return mod.exports.service;}
function loadAssistant(svc){const mod={exports:{}};vm.runInNewContext(code('assistantStore.ts'),{module:mod,exports:mod.exports,window:g,crypto:webcrypto,TextEncoder,Promise,console,require:()=>({service:svc})});return mod.exports.assistant;}
const seed=n=>({rows:Array.from({length:n},(_,i)=>({record:{},document:'IS-5290.00-22313-955-C1O-'+String(i+1).padStart(6,'0'),revision:'01',title:'DOCUMENTO TECNICO',output:{discipline:'ELE',workflow:'WF',databook:'',levels:[]},identity:{discipline:'ELE',eap:''}}))});
const external=(n,name='EXTERNA.xlsx',offset=0)=>{const wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([['DOCUMENTO','REVISAO'],...seed(n).rows.map((r,i)=>[r.document+(offset?'-'+offset:''),r.revision])]),'GERAL');const bytes=new Uint8Array(X.write(wb,{type:'array',bookType:'xlsx'}));return {name,size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function writeInputs(id,records){for(let i=0;i<records.length;i+=100)await rpc('input-chunk',{id,first:i+1,rows:records.slice(i,i+100)});}
(async()=>{try{
 await db.exec(`create schema private;create schema auth;create role anon;create role authenticated;grant usage on schema private,auth to authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.grcon_workspaces(id uuid primary key);create table public.grcon_contracts(id uuid primary key,workspace_id uuid,active boolean);create table public.grcon_memberships(workspace_id uuid,contract_id uuid,user_id uuid,role text,active boolean);
 create function private.grcon_require_master_owner() returns void language plpgsql as $$begin if auth.uid()<>'${u(10)}' then raise exception 'Master necessário';end if;end$$;
 create table private.grcon_allocation_bases(id uuid,contract_id uuid,kind text,status text);create table private.grcon_allocation_base_rows(base_id uuid,payload jsonb);
 insert into public.grcon_workspaces values('${u(1)}'),('${u(2)}');insert into public.grcon_contracts values('${u(3)}','${u(1)}',true),('${u(4)}','${u(2)}',true);
 insert into public.grcon_memberships values('${u(1)}','${u(3)}','${u(10)}','owner',true),('${u(1)}','${u(3)}','${u(11)}','operator',true),('${u(1)}','${u(3)}','${u(12)}','viewer',true),('${u(2)}','${u(4)}','${u(13)}','operator',true);`);
 for(const file of ['20261027203851_allocation_auditor.sql','20261028090553_allocation_auditor_retry_safety.sql','20261028192535_allocation_assistant_sessions_rules.sql','20261030010508_allocation_assistant_release_safety.sql',migration])await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
 await as(11);service=loadService();
 await check('Retomada 1/3 mantém entrada e total de três documentos',async()=>{
  await service.open(seed(3));await service.analyze();const s=service.snapshot(),metadata={snapshotVersion:2,inputHash:await digest(s.records),referenceHash:s.context.referenceHash,engine:C.VERSION,versions:{},sources:[]};
  const {id}=await rpc('begin',{requestId:webcrypto.randomUUID(),count:3,metadata});await writeInputs(id,s.records);await rpc('chunk',{id,first:1,rows:s.rows.slice(0,1)});
  await service.restoreById(id);assert.equal(service.snapshot().progress,1);assert.equal(service.snapshot().records.length,3);await service.analyze(true);assert.equal(service.snapshot().total,3);assert.equal(service.snapshot().progress,3);await service.save();
 });
 for(const total of [500,12000])await check('Pausa real no lote 100/'+total+', salvar, restaurar e concluir sem perder registros',async()=>{
  service.clear();pauseAt=100;await service.open(seed(total));await service.analyze();assert.equal(service.snapshot().progress,100);await service.save();const id=service.snapshot().runId;
  service.clear();await service.restoreById(id);assert.equal(service.snapshot().records.length,total);assert.equal(service.snapshot().total,total);assert.equal(service.snapshot().progress,100);
  pauseAt=0;await service.analyze(true);assert.equal(service.snapshot().progress,total);assert.equal(new Set(service.snapshot().rows.map(r=>r.document)).size,total);await service.save();
  const detail=await rpc('detail',{id});assert.ok(detail.run.completed_at);console.log(JSON.stringify({documents:total,inputBytes:Buffer.byteLength(JSON.stringify(service.snapshot().records)),expected:detail.run.expected_count}));
 });
 await check('Reanexar planilha mantém identificação manual, ordem e decisões; hash diferente é rejeitado',async()=>{
  service.clear();const f=external(500);const imported=await service.importMany([f]);service.confirmAllocationIdentities([{sha256:imported.unidentified[0].sha256,value:'0037'}]);pauseAt=100;await service.analyze();await service.review(0,{state:'Correção proposta',decision:'proposed',field:'title',value:'TITULO QA',justification:'Conferência sintética de decisão',evidence:['QA']});await service.save();const id=service.snapshot().runId;
  service.clear();await service.restoreById(id);const before=canonical(service.snapshot().records);await assert.rejects(service.analyze(true),/Reanexe todas/);
  await assert.rejects(service.importMany([external(500,'EXTERNA.xlsx',1)]),/hash não corresponde/);assert.equal(canonical(service.snapshot().records),before);
  const restored=await service.importMany([f]);assert.equal(restored.checkpoint,true);assert.equal(canonical(service.snapshot().records),before);assert.equal(service.snapshot().records[499].allocation,'0037');assert.equal(service.snapshot().events.length,1);assert.equal(service.snapshot().events[0].after,'TITULO QA');pauseAt=0;await service.analyze(true);assert.equal(service.snapshot().progress,500);assert.equal(service.snapshot().events.length,1);
 });
 await check('Reanexação de LD idêntica preserva o checkpoint e recompõe a referência',async()=>{
  service.clear();const f=external(500,'C1O-ALOC-CM-0037-2026.xlsx'),ld={...external(1,'LD-REFERENCIA.xlsx'),ldRecords:[{document:seed(1).rows[0].document,revision:'01',title:'DOCUMENTO TECNICO',source:'LD-REFERENCIA.xlsx',sheet:'ELE',row:2}]};
  await service.importMany([f]);await service.importAssistantLd([ld]);pauseAt=100;await service.analyze();await service.save();const id=service.snapshot().runId;service.clear();await service.restoreById(id);
  const records=canonical(service.snapshot().records);const result=await service.importAssistantLd([ld]);assert.equal(result.unchanged,true);assert.equal(service.snapshot().progress,100);assert.equal(service.snapshot().runId,id);assert.equal(canonical(service.snapshot().records),records);await service.importMany([f]);pauseAt=0;await service.analyze(true);assert.equal(service.snapshot().progress,500);reference.ldRecords=[];
 });
 await check('Alteração de versão, referência, motor ou indisponibilidade bloqueia continuação sem reduzir total',async()=>{
  service.clear();pauseAt=100;await service.open(seed(500));await service.analyze();const before=service.snapshot();reference.versions={eap:'nova'};await assert.rejects(service.analyze(true),/bases mudaram/);assert.equal(service.snapshot().total,500);reference.versions={};
  reference.ldRecords=[{document:before.records[0].document,revision:'02',source:'LD.xlsx'}];await assert.rejects(service.analyze(true),/referências ou o histórico mudaram/);reference.ldRecords=[];
  g.GrconAllocationAuditorCore={...C,VERSION:'versão-nova'};await assert.rejects(service.analyze(true),/O motor mudou/);g.GrconAllocationAuditorCore=C;
  const original=g.GrconAllocationGeneratorUi.auditContext;g.GrconAllocationGeneratorUi.auditContext=async()=>{throw Error('offline');};await assert.rejects(service.analyze(true),/confirmar as referências/);g.GrconAllocationGeneratorUi.auditContext=original;
 });
 await check('Falha e resposta perdida no salvamento permitem retry idêntico sem duplicar dados',async()=>{
  service.clear();pauseAt=0;await service.open(seed(3));await service.analyze();failOperation='input-chunk';await assert.rejects(service.save(),/Falha sintética/);assert.equal(service.snapshot().context.saved,false);assert.match(service.snapshot().message,/não foi confirmado/);failOperation='';loseResponse='finish';await assert.rejects(service.save(),/Resposta perdida/);await service.save();assert.equal(service.snapshot().context.saved,true);const id=service.snapshot().runId;assert.equal((await rpc('input-detail',{id})).rows.length,3);
 });
 await check('Entrada incompleta e análise antiga bloqueiam retomada preservando total esperado',async()=>{
  const {id}=await rpc('begin',{requestId:webcrypto.randomUUID(),count:3,metadata:{engine:C.VERSION}});await rpc('chunk',{id,first:1,rows:[{document:'DOC-LEGADO',revision:'0',contract:u(3),findings:[],history:[]}]});await service.restoreById(id);assert.equal(service.snapshot().records.length,0);await assert.rejects(service.analyze(true),/entrada completa não foi recuperada/);assert.equal(service.snapshot().total,3);
  const records=seed(3).rows.map(r=>({contract:u(3),document:r.document,revision:r.revision}));const partial=await rpc('begin',{requestId:webcrypto.randomUUID(),count:3,metadata:{snapshotVersion:2,inputHash:await digest(records)}});await rpc('input-chunk',{id:partial.id,first:1,rows:records.slice(0,2)});await service.restoreById(partial.id);assert.equal(service.snapshot().context.inputComplete,false);await assert.rejects(service.analyze(true),/entrada completa não foi recuperada/);assert.equal(service.snapshot().total,3);
 });
 await check('Resposta perdida de decisão permite retry sem duplicar evento',async()=>{
  service.clear();pauseAt=0;await service.open(seed(3));await service.analyze();await service.review(0,{state:'Correção proposta',decision:'proposed',field:'title',value:'TITULO QA',justification:'Conferência sintética de decisão',evidence:['QA']});loseResponse='event';await assert.rejects(service.save(),/Resposta perdida/);const id=service.snapshot().runId;await service.save();assert.equal((await rpc('detail',{id})).events.length,1);
 });
 await check('Entrada salva sem primeiro lote de resultados pode retomar do zero',async()=>{
  service.clear();pauseAt=0;await service.open(seed(3));await service.analyze();failOperation='chunk';await assert.rejects(service.save(),/Falha sintética/);failOperation='';const id=service.snapshot().runId;service.clear();await service.restoreById(id);assert.equal(service.snapshot().progress,0);assert.equal(service.snapshot().records.length,3);const chat=loadAssistant(service);await chat.resume();assert.equal(service.snapshot().progress,3);assert.equal(service.snapshot().total,3);assert.equal(service.snapshot().runId,id);assert.ok((await rpc('detail',{id})).run.completed_at);
 });
 await check('Página fora de ordem ou falha de leitura não troca a análise ativa',async()=>{
  service.clear();pauseAt=0;await service.open(seed(3));await service.analyze();await service.save();const id=service.snapshot().runId;await service.open(seed(1));const old=service.snapshot().records[0].document;faultPage='input-detail';await assert.rejects(service.restoreById(id),/fora de ordem/);assert.equal(service.snapshot().records[0].document,old);assert.equal(service.snapshot().total,0);faultPage='';
 });
 await check('RPC exige entrada completa, identidade por posição, imutabilidade e isolamento de acesso',async()=>{
  const records=seed(3).rows.map(r=>({contract:u(3),document:r.document,revision:r.revision}));const {id}=await rpc('begin',{requestId:webcrypto.randomUUID(),count:3,metadata:{snapshotVersion:2,inputHash:await digest(records)}});
  await assert.rejects(rpc('chunk',{id,first:1,rows:records}),/Entrada completa/);await assert.rejects(rpc('input-chunk',{id,first:1,rows:[{...records[0],contract:u(4)}]}),/Registro de entrada inválido/);await writeInputs(id,records);await assert.rejects(rpc('input-chunk',{id,first:1,rows:[{...records[0],revision:'02'}]}),/Entrada imutável/);await assert.rejects(rpc('chunk',{id,first:1,rows:[records[1],records[0],records[2]]}),/ordem e identidade/);
  await as(0);await assert.rejects(rpc('input-detail',{id}),/Sessão/);await as(13);await assert.rejects(rpc('input-detail',{id},u(2)),/indisponível/);await as(10);await assert.rejects(rpc('input-chunk',{id,first:1,rows:records}),/Somente o autor/);await as(12);await assert.rejects(rpc('input-chunk',{id,first:1,rows:records}),/Somente o autor/);await assert.rejects(db.query('select * from private.grcon_allocation_audit_inputs'),/permission denied/);await as(11);
 });
 await check('Conversa vazia limpa análise anterior; falha na conversa seguinte mantém contexto anterior',async()=>{
  service.clear();pauseAt=0;await service.open(seed(3));await service.analyze();await service.save();const oldId=service.snapshot().runId;
  const id=webcrypto.randomUUID();await rpc('session-write',{id,revision:0,payload:{messages:[{id:'empty',role:'assistant',text:'Conversa vazia'}]}},u(1),'grcon_allocation_assistant');const chat=loadAssistant(service);await chat.restore(id);assert.equal(service.snapshot().runId,'');assert.equal(service.snapshot().records.length,0);assert.equal(chat.snapshot().saveState,'saved');
  await service.restoreById(oldId);failOperation='session-read';await chat.restore(webcrypto.randomUUID());assert.equal(service.snapshot().runId,oldId);failOperation='';
 });
 await check('Duas janelas detectam conflito e impedem sobrescrita até reabrir',async()=>{
  service.clear();const chat=loadAssistant(service);await chat.status();const id=chat.snapshot().sessionId,revision=chat.snapshot().revision;
  await rpc('session-write',{id,revision,payload:{messages:[{id:'other',role:'assistant',text:'Alteração em outra janela'}],runId:'',sourceHashes:[]}},u(1),'grcon_allocation_assistant');await chat.status();assert.equal(chat.snapshot().saveState,'conflict');const count=chat.snapshot().messages.length;await chat.help();assert.equal(chat.snapshot().messages.length,count);await chat.restore(id);assert.equal(chat.snapshot().saveState,'saved');assert.ok(chat.snapshot().messages.some(m=>m.text==='Alteração em outra janela'));
 });
 await check('Perda da confirmação de conversa permite retry idêntico e confirma nova revisão',async()=>{
  service.clear();const chat=loadAssistant(service);loseResponse='session-write';await chat.status();assert.equal(chat.snapshot().saveState,'failed');await chat.retrySave();assert.equal(chat.snapshot().saveState,'saved');assert.ok(chat.snapshot().revision>=2);
 });
 await check('Nova auditoria cria outra conversa e não apaga o histórico salvo',async()=>{
  const chat=loadAssistant(service);await chat.status();const id=chat.snapshot().sessionId;await chat.discardAnalysis(false);assert.notEqual(chat.snapshot().sessionId,id);assert.equal((await rpc('session-read',{id},u(1),'grcon_allocation_assistant')).id,id);
 });
 await check('Troca de contrato limpa contexto e descarta restauração atrasada',async()=>{
  service.clear();pauseAt=0;await service.open(seed(3));await service.analyze();await service.save();const id=service.snapshot().runId;const staged=await service.prepareRestoreById(id);for(const fn of listeners.get('grcon:contract-context-changed')||[])fn();assert.throws(()=>staged.commit(),/Conta ou contrato alterado/);assert.equal(service.snapshot().records.length,0);
 });
 await check('Banco ainda sem a migração do checkpoint: salvar falha com aviso claro, sem análise órfã e sem perder a tela; após atualizar o banco, salva',async()=>{
  service.clear();pauseAt=0;service.setDeadlines({capabilityTtl:0});service.resetCapabilities();await service.open(seed(3));await service.analyze();
  const before=beginCalls;legacyServer=true;
  await assert.rejects(service.save(),e=>e.code==='CHECKPOINT_UNAVAILABLE'&&/atualização do checkpoint/.test(e.message));
  assert.equal(beginCalls,before,'com análise para sondar, nenhuma análise órfã é criada no servidor');assert.equal(service.snapshot().progress,3,'resultados na tela intactos');assert.equal(service.snapshot().context.saved,false);assert.equal(service.snapshot().errorCode,'CHECKPOINT_UNAVAILABLE');
  // Primeira gravação do contrato (sem análise para sondar): a falha vem ao enviar a entrada e também é explicada (a análise criada fica sem entrada).
  noHistory=true;service.resetCapabilities();service.setDeadlines({capabilityTtl:0});
  await assert.rejects(service.save(),e=>e.code==='CHECKPOINT_UNAVAILABLE');assert.equal(service.snapshot().progress,3);noHistory=false;service.resetCapabilities();
  legacyServer=false;await service.save();assert.equal(service.snapshot().context.saved,true);assert.ok(!service.snapshot().error||service.snapshot().errorCode==='','erro anterior limpo');assert.ok(beginCalls>before,'com o banco atualizado a gravação acontece');
  service.setDeadlines({});
 });
 await db.exec('reset role');const secure=await db.query("select relrowsecurity from pg_class where relname='grcon_allocation_audit_inputs'");assert.equal(secure.rows[0].relrowsecurity,true);
 console.log(JSON.stringify({suite:'allocation_auditor_checkpoint_phase2',passed:checks.length,checks,localDatabase:true,productionAccess:false,batchCalls},null,2));
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
