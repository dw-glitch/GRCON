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
   window.GrconCloud={state:{membership:{workspace_id:'qa'}},loadPlannedDocuments:async()=>null,loadClassificationHistory:async()=>{window.__qaCalls++;return window.__qaHistory;}};
  },fixture);
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
  assert.equal(record.valid,true);assert.equal(record.mode,'separate');assert.ok(record.files.every(f=>f.historyClassification.emissionKind==='REPOST'));
  for(const width of [1440,1366,1024]){
   await page.setViewportSize({width,height:1000});await page.locator('#posting-history-summary').scrollIntoViewIfNeeded();
   assert.ok(await page.locator('#posting-history-summary').evaluate(el=>el.scrollWidth-el.clientWidth)<=2);
   await page.screenshot({path:path.join(output,`posting-${width}.png`),fullPage:true});
  }
  await page.evaluate(()=>{document.documentElement.dataset.theme='dark';document.body.classList.add('p2-dark');});
  await page.screenshot({path:path.join(output,'posting-dark.png'),fullPage:true});
  await page.evaluate(async()=>{window.GrconCloud.loadClassificationHistory=async()=>{throw new Error('offline fixture');};await window.GrconPostingFlow.refresh(true);window.GrconTriageUiApi.render();});
  const offline=await page.evaluate(()=>{const row=window.GrconTriageUiApi.getResult(0);return window.GrconPostingFlow.lookup(row.document,row.revision);});
  assert.equal(offline.classificationStatus,'UNCONFIRMED');
  await page.locator('[data-posting-filter="unconfirmed"]').click();assert.equal(await page.evaluate(()=>window.GrconTriageUiApi.snapshot().filtered),60);
  await page.reload();await page.waitForFunction(()=>window.GrconPostingFlow);assert.equal(await page.evaluate(()=>window.GrconPostingFlow.getMode()),'separate');
  const meaningful=errors.filter(e=>!/supabase|Failed to fetch|ERR_|storage.*initialize/i.test(e));assert.deepEqual(meaningful,[]);
  fs.writeFileSync(path.join(output,'metrics.json'),JSON.stringify({passed:true,mixed:mixed.groups.map(g=>g.itemCount),separate:separate.groups.map(g=>g.itemCount),categories:categories.reduce((n,k)=>(n[k]=(n[k]||0)+1,n),{}),historyRoundtrip:true,offline:true,preference:true,widths:[1440,1366,1024],errors},null,2));
  console.log('Unified posting browser: analysis/classification/filter/batch/BIFF8/history/offline/preference passed.');
 }catch(e){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});console.error(await page.evaluate(()=>({summary:document.getElementById('posting-history-summary')?.innerText,ui:window.GrconTriageUiApi?.snapshot(),body:document.body.innerText.slice(-1600)})));throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
