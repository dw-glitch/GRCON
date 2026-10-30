'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
let generatorCalls=0;
const run={id:'qa-checkpoint',expected_count:2,completed_at:null,metadata:{sources:[],versions:{}}};
let savedRows;
const row={document:'DOC-121',revision:'0',lineage:'one',findings:[],recommendations:[]};
savedRows=[{row_number:1,payload:row}];
const g={GrconCloud:{state:{session:{user:{id:'qa-user'}},membership:{workspace_id:'qa-workspace',contract_id:'qa-contract'},client:{rpc:async()=>({data:{run,rows:savedRows,events:[]}})}}},GRCONModuleLoader:{ensure:async()=>{generatorCalls++;}},GrconAllocationGeneratorUi:{generateAudited:async()=>{generatorCalls++;throw Error('Issuance must not be called');}},addEventListener(){}};
class WorkerFixture{postMessage(data){queueMicrotask(()=>this.onmessage({data:{id:data.id,result:{groups:[],summary:{}}}}));}terminate(){}}
vm.runInNewContext(fs.readFileSync('allocation_auditor_core.js','utf8'),g);
const source=ts.transpileModule(fs.readFileSync('src/react/allocation-auditor/service.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const context={exports:{},window:g,Worker:WorkerFixture,crypto:require('node:crypto').webcrypto,queueMicrotask,setTimeout,clearTimeout,console};vm.runInNewContext(source,context);const service=context.exports.service;
(async()=>{await service.restore(run);assert.equal(service.snapshot().progress,1);assert.equal(service.snapshot().total,2);for(const official of [false,true])await assert.rejects(service.assistantPackage('qa-session',official),/Conclua a auditoria/);assert.equal(generatorCalls,0,'An incomplete audit must not even load the generator or consume numbering');run.completed_at=new Date().toISOString();savedRows=[{row_number:1,payload:row},{row_number:2,payload:{...row,lineage:'second'}}];await service.restore(run);await assert.rejects(service.assistantPackage('qa-session',true),/ocorrências repetidas/);assert.equal(generatorCalls,0,'All batches must be checked for ambiguity before loading or calling the generator');console.log('allocation_assistant_generation_guard: paused audits rejected before generator loading or issuance');})().catch(e=>{console.error(e);process.exitCode=1;});
