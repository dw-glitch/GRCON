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
 ...docs.map((doc,i)=>[doc,'0','QA '+i,'A4',i%2?'CIVIL':'DINÂMICOS','RL','Para Construção','ALOCADO','R:\\DB','',''])
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
    }}},loadPlannedDocuments:async()=>{window.__qaPlannedCalls=(window.__qaPlannedCalls||0)+1;await new Promise(resolve=>setTimeout(resolve,600));return planned;},loadClassificationHistory:async()=>{window.__qaCalls++;return window.__qaHistory;}};
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
  if(!process.env.GRCON_QA_BASELINE)await page.waitForFunction(()=>window.GrconMascot?.diagnostics().ready);
  await page.evaluate(()=>{document.documentElement.classList.remove('grcon-cloud-pending');window.dispatchEvent(new CustomEvent('grcon:cloud-ready'));});
  await page.evaluate(()=>{window.__qaClickAt=performance.now();new MutationObserver(()=>{if(document.getElementById('analyze').disabled&&window.__qaFeedback===undefined)window.__qaFeedback=performance.now()-window.__qaClickAt;}).observe(document.getElementById('analyze'),{attributes:true,attributeFilter:['disabled']});});
  await page.locator('#analyze').click();
  let runner=null;
  if(!process.env.GRCON_QA_BASELINE){
  assert.equal(await page.locator('#analyze').isDisabled(),true,'button must react before remote preparation');
  await page.waitForFunction(()=>window.GrconMascotRunner?.diagnostics().active&&window.GrconMascotRunner.diagnostics().source.includes('papers-running'));
  runner=await page.evaluate(async()=>{
   const video=document.querySelector('.grcon-mascot-runner-video');
   if(video.readyState<2)await new Promise(resolve=>video.addEventListener('loadeddata',resolve,{once:true}));
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=320;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,0,0,320,320);
   const pixels=ctx.getImageData(0,0,320,320).data;
   const cornerAlpha=[pixels[3],pixels[(319*4)+3],pixels[((319*320)*4)+3],pixels[((320*320-1)*4)+3]];
   return {...window.GrconMascotRunner.diagnostics(),cornerAlpha,playedSource:video.currentSrc,width:video.videoWidth,height:video.videoHeight};
  });
  assert.ok(runner.playedSource.includes('papers-running-alpha.webm'),'the video element must actually play the Higgsfield papers asset');
  assert.equal(runner.width,320);assert.equal(runner.height,320);
  assert.equal(runner.nonBlocking,true);assert.ok(runner.cornerAlpha.every(a=>a<10),'WebM must decode with real alpha in Chromium');
  await page.evaluate(()=>{document.getElementById('analyze').click();document.getElementById('analyze').click();});
  }
  await page.waitForFunction(()=>document.getElementById('ld-compatibility-drawer').getAttribute('aria-hidden')==='false'||window.GrconTriageUiApi.snapshot().total===60);
  if(await page.locator('#ld-compatibility-drawer').getAttribute('aria-hidden')==='false'){
   await page.locator('#ld-compatibility-confirm').click();await page.locator('#analyze').click();
  }
  await page.waitForFunction(()=>window.GrconTriageUiApi.snapshot().total===60&&!window.GrconPerformanceDiagnostics.state().busy,null,{timeout:45000});
  await page.evaluate(async()=>{await window.GrconPostingFlow.refresh(true);window.GrconEgrdtBatchPlan.setMode('limit-only');window.GrconEgrdtBatchPlan.setLimit(48);});
  if(process.env.GRCON_QA_BASELINE){
   const baseline=await page.evaluate(()=>({feedbackMs:window.__qaFeedback,totalMs:performance.now()-window.__qaClickAt}));
   fs.writeFileSync(path.join(output,'baseline-timing.json'),JSON.stringify(baseline,null,2));
   console.log('Baseline analysis timing',baseline);return;
  }
  const analysisTiming=await page.evaluate(()=>window.GrconAnalysisTiming.current());
  assert.ok(analysisTiming.feedbackMs<100,'feedback should not wait for bases');
  await page.waitForFunction(()=>!window.GrconMascotRunner.diagnostics().active);
  console.log('QA: análise concluída, mascote transparente e feedback imediato',analysisTiming);

  await page.waitForFunction(()=>document.getElementById('posting-history-source').textContent.includes('completo'));
  const trace=await page.evaluate(()=>window.GrconAllocationRegistry.resolve('RL-5290.00-22313-91B-C1O-001'));
  assert.equal(trace.kind,'allocated');assert.equal(trace.references.length,2);
  assert.ok(await page.evaluate(()=>Array.from({length:60},(_,i)=>window.GrconTriageUiApi.getResult(i)).every(row=>row.record.sharedAllocationContext.centralSnapshotId==='qa-central-1')));
  const categories=await page.evaluate(()=>Array.from({length:60},(_,i)=>{const row=window.GrconTriageUiApi.getResult(i);return window.GrconPostingFlow.lookup(row.document,row.revision).emissionKind;}));
  assert.equal(categories.filter(k=>k==='REPOST').length,20);assert.equal(categories.filter(k=>k==='').length,20,'A revisão selecionada é anterior à revisão A emitida: conferir histórico, não nova revisão');assert.equal(categories.filter(k=>k==='FIRST_POSTING').length,20);
  const mixed=await page.evaluate(()=>window.GrconEgrdtBatchPlan.preview('all'));
  assert.equal(mixed.valid,true,mixed.errors.join('\n'));assert.deepEqual(mixed.groups.map(g=>g.itemCount),[48,12]);
  await page.locator('#posting-batch-mode').selectOption('separate');
  const separate=await page.evaluate(()=>window.GrconEgrdtBatchPlan.preview('all'));
  assert.deepEqual(separate.groups.map(g=>g.itemCount).sort((a,b)=>a-b),[20,20,20]);
  assert.ok(separate.groups.every(g=>g.postingGroup!=='MIXED'));
  // Use the visible post-analysis controls, without pressing Aplicar.
  await page.locator('#posting-batch-mode').selectOption('mixed');
  await page.locator('#egrdt-batch-limit').fill('17');
  assert.equal(await page.evaluate(()=>window.GrconEgrdtBatchPlan.getLimit()),17);
  const controlPosition=await page.evaluate(()=>({
   control:document.getElementById('egrdt-batch-mode').getBoundingClientRect().top,
   table:document.getElementById('results-scroll').getBoundingClientRect().top
  }));
  assert.ok(controlPosition.control<controlPosition.table,'batch controls must be above the virtual table');
  await page.locator('#egrdt-batch-limit').fill('1.5');
  assert.equal(await page.evaluate(()=>window.GrconEgrdtBatchPlan.preview('all').valid),false,'fractional limits must not use the previous value');
  await page.locator('#egrdt-batch-limit').fill('17');
  await page.evaluate(()=>{
   window.GrconDocumentVault.persistEmissionFiles=async()=>{};
   window.GrconCloud.reserveEgrdtSequences=async(year,count,requested)=>Array.from({length:count},(_,i)=>{
    const sequence=requested?.[i]||5000+i;
    return {sequence,sequenceText:String(sequence).padStart(4,'0'),year,baseName:`0130870-C1O-PGV-G-${String(sequence).padStart(4,'0')}-${year} - eGRDT`};
   });
  });
  const generatedBatches={};
  for(const mode of ['limit-only','discipline']){
   await page.locator('#egrdt-batch-mode').selectOption(mode);
   const preview=await page.evaluate(()=>window.GrconEgrdtBatchPlan.preview('all'));
   assert.deepEqual(preview.groups.map(g=>g.itemCount),mode==='limit-only'?[17,17,17,9]:[17,13,17,13]);
   if(mode==='limit-only'&&!await page.locator('.secondary-downloads').evaluate(el=>el.open))await page.locator('.secondary-downloads summary').click();
   await page.locator(mode==='limit-only'?'#export-egrdt':'#export-zip').click();
   await page.locator('#p1-confirm-dialog').waitFor({state:'visible'});
   assert.equal(await page.locator('.p1-batch-sequence-card').count(),preview.count);
   await page.locator('#p1-sequence-confirm').check();
   const downloaded=page.waitForEvent('download',{timeout:60000});
   await page.locator('#p1-confirm-ok').click();
   const download=await downloaded;
   const zip=await require('../jszip.min.js').loadAsync(fs.readFileSync(await download.path()));
   const files=Object.values(zip.files).filter(f=>!f.dir&&/\.xls$/i.test(f.name));
   assert.equal(files.length,preview.count);
   if(mode==='discipline')assert.equal(Object.values(zip.files).filter(f=>!f.dir&&/\.pdf$/i.test(f.name)).length,60);
   generatedBatches[mode]=[];
   for(const file of files){
    const xls=XLSX.read(await file.async('nodebuffer'),{type:'buffer'});
    const rows=XLSX.utils.sheet_to_json(xls.Sheets.GRDT,{header:1,defval:''});
    const documents=rows.filter(row=>docs.includes(row[0]));
    generatedBatches[mode].push(documents.length);
    assert.ok(documents.length<=17);
    if(mode==='discipline')assert.equal(new Set(documents.map(row=>row[5])).size,1);
   }
   assert.deepEqual(generatedBatches[mode],preview.groups.map(g=>g.itemCount));
   await page.waitForFunction(()=>!window.GrconPerformanceDiagnostics.state().busy);
  }
  // Auto-collapse after analysis and navigation must never hide an open panel.
  await page.clock.install();
  await page.clock.fastForward('20:00');
  for(let cycle=0;cycle<3;cycle++){
   await page.evaluate(()=>document.querySelector('#grdt-module .control-panel').classList.add('p1-collapsed'));
   await page.locator('[data-ops-open-settings]').click();
   await page.locator('#advanced-panel').waitFor({state:'visible'});
   assert.equal(await page.locator('#advanced-toggle').getAttribute('aria-expanded'),'true');
   await page.locator('#advanced-toggle').click();
   await page.locator('#advanced-panel').waitFor({state:'hidden'});
  }
  await page.locator('#egrdt-batch-mode').selectOption('limit-only');
  await page.locator('#egrdt-batch-limit').fill('48');
  await page.locator('#posting-batch-mode').selectOption('separate');
  const beforeCalls=await page.evaluate(()=>window.__qaCalls);
  await page.locator('[data-posting-filter="reposts"]').click();
  assert.equal(await page.evaluate(()=>window.GrconTriageUiApi.snapshot().filtered),20);
  await page.locator('[data-posting-filter="postings"]').click();
  assert.equal(await page.evaluate(()=>window.GrconTriageUiApi.snapshot().filtered),20);
  await page.locator('[data-posting-filter="all"]').click();
  assert.equal(await page.evaluate(()=>window.__qaCalls),beforeCalls,'filtering must not refetch history');
  await page.evaluate(()=>{document.getElementById('results-scroll').scrollTop=0;window.GrconTriageUiApi.render();});
  await page.locator(`[data-grdt-history-document="${docs[0]}"]`).click();
  await page.waitForFunction(()=>document.querySelector('.grdt-history-panel-content')?.textContent.includes('QA-GRDT'));
  assert.ok((await page.locator('.grdt-history-panel-content').innerText()).includes('QA-GRDT'));
  await page.locator('.grdt-history-close').click();
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
  // Preparation errors and cancellation must release the same durable busy state.
  await page.evaluate(()=>{window.__qaPlannedLoader=window.GrconCloud.loadPlannedDocuments;window.GrconCloud.loadPlannedDocuments=async()=>{throw new Error('QA preparation failure');};});
  await page.locator('#analyze').click();
  await page.waitForFunction(()=>!document.getElementById('analyze').disabled&&!window.GrconMascotRunner.diagnostics().active);
  assert.match(await page.locator('#toast').innerText(),/QA preparation failure/);
  await page.evaluate(()=>{window.GrconCloud.loadPlannedDocuments=window.__qaPlannedLoader;});
  await page.locator('#analyze').click();
  await page.evaluate(()=>document.getElementById('cancel-processing').click());
  await page.waitForFunction(()=>!document.getElementById('analyze').disabled&&!window.GrconMascotRunner.diagnostics().active);
  assert.match(await page.locator('#toast').innerText(),/cancelado/i);
  await page.locator('#analyze').click();
  await page.waitForFunction(()=>!document.getElementById('analyze').disabled&&!window.GrconMascotRunner.diagnostics().active);
  const fallback=await page.evaluate(async()=>{
   const video=document.querySelector('.grcon-mascot-runner-video'),nativePlay=video.play;
   video.play=()=>Promise.reject(new Error('QA media failure'));
   const started=await window.GrconMascotRunner.run({context:'control'});
   const fallbackVisible=!document.querySelector('#grcon-mascot-activity-strip img').hidden;
   video.play=nativePlay;window.GrconMascotRunner.stop('QA-complete');
   return {started,fallbackVisible};
  });
  assert.deepEqual(fallback,{started:true,fallbackVisible:true});
  const quickRun=await page.evaluate(()=>{
   window.GrconCloud.loadPlannedDocuments=async()=>window.GrconCloud.state.plannedSnapshot;
   document.getElementById('analyze').click();
   const track=document.querySelector('.grcon-mascot-runner-track').getBoundingClientRect();
   return {visible:track.right>0&&track.left<innerWidth,active:window.GrconMascotRunner.diagnostics().active};
  });
  assert.deepEqual(quickRun,{visible:true,active:true},'quick cached analyses start with the mascot already inside the screen');
  await page.waitForFunction(()=>!document.getElementById('analyze').disabled&&!window.GrconMascotRunner.diagnostics().active);
  const originalRun=await page.evaluate(async()=>{
   await window.GrconMascotRunner.run({context:'sigem-pw'});
   const played=document.querySelector('.grcon-mascot-runner-video').currentSrc;
   window.GrconMascotRunner.stop('QA-original');return played;
  });
  assert.ok(originalRun.includes('/grcon-mascot-running-alpha.webm'),'SIGEM × PW retains its actual original video');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.evaluate(()=>window.GrconMascotRunner.run({context:'control'})),false);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(async()=>{window.GrconHistory.clear();window.GrconCloud.loadClassificationHistory=async()=>{throw new Error('offline fixture');};await window.GrconPostingFlow.refresh(true);window.GrconTriageUiApi.render();});
  const offline=await page.evaluate(()=>{const row=window.GrconTriageUiApi.getResult(0);return window.GrconPostingFlow.lookup(row.document,row.revision);});
  assert.equal(offline.classificationStatus,'UNCONFIRMED');
  await page.locator('[data-posting-filter="unconfirmed"]').click();assert.equal(await page.evaluate(()=>window.GrconTriageUiApi.snapshot().filtered),60);
  await page.reload();await page.waitForFunction(()=>window.GrconPostingFlow);assert.equal(await page.evaluate(()=>window.GrconPostingFlow.getMode()),'separate');
  const meaningful=errors.filter(e=>!/supabase|Failed to fetch|ERR_|storage.*initialize/i.test(e));assert.deepEqual(meaningful,[]);
  fs.writeFileSync(path.join(output,'metrics.json'),JSON.stringify({passed:true,mixed:mixed.groups.map(g=>g.itemCount),separate:separate.groups.map(g=>g.itemCount),categories:categories.reduce((n,k)=>(n[k]=(n[k]||0)+1,n),{}),analysisTiming,runner,mediaFallback:true,cancellation:true,preparationRetry:true,generatedBatches,settingsReopened:true,historyRoundtrip:true,centralPublished:true,centralShortPages:true,vaultAllocationFilter:vaultFilter,offline:true,preference:true,widths:[1440,1366,1024],errors},null,2));
  console.log('Unified posting browser: central publication/short pages/allocation filters/analysis/classification/batch/BIFF8/history/offline/preference passed.');
 }catch(e){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});console.error(await page.evaluate(()=>({mascot:window.GrconMascot?.diagnostics(),runner:window.GrconMascotRunner?.diagnostics(),timing:window.GrconAnalysisTiming?.current(),summary:document.getElementById('posting-history-summary')?.innerText,ui:window.GrconTriageUiApi?.snapshot(),body:document.body.innerText.slice(-1600)})));throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
