const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const XLSX = require('../xlsx.full.min.js');
const output = path.join(process.cwd(),'artifacts/shared-sigem');fs.mkdirSync(output,{recursive:true});
const documentCode='RL-5290.00-22313-ABC-C1O-001';
function workbook(name, rows) { const book=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['DOCUMENTO','REVISÃO','STATUS','TÍTULO','DISCIPLINA','TIPO DE DOCUMENTO'],...rows]),'Consulta Geral'); const file=path.join(output,name);fs.writeFileSync(file,XLSX.write(book,{type:'buffer',bookType:'xlsx'}));return file; }
const source=workbook('consulta.xlsx',[[documentCode,'B','Em análise','RELATÓRIO','CIVIL','RL'],[documentCode,'A','Recusado','RELATÓRIO','CIVIL','RL']]);
const empty=workbook('vazia.xlsx',[]);
const update=workbook('atualizada.xlsx',[[documentCode,'B','Recusado','RELATÓRIO','CIVIL','RL']]);
const backend={active:null,uploads:new Map(),fail:false,offline:false,serial:0};
function rpc(name,args) {
 if(backend.offline) return {data:null,error:{message:'QA offline'}};
 if(name==='current') return {data:backend.active?[backend.active]:[],error:null};
 if(name==='page') return {data:backend.uploads.get(args.target_snapshot).rows.map((payload,i)=>({row_number:i+1,payload})).filter(r=>r.row_number>args.after_row).slice(0,args.page_size),error:null};
 if(name==='begin') {const id='00000000-0000-4000-8000-'+String(++backend.serial).padStart(12,'0');backend.uploads.set(id,{...args,rows:[]});return {data:id,error:null};}
 if(name==='chunk') {if(backend.fail)return {data:null,error:{message:'QA upload interrompido'}};const u=backend.uploads.get(args.upload_id);u.rows.splice(args.first_row-1,args.rows.length,...args.rows);return {data:u.rows.length,error:null};}
 if(name==='publish') {const u=backend.uploads.get(args.upload_id);assert.equal(u.rows.length,u.expected_count);assert.equal(u.expected_active,backend.active?.snapshot_id||null);backend.active={snapshot_id:args.upload_id,file_name:u.source_file,record_count:u.rows.length,published_at:new Date().toISOString(),metadata:u.source_metadata};return {data:args.upload_id,error:null};}
 throw new Error(name);
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.GRCON_CHROME_PATH,args:['--no-sandbox']});
 const errors=[]; const baseUrl=process.env.GRCON_PREVIEW_URL||'http://127.0.0.1:8765';
 async function user(role){
   const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
   await context.route('**/qa-sigem/*',async route=>{const result=rpc(route.request().url().split('/').pop(),route.request().postDataJSON());await route.fulfill({json:result});});
   const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
   await page.goto(baseUrl);await page.waitForFunction(()=>window.GrconSharedSigemQuery&&window.GrconCloud);
   await page.evaluate((role)=>{
     window.GrconCloud.state.membership={workspace_id:'qa-shared-workspace',role};window.GrconCloud.state.online=true;
     window.GrconCloud.state.client={rpc:async(name,args)=>{const result=await fetch('/qa-sigem/'+name.replace('grcon_sigem_query_',''),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)});return result.json();}};
     document.documentElement.classList.remove('grcon-cloud-pending'); document.getElementById('grcon-cloud-auth')?.remove();
     document.body.classList.remove('grcon-cloud-locked');
   },role);
   await page.addStyleTag({content:'#grcon-cloud-auth{display:none!important} html.grcon-cloud-pending body > :not(script){visibility:visible!important}'});
   return {context,page};
 }
 const a=await user('owner');
 await a.page.locator('[data-pc-open="sidebar"]').click();await a.page.waitForSelector('#pc-update');
 await a.page.locator('#pc-file').setInputFiles(source);
 await a.page.waitForFunction(()=>window.GrconSharedSigemQuery.state.local?.records.length===2&&!window.GrconPostingConferenceUi.state.busy);
 assert.match(await a.page.locator('#pc-local-preview').innerText(),/Em análise/);
 await a.page.locator('#pc-publish').click();await a.page.waitForFunction(()=>window.GrconSharedSigemQuery.state.shared?.records.length===2&&!window.GrconSharedSigemQuery.state.busy);
 assert.equal(backend.active.record_count,2);
 await a.page.screenshot({path:path.join(output,'conference-shared.png'),fullPage:true});
 const b=await user('operator');
 await b.page.locator('[data-pc-open="sidebar"]').click();await b.page.waitForFunction(()=>window.GrconPostingConferenceUi?.state.base.records.length===2);
 assert.equal(await b.page.locator('#pc-publish').isVisible(),false);
 assert.equal(await b.page.evaluate(()=>window.GrconSharedSigemQuery.resolveSigemStatus('RL-5290.00-22313-ABC-C1O-001','B','LEGACY').status),'Em análise');
 await b.page.evaluate(async()=>{await window.GrconSigemPwDashboardBootstrap.open();});
 await b.page.waitForFunction(()=>window.GrconSigemPwDashboardUi?.state.sigem.records.length===2);
 assert.equal(await b.page.evaluate(()=>window.GrconSigemPwDashboardUi.state.sigem.meta.snapshotId),backend.active.snapshot_id);
 await b.page.screenshot({path:path.join(output,'dashboard-shared.png'),fullPage:true});
 // Same status engine used in control; its alocação remains from technical/planned data.
 const triage=await b.page.evaluate(()=>{
   const doc='RL-5290.00-22313-ABC-C1O-001';const record={document:doc,revision:'B',sheet:'N-1710',title:'RELATÓRIO',discipline:'CIVIL',documentType:'RL',databook:'Databook',allocationStatus:'ALOCADO'};
   return window.TriagemCore.triageOne({name:doc+'_0001_B.pdf'},window.TriagemCore.buildIndex([record],[{document:doc,revision:'B',status:'Não Postado',sheet:'Colar SIGEM'}]),{sigemQueryContext:window.GrconSharedSigemQuery.context()});
 });
 assert.equal(triage.status,'Em análise');assert.equal(triage.sigemStatusSource,'shared-general-query');assert.equal(triage.allocationFinding.kind,'allocated');
 // Exact revision lookup, no arbitrary revision fallback.
 assert.equal(await b.page.evaluate(()=>window.GrconSharedSigemQuery.resolveSigemStatus('RL-5290.00-22313-ABC-C1O-001','C','LEGACY').status),'LEGACY');
 // Invalid/empty file leaves both shared and local last valid sources.
 const activeId=backend.active.snapshot_id;
 const originalActive={...backend.active};
 await a.page.locator('#pc-file').setInputFiles(empty); await a.page.waitForFunction(()=>!window.GrconPostingConferenceUi.state.busy);
 assert.equal(await a.page.evaluate(()=>window.GrconSharedSigemQuery.current().meta.snapshotId),activeId);
 // Interrupted upload preserves active version; newest local never supersedes shared match.
 await a.page.locator('#pc-file').setInputFiles(update); await a.page.waitForFunction(()=>window.GrconSharedSigemQuery.state.local?.records.length===1&&!window.GrconPostingConferenceUi.state.busy);
 assert.equal(await a.page.evaluate(()=>window.GrconSharedSigemQuery.resolveSigemStatus('RL-5290.00-22313-ABC-C1O-001','B').status),'Em análise');
 backend.fail=true;await a.page.locator('#pc-publish').click();await a.page.waitForFunction(()=>!window.GrconSharedSigemQuery.state.busy);assert.equal(backend.active.snapshot_id,activeId);
 backend.fail=false;await a.page.locator('#pc-publish').click();await a.page.waitForFunction(()=>window.GrconSharedSigemQuery.state.shared?.records.length===1&&!window.GrconSharedSigemQuery.state.busy);
 const updatedActive={...backend.active};
 await b.page.evaluate(()=>window.GrconSharedSigemQuery.refresh());
 await b.page.waitForFunction(()=>window.GrconSigemPwDashboardUi.state.sigem.records.length===1);
 assert.equal(await b.page.evaluate(()=>window.GrconSharedSigemQuery.resolveSigemStatus('RL-5290.00-22313-ABC-C1O-001','B').status),'Recusado');
 backend.offline=true;await b.page.evaluate(()=>window.GrconSharedSigemQuery.refresh());
 assert.equal(await b.page.evaluate(()=>window.GrconSharedSigemQuery.state.stale),true);
 assert.equal(await b.page.evaluate(()=>window.GrconSharedSigemQuery.resolveSigemStatus('RL-5290.00-22313-ABC-C1O-001','B').status),'Recusado');
 // Cache survives reload; a new page session in the same profile recovers offline.
 await b.page.reload();await b.page.waitForFunction(()=>window.GrconSharedSigemQuery&&window.GrconCloud);
 await b.page.evaluate(async()=>{window.GrconCloud.state.membership={workspace_id:'qa-shared-workspace',role:'operator'};window.GrconCloud.state.online=false;await window.GrconSharedSigemQuery.refresh();});
 assert.equal(await b.page.evaluate(()=>window.GrconSharedSigemQuery.resolveSigemStatus('RL-5290.00-22313-ABC-C1O-001','B','LEGACY').status),'Recusado');
 // Workspace isolation: switching accounts/workspaces must not expose the previous Conference projection.
 await b.page.evaluate(async()=>{
   window.GrconCloud.state.membership={workspace_id:'qa-empty-workspace',role:'operator'};
   window.GrconCloud.state.online=false;
   await window.GrconSharedSigemQuery.refresh();
 });
 assert.equal(await b.page.evaluate(()=>window.GrconSharedSigemQuery.current()),null);
 assert.equal(await b.page.evaluate(async()=>(await window.GrconPostingConference.loadBase()).records.length),0);
 backend.offline=false;
 await b.page.evaluate(async()=>{
   window.GrconCloud.state.membership={workspace_id:'qa-shared-workspace',role:'operator'};
   window.GrconCloud.state.online=true;
   await window.GrconSharedSigemQuery.refresh();
 });
 assert.equal(await b.page.evaluate(()=>window.GrconSharedSigemQuery.resolveSigemStatus('RL-5290.00-22313-ABC-C1O-001','B','LEGACY').status),'Recusado');
 // Reissue preview status and revision edits.
 await a.page.evaluate(async()=>{
   await window.GRCONModuleLoader.ensure('grdt-reissue');
   window.GrconHistory.saveMany([{id:'qa-history',egrdtNumber:'QA-eGRDT',generatedAt:'2026-09-29T12:00:00Z',files:[{document:'RL-5290.00-22313-ABC-C1O-001',revision:'B',grdtRevision:'B',title:'RELATÓRIO',finalName:'RL-5290.00-22313-ABC-C1O-001_0001_B.pdf',format:'A4',discipline:'CIVIL',documentType:'RL',purpose:'Para Construção',databook:'Databook'}]}]);
   document.querySelectorAll('main.workspace>section').forEach(s=>s.hidden=s.id!=='grdt-reissue-module');
   document.getElementById('grdt-reissue-module').hidden=false;
   window.GrconGrdtReissueUi.activate();
 });
 await a.page.locator('#grdt-reissue-documents').fill(documentCode);await a.page.locator('#grdt-reissue-find').click();
 assert.match(await a.page.locator('#grdt-reissue-results').innerText(),/Status SIGEM: Recusado/);
 await a.page.locator('[data-field="revision"]').fill('C');await a.page.locator('[data-field="revision"]').press('Tab');
 assert.match(await a.page.locator('#grdt-reissue-results').innerText(),/Status SIGEM: —/);
 await a.page.screenshot({path:path.join(output,'reissue-shared.png'),fullPage:true});
 // Normal control: real file inputs, actual analysis Worker, manual revision/purpose and XLS output.
 const ldBook=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(ldBook,XLSX.utils.aoa_to_sheet([
  ['DOCUMENTO','REVISÃO','TÍTULO','GRDT','DATA EFETIVA DE EMISSÃO','FORMATO','DISCIPLINA','TIPO DE DOCUMENTO','PROPÓSITO','CAMINHO DATABOOK','ALOCADO'],
  [documentCode,'B','RELATÓRIO DE INSPEÇÃO','','','A4','CIVIL','RL','Para Construção','Databook','ALOCADO']
 ]),'N-1710');
 const ldFile=path.join(output,'LD_SEM_COLAR_SIGEM.xlsx');fs.writeFileSync(ldFile,XLSX.write(ldBook,{type:'buffer',bookType:'xlsx'}));
 await a.page.evaluate(()=>{
   window.GrconCloud.loadPlannedDocuments=async()=>null;
   window.GrconCloud.reserveEgrdtSequences=async(year,count)=>Array.from({length:count},(_,i)=>({sequence:7000+i,year,baseName:`0130870-C1O-PGV-G-${7000+i}-${year} - eGRDT`}));
   window.GrconCloud.completeEgrdtReservationRequest=()=>{};
 });
 await a.page.locator('.ops-sidebar [data-grcon-view="control"]').click();
 await a.page.locator('#ld-input').setInputFiles(ldFile);
 const packageDir=path.join(output,'package');fs.mkdirSync(packageDir,{recursive:true});
 fs.writeFileSync(path.join(packageDir,documentCode+'_0001_B.pdf'),'%PDF-1.4 QA fixture');
 fs.writeFileSync(path.join(packageDir,documentCode+'_0001_B.docx'),'QA fixture');
 await a.page.locator('#pdf-input').setInputFiles(packageDir);
 await a.page.locator('#relation-start').click();await a.page.locator('#relation-text').fill(documentCode+'_0001_B.pdf');
 await a.page.locator('#relation-apply').click();await a.page.locator('#analyze').click();
 await a.page.waitForFunction(()=>window.GrconTriageUiApi.getResult(0)&&!document.getElementById('analyze').disabled,{timeout:30000});
 const row=await a.page.evaluate(()=>window.GrconTriageUiApi.getResult(0));
 assert.equal(row.document,documentCode);assert.equal(row.revision,'C'); // shared B Recusado advances normally, then legacy absence C
 await a.page.screenshot({path:path.join(output,'control-before-edit.png'),fullPage:true});
 await a.page.locator('#select-row-0').check();
 await a.page.locator('#batch-egrdt').click();
 await a.page.locator('#drawer-revision').fill('B');
 await a.page.locator('#drawer-purpose').selectOption('Para Cancelamento');
 await a.page.locator('#drawer-save').click();
 assert.equal(await a.page.evaluate(()=>window.GrconTriageUiApi.getResult(0).status),'Recusado');
 assert.equal(await a.page.evaluate(()=>window.GrconTriageUiApi.getResult(0).sigemStatusSource),'shared-general-query');
 await a.page.locator('#batch-egrdt').click();
 await a.page.locator('#drawer-revision').fill('C');await a.page.locator('#drawer-save').click();
 assert.equal(await a.page.evaluate(()=>window.GrconTriageUiApi.getResult(0).status),'Não Postado');
 await a.page.locator('#batch-egrdt').click();await a.page.locator('#drawer-revision').fill('B');await a.page.locator('#drawer-save').click();
 await a.page.locator('#select-row-0').check();
 // A Consulta Geral mudou remotamente depois da análise: a geração deve forçar uma leitura nova e ser recusada.
 const analyzedSnapshots=await a.page.evaluate(()=>window.GrconTriageUiApi.snapshot());
 assert.equal(analyzedSnapshots.analysisSigemSnapshot,updatedActive.snapshot_id);
 assert.equal(analyzedSnapshots.currentSigemSnapshot,updatedActive.snapshot_id);
 backend.active=originalActive;
 const remotelyRefreshed=await a.page.evaluate(async()=>{
   await window.GrconSharedSigemQuery.refreshLatest();
   return window.GrconSharedSigemQuery.current()?.meta?.snapshotId || '';
 });
 assert.equal(remotelyRefreshed,originalActive.snapshot_id);
 assert.equal(await a.page.locator('#export-egrdt').isEnabled(),true);
 await a.page.locator('#export-egrdt').click();
 await a.page.waitForFunction(()=>document.getElementById('toast')?.textContent.includes('Consulta Geral SIGEM foi atualizada'),null,{timeout:5000});
 assert.match(await a.page.locator('#toast').innerText(),/Analise novamente antes de gerar a GRDT/);
 backend.active=updatedActive;
 await a.page.evaluate(()=>window.GrconSharedSigemQuery.refreshLatest());
 const downloadPromise=a.page.waitForEvent('download');await a.page.locator('#export-egrdt').click();await a.page.locator('#p1-sequence-confirm').check();await a.page.locator('#p1-confirm-ok').click();const generated=await downloadPromise;
 await generated.saveAs(path.join(output,'normal-generated.xls'));
 await a.page.waitForFunction(()=>window.GrconHistory.read().some(r=>r.outputType==='eGRDT final'&&r.files.some(f=>f.sigemStatusSource==='shared-general-query')));
 const history=await a.page.evaluate(()=>window.GrconHistory.read().find(r=>r.outputType==='eGRDT final'&&r.files.some(f=>f.sigemStatusSource==='shared-general-query')));
 assert.equal(history.files[0].sigemStatus,'Recusado');assert.equal(history.files[0].grdtRevision,'B');assert.equal(history.files[0].purpose,'Para Cancelamento');
 await a.page.screenshot({path:path.join(output,'control-shared.png'),fullPage:true});
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,backend:'RPC fixtures + real SQL transactional tests separately',cases:['worker Excel import','preview','publish','user B auto-load','shared dashboard ID','control resolver','revision exactness','empty file preservation','upload failure preservation','update propagation','offline cache','reload cache','workspace isolation','reissue revision status','normal control worker without Colar SIGEM','manual revision exact status','generation blocked after SIGEM snapshot change','normal XLS generation and history source'],pageErrors:errors},null,2));
 assert.deepEqual(errors,[]);
 console.log('Chromium shared SIGEM: all cases passed');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
