'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), http=require('node:http');
const {chromium}=require('playwright');
const root=process.cwd();
(async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html><head><link rel="stylesheet" href="/grcon_cloud.css"><link rel="stylesheet" href="/background-jobs.css"></head><body><header class="runtime-status"><span>GRCON · UHDT-D</span></header><main><h1>Central de Controle de GRDT</h1></main></body></html>');}
  const file=path.resolve(root,req.url.slice(1));if(!file.startsWith(root+'/')){res.statusCode=403;return res.end();}
  if(!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;try { browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']} : {})}); } catch(e) { server.close();throw e; }
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const source=fs.readFileSync('grcon_cloud_app.js','utf8').replace(/\n  init\(\);\n\}\)\(\);\s*$/,'\n window.__masterTest = { state, createAccountMenu, updateAccountMenu, loadMembers };\n})();');
  await page.addScriptTag({content:source});
  await page.evaluate(()=>{
    const master={id:'master',name:'Vinicio Silva',email:'vinicio@example.test',role:'owner',active:true,isMaster:true};
    const owner={id:'owner',name:'Colaboradora QA',email:'owner@example.test',role:'owner',active:true};
    window.__qa={master:true,users:[master,owner],calls:[]};
    const cloud=window.GrconCloud;
    Object.assign(cloud.state,{session:{user:{id:'master',email:master.email}},masterOwner:true,masterOwnerUserId:'master',membership:{workspace_id:'w1',role:'owner'},contracts:[{workspace_id:'w1',contract_id:'c1',code:'UHDT-D',active:true,settings:{}}]});
    const chain={select(){return this;},eq(){return this;},in(){return this;},order:async()=>({data:[]})};
    cloud.state.client={rpc:async()=>({data:window.__qa.master,error:null}),from:()=>chain,functions:{invoke:async(name,{body})=>{
      window.__qa.calls.push({name,...body});
      if(name==='owner-change-user-password')return {data:{ok:true}};
      if(body.operation==='list')return {data:{ok:true,contract:{code:'UHDT-D'},users:window.__qa.users}};
      if(body.operation==='update'){Object.assign(window.__qa.users.find(u=>u.id===body.userId),body);return {data:{ok:true}};}
      return {data:{ok:true,user:{id:'new'},temporaryPassword:'QATemporary123!'}};
    }}};
    cloud.loadInvitations=async()=>{};cloud.loadAuditEvents=async()=>{};
    window.__masterTest.createAccountMenu();window.__masterTest.updateAccountMenu();
  });
  let holdTechnical = false, releaseTechnical;
  await page.route('**/api/background-jobs/**',async route=>{
    const url=new URL(route.request().url());
    await page.evaluate(url=>window.__qa.calls.push({api:url}),url.pathname+url.search);
    if(holdTechnical && url.pathname.endsWith('/technical')) await new Promise(resolve=>{releaseTechnical=resolve;});
    await route.fulfill({json:{ok:true,jobs:[{id:'job1',title:'Relatório QA',workspace_id:url.searchParams.get('workspace'),status:'succeeded',updated_at:new Date().toISOString(),progress:100,stage:'Pronto',output_name:'QA.xlsx'}],services:{workflows:true,r2:true,supabase:true,teamsConfigured:true},scheduler:new Date().toISOString(),metrics:[]}});
  });
  await page.evaluate(()=>{window.GrconCloud.state.client.auth={getSession:async()=>({data:{session:{access_token:'qa-test'}}})};window.GrconCloud.state.contracts.push({workspace_id:'w2',contract_id:'c2',code:'UGH',active:true,settings:{}});});
  await page.addScriptTag({path:path.join(root,'contract_admin_app.js')});
  await page.addScriptTag({path:path.join(root,'background_jobs_app.js')});
  assert.equal(await page.locator('.runtime-status #grcon-administration-shortcut').count(),1);
  assert.equal(await page.locator('.runtime-status #grcon-tasks-shortcut').count(),1,'master sees operational tasks in header');
  assert.equal(await page.locator('.runtime-status #grcon-technical-shortcut, #grcon-users-shortcut').count(),0);
  await page.locator('#grcon-administration-shortcut').click();
  await page.locator('[data-admin-edit="owner"]').waitFor();
  assert.equal(await page.locator('[data-admin-edit="master"]').count(),0);
  assert.equal(await page.locator('#grcon-cloud-account-menu select[data-member-role]').count(),0);
  assert.equal(await page.locator('#grcon-administration').count(),0);
  await page.locator('[data-admin-edit="owner"]').click();
  await page.locator('#admin-user-role').selectOption('admin');
  await page.locator('#grcon-admin-user-form button[type="submit"]').click();
  await page.waitForFunction(()=>window.__qa.calls.some(c=>c.operation==='update'&&c.role==='admin'));
  await page.locator('[data-admin-password="owner"]').click();
  await page.locator('#grcon-admin-new-password').fill('NovaSenha123!');
  await page.locator('#grcon-admin-confirm-password').fill('NovaSenha123!');
  await page.locator('#grcon-admin-password-next').click();
  await page.locator('#grcon-admin-password-submit').click();
  await page.waitForFunction(()=>window.__qa.calls.some(c=>c.name==='owner-change-user-password'&&c.workspaceId==='w1'));
  await page.locator('#admin-user-new').click();await page.locator('#admin-user-name').fill('Operador QA');await page.locator('#admin-user-email').fill('qa@example.test');
  await page.locator('#grcon-admin-user-form button[type="submit"]').click();await page.locator('#admin-user-password').waitFor({state:'visible'});
  await page.locator('#admin-user-cancel').click();assert.equal(await page.locator('#admin-user-password').textContent(),'');
  await page.locator('[data-admin-section="contracts"]').click();
  assert.equal(await page.locator('#grcon-admin-contract-form').isVisible(),true);
  await page.locator('#admin-contract-new').click();assert.equal(await page.locator('#admin-contract-id').inputValue(),'');
  assert.equal(await page.locator('[data-admin-section="tasks"],[data-admin-panel="tasks"]').count(),0,'tasks are no longer embedded in administration');
  await page.locator('#grcon-admin-contract').selectOption('w2');
  assert.equal(await page.evaluate(()=>window.GrconCloud.state.membership.workspace_id),'w1','administration selection does not change active operational contract');
  await page.evaluate(()=>window.GrconBackgroundJobs.submit('conference_report',{rows:[]},'qa-test'));
  assert.equal(await page.evaluate(()=>window.__qa.calls.some(c=>c.api==='/api/background-jobs/submit?workspace=w1')),true,'submissions always use the operational contract');
  await page.locator('#grcon-admin-close').click();
  await page.locator('#grcon-tasks-shortcut').click();
  await page.locator('#grcon-jobs-dialog [data-job-download]').waitFor();
  assert.equal(await page.evaluate(()=>window.__qa.calls.some(c=>c.api==='/api/background-jobs/list?workspace=w1')),true,'header tasks read operational contract');
  await page.locator('#grcon-jobs-dialog [data-jobs-close]').click();
  await page.locator('#grcon-administration-shortcut').click();
  await page.locator('[data-admin-edit="owner"]').waitFor();
  await page.locator('[data-admin-section="technical"]').click();
  await page.locator('#grcon-admin-technical .grcon-jobs-kpis').waitFor();
  assert.equal(await page.locator('#grcon-admin-contract').isVisible(),false);
  await page.locator('[data-admin-section="activity"]').click();
  assert.equal(await page.locator('#grcon-cloud-audit-panel').isVisible(),true);
  assert.equal(await page.evaluate(()=>window.GrconBackgroundJobs.state.open),false,'polling stops on leaving diagnostics');
  holdTechnical=true;
  await page.locator('[data-admin-section="technical"]').click();
  for(let attempt=0;!releaseTechnical && attempt<500;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(typeof releaseTechnical,"function","technical request started");
  await page.locator('[data-admin-section="users"]').click();
  releaseTechnical();holdTechnical=false;
  await page.locator('[data-admin-edit="owner"]').waitFor();
  assert.equal(await page.locator('#grcon-admin-technical .grcon-jobs-kpis').count(),0,'late response cannot repopulate hidden diagnostics');
  for(const width of [1366,1024]){
    await page.setViewportSize({width,height:768});
    assert.equal(await page.locator('#grcon-admin-dialog').evaluate(el=>el.scrollWidth>el.clientWidth),false,'no page overflow at '+width);
    assert.equal(await page.locator('#grcon-admin-close').isVisible(),true);
  }
  await page.setViewportSize({width:1440,height:1000});
  fs.mkdirSync('artifacts/master-owner',{recursive:true});await page.screenshot({path:'artifacts/master-owner/master-screen.png'});
  await page.locator('#grcon-admin-close').click();
  await page.evaluate(()=>window.GrconBackgroundJobs.open(true));
  await page.locator('#grcon-admin-technical .grcon-jobs-kpis').waitFor();
  for(const role of ['owner','admin','operator','viewer']){
    await page.evaluate(role=>{window.__qa.master=false;window.GrconCloud.state.masterOwner=false;window.GrconCloud.state.membership.role=role;window.dispatchEvent(new CustomEvent('grcon:permissions-changed'));},role);
    assert.equal(await page.locator('#grcon-administration-shortcut').count(),0,role+' has no shortcut');assert.equal(await page.locator('#grcon-admin-dialog').count(),0,role+' has no admin content');
  }
  await page.evaluate(()=>window.GrconAdministration.open());
  await page.evaluate(()=>window.GrconBackgroundJobs.open(true));
  assert.equal(await page.locator('#grcon-admin-dialog').count(),0,'direct API cannot open administration for another profile');
  assert.equal(await page.locator('#grcon-tasks-shortcut').count(),1,'operational tasks remain available to the team');
  await page.locator('#grcon-tasks-shortcut').click();await page.locator('#grcon-jobs-dialog [data-job-download]').waitFor();
  assert.equal(await page.locator('.grcon-jobs-kpis').count(),0,'ordinary tasks never show diagnostics');
  await page.evaluate(()=>{window.GrconCloud.state.session=null;window.GrconCloud.state.membership=null;window.dispatchEvent(new Event('grcon:cloud-signed-out'));});
  assert.equal(await page.locator('#grcon-jobs-dialog, #grcon-admin-dialog, #grcon-administration-shortcut').count(),0);
  assert.deepEqual(errors,[]);console.log('Master administration browser: single entry, embedded sections, contracts, user/password flows, isolated task context, diagnostics, navigation cleanup, notebook layout, role denial, direct access denial and sign-out cleanup passed.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
