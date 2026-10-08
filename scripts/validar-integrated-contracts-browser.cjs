'use strict';
const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');const {chromium}=require('playwright');
const base=process.env.GRCON_PREVIEW_URL || 'http://127.0.0.1:8778';
const out=path.join(process.cwd(),'artifacts/integrated-contracts');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',acceptDownloads:true});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://kvyrttccwzdhasplfxnr.supabase.co/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{"message":"QA no session"}'}));
 const code='RL-5290.00-22313-856-C1O-017';
 const vaultFile={id:'qa-file',sequence:77,document_code:code,revision:'0',file_name:code+'.docx',format:'docx',size_bytes:16,sha256:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',created_at:'2026-10-07T12:00:00Z',verified_at:'2026-10-07T12:01:00Z',allocated:true,status:'ready'};
 let vaultDeleted=false;
 await page.route('**/api/document-vault/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  let data={ok:true};
  if(url.pathname.endsWith('/health'))data={ok:true,supabaseConfigured:true,r2Configured:true};
  else if(url.pathname.endsWith('/lookup')){const items=request.postDataJSON().items;data={results:items.map(item=>({requestId:item.requestId,documentCode:item.documentCode,matches:item.documentCode===code&&!vaultDeleted?[vaultFile]:[]}))};}
  else if(url.pathname.endsWith('/download'))return route.fulfill({status:200,contentType:'application/octet-stream',body:Buffer.from('documento QA')});
  else if(url.pathname.endsWith('/list'))data={files:vaultDeleted?[]:[vaultFile],has_more:false};
  else if(url.pathname.endsWith('/delete'))vaultDeleted=true;
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(base,{waitUntil:'networkidle'});
 await page.addStyleTag({content:'html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script){visibility:visible!important}#grcon-cloud-auth{display:none!important}'});
 await page.waitForFunction(()=>window.GrconDocumentVault && window.GrconSigemStatusMonitoring && window.GrconEgrdtEmailReplyUi);
 await page.evaluate(()=>{
  const rows=Array.from({length:2201},(_,i)=>({change_id:'c'+i,document_code:'DOC-'+String(i).padStart(5,'0'),revision:'0',title:'Documento QA '+i,discipline:'Elétrica',previous_status:'Em análise',current_status:'Emitido',change_type:'SAIU_DE_ANALISE',monitored:i<3,created_at:'2026-10-06T12:00:00Z'}));
  const contract={contract_id:'qa-contract',workspace_id:'qa-workspace',code:'UHDT-D',name:'Unidade de Hidrotratamento',display_name:'CONSAG / RNEST / UHDT-D',role:'owner',active:true,settings:{inheritLegacyRules:true}};
  const fixture={grcon_sigem_query_versions:[{snapshot_id:'s2',version:2,file_name:'Atual.xlsx'},{snapshot_id:'s1',version:1,file_name:'Anterior.xlsx'}],grcon_sigem_comparison_history:[{comparison_id:'comparison',previous_snapshot_id:'s1',current_snapshot_id:'s2',automatic:true,compared_at:'2026-10-06T12:00:00Z',previous_file:'Anterior.xlsx',current_file:'Atual.xlsx',counts:{documentsCompared:25000,changes:2201,statusChanges:2201,leftAnalysis:2201,monitoredChanged:3}}],grcon_monitored_documents_list:[{id:'m1',document_code:'DOC-00000',priority:'alta',active:true,note:'QA',current_status:'Emitido',last_status:'Em análise',last_change:'2026-10-06T12:00:00Z',last_snapshot:'2026-10-06T12:00:00Z'}],grcon_notifications_list:[{id:'n1',title:'Documento prioritário saiu de análise',message:'Encerrou o fluxo monitorado',document_code:'DOC-00000',previous_status:'Em análise',current_status:'Emitido',is_read:false,created_at:'2026-10-06T12:00:00Z'}],grcon_notifications_unread_count:1};
  window.qaCalls=[];
  window.GrconCloud={state:{contract,contracts:[contract],membership:{workspace_id:contract.workspace_id,contract_id:contract.contract_id,contract_code:contract.code,role:'owner'},session:{access_token:'qa'},online:true,client:{rpc(name,args){window.qaCalls.push({name,args});const result=name==='grcon_sigem_comparison_changes'?rows:fixture[name]||[];return {then(resolve){resolve({data:result,error:null})},range(start,end){return Promise.resolve({data:result.slice(start,end+1),error:null})}}},functions:{invoke:async(name,{body})=>({data:{ok:true,contract:{code:'UHDT-D'},users:[{id:'qa-user',name:'Operador QA',email:'qa@example.test',role:'operator',active:true}]},error:null})}}},canManageMembers:()=>true,emailTemplateGet:async()=>({scope:'contract',version:1,configuration:{columns:['DOCUMENTO','REVISÃO'],styles:{fontFamily:'Arial',fontSize:12},messageTemplate:'Envio {{egrdt}}'}}),emailTemplateVersions:async()=>[{template_id:'t1',scope:'contract',version:1,configuration:{},active:true}],emailTemplateSave:async(scope,cfg)=>{window.qaSavedTemplate={scope,cfg}},emailTemplateRestore:async()=>true};
  window.dispatchEvent(new CustomEvent('grcon:cloud-ready'));
 });
 await page.evaluate(()=>window.GRCONModuleLoader.ensureModule('requests'));
 await page.locator('[data-grcon-view="requests"]').first().click();
 await page.locator('[data-requests-area="sigem-monitoring"]').click();
 await page.waitForFunction(()=>document.querySelector('#sigem-monitor-page')?.textContent.includes('2201'));
 assert.equal(await page.locator('label:has(#sigem-monitor-search) > span').textContent(),'Buscar nas alterações');
 assert.equal(await page.locator('label:has(#sigem-monitor-type) > span').textContent(),'Tipo de alteração');
 assert.equal(await page.locator('label:has(#sigem-monitor-code) > span').first().textContent(),'Código do documento');
 assert.equal(await page.locator('label:has(#sigem-monitor-priority) > span').first().textContent(),'Prioridade');
 assert.match(await page.locator('label:has(#sigem-monitor-note) > span').first().textContent(),/Observação/);
 assert.equal(await page.locator('#sigem-monitor-help').getAttribute('open'),null);
 await page.locator('#sigem-monitor-help > summary').click();
 assert.notEqual(await page.locator('#sigem-monitor-help').getAttribute('open'),null);
 assert.match(await page.locator('#sigem-monitor-help').textContent(),/Monitore[\s\S]*GRCON acompanha[\s\S]*Receba a notificação/);
 assert.equal(await page.locator('#requests-module').isVisible(),true);
 assert.equal(await page.locator('#sigem-monitor-change-body tr').count(),100);
 assert.equal(await page.locator('#grcon-notification-count').textContent(),'1');
 await page.locator('#sigem-monitor-next-page').click();assert.match(await page.locator('#sigem-monitor-change-body').textContent(),/DOC-00100/);
 await page.locator('#sigem-monitor-only-monitored').check();assert.equal(await page.locator('#sigem-monitor-change-body tr').count(),3);
 const downloadPromise=page.waitForEvent('download');await page.locator('#sigem-monitor-export').click();const download=await downloadPromise;const exportPath=path.join(out,'filtered.xlsx');await download.saveAs(exportPath);
 const XLSX=require('../xlsx.full.min.js');const workbook=XLSX.read(fs.readFileSync(exportPath),{type:'buffer'});const exported=XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);assert.equal(exported.length,3);assert.equal(exported[0].CONTRATO,'UHDT-D');assert.equal(exported[0]['CONSULTA ANTERIOR'],'Anterior.xlsx');
 await page.locator('[data-monitor-history]').first().click();await page.locator('#sigem-monitor-document-history').waitFor({state:'visible'});await page.locator('#sigem-monitor-document-history button').click();await page.locator('#sigem-monitor-document-history').waitFor({state:'hidden'});
 await page.screenshot({path:path.join(out,'monitoring.png')});
 await page.locator('#grcon-administration').click();await page.waitForFunction(()=>document.querySelector('#grcon-admin-users')?.textContent.includes('Operador QA'));assert.match(await page.locator('#grcon-admin-users').textContent(),/UHDT-D/);await page.locator('#grcon-admin-close').click();
 await page.evaluate(()=>window.GrconEgrdtEmailReplyUi.open([{egrdtNumber:'QA-001',generatedAt:'2026-10-06T12:00:00Z',files:[{document:'DOC-001',revision:'A',title:'QA',finalName:'DOC-001_A.pdf'}]}]));
 await page.waitForFunction(()=>document.querySelector('#egrdt-email-model-status')?.textContent.includes('versão 1'));
 assert.equal(await page.locator('#egrdt-email-message').inputValue(),'Envio QA-001');assert.equal(await page.locator('#egrdt-email-preview th').count(),2);
 await page.locator('[data-egrdt-email-action="edit-model"]').click();await page.locator('[data-model-style="fontSize"]').fill('14');await page.locator('[data-egrdt-email-action="save-model"]').click();await page.waitForFunction(()=>window.qaSavedTemplate?.cfg.styles.fontSize===14);assert.equal(await page.evaluate(()=>window.qaSavedTemplate.scope),'contract');
 await page.screenshot({path:path.join(out,'email-editor.png')});await page.locator('[data-egrdt-email-action="close"]').click();
 await page.locator('[data-grcon-view="control"]').first().click();
 assert.equal(await page.locator('input[name="grdt-document-source"]').count(),0,'a escolha manual Base documental foi removida');
 assert.equal(await page.locator('#grcon-control-help').count(),0,'ajuda expansível removida');
 assert.equal(await page.locator('#missing-documents').count(),1,'lista de ausentes preservada');
 assert.equal(await page.locator('#grdt-module').isVisible(),true);
 await page.locator('#relation-start').click();
 await page.locator('#relation-text').fill(code+'\nRL-5290.00-22313-856-C1O-018');
 await page.locator('#relation-apply').click();
 assert.match(await page.locator('#list-meta').textContent(),/2 item\(ns\) por texto/);
 const ldBook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(ldBook,XLSX.utils.aoa_to_sheet([
  ['DOCUMENTO','REVISÃO','TÍTULO','GRDT','DATA EFETIVA DE EMISSÃO','FORMATO','DISCIPLINA','TIPO DE DOCUMENTO','PROPÓSITO','CAMINHO DATABOOK','ALOCADO'],
  [code,'0','RELATÓRIO QA','','','A4','CIVIL','RL','Para Construção','Databook','ALOCADO']
 ]),'N-1710');XLSX.utils.book_append_sheet(ldBook,XLSX.utils.aoa_to_sheet([['DOCUMENTO','REVISÃO','STATUS'],[code,'0','Não Postado']]),'Colar SIGEM');const ldPath=path.join(out,'LD_QA.xlsx');fs.writeFileSync(ldPath,XLSX.write(ldBook,{type:'buffer',bookType:'xlsx'}));
 await page.evaluate(()=>{window.GrconCloud.loadPlannedDocuments=async()=>null;window.GrconCloud.reserveEgrdtSequences=async(year,count)=>Array.from({length:count},(_,i)=>({sequence:9000+i,year,baseName:`0130870-C1O-PGV-G-${9000+i}-${year} - eGRDT`}));window.GrconCloud.completeEgrdtReservationRequest=()=>{};});
 await page.locator('#ld-input').setInputFiles(ldPath);await page.locator('#analyze').click();
 try { await page.waitForFunction(()=>window.GrconTriageUiApi?.getResult(0)&&!document.querySelector('#analyze').disabled); }
 catch(error){await page.screenshot({path:path.join(out,'analysis-failure.png'),fullPage:true});console.error(await page.locator('#toast').textContent(),errors);throw error;}
 const analyzed=await page.evaluate(()=>{const r=window.GrconTriageUiApi.getResult(0);const first=(r.files||[])[0];return {document:r.document,revision:r.revision,files:(r.files||[]).map(f=>f.name),source:first?.file?window.GrconDocumentVault.lookupSource(first.file):null}});assert.equal(analyzed.document,code);assert.equal(analyzed.revision,'0');assert.deepEqual(analyzed.files,[code+'.docx']);assert.equal(analyzed.source?.id,'qa-file');
 // Identical name/size/timestamp do not turn a local file into a Cofre file.
 assert.equal(await page.evaluate(()=>{
  const file=window.GrconTriageUiApi.getResult(0).files[0].file;
  window.__provenanceFile=file;
  const local=new File([file],file.name,{lastModified:file.lastModified,type:file.type});
  return window.GrconDocumentVault.lookupSource(local);
 }),null);
 assert.equal(await page.evaluate(()=>{
  const file=window.GrconTriageUiApi.getResult(0).files[0].file;
  const source=window.GrconDocumentVault.lookupSource(file);source.sequence=999;
  return window.GrconDocumentVault.lookupSource(file).sequence;
 }),77,'consulta da origem não altera o metadado registrado');
 assert.match(await page.locator('#pdf-meta').textContent(),/1 recuperado\(s\) do Cofre/);
 await page.locator('#missing-documents').waitFor({state:'visible'});assert.match(await page.locator('#missing-documents').textContent(),/RL-5290\.00-22313-856-C1O-018/);
 await page.screenshot({path:path.join(out,'cofre-central.png')});
 await page.locator('#select-row-0').check();const grdtDownloadPromise=page.waitForEvent('download');await page.locator('#export-egrdt').click();await page.locator('#p1-sequence-confirm').check();await page.locator('#p1-confirm-ok').click();const generated=await grdtDownloadPromise;await generated.saveAs(path.join(out,'cofre-generated.xls'));
 await page.waitForFunction(()=>window.GrconHistory.read().some(r=>r.files?.some(f=>f.vaultFileId==='qa-file')));
 const provenance=await page.evaluate(()=>window.GrconHistory.read().flatMap(r=>r.files||[]).find(f=>f.vaultFileId==='qa-file')?.fileProvenance||null);
 assert.deepEqual(provenance,{source:'cofre',fileName:code+'.docx',revision:'0',format:'docx',sizeBytes:16,vaultFileId:'qa-file',catalogSequence:77,fileVersion:1,sha256:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',createdAt:'2026-10-07T12:00:00Z',verifiedAt:'2026-10-07T12:01:00Z'});
 await page.evaluate(()=>window.GRCONModuleLoader.ensureModule('history'));
 await page.locator('[data-grcon-view="history"]').first().click();
 const historyId=await page.evaluate(()=>window.GrconHistory.read().find(r=>r.files?.some(f=>f.vaultFileId==='qa-file')).id);
 await page.waitForFunction(id=>Array.from(document.querySelectorAll('#history-list [data-history-id]')).some(el=>el.dataset.historyId===id),historyId);
 await page.evaluate(id=>Array.from(document.querySelectorAll('#history-list [data-history-id]')).find(el=>el.dataset.historyId===id).click(),historyId);
 await page.getByText('Origem: Cofre',{exact:true}).click();
 assert.match(await page.locator('#history-detail').innerText(),/Sequência: 77/);
 assert.match(await page.locator('#history-detail').innerText(),new RegExp(provenance.sha256));
 await page.screenshot({path:path.join(out,'cofre-generated.png')});
 await page.evaluate(()=>window.GrconDocumentVault.open());
 await page.locator('[data-vault-delete="qa-file"]').waitFor({state:'visible'});
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('[data-vault-delete="qa-file"]').click();
 await page.waitForFunction(()=>!window.GrconDocumentVault.state.files.some(file=>file.id==='qa-file'));
 assert.equal(await page.evaluate(()=>window.GrconDocumentVault.lookupSource(window.__provenanceFile)?.id),'qa-file','arquivo já recuperado mantém a origem após exclusão do catálogo');
 assert.deepEqual(await page.evaluate(()=>window.GrconHistory.read().flatMap(r=>r.files||[]).find(f=>f.vaultFileId==='qa-file')?.fileProvenance),provenance,'histórico mantém a versão original após exclusão do catálogo');

 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,rowsLoaded:2201,pageSize:100,filteredExport:3,emailTemplateSaved:true,cofreFilesPrepared:1,cofreGrdtGenerated:true,errors},null,2));console.log('Chromium integrated: 2201 changes/100-page, filtered XLSX, history, unread badge, admin, email editor and Cofre → DOCX/revision 0 analysis → GRDT/history passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
