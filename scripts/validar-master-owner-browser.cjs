'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), http=require('node:http');
const {chromium}=require('playwright');
const root=process.cwd();
(async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html><head><link rel="stylesheet" href="/grcon_cloud.css"></head><body><header class="runtime-status"><span>GRCON · UHDT-D</span></header><main><h1>Central de Controle de GRDT</h1></main></body></html>');}
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
  await page.addScriptTag({path:path.join(root,'contract_admin_app.js')});
  await page.locator('#grcon-users-shortcut').click();
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
  fs.mkdirSync('artifacts/master-owner',{recursive:true});await page.screenshot({path:'artifacts/master-owner/master-screen.png'});
  for(const role of ['owner','admin','operator']){
    await page.evaluate(role=>{window.__qa.master=false;window.GrconCloud.state.masterOwner=false;window.GrconCloud.state.membership.role=role;window.dispatchEvent(new CustomEvent('grcon:permissions-changed'));},role);
    assert.equal(await page.locator('#grcon-users-shortcut').count(),0,role+' has no shortcut');assert.equal(await page.locator('#grcon-admin-dialog').count(),0,role+' has no admin content');
  }
  assert.deepEqual(errors,[]);console.log('Master browser: protected master, ordinary owner editing, password flow, create account, temporary secret cleanup and exclusive DOM passed.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
