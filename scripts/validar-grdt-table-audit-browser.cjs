'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),XLSX=require('../xlsx.full.min');
const output=path.join(process.cwd(),'artifacts/grdt-table-audit');fs.rmSync(path.join(output,'bundle'),{recursive:true,force:true});fs.mkdirSync(path.join(output,'bundle'),{recursive:true});
const docs=Array.from({length:500},(_,i)=>`RL-5290.00-22313-91B-C1O-${String(i+1).padStart(3,'0')}`);
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
  await page.locator('#analyze').click();
  await page.waitForFunction(()=>document.getElementById('ld-compatibility-drawer').getAttribute('aria-hidden')==='false'||window.GrconTriageUiApi.snapshot().total===500);
  if(await page.locator('#ld-compatibility-drawer').getAttribute('aria-hidden')==='false'){
   await page.locator('#ld-compatibility-confirm').click();await page.locator('#analyze').click();
  }
  await page.waitForFunction(()=>window.GrconTriageUiApi.snapshot().total===500&&!window.GrconPerformanceDiagnostics.state().busy,null,{timeout:60000});
  await page.locator('#results-scroll').scrollIntoViewIfNeeded();
  const metrics=[];
  for(const density of ['comfortable','compact']){
   await page.locator('#triage-density').selectOption(density);
   await page.waitForTimeout(150);
   metrics.push(await page.evaluate(()=>{
    const first=document.querySelector('#results-table thead th:first-child'),doc=document.querySelector('#results-table thead th:nth-child(3)');
    return {density:window.GrconTriageUiApi.snapshot().density,zoom:getComputedStyle(document.documentElement).zoom,scale:first.getBoundingClientRect().width/first.offsetWidth,offset:first.offsetWidth,cellDisplay:getComputedStyle(document.querySelector("td.revision-grdt-cell")).display,inline:doc.getAttribute("style"),width:first.getBoundingClientRect().width,left:parseFloat(getComputedStyle(doc).left),heights:[...document.querySelectorAll('tr.result-row')].map(n=>n.getBoundingClientRect().height)};
   }));
   const m=metrics.at(-1);assert.ok(Math.abs(m.offset-m.left)<2,'colunas fixas sem sobreposição');
   await page.evaluate(()=>{const el=document.getElementById('results-scroll');el.scrollTop=el.scrollHeight;});
   await page.waitForTimeout(180);
   assert.match(await page.locator('#results-body').innerText(),new RegExp(await page.evaluate(()=>{const api=window.GrconTriageUiApi;return api.getResult(api.filteredIndices().at(-1)).document;})));
  }
  await page.evaluate(()=>{document.getElementById('results-scroll').scrollTop=0});await page.waitForTimeout(100);
  await page.locator('tr.result-row [data-action="toggle-details"]').first().click();await page.waitForTimeout(120);
  assert.ok(await page.locator('tr.detail-row:not([hidden])').count()>0);
  await page.evaluate(()=>{const el=document.getElementById('results-scroll');el.scrollTop=el.scrollHeight;});await page.waitForTimeout(180);
  assert.match(await page.locator('#results-body').innerText(),new RegExp(await page.evaluate(()=>{const api=window.GrconTriageUiApi;return api.getResult(api.filteredIndices().at(-1)).document;})));
  await page.locator('#search').fill('RELATÓRIO DE AUDITORIA 499');await page.waitForTimeout(350);
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
  await page.screenshot({path:path.join(output,'table-1366.png'),fullPage:true});
  await page.evaluate(()=>document.documentElement.style.zoom='1.25');await page.waitForTimeout(150);
  await page.screenshot({path:path.join(output,'table-zoom125.png'),fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert.ok(overflow<=2,'sem overflow da página');
  assert.deepEqual(errors.filter(e=>!/supabase|Failed to fetch|ERR_|storage.*initialize/i.test(e)),[]);
  fs.writeFileSync(path.join(output,'metrics.json'),JSON.stringify({passed:true,documents:500,metrics,overflow},null,2));
  console.log('OK — GRDT 500 documentos: filtros reais, seleção vazia, pesquisa por título, evidências, última linha, densidade e zoom.');
 }catch(e){if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
