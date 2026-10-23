'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{if(req.url==='/__conference_fixture__'){res.setHeader('content-type','text/html');return res.end('<html><head><meta charset="utf-8"></head><body><main class="workspace"></main></body></html>');}const file=path.join(root,new URL(req.url,'http://localhost').pathname);try{res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
 const page=await browser.newPage({viewport:{width:1366,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 fs.mkdirSync(path.join(root,'artifacts/conference-deadlines'),{recursive:true});
 await page.goto('http://127.0.0.1:'+server.address().port+'/__conference_fixture__');
 // A separate minimal document loads the real Conference modules, without auth/network background work.
 await page.setContent('<html><head><meta charset="utf-8"></head><body><main class="workspace"></main></body></html>');
 await page.evaluate(()=>{window.GrconNotify=()=>{};window.GRCONModuleLoader=undefined;
 window.GrconHistory={read:()=>[{id:'emission1',egrdtNumber:'GRDT-001',generatedAt:'2026-10-21T15:00:00Z',files:[{document:'DOC-001',revision:'0',title:'Título original emitido na GRDT <seguro>',discipline:'Civil'}]}]};
 window.GrconSharedSigemQuery=undefined;window.GrconDocumentTasks=undefined;
 window.GrconCloud={state:{session:{user:{id:'author'}},membership:{workspace_id:'workspace',contract_id:'contract',role:'operator'},online:true,client:{rpc:async(_, {operation,input})=>{
   if(operation==='users')return {data:[{id:'author',name:'Autor'},{id:'assigned',name:'Responsável externo'}]};
   if(operation==='list')return {data:window.fixtureTask?[window.fixtureTask]:[]};
   if(operation==='save'){window.fixtureTask={document_key:'DOC-001',document_code:'DOC-001',created_by:'author',assignee_id:input.assigneeId,responsible:'Responsável externo',priority:input.priority,due_date:input.dueDate,version:1};return {data:window.fixtureTask};}
   if(operation==='get')return {data:window.fixtureTask};
 }}}};});
 for(const file of ['design-system.css','posting-conference.css'])await page.addStyleTag({url:'/'+file});
 for(const file of ['posting_conference_core.js','posting_conference_refinement.js','posting_conference_report.js','document_task_queue.js','posting_conference_app.js'])await page.addScriptTag({url:'/'+file});
 await page.evaluate(()=>window.GrconPostingConferenceUi.activate());
 await page.waitForSelector('.pc-grdt-title');assert.match(await page.locator('.pc-grdt-title').first().innerText(),/Título original emitido/);
 assert.equal(await page.locator('.pc-grdt-title seguro').count(),0,'title escaped');
 await page.locator('[data-pc-organize]').first().click();await page.locator('select[name=assigneeId]').selectOption('assigned');
 await page.screenshot({path:path.join(root,'artifacts/conference-deadlines/manager.png'),fullPage:true});
 await page.locator('select[name=priority]').selectOption('urgente');await page.locator('input[name=dueDate]').fill('2026-10-23');
 await page.getByRole('button',{name:'Salvar prazo',exact:true}).click();await page.waitForSelector('dialog',{state:'detached'});
 assert.match(await page.locator('main').innerText(),/23\/10\/2026/);
 await page.evaluate(async()=>{window.GrconCloud.state.session.user.id='assigned';window.GrconDocumentTasks.state.items.clear();await window.GrconDocumentTasks.load();window.GrconPostingConferenceUi.render();});
 await page.locator('[data-pc-organize]').first().click();assert.equal(await page.getByRole('button',{name:'Salvar prazo',exact:true}).count(),0);assert.equal(await page.locator('input[name=dueDate]').isDisabled(),true);assert.equal(await page.locator('input[name=dueDate]').inputValue(),'2026-10-23');
 await page.getByRole('button',{name:'Fechar',exact:true}).click();
 await page.evaluate(()=>window.GrconPostingConferenceUi.state.view='pending');await page.evaluate(()=>window.GrconPostingConferenceUi.render());
 assert.match(await page.locator('.pc-pending-table').innerText(),/Título original emitido/);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('.pc-grdt-title').first().isVisible());
 fs.mkdirSync(path.join(root,'artifacts/conference-deadlines'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts/conference-deadlines/mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('Conference browser: immutable GRDT title, escaping, user selection, save, shared visibility, author-only controls, pending list and mobile passed.');
 }finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
