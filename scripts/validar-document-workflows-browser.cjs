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
 let files=Array.from({length:103},(_,i)=>({id:'qa-'+i,sequence:i+1,document_code:'DOC-'+String(i).padStart(3,'0'),identity_code:'DOC-'+String(i).padStart(3,'0'),revision:'0',file_name:'DOC-'+String(i).padStart(3,'0')+'_0.pdf',format:'pdf',size_bytes:3,sha256:String(i).padStart(64,'0'),allocated:i%2===0,allocation_identified:i%2===0,allocation_label:i%2===0?'C1O-ALOC-QA-'+String(i).padStart(4,'0'):'Não identificado',allocation_source:'Controle de Solicitações',status:'ready',created_by:'technical-id',created_by_name:'Owner QA',created_at:'2026-10-07T12:00:00Z'}));
 await page.route('**/api/document-vault/**',async route=>{
  const req=route.request(),url=new URL(req.url()),action=url.pathname.split('/').pop();calls.push({action,method:req.method(),query:Object.fromEntries(url.searchParams)});
  let data={ok:true};
  if(action==='health')data={ok:true,supabaseConfigured:true,r2Configured:true};
  if(action==='usage')data={ok:true,storage:{checkedAt:'2026-10-07T14:30:00Z',physicalObjects:files.length,physicalBytes:files.reduce((n,f)=>n+f.size_bytes,0),catalogObjects:files.length,catalogDocuments:files.length,missingObjects:0,sizeMismatches:0,orphanObjects:0,removedPendingFinalization:0,healthy:true}};
  if(action==='reconcile')data={ok:true,storage:{checkedAt:'2026-10-07T14:31:00Z',physicalObjects:files.length,physicalBytes:files.reduce((n,f)=>n+f.size_bytes,0),catalogObjects:files.length,catalogDocuments:files.length,missingObjects:0,sizeMismatches:0,orphanObjects:0,removedPendingFinalization:0,healthy:true},audit:{eventId:null}};
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
 assert.equal(cofreRows.length,52,'export includes all matching pages, not only visible 50');assert.ok(cofreRows.every(r=>String(r['Alocação']).startsWith('C1O-ALOC-QA-')));assert.ok(cofreRows.every(r=>r['Fonte da alocação']==='Controle de Solicitações'));assert.ok(!JSON.stringify(cofreRows).includes('sha256'));assert.ok(!JSON.stringify(cofreRows).includes('technical-id'));assert.equal(cofreRows[0]['Incluído por'],'Owner QA');
 page.once('dialog',d=>d.dismiss());await page.locator('[data-vault-delete]').first().click();assert.equal(calls.filter(c=>c.action==='delete').length,0);
 page.once('dialog',d=>d.accept());await page.locator('[data-vault-delete]').first().click();await page.waitForFunction(()=>!document.querySelector('[data-vault-delete="qa-0"]'));
 assert.equal(calls.filter(c=>c.action==='delete').length,1);
 await page.screenshot({path:path.join(out,'cofre-1366.png')});
 // A mesma tabela e os mesmos comandos em desktop, nos dois temas e com zoom.
 for(const width of [1366,1440,1920])for(const dark of [false,true])for(const zoom of [1,1.25]){
  await page.setViewportSize({width,height:900});
  await page.evaluate(({dark,zoom})=>{
   if((document.documentElement.dataset.theme==='dark')!==dark)document.querySelector('#ui-theme-toggle').click();
   document.documentElement.style.zoom=String(zoom);
  },{dark,zoom});
  await page.evaluate(async()=>{
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   await Promise.all(document.getAnimations().filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{})));
  });
  await page.locator('.vault-browser-card').scrollIntoViewIfNeeded();
  await page.locator('.vault-list-wrap').evaluate(node=>{node.scrollLeft=0;});
  await page.mouse.move(0,0);
  const geometry=await page.evaluate(()=>{
   const row=document.querySelector('#vault-list-body tr'),buttons=[...row.querySelectorAll('.vault-row-actions button')];
   const rects=buttons.map(b=>b.getBoundingClientRect());
   const actionsCell=row.lastElementChild.getBoundingClientRect();
   const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
   const contrast=[...document.querySelectorAll('#vault-list-body tr')].slice(0,2).map(tr=>{const style=getComputedStyle(tr.querySelector('td')),fg=luminance(style.color),bg=luminance(style.backgroundColor);return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);});
   return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,rowHeight:row.getBoundingClientRect().height/Number(document.documentElement.style.zoom),buttons:buttons.map(b=>b.textContent),oneLine:rects.every(r=>Math.abs(r.top-rects[0].top)<1),overlap:rects.some((r,i)=>i>0&&r.left<rects[i-1].right),actionsInsideCell:rects.every(r=>r.left>=actionsCell.left&&r.right<=actionsCell.right),clippedButton:buttons.some(b=>b.scrollWidth>b.clientWidth+1),contrast,emptyDetailsHidden:getComputedStyle(document.querySelector('#vault-storage-details')).display==='none'};
  });
  assert.ok(geometry.overflow<=1,'Cofre mantém rolagem da tabela dentro do módulo');
  assert.ok(geometry.rowHeight<=80,'linha compacta preserva código, arquivo e versão');
  assert.deepEqual(geometry.buttons,['Detalhes','Abrir','Baixar','Excluir']);
  assert.equal(geometry.oneLine,true);assert.equal(geometry.overlap,false);assert.equal(geometry.emptyDetailsHidden,true);
  assert.equal(geometry.clippedButton,false);assert.ok(geometry.contrast.every(ratio=>ratio>=4.5),'texto legível nas linhas pares e ímpares');
  assert.equal(geometry.actionsInsideCell,true,'todos os comandos cabem na coluna de ações');
  metrics.push({view:'cofre',width,dark,zoom,...geometry});
  await page.screenshot({path:path.join(out,`cofre-${width}-${dark?'dark':'light'}-zoom${Math.round(zoom*100)}.png`)});
 }
 await page.setViewportSize({width:1366,height:768});
 await page.evaluate(()=>{document.documentElement.style.zoom='';if(document.documentElement.dataset.theme==='dark')document.querySelector('#ui-theme-toggle').click();});
 assert.match(await page.locator('#vault-storage-used').textContent(),/B|KB|MB|GB/);
 await page.locator('#vault-storage-reconcile').click();
 await page.waitForFunction(()=>!document.querySelector('#vault-storage-reconcile').disabled);
 assert.ok(calls.some(c=>c.action==='reconcile'),'admin reconciliation reaches read-only storage audit endpoint');
 const fallbackCodes=[...Array.from({length:27},(_,i)=>'DOC-'+String(i+1).padStart(3,'0')),'DOC-900','DOC-901','DOC-902'];
 const lookupBefore=calls.filter(c=>c.action==='lookup').length;
 const fallback=await page.evaluate(async codes=>window.GrconDocumentVault.resolveMissingEntries(codes.map((document,i)=>({document,fileName:document+'.pdf',raw:document,sheetName:'Entrada por texto',rowNumber:i+1}))),fallbackCodes);
 assert.equal(fallback.files.length,27);assert.equal(fallback.recovered.length,27);assert.equal(fallback.missing.length,3);assert.equal(fallback.queried,30);
 const autoLookups=calls.filter(c=>c.action==='lookup').slice(lookupBefore);assert.equal(autoLookups.length,1,'only the missing subset is queried in one batch');
 metrics.push({automaticFallbackRequested:30,recoveredFromVault:27,stillMissing:3});
 await page.locator('[data-grcon-view="control"]').first().click();
 assert.equal(await page.locator('input[name="grdt-document-source"]').count(),0,'manual Base documental selector must not exist');
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
 await page.locator('[data-pc-open="sidebar"]').click();
 await page.waitForFunction(()=>window.GrconPostingConferenceUi?.state.ready&&!window.GrconPostingConferenceUi.state.busy);
 await page.evaluate(async()=>{
  await window.GRCONModuleLoader.ensure('posting_conference_report.js');await window.GRCONModuleLoader.ensure('posting_conference_app.js');await window.GrconPostingConferenceUi.activate();
  const C=window.GrconPostingConference;
  const history=['100','101','102'].map((n,group)=>({id:'qa-grdt-'+n,egrdtNumber:'GRDT-'+n,generatedAt:'2026-10-01T12:00:00Z',files:Array.from({length:group===0?3:group===1?1:2},(_,offset)=>{
   const i=(group===0?0:group===1?3:4)+offset;return {document:'DOC-00'+(i+1),revision:'0',purpose:i===5?'':i%2?'Para Cancelamento':'Para Construção',discipline:i<4?'X':'Y'};
  })}));
  const base=C.parseMatrix([['Documento','Revisão','Status'],['DOC-001','0','Emitido'],['DOC-999','0','Emitido']]);
  const ui=window.GrconPostingConferenceUi;ui.state.result=C.reconcile(history,base.records,null,{now:'2026-10-08T12:00:00Z',baseReferenceDate:'2026-10-08'});
  ui.state.base={meta:{fileName:'Consulta.xlsx',recordCount:2,referenceDate:'2026-10-08',importedAt:'2026-10-08T12:00:00Z'},records:base.records};ui.state.view='pending';
  window.qaSigemVersion={snapshot_id:'qa-snapshot',version:1,file_name:'Consulta.xlsx',record_count:2,status:'active',published_at:'2026-10-08T12:00:00Z',metadata:{referenceDate:'2026-10-08',importedAt:'2026-10-08T12:00:00Z'}};
  window.GrconSharedSigemQuery.state.shared={meta:{...ui.state.base.meta,snapshotId:'qa-snapshot'},records:base.records};ui.render();
 });
 assert.equal(await page.locator('.pc-pending-table tbody tr').count(),5);
 assert.ok(!(await page.locator('.pc-pending-table').textContent()).includes('DOC-001'));
 assert.match(await page.locator('.pc-pending-table').textContent(),/Parte da GRDT pendente/);
 assert.match(await page.locator('.pc-pending-table').textContent(),/GRDT inteira pendente/);
 await page.getByRole('button',{name:'Por eGRDT',exact:true}).click();
 assert.equal(await page.locator('.pc-grdt-details').count(),3);
 assert.equal(await page.locator('.pc-grdt-table input[data-repost-key]').count(),0,'seleção legada não pode associar índices aos grupos');
 assert.equal(await page.locator('.pc-grdt-table input[data-repost-event-key]:checked').count(),0,'nenhum reenvio é pré-selecionado');
 assert.equal(await page.locator('.pc-grdt-table input[data-repost-event-key]:disabled').count(),1,'confirmado não pode entrar no reenvio');
 assert.equal(await page.locator('#grcon-repost-toolbar').isVisible(),false,'preparação legada não está habilitada na visão agrupada');
 await page.locator('.pc-grdt-details summary').first().click();
 assert.match(await page.locator('.pc-grdt-details[open]').textContent(),/Não reenviar o pacote integral/);
 assert.match(await page.locator('.pc-grdt-details[open]').textContent(),/DOC-001/);
 assert.match(await page.locator('.pc-grdt-details[open]').textContent(),/NÃO REENVIAR/);
 await page.locator('.pc-grdt-details[open] input[type=search]').fill('DOC-002');
 assert.equal(await page.locator('.pc-grdt-details[open] tbody tr:visible').count(),1);
 await page.locator('.pc-grdt-details[open] input[type=search]').fill('');
 // Escolha explícita de apenas um pendente, sem incluir confirmado nem outro grupo.
 const firstGroup=page.locator('.pc-grdt-details').first();
 await firstGroup.locator('input[data-repost-event-key]:enabled').first().check();
 await firstGroup.locator('[data-repost-pending-group]').click();
 await page.locator('#grcon-repost-overlay').waitFor({state:'visible'});
 assert.deepEqual(await page.evaluate(()=>window.GrconRepostingUi.state.targets.map(t=>({document:t.document,revision:t.revision,egrdt:t.egrdtNumber}))),[{document:'DOC-002',revision:'0',egrdt:'GRDT-100'}]);
 const sourceDir=path.join(out,'selective-source');fs.mkdirSync(sourceDir,{recursive:true});
 fs.writeFileSync(path.join(sourceDir,'DOC-001_0.pdf'),'QA confirmed file');
 fs.writeFileSync(path.join(sourceDir,'DOC-002_0.pdf'),'QA selected pending file');
 await page.locator('#grcon-root-session-input').setInputFiles(sourceDir);
 await page.waitForFunction(()=>window.GrconRepostingUi.state.sessionEntries.length===2);
 await page.locator('#grcon-repost-search').click();
 await page.waitForFunction(()=>window.GrconRepostingUi.state.results[0]?.state==='ENCONTRADO');
 const selectiveDownload=page.waitForEvent('download');await page.locator('#grcon-download-zip').click();
 const selectiveZip=path.join(out,'repostagem-seletiva.zip');await(await selectiveDownload).saveAs(selectiveZip);
 const zipped=await require('../jszip.min.js').loadAsync(fs.readFileSync(selectiveZip));
 const zipFiles=Object.values(zipped.files).filter(file=>!file.dir);
 assert.deepEqual(zipFiles.map(file=>file.name),['GRDT-100/DOC-002_0.pdf']);
 assert.equal(await zipFiles[0].async('string'),'QA selected pending file');
 const beforePosting=await page.evaluate(()=>window.GrconPostingConferenceUi.state.result.rows.map(row=>row.status));
 await page.locator('#grcon-repost-overlay [data-repost-close]').first().click();
 assert.deepEqual(await page.evaluate(()=>window.GrconPostingConferenceUi.state.result.rows.map(row=>row.status)),beforePosting,'preparação não altera confirmação no SIGEM');
 // Uma base alterada invalida a preparação, antes de copiar/baixar arquivos.
 await firstGroup.locator('[data-repost-pending-group]').click();
 await page.evaluate(()=>{const ui=window.GrconPostingConferenceUi;ui.state.result={...ui.state.result};window.dispatchEvent(new CustomEvent('grcon:conference-updated'));});
 await page.waitForFunction(()=>document.querySelector('#grcon-repost-overlay').hidden);
 assert.equal(await page.evaluate(()=>window.GrconRepostingUi.state.targets.length),0);
 await page.getByRole('button',{name:'Documentos pendentes',exact:true}).click();
 const pendingDownload=page.waitForEvent('download');await page.locator('#pc-export').click();await (await pendingDownload).saveAs(path.join(out,'pendencias.xlsx'));
 assert.ok(await page.evaluate(()=>window.GrconPerformance?.metrics()['export-spreadsheet']), 'exportação agrupada deve usar o Web Worker');
 const pend=XLSX.read(fs.readFileSync(path.join(out,'pendencias.xlsx')),{type:'buffer'});
 assert.deepEqual(pend.SheetNames,['Detalhamento']);
 const detailRows=XLSX.utils.sheet_to_json(pend.Sheets.Detalhamento,{range:9,defval:''});
 assert.equal(detailRows.length,5,'planilha contém somente as pendências');
 assert.ok(!detailRows.some(row=>row.Código==='DOC-001'));
 assert.equal(detailRows.find(row=>row.Código==='DOC-002')['Pendência da GRDT'],'Parte da GRDT pendente');
 assert.match(detailRows.find(row=>row.Código==='DOC-002')['Detalhamento da pendência'],/2 de 3.*1 confirmado/);
 assert.equal(detailRows.find(row=>row.Código==='DOC-004')['Pendência da GRDT'],'GRDT inteira pendente');
 for(let i=1;i<6;i++){
   const entry=detailRows.find(row=>row.Código==='DOC-00'+(i+1));
   assert.ok(entry,'documento presente no arquivo Excel: '+i);
   assert.equal(entry['PROPÓSITO DE EMISSÃO'],i===5?'Não identificado':i%2?'Para Cancelamento':'Para Construção');
 }
 // Auditar também a exportação real da visão por ocorrência/eGRDT.
 await page.evaluate(()=>{const ui=window.GrconPostingConferenceUi;ui.state.view='grdts';ui.render();});
 const eventDownload=page.waitForEvent('download');await page.locator('#pc-export').click();await(await eventDownload).saveAs(path.join(out,'conferencia_por_egrdt.xlsx'));
 const eventsBook=XLSX.read(fs.readFileSync(path.join(out,'conferencia_por_egrdt.xlsx')),{type:'buffer'});
 assert.deepEqual(eventsBook.SheetNames,['Detalhamento']);
 const eventSheet=eventsBook.Sheets.Detalhamento;
 assert.ok(eventSheet,'relatório por eGRDT exportado');
 const eventDetails=XLSX.utils.sheet_to_json(eventSheet,{range:9,defval:''});
 assert.equal(eventDetails.length,5,'exportação da conferência sempre mostra somente pendências');
 for(let i=1;i<6;i++){
   const entry=eventDetails.find(row=>row.Código==='DOC-00'+(i+1));
   assert.equal(entry['PROPÓSITO DE EMISSÃO'],i===5?'Não identificado':i%2?'Para Cancelamento':'Para Construção');
 }
 await page.evaluate(()=>{const ui=window.GrconPostingConferenceUi;ui.state.view='pending';ui.render();});
 await page.locator('#pc-discipline').selectOption('X');assert.equal(await page.locator('.pc-pending-table tbody tr').count(),3);
 await page.locator('#pc-grdt-classification').selectOption('PARCIALMENTE_CONFIRMADA');assert.equal(await page.locator('.pc-pending-table tbody tr').count(),2);
 await page.locator('#pc-document-list').fill('DOC-002');
 await page.waitForFunction(()=>document.querySelectorAll('.pc-pending-table tbody tr').length===1);
 assert.match(await page.locator('.pc-pending-table').textContent(),/Parte da GRDT pendente/);
 assert.match(await page.locator('.pc-pending-table').textContent(),/2 de 3/);
 const filteredDownload=page.waitForEvent('download');await page.locator('#pc-export').click();await(await filteredDownload).saveAs(path.join(out,'pendencias-filtradas.xlsx'));
 const filteredBook=XLSX.read(fs.readFileSync(path.join(out,'pendencias-filtradas.xlsx')),{type:'buffer'});
 assert.deepEqual(filteredBook.SheetNames,['Detalhamento']);
 const filteredDetails=XLSX.utils.sheet_to_json(filteredBook.Sheets.Detalhamento,{range:9,defval:''});
 assert.equal(filteredDetails.length,1);
 assert.match(filteredDetails[0]['Detalhamento da pendência'],/2 de 3/);
 await page.locator('#pc-document-list').fill('');
 await page.locator('#pc-grdt-classification').selectOption('');
 await page.locator('#pc-reference-date').fill('2026-10-02');await page.locator('#pc-save-date').click();await page.waitForFunction(()=>window.GrconSharedSigemQuery.current()?.meta.referenceDate==='2026-10-02');assert.equal(await page.evaluate(()=>window.qaDateCalls),1);
 await page.locator('#pc-table-wrap').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(out,'pendencias-1366.png')});
 // Colar 5 mil códigos em uma conferência com 5 mil documentos mantém o navegador responsivo.
 await page.locator('#pc-document-list').waitFor({state:'visible'});
 await page.evaluate(()=>{
   const ui=window.GrconPostingConferenceUi,C=window.GrconPostingConference;
   window.qaConferenceSaved={result:ui.state.result,view:ui.state.view,filters:{...ui.state.filters}};
   const files=Array.from({length:5000},(_,i)=>({document:'VOLUME-'+String(i).padStart(5,'0'),revision:'0',discipline:'X'}));
   ui.state.result=C.reconcile([{id:'qa-volume',egrdtNumber:'GRDT-VOLUME',generatedAt:'2026-10-01T12:00:00Z',files}],ui.state.base.records,null,{now:'2026-10-08T12:00:00Z',baseReferenceDate:'2026-10-08'});
   Object.keys(ui.state.filters).forEach(key=>ui.state.filters[key]='');ui.state.view='documents';ui.state.page=1;ui.render();
   window.qaLargestGap=0;let last=performance.now();window.qaTick=setInterval(()=>{const now=performance.now();window.qaLargestGap=Math.max(window.qaLargestGap,now-last);last=now;},10);
   const input=document.querySelector('#pc-document-list');
   input.addEventListener('input',()=>{
     window.qaPasteStarted=performance.now();
     const observer=new MutationObserver(()=>{window.qaFilterRenderAt=performance.now();observer.disconnect();});
     observer.observe(document.querySelector('#pc-table-wrap'),{childList:true});
   },{once:true});
 });
 await page.locator('#pc-document-list').scrollIntoViewIfNeeded();
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await page.locator('#pc-document-list').click();
 await page.evaluate(text=>navigator.clipboard.writeText(text),Array.from({length:5000},(_,i)=>'VOLUME-'+String(i).padStart(5,'0')).join('\n'));
 await page.keyboard.press('Control+V');
 await page.waitForFunction(()=>window.qaFilterRenderAt>window.qaPasteStarted);
 const listPerformance=await page.evaluate(async()=>{
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   clearInterval(window.qaTick);
   return {codes:5000,documents:5000,filterMs:window.qaFilterRenderAt-window.qaPasteStarted,maxEventLoopGapMs:window.qaLargestGap};
 });
 assert.ok(listPerformance.filterMs<2000,JSON.stringify(listPerformance));
 assert.ok(listPerformance.maxEventLoopGapMs<1000,JSON.stringify(listPerformance));
 assert.match(await page.locator('#pc-result-count').textContent(),/5.000/);
 assert.equal(await page.locator('.pc-document-table tbody tr').count(),80,'lista grande continua paginada');
 await page.locator('#pc-document-list').fill('VOLUME-00001;VOLUME-00002');
 await page.waitForFunction(()=>document.querySelectorAll('.pc-document-table tbody tr').length===2);
 await page.locator('#pc-clear-filters').click();
 assert.equal(await page.locator('.pc-document-table tbody tr').count(),80);
 await page.evaluate(()=>{const ui=window.GrconPostingConferenceUi,saved=window.qaConferenceSaved;ui.state.result=saved.result;ui.state.view=saved.view;ui.state.filters=saved.filters;document.querySelector('#pc-document-list').value=saved.filters.documentList;ui.render();});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,metrics,cofreExport:52,pendingDocuments:5,uniqueGrdts:3,filteredPendingDocuments:1,listPerformance,errors},null,2));
 console.log('Chromium document workflows passed: '+JSON.stringify(metrics));
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
