'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),XLSX=require('../xlsx.full.min');
const count=Number(process.env.GRCON_QA_COUNT)||500;
const output=path.join(process.cwd(),'artifacts/grdt-table-audit',String(count));fs.rmSync(path.join(output,'bundle'),{recursive:true,force:true});fs.mkdirSync(path.join(output,'bundle'),{recursive:true});
const docs=Array.from({length:count},(_,i)=>`RL-5290.00-22313-91B-C1O-${String(i+1).padStart(3,'0')}`);
const book=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
 ['DOCUMENTO','REVISÃO','TÍTULO','FORMATO','DISCIPLINA','TIPO DE DOCUMENTO','PROPÓSITO','CONFIRMAÇÃO DE ALOCAÇÃO','CAMINHO DATABOOK','GRDT','DATA EFETIVA DE EMISSÃO'],
 ...docs.map((doc,i)=>[doc,'0','RELATÓRIO DE AUDITORIA '+i,'A4',i%2?'DINÂMICOS':'TUBULAÇÃO','RL','Para Construção','ALOCADO','R:\\DB','',''])]),'N-1710');
XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['DOCUMENTO','REVISÃO','STATUS SIGEM'],...docs.map(doc=>[doc,'0','Não Postado'])]),'Colar SIGEM');
const ld=path.join(output,'LD_QA.xlsx');fs.writeFileSync(ld,XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
docs.forEach(doc=>fs.writeFileSync(path.join(output,'bundle',`${doc}_0001_0.pdf`),'%PDF-1.4\n%%EOF'));
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});let page;
 try{
  const context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.GRCON_PREVIEW_URL||'http://127.0.0.1:8765');
  await page.waitForFunction(()=>window.GrconTriageUiApi&&window.GRCONModuleLoader);
  await page.addStyleTag({content:'#grcon-cloud-auth{display:none!important} html.grcon-cloud-pending body > :not(script){visibility:visible!important}'});
  await page.locator('#ld-input').setInputFiles(ld);await page.locator('#pdf-input').setInputFiles(path.join(output,'bundle'));
  const analysisStarted=performance.now();
  await page.locator('#analyze').click();
  await page.waitForFunction(count=>document.getElementById('ld-compatibility-drawer').getAttribute('aria-hidden')==='false'||window.GrconTriageUiApi.snapshot().total===count,count);
  if(await page.locator('#ld-compatibility-drawer').getAttribute('aria-hidden')==='false'){
   await page.locator('#ld-compatibility-confirm').click();await page.locator('#analyze').click();
  }
  await page.waitForFunction(count=>window.GrconTriageUiApi.snapshot().total===count&&!window.GrconPerformanceDiagnostics.state().busy,count,{timeout:60000});
  const loadingMs=performance.now()-analysisStarted;
  await page.locator('#results-scroll').scrollIntoViewIfNeeded();
  const metrics=[];
  for(const density of ['comfortable','compact']){
   await page.locator('#triage-density').selectOption(density);
   await page.waitForFunction(()=>{
    const first=document.querySelector('#results-table thead th:first-child'),doc=document.querySelector('#results-table thead th:nth-child(3)');
    return Math.abs(first.offsetWidth-parseFloat(getComputedStyle(doc).left))<2;
   },null,{timeout:5000});
   metrics.push(await page.evaluate(()=>{
    const first=document.querySelector('#results-table thead th:first-child'),doc=document.querySelector('#results-table thead th:nth-child(3)');
    return {density:window.GrconTriageUiApi.snapshot().density,zoom:getComputedStyle(document.documentElement).zoom,scale:first.getBoundingClientRect().width/first.offsetWidth,offset:first.offsetWidth,cellDisplay:getComputedStyle(document.querySelector("td.revision-grdt-cell")).display,inline:doc.getAttribute("style"),width:first.getBoundingClientRect().width,left:parseFloat(getComputedStyle(doc).left),heights:[...document.querySelectorAll('tr.result-row')].map(n=>n.getBoundingClientRect().height)};
   }));
   const m=metrics.at(-1);assert.ok(Math.abs(m.offset-m.left)<2,'colunas fixas sem sobreposição: '+JSON.stringify(m));
   await page.evaluate(()=>{const el=document.getElementById('results-scroll');el.scrollTop=el.scrollHeight;});
   await page.waitForTimeout(180);
   assert.match(await page.locator('#results-body').innerText(),new RegExp(await page.evaluate(()=>{const api=window.GrconTriageUiApi;return api.getResult(api.filteredIndices().at(-1)).document;})));
  }
  await page.evaluate(()=>{document.getElementById('results-scroll').scrollTop=0});await page.waitForTimeout(100);
  await page.locator('tr.result-row [data-action="toggle-details"]').first().click();await page.waitForTimeout(120);
  assert.ok(await page.locator('tr.detail-row:not([hidden])').count()>0);
  await page.evaluate(()=>{const el=document.getElementById('results-scroll');el.scrollTop=el.scrollHeight;});await page.waitForTimeout(180);
  assert.match(await page.locator('#results-body').innerText(),new RegExp(await page.evaluate(()=>{const api=window.GrconTriageUiApi;return api.getResult(api.filteredIndices().at(-1)).document;})));
  await page.locator('#search').fill('RELATÓRIO DE AUDITORIA '+(count-1));await page.waitForTimeout(350);
  assert.equal(await page.locator('tr.result-row').count(),1);assert.match(await page.locator('#results-body').innerText(),new RegExp(docs.at(-1)));
  await page.locator('#triage-clear-all').click();
  await page.locator('[data-column-filter-trigger="sheet"]').click();
  await page.locator('.column-filter-select-all').uncheck();await page.locator('.column-filter-apply').click();
  assert.equal(await page.locator('tr.result-row').count(),0,'nenhum valor marcado corresponde a zero linhas');
  await page.locator('#triage-clear-all').click();
  assert.ok(await page.locator('tr.result-row').count()>0);
  await page.locator('#results-scroll').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#search').inputValue(),'');
  assert.equal(await page.locator('.p2-filter-summary:visible').count(),0,'sem resumo antigo contraditório');
  // Filtros operacionais combinados e seleção preservada sobre todo o conjunto.
  await page.locator('.triage-operational-details summary').click();
  const filterStarted=performance.now();
  await page.locator('[data-triage-facet="origin"]').selectOption('PASTA LOCAL');
  await page.locator('[data-triage-facet="extension"]').selectOption('PDF');
  assert.equal(await page.evaluate(()=>window.GrconTriageUiApi.filteredIndices().length),count);
  const combinedFilterMs=performance.now()-filterStarted;
  await page.locator('[data-triage-facet="history"]').selectOption('never');
  assert.equal(await page.evaluate(()=>window.GrconTriageUiApi.filteredIndices().length),0,'histórico indisponível não equivale a nunca emitido');
  await page.locator('[data-triage-facet="history"]').selectOption('unconfirmed');
  assert.equal(await page.evaluate(()=>window.GrconTriageUiApi.filteredIndices().length),count);
  await page.locator('#triage-clear-all').click();
  await page.locator('#search').fill(docs[0]);await page.waitForTimeout(300);
  await page.locator('#select-all-ready').uncheck();
  assert.equal(await page.evaluate(()=>window.GrconPerformanceDiagnostics.state().selected),count-1,'somente resultado filtrado desmarcado');
  await page.locator('#triage-clear-all').click();
  assert.equal(await page.evaluate(()=>window.GrconPerformanceDiagnostics.state().selected),count-1);
  await page.evaluate(()=>{document.getElementById('results-scroll').scrollTop=0;});await page.waitForTimeout(100);
  await page.locator('[data-revision-input]').first().fill('A');await page.locator('[data-revision-input]').first().press('Tab');
  assert.equal(await page.evaluate(()=>window.GrconTriageUiApi.getResult(window.GrconTriageUiApi.filteredIndices()[0]).revision),'A');
  assert.equal(await page.evaluate(()=>window.GrconPerformanceDiagnostics.state().selected),count-1);
  assert.match(await page.locator('.grdt-revision-transition').first().innerText(),/0 → A/);
  await page.locator('[data-triage-facet="revision"]').selectOption('changed');
  assert.equal(await page.evaluate(()=>window.GrconTriageUiApi.filteredIndices().length),1);
  await page.locator('#triage-clear-all').click();
  assert.equal(await page.evaluate(()=>window.GrconTriageUiApi.getResult(window.GrconTriageUiApi.filteredIndices()[0]).revision),'A');
  // Consulta real do serviço da tela com backend controlado: duas revisões e dois contratos.
  await page.evaluate(async(doc)=>{
    window.__qaCloud=window.GrconCloud;
    window.GrconCloud={state:{membership:{workspace_id:'QA'},session:{user:{id:'QA-user'}}},loadClassificationHistory:async()=>[
      {id:'1',workspaceId:'QA',egrdtNumber:'QA-GRDT-001',generatedAt:'2026-01-01',files:[{document:doc,revision:'0',purpose:'Construção'}]},
      {id:'2',workspaceId:'QA',egrdtNumber:'QA-GRDT-002',generatedAt:'2026-01-02',files:[{document:doc,revision:'A',purpose:'Construção'}]},
      {id:'3',workspaceId:'OTHER',egrdtNumber:'QA-OTHER',generatedAt:'2026-01-03',files:[{document:doc,revision:'B'}]},
    ]};
    await window.GrconPostingFlow.refresh(true);
  },docs[0]);
  await page.locator('#search').fill('QA-GRDT-001');await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>window.GrconTriageUiApi.filteredIndices().length),1,'busca reconhece GRDT mais antiga');
  assert.match(await page.locator('#results-body').innerText(),/QA-GRDT-002/);
  assert.match(await page.locator('#results-body').innerText(),/Repostagem/);
  const historyTrigger=page.locator('[data-grdt-history-document]').first();await historyTrigger.click();
  assert.equal(await page.locator('.grdt-history-entry').count(),2);
  assert.doesNotMatch(await page.locator('.grdt-history-panel').innerText(),/QA-OTHER/);
  assert.match(await page.locator('.grdt-history-panel').innerText(),/Não confirmada neste histórico/);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{window.GrconCloud.loadClassificationHistory=async()=>{throw new Error('QA offline')};});
  await historyTrigger.click();
  // Force retry to reproduce remote failure rather than reuse a complete cached response.
  await page.evaluate(async()=>{await window.GrconPostingFlow.refresh(true);});
  await page.keyboard.press('Escape');await page.evaluate(doc=>window.GrconGrdtHistoryUi.open(doc,'A'),docs[0]);
  assert.match(await page.locator('.grdt-history-panel').innerText(),/Não foi possível consultar o histórico/);
  await page.evaluate(()=>{window.GrconCloud.loadClassificationHistory=async()=>[];});
  await page.locator('[data-history-retry]').click();
  await page.waitForFunction(()=>document.querySelector('.grdt-history-panel-content').textContent.includes('Não foi encontrada emissão anterior'));
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{window.GrconCloud=window.__qaCloud;});
  await page.locator('#triage-clear-all').click();
  await page.evaluate(()=>{document.getElementById('results-scroll').scrollTop=0;});await page.waitForTimeout(100);
  for(const el of await page.locator('tr.result-row .expand-button.open').all())await el.click();
  // O filtro de situação acompanha inclusão/exclusão, sem um cache antigo da seleção.
  await page.locator('[data-column-filter-trigger="situation"]').click();
  await page.locator('.column-filter-select-all').uncheck();
  await page.locator('[data-column-filter-value="EXCLUIDO"]').check();
  await page.locator('.column-filter-apply').click();
  assert.equal(await page.evaluate(()=>window.GrconTriageUiApi.filteredIndices().length),1);
  assert.match(await page.locator('tr.result-row .status-chip').innerText(),/Excluído/i);
  await page.locator('#select-all-ready').evaluate(el=>el.click());
  assert.equal(await page.evaluate(()=>window.GrconTriageUiApi.filteredIndices().length),0);
  await page.locator('#triage-clear-all').click();
  assert.equal(await page.evaluate(()=>window.GrconPerformanceDiagnostics.state().selected),count);
  // Ação principal usa os Workers e a geração oficial; ZIPs inspecionados, sem backend real.
  await page.locator('#select-all-ready').check();
  await page.locator('#select-all-ready').uncheck();
  await page.locator('tr[data-index="0"] [data-select-row]').check();
  const otherDocument=await page.evaluate(()=>{
    const api=window.GrconTriageUiApi,first=api.getResult(0);
    const index=api.filteredIndices().find(i=>api.getResult(i).egrdt.discipline!==first.egrdt.discipline);
    return api.getResult(index).document;
  });
  await page.locator('#search').fill(otherDocument);await page.waitForTimeout(300);
  await page.locator('tr.result-row [data-select-row]').first().check();
  await page.locator('#triage-clear-all').click();
  assert.equal(await page.evaluate(()=>window.GrconPerformanceDiagnostics.state().selected),2);
  const JSZip=require('../jszip.min.js');
  const packages=[];
  await page.evaluate(()=>{
    window.__pipelineMetrics=[];window.__downloadRedraws=0;
    window.__redrawObserver=new MutationObserver(records=>window.__downloadRedraws+=records.length);
    const original=window.GrconDocumentVault;
    window.GrconDocumentVault={...original,persistEmissionFiles:async(plan,onProgress,options)=>{
      onProgress({progress:.25,completed:0,total:plan.entries.length});
      await new Promise(resolve=>setTimeout(resolve,160));
      const bar=document.querySelector('#grdt-download-progress progress');
      if(bar.value!==25)throw new Error('Percentual do Cofre não exibido');
      if(window.__downloadRedraws)throw new Error('A tabela piscou durante a preparação');
      return original.persistEmissionFiles(plan,onProgress,options);
    }};
  });
  for(const mode of ['limit-only','discipline']){
    await page.evaluate(mode=>window.GrconEgrdtBatchPlan.setMode(mode),mode);
    let downloads=0;const onDownload=()=>downloads++;page.on('download',onDownload);
    await page.evaluate(()=>{const b=document.getElementById('export-zip');b.click();b.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
    await page.locator('#p1-sequence-confirm').check();
    await page.evaluate(()=>{window.__downloadRedraws=0;window.__redrawObserver.observe(document.getElementById('results-body'),{childList:true});});
    const ready=page.waitForEvent('download',{timeout:30000});
    await page.evaluate(()=>{const b=document.getElementById('p1-confirm-ok');b.dispatchEvent(new MouseEvent('click',{bubbles:true}));b.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
    const download=await ready;const target=path.join(output,mode+'.zip');await download.saveAs(target);
    await page.waitForFunction(()=>document.getElementById('export-zip').getAttribute('aria-busy')==='false');
    assert.equal(await page.locator('#grdt-download-progress progress').getAttribute('value'),'100');
    assert.ok((await page.evaluate(()=>window.__downloadRedraws))<=2,'sem reconstruções repetidas ao concluir');
    await page.evaluate(()=>{window.__redrawObserver.disconnect();window.__pipelineMetrics.push(window.GrconGrdtDownloadProgress.metrics());});
    page.off('download',onDownload);assert.equal(downloads,1,'clique repetido produz somente um pacote');
    const zip=await JSZip.loadAsync(fs.readFileSync(target));const files=Object.keys(zip.files).filter(name=>!zip.files[name].dir);
    assert.equal(files.filter(name=>/\.pdf$/i.test(name)).length,2);
    assert.equal(files.filter(name=>/\.xls$/i.test(name)).length,mode==='discipline'?2:1);
    assert.ok(files.some(name=>/_A\.pdf$/i.test(name)),'revisão editada no nome final');
    packages.push({mode,files});
  }
  // Falha na conferência antes de montar o ZIP não deixa o botão travado.
  await page.evaluate(()=>{window.__qaAllocation=window.GrconAllocationRegistry;window.GrconAllocationRegistry={...window.__qaAllocation,refresh:async()=>{throw new Error('QA falha de preparação')}};});
  await page.locator('#export-zip').click();
  await page.locator('#p1-sequence-confirm').check();await page.locator('#p1-confirm-ok').click();
  await page.waitForFunction(()=>document.getElementById('export-zip').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('#export-zip').isEnabled(),true);
  assert.match(await page.locator('#export-zip').innerText(),/Baixar PDFs/);
  assert.match(await page.locator('#grdt-download-progress').innerText(),/Não foi possível/);
  await page.evaluate(()=>{window.GrconAllocationRegistry=window.__qaAllocation;});
  fs.writeFileSync(path.join(output,'packages.json'),JSON.stringify(packages,null,2));
  fs.writeFileSync(path.join(output,'download-stages.json'),JSON.stringify(await page.evaluate(()=>window.__pipelineMetrics),null,2));
  const geometry=await page.evaluate(()=>{
    const selectors=['.grdt-document-identity','.grdt-copy-code','.document-code','.grdt-document-text'];
    return Object.fromEntries(selectors.map(s=>{const el=document.querySelector(s),style=getComputedStyle(el);return [s,{height:el.getBoundingClientRect().height,display:style.display,font:style.fontSize,minHeight:style.minHeight}];}));
  });
  console.log('geometry',JSON.stringify(geometry));
  await page.screenshot({path:path.join(output,'table-1366.png'),fullPage:true});
  await page.evaluate(()=>document.documentElement.style.zoom='1.25');await page.waitForTimeout(150);
  await page.screenshot({path:path.join(output,'table-zoom125.png'),fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert.ok(overflow<=2,'sem overflow da página');
  assert.deepEqual(errors.filter(e=>!/supabase|Failed to fetch|ERR_|storage.*initialize/i.test(e)),[]);
  fs.writeFileSync(path.join(output,'metrics.json'),JSON.stringify({passed:true,documents:count,loadingMs,combinedFilterMs,metrics,overflow,geometry,packages:packages.map(p=>({mode:p.mode,count:p.files.length}))},null,2));
  console.log(`OK — GRDT ${count} documentos: filtros reais, seleção vazia, pesquisa por título, evidências, última linha, densidade, download real e zoom.`);
 }catch(e){if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
