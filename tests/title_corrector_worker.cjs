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
 if(first.tag)await assert.rejects(request(31,'export',{rows:[{...first,decision:'approved',proposed:'RELATORIO DE INSPECAO - TAG INCORRETA'}]}),/TAG documental/);
 // Regra: a TAG do código fica sempre no final do título ("TÍTULO - TAG"); exportar com a TAG fora do final é recusado.
 assert.equal(first.endTag,'VM-320003');
 assert.match(first.proposed,/ - VM-320003$/,'a TAG termina o título proposto');
 await assert.rejects(request(32,'export',{rows:[{...first,decision:'approved',proposed:'VM-320003 - RELATORIO DE INSPECAO DE RECEBIMENTO'}]}),/final do título/);
 await assert.rejects(request(33,'export',{rows:[{...first,decision:'approved',proposed:first.proposed+' - TESTE'}]}),/final do título/);
 // Título atual já "adequado" mas com a TAG no meio/ausente: a regra gera a sugestão e marca "TAG fora do final".
 const midTag=run(`(()=>{
  const book=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
  ['DOCUMENTO','TÍTULO','REVISÃO','STATUS'],
  ['C1O_RNEST_U32_3.1.1.1_TUB_RIR_VM-320003','RELATORIO DE INSPECAO DE RECEBIMENTO - VM-320003 - VALVULA MANUAL','0','PREVISTO']
  ]),'TUB');
  return XLSX.write(book,{type:'array',bookType:'xlsx'});
 })()`);
 const mid=(await request(34,'analyze',{bytes:midTag,name:'LD_MEIO.xlsx',codes:[],sourceMode:'auto'})).rows[0];
 assert.match(mid.proposed,/ - VM-320003$/,'TAG no meio vai para o final');
 assert.equal((mid.proposed.match(/VM-320003/g)||[]).length,1,'a TAG não é duplicada');
 // Unidade: mover a TAG para o final sem reescrever o resto do título.
 const move=(title,tag)=>{context.__t=title;context.__g=tag;return run('tagAtEnd(__t,__g)','tag-at-end');};
 assert.equal(move('BOMBA CENTRIFUGA P-101 DE AGUA','P-101'),'BOMBA CENTRIFUGA DE AGUA - P-101');
 assert.equal(move('TUBULACAO - P-101 - SUPORTES','P-101'),'TUBULACAO - SUPORTES - P-101');
 assert.equal(move('P-101 - BOMBA CENTRIFUGA','P-101'),'BOMBA CENTRIFUGA - P-101');
 assert.equal(move('BOMBA CENTRIFUGA TAG: P-101 DE AGUA','P-101'),'BOMBA CENTRIFUGA DE AGUA - P-101');
 assert.equal(move('BOMBA CENTRIFUGA - P-101','P-101'),'BOMBA CENTRIFUGA - P-101','já no final: não muda');
 assert.equal(move('BOMBA CENTRIFUGA','P-101'),'BOMBA CENTRIFUGA - P-101','TAG ausente: acrescenta no final');
 assert.equal(move('BOMBA P-1010 DE AGUA','P-101'),'BOMBA P-1010 DE AGUA - P-101','outra TAG parecida não é removida');
 assert.equal(move('BOMBA CENTRIFUGA','') ,'BOMBA CENTRIFUGA','sem TAG: não mexe');
 context.__row={issue:'ok',reason:'Título claro e sem divergência identificada',classification:'ok',current:'BOMBA CENTRIFUGA P-101 DE AGUA',titleTag:'P-101',sheet:'TUB',document:'C1O_RNEST_U32_3.1.1.1_TUB_RIR_P-101'};
 const ruled=run('enforceTagAtEnd(__row,"")','enforce-ok');
 assert.equal(ruled.issue,'tag_position','título "adequado" com a TAG fora do final vira pendência');
 assert.equal(ruled.title,'BOMBA CENTRIFUGA DE AGUA - P-101');
 context.__row={...context.__row,current:'BOMBA CENTRIFUGA DE AGUA - P-101'};
 assert.equal(run('enforceTagAtEnd(__row,"")','enforce-ok-2').issue,'ok','já em conformidade: continua adequado');
 context.__row={...context.__row,sheet:'CV',current:'CURRICULO P-101 JOAO'};
 assert.equal(run('enforceTagAtEnd(__row,"")','enforce-cv').issue,'ok','CV não recebe TAG');
 context.__row={issue:'empty',reason:'Título vazio',classification:'confirmed_error',current:'',titleTag:'P-101',sheet:'TUB',document:'X'};
 assert.equal(run('enforceTagAtEnd(__row,"")','enforce-empty').title,'','título vazio sem sugestão não vira só a TAG');
 // Recolhedor: o que o título atual da LD diz a mais (e as bases não têm) é mantido antes da TAG; o já coberto não se repete.
 const ldWith=(rows)=>{context.__rows=rows;return run(`(()=>{
  const book=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['DOCUMENTO','TÍTULO','REVISÃO','STATUS'],...__rows.map(r=>[r[0],r[1],'0','PREVISTO'])]),'TUB');
  return XLSX.write(book,{type:'array',bookType:'xlsx'});
 })()`,'ld-with');};
 const gathered=(await request(40,'analyze',{bytes:ldWith([['C1O_RNEST_U32_3.1.1.1_TUB_RIR_VM-320003','RELATORIO DE INSPECAO DE RECEBIMENTO DA VALVULA LINHA 4 FASE 2']]),name:'LD_INFO.xlsx',codes:[],sourceMode:'auto'})).rows[0];
 assert.match(gathered.proposed,/LINHA 4 FASE 2 - VM-320003$/,'informação adicional do título atual entra antes da TAG');
 assert.equal((gathered.proposed.match(/RELATORIO|RELATÓRIO/gi)||[]).length,1,'o que as bases já cobrem não é repetido');
 assert.ok(gathered.facts.some(f=>f.field==='informacao_adicional'&&/LINHA 4 FASE 2/.test(f.value)&&f.verified===false),'a informação adicional aparece nas evidências como não verificada');
 const foreign=(await request(41,'analyze',{bytes:ldWith([['C1O_RNEST_U32_3.1.1.1_TUB_RIR_VM-320003','RELATORIO DE INSPECAO DE RECEBIMENTO DA VALVULA XV-9999 LINHA 4']]),name:'LD_FOREIGN.xlsx',codes:[],sourceMode:'auto'})).rows[0];
 assert.doesNotMatch(foreign.proposed,/XV-9999/,'identificador diferente da TAG do código não cruza para o título');
 assert.match(foreign.proposed,/ - VM-320003$/);
 // Contradição com as bases não é informação adicional (válvula confirmada como MANUAL na lista).
 const contradicted=(await request(43,'analyze',{bytes:ldWith([['C1O_RNEST_U32_3.1.1.1_TUB_RIR_VM-320003','RELATORIO DE INSPECAO DE RECEBIMENTO - VALVULA AUTOMATICA - VM-320003']]),name:'LD_CONTRA.xlsx',codes:[],sourceMode:'auto'})).rows[0];
 assert.doesNotMatch(contradicted.proposed,/AUTOMATICA/,'descrição contraditória às bases não é reincorporada');
 assert.match(contradicted.proposed,/VALVULA MANUAL - VM-320003$/);
 assert.match(contradicted.reason,/AUTOMATICA/,'o trecho não incorporado é dito na justificativa');
 const location=(await request(44,'analyze',{bytes:ldWith([['C1O_RNEST_U32_3.1.1.1_TUB_RIR_VM-320003','RELATORIO DE INSPECAO DE RECEBIMENTO DA VALVULA DA CASA DE BOMBAS']]),name:'LD_ONDE.xlsx',codes:[],sourceMode:'auto'})).rows[0];
 assert.match(location.proposed,/CASA DE BOMBAS - VM-320003$/,'complemento de local (com preposição) continua sendo informação adicional');
 // O botão "Restaurar recomendação técnica" volta para a recomendação FINAL (com a TAG no final e as informações recolhidas).
 assert.equal(gathered.originalProposed,gathered.proposed);
 // "nt-" não é TAG: nada de TAG no final nem de identificador NT- tratado como TAG.
 const nt=(await request(42,'analyze',{bytes:ldWith([['C1O_RNEST_U32_6.21.1.1_CVL_MTAND_nt-EMT-AND-FEV-26','RELATORIO DE MONTAGEM DE ANDAIMES APLICADOS FEV 2026']]),name:'LD_NT.xlsx',codes:[],sourceMode:'auto'})).rows[0];
 assert.equal(nt.endTag,'','documento nt- não tem TAG no final');
 assert.doesNotMatch(nt.proposed||'',/NT-EMT-AND-FEV-26\s*$/i,'nt- não vira TAG no final do título');
 // Duas LDs com códigos repetidos: linhas e saídas devem permanecer isoladas.
 const batch=await request(4,'analyzeBatch',{files:[
  {name:'LD_A.xlsx',bytes:fixture},{name:'LD_B.xlsx',bytes:fixture}],codes:[],sourceMode:'auto'});
 assert.equal(batch.rows.length,4,'O lote de duas LDs deve retornar quatro documentos');
 assert.notEqual(batch.rows[0].id,batch.rows[2].id,'Os IDs precisam distinguir arquivos diferentes');
 assert.equal(batch.rows[0].sourceFile,'LD_A.xlsx');
 assert.equal(batch.rows[2].sourceFile,'LD_B.xlsx');
 const outputs=await request(5,'exportBatch',{rows:[
  {...batch.rows[0],decision:'approved',proposed:batch.rows[0].proposed.replace(/ - VM-320003$/,' - A - VM-320003')},
  {...batch.rows[2],decision:'approved',proposed:batch.rows[2].proposed.replace(/ - VM-320003$/,' - B - VM-320003')}]});
 assert.equal(outputs.preservation.valid,true);
 assert.equal(outputs.files,2);
 assert.ok(outputs.name.endsWith('.zip'));
 context.__zipBytes=outputs.bytes;
 const zip=await run('JSZip.loadAsync(__zipBytes)','multi-lD');
 const outputNames=Object.keys(zip.files).filter(n=>n.endsWith('.xlsx'));
 assert.equal(outputNames.length,2,'É obrigatória uma cópia por LD');
 await assert.rejects(request(6,'exportBatch',{rows:[{...batch.rows[0],id:'falso',decision:'approved'}]}),/Selecione e aprove/);
 await assert.rejects(request(7,'analyzeBatch',{files:[{name:'LD_A.txt',bytes:fixture}]}),/Arquivo de LD inválido/);
 await assert.rejects(request(8,'analyzeBatch',{files:[{name:'LD_Axlsx',bytes:fixture}]}),/Arquivo de LD inválido/);
 console.log('title_corrector_worker: análise real, SCON completa, TAG exata, exportação e preservação OK');
})().catch(error=>{console.error(error);process.exitCode=1;});

