'use strict';
// Runs real parsers, real Worker code and transpiled production services.
// Synthetic files only. RPC and generator context are in-memory fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {webcrypto}=require('node:crypto'),ts=require('typescript'),root=path.resolve(__dirname,'..');
const C=require('../allocation_auditor_core.js'),checks=[];
async function check(name,fn){await fn();checks.push(name);}
function worker(script){
 const box={console,Date,Promise,TextEncoder,TextDecoder,Blob,URL,Uint8Array,ArrayBuffer,DataView,atob,btoa,crypto:webcrypto,setTimeout,clearTimeout};
 box.self=box;box.globalThis=box;const ctx=vm.createContext(box),dir=path.join(root,'workers');
 box.importScripts=(...files)=>files.forEach(p=>vm.runInContext(fs.readFileSync(path.resolve(dir,p),'utf8'),ctx,{filename:p}));
 vm.runInContext(fs.readFileSync(path.join(dir,script),'utf8'),ctx);let serial=0;
 return {box,async call(operation,input){let reply;box.postMessage=value=>{reply=value;};await box.onmessage({data:{id:++serial,operation,input}});assert.ok(reply);if(reply.error)throw Error(reply.error);return reply.result;}};
}
const audit=worker('allocation-auditor.worker.js'),generator=worker('allocation.worker.js'),X=audit.box.XLSX;
const file=(name,bytes)=>({name,size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
function fixture(sheet,name='EXTERNA.xlsx',tab='GERAL'){const wb=X.utils.book_new();X.utils.book_append_sheet(wb,sheet,tab);return file(name,new Uint8Array(X.write(wb,{type:'array',bookType:'xlsx'})));}
const fixtureRows=(rows,name)=>fixture(X.utils.aoa_to_sheet(rows),name);
const parse=f=>audit.call('parse',{file:f,sheet:'GERAL',contract:'QA'});
const document='IS-5290.00-22313-955-C1O-001',row={document,revision:'01',title:'DOCUMENTO TECNICO',allocation:'0037'};
const ld={...row,source:'LD-5290.00-22313-91A-C1O-001.xlsx',sheet:'ELE',row:2};
const run=(input=row,refs=[ld])=>C.auditRecord(input,{contract:'QA',records:[input],ldRecords:refs,bases:{}});
const has=(result,id)=>result.findings.some(f=>f.id===id);
function loadService(){
 class RealWorker{constructor(){this.real=worker('allocation-auditor.worker.js');}postMessage({id,operation,input}){this.real.call(operation,input).then(result=>this.onmessage({data:{id,result}}),e=>this.onmessage({data:{id,error:e.message}}));}terminate(){}}
 const g={GrconCloud:{state:{session:{user:{id:'qa'}},membership:{contract_id:'QA',workspace_id:'QA',role:'operator'},client:{rpc:async()=>({data:{}})}}},GrconAllocationAuditorCore:C,GRCONModuleLoader:{ensure:async()=>{}},GrconAllocationGeneratorUi:{auditContext:async()=>({ldRecords:[],bases:{}})},addEventListener(){}};
 const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'src/react/allocation-auditor/service.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,window:g,Worker:RealWorker,crypto:webcrypto,setTimeout,clearTimeout,Promise,Blob,URL,console});return mod.exports.service;
}
(async()=>{
 await check('LD ausente, documento ausente, revisão divergente e LD errada são distintos',()=>{
  assert.ok(has(run(row,[]),'LD-BASE-MISSING'));assert.ok(has(run(row,[{...ld,document:'OUTRO'}]),'DOCUMENT-NOT-IN-LD'));
  const mismatch=run({...row,revision:'02',origin:{file:'OBSOLETA'}});assert.ok(has(mismatch,'REVISION-MISMATCH'));assert.equal(mismatch.origin,undefined);
  assert.ok(has(run({...row,ld:'LD-5290.00-22313-91A-C1O-005.xlsx'}),'LD-INCOMPATIBLE'));
  assert.ok(has(run(row,[{...ld,revision:''}]),'LD-REVISION-UNKNOWN'));
 });
 await check('Múltiplas LDs: selecionar apenas origem exata; ambiguidade não escolhe linha',()=>{
  const two={...ld,source:'LD-5290.00-22313-91A-C1O-002.xlsx'};
  assert.ok(has(run(row,[ld,two]),'LD-AMBIGUOUS'));
  assert.equal(run({...row,ld:two.source},[ld,two]).origin.file,two.source);
  assert.ok(has(run({...row,ld:'REFERENCIA-B.xlsx'},[{...ld,source:'REFERENCIA-A.xlsx'}]),'LD-INCOMPATIBLE'));
  assert.ok(has(run({...row,ld:'LD-1111.00-22313-91A-C1O-001.xlsx'}),'LD-INCOMPATIBLE'));
  assert.ok(has(run(row,[{...ld,contract:'OUTRO'}]),'LD-BASE-MISSING'));
 });
 await check('Revisão e código numéricos formatados preservam zeros, tipos e células',async()=>{
  const sheet=X.utils.aoa_to_sheet([['DOCUMENTO','REVISAO','ALOCACAO'],[123,1,37]]);sheet.A2.z='000000';sheet.B2.z='00';sheet.C2.z='0000';
  const f=fixture(sheet),before=Buffer.from(await f.arrayBuffer()),r=(await parse(f)).records[0];
  assert.equal(r.document,'000123');assert.equal(r.revision,'01');assert.equal(r.allocation,'0037');assert.equal(r.cellValues.revision.raw,1);assert.equal(r.cellValues.revision.cell,'B2');assert.equal(r.cellValues.revision.type,'n');assert.equal(r.cellValues.revision.format,'00');
  assert.equal(Buffer.compare(before,Buffer.from(await f.arrayBuffer())),0,'The original bytes are immutable');
 });
 await check('Linhas ocultas e filtradas são incluídas com política explícita',async()=>{
  const sheet=X.utils.aoa_to_sheet([['DOCUMENTO','REVISAO'],['DOC-A','0'],['DOC-B','0']]);sheet['!rows']=[{},{},{hidden:true}];sheet['!autofilter']={ref:'A1:B3'};
  const p=await parse(fixture(sheet));assert.equal(p.records.length,2);assert.equal(p.readingPolicy.includesHiddenRows,true);assert.equal(p.readingPolicy.includesFilteredRows,true);
 });
 await check('Inspeção e importação concordam para primeira linha documental 301',async()=>{
  const sheet=X.utils.aoa_to_sheet([['DOCUMENTO','REVISAO']]);sheet.A301={t:'s',v:'DOC-LATE'};sheet.B301={t:'s',v:'01'};sheet['!ref']='A1:B301';const f=fixture(sheet);
  assert.equal((await audit.call('inspect',{file:f}))[0].documentCount,(await parse(f)).records.length);assert.equal((await parse(f)).records[0].sourceRow,301);
 });
 await check('Cabeçalho deslocado mantém linha e coluna físicas',async()=>{
  const sheet={'!ref':'BJ250:BK251',BJ250:{t:'s',v:'DOCUMENTO'},BK250:{t:'s',v:'REVISAO'},BJ251:{t:'s',v:document},BK251:{t:'s',v:'01'}};
  const p=await parse(fixture(sheet));assert.equal(p.headerRow,250);assert.equal(p.records[0].cellValues.revision.cell,'BK251');assert.equal(p.records[0].sourceRow,251);
 });
 await check('Cabeçalhos documentais duplicados bloqueiam associações automáticas',async()=>{
  const f=fixtureRows([['DOCUMENTO','CODIGO','REVISAO'],['A','B','01']]);await assert.rejects(parse(f),/Cabeçalho ambíguo/);assert.match((await audit.call('inspect',{file:f}))[0].warning,/ambíguo/);
 });
 await check('Erro do Excel no documento bloqueia leitura, na revisão gera pendência técnica',async()=>{
  const sheet=X.utils.aoa_to_sheet([['DOCUMENTO','REVISAO'],[document,'01']]);sheet.B2={t:'e',v:7};const r=(await parse(fixture(sheet))).records[0];assert.equal(r.revision,'');assert.equal(r.sourceIssues[0].field,'revision');assert.ok(has(run(r),'SOURCE-CELL-UNREADABLE'));assert.equal(run(r).origin,undefined);
  sheet.A2={t:'e',v:23};await assert.rejects(parse(fixture(sheet)),/Falha de leitura.*A2/);
 });
 await check('Fórmula sem cache não vira identificação e cache salvo tem rastreabilidade',async()=>{
  const sheet=X.utils.aoa_to_sheet([['DOCUMENTO','REVISAO'],[document,'01']]);sheet.B2={t:'n',f:'1',v:1,z:'00'};let r=(await parse(fixture(sheet))).records[0];assert.equal(r.revision,'01');assert.equal(r.cellValues.revision.formula,'1');assert.equal(r.cellValues.revision.cache,'available');
  sheet.B2={t:'n',f:'1'};r=(await parse(fixture(sheet))).records[0];assert.equal(r.sourceIssues[0].field,'revision');assert.equal(r.cellValues.revision.cache,'missing');
  sheet.A2={t:'n',f:'1'};await assert.rejects(parse(fixture(sheet)),/fórmula não tem resultado/);
 });
 await check('Corrupção, limite de bytes e limites dimensionais têm falhas controladas',async()=>{
  await assert.rejects(parse(file('CORROMPIDA.xlsx',new Uint8Array([1,2,3]))),/inválido ou corrompido/);
  await assert.rejects(parse({name:'GRANDE.xlsx',size:1,arrayBuffer:async()=>new ArrayBuffer(30*1024*1024+1)}),/ultrapassa 30 MB/);
  const sheet=X.utils.aoa_to_sheet([['DOCUMENTO'],[document]]);sheet['!ref']='A1:GT2';await assert.rejects(parse(fixture(sheet)),/201 colunas/);
 });
 await check('Parser da LD preserva revisão formatada e erro de célula',async()=>{
  const sheet=X.utils.aoa_to_sheet([['DOCUMENTO','REVISAO','TITULO'],[document,1,'DOCUMENTO TECNICO']]);sheet.B2.z='00';
  const p=await generator.call('parse',{kind:'audit-ld',file:fixture(sheet,ld.source,' ELE ')});assert.equal(p.records[0].revision,'01');assert.equal(p.records[0].cellValues.revision.raw,1);
  sheet.B2={t:'e',v:7};const invalid=await generator.call('parse',{kind:'audit-ld',file:fixture(sheet,ld.source,'ELE')});assert.ok(invalid.records[0].sourceIssues.length);assert.ok(has(run(row,invalid.records),'LD-CELL-UNREADABLE'));
 });
 await check('LD com cabeçalho ambíguo bloqueia associação e título ilegível gera pendência',async()=>{
  await assert.rejects(generator.call('parse',{kind:'audit-ld',file:fixtureRows([['DOCUMENTO','DOCUMENTO TECNICO','REVISAO'],[document,document,'01']],ld.source)}),/cabeçalho ambíguo/);
  // Etapa 12: a importação de LD do GERADOR ('ld') continua exatamente como antes (não recusa cabeçalho ambíguo nem lê o valor exibido das células); só a LD do Auditor ('audit-ld') é estrita.
  {const ambiguous=fixtureRows([['DOCUMENTO','DOCUMENTO TECNICO','REVISAO'],[document,document,'01']],ld.source);
   await assert.doesNotReject(generator.call('parse',{kind:'ld',file:ambiguous}),'Gerador: LD com cabeçalho ambíguo segue aceita como antes');
   const plain=await generator.call('parse',{kind:'ld',file:fixtureRows([['DOCUMENTO','REVISAO','TITULO DO DOCUMENTO TECNICO'],[document,'01','DOCUMENTO TECNICO']],ld.source)});
   assert.ok(plain.records.length>=1&&!('cellValues' in plain.records[0]),'Gerador: registros sem os campos extras da leitura estrita');}
  const sheet=X.utils.aoa_to_sheet([['DOCUMENTO','REVISAO','TITULO DO DOCUMENTO TECNICO'],[document,'01','DOCUMENTO TECNICO']]);sheet.C2={t:'e',v:7};const p=await generator.call('parse',{kind:'audit-ld',file:fixture(sheet,ld.source,'ELE')});assert.equal(p.records[0].cellValues.title.cell,'C2');assert.ok(has(run(row,p.records),'LD-CELL-UNREADABLE'));
 });
 await check('Serviço real pede identificação e conserva 0037 após confirmação',async()=>{
  const service=loadService();const f=fixtureRows([['DOCUMENTO','REVISAO'],[document,'01']]);const result=await service.importMany([f]);assert.equal(result.unidentified.length,1);
  assert.throws(()=>service.confirmAllocationIdentities([{sha256:result.unidentified[0].sha256,value:''}]),/Informe o número/);assert.equal(service.snapshot().records[0].allocation,'');
  service.confirmAllocationIdentities([{sha256:result.unidentified[0].sha256,value:'0037'}]);assert.equal(service.snapshot().records[0].allocation,'0037');assert.equal(service.snapshot().records[0].allocationIdentity,'user-confirmed');assert.equal(service.unidentifiedAllocations().length,0);
  const draft=await service.importMany([f]);service.confirmAllocationIdentities([{sha256:draft.unidentified[0].sha256,value:'',draft:true}]);assert.ok(has(run(service.snapshot().records[0]),'ALLOCATION-IDENTITY-UNCONFIRMED'));
 });
 await check('Serviço real rejeita divergência nome versus coluna sem substituir análise',async()=>{
  const service=loadService();await service.importMany([fixtureRows([['DOCUMENTO','REVISAO','ALOCACAO'],[document,'01','0037']])]);
  await assert.rejects(service.importMany([fixtureRows([['DOCUMENTO','REVISAO','ALOCACAO'],[document,'01','C1O-ALOC-CM-0002-2026']],'C1O-ALOC-CM-0001-2026.xlsx')]),/diverge do nome/);assert.equal(service.snapshot().records[0].allocation,'0037');
  await assert.rejects(service.importAssistantLd([{name:'LD.xlsx',size:100*1024*1024+1}]),/100 MB/);
 });
 if(process.env.GRCON_AUDIT_SOURCES)await check('Cópias históricas: contagens preservadas e arquivos sem alteração',async()=>{
  const dir=process.env.GRCON_AUDIT_SOURCES,crypto=require('node:crypto'),digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),times=[],before=new Map();
  const files=fs.readdirSync(dir).filter(name=>name==='CENTRAL DE ALOCAÇÃO.xlsx'||/^LD-5290/.test(name));let ldRecords=0,sourceIssues=0;
  for(const name of files){const bytes=fs.readFileSync(path.join(dir,name));before.set(name,digest(bytes));const start=performance.now();
   const parsed=name.startsWith('LD-')?await generator.call('parse',{kind:'audit-ld',file:file(name,bytes)}):await audit.call('parse',{file:file(name,bytes),sheet:'Central de alocação',contract:'QA'});
   if(name.startsWith('LD-'))ldRecords+=parsed.records.length;else {assert.equal(parsed.records.length,15441);assert.equal(new Set(parsed.records.filter(r=>r.fiscalComment).map(r=>r.fiscalComment)).size,436);}
   sourceIssues+=parsed.records.reduce((n,r)=>n+(r.sourceIssues?.length||0),0);times.push({kind:name.startsWith('LD-')?'LD':'Central',records:parsed.records.length,milliseconds:Math.round(performance.now()-start)});
  }
  assert.equal(ldRecords,28806);for(const [name,hash] of before)assert.equal(digest(fs.readFileSync(path.join(dir,name))),hash);
  console.log(JSON.stringify({historicalCorpus:{files:files.length,centralRecords:15441,ldRecords,sourceIssues,originalHashesUnchanged:true,times}},null,2));
 });
 console.log(JSON.stringify({suite:'allocation_auditor_import_identity_phase1',passed:checks.length,checks},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
