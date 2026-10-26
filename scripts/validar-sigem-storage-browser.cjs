'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const crypto=require('node:crypto');
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
  let copyScenario='disabled',inventoryReads=0,steps=[];
  const checksums=['a'.repeat(64),'b'.repeat(64),'c'.repeat(64)];
  const digest=checksums.reduce((previous,checksum)=>crypto.createHash('sha256').update(previous+'\n'+checksum).digest('hex'),'0'.repeat(64));
  await page.route('**/api/sigem-storage/**',async route=>{
   assert.equal(route.request().headers().authorization,'Bearer synthetic-session');
   const action=new URL(route.request().url()).pathname.split('/').pop();steps.push(action);
   const input=route.request().postDataJSON();
   if(copyScenario!=='disabled'){
    let result;
    if(action==='inventory'){inventoryReads++;result={snapshots:[{id:'s1',record_count:501,metadata:{generation:copyScenario==='changed'&&inventoryReads>1?2:1}}],pendingSnapshots:copyScenario==='pending'?1:0};}
    else if(action==='copy')result={after:input.after+Math.min(250,501-input.after)};
    else if(action==='seal')result={count:501,checksum:copyScenario==='hash'?'f'.repeat(64):digest,manifestKey:'sigem-backups/v1/test/manifest.json',manifestHash:'d'.repeat(64)};
    else if(action==='audit')result={after:input.after+Math.min(250,501-input.after),count:copyScenario==='incomplete'?0:Math.min(250,501-input.after),checksum:checksums[input.after/250],snapshotChecksum:copyScenario==='hash'?'f'.repeat(64):digest};
    else result={source:'supabase',mode:'supabase',records:501,snapshots:1,externalStorageAuthorized:true,preflightApproved:true,turso:{configured:true,connected:true,databaseBytes:4096}};
    return route.fulfill({json:{ok:true,...result}});
   }
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
  for(const scenario of ['success','hash','incomplete','changed','pending']){
   copyScenario=scenario;inventoryReads=0;steps=[];
   await page.locator('[data-storage-refresh]').click();
   await page.waitForFunction(()=>document.querySelector('[data-storage-copy]')?.disabled===false);
   await page.locator('[data-storage-copy]').click();
   await page.waitForFunction(()=>document.querySelector('[data-storage-copy]')?.disabled===false&&Boolean(document.querySelector('[data-storage-progress]')?.textContent));
   const downloadEvent=page.waitForEvent('download');await page.locator('[data-storage-report]').click();
   const download=await downloadEvent,report=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
   assert.equal(report.migration.complete,scenario==='success');
   assert.equal(report.source,'supabase');assert.equal(report.migration.cutoverReady,false);assert.equal(report.migration.cleanupAllowed,false);
   assert.ok(!JSON.stringify(report).includes('synthetic-session'));
   if(scenario==='success'){
    assert.equal(report.migration.validatedRecords,501);assert.equal(report.migration.snapshots[0].fullAudit,true);
    assert.equal(report.migration.snapshots[0].checksum,digest);assert.equal(report.migration.inventoryStable,true);
    assert.deepEqual(steps.filter(x=>['copy','seal','audit'].includes(x)),['copy','copy','copy','seal','audit','audit','audit']);
    await page.screenshot({path:'artifacts/sigem-storage/verified-copy.png',fullPage:true});
   }else if(scenario==='changed')assert.equal(report.migration.inventoryStable,false);
   else if(scenario==='pending')assert.equal(steps.includes('copy'),false,'pending uploads block the copy');
   else assert.match(report.migration.error,/SIGEM_AUDIT_/);
  }
  await page.locator('#grcon-admin-close').click();await page.evaluate(()=>{window.__master=false;window.dispatchEvent(new Event('grcon:cloud-ready'));});
  assert.equal(await page.locator('#grcon-administration-shortcut').count(),0,'operator has no infrastructure shortcut');
  assert.deepEqual(errors,[]);console.log('SIGEM storage Chromium: Master-only panel, configuration, desktop layout, full audited copy, hash corruption, incomplete audit, source changes, pending imports and safe report passed.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

