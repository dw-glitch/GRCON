'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let revision = 1, failRetry = true, releaseContext;
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
    if (name === '/sw.js') bytes = Buffer.from(bytes.toString().replace(/const CACHE_NAME = .*;/, 'const CACHE_NAME = "startup-qa-' + revision + '";') + '\n// startup revision ' + revision);
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
  });
});
async function untilController(page) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout:45000});return;}
    catch (error) {if (!/context was destroyed|navigation/i.test(error.message) || attempt === 4) throw error;}
  }
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
    await page.addInitScript(() => {sessionStorage.setItem('startup-qa-boots', String(Number(sessionStorage.getItem('startup-qa-boots') || 0) + 1));});
    await page.goto(base, {waitUntil:'load'});
    await untilController(page);
    await page.waitForTimeout(800);
    const firstBoots = await page.evaluate(() => Number(sessionStorage.getItem('startup-qa-boots')));
    if (process.env.GRCON_STARTUP_BASELINE) {
      assert.ok(firstBoots >= 2, 'baseline must reproduce the unwanted first-install reload');
      console.log(JSON.stringify({baseline:true,firstBoots,navigations}));return;
    }
    assert.equal(firstBoots, 1, 'first installation must not restart the application');
    assert.equal(navigations, 1);
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
    await page.evaluate(() => {
      const field = document.createElement('input');field.id='startup-qa-draft';field.value='Conteúdo em edição';document.body.append(field);
      window.startupQaOperation = GrconOperations.begin('startup-qa-active','Operação em andamento');
      window.startupQaControllers = 0;navigator.serviceWorker.addEventListener('controllerchange', () => window.startupQaControllers++);
    });
    revision++;
    await page.evaluate(async () => {await (await navigator.serviceWorker.getRegistration()).update();});
    await page.waitForFunction(() => window.startupQaControllers >= 1, null, {timeout:45000});
    await page.waitForTimeout(300);
    const update = await page.evaluate(() => ({boots:Number(sessionStorage.getItem('startup-qa-boots')),draft:document.getElementById('startup-qa-draft')?.value,active:GrconOperations.isActive('startup-qa-active')}));
    assert.deepEqual(update, {boots:1,draft:'Conteúdo em edição',active:true});
    assert.equal(navigations, 1, 'background update must not navigate');
    await page.evaluate(() => window.startupQaOperation.finish());
    await page.reload({waitUntil:'load'});await untilController(page);
    assert.equal(await page.evaluate(() => Number(sessionStorage.getItem('startup-qa-boots'))), 2, 'only the requested reload may restart');
    const cache = await page.evaluate(async () => (await caches.keys()).filter(name => name.startsWith('startup-qa-')));
    assert.deepEqual(cache, ['startup-qa-2']);
    await context.setOffline(true);
    await page.reload({waitUntil:'load'});
    assert.equal(await page.locator('html').getAttribute('data-app'), 'GRCON', 'offline opening must keep working');
    await context.close();

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
    const result={passed:true,firstBoots,navigationsBeforeManualReload:1,update,offline:true,realModules,moduleOpeningCards:0,retry:true,contextGuard:true,operationalProgress:true};
    if(process.env.GRCON_STARTUP_QA_OUTPUT){fs.mkdirSync(path.dirname(process.env.GRCON_STARTUP_QA_OUTPUT),{recursive:true});fs.writeFileSync(process.env.GRCON_STARTUP_QA_OUTPUT,JSON.stringify(result,null,2));}
    console.log(JSON.stringify(result));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
