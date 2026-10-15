'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const duration=Number(process.env.GRCON_SOAK_MS)||3600000;
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1366,height:900},serviceWorkers:'block'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*.supabase.co/**',route=>route.fulfill({status:401,contentType:'application/json',body:'{"message":"QA isolado"}'}));
    await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"files":[],"storage":null}'}));
    const base=process.env.GRCON_PREVIEW_URL||'http://127.0.0.1:8765';
    await page.goto(base,{waitUntil:'networkidle'});
    await page.addStyleTag({content:'html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script){visibility:visible!important}#grcon-cloud-auth{display:none!important}'});
    await page.waitForFunction(()=>window.GrconAnalysisSettings&&window.GrconOperations);
    const cdp=await page.context().newCDPSession(page);
    const samples=[],started=Date.now();let cycles=0;
    const views=['requests','history','additional-tools','pdf-tools','cover-document','allocation-dashboard','sigem'];
    while(Date.now()-started<duration){
      const view=views[cycles%views.length];
      await page.evaluate(async view=>{try{await GRCONModuleLoader.ensureModule(view);}catch{}},view);
      await page.evaluate(async()=>{
        await GRCONModuleLoader.ensureModule('control');
        document.querySelector('#grdt-module .control-panel').classList.add('p1-collapsed');
        document.querySelector('[data-ops-open-settings]').click();
      });
      await page.waitForFunction(()=>document.querySelector('#advanced-toggle')?.getAttribute('aria-expanded')==='true'&&!document.querySelector('#grdt-module .control-panel')?.classList.contains('p1-collapsed'));
      const key='soak-'+cycles;
      await page.evaluate(async key=>{
        await GrconOperations.run(key,'Verificação de estabilidade',async op=>{op.update({message:'Conferindo etapas',done:1,total:2});await op.paint();op.update({message:'Conferindo etapas',done:2,total:2});},{host:'#grdt-module'});
        document.querySelector('#advanced-toggle')?.click();
      },key);
      cycles++;
      if(cycles%20===0){
        await cdp.send('HeapProfiler.collectGarbage');
        const dom=await cdp.send('Memory.getDOMCounters');
        const sample=await page.evaluate(()=>({elapsed:performance.now(),heap:performance.memory?.usedJSHeapSize,active:GrconOperations.diagnostics().active,taskCount:GrconOperationTasks.list().length,progressNodes:document.querySelectorAll('.grcon-operation-progress').length}));
        samples.push({...sample,...dom});
        console.log(JSON.stringify({cycles,elapsedSeconds:Math.round((Date.now()-started)/1000),...samples.at(-1)}));
        assert.ok(sample.taskCount<=40,'completed task retention must stay bounded');assert.equal(sample.active,0);assert.ok(sample.progressNodes<20);
      }
      await page.waitForTimeout(15000);
    }
    const result={passed:true,durationMs:Date.now()-started,cycles,errors,samples};
    assert.deepEqual(errors,[]);
    assert.ok(samples.length>=2,'collect multiple samples during the soak');
    // Once all lazy modules have mounted, listeners must not grow per cycle.
    const steady=samples;
    if(steady.length>1)assert.ok(steady.at(-1).jsEventListeners<=steady[0].jsEventListeners+100,'listeners must remain stable across repeated navigation');
    if(process.env.GRCON_SOAK_OUTPUT)fs.writeFileSync(process.env.GRCON_SOAK_OUTPUT,JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
