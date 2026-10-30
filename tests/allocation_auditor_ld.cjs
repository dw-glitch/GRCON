'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'workers'),out=[];
const s={console,Date,Promise,TextEncoder,TextDecoder,Blob,URL,Uint8Array,ArrayBuffer,DataView,atob,btoa,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,postMessage:r=>out.push(r)};s.self=s;s.globalThis=s;const ctx=vm.createContext(s);s.importScripts=(...files)=>files.forEach(f=>vm.runInContext(fs.readFileSync(path.resolve(dir,f),'utf8'),ctx,{filename:f}));vm.runInContext(fs.readFileSync(path.join(dir,'allocation.worker.js'),'utf8'),ctx);
const bytes=vm.runInContext(`(()=>{const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([['DOCUMENTO','TÍTULO','REVISÃO'],['RL-5290.00-22313-91A-C1O-121','TÍTULO ANTERIOR','0'],['RL-5290.00-22313-91A-C1O-122','TÍTULO ANTERIOR','0']]),'ET');return XLSX.write(b,{type:'array',bookType:'xlsx'});})()`,ctx);
const file={name:'LD.xlsx',arrayBuffer:async()=>bytes};
async function run(rows){out.length=0;await s.onmessage({data:{id:1,operation:'audit-revise-ld',input:{file,rows}}});if(out[0].error)throw Error(out[0].error);return out[0].result;}
(async()=>{const original=Buffer.from(bytes),row={document:'RL-5290.00-22313-91A-C1O-121',sheet:'ET',row:2,current:'TÍTULO ANTERIOR',proposed:'TÍTULO REVISADO COM EVIDÊNCIA',decision:'approved'};const r=await run([row]);assert.equal(r.preservation.valid,true);assert.equal(r.count,1);assert.deepEqual(Buffer.from(bytes),original);const b=s.XLSX.read(r.buffer,{type:'array'});assert.equal(b.Sheets.ET.B2.v,row.proposed);assert.equal(b.Sheets.ET.B3.v,'TÍTULO ANTERIOR');await assert.rejects(run([{...row,row:3}]),/código exato/);await sourceCorrections();console.log('allocation_auditor_ld: exact code/row, approved title only, original preservation and untouched other document passed');})().catch(e=>{console.error(e);process.exitCode=1;});

async function sourceCorrections(){
 const X=s.XLSX,book=X.utils.book_new();
 X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([['DOCUMENTO','REVISÃO','TÍTULO','WORKFLOW','EAP','CAMINHO DATABOOK','N1','COMENTÁRIO DA FISCAL'],['DOC-121','0','TÍTULO ANTIGO','WF ANTIGO','3.9','DB ANTIGO','N ANTIGO','PRESERVAR'],['DOC-122','0','OUTRO','WF','3','DB','N','HISTÓRICO']]),'ET');
 const raw=new Uint8Array(X.write(book,{type:'array',bookType:'xlsx'})),f={name:'LD.xlsx',arrayBuffer:async()=>raw.buffer};
 const sha=Buffer.from(await s.crypto.subtle.digest('SHA-256',raw)).toString('hex');
 const row={document:'DOC-121',revision:'0',lineage:'first',sheet:'ET',row:2,field:'title',current:'TÍTULO ANTIGO',proposed:'TÍTULO CONFERIDO',decision:'approved'};
 const call=async(rows,hash=sha,source=f)=>{out.length=0;await s.onmessage({data:{id:2,operation:'audit-revise-origin',input:{file:source,rows,sourceHash:hash}}});if(out[0].error)throw Error(out[0].error);return out[0].result;};
 const revised=await call([row,{...row,field:'workflow',current:'WF ANTIGO',proposed:'WF VALIDADO'},{...row,field:'databook',current:'DB ANTIGO',proposed:'DB VALIDADO'},{...row,field:'N1',current:'N ANTIGO',proposed:'N VALIDADO'}]);
 assert.equal(revised.count,4);assert.equal(revised.preservation.valid,true);
 const wb=X.read(revised.buffer,{type:'array'});assert.equal(wb.Sheets.ET.C2.v,'TÍTULO CONFERIDO');assert.equal(wb.Sheets.ET.C3.v,'OUTRO');assert.equal(wb.Sheets.ET.H2.v,'PRESERVAR');assert.equal(wb.Sheets.ET.H3.v,'HISTÓRICO');
 await assert.rejects(call([row],'a'.repeat(64)),/alterada/);
 await assert.rejects(call([{...row,revision:'1'}]),/revisão diferente/);
 await assert.rejects(call([{...row,row:3}]),/Código/);
 await assert.rejects(call([{...row,current:'DIVERGENTE'}]),/valor da LD difere/);
 await assert.rejects(call([row,{...row,proposed:'CONFLITO'}]),/conflitantes/);
 const already=await call([{...row,current:'QUALQUER',proposed:'TÍTULO ANTIGO'}]);assert.equal(already.count,0);assert.equal(already.unchanged.length,1);
 book.Sheets.ET.C2.f='A2';const formula=new Uint8Array(X.write(book,{type:'array',bookType:'xlsx'}));const formulaFile={name:'LD.xlsx',arrayBuffer:async()=>formula.buffer};const formulaHash=Buffer.from(await s.crypto.subtle.digest('SHA-256',formula)).toString('hex');await assert.rejects(call([row],formulaHash,formulaFile),/fórmula/);
 console.log('source corrections: exact SHA, code, revision, cell values, title/workflow/databook/N1, fiscal history, duplicate conflicts and formulas passed');
}
