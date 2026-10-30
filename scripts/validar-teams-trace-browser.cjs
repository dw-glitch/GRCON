'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const file=path.join(root,new URL(req.url,'http://localhost').pathname.slice(1)||'index.html');
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  try{res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-gpu'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage({viewport:{width:1366,height:768},serviceWorkers:'block',acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://kvyrttccwzdhasplfxnr.supabase.co/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{}'}));
  const w='00000000-0000-4000-8000-000000000001',hid='00000000-0000-4000-8000-000000000002';
  let a={id:'00000000-0000-4000-8000-000000000003',workspace_id:w,history_id:hid,client_record_id:'test-record',contract_code:'UHDT-D',egrdt_number:'0130870-C1O-PGV-G-2026-0123 - eGRDT',requested_at:new Date().toISOString(),updated_at:new Date().toISOString(),expires_at:new Date(Date.now()+604800000).toISOString(),delivery_status:'accepted',documents:[{document:'DOC-001',revision:'0'},{document:'DOC-002',revision:'A'}],confirmed_at:null};
  await page.route('**/api/egrdt-teams/page**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:[a]})}));
  console.log('QA: loading app');
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
  await page.addStyleTag({content:'html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script){visibility:visible!important}#grcon-cloud-auth{display:none!important}'});
  console.log('QA: app loaded, installing history fixture');
  await page.evaluate(async({w,hid,number})=>{
   window.GrconCloud={state:{membership:{workspace_id:w,role:'owner'},session:{access_token:'mock'},online:true},canManageHistory:()=>true,getCurrentUserIdentity:()=>({email:'qa@example.test'})};
   const record={id:'test-record',cloudId:hid,clientRecordId:'test-record',workspaceId:w,egrdtNumber:number,generatedAt:new Date().toISOString(),files:[{document:'DOC-001',revision:'0',grdtRevision:'0',purpose:'Construção'},{document:'DOC-002',revision:'A',grdtRevision:'A',purpose:'Cancelamento'}]};
   window.GrconHistory.read=()=>window.GrconCloud.state.membership.workspace_id===w?[window.GrconHistory.cleanRecord(record)]:[];
   window.dispatchEvent(new CustomEvent('grcon:cloud-ready'));
   await window.GrconTeamsTrace.refresh();
   await window.GRCONModuleLoader.ensure('history');
   // A relação Colar GRCON v3 exige uma Consulta Geral ativa. O cenário
   // Teams usa documentos sintéticos, portanto precisa da fonte sintética
   // correspondente em vez de exportar tudo como NÃO VERIFICADO.
   const query=window.GrconSharedSigemQuery;
   if(!query?.setLocal)throw Error('A Consulta Geral não foi carregada no teste de exportação');
   query.state.workspace=w;
   await query.setLocal({meta:{fileName:'Consulta Geral QA.xlsx',referenceDate:new Date().toISOString().slice(0,10)},
     records:[
       {document:'DOC-001',revision:'0',status:'Em análise',modifiedAt:new Date().toISOString()},
       {document:'DOC-002',revision:'A',status:'Recusado',modifiedAt:new Date().toISOString()},
     ]});
  },{w,hid,number:a.egrdt_number});
  console.log('QA: fixture loaded, activating history');
  await page.evaluate(()=>window.GRCONModuleLoader.ensureModule('history'));  
  console.log('QA: history activated');
  await page.waitForFunction(()=>window.GrconTeamsTrace.snapshot().length===1);
  assert.equal(await page.getByText(/Rastreabilidade Teams ·/).count(),0,'painel informativo do Teams deve estar ausente');
  assert.match(await page.evaluate(()=>window.GrconTeamsTraceCore.label(window.GrconTeamsTrace.snapshot()[0])),/Recebido pelo fluxo/);
  a={...a,delivery_status:'delivered',delivered_at:new Date().toISOString(),confirmation_type:'partial',confirmed_at:new Date().toISOString(),confirmed_by_name:'João Silva',notice_status:'sent',confirmed_documents:[a.documents[0]],updated_at:new Date(Date.now()+1000).toISOString()};
  await page.evaluate(()=>window.GrconTeamsTrace.refresh());
  await page.waitForFunction(()=>window.GrconTeamsTrace.snapshot()[0]?.confirmation_type==='partial');
  const traceState=await page.evaluate(()=>{
    const attempt=window.GrconTeamsTrace.snapshot()[0],core=window.GrconTeamsTraceCore;
    return {label:core.label(attempt),confirmed:attempt.confirmed_documents.length,first:core.confirmed(attempt,attempt.documents[0]),second:core.confirmed(attempt,attempt.documents[1])};
  });
  assert.match(traceState.label,/Postagem parcial declarada por João Silva/);
  assert.equal(traceState.confirmed,1);
  assert.equal(traceState.first,'Sim');
  assert.equal(traceState.second,'Não');
  assert.equal(await page.getByText(/Rastreabilidade Teams ·/).count(),0);
  const count=await page.evaluate(()=>window.GrconTeamsTrace.snapshot().length);assert.equal(count,1,'incremental retry does not duplicate attempts');
  await page.evaluate(({hid})=>window.GrconTeamsTrace.openHistory(hid),{hid});
  assert.equal(await page.locator('#history-module').isVisible(),true,'notification target opens history without Consultas');
  await page.getByText('Filtrar confirmações do Teams',{exact:true}).click();
  await page.locator('#history-teams-confirmation').selectOption('partial');
  await page.waitForFunction(()=>window.GrconHistoryUi.state.filtered.length===1);
  await page.locator('#history-teams-responsible').fill('Pessoa ausente');
  await page.waitForFunction(()=>window.GrconHistoryUi.state.filtered.length===0);
  await page.locator('#history-teams-responsible').fill('João');
  await page.waitForFunction(()=>window.GrconHistoryUi.state.filtered.length===1);
  // Download the actual reports while the optional Teams service returns HTTP 500.
  await page.route('**/api/egrdt-teams/page**',r=>r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({ok:false,message:'Teams indisponível no cenário de regressão'})}));
  await page.evaluate(()=>window.GrconTeamsTrace.refresh().catch(()=>{}));
  const out=path.join(root,'artifacts/teams-export-resilience');fs.mkdirSync(out,{recursive:true});
  const ExcelJS=require('../exceljs.min.js');
  async function downloadReport(selector,name){
   const pending=page.waitForEvent('download');await page.locator(selector).click();
   const download=await pending,file=path.join(out,name+'.xlsx');await download.saveAs(file);
   const book=new ExcelJS.Workbook();await book.xlsx.load(fs.readFileSync(file));
   assert.ok(book.worksheets.length>0,name+' must be a valid Excel workbook');
   const values=[];for(const sheet of book.worksheets)sheet.eachRow(row=>row.eachCell(cell=>values.push(String(cell.value||''))));
   assert.ok(values.some(v=>v.includes('Dados do Teams não atualizados')),name+' must flag stale Teams evidence');
   return book;
  }
  const historico=await downloadReport('#history-export-period','Historico_Teams_500');
  const colar=historico.getWorksheet('Colar GRCON v3');
  assert.ok(colar,'exportação precisa conter a aba Colar GRCON v3');
  assert.equal(colar.getCell('G3').value,'POSTADO — EM ANÁLISE');
  assert.equal(colar.getCell('G4').value,'POSTADO — RECUSADO');
  await page.evaluate(async()=>{
   for(const src of ['posting_conference_core.js','posting_conference_refinement.js','posting_conference_report.js','posting_conference_app.js'])await window.GRCONModuleLoader.ensure(src);
   const core=window.GrconPostingConference,ui=window.GrconPostingConferenceUi;
   const base=[{document:'DOC-001',documentIdentity:core.documentIdentity('DOC-001'),searchKeys:core.documentKeys('DOC-001'),revision:'0',status:'Em Análise',sourceRow:2}];
   ui.state.result=core.reconcile(window.GrconHistory.read(),base,null,{now:new Date().toISOString(),baseReferenceDate:new Date().toISOString().slice(0,10)});
   ui.state.base={meta:{fileName:'Consulta QA.xlsx',importedAt:new Date().toISOString()},records:base};
   ui.state.ready=true;ui.render();document.getElementById('posting-conference-module').hidden=false;
   document.getElementById('history-module').hidden=true;
  });
  await downloadReport('#pc-export','Conferencia_Teams_500');
  await page.evaluate(async()=>{
   for(const src of ['grcon_revision_control.js','grcon_revision_control_document.js','grcon_reposting_core.js','grcon_reposting_storage.js','grcon_reposting_search.js','grcon_reposting_report.js','grcon_reposting_app.js'])await window.GRCONModuleLoader.ensure(src);
   const pending=window.GrconPostingConferenceUi.state.result.eventRows.filter(row=>row.document==='DOC-002');
   if(!pending.length)throw Error('The browser fixture must contain a document pending in SIGEM');
   await window.GrconRepostingUi.open(pending);
  });
  await downloadReport('#grcon-repost-report','Repostagem_Teams_500');
  await page.evaluate(()=>{
   window.GrconCloud.state.membership.workspace_id='00000000-0000-4000-8000-000000000099';
   window.dispatchEvent(new CustomEvent('grcon:contract-context-changed'));
  });
  // The mock API is intentionally cross-contract: client must discard wrong data.
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.GrconTeamsTrace.latest({id:'test-record',workspaceId:'00000000-0000-4000-8000-000000000099'})),null);
  assert.deepEqual(errors,[]);
  console.log('Chromium: receipt vs declaration, incremental partial update, pending revision, notification target, three valid Excel downloads under HTTP 500 and contract isolation PASS');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
