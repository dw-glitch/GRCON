'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const root=process.cwd(),server=http.createServer((req,res)=>{const name=req.url.split('?')[0];if(name==='/'){res.setHeader('content-type','text/html');return res.end('<!doctype html><html><head><link rel="stylesheet" href="/background-jobs.css"></head><body><header class="runtime-status"><button id="grcon-cloud-account">Conta</button></header></body></html>');}const file=path.join(root,name);if(!file.startsWith(root+'/')||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('content-type',file.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
  const job={id:'00000000-0000-4000-8000-000000000001',kind:'conference_report',title:'Relatório de conferência SIGEM',status:'running',progress:35,stage:'Gerando relatório',attempts:1,updated_at:new Date().toISOString()};
  await page.route('**/api/background-jobs/**',async route=>{const request=route.request(),url=new URL(request.url()),action=url.pathname.split('/').pop();calls.push({action,body:request.postData(),headers:request.headers()});if(action==='download')return route.fulfill({status:200,contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',body:Buffer.from('qa-xlsx')});return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(action==='technical'?{ok:true,jobs:[job],metrics:[{route:'vault',requests:20,errors:1,average_ms:30,max_ms:80}],scheduler:new Date().toISOString(),services:{workflows:true,r2:true,supabase:true,teamsConfigured:true}}:action==='submit'?{ok:true,job}:{ok:true,jobs:[job]})});});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(()=>{window.qaMaster=false;window.GrconNotify=()=>{};window.GrconCloud={state:{session:{user:{id:'operator'},access_token:'qa'},membership:{workspace_id:'w1'},client:{auth:{getSession:async()=>({data:{session:{access_token:'qa'}}})}}},isMasterOwner:()=>window.qaMaster,refreshMasterOwner:async()=>window.qaMaster};});
  await page.addScriptTag({path:path.join(root,'background_jobs_app.js')});
  assert.equal(await page.locator('#grcon-tasks-shortcut').count(),1);assert.equal(await page.locator('#grcon-technical-shortcut').count(),0);
  await page.locator('#grcon-tasks-shortcut').click();await page.getByText('Gerando relatório',{exact:true}).waitFor();
  assert.equal(await page.locator('progress').getAttribute('value'),'35');
  await page.locator('[data-jobs-close]').click();
  job.status='succeeded';job.progress=100;job.stage='Pronto';job.output_name='Relatorio.xlsx';
  await page.locator('#grcon-tasks-shortcut').click();await page.locator('[data-job-download]').waitFor();const download=page.waitForEvent('download');await page.locator('[data-job-download]').click();assert.equal((await download).suggestedFilename(),'Relatorio.xlsx');
  await page.locator('[data-jobs-close]').click();
  await page.evaluate(()=>{window.qaMaster=true;window.GrconAdministration={open:async section=>{window.qaAdminSection=section;}};window.dispatchEvent(new CustomEvent('grcon:permissions-changed'));});
  assert.equal(await page.locator('#grcon-tasks-shortcut').count(),1,'Tarefas continuam no cabeçalho do proprietário master');
  assert.equal(await page.locator('#grcon-technical-shortcut').count(),0,'Painel técnico permanece na Administração');
  await page.locator('#grcon-tasks-shortcut').click();await page.locator('[data-job-download]').waitFor();
  await page.locator('[data-jobs-close]').click();
  await page.evaluate(()=>window.GrconBackgroundJobs.open(true));
  assert.equal(await page.evaluate(()=>window.qaAdminSection),'technical','painel técnico só abre na Administração');
  await page.evaluate(()=>{window.qaMaster=false;window.dispatchEvent(new CustomEvent('grcon:permissions-changed'));});
  assert.equal(await page.locator('#grcon-technical-shortcut').count(),0);
  assert.equal(await page.locator('#grcon-tasks-shortcut').count(),1,'Tarefas permanecem disponíveis para operadores');
  assert.equal(await page.locator('#grcon-jobs-dialog').getAttribute('open'),null);
  await page.waitForFunction(()=>document.querySelector('#grcon-jobs-content')?.textContent==='');
  await page.evaluate(()=>window.GrconBackgroundJobs.submit('conference_report',{rows:[{document:'DOC-001'}]},'request-1'));
  const submit=calls.find(c=>c.action==='submit');assert.equal(submit.headers['x-grcon-kind'],'conference_report');assert.match(submit.headers['x-grcon-fingerprint'],/^[a-f0-9]{64}$/);assert.equal(JSON.parse(submit.body).rows[0].document,'DOC-001');
  await page.evaluate(()=>{window.GrconCloud.state.session=null;window.dispatchEvent(new CustomEvent('grcon:cloud-signed-out'));});assert.equal(await page.locator('#grcon-tasks-shortcut').count(),0);assert.equal(await page.locator('#grcon-jobs-dialog').count(),0);
  assert.deepEqual(errors,[]);console.log('Background jobs Chromium: persisted task list, progress, download, streaming submission, master-only technical panel and revocation passed.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
