'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const XLSX = require('../xlsx.full.min.js');
const output = path.join(process.cwd(), 'artifacts/unified-posting');
fs.mkdirSync(path.join(output,'bundle'),{recursive:true});
const docs=Array.from({length:60},(_,i)=>`RL-5290.00-22313-91B-C1O-${String(i+1).padStart(3,'0')}`);
const book=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
 ['DOCUMENTO','REVISÃO','TÍTULO','FORMATO','DISCIPLINA','TIPO DE DOCUMENTO','PROPÓSITO','CONFIRMAÇÃO DE ALOCAÇÃO','CAMINHO DATABOOK','GRDT','DATA EFETIVA DE EMISSÃO'],
 ...docs.map((doc,i)=>[doc,'0','QA '+i,'A4','DINÂMICOS','RL','Para Construção','ALOCADO','R:\\DB','',''])
]),'N-1710');
XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['DOCUMENTO','REVISÃO','STATUS SIGEM'],...docs.map(doc=>[doc,'0','Não Postado'])]),'Colar SIGEM');
const ld=path.join(output,'LD_QA.xlsx');fs.writeFileSync(ld,XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
const centralBook=XLSX.utils.book_new();
const centralRows=docs.map((doc,i)=>[doc,`QA-ALOC-${i+1}`,i%2?'FISCAL 01 - AGUARDANDO RETORNO':'CONCLUÍDA',i%2?'Sim':'Não']);
centralRows.push([docs[0],'QA-ALOC-SECOND','ALOCAÇÃO PARA ATUALIZAÇÃO','Sim']);
XLSX.utils.book_append_sheet(centralBook,XLSX.utils.aoa_to_sheet([['NomeDocumento','ALOCAÇÃO','STATUS DA ALOCAÇÃO','Workflow'],...centralRows]),'Central de alocação');
const centralFile=path.join(output,'Controle_QA.xlsx');fs.writeFileSync(centralFile,XLSX.write(centralBook,{type:'buffer',bookType:'xlsx'}));
docs.forEach(doc=>fs.writeFileSync(path.join(output,'bundle',doc+'_0001_0.pdf'),'%PDF-1.4\n%%EOF'));
const fixture=docs.slice(0,40).map((doc,i)=>({id:'qa-'+i,clientRecordId:'qa-'+i,workspaceId:'qa',egrdtNumber:'QA-GRDT-'+i,generatedAt:'2026-10-01T12:00:00Z',files:[{document:doc,revision:i<20?'0':'A',grdtRevision:i<20?'0':'A'}]}));
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox'],...(process.env.GRCON_CHROMIUM?{executablePath:process.env.GRCON_CHROMIUM}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(process.env.GRCON_PREVIEW_URL||'http://127.0.0.1:8765');
  await page.waitForFunction(()=>window.GrconTriageUiApi&&window.GrconPostingFlow);
  await page.addStyleTag({content:'#grcon-cloud-auth{display:none!important}html.grcon-cloud-pending body>:not(script){visibility:visible!important}'});
  await page.evaluate(records=>{
   window.__qaHistory=records;window.__qaCalls=0;
   const planned={id:'qa-planned',keys:new Set(records.map(r=>r.files[0].document)),count:60,fileName:'Previstos-QA.xlsx',updatedAt:'2026-10-01'};
   // All 60 planned documents are supplied separately from the 40 history occurrences.
   for(let i=1;i<=60;i++)planned.keys.add(`RL-5290.00-22313-91B-C1O-${String(i).padStart(3,'0')}`);
   window.__qaCentral={rows:[],pending:[],meta:null,pages:0};
   window.GrconCloud={state:{membership:{workspace_id:'qa',role:'owner'},session:{user:{id:'qa-user'}},online:true,plannedSnapshot:planned,
    client:{rpc:async(name,args)=>{
     const c=window.__qaCentral;
     if(name.endsWith('_current'))return {data:c.meta?[c.meta]:[]};
     if(name.endsWith('_begin')){c.pending=[];c.fileName=args.source_file;c.expected=args.expected_count;return {data:'qa-central-1'};}
     if(name.endsWith('_chunk')){args.rows.forEach((row,i)=>{c.pending[args.first_row-1+i]=row;});return {data:c.pending.length};}
     if(name.endsWith('_publish')){if(c.pending.length!==c.expected)throw new Error('partial fixture');c.rows=c.pending;c.meta={snapshot_id:'qa-central-1',file_name:c.fileName,record_count:c.rows.length,published_at:'2026-10-01T12:00:00Z'};return {data:'qa-central-1'};}
     if(name.endsWith('_page')){c.pages++;return {data:c.rows.slice(args.after_row,args.after_row+10).map((payload,i)=>({row_number:args.after_row+i+1,payload}))};}
     throw new Error('unexpected RPC '+name);
    }}},loadPlannedDocuments:async()=>planned,loadClassificationHistory:async()=>{window.__qaCalls++;return window.__qaHistory;}};
  },fixture);
  await page.evaluate(()=>window.GrconAllocationRegistry.refresh());
  await page.locator('#advanced-toggle').click();
  await page.locator('#allocation-registry-file').setInputFiles(centralFile);
  await page.waitForFunction(()=>!document.getElementById('allocation-registry-publish').disabled);
  assert.match(await page.locator('#allocation-registry-preview').innerText(),/61 vínculos reconhecidos/);
  await page.locator('#allocation-registry-publish').click();
  await page.waitForFunction(()=>window.GrconAllocationRegistry.current()?.id==='qa-central-1');
  assert.equal(await page.evaluate(()=>window.__qaCentral.pages),7,'short server pages must not truncate the Central');
  await page.locator('#advanced-toggle').click();
  await page.locator('#ld-input').setInputFiles(ld);
  await page.locator('#pdf-input').setInputFiles(path.join(output,'bundle'));
  await page.locator('#analyze').click();
  await page.waitForFunction(()=>document.getElementById('ld-compatibility-drawer').getAttribute('aria-hidden')==='false'||window.GrconTriageUiApi.snapshot().total===60);
  if(await page.locator('#ld-compatibility-drawer').getAttribute('aria-hidden')==='false'){
   await page.locator('#ld-compatibility-confirm').click();await page.locator('#analyze').click();
  }
  await page.waitForFunction(()=>window.GrconTriageUiApi.snapshot().total===60&&!window.GrconPerformanceDiagnostics.state().busy,null,{timeout:45000});
  await page.evaluate(async()=>{await window.GrconPostingFlow.refresh(true);window.GrconEgrdtBatchPlan.setMode('limit-only');window.GrconEgrdtBatchPlan.setLimit(48);});
  console.log('QA: análise concluída');
  await page.waitForFunction(()=>document.getElementById('posting-history-source').textContent.includes('completo'));
  const trace=await page.evaluate(()=>window.GrconAllocationRegistry.resolve('RL-5290.00-22313-91B-C1O-001'));
  assert.equal(trace.kind,'allocated');assert.equal(trace.references.length,2);
  assert.ok(await page.evaluate(()=>Array.from({length:60},(_,i)=>window.GrconTriageUiApi.getResult(i)).every(row=>row.record.sharedAllocationContext.centralSnapshotId==='qa-central-1')));
  const categories=await page.evaluate(()=>Array.from({length:60},(_,i)=>{const row=window.GrconTriageUiApi.getResult(i);return window.GrconPostingFlow.lookup(row.document,row.revision).emissionKind;}));
  assert.equal(categories.filter(k=>k==='REPOST').length,20);assert.equal(categories.filter(k=>k==='NEW_REVISION').length,20);assert.equal(categories.filter(k=>k==='FIRST_POSTING').length,20);
  const mixed=await page.evaluate(()=>window.GrconEgrdtBatchPlan.preview('all'));
  assert.equal(mixed.valid,true,mixed.errors.join('\n'));assert.deepEqual(mixed.groups.map(g=>g.itemCount),[48,12]);
  await page.locator('#posting-batch-mode').selectOption('separate');
  const separate=await page.evaluate(()=>window.GrconEgrdtBatchPlan.preview('all'));
  assert.deepEqual(separate.groups.map(g=>g.itemCount).sort((a,b)=>a-b),[20,40]);
  assert.ok(separate.groups.every(g=>g.postingGroup!=='MIXED'));
  const beforeCalls=await page.evaluate(()=>window.__qaCalls);
  await page.locator('[data-posting-filter="reposts"]').click();
  assert.equal(await page.evaluate(()=>window.GrconTriageUiApi.snapshot().filtered),20);
  await page.locator('[data-posting-filter="postings"]').click();
  assert.equal(await page.evaluate(()=>window.GrconTriageUiApi.snapshot().filtered),40);
  await page.locator('[data-posting-filter="all"]').click();
  assert.equal(await page.evaluate(()=>window.__qaCalls),beforeCalls,'filtering must not refetch history');
  await page.locator('.posting-history-detail').first().locator('summary').click();
  assert.ok((await page.locator('.posting-history-detail[open]').first().innerText()).includes('QA-GRDT'));
  const record=await page.evaluate(async()=>{
   await window.GRCONModuleLoader.ensure('export');
   const rows=Array.from({length:60},(_,i)=>window.GrconTriageUiApi.getResult(i));
   const plan=window.GrconEmission.createPlan(rows,new Set(rows.map((_,i)=>i)));
   const groups=window.GrconPostingFlow.splitPlan(plan,48,'limit-only');
   const group=groups.find(g=>g.postingGroup==='REPOST');
   const bytes=await window.GrdtWorkbook.build(group.items);const verification=await window.GrdtWorkbook.verify(bytes,group.items);
   const rec=window.GrconHistory.recordFromGenerated({fileName:'QA-posting.xls',group,verification},rows,{outputType:'eGRDT final'});
   const clean=window.GrconHistory.cleanRecord(JSON.parse(JSON.stringify(rec)));
   return {valid:verification.valid,files:clean.files,mode:clean.postingMode};
  });
  assert.equal(record.valid,true);assert.equal(record.mode,'separate');assert.ok(record.files.every(f=>f.historyClassification.emissionKind==='REPOST'));assert.ok(record.files.every(f=>f.sharedAllocationContext.centralSnapshotId==='qa-central-1'));
  for(const width of [1440,1366,1024]){
   await page.setViewportSize({width,height:1000});await page.locator('#posting-history-summary').scrollIntoViewIfNeeded();
   assert.ok(await page.locator('#posting-history-summary').evaluate(el=>el.scrollWidth-el.clientWidth)<=2);
   await page.screenshot({path:path.join(output,`posting-${width}.png`),fullPage:true});
  }
  await page.evaluate(()=>{document.documentElement.dataset.theme='dark';document.body.classList.add('p2-dark');});
  await page.screenshot({path:path.join(output,'posting-dark.png'),fullPage:true});
  const vaultFilter=await page.evaluate(()=>{const planned={id:'qa-vault-planned',keys:new Set(window.__qaHistory.map(r=>r.files[0].document))};const documents=Array.from({length:60},(_,i)=>({document:`RL-5290.00-22313-91B-C1O-${String(i+1).padStart(3,'0')}`}));return ['allocated','not_allocated','unconfirmed'].map(mode=>window.GrconDocumentAllocationContext.filter(documents,mode,planned,window.GrconAllocationRegistry.current()).length);});
  assert.deepEqual(vaultFilter,[40,20,0]);
  await page.evaluate(async()=>{window.GrconCloud.loadClassificationHistory=async()=>{throw new Error('offline fixture');};await window.GrconPostingFlow.refresh(true);window.GrconTriageUiApi.render();});
  const offline=await page.evaluate(()=>{const row=window.GrconTriageUiApi.getResult(0);return window.GrconPostingFlow.lookup(row.document,row.revision);});
  assert.equal(offline.classificationStatus,'UNCONFIRMED');
  await page.locator('[data-posting-filter="unconfirmed"]').click();assert.equal(await page.evaluate(()=>window.GrconTriageUiApi.snapshot().filtered),60);
  await page.reload();await page.waitForFunction(()=>window.GrconPostingFlow);assert.equal(await page.evaluate(()=>window.GrconPostingFlow.getMode()),'separate');
  const meaningful=errors.filter(e=>!/supabase|Failed to fetch|ERR_|storage.*initialize/i.test(e));assert.deepEqual(meaningful,[]);
  fs.writeFileSync(path.join(output,'metrics.json'),JSON.stringify({passed:true,mixed:mixed.groups.map(g=>g.itemCount),separate:separate.groups.map(g=>g.itemCount),categories:categories.reduce((n,k)=>(n[k]=(n[k]||0)+1,n),{}),historyRoundtrip:true,centralPublished:true,centralShortPages:true,vaultAllocationFilter:vaultFilter,offline:true,preference:true,widths:[1440,1366,1024],errors},null,2));
  console.log('Unified posting browser: central publication/short pages/allocation filters/analysis/classification/batch/BIFF8/history/offline/preference passed.');
 }catch(e){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});console.error(await page.evaluate(()=>({summary:document.getElementById('posting-history-summary')?.innerText,ui:window.GrconTriageUiApi?.snapshot(),body:document.body.innerText.slice(-1600)})));throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
