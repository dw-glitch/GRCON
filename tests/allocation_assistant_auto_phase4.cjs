'use strict';
// Tests phase 4 assistant orchestration using real TypeScript store and a deterministic service.
// All files are synthetic. No browser, Cloudflare, R2, database or GitHub Actions required.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript'),root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src/react/allocation-auditor/assistantStore.ts'),'utf8');
const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const events=new Map(),calls=[];
const data={records:[],rows:[],total:0,progress:0,summary:{errors:0,pending:0},context:{sources:[]},runId:'qa',busy:false};
let choices=[],checkpoint=false,missing=[];
const service={
 snapshot:()=>data,activate:async()=>{},assistantRpc:async op=>op==='sessions'?{sessions:[]}:op==='session-write'?{revision:1}:{payload:{messages:[]},revision:1},
 inspectBatch:async files=>{calls.push('inspect');return choices.length?choices:files.map(f=>({name:f.name,requiresSelection:false,preferred:'GERAL'}));},
 importMany:async(files,sheets)=>{calls.push('import:'+JSON.stringify(sheets||{}));if(!checkpoint){
  data.records=files.map(f=>({document:f.name,allocation:f.name,sourceFile:f.name}));
  data.rows=[];data.total=0;data.progress=0;data.context.sources=files.map(f=>({kind:'allocation',name:f.name,sha256:f.name}));
 }return {checkpoint,documents:data.records.length};},
 importAssistantLd:async()=>{calls.push('ld');data.rows=[];data.progress=0;data.total=0;return {unchanged:false,records:data.records.length};},
 missingSources:()=>missing,
 analyze:async resume=>{calls.push('analyze:'+resume);data.total=data.records.length;data.progress=data.total;data.rows=data.records.map(r=>({...r,findings:[]}));},
 save:async()=>{},applyAutomatic:async()=>0,
 core:()=>({summary:rows=>({total:rows.length,pending:0,errors:0})}),
 assistantPackage:async()=>({exceptions:[]}),cancel:()=>{},restoreById:async()=>{},ai:async()=>{},acceptGroup:async()=>{}
};
const window={addEventListener:(key,cb)=>events.set(key,cb),GrconAllocationAssistant:{intent:()=> 'help',questionRows:()=>[]}};
const qaModule={exports:{}};
vm.runInNewContext(code,{exports:qaModule.exports,module:qaModule,require:id=>{if(id==='./service')return {service};throw Error(id);},window,crypto:require('node:crypto').webcrypto,console,Promise});
const assistant=qaModule.exports.assistant,conversation=()=>assistant.snapshot().messages.map(m=>m.text).join('\n');
(async()=>{
 const one={name:'PREVENTIVA-001.xlsx'};
 await assistant.upload([one],'allocation');
 assert.ok(calls.includes('analyze:false'),'A valid upload must start the audit without a second command');
 assert.match(conversation(),/Recebi e validei 1 alocação/);
 assert.match(conversation(),/Auditoria preventiva concluída: 1 documento/);
 assert.equal(assistant.snapshot().pendingSheets.length,0);
 const beforeAmbig=calls.filter(x=>x.startsWith('analyze:')).length;
 choices=[{name:'COM-MULTIPLAS-ABAS.xlsx',requiresSelection:true,candidates:[
  {name:'ELE',model:'mapped',documentCount:1},{name:'TUB',model:'mapped',documentCount:1}
 ]}];
 await assistant.upload([{name:'COM-MULTIPLAS-ABAS.xlsx'}],'allocation');
 assert.equal(assistant.snapshot().pendingSheets.length,1);
 assert.equal(calls.filter(x=>x.startsWith('analyze:')).length,beforeAmbig,'Ambiguous origin must not start automatically');
 assistant.chooseSheet('COM-MULTIPLAS-ABAS.xlsx','TUB');
 await assistant.confirmSheetSelection();
 assert.ok(calls.includes('import:{"COM-MULTIPLAS-ABAS.xlsx":"TUB"}'));
 assert.equal(calls.filter(x=>x.startsWith('analyze:')).length,beforeAmbig+1);
 assert.equal(assistant.snapshot().pendingSheets.length,0);
 choices=[];
 const original=data.records.map(r=>r.document);
 await assistant.upload([{name:'LD-001.xlsx'}],'ld');
 assert.deepEqual(data.records.map(r=>r.document),original,'LD must not delete allocation input');
 assert.equal(calls.at(-1),'analyze:false','LD change triggers a new audit');

 // Incomplete checkpoint: do not reset, overwrite or attempt resume without all originals.
 checkpoint=true;missing=['LD-ORIGINAL.xlsx'];data.total=2;data.progress=1;
 const count=calls.filter(x=>x.startsWith('analyze:')).length;
 await assistant.upload([{name:'COM-MULTIPLAS-ABAS.xlsx'}],'allocation');
 assert.equal(calls.filter(x=>x.startsWith('analyze:')).length,count);
 assert.match(conversation(),/Reanexe estas fontes/);
 checkpoint=false;missing=[];
 choices=[{name:'PENDENTE.xlsx',requiresSelection:true,candidates:[{name:'GERAL',model:'mapped',documentCount:1}]}];
 await assistant.upload([{name:'PENDENTE.xlsx'}],'allocation');
 assert.equal(assistant.snapshot().pendingSheets.length,1);
 events.get('grcon:contract-context-changed')();
 assert.equal(assistant.snapshot().pendingSheets.length,0,'Contract change clears temporary file selection');
 assert.equal(assistant.snapshot().open,false);
 console.log('allocation_assistant_auto_phase4: autostart, ambiguous sheets, LD re-audit, checkpoint safety and contract reset passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
