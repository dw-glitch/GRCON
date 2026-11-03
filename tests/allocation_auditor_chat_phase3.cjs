'use strict';
// Exercises real assistantStore TypeScript transpiled to JS against controlled,
// synchronous service contracts. No corporate data, external RPC or paid Actions.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src/react/allocation-auditor/assistantStore.ts'),'utf8');
const generator=fs.readFileSync(path.join(root,'src/react/allocation/service.ts'),'utf8');
const component=fs.readFileSync(path.join(root,'src/react/allocation-auditor/AllocationAssistant.tsx'),'utf8');
assert.match(generator,/GRCONModuleLoader\.ensure\('allocation-auditor'\)/);
assert.doesNotMatch(generator,/GRCONModuleLoader\[assistantUi\?'ensure':'ensureModule'\]/);
assert.match(component,/assistant\.auditFiles\(\)/);
assert.match(component,/assistant\.pause\(\)/);
assert.match(component,/setConfirmIssue\(true\)/);
assert.match(component,/Confirmar nova emissão oficial/);

const events=new Map(),calls=[];
const state={records:[],rows:[],progress:0,total:0,context:{sources:[]},summary:{errors:0,pending:0},runId:'qa-run',busy:false};
const add=(name,fn)=>events.set(name,fn);
let resolveAnalysis=null;
let holdAnalysis=false;
const service={
 snapshot:()=>state,
 activate:async()=>{calls.push('activate');},
 assistantRpc:async(operation)=>{calls.push('rpc:'+operation);return operation==='sessions'?{sessions:[]}:operation==='session-write'?{revision:1}: {payload:{messages:[]},revision:1};},
 analyze:async(resume)=>{calls.push('analyze:'+resume);state.total=state.records.length;if(holdAnalysis){await new Promise(r=>{resolveAnalysis=r;});state.progress=1;return;}state.progress=state.total;state.rows=state.records.map((r,i)=>({i,...r}));},
 save:async()=>{calls.push('save');},
 applyAutomatic:async()=>{calls.push('applyAutomatic');return 0;},
 core:()=>({summary:rows=>({total:rows.length,pending:0,errors:0})}),
 assistantPackage:async(_sessionId,issue)=>{calls.push('package:'+issue);return {exceptions:[]};},
 cancel:()=>{calls.push('cancel');},
 clear:()=>{},
 ai:async()=>{},
 acceptGroup:async()=>{},
 restoreById:async()=>{},
};
const webCrypto=require('node:crypto').webcrypto;
const window={
 GrconAllocationGeneratorUi:{
  auditCurrentInChat:async()=>{calls.push('currentInChat');state.records=[{document:'DOC-1'}];},
  auditCurrent:async()=>{throw Error('Must never recurse into the UI opener');}
 },
 GrconAllocationAssistant:{
  intent:t=>/^retom/i.test(t)?'resume':/^aud|^confer/i.test(t)?'audit':/^baix/i.test(t)?'package':/^pend/i.test(t)?'details':'help',
  allocationReference:t=>t.match(/C1O-ALOC-[A-Z]+-\d{3,4}-20\d{2}/i)?.[0]?.toUpperCase()||'',questionRows:()=>[],
 },
 addEventListener:add
};
const script=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
vm.runInNewContext(script,{exports:module.exports,module,require:id=>{
 if(id==='./service')return {service};
 throw Error('Unexpected import '+id);
},window,crypto:webCrypto,console,Promise});
const assistant=module.exports.assistant;
const read=()=>assistant.snapshot().messages.map(x=>x.text).join('\n');
(async()=>{
 assistant.show();await Promise.resolve();
 await assistant.help();
 assert.match(read(),/antes do envio à fiscalização/);
 await assistant.status();
 assert.match(read(),/Situação da auditoria preventiva/);
 assert.equal(calls.filter(x=>x.startsWith('analyze:')).length,0);

 await assistant.current();
 assert.deepEqual(calls.filter(x=>x==='currentInChat'),['currentInChat']);
 assert.equal(calls.filter(x=>x.startsWith('analyze:')).length,1);
 assert.match(read(),/Analisei 1 documento antes do envio/);
 assert.equal(calls.includes('rpc:session-write'),true);

 await assistant.download();
 assert.equal(calls.at(-2)==='package:false'||calls.includes('package:false'),true);
 assert.equal(calls.includes('package:true'),false,'Normal download must not issue an official allocation');

 await assistant.generate();
 assert.equal(calls.includes('package:true'),true,'Official issuance stays a separate explicit action');

 await assistant.details();
 assert.match(read(),/detalhamento técnico/);
 // An uploaded external allocation must take precedence over a generator-history lookup.
 state.context.sources=[{kind:'allocation',name:'C1O-ALOC-CM-0372-2026.xlsx'}];
 state.records=[{document:'D-EXT',allocation:'C1O-ALOC-CM-0372-2026'}];
 const beforeExternal=calls.filter(x=>x==='historyLookup').length;
 await assistant.send('Auditar C1O-ALOC-CM-0372-2026');
 assert.equal(calls.filter(x=>x==='historyLookup').length,beforeExternal,'External upload wins over history');
 assert.match(read(),/planilha anexada/);
 holdAnalysis=true;
 state.records=[{document:'D-1'},{document:'D-2'},{document:'D-3'}];
 const pending=assistant.auditFiles();
 await new Promise(r=>setImmediate(r));
 assert.equal(typeof resolveAnalysis,'function','Audit should be running');
 assistant.pause();
 assert.ok(calls.includes('cancel'),'Pause must be immediate despite pending state');
 resolveAnalysis();await pending;
 assert.match(read(),/Análise pausada em 1 de 3/);
 assert.equal(state.progress,1);

 const oldSession=assistant.snapshot().sessionId;
 events.get('grcon:contract-context-changed')();
 assert.notEqual(assistant.snapshot().sessionId,oldSession,'Switching contract clears conversation state');
 assert.equal(assistant.snapshot().open,false);
 assert.match(read(),/Robô Auditor Preventivo/);
 console.log('allocation_auditor_chat_phase3: conversational behavior including external-priority passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
