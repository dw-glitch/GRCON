'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
(async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('content-type','text/html');return res.end('<!doctype html><html lang="pt-BR"><head><link rel="stylesheet" href="/grcon_cloud.css"></head><body><header class="runtime-status"></header></body></html>');}
  const file=path.resolve(process.cwd(),req.url.slice(1));if(!file.startsWith(process.cwd()+'/')||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('content-type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;try{
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}: {})});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(()=>{
   window.__master=true;window.GrconCloud={isMasterOwner:()=>window.__master,refreshMasterOwner:async()=>window.__master,loadInvitations:async()=>{},loadAuditEvents:async()=>{},state:{session:{user:{id:'master'},access_token:'synthetic-session'},membership:{workspace_id:'w1',role:'owner'},contracts:[{workspace_id:'w1',contract_id:'c1',code:'UHDT-D',active:true,settings:{}}],client:{functions:{invoke:async()=>({data:{ok:true,users:[]}})}}}};
  });
  await page.route('**/api/sigem-storage/**',async route=>{
   assert.equal(route.request().headers().authorization,'Bearer synthetic-session');
   await route.fulfill({json:{ok:true,source:'supabase',mode:'supabase',databaseBytes:1140681875,sourceBytes:939032576,snapshots:35,records:817351,externalStorageAuthorized:false,preflightApproved:false,turso:{configured:false,connected:false},cutoverReady:false,cleanupAllowed:false}});
  });
  await page.addScriptTag({path:path.resolve('contract_admin_app.js')});
  await page.locator('#grcon-administration-shortcut').click();await page.locator('[data-admin-section="storage"]').click();
  await page.getByText('817.351',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-storage-copy]').isDisabled(),true);
  assert.equal(await page.locator('[data-storage-refresh]').isVisible(),true);
  assert.equal(await page.locator('[data-admin-panel="storage"]').isVisible(),true);
  for(const width of [1440,1366,1024]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('#grcon-admin-dialog').evaluate(el=>el.scrollWidth>el.clientWidth),false);}
  fs.mkdirSync('artifacts/sigem-storage',{recursive:true});await page.screenshot({path:'artifacts/sigem-storage/master-storage.png',fullPage:true});
  await page.locator('#grcon-admin-close').click();await page.evaluate(()=>{window.__master=false;window.dispatchEvent(new Event('grcon:cloud-ready'));});
  assert.equal(await page.locator('#grcon-administration-shortcut').count(),0,'operator has no infrastructure shortcut');
  assert.deepEqual(errors,[]);console.log('SIGEM storage Chromium: exclusive Master panel, configuration status, blocked copy, auth header and desktop layout passed.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
