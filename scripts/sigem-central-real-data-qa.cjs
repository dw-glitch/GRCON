'use strict';
// Read-only local homology: pass a snapshot exported through authorized database reads.
// Operational data and screenshots are deliberately excluded from git and CI uploads.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
(async()=>{
 const fixturePath=process.argv[2];if(!fixturePath)throw Error('Informe o caminho do snapshot de homologação.');
 const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8')),root=process.cwd();
 const server=http.createServer((req,res)=>{
  if(req.url==='/qa'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html lang="pt-BR"><body><section id="sigem-module"></section></body></html>');}
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/qa');
  for(const file of ['grcon_contracts.js','discipline_resolver.js','core.js','history_core.js','posting_conference_core.js','posting_conference_refinement.js','sigem_posting_central_core.js','sigem_posting_central_query.js','sigem_posting_central_render.js','sigem_posting_central_tracking.js','allocation_registry_core.js','document_allocation_context.js','requests_control_core.js','xlsx.full.min.js'])await page.addScriptTag({path:path.join(root,file)});
  await page.evaluate(f=>{
   const workspace=f.history[0].workspaceId;window.qaFixture=f;
   window.GrconCloud={state:{membership:{workspace_id:workspace,role:'owner'},session:{user:{id:'local-readonly-homology'}},online:true},loadClassificationHistory:async()=>f.history};
   window.GrconSharedSigemQuery={state:{workspace},listVersions:async()=>f.versions,current:()=>({records:f.records,meta:{snapshotId:f.versions[0].snapshot_id,fileName:f.versions[0].file_name,referenceDate:f.versions[0].metadata.referenceDate}})};
   const meta=kind=>f.aux.metas.find(m=>m.kind===kind);
   const planned={id:meta('planned').id,keys:new Set(f.aux.planned)};
   const central={id:meta('allocation').id,fileName:meta('allocation').file_name,index:window.GrconAllocationRegistryCore.buildIndex(f.aux.allocation)};
   const requests=window.GrconRequestsControlCore.buildIndex(f.aux.requests);
   window.GrconAllocationRegistry={resolve:document=>window.GrconDocumentAllocationContext.resolve(document,planned,central),fiscalComments:document=>window.GrconAllocationRegistryCore.fiscalCommentsForDocument(document,central.index)};
   window.GrconRequestsControl={current:()=>({id:meta('requests').id}),find:document=>window.GrconRequestsControlCore.find(requests,document)};
   window.GrconCloud.state.client={rpc:(name)=>{
    if(name==='grcon_monitor_targets')return Promise.resolve({data:[]});
    if(name==='grcon_sigem_compare_versions')return Promise.resolve({data:'readonly-real-comparison'});
    if(name==='grcon_sigem_comparison_rows')return {range:async(a,b)=>({data:f.changes.slice(a,b+1)})};
    return Promise.resolve({error:{message:'A homologação não permite gravação operacional.'}});
   }};
   window.GRCONModuleLoader={ensureModule:async()=>{}};window.GrconNotify=()=>{};window.XLSX.writeFile=wb=>{window.exported=wb;};
  },fixture);
  await page.addStyleTag({path:path.join(root,'sigem-posting-central.css')});
  const started=Date.now();await page.addScriptTag({path:path.join(root,'sigem_posting_central_app.js')});
  await page.waitForFunction(()=>window.GrconSigemCentralUi.state.data?.documents.length>0,null,{timeout:60000});
  const initialMs=Date.now()-started;
  assert.match(await page.locator('#sigem-central-base').innerText(),/compartilhado completo/);
  assert.ok(await page.locator('tr[data-scc-index]').count()<60,'janela virtual limitada');
  const metrics=await page.evaluate(()=>{
   const s=window.GrconSigemCentralUi.state,d=s.data,f=window.qaFixture,C=window.GrconSigemCentralCore.Conference;
   const official=C.reconcile(f.history,f.records,{}, {baseReferenceDate:f.versions[0].metadata.referenceDate});
   const differences=d.revisions.filter(row=>!official.rows.some(r=>r.key===row.key&&r.status===row.status));
   return {documents:d.documents.length,revisions:d.revisions.length,grdts:d.grdts.length,officialDifferences:differences.length,withAllocation:d.documents.filter(r=>r.allocation).length,withRequests:d.documents.filter(r=>r.requestsCount>0).length};
  });
  assert.equal(metrics.officialDifferences,0,'paridade com o motor oficial');assert.equal(metrics.grdts,fixture.history.length);
  assert.ok(metrics.withAllocation>0);assert.ok(metrics.withRequests>0);
  const sample=fixture.history.at(-1);
  await page.evaluate(id=>window.GrconSigemCentralUi.openTarget('grdt',id),sample.cloudId);
  assert.match(await page.locator('#sigem-central-detail').innerText(),new RegExp(sample.egrdtNumber.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  await page.locator('.scc-close').click();
  await page.locator('[data-scc-view="evolucao"]').click();await page.locator('#scc-compare-bases').click();
  await page.waitForFunction(()=>window.GrconSigemCentralUi.state.comparisonRows.length===window.qaFixture.changes.length);
  assert.equal(await page.evaluate(()=>window.GrconSigemCentralUi.state.filtered.rows.length),fixture.changes.length);
  await page.locator('#scc-change-type').selectOption('SEM_ALTERACAO');
  assert.equal(await page.evaluate(()=>window.GrconSigemCentralUi.state.filtered.rows.length),fixture.changes.filter(r=>r.change_type==='SEM_ALTERACAO').length);
  await page.locator('#scc-query').fill(fixture.changes.find(r=>r.change_type!=='SEM_ALTERACAO').document_code);
  await page.locator('#scc-change-type').selectOption('');
  await page.locator('#scc-export').click();
  assert.ok(await page.evaluate(()=>window.exported.SheetNames.includes('Versões comparadas')));
  await page.setViewportSize({width:1024,height:768});
  assert.equal(await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth)),0,'sem overflow da página em 1024px');
  await page.evaluate(()=>{window.GrconCloud.state.membership.workspace_id='empty-contract';window.GrconCloud.loadClassificationHistory=async()=>[];window.dispatchEvent(new CustomEvent('grcon:contract-context-changed'));});
  await page.waitForFunction(()=>window.GrconSigemCentralUi.state.workspace==='empty-contract');
  assert.equal(await page.locator('tr[data-scc-index]').count(),0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'approved',input:{history:fixture.history.length,query:fixture.records.length,planned:fixture.aux.planned.length,allocation:fixture.aux.allocation.length,requests:fixture.aux.requests.length,evolution:fixture.changes.length},metrics,initialMs}));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
