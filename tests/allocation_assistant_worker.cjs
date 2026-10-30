'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'workers'),events=[];
const sandbox={console,Date,Promise,TextEncoder,TextDecoder,Blob,URL,Uint8Array,ArrayBuffer,DataView,atob,btoa,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,postMessage:e=>events.push(e)};
sandbox.self=sandbox;sandbox.globalThis=sandbox;const ctx=vm.createContext(sandbox);
sandbox.importScripts=(...paths)=>{for(const p of paths)vm.runInContext(fs.readFileSync(path.resolve(dir,p),'utf8'),ctx,{filename:p});};
vm.runInContext(fs.readFileSync(path.join(dir,'allocation-auditor.worker.js'),'utf8'),ctx);
let id=0;async function request(operation,input){events.length=0;await sandbox.onmessage({data:{id:++id,operation,input}});assert.equal(events.length,1);if(events[0].error)throw Error(events[0].error);return events[0].result;}
const file=(name,bytes)=>({name,size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
(async()=>{
 const C=sandbox.GrconAllocationAuditorCore,A=sandbox.GrconAllocationAssistant;
 const context={contract:'qa',versions:{},bases:{},ldHashes:{'LD.xlsx':'b'.repeat(64)}};
 const row={contract:'qa',document:'DOC-121',revision:'0',discipline:'ELE',officialAllocation:true,sourceHash:'a'.repeat(64),versions:{},origin:{revision:'0',file:'LD.xlsx',sheet:'ELE',row:2},lineage:'one',workflow:'old',title:'=FORMULA',findings:[],recommendations:[{field:'workflow',before:'old',after:'new',evidence:['LD exata']}]};
 assert.equal(A.intent('Confira essas alocações'),'audit');
 assert.equal(A.allocationReference('Confira a alocação 375'),'375');
 assert.equal(A.allocationReference('Auditar C1O-ALOC-CM-0375-2026'),'C1O-ALOC-CM-0375-2026');
 assert.equal(A.allocationReference('Confira os arquivos'),'');
 assert.equal(A.allocationReference('375'),'375');assert.equal(A.intent('375'),'audit');
 const questions=[{document:'DOC-121',revision:'0',allocation:'C1O-ALOC-CM-0375-2026',findings:[{}]},{document:'DOC-122',revision:'0',findings:[{}]},{document:'DOC-1210',revision:'A',findings:[{}]}];
 assert.equal(A.questionRows(questions,'Explique DOC-1210.')[0].r.document,'DOC-1210');
 assert.equal(A.questionRows(questions.slice(0,2),'Explique DOC-1210').length,0);
 assert.equal(A.questionRows(questions,'DOC-121 rev 1').length,0);
 assert.equal(A.questionRows(questions,'DOC-121 rev 0 C1O-ALOC-CM-0375-2026').length,1);
 const rule={state:'active',payload:{...row,field:'workflow',before:'old',after:'new',ldHash:'b'.repeat(64),evidence:['origem']}};
 assert.equal(A.evaluate(row,rule,context).eligible,true);
 for(const change of [{document:'DOC-122'},{revision:'1'},{sourceHash:'c'.repeat(64)},{discipline:'TUB'},{contract:'other'},{origin:null}])assert.equal(A.evaluate({...row,...change},rule,context).eligible,false);
 assert.equal(A.evaluate(row,rule,{...context,versions:{eap:'new'}}).eligible,false);
 assert.equal(A.evaluate(row,{...rule,state:'candidate'},context).eligible,false);
 assert.equal(A.groups([row,{...row,lineage:'two',allocation:'ALOC-2'}])[0].rows.length,2);
 assert.notEqual(C.key({...row,sourceFile:'a.xlsx',sourceRow:2}),C.key({...row,sourceFile:'b.xlsx',sourceRow:2}));
 const pack=await request('assistant-package',{...context,rows:[row],progress:1,total:1,sessionId:'qa',sources:[],files:[],events:[],exceptions:[]});
 const zip=await sandbox.JSZip.loadAsync(pack.bytes,{checkCRC32:true});
 const bytes=await zip.file('01_Relatorio_Auditoria.xlsx').async('uint8array');const wb=sandbox.XLSX.read(bytes,{type:'array',cellFormula:true});
 assert.deepEqual([...wb.SheetNames],['RESUMO','DETALHAMENTO']);assert.ok(wb.Sheets.DETALHAMENTO['!autofilter']);
 assert.equal(pack.manifest.outputs[0].sha256.length,64);assert.equal(pack.manifest.validation.technicalValidationOnly,true);
 await assert.rejects(request('assistant-package',{...context,rows:[row],progress:1,total:2}),/Conclua/);
 await assert.rejects(request('assistant-package',{...context,rows:[row],progress:1,total:1,files:[{name:'../escape.xlsx',bytes:new Uint8Array([1,2])}]}),/inseguro/);
 await assert.rejects(request('assistant-package',{...context,rows:[row],progress:1,total:1,files:[{name:'bad.xlsx',bytes:new Uint8Array([1,2])}]}),/zip|ZIP|central|corrupt/i);
 if(process.env.GRCON_ASSISTANT_ARTIFACTS){fs.mkdirSync(process.env.GRCON_ASSISTANT_ARTIFACTS,{recursive:true});fs.writeFileSync(path.join(process.env.GRCON_ASSISTANT_ARTIFACTS,'GRCON_Auditoria_Exemplo_Sintetico.zip'),pack.bytes);fs.writeFileSync(path.join(process.env.GRCON_ASSISTANT_ARTIFACTS,'01_Relatorio_Auditoria_Sintetica.xlsx'),bytes);}
 const historical=process.env.GRCON_AUDIT_SOURCES;
 if(historical){const names=fs.readdirSync(historical).filter(n=>/^C1O-ALOC-CM-0(353|369)/.test(n)),records=[],sources=[];
 for(const name of names){const bytes=fs.readFileSync(path.join(historical,name));const f=file(name,bytes);const tabs=await request('inspect',{file:f});const general=tabs.find(t=>t.name==='GERAL');assert.equal(general.model,'official-16');const data=await request('parse',{file:f,sheet:'GERAL',contract:'qa-real'});records.push(...data.records);sources.push({name,sha256:data.sha256,kind:'allocation'});}
 await request('context',{contract:'qa-real',records,versions:{},bases:{}});const rows=await request('batch',{first:0,count:100});const real=await request('assistant-package',{contract:'qa-real',records,rows,versions:{},bases:{},sources,events:[],files:[],progress:rows.length,total:rows.length});assert.equal(rows.length,53);assert.equal(real.manifest.sources.length,2);
 if(process.env.GRCON_ASSISTANT_ARTIFACTS)fs.writeFileSync(path.join(process.env.GRCON_ASSISTANT_ARTIFACTS,'GRCON_Auditoria_Amostra_Real_0353_0369.zip'),real.bytes);
 console.log(JSON.stringify({realFiles:names.length,realDocuments:rows.length,corrections:0,normativeHomologation:false}));}
 console.log('allocation_assistant_worker: bounded policies, 121/122, revision, contract, source versions, occurrence lineage, two-sheet report, hashes, CRC, malformed files and package passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
