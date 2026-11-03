'use strict';
// Phase 4: tests the actual auditor service in a VM with deterministic Worker,
// contract and generator fixtures. No corporate files and no external services.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src/react/allocation-auditor/service.ts'),'utf8');
assert.match(src,/source\.correctionMode==='audit-only'/,'Mapped sheets must never reach the official workbook writer');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const files=(name,sha,model='official-16',document='DOC-121')=>({
 name,size:4096,sha,tabs:[{name:'GERAL',model,documentCount:1}],
 records:[{document,revision:'0',fiscalComment:'',returnedAt:''}]
});
const other=(file,name)=>({...file,name});
let ldLoads=0, context=null;
const scope={session:{user:{id:'qa-user'}},membership:{workspace_id:'qa-workspace',contract_id:'qa-contract'},client:{rpc:async()=>({data:{runs:[]}})}};
const g={
 GrconCloud:{state:scope},
 GRCONModuleLoader:{ensure:async()=>{}},
 GrconAllocationGeneratorUi:{
  importAuditLd:async ld=>{ldLoads++;assert.ok(ld.length>0);},
  auditContext:async()=>({bases:{},versions:{},ldRecords:[],centralHistory:[]})
 },
 GrconAllocationAuditorCore:{mergeHistory:()=>[],summary:rows=>({total:rows.length,pending:0,errors:0})},
 GrconAllocationAssistant:{groups:()=>[]},
 addEventListener:()=>{}
};
class FakeWorker{
 postMessage({id,operation,input}){
  Promise.resolve().then(()=>{
   let result;
   switch(operation){
    case 'inspect':result=input.file.tabs;break;
    case 'parse':result={model:input.file.tabs.find(x=>x.name===input.sheet)?.model,columns:{fiscalComment:input.file.explicitFiscalComment?-1+10:-1},
     sha256:input.file.sha,records:input.file.records.map((r,i)=>({...r,contract:input.contract,allocation:input.allocation||r.allocation||'',
       sourceFile:input.file.name,sourceSheet:input.sheet,sourceRow:i+2,sourceHash:input.file.sha}))};break;
    case 'fingerprint':result=input.file.sha;break;
    case 'context':context=input;result={records:input.records.length};break;
    case 'batch':result=context.records.slice(input.first,input.first+input.count).map((r,i)=>({...r,lineage:'row-'+i,findings:[],recommendations:[],versions:{}}));break;
    case 'summarize':result={groups:[],summary:{total:input.rows.length,pending:0,errors:0}};break;
    default:throw Error('Unexpected Worker operation: '+operation);
   }
   this.onmessage({data:{id,result}});
  }).catch(e=>this.onmessage({data:{id,error:e.message}}));
 }
 terminate(){}
}
const qaModule={exports:{}};
vm.runInNewContext(js,{exports:qaModule.exports,module:qaModule,window:g,Worker:FakeWorker,crypto:require('node:crypto').webcrypto,console,setTimeout,clearTimeout,Promise,Blob,URL});
const service=qaModule.exports.service;
(async()=>{
 const a=files('C1O-ALOC-CM-0372-2026.xlsx','a'.repeat(64));
 const b=files('EXTERNA.xlsx','b'.repeat(64),'mapped','DOC-122');
 const unrecognized={...files('INVALIDA.xlsx','c'.repeat(64)),tabs:[{name:'Planilha1',model:'unknown',documentCount:0}]};
 const ambiguous={...files('MULTIABA.xlsx','d'.repeat(64)),tabs:[
  {name:'ELE',model:'mapped',documentCount:3},{name:'TUB',model:'mapped',documentCount:4}
 ]};
 const options=await service.inspectBatch([a,b,ambiguous]);
 assert.equal(options.length,3);
 assert.equal(options[0].preferred,'GERAL');
 assert.equal(options[1].preferred,'GERAL','Mapped workbooks are accepted');
 assert.equal(options[2].requiresSelection,true);
 assert.equal(service.snapshot().records.length,0,'Inspection never imports data');

 await assert.rejects(service.inspectBatch([a,other(a,a.name)]),/nomes repetidos/);
 await assert.rejects(service.importMany([a,unrecognized]),/não encontrei uma aba/);
 assert.equal(service.snapshot().records.length,0,'A failed batch must not partially import data');
 const fiscal={...b,name:'DEVOLVIDA.xlsx',sha:'f'.repeat(64),explicitFiscalComment:true,
  records:[{document:'DOC-REC',revision:'0',fiscalComment:'CORRIGIR',returnedAt:''}]};
 await assert.rejects(service.importMany([fiscal]),/fiscalização/);
 assert.equal(service.snapshot().records.length,0);

 const imported=await service.importMany([a,b]);
 assert.equal(imported.documents,2);
 assert.equal(service.snapshot().records.length,2);
 assert.deepEqual(Array.from(service.snapshot().context.sources,x=>x.model),['official-16','mapped']);
 assert.equal(service.snapshot().context.sources[1].correctionMode,'audit-only');
 // Anexar alocações inicia uma NOVA análise: substitui as anteriores, nunca empilha.
 const again=await service.importMany([a]);
 assert.equal(again.replaced,true);assert.equal(service.snapshot().records.length,1,'Uma só alocação anexada gera uma análise só dela');
 assert.deepEqual(Array.from(service.snapshot().context.sources,x=>x.name),[a.name],'Alocações anteriores saem das fontes');
 const swapped=await service.importMany([{...a,sha:'9'.repeat(64)}]);
 assert.equal(swapped.replaced,true,'Mesmo nome com outro conteúdo substitui a versão anterior em vez de bloquear');
 assert.equal(service.snapshot().records.length,1);
 await service.importMany([a,b]);
 assert.equal(service.snapshot().records.length,2,'Várias alocações no mesmo envio são analisadas juntas');

 await assert.rejects(service.importMany([ambiguous]),/Selecione a aba correta/);
 assert.equal(service.snapshot().records.length,2,'Falha de seleção não destrói a análise existente');
 await service.importMany([ambiguous],{'MULTIABA.xlsx':'TUB'});
 assert.equal(service.snapshot().records.length,1,'Novo envio substitui a análise anterior');
 assert.equal(service.snapshot().records[0].sourceSheet,'TUB');
 await service.analyze();
 assert.equal(service.snapshot().progress,1);

 const ld={name:'LD-001.xlsx',size:4000,sha:'e'.repeat(64)};
 const result=await service.importAssistantLd([ld]);
 assert.equal(result.unchanged,false);
 assert.equal(ldLoads,1);
 assert.equal(service.snapshot().records.length,1,'New LD must preserve all external records');
 assert.equal(service.snapshot().rows.length,0,'Old findings must not survive changed LD');
 assert.equal(service.snapshot().context.sources.length,2,'Allocation and LD provenance stay intact');
 assert.deepEqual(Array.from(service.missingSources()),[],'Every source is attached');
 await service.analyze();
 assert.equal(service.snapshot().rows.length,1,'Re-audit works after LD upload');
 // Excluir análise: mantém LDs; "e LDs" remove também as LDs; nunca toca nos arquivos do usuário.
 await service.discard(false);
 assert.equal(service.snapshot().records.length,0);assert.equal(service.snapshot().rows.length,0);assert.equal(service.snapshot().events.length,0);
 assert.deepEqual(Array.from(service.snapshot().context.sources,x=>x.kind),['ld'],'LDs permanecem após excluir a análise');
 await service.importMany([a]);await service.analyze();assert.equal(service.snapshot().rows.length,1,'Nova auditoria funciona após excluir');
 await service.discard(true);
 assert.equal((service.snapshot().context.sources||[]).length,0,'Excluir também as LDs limpa as fontes');assert.equal(service.snapshot().runId,'');
 const internalStatus={...files('RASCUNHO-STATUS.xlsx','7'.repeat(64),'mapped','DOC-NOTA'),
  records:[{document:'DOC-NOTA',revision:'0',fiscalComment:'REVISAR INTERNAMENTE',returnedAt:''}]};
 await service.importMany([internalStatus]);
 const note=service.snapshot().records.find(r=>r.document==='DOC-NOTA');
 assert.equal(note.fiscalComment,'','Internal draft status must not masquerade as Fiscal 01 feedback');
 assert.equal(note.inputStatusObservation,'REVISAR INTERNAMENTE');
 console.log('allocation_assistant_import_phase4: batch atomicity, mapped layout, sheet choice, fiscal safety, origins, deduplication and LD re-audit passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
