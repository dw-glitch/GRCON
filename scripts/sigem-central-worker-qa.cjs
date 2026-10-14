'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
(async()=>{
 const root=process.cwd(),server=http.createServer((req,res)=>{
  if(req.url==='/qa'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html><body><section id="sigem-module"></section></body></html>');}
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/qa');
  for(const file of ['grcon_contracts.js','discipline_resolver.js','core.js','history_core.js','posting_conference_core.js','posting_conference_refinement.js','sigem_posting_central_core.js','sigem_posting_central_query.js','sigem_posting_central_render.js','xlsx.full.min.js'])await page.addScriptTag({path:path.join(root,file)});
  await page.evaluate(()=>{
   const codes=Array.from({length:2500},(_,i)=>`RL-5290.00-22313-91B-C1O-${String(i+1).padStart(4,'0')}`);
   window.GrconCloud={state:{membership:{workspace_id:'W1'},session:{user:{id:'U1'}},online:true},loadClassificationHistory:async()=>codes.map((document,i)=>({id:'h-'+i,workspaceId:'W1',egrdtNumber:'GRDT-'+i,generatedAt:'2026-10-12T10:00:00Z',files:[{document,revision:'A',title:'Relatório '+i}]}))};
   window.GrconSharedSigemQuery={state:{workspace:'W1'},current:()=>({records:codes.map(document=>({document,revision:'A',status:'Em análise'})),meta:{fileName:'Fixture.xlsx',referenceDate:'2026-10-13'}})};
   window.GRCONModuleLoader={ensureModule:async()=>{}};window.GrconNotify=()=>{};
   window.XLSX.writeFile=wb=>{window.exported=wb;};
  });
  await page.addStyleTag({path:path.join(root,'sigem-posting-central.css')});
  await page.addScriptTag({path:path.join(root,'sigem_posting_central_app.js')});
  await page.waitForFunction(()=>window.GrconSigemCentralUi.state.data?.documents.length===2500,null,{timeout:30000});
  assert.match(await page.locator('#sigem-central-base').innerText(),/compartilhado completo/);
  assert.ok(await page.locator('tr[data-scc-index]').count()<60);
  await page.evaluate(()=>{const el=document.getElementById('sigem-central-table-scroll');el.scrollTop=el.scrollHeight;});
  await page.waitForTimeout(100);
  assert.match(await page.locator('#sigem-central-tbody').innerText(),/2500/);
  const last=await page.locator('tr[data-scc-index]').last().getAttribute('data-scc-index');assert.equal(last,'2499');
  const before=await page.locator('#sigem-central-table-scroll').evaluate(el=>el.scrollHeight);
  await page.evaluate(()=>{const el=document.getElementById('sigem-central-table-scroll');el.scrollTop=el.scrollHeight;});await page.waitForTimeout(60);
  assert.equal(await page.locator('#sigem-central-table-scroll').evaluate(el=>el.scrollHeight),before);
  const scroll=await page.locator('#sigem-central-table-scroll').evaluate(el=>el.scrollTop);
  await page.locator('#scc-technical-open').click();await page.locator('#scc-back').click();
  assert.equal(await page.locator('#sigem-central-table-scroll').evaluate(el=>el.scrollTop),scroll);
  await page.locator('#scc-list-toggle').click();await page.locator('#scc-list-input').fill('RL-5290.00-22313-91B-C1O-0001\nRL-5290.00-22313-91B-C1O-2500');
  assert.equal(await page.locator('tr[data-scc-index]').count(),2);
  await page.locator('[data-scc-view="grdts"]').click();assert.equal(await page.locator('tr[data-scc-index]').count(),2,'índices sobrevivem ao Worker');
  await page.locator('#scc-export').click();
  const excel=await page.evaluate(()=>({sheets:window.exported.SheetNames,rows:window.XLSX.utils.sheet_to_json(window.exported.Sheets['Documentos das GRDTs'],{header:1}),info:window.XLSX.utils.sheet_to_json(window.exported.Sheets['Fonte e filtros'],{header:1})}));
  assert.equal(excel.rows.length,3);assert.ok(excel.info.find(r=>r[0]==='Pesquisa')[1].includes('2500'));
  // A conta muda enquanto há consulta: nenhum resultado antigo pode retornar.
  await page.evaluate(()=>{
   window.GrconCloud.loadClassificationHistory=()=>new Promise(resolve=>window.resolveOld=resolve);
   window.dispatchEvent(new CustomEvent('grcon:history-updated'));
  });
  await page.waitForFunction(()=>typeof window.resolveOld==='function');
  await page.evaluate(()=>{
   window.GrconCloud.state.membership.workspace_id='W2';window.GrconCloud.state.session.user.id='U2';
   window.GrconCloud.loadClassificationHistory=async()=>[];
   window.dispatchEvent(new CustomEvent('grcon:contract-context-changed'));
   window.resolveOld([{id:'old',egrdtNumber:'OLD',files:[{document:'OLD-DOC',revision:'A'}]}]);
  });
  await page.waitForFunction(()=>window.GrconSigemCentralUi.state.workspace==='W2');
  assert.equal(await page.locator('tr[data-scc-index]').count(),0);
  assert.deepEqual(errors,[]);
  console.log('OK — Worker real: 2500 registros, janela limitada, última linha, índices, retorno técnico, Excel filtrado e troca de contrato concorrente.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});
