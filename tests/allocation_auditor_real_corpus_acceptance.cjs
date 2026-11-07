'use strict';
// Read-only acceptance over authorized local copies. Never bundles documents or
// prints their codes/titles; an absent corpus is a blocker, never a passing test.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'workers'),sources=process.env.GRCON_AUDIT_SOURCES;
function worker(script){const b={console,Date,Promise,TextEncoder,TextDecoder,Blob,URL,Uint8Array,ArrayBuffer,DataView,atob,btoa,crypto:crypto.webcrypto,setTimeout,clearTimeout};b.self=b;b.globalThis=b;const c=vm.createContext(b);b.importScripts=(...p)=>p.forEach(f=>vm.runInContext(fs.readFileSync(path.resolve(dir,f),'utf8'),c));vm.runInContext(fs.readFileSync(path.join(dir,script),'utf8'),c);let id=0;return {b,call:async(operation,input)=>{let result;b.postMessage=x=>result=x;await b.onmessage({data:{id:++id,operation,input}});if(result.error)throw Error(result.error);return result.result;}};}
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const normalized=value=>JSON.stringify(value,(key,v)=>key==='sourceTimestamp'?undefined:v);
(async()=>{
 if(!sources)throw Error('BLOCKED: informe GRCON_AUDIT_SOURCES com cópias autorizadas das cinco LDs.');
 const names=fs.readdirSync(sources).filter(n=>/^LD-5290.*\.xlsx$/i.test(n)).sort();assert.equal(names.length,5);
 const gen=worker('allocation.worker.js'),auditor=worker('allocation-auditor.worker.js'),records=[],selected=[],counts=[],checksums=[];
 for(const [index,name] of names.entries()){
  const bytes=fs.readFileSync(path.join(sources,name)),before=hash(bytes),file={name,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  const legacy=await gen.call('parse',{kind:'ld',file});
  const original=gen.b.RECONTriagemCore.parseWorkbook(gen.b.XLSX.read(bytes,{type:'array',cellDates:true,cellFormula:true}),name,0);
  assert.equal(normalized(legacy),normalized(original),'A importação do Gerador deve manter o comportamento anterior');
  const strict=await gen.call('parse',{kind:'audit-ld',file});assert.equal(strict.records.length,legacy.records.length);
  for(let i=0;i<legacy.records.length;i++){assert.equal(strict.records[i].document,legacy.records[i].document);assert.equal(strict.records[i].revision,legacy.records[i].revision);}
  records.push(...strict.records);
  for(const r of strict.records.slice(0,20))selected.push({...r,contract:'QA-LOCAL',allocation:'QA-LD-'+(index+1),allocationIdentity:'draft-confirmed',ld:r.source,ldSheet:r.sheet,sourceFile:'Gerador GRCON',sourceSheet:r.sheet,sourceRow:r.row});
  assert.equal(hash(fs.readFileSync(path.join(sources,name))),before);
  counts.push({ld:index+1,documents:strict.records.length,legacyParity:true});checksums.push(before);
  console.log(JSON.stringify({ld:index+1,documents:strict.records.length,originalUnchanged:true}));
 }
 assert.equal(records.length,28806);assert.equal(selected.length,100);
 await auditor.call('context',{contract:'QA-LOCAL',records:selected,ldRecords:records,bases:{},versions:{}});
 const results=await auditor.call('batch',{first:0,count:100});assert.equal(results.length,100);
 assert.ok(results.every(r=>r.findings.some(f=>f.severity==='pending')),'Sem as referências normativas não se declara conformidade');
 assert.ok(results.every(r=>!r.findings.some(f=>f.id==='LD-BASE-MISSING')),'As LDs lidas chegam de fato ao motor');
 const summary={scope:'parsing real local e auditoria preventiva de amostra; sem homologação humana ou produção',files:5,documents:records.length,auditedSample:results.length,originalsUnchanged:true,counts,sha256:checksums,genLegacyParity:true,normativeApproval:false};
 if(process.env.GRCON_REAL_CORPUS_OUT)fs.writeFileSync(process.env.GRCON_REAL_CORPUS_OUT,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
