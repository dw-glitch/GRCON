'use strict';
// Real Worker and XLSX round-trip. Fixtures are synthetic unless the optional,
// authorized local corpus is explicitly provided. No training or network calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const M=require('../allocation_auditor_ml.js'),root=path.resolve(__dirname,'..'),dir=path.join(root,'workers');
const box={console,Date,Promise,TextEncoder,TextDecoder,Blob,URL,Uint8Array,ArrayBuffer,DataView,atob,btoa,crypto:crypto.webcrypto,setTimeout,clearTimeout};box.self=box;box.globalThis=box;
const ctx=vm.createContext(box);box.importScripts=(...files)=>files.forEach(p=>vm.runInContext(fs.readFileSync(path.resolve(dir,p),'utf8'),ctx));vm.runInContext(fs.readFileSync(path.join(dir,'allocation-auditor.worker.js'),'utf8'),ctx);
let serial=0;async function call(operation,input){let response;box.postMessage=r=>response=r;await box.onmessage({data:{id:++serial,operation,input}});if(response.error)throw Error(response.error);return response.result;}
const X=box.XLSX,hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const file=bytes=>({name:'CENTRAL-QA.xlsx',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
const headers=['DOCUMENTO','REVISAO','TITULO','ALOCAÇÃO','VERSÃO DA LD','Retorno da Fiscal 01','Resposta da Fiscal 01'];
function fixture(tabs){const b=X.utils.book_new();for(const [name,rows] of Object.entries(tabs))X.utils.book_append_sheet(b,X.utils.aoa_to_sheet(rows),name);return Buffer.from(X.write(b,{type:'array',bookType:'xlsx'}));}
(async()=>{
 for(const value of ['31/02/2026','2026-02-30','2026-01-01 lixo','2026-01-01T25:00:00Z','29/02/2025'])assert.ok(Number.isNaN(M.toTime(value)),value);
 assert.equal(M.toTime('29/02/2024'),Date.UTC(2024,1,29));assert.equal(M.toTime('2026-10-27T03:00:00.000Z'),Date.UTC(2026,9,27));
 const auth={id:'QA',grantedBy:'Ana Souza',grantedAt:'2026-01-01',contracts:['QA'],scope:['treino-local']};
 assert.equal(M.checkAuthorization({...auth,grantedAt:'2027-01-01'},Date.UTC(2026,10,7)).valid,false);
 assert.equal(M.checkAuthorization({...auth,expiresAt:'31/02/2026'}).valid,false);
 assert.equal(M.checkAuthorization({...auth,expiresAt:'2026-11-07'},Date.UTC(2026,10,7,20)).valid,true,'validade inclui o dia informado');
 const historical={contract:'QA',sourceFile:'QA.xlsx',sourceRow:2,document:'DOC-001',revision:'01',title:'Titulo enviado',ldVersion:'E',allocation:'0001',fiscalDecision:'recusado',fiscalComment:'Revisão divergente',returnedAt:'2026-01-01'};
 const inv=M.inventory([historical,{...historical,sourceRow:3,returnedAt:'2026-02-01'}],{authorization:auth});assert.equal(inv.eligible.length,2,'reapresentação em data distinta não é descartada como duplicata');
 const reviews=M.admitLabels([{id:M.eventId(historical),event:historical}],[{eventId:M.eventId(historical),reviewer:'Ana Souza',reviewedAt:'2025-12-31',decision:'confirmado'}]);assert.equal(reviews.examples.length,0,'revisão humana não pode anteceder o evento');
 const bytes=fixture({GERAL:[headers,['DOC-001','01','Titulo enviado','0001','E',46322,'=HYPERLINK("https://invalid","x")'],['DOC-002','','','0001','E',46322,'Corrigir título']],OUTRA:[headers,['DOC-003','0','Titulo','0002','E',46322,'OK']]});const before=hash(bytes),f=file(bytes);
 const choices=await call('ml-inspect',{file:f});assert.equal(choices.length,2,'não escolhe silenciosamente entre abas');
 await assert.rejects(call('ml-prepare',{file:f,contract:'QA',sheet:''}),/Selecione uma aba/);
 const result=await call('ml-prepare',{file:f,contract:'QA',sheet:'GERAL'});assert.equal(result.summary.total,2);assert.equal(result.summary.gaps.revision,1);assert.equal(result.summary.gaps.title,1);assert.equal(result.summary.gaps.returnedAt,0,'serial Excel é normalizado pela representação bruta');assert.equal(result.summary.humanReviewed,0);assert.equal(result.summary.trained,false);assert.equal(result.summary.authorized,false);assert.equal(hash(bytes),before);
 const book=X.read(result.bytes,{type:'array'});assert.deepEqual(Array.from(book.SheetNames),['LEIA PRIMEIRO','LACUNAS','REVISÃO HUMANA']);
 const data=X.utils.sheet_to_json(book.Sheets['REVISÃO HUMANA'],{header:1,defval:''});assert.equal(data.length,3);assert.equal(data[1][5],'01');assert.equal(data[1][6],'0001');assert.equal(data[2][5],'');assert.equal(data[2][7],'');assert.equal(data[1][11],'=HYPERLINK("https://invalid","x")');assert.ok(data.slice(1).every(r=>r.slice(14).every(v=>v==='')),'decisões humanas permanecem em branco');
 for(const s of Object.values(book.Sheets))for(const [key,value] of Object.entries(s))if(!key.startsWith('!'))assert.ok(!value.f&&!value.l,'nenhuma fórmula/link executável no relatório de preparação');
 await assert.rejects(call('ml-prepare',{file:file(Buffer.from([1,2,3])),sheet:'GERAL'}),/inválido|corrompido/i);
 const noHistory=file(fixture({GERAL:[['DOCUMENTO','REVISAO'],['DOC-001','01']]}));assert.equal((await call('ml-inspect',{file:noHistory})).length,0,'alocação preventiva não é confundida com histórico de recusas');
 if(process.env.GRCON_AUDIT_SOURCES){
  const p=path.join(process.env.GRCON_AUDIT_SOURCES,'CENTRAL DE ALOCAÇÃO.xlsx'),real=fs.readFileSync(p),sha=hash(real),source={...file(real),name:path.basename(p)};
  const c=await call('ml-inspect',{file:source});assert.equal(c.length,1);const r=await call('ml-prepare',{file:source,sheet:c[0].name,contract:'UHDT-D'});
  assert.equal(r.summary.total,15441);assert.equal(r.summary.gaps.revision,15441);assert.equal(r.summary.gaps.title,15441);assert.equal(hash(fs.readFileSync(p)),sha);
  const out=X.read(r.bytes,{type:'array'});assert.equal(X.utils.decode_range(out.Sheets['REVISÃO HUMANA']['!ref']).e.r,15441);assert.equal(r.summary.trained,false);
  if(process.env.GRCON_ML_PREPARATION_SUMMARY)fs.writeFileSync(process.env.GRCON_ML_PREPARATION_SUMMARY,JSON.stringify({scope:'preparação sem treinamento',...r.summary,originalUnchanged:true,sha256:sha},null,2));
  console.log(JSON.stringify({realSource:true,...r.summary,originalUnchanged:true}));
 }
 console.log('allocation_auditor_ml_preparation_stage14: strict dates, authorization, historical resubmission, sheet selection, original integrity, XLSX review guidance and no-training gate passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
