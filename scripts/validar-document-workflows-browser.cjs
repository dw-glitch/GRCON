'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const XLSX=require('../xlsx.full.min.js');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/document-workflows');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const server=http.createServer((req,res)=>{
  const file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html');
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'content-type':mime});res.end(fs.readFileSync(file));}catch(_){res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-gpu'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
 try {
 const context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block',acceptDownloads:true});
 const page=await context.newPage();const errors=[],calls=[],metrics=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://kvyrttccwzdhasplfxnr.supabase.co/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{"message":"QA session"}'}));
 let files=Array.from({length:103},(_,i)=>({id:'qa-'+i,sequence:i+1,document_code:'DOC-'+String(i).padStart(3,'0'),identity_code:'DOC-'+String(i).padStart(3,'0'),revision:'0',file_name:'DOC-'+String(i).padStart(3,'0')+'_0.pdf',format:'pdf',size_bytes:3,sha256:String(i).padStart(64,'0'),allocated:i%2===0,status:'ready',created_by:'technical-id',created_by_name:'Owner QA',created_at:'2026-10-07T12:00:00Z'}));
 await page.route('**/api/document-vault/**',async route=>{
  const req=route.request(),url=new URL(req.url()),action=url.pathname.split('/').pop();calls.push({action,method:req.method(),query:Object.fromEntries(url.searchParams)});
  let data={ok:true};
  if(action==='health')data={ok:true,supabaseConfigured:true,r2Configured:true};
  if(action==='list'){
   const q=url.searchParams.get('q')||'',a=url.searchParams.get('allocation'),after=Number(url.searchParams.get('after')||0),limit=Number(url.searchParams.get('limit')||50);
   const all=files.filter(f=>f.sequence>after&&f.document_code.includes(q)&&(a==='all'||(a==='allocated'?f.allocated:!f.allocated)));
   const batch=all.slice(0,limit);data={ok:true,files:batch,has_more:all.length>limit,next:all.length>limit?batch.at(-1).sequence:null};
  }
  if(action==='lookup')data={ok:true,results:req.postDataJSON().items.map(item=>({requestId:item.requestId,documentCode:item.documentCode,requestedRevision:item.revision,matches:files.filter(f=>f.document_code===item.documentCode)}))};
  if(action==='download')return route.fulfill({status:200,contentType:'application/pdf',body:Buffer.from('PDF')});
  if(action==='delete')files=files.filter(f=>f.id!==req.postDataJSON().id);
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(base,{waitUntil:'networkidle'});
 await page.addStyleTag({content:'html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script){visibility:visible!important}#grcon-cloud-auth{display:none!important}'});
 await page.waitForFunction(()=>window.GrconDocumentVault&&window.GrconRequestsControl&&window.GrconSharedSigemQuery);
 await page.evaluate(()=>{
  const workspace='00000000-0000-4000-8000-000000000001';
  let requestBase=null,requestRows=[];window.qaDateCalls=0;
  window.GrconCloud={state:{membership:{workspace_id:workspace,contract_id:'qa-contract',role:'owner'},contract:{display_name:'CONSAG / RNEST / UHDT-D',code:'UHDT-D'},session:{access_token:'qa'},online:true,client:{rpc(name,args){
   let data=[];
   if(name==='grcon_requests_base') {
    const input=args.input||{};
    if(args.operation==='current')data=requestBase?.status==='active'?requestBase:null;
    if(args.operation==='begin'){requestBase={id:'qa-base',file_name:input.fileName,expected_count:input.count,status:'pending'};requestRows=[];data={id:'qa-base'};}
    if(args.operation==='chunk'){input.rows.forEach((r,i)=>requestRows[input.first-1+i]=r);data={ok:true};}
    if(args.operation==='publish'){requestBase.status='active';data={id:'qa-base'};}
    if(args.operation==='page')data=requestRows.slice(input.after||0,(input.after||0)+1000).map((payload,i)=>({row_number:(input.after||0)+i+1,payload}));
   }
   if(name==='grcon_sigem_query_current')data=window.qaSigemVersion||null;
   if(name==='grcon_sigem_query_versions')data=window.qaSigemVersion?[window.qaSigemVersion]:[];
   if(name==='grcon_sigem_query_set_date'){window.qaDateCalls++;window.qaSigemVersion.metadata.referenceDate=args.reference_date;data={referenceDate:args.reference_date};}
   if(name==='grcon_notifications_unread_count')data=0;
   return {then(resolve){resolve({data,error:null})},range(){return Promise.resolve({data,error:null})}};
  }}},loadPlannedDocuments:async()=>({id:'qa-planned',fileName:'Previstos.xlsx',count:1,keys:new Set(['DOC-001'])})};
  window.dispatchEvent(new CustomEvent('grcon:cloud-ready'));
 });
 assert.equal(await page.locator('[data-grcon-view="analysis-history"]').count(),0);
 await page.evaluate(()=>window.GRCONModuleLoader.ensureModule('analysis-history'));
 assert.equal(await page.locator('#grdt-module').isVisible(),true,'old route safely opens GRDT');
 await page.evaluate(()=>window.GrconDocumentVault.open());
 await page.waitForFunction(()=>document.querySelectorAll('#vault-list-body tr').length===50);
 await page.locator('#vault-allocation').selectOption('allocated');
 await page.waitForFunction(()=>window.GrconDocumentVault.state.allocation==='allocated'&&!window.GrconDocumentVault.state.loading);
 const download=page.waitForEvent('download');await page.locator('#vault-export').click();const exported=await download;await exported.saveAs(path.join(out,'cofre.xlsx'));
 const cofre=XLSX.read(fs.readFileSync(path.join(out,'cofre.xlsx')),{type:'buffer'}),cofreRows=XLSX.utils.sheet_to_json(cofre.Sheets.Cofre);
 assert.equal(cofreRows.length,52,'export includes all matching pages, not only visible 50');assert.ok(cofreRows.every(r=>r.Situação==='Alocado'));assert.ok(!JSON.stringify(cofreRows).includes('sha256'));assert.ok(!JSON.stringify(cofreRows).includes('technical-id'));assert.equal(cofreRows[0]['Incluído por'],'Owner QA');
 page.once('dialog',d=>d.dismiss());await page.locator('[data-vault-delete]').first().click();assert.equal(calls.filter(c=>c.action==='delete').length,0);
 page.once('dialog',d=>d.accept());await page.locator('[data-vault-delete]').first().click();await page.waitForFunction(()=>!document.querySelector('[data-vault-delete="qa-0"]'));
 assert.equal(calls.filter(c=>c.action==='delete').length,1);
 await page.screenshot({path:path.join(out,'cofre-1366.png')});
 await page.locator('[data-grcon-view="control"]').first().click();await page.locator('input[name="grdt-document-source"][value="vault"]').check();
 for(const size of [10,50,100]) {
  const codes=Array.from({length:size},(_,i)=>'DOC-'+String(i+1).padStart(3,'0')).join('\n');
  await page.locator('#grdt-vault-codes').fill(codes);const start=performance.now(),beforeDownload=calls.filter(c=>c.action==='download').length;
  await page.locator('#grdt-vault-lookup').click();await page.waitForFunction(n=>window.GrconDocumentVault.state.lookupRows.length===n&&!window.GrconDocumentVault.state.lookupBusy,size);
  const previewMs=performance.now()-start;assert.equal(calls.filter(c=>c.action==='download').length,beforeDownload,'metadata preview never downloads binaries');
  const prepareStart=performance.now();await page.locator('#grdt-vault-prepare').click();await page.waitForFunction(n=>document.querySelector('#pdf-input').files.length===n,size);
  metrics.push({documents:size,lookupAndPreviewMs:Math.round(previewMs),prepareMs:Math.round(performance.now()-prepareStart)});
 }
 await page.locator('[data-grcon-view="requests"]').first().click();await page.evaluate(()=>window.GRCONModuleLoader.ensureModule('requests'));
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Documento','Título','Responsável'],['DOC-001','Pedido de documento','Vinício']]),'Solicitações');
 const fixture=path.join(out,'controle-fixture.xlsx');fs.writeFileSync(fixture,XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
 await page.locator('#requests-base-control-title').waitFor();await page.locator('input[type="file"]').filter({visible:true}).count();
 await page.locator('input[aria-label="Arquivo do Controle de Solicitações"]').setInputFiles(fixture);
 await page.waitForFunction(()=>window.GrconRequestsControl.current()?.records.length===1);
 
 // Use the controlled React input rather than assigning its DOM value.
 const textareas=page.locator('#requests-area-consulta-react textarea');await textareas.first().fill('DOC-001');
 await page.getByRole('button',{name:/Adicionar à lista/}).first().click();
 await page.getByRole('button',{name:/Consultar todos|Consultar documentos/}).first().click();
 await page.waitForFunction(()=>document.querySelector('.requests-table')?.textContent.includes('Controle de Solicitações'));
 assert.match(await page.locator('.requests-table').textContent(),/Pedido de documento/);
 await page.screenshot({path:path.join(out,'consultas.png')});
 await page.evaluate(async()=>{
  await window.GRCONModuleLoader.ensure('posting_conference_report.js');await window.GRCONModuleLoader.ensure('posting_conference_app.js');await window.GrconPostingConferenceUi.activate();
  const rows=['100','100','100','101','102','102'].map((n,i)=>{const send={document:'DOC-00'+(i+1),egrdtNumber:'GRDT-'+n,revisionSent:'0',discipline:i<4?'X':'Y',status:'AGUARDANDO',generatedAt:'2026-10-07T12:00:00Z'};return {...send,sends:[send],sendCount:1,egrdtCount:1,revisions:['0'],latestEgrdtNumber:send.egrdtNumber,currentRevision:'0'};});
  const ui=window.GrconPostingConferenceUi;ui.state.result={...ui.state.result,documentRows:rows,rows,summary:{total:6,pending:6}};ui.state.base={meta:{fileName:'Consulta.xlsx',recordCount:6,referenceDate:'2026-10-03',importedAt:'2026-10-07T12:00:00Z'},records:[]};ui.state.view='pending';
  window.qaSigemVersion={snapshot_id:'qa-snapshot',version:1,file_name:'Consulta.xlsx',record_count:6,status:'active',published_at:'2026-10-07T12:00:00Z',metadata:{referenceDate:'2026-10-03',importedAt:'2026-10-07T12:00:00Z'}};
  window.GrconSharedSigemQuery.state.shared={meta:{...ui.state.base.meta,snapshotId:'qa-snapshot'},records:[]};ui.render();
 });
 assert.match(await page.locator('#pc-pending-grdts').textContent(),/Documentos pendentes: 6 · GRDTs pendentes: 3/);
 assert.equal(await page.locator('#pc-table-wrap tbody tr').count(),6);
 const pendingDownload=page.waitForEvent('download');await page.locator('#pc-export').click();await (await pendingDownload).saveAs(path.join(out,'pendencias.xlsx'));
 const pend=XLSX.read(fs.readFileSync(path.join(out,'pendencias.xlsx')),{type:'buffer'});assert.deepEqual(pend.SheetNames,['Detalhamento','GRDTs Pendentes']);assert.equal(XLSX.utils.sheet_to_json(pend.Sheets['GRDTs Pendentes']).length,3);
 await page.locator('#pc-discipline').selectOption('X');assert.match(await page.locator('#pc-pending-grdts').textContent(),/Documentos pendentes: 4 · GRDTs pendentes: 2/);
 await page.locator('#pc-reference-date').fill('2026-10-02');await page.locator('#pc-save-date').click();await page.waitForFunction(()=>window.GrconSharedSigemQuery.current()?.meta.referenceDate==='2026-10-02');assert.equal(await page.evaluate(()=>window.qaDateCalls),1);
 await page.screenshot({path:path.join(out,'pendencias-1366.png')});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,metrics,cofreExport:52,details:6,uniqueGrdts:3,filteredDetails:4,filteredGrdts:2,errors},null,2));
 console.log('Chromium document workflows passed: '+JSON.stringify(metrics));
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
