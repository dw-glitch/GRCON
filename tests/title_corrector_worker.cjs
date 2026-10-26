'use strict';
// E2E de cálculo sem navegador: executa o Worker real e as bibliotecas RECON reais em VM isolada.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),workerDir=path.join(root,'workers');
const events=[];
const sandbox={console,Date,Promise,TextEncoder,TextDecoder,Blob,URL,Uint8Array,ArrayBuffer,DataView,atob,btoa,
 setTimeout,clearTimeout,postMessage(value){events.push(value);}};
sandbox.self=sandbox;sandbox.globalThis=sandbox;
const context=vm.createContext(sandbox);
const run=(content,name)=>vm.runInContext(content,context,{filename:name});
sandbox.importScripts=(...relatives)=>{for(const relative of relatives){const target=path.resolve(workerDir,relative);assert.ok(target.startsWith(root+path.sep),'unsafe import');run(fs.readFileSync(target,'utf8'),relative);}};
run(fs.readFileSync(path.join(workerDir,'title-corrector.worker.js'),'utf8'),'title-corrector.worker.js');
const fixture=run(`(()=>{
 const book=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
 ['DOCUMENTO','TÍTULO','REVISÃO','STATUS'],
 ['C1O_RNEST_U32_3.1.1.1_TUB_RIR_VM-320003','RELATORIO DE INSPECAO','0','PREVISTO'],
 ['C1O_RNEST_U32_3.1.1.1_TUB_RIR_VM-320004','RELATORIO DE INSPECAO','0','PREVISTO']
 ]),'TUB');
 return XLSX.write(book,{type:'array',bookType:'xlsx'});
})()`);
async function request(id,op,input){events.length=0;await sandbox.onmessage({data:{id,op,input}});assert.equal(events.length,1);const event=events[0];if(event.error)throw new Error(event.error);return event.result;}
(async()=>{
 const analysis=await request(1,'analyze',{bytes:fixture,name:'LD_TESTE.xlsx',codes:[],sourceMode:'auto'});
 assert.equal(analysis.rows.length,2,'análise precisa considerar ambos os documentos');
 assert.ok(analysis.sourceCounts.valve>=1,'lista de válvulas ativa não carregou');
 assert.ok(analysis.sourceCounts.scon>=23000,'SCON completa não carregou');
 assert.equal(analysis.standard,'ET-5290.00-22000-912-1LV-001 Rev. R');
 const first=analysis.rows[0];
 assert.match(first.document,/VM-320003/);
 assert.match(first.proposed,/VM-320003/,'TAG documental exata deve permanecer');
 assert.doesNotMatch(first.proposed,/VM-320004/,'não pode cruzar TAGs');
 assert.ok(first.facts.some(f=>f.field==='objeto'||f.field==='tipo'));
 assert.ok(first.id,'faltou identificador estável para edição');
 assert.ok(Number(first.row)>=2,'faltou linha Excel correta');
 if(first.hasConflict)throw Error('Fixture segura foi classificada como conflito; verificar evidências');
 const approved={...first,decision:'approved',proposed:first.proposed===first.current?first.proposed+' - TESTE CONTROLADO':first.proposed};
 const result=await request(2,'export',{rows:[approved]});
 assert.equal(result.preservation.valid,true,'exportação falhou na conferência de integridade');
 assert.equal(result.changes.length,1,'exportação não isolou uma célula');
 context.__bytes=fixture;
 const original=run('XLSX.read(__bytes,{type:"array"})','original.xlsx');
 context.__bytes=result.bytes;
 const output=run('XLSX.read(__bytes,{type:"array"})','export.xlsx');
 context.__book=original;
 const originalRows=run('XLSX.utils.sheet_to_json(__book.Sheets.TUB,{header:1})','read-original');
 context.__book=output;
 const outputRows=run('XLSX.utils.sheet_to_json(__book.Sheets.TUB,{header:1})','read-export');
 assert.equal(originalRows[1][1],'RELATORIO DE INSPECAO');
 assert.equal(outputRows[1][1],approved.proposed);
 assert.equal(outputRows[2][1],originalRows[2][1],'outra linha foi alterada');
 await assert.rejects(request(3,'export',{rows:[{...first,id:'forjado',decision:'approved'}]}),/Selecione e aprove/);
 console.log('title_corrector_worker: análise real, SCON completa, TAG exata, exportação e preservação OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
