'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let revision = 1, failRetry = true, releaseContext, legacy = !!process.env.GRCON_STARTUP_BASELINE;
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webm':'video/webm','.svg':'image/svg+xml'};
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (name === '/startup-retry-fixture.js') {res.writeHead(failRetry ? 404 : 200, {'Content-Type':'text/javascript'}).end(failRetry ? '' : 'window.startupRetryLoaded = true;');return;}
  if (name === '/startup-context-fixture.js') {releaseContext = () => res.writeHead(200, {'Content-Type':'text/javascript'}).end('window.startupContextLoaded = true;');return;}
  if (name === '/__loader') {
    res.writeHead(200, {'Content-Type':'text/html'}).end('<!doctype html><main><section class="module-view" id="grdt-module"></section><section class="module-view" id="additional-tools-module" hidden></section></main><script>window.GrconCloud={state:{membership:{workspace_id:"qa"},session:{user:{id:"qa"}}}};window.GrconNotify=()=>{};</script><script src="operation_tasks.js"></script><script src="operation_progress.js"></script><script src="grcon_module_loader.js"></script>');return;
  }
  if (name.startsWith('/api/')) {res.writeHead(200, {'Content-Type':'application/json'}).end('{"ok":true}');return;}
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep)) {res.writeHead(403).end();return;}
  fs.readFile(file, (error, bytes) => {
    if (error) {res.writeHead(404).end();return;}
    if (name === '/grcon_service_worker.js' && process.env.GRCON_STARTUP_BASELINE) bytes = fs.readFileSync(process.env.GRCON_STARTUP_BASELINE);
    else if (name === '/grcon_service_worker.js' && legacy) bytes=Buffer.from(bytes.toString()+'\n(function(){let reloading=false;navigator.serviceWorker.addEventListener("controllerchange",()=>{if(reloading)return;reloading=true;location.reload();});})();');
    if (name === '/sw.js') bytes = Buffer.from(bytes.toString().replace(/const CACHE_NAME = .*;/, 'const CACHE_NAME = "startup-qa-' + revision + '";') + '\n// startup revision ' + revision);
    if (name === '/sw.js' && legacy) bytes=Buffer.from(bytes.toString()+'\nself.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));');
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
  });
});
async function untilController(page) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout:45000});return;}
    catch (error) {if (!/context was destroyed|navigation/i.test(error.message) || attempt === 4) throw error;}
  }
}
async function untilReady(page) {
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless:true});
  try {
    const context = await browser.newContext({viewport:{width:1366,height:900}});
    await context.route('**/*.supabase.co/**', route => route.fulfill({status:401,contentType:'application/json',body:'{"message":"QA isolado"}'}));
    const page = await context.newPage();let navigations = 0;
    page.on('framenavigated', frame => {if (frame === page.mainFrame()) navigations++;});
    await page.addInitScript(() => {
      sessionStorage.setItem('startup-qa-boots', String(Number(sessionStorage.getItem('startup-qa-boots') || 0) + 1));
      // Keep the real chunk functions, allowing only fixture latency/failure injection.
      let largeInput;
      Object.defineProperty(window,'GrconLargeInput',{configurable:true,get:()=>largeInput,set:value=>{largeInput={...value};}});
    });
    await page.goto(base, {waitUntil:'load'});
    if(legacy)await untilController(page);else await untilReady(page);
    await page.waitForTimeout(800);
    const firstBoots = await page.evaluate(() => Number(sessionStorage.getItem('startup-qa-boots')));
    if (process.env.GRCON_STARTUP_BASELINE) {
      assert.ok(firstBoots >= 2, 'baseline must reproduce the unwanted first-install reload');
      console.log(JSON.stringify({baseline:true,firstBoots,navigations}));return;
    }
    assert.equal(firstBoots, 1, 'first installation must not restart the application');
    assert.equal(navigations, 1);
    await page.addStyleTag({content:'html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script){visibility:visible!important}#grcon-cloud-auth{display:none!important}'});
    const realModules = await page.evaluate(async () => {
      const visited=[];let openingCards=0;
      const inspect=node=>{if(node.nodeType===1){if(node.matches('[data-operation^="module:"]'))openingCards++;openingCards+=node.querySelectorAll('[data-operation^="module:"]').length;}};
      const observer=new MutationObserver(entries=>{for(const entry of entries)for(const node of entry.addedNodes)inspect(node);});
      observer.observe(document.body,{childList:true,subtree:true});
      for(const view of ['requests','pdf-tools','cover-document']){await GRCONModuleLoader.ensureModule(view);visited.push(view);}
      await GRCONModuleLoader.ensureModule('control');
      await Promise.resolve();observer.disconnect();
      return {visited,openingCards};
    });
    assert.deepEqual(realModules,{visited:['requests','pdf-tools','cover-document'],openingCards:0});
    // LDs: a seleção deve sinalizar antes da leitura e exibir bytes reais.
    await page.evaluate(() => {
      window.startupQaReadEvents=[];
      const Reader=window.FileReader;
      window.FileReader=class extends Reader {
        constructor(){super();this.addEventListener('progress',event=>startupQaReadEvents.push({loaded:event.loaded,total:event.total}));}
        readAsArrayBuffer(file){setTimeout(()=>super.readAsArrayBuffer(file),200);}
      };
      const data=new DataTransfer();
      data.items.add(new File([new Uint8Array(4096)],'LD_01.xlsx'));
      data.items.add(new File([new Uint8Array(8192)],'LD_02.xlsx'));
      const input=document.getElementById('ld-input');input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForSelector('[data-operation="grdt-ld-import"][data-state="running"]');
    assert.equal(await page.locator('#analyze').isDisabled(),true);
    assert.equal(await page.locator('#ld-input').isDisabled(),true);
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-operation="grdt-ld-import"]')].at(0)?.dataset.state==='completed');
    assert.equal(await page.evaluate(()=>GrconRuntimeFiles.currentLd()?.name),'LD_01.xlsx');
    const ldBytes=await page.evaluate(()=>startupQaReadEvents.map(event=>event.loaded));
    assert.ok(ldBytes.includes(4096)&&ldBytes.includes(8192),'both native reads must report byte progress');
    assert.equal(await page.locator('#ld-input').isDisabled(),false);
    await page.evaluate(()=>{const data=new DataTransfer();data.items.add(new File([],'LD_vazia.xlsx'));const input=document.getElementById('ld-input');input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-operation="grdt-ld-import"]')].at(0)?.dataset.state==='failed');
    assert.equal(await page.evaluate(()=>GrconRuntimeFiles.currentLd()),null);
    assert.equal(await page.locator('#ld-input').isDisabled(),false);
    // Pasta: contagem por metadados, filtragem preservada e pintura antes do trabalho.
    await page.evaluate(()=>{
      window.startupQaFolderProgress=[];
      const original=GrconLargeInput.forEachInChunks;
      window.startupQaOriginalChunks=original;
      GrconLargeInput.forEachInChunks=async(items,callback,options)=>{
        await new Promise(resolve=>window.startupQaReleaseFolder=resolve);
        return original(items,callback,{...options,onProgress:(done,total)=>{startupQaFolderProgress.push({done,total});options.onProgress?.(done,total);}});
      };
      const files=new DataTransfer();
      for(let i=0;i<3600;i++)files.items.add(new File(['pdf'],'DOC-'+i+'.pdf',{lastModified:1234}));
      for(let i=0;i<25;i++)files.items.add(new File(['zip'],'IGNORADO-'+i+'.zip',{lastModified:1234}));
      files.items.add(new File(['pdf'],'DOC-0.pdf',{lastModified:1234}));
      const input=document.getElementById('pdf-input');input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForFunction(()=>typeof startupQaReleaseFolder==='function');
    assert.equal(await page.locator('[data-operation="grdt-folder-import"][data-state="running"] progress').count(),1);
    assert.equal(await page.locator('#pdf-input').isDisabled(),true);
    assert.equal(await page.locator('#analyze').isDisabled(),true);
    await page.evaluate(()=>startupQaReleaseFolder());
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-operation="grdt-folder-import"]')].at(0)?.dataset.state==='completed');
    const folderProgress=await page.evaluate(()=>startupQaFolderProgress.at(-1));
    assert.deepEqual(folderProgress,{done:3626,total:3626});
    assert.match(await page.locator('#pdf-meta').textContent(),/3[.\s]?600/);
    assert.match(await page.locator('#ignored-summary').textContent(),/26/);
    await page.evaluate(()=>{GrconLargeInput.forEachInChunks=async()=>{throw new Error('Falha prevista na pasta');};const data=new DataTransfer();data.items.add(new File(['pdf'],'RETRY.pdf'));const input=document.getElementById('pdf-input');input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-operation="grdt-folder-import"]')].at(0)?.dataset.state==='failed');
    assert.equal(await page.locator('#pdf-input').isDisabled(),false);
    await page.evaluate(()=>{GrconLargeInput.forEachInChunks=startupQaOriginalChunks;const data=new DataTransfer();data.items.add(new File(['pdf'],'RETRY.pdf'));const input=document.getElementById('pdf-input');input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-operation="grdt-folder-import"]')].at(0)?.dataset.state==='completed');
    assert.equal(await page.locator('#pdf-input').isDisabled(),false);
    await page.reload({waitUntil:'load'});await untilController(page);
    assert.equal(await page.evaluate(() => Number(sessionStorage.getItem('startup-qa-boots'))),2);
    await page.evaluate(() => {
      const field=document.createElement('input');field.id='startup-qa-draft';field.value='Conteúdo em edição';document.body.append(field);
      window.startupQaOperation=GrconOperations.begin('startup-qa-active','Operação em andamento');
      window.startupQaControllers=0;navigator.serviceWorker.addEventListener('controllerchange',()=>window.startupQaControllers++);
    });
    revision++;
    await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});
    await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
    const update=await page.evaluate(()=>({boots:Number(sessionStorage.getItem('startup-qa-boots')),draft:document.getElementById('startup-qa-draft')?.value,active:GrconOperations.isActive('startup-qa-active'),changes:startupQaControllers}));
    assert.deepEqual(update,{boots:2,draft:'Conteúdo em edição',active:true,changes:0});
    assert.equal(navigations,2,'waiting update must not navigate');
    await page.evaluate(()=>startupQaOperation.finish());await page.close();
    const reopened=await context.newPage();await reopened.goto(base,{waitUntil:'load'});await untilReady(reopened);
    await reopened.waitForFunction(async()=>JSON.stringify((await caches.keys()).filter(name=>name.startsWith('startup-qa-')))==='["startup-qa-2"]');
    await context.setOffline(true);await reopened.reload({waitUntil:'load'});
    assert.equal(await reopened.locator('html').getAttribute('data-app'),'GRCON','offline opening must keep working');
    await context.close();

    // A page already running the old reload listener must survive the rollout.
    legacy=true;revision++;
    const legacyContext=await browser.newContext();
    await legacyContext.route('**/*.supabase.co/**',route=>route.fulfill({status:401,contentType:'application/json',body:'{}'}));
    const legacyPage=await legacyContext.newPage();let legacyNavigations=0;
    legacyPage.on('framenavigated',frame=>{if(frame===legacyPage.mainFrame())legacyNavigations++;});
    await legacyPage.addInitScript(()=>sessionStorage.setItem('legacy-boots',String(Number(sessionStorage.getItem('legacy-boots')||0)+1)));
    await legacyPage.goto(base,{waitUntil:'load'});await untilController(legacyPage);await legacyPage.waitForTimeout(800);
    assert.equal(legacyNavigations,2,'fixture must reproduce the old first-install reload');
    await legacyPage.evaluate(()=>{const field=document.createElement('input');field.id='legacy-draft';field.value='Trabalho preservado';document.body.append(field);window.legacyOperation=GrconOperations.begin('legacy-active','Operação ativa');});
    legacy=false;revision++;
    await legacyPage.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});
    await legacyPage.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
    await legacyPage.waitForTimeout(300);
    const legacyRollout=await legacyPage.evaluate(()=>({boots:Number(sessionStorage.getItem('legacy-boots')),draft:document.getElementById('legacy-draft')?.value,active:GrconOperations.isActive('legacy-active')}));
    assert.deepEqual(legacyRollout,{boots:2,draft:'Trabalho preservado',active:true});assert.equal(legacyNavigations,2);
    await legacyContext.close();

    const loaderContext = await browser.newContext({serviceWorkers:'block'});
    const loaderPage = await loaderContext.newPage();await loaderPage.goto(base+'/__loader');
    await loaderPage.evaluate(async () => {await GRCONModuleLoader.ensureModule('additional-tools');await GRCONModuleLoader.ensureModule('control');});
    const noOpeningUi = () => loaderPage.evaluate(() => ({cards:document.querySelectorAll('.grcon-operation-progress').length,tasks:GrconOperationTasks.list().length}));
    assert.deepEqual(await noOpeningUi(), {cards:0,tasks:0});
    const failed = await loaderPage.evaluate(async () => {try {await GRCONModuleLoader.ensureModule('startup-retry-fixture.js');return false;}catch{return true;}});
    assert.equal(failed,true);failRetry=false;
    await loaderPage.evaluate(() => GRCONModuleLoader.ensureModule('startup-retry-fixture.js'));
    assert.equal(await loaderPage.evaluate(() => window.startupRetryLoaded),true);
    const delayed = loaderPage.evaluate(async () => {try{await GRCONModuleLoader.ensureModule('startup-context-fixture.js');return 'ready';}catch(e){return e.name;}});
    while(!releaseContext) await new Promise(resolve=>setTimeout(resolve,10));
    await loaderPage.evaluate(() => {GrconCloud.state.membership.workspace_id='other';});releaseContext();
    assert.equal(await delayed,'AbortError');
    await loaderPage.evaluate(() => GRCONModuleLoader.ensureModule('startup-context-fixture.js'));
    assert.deepEqual(await noOpeningUi(), {cards:0,tasks:0});
    const operation = await loaderPage.evaluate(async () => {const op=GrconOperations.begin('real-operation','Gerar arquivo');const visible=!!document.querySelector('[data-operation="real-operation"] progress');op.finish();return visible;});
    assert.equal(operation,true,'progress for real operations must remain available');
    await loaderContext.close();
    const result={passed:true,firstBoots,navigationsBeforeManualReload:1,update,waitingUpdate:true,legacyRollout,offline:true,realModules,moduleOpeningCards:0,retry:true,contextGuard:true,operationalProgress:true,ldBytes,folderProgress,folderAndLdErrorRecovery:true};
    if(process.env.GRCON_STARTUP_QA_OUTPUT){fs.mkdirSync(path.dirname(process.env.GRCON_STARTUP_QA_OUTPUT),{recursive:true});fs.writeFileSync(process.env.GRCON_STARTUP_QA_OUTPUT,JSON.stringify(result,null,2));}
    console.log(JSON.stringify(result));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
