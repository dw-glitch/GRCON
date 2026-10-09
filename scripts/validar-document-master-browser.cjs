'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname==='/'?'index.html':decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{const type={'.js':'application/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.json':'application/json'}[path.extname(file)]||'application/octet-stream';const bytes=fs.readFileSync(file);res.writeHead(200,{'content-type':type});res.end(bytes);}catch(_){res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));server.unref();
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.GRCON_CHROMIUM_PATH||process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:720},acceptDownloads:true,serviceWorkers:'block'}),errors=[],calls=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
 await page.route('**/api/egrdt-teams/page**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:[]})}));
 const code='RL-5290.00-22313-856-C1O-017';const f={id:'00000000-0000-4000-8000-000000000010',document_code:code,revision:'0',file_name:code+'.pdf',file_version:1,is_active:false,size_bytes:3,sha256:'a'.repeat(64),emissions:[{egrdt_number:'QA-001'}],source_context:{purpose:'Construção',discipline:'Civil'}};
 await page.route('**/api/document-vault/**',async r=>{const url=new URL(r.request().url()),action=url.pathname.split('/').pop();calls.push({action,query:Object.fromEntries(url.searchParams)});let data={ok:true};if(action==='init'){const input=r.request().postDataJSON();data={ok:true,ready:true,file:{...f,id:'qa-local',file_name:input.fileName,sha256:input.sha256,file_version:2}};}if(action==='search')data={ok:true,results:[{code,label:'Relatório de qualidade',source:'sigem'}]};if(action==='master')data={ok:true,vault:[f],sigem:[{document:code,revision:'0',status:'Emitido'}],history:[{egrdt_number:'QA-001',generated_at:'2026-10-08',file:{document:code,revision:'0',purpose:'Construção'}}],requests:[{document:code,sheet:'Solicitações',data:{Responsável:'QA'}}],monitor:[{document_code:code,priority:'high',note:'QA'}],audit:[{action:'document_vault_download',created_at:'2026-10-08'}]};if(action==='detail')data={ok:true,file:f,versions:[{...f,file_version:2,is_active:true},f],audit:[{action:'document_vault_download',created_at:'2026-10-08'}]};if(action==='download'){await r.fulfill({status:200,body:'PDF',contentType:'application/pdf'});return;}await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.GrconCloud&&window.GrconDocumentMaster);
 await page.evaluate(()=>{window.GrconCloud.state.session={access_token:'qa',user:{id:'qa'}};window.GrconCloud.state.membership={workspace_id:'00000000-0000-4000-8000-000000000001',role:'owner'};});
 await page.addStyleTag({content:'html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script){visibility:visible!important}#grcon-cloud-auth{display:none!important}'});
 const localTrace=await page.evaluate(async code=>{
   const file=new File(['local QA'],code+'_A.docx',{type:'application/octet-stream'});
   const entry={file,fileProvenance:{source:'local',fileName:file.name,revision:'A',format:'docx',sizeBytes:file.size},item:{purpose:'Para Construção'},discipline:'Civil'};
   await window.GrconDocumentVault.persistEmissionFiles({entries:[entry]});
   return {id:entry.vaultFileId,provenance:entry.fileProvenance,stored:window.GrconDocumentVault.lookupSource(file)};
 },code);
 assert.equal(localTrace.id,'qa-local','selected local file is preserved by the actual upload path');
 assert.equal(localTrace.provenance.source,'local');assert.equal(localTrace.provenance.fileVersion,2);
 assert.equal(localTrace.provenance.sha256,require('node:crypto').createHash('sha256').update('local QA').digest('hex'));
 assert.equal(localTrace.stored.id,'qa-local');
 await page.evaluate(async code => {
   await window.GrconDocumentVault.enqueueFiles([new File(['queue QA'], code+'_0.pdf', {type:'application/pdf'})]);
 }, code);
 await page.waitForFunction(() => window.GrconDocumentVault.state.queue[0]?.status === 'done');
 assert.equal(await page.locator('#vault-queue-body [data-vault-detail]').count(), 1, 'completed upload renders its confirmed server file id');
 await page.locator('#document-master-open').click();await page.locator('#master-query').fill('RL-5290');await page.locator('[data-master-code]').first().waitFor();await page.locator('[data-master-code]').first().click();await page.waitForFunction(()=>document.getElementById('master-content').textContent.includes('QA-001'));
 for(const label of ['SIGEM','ProjectWise','GRDT / eGRDT','Arquivos no Cofre','Controle de Solicitações','Meu monitoramento','Auditoria'])assert.ok((await page.locator('#master-content').textContent()).includes(label));
 assert.match(await page.locator('#master-content').textContent(),/Base PW não carregada/,'missing PW source must not be presented as absent document');
 const download=page.waitForEvent('download');await page.locator('[data-master-download]').click();const d=await download;assert.equal(d.suggestedFilename(),code+'.pdf');
 await page.evaluate(id=>window.GrconDocumentMaster.openFile(id),f.id);await page.locator('#master-metadata').waitFor();assert.equal(await page.locator('[data-master-download]').count(),2);await page.locator('#master-metadata [name="purpose"]').fill('Para Construção');await page.locator('#master-metadata button').click();await page.waitForFunction(()=>document.getElementById('master-status').textContent==='Metadados atualizados.');assert.ok(calls.some(c=>c.action==='metadata'));
 const bounds=await page.locator('#document-master-dialog').boundingBox();assert.ok(bounds.width<=1280&&bounds.height<=720,'notebook modal fits viewport');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('grcon:contract-context-changed')));assert.equal(await page.locator('#document-master-dialog').evaluate(d=>d.open),false);assert.equal(await page.locator('#master-content').textContent(),'');
 assert.deepEqual(errors,[]);console.log('Chromium Master: global search, consolidated sources, unavailable PW, historical versions, exact download, metadata, notebook bounds and contract reset passed.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
