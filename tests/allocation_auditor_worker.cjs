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
 const doc='C1O_RNEST_U32_10.2.1.2_ELE_RIR_nt-NF-123-BOBINA-121';
 const fixture=vm.runInContext(`(()=>{const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([['NomeDocumento','REVISÃO','TÍTULO','Caminho Data Book','Workflow'],['${doc}','0','=HYPERLINK("bad")','UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR','WF']]),'GERAL');return XLSX.write(b,{bookType:'xlsx',type:'array'});})()`,ctx);
 const f=file('ALOC.xlsx',new Uint8Array(fixture));
 const inspect=await request('inspect',{file:f});assert.equal(inspect[0].name,'GERAL');
 const parsed=await request('parse',{file:f,sheet:'GERAL',contract:'contract-a'});assert.equal(parsed.records.length,1);assert.equal(parsed.records[0].document,doc);assert.equal(parsed.records[0].title,'=HYPERLINK("bad")');assert.equal(parsed.sha256.length,64);
 await assert.rejects(request('parse',{file:{...f,name:'ALOC.xlsm'},sheet:'GERAL'}),/XLSX/);
 await assert.rejects(request('parse',{file:f,sheet:'not found'}),/aba/);
 const context={contract:'contract-a',records:parsed.records,bases:{databook:[{databook:'UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR'}]},versions:{databook:'E'}};
 await request('context',context);const rows=await request('batch',{first:0,count:100});assert.equal(rows.length,1);assert.equal(rows[0].document,doc);assert.ok(rows[0].findings.length);
 const zipBytes=await request('export',{...context,rows,events:[],history:[],files:[{name:'Official.xlsx',base64:btoa('verified existing generator output')} ]});
 sandbox.__zip=zipBytes;const zip=await vm.runInContext('JSZip.loadAsync(__zip)',ctx);assert.ok(zip.file('Official.xlsx'));assert.ok(zip.file('Auditoria_e_Correcoes.xlsx'));
 const wb=sandbox.XLSX.read(await zip.file('Auditoria_e_Correcoes.xlsx').async('uint8array'),{type:'array',cellFormula:true});assert.equal(wb.SheetNames.length,5);assert.equal(wb.Sheets.Auditoria.C2.t,'s');assert.equal(wb.Sheets.Auditoria.C2.f,undefined);assert.ok(wb.Sheets.Auditoria.C2.v.startsWith("'="));
 const trace=JSON.parse(await zip.file('Rastreabilidade.json').async('string'));assert.equal(trace.rows[0].title,'=HYPERLINK("bad")','raw evidence must remain intact in JSON');
 const officialHeaders=['NomeDocumento','Data Prevista','Workflow','Documento Ativo','Ação','Data da Linha Base','Propósito de Emissão Original','Documento Crítico','Observação','Caminho Data Book','N1','N2','N3','N4','N5','N6'];
 const officialRows=[officialHeaders,[doc,46322,'RNEST UHDTD U-32 C&M/ELETRICA','','INCLUSÃO','','PARA CONSTRUÇÃO','','','UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR','UHDTD U-32','10.SUPRIMENTO','10.02.BENS','','',''],[doc.replace('121','122'),46322,'RNEST UHDTD U-32 C&M/ELETRICA','','INCLUSÃO','','PARA CONSTRUÇÃO','','','UHDTD U-32|DATA BOOK C&M|ELÉTRICA|RIR','UHDTD U-32','10.SUPRIMENTO','10.02.BENS','','','']];
 const officialFixture=vm.runInContext('(()=>{const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet(__officialRows),"GERAL");return XLSX.write(b,{bookType:"xlsx",type:"array"});})()',Object.assign(ctx,{__officialRows:officialRows}));
 const sheetInspection=await request('inspect',{file:file('C1O-ALOC-CM-0375-2026.xlsx',new Uint8Array(officialFixture))});
 assert.equal(sheetInspection[0].model,'official-16');assert.equal(sheetInspection[0].documentCount,2);
 const official=await request('parse',{file:file('C1O-ALOC-CM-0375-2026.xlsx',new Uint8Array(officialFixture)),sheet:'GERAL',contract:'contract-a',allocation:'C1O-ALOC-CM-0375-2026'});
 assert.equal(official.model,'official-16');assert.equal(official.records.length,2);
 assert.equal(official.records[0].action,'INCLUSÃO');assert.equal(official.records[0].purpose,'PARA CONSTRUÇÃO');assert.equal(official.records[0].plannedDate,'46322');
 assert.equal(official.records[0].levels[0],'UHDTD U-32');assert.equal(official.records[0].columns.document,1);assert.equal(official.records[0].allocation,'C1O-ALOC-CM-0375-2026');
 await request('context',{...context,records:official.records});const officialAudit=await request('batch',{first:0,count:100});assert.equal(officialAudit.length,2);assert.ok(officialAudit.every(r=>r.officialAllocation));
 const historical=process.env.GRCON_AUDIT_SOURCES;
 if(historical){const p=path.join(historical,'CENTRAL DE ALOCAÇÃO.xlsx'),b=fs.readFileSync(p);const data=await request('parse',{file:file(path.basename(p),b),sheet:'Central de alocação',contract:'contract-a'});assert.equal(data.records.length,15441);assert.equal(data.columns.returnedAt,3);assert.equal(data.columns.fiscalComment,4);assert.equal(new Set(data.records.filter(r=>r.fiscalComment).map(r=>r.fiscalComment)).size,436);console.log(JSON.stringify({historicalRecords:data.records.length,distinctFiscalResponses:436}));}
 console.log('allocation_auditor_worker: real parsing, column mapping, evidence hash, file validation, batched audit, ZIP export and formula injection checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
