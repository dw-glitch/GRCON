'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req,res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if (!file.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
  if(req.url==='/__qa'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<!doctype html><html><body><main><section class="module-view" id="qa-module"><button id="qa-button">Executar</button></section></main></body></html>');return;}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'}).end(data);});
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  const browserContext=await browser.newContext();
  const page=await browserContext.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(base+'/__qa');
    for(const file of ['operation_tasks.js','operation_progress.js','performance_workers.js','xlsx.full.min.js','grcon_contracts.js','discipline_resolver.js','core.js','allocation_registry_core.js','allocation_dashboard_core.js','planned_documents_core.js','requests_control_core.js','consultation_index.js'])await page.addScriptTag({url:base+'/'+file});
    const lifecycle=await page.evaluate(async()=>{
      const Ops=window.GrconOperations,T=window.QualityTaskCenter;
      let calls=0,release;
      const first=Ops.run('duplicate','Duplicação',async op=>{calls++;op.update('Aguardando resposta…');await new Promise(resolve=>release=resolve);op.update({message:'Itens',done:2,total:4});await op.paint();return 42;},{button:'#qa-button'});
      const duplicate=Ops.run('duplicate','Duplicação',async()=>{calls++;return 0;});
      await new Promise(r=>setTimeout(r,80));
      const unknown=!document.querySelector('[data-operation="duplicate"] progress').hasAttribute('value');
      release();const values=await Promise.all([first,duplicate]);
      try{await Ops.run('error','Falha prevista',async()=>{throw new Error('Falha de teste');});}catch{}
      try{await Ops.run('cancel','Cancelamento',async()=>{throw new DOMException('Cancelado','AbortError');});}catch{}
      const statuses=Object.fromEntries(T.list().map(t=>[t.label,t.status]));
      const buttonRestored=!document.querySelector('#qa-button').disabled&&document.querySelector('#qa-button').textContent==='Executar';
      return {calls,values,unknown,statuses,buttonRestored};
    });
    assert.equal(lifecycle.calls,1);assert.deepEqual(lifecycle.values,[42,42]);assert.equal(lifecycle.unknown,true);assert.equal(lifecycle.buttonRestored,true);
    assert.equal(lifecycle.statuses['Falha prevista'],'failed');assert.equal(lifecycle.statuses.Cancelamento,'cancelled');assert.equal(lifecycle.statuses['Duplicação'],'completed');
    const worker=await page.evaluate(async()=>{
      const n=50000,rows=Array.from({length:n},(_,i)=>['N-1710','E31','14/10/2026',i%3?'FISCAL 01 - AGUARDANDO RETORNO':'CONCLUÍDA','ALOC-'+i%500,'ET-3010.00-1200-800-ABC-'+String(i).padStart(6,'0')]);
      const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['ABA','VERSÃO DA LD','DATA DO ENVIO DA ALOC','STATUS DA ALOCAÇÃO','ALOCAÇÃO','NomeDocumento'],...rows]),'Central de alocação');
      const input=XLSX.write(wb,{type:'array',bookType:'xlsx'}),file=new File([input],'Controle.xlsx');
      const startBaseline=performance.now();const baseline=GrconAllocationRegistryCore.parseWorkbook(XLSX.read(input,{type:'array'}),XLSX);const baselineMs=performance.now()-startBaseline;
      let ticks=0,last=performance.now(),maxGap=0;const timer=setInterval(()=>{let now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;ticks++;},16);
      const messages=[];const start=performance.now();
      const imported=await GrconPerformance.importWorkbook(file,'allocation',d=>messages.push(d.message));
      clearInterval(timer);const elapsedMs=performance.now()-start;
      const same=JSON.stringify(imported)===JSON.stringify(baseline);
      const prepared=await GrconPerformance.processData('allocation-prepare',{key:'qa:1',records:imported.records});
      const filtered=await GrconPerformance.processData('allocation-filter',{key:'qa:1',options:{status:'completed'}});
      const expected=GrconAllocationDashboardCore.aggregate(GrconAllocationDashboardCore.filter(prepared.prepared.rows,{status:'completed'}));
      const buffer=await GrconPerformance.processData('allocation-export',{aggregated:filtered,options:{contract:'QA'}});
      const out=XLSX.read(buffer,{type:'array'});
      let rejected=false;try{await GrconPerformance.importWorkbook(new File(['invalid'],'bad.xlsx'),'allocation');}catch{rejected=true;}
      const recovered=await GrconPerformance.processData('allocation-filter',{key:'qa:1',options:{status:'completed'}});
      return {count:imported.records.length,same,baselineMs,elapsedMs,ticks,maxGap,messages,sheets:out.SheetNames,filtered:filtered.links,expected:expected.links,rejected,recovered:recovered.links};
    });
    assert.equal(worker.count,50000);assert.equal(worker.same,true);assert.equal(worker.filtered,worker.expected);assert.equal(worker.recovered,worker.expected);assert.equal(worker.rejected,true);
    assert.ok(worker.ticks>5,'UI timer must run during parsing');assert.ok(worker.maxGap<Math.max(500,worker.baselineMs*.7),'main thread must not block for the parsing duration');
    assert.deepEqual(worker.sheets,['Resumo','Alocações','Documentos']);
    const otherImports=await page.evaluate(async()=>{
      const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['DOCUMENTO','TÍTULO'],['DOC-0001','Primeiro'],['DOC-0002','Segundo']]),'Solicitações');
      const bytes=XLSX.write(wb,{type:'array',bookType:'xlsx'}),file=new File([bytes],'Controle.xlsx');
      const requests=await GrconPerformance.importWorkbook(file,'requests');
      const planned=await GrconPerformance.importWorkbook(file,'planned');
      const expected=GrconRequestsControlCore.parseWorkbook(wb,XLSX);
      const inputs={lds:[],control:{records:requests},plannedSnapshot:{id:'qa-planned',keys:new Set(['DOC-0001'])}};
      const indexed=await GrconPerformance.processData('consultation-index',inputs);
      const original=GrconConsultationIndex.buildIndex(inputs.lds,inputs.plannedSnapshot,inputs.control);
      return {same:JSON.stringify(requests)===JSON.stringify(expected),count:planned.count,documents:indexed.documents.length,expectedDocuments:original.documents.length,first:indexed.documents[0].documentKey};
    });
    assert.equal(otherImports.same,true);assert.equal(otherImports.count,2);assert.equal(otherImports.documents,otherImports.expectedDocuments);
    const report=await page.evaluate(async()=>{
      const buffer=await GrconPerformance.buildSpreadsheet('emission-dashboard',{
        daily:[{date:'2026-10-14',ET:1,'N-1710':0,CV:0,total:1,egrdts:1}],
        series:[{date:'2026-10-12',startDate:'2026-10-12',endDate:'2026-10-18',ET:1,'N-1710':0,CV:0,total:1,egrdts:1}],
        documentRows:[{date:'2026-10-14',egrdt:'QA-1',family:'ET',document:'QA-DOC',revision:'0',title:'Título QA',discipline:'ELE',databook:'DB',fileCount:1,files:'QA.pdf'}],
        totals:{documents:1,ET:1,'N-1710':0,CV:0,egrdts:1,days:1},previousTotals:null,granularity:'week',weeks:4,imageBase64:'',insight:'QA',
      });
      const wb=XLSX.read(buffer,{type:'array'});
      return {sheets:wb.SheetNames,document:wb.Sheets['Documentos emitidos'].D7?.v,title:wb.Sheets['Documentos emitidos'].F7?.v};
    });
    assert.deepEqual(report.sheets,['Dashboard','Emissões diárias','Emissões semanais','Documentos emitidos']);assert.equal(report.document,'QA-DOC');assert.equal(report.title,'Título QA');
    await page.addScriptTag({url:base+'/data_exports.js'});
    await page.addScriptTag({url:base+'/exceljs.min.js'});
    const compatibility=await page.evaluate(async()=>{
      const NativeWorker=window.Worker;window.Worker=undefined;window.GRCONModuleLoader={ensure:async()=>{}};
      try{
        const buffer=await GrconPerformance.processData('central-export',{workspace:'qa',userId:'qa',columns:[['document','Documento']],state:{columns:['document'],filtered:{rows:[{document:'DOC-0001'}],missing:[]},data:{meta:{fileName:'QA.xlsx'},historyComplete:true},view:'documents',effectiveQuery:'DOC-0001',filters:{},sort:{}}});
        const central=XLSX.read(buffer,{type:'array'});
        const monitor=await GrconPerformance.buildSpreadsheet('monitor',{columns:[{header:'Documento',key:'document'}],rows:[{document:'DOC-0001'}]});
        const book=XLSX.read(monitor,{type:'array'});
        return {central:central.Sheets.Consulta.A2.v,monitor:book.Sheets['Alterações SIGEM'].A2.v};
      }finally{window.Worker=NativeWorker;}
    });
    assert.deepEqual(compatibility,{central:'DOC-0001',monitor:'DOC-0001'});
    // Context invalidation aborts read operations and prevents stale success.
    const context=await page.evaluate(async()=>{
      window.GrconCloud={state:{membership:{workspace_id:'A'},session:{user:{id:'qa'}}}};
      const op=GrconOperations.begin('context','Troca de contrato');window.GrconCloud.state.membership.workspace_id='B';window.dispatchEvent(new Event('grcon:contract-context-changed'));
      let rejected=false;try{op.assertCurrent();}catch{rejected=true;}op.finish();
      return {rejected,status:QualityTaskCenter.list().find(t=>t.label==='Troca de contrato').status,aborted:op.signal.aborted};
    });
    assert.deepEqual(context,{rejected:true,status:'cancelled',aborted:true});assert.deepEqual(errors,[]);
    const second=await page.context().newPage();
    await second.goto(base+'/__qa');
    await second.addScriptTag({url:base+'/operation_tasks.js'});
    const terminalId=await page.evaluate(()=>{const id=GrconOperationTasks.start('Resultado entre abas');GrconOperationTasks.fail(id,new Error('Falha prevista'));return id;});
    await second.waitForFunction(id=>window.GrconOperationTasks.list().find(t=>t.id===id)?.status==='failed',terminalId);
    const interruptedId=await page.evaluate(()=>GrconOperationTasks.start('Recarga interrompida'));
    await page.reload();await page.addScriptTag({url:base+'/operation_tasks.js'});
    const restored=await page.evaluate(id=>GrconOperationTasks.list().find(t=>t.id===id)?.status,interruptedId);
    assert.equal(restored,'interrupted');await second.close();
    const output={lifecycle,worker,otherImports,report,compatibility,context,restored};
    if(process.env.GRCON_PROGRESS_QA_OUTPUT)fs.writeFileSync(process.env.GRCON_PROGRESS_QA_OUTPUT,JSON.stringify(output,null,2));
    console.log(JSON.stringify(output,null,2));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
