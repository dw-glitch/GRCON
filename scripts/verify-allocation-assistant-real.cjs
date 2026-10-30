'use strict';
// Local, read-only verification with authorized sources. No workbook is uploaded.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const input=process.env.GRCON_AUDIT_SOURCES;if(!input)throw Error('Set GRCON_AUDIT_SOURCES to the authorized source directory.');
const root=path.resolve(__dirname,'..'),workers=path.join(root,'workers');
function runtime(name){const responses=[],s={console,Date,Promise,TextEncoder,TextDecoder,Blob,URL,Uint8Array,ArrayBuffer,DataView,atob,btoa,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,postMessage:m=>responses.push(m)};s.self=s;s.globalThis=s;const context=vm.createContext(s);s.importScripts=(...names)=>names.forEach(n=>vm.runInContext(fs.readFileSync(path.resolve(workers,n),'utf8'),context,{filename:n}));vm.runInContext(fs.readFileSync(path.join(workers,name),'utf8'),context);let id=0;return {s,async request(operation,data){responses.length=0;await s.onmessage({data:{id:++id,operation,input:data}});assert.equal(responses.length,1);if(responses[0].error)throw Error(responses[0].error);return responses[0].result;}};}
const file=name=>{const bytes=fs.readFileSync(path.join(input,name));return {name,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)};};
(async()=>{
 const generator=runtime('allocation.worker.js'),auditor=runtime('allocation-auditor.worker.js'),names=fs.readdirSync(input),sources=[],records=[],ldRecords=[];
 for(const name of names.filter(n=>/^LD-.*\.xlsx$/i.test(n))){const f=file(name),parsed=await generator.request('parse',{kind:'ld',file:f});ldRecords.push(...parsed.records);sources.push({name,sha256:await auditor.request('fingerprint',{file:f}),kind:'ld'});}
 for(const name of names.filter(n=>/^C1O-ALOC-.*\.xlsx$/i.test(n))){const f=file(name),tabs=await auditor.request('inspect',{file:f});assert.equal(tabs.find(t=>t.name==='GERAL')?.model,'official-16');const parsed=await auditor.request('parse',{file:f,sheet:'GERAL',contract:'local-authorized-qa',allocation:name.match(/C1O-ALOC-CM-\d+-\d+/)?.[0]});records.push(...parsed.records);sources.push({name,sha256:parsed.sha256,kind:'allocation'});}
 const central=names.find(n=>/^CENTRAL/i.test(n));let history=[];if(central){const f=file(central),book=auditor.s.XLSX.read(new Uint8Array(await f.arrayBuffer()),{type:'array'});const tab=book.SheetNames.find(n=>/central/i.test(n));history=(await auditor.request('parse',{file:f,sheet:tab,contract:'local-authorized-qa'})).records;}
 const bases={};for(const kind of ['databook','eap','appendix'])bases[kind]=await generator.request('bundled',{kind});
 const context={contract:'local-authorized-qa',records,ldRecords,history,bases,versions:{},homologated:{},sources,events:[],files:[]};await auditor.request('context',context);const rows=[];
 for(let first=0;first<records.length;first+=100)rows.push(...await auditor.request('batch',{first,count:100}));
 assert.equal(rows.length,records.length);assert.ok(rows.length>0);assert.ok(ldRecords.length>0);assert.ok(history.length>0);
 const pack=await auditor.request('assistant-package',{...context,rows,progress:rows.length,total:rows.length});
 const archive=await auditor.s.JSZip.loadAsync(pack.bytes,{checkCRC32:true}),report=auditor.s.XLSX.read(await archive.file('01_Relatorio_Auditoria.xlsx').async('uint8array'),{type:'array'});assert.deepEqual([...report.SheetNames],['RESUMO','DETALHAMENTO']);
 const associated=rows.filter(r=>r.origin?.file&&r.origin?.sheet&&r.origin?.row),exactRevision=associated.filter(r=>r.origin.revision===r.revision);
 const result={allocationFiles:sources.filter(s=>s.kind==='allocation').length,documents:rows.length,ldFiles:sources.filter(s=>s.kind==='ld').length,ldRecords:ldRecords.length,fiscalHistory:history.length,exactOrigins:associated.length,exactRevisions:exactRevision.length,reportSheets:[...report.SheetNames],automaticCorrections:0,normativeApproval:false,corporateBytesUploaded:false};
 const dir=path.join(root,'artifacts','allocation-assistant');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'real-source-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
