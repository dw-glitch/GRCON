'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),XLSX=require('../xlsx.full.min.js');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.GRCON_CHROMIUM_PATH?{executablePath:process.env.GRCON_CHROMIUM_PATH}:{})});
 const page=await browser.newPage({viewport:{width:1366,height:768},acceptDownloads:true,serviceWorkers:"block"});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',route=>route.abort());
 try{
 await page.goto(process.env.GRCON_PREVIEW_URL||'http://127.0.0.1:8765');
 await page.waitForFunction(()=>window.GrconCloud&&window.GrconSharedSigemQuery);
 await page.addStyleTag({content:'html.grcon-cloud-pending body > :not(script){visibility:visible !important} #grcon-cloud-auth{display:none!important}'});
 await page.evaluate(async()=>{
  const w=window, workspace='00000000-0000-4000-8000-000000000001';
  const et=i=>`C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-${String(i).padStart(6,'0')}`;
  const row=(i,rev='0')=>({document:et(i),revision:rev,status:'Emitido',documentType:'RIR'});
  const versions=[
   {snapshot_id:'shared-current',version:3,file_name:'Atual.xlsx',record_count:20001,status:'active',metadata:{referenceDate:'2026-10-07',importedAt:'2026-10-07T13:00:00Z'}},
   {snapshot_id:'shared-middle',version:2,file_name:'Anterior.xlsx',record_count:3,status:'archived',metadata:{referenceDate:'2026-10-06',importedAt:'2026-10-06T13:00:00Z'}},
   {snapshot_id:'shared-old',version:1,file_name:'Antiga.xlsx',record_count:1,status:'archived',metadata:{referenceDate:'2026-10-05',importedAt:'2026-10-05T13:00:00Z'}},
  ].map(v=>({...v,published_at:v.metadata.importedAt,created_at:v.metadata.importedAt,created_by_name:'Owner QA'}));
  const rows={'shared-current':[...Array.from({length:20000},(_,i)=>row(i+1)),row(1,'A')],'shared-middle':[row(1),row(2),row(1,'A')],'shared-old':[row(1)]};
  w.__sharedQa={versions,rows,calls:[],dateWrites:[],unavailable:false};
  w.GrconCloud.state.session={user:{id:'qa'}};w.GrconCloud.state.membership={workspace_id:workspace,role:'owner'};
  w.GrconCloud.state.contracts=[{workspace_id:workspace,role:'owner',code:'QA'}];w.GrconCloud.state.online=true;
  w.GrconCloud.state.client={rpc:async(name,args)=>{
   w.__sharedQa.calls.push(name);
   if(name==='grcon_sigem_query_current')return {data:[versions[0]]};
   if(name==='grcon_sigem_query_versions')return {data:versions};
   if(name==='grcon_sigem_query_page')return w.__sharedQa.unavailable&&args.target_snapshot==='shared-old'?{error:{message:'Não foi possível carregar esta versão da Consulta Geral.'}}:{data:rows[args.target_snapshot].slice(args.after_row,args.after_row+1000).map((payload,i)=>({row_number:args.after_row+i+1,payload}))};
   if(name==='grcon_sigem_query_set_date'){
    const version=versions.find(v=>v.snapshot_id===args.target_snapshot);
    if((version.metadata.referenceDate||null)!==args.expected_date)return {error:{message:'A data foi alterada por outro usuário.'}};
    version.metadata.referenceDate=args.reference_date;w.__sharedQa.dateWrites.push({...args});return {data:version.metadata};
   }
   return {data:[]};
  }};
  await w.GRCONModuleLoader.ensure('sigem_pw_dashboard_core.js');
  await w.GrconSigemPwDashboard.kvSet('sigem-pw-stage7-preupdate-reset-v1',true);
  await w.GrconSigemPwDashboard.savePwBase({meta:{fileName:'PW-A.csv',snapshotId:'pw-a',importedAt:'2026-10-05T13:00:00Z'},records:[{document:et(1),revision:'0',state:'Liberado',lastEmission:'Sim'}]}, {meta:null,records:[]});
  await w.GrconSigemPwDashboard.savePwBase({meta:{fileName:'PW-B.csv',snapshotId:'pw-b',importedAt:'2026-10-07T13:00:00Z'},records:[{document:et(1),revision:'0',state:'Liberado',lastEmission:'Sim'},{document:et(3),revision:'0',state:'Liberado',lastEmission:'Sim'}]}, {meta:null,records:[]});
  w.dispatchEvent(new CustomEvent('grcon:cloud-ready'));
 });
 await page.waitForFunction(()=>window.GrconSharedSigemQuery.current()?.meta?.snapshotId==='shared-current');
 assert.equal(await page.locator('#grcon-administration').isVisible(),true);
 for(const role of ['admin','operator','viewer']){
  await page.evaluate(role=>{window.GrconCloud.state.membership.role=role;window.GrconCloud.state.contracts[0].role=role;window.dispatchEvent(new CustomEvent('grcon:cloud-ready'));},role);
  assert.equal(await page.locator('#grcon-administration').isVisible(),false);
  await page.locator('#grcon-administration').evaluate(el=>el.click());
  assert.equal(await page.locator('#grcon-admin-dialog').evaluate(el=>el.open),false);
 }
 await page.evaluate(()=>{window.GrconCloud.state.membership.role='owner';window.GrconCloud.state.contracts[0].role='owner';window.dispatchEvent(new CustomEvent('grcon:cloud-ready'));});
 await page.evaluate(()=>window.GrconSigemPwDashboardBootstrap.open());
 await page.waitForFunction(()=>window.GrconSigemPwDashboardUi?.state.ready&&!window.GrconSigemPwDashboardUi.state.busy);
 assert.equal(await page.evaluate(()=>window.GrconSigemPwDashboardUi.state.result.summary.sigem),20000);
 const baseline=await page.evaluate(()=>JSON.stringify(window.__sharedQa.versions));
 async function choose(id,pw){
  await page.selectOption('#spw-analysis-sigem',id);await page.waitForFunction(()=>!window.GrconSigemPwDashboardUi.state.busy);
  if(pw){await page.selectOption('#spw-analysis-pw',pw);await page.waitForFunction(()=>!window.GrconSigemPwDashboardUi.state.busy);}
 }
 await choose('shared-old','pw-a');
 assert.equal(await page.evaluate(()=>window.GrconSigemPwDashboardUi.state.result.summary.sigem),1);
 await choose('shared-middle','pw-a');
 assert.equal(await page.evaluate(()=>window.GrconSigemPwDashboardUi.state.result.summary.sigem),2);
 await page.locator('[data-revision-scope="all"]').click();
 assert.equal(await page.evaluate(()=>window.GrconSigemPwDashboardUi.state.result.summary.sigem),3);
 await page.locator('[data-revision-scope="revision0"]').click();
 await choose('shared-middle','pw-b');
 assert.equal(await page.evaluate(()=>window.GrconSigemPwDashboardUi.state.result.summary.pwRegistered),2);
 await choose('shared-old','pw-b');
 assert.equal(await page.evaluate(()=>window.GrconSigemPwDashboardUi.state.result.summary.sigem),1);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__sharedQa.versions)),baseline);
 assert.equal(await page.evaluate(()=>window.GrconSharedSigemQuery.current().meta.snapshotId),'shared-current');
 // Re-activation/navigation keeps the temporary analysis selection.
 await page.evaluate(()=>window.GrconSigemPwDashboardUi.activate());
 assert.equal(await page.inputValue('#spw-analysis-sigem'),'shared-old');
 // Historical edit goes to the shared RPC and preserves upload and official identity.
 await page.locator('[data-edit-base-date="sigem"]').click();
 await page.fill('#spw-date-input','2026-10-04');await page.locator('#spw-date-save').click();
 await page.waitForFunction(()=>!window.GrconSigemPwDashboardUi.state.busy);
 assert.equal(await page.evaluate(()=>window.__sharedQa.versions[2].metadata.referenceDate),'2026-10-04');
 assert.equal(await page.evaluate(()=>window.__sharedQa.versions[2].metadata.importedAt),'2026-10-05T13:00:00Z');
 const downloadPromise=page.waitForEvent('download');await page.locator('#spw-export').click();const download=await downloadPromise;
 const out=path.join('/tmp',download.suggestedFilename());await download.saveAs(out);const wb=XLSX.read(fs.readFileSync(out),{type:'buffer'});
 const meta=XLSX.utils.sheet_to_json(wb.Sheets.Metadados),rows=XLSX.utils.sheet_to_json(wb.Sheets['Relação']);
 assert.equal(meta.find(r=>r.Item==='Consulta Geral ID').Valor,'shared-old');assert.equal(meta.find(r=>r.Item==='Consulta Geral utilizada').Valor,'2026-10-04');assert.equal(meta.find(r=>r.Item==='PW ID').Valor,'pw-b');
 assert.equal(rows.length,await page.evaluate(()=>window.GrconSigemPwDashboardUi.state.result.lists.all.length));assert.ok(rows.every(r=>String(r['Revisão'])==='0'));
 await page.getByText('Usar Consulta Geral mais recente',{exact:true}).click();await page.waitForFunction(()=>!window.GrconSigemPwDashboardUi.state.busy);
 assert.equal(await page.evaluate(()=>window.GrconSigemPwDashboardUi.state.result.summary.sigem),20000);
 const generation=await page.evaluate(()=>window.GrconSigemPwDashboardUi.state.modelGeneration);
 await page.evaluate(()=>window.GrconSharedSigemQuery.setReferenceDate('2026-10-03'));
 await page.waitForFunction(()=>window.GrconSigemPwDashboardUi.state.sigem.meta.referenceDate==='2026-10-03');
 assert.equal(await page.evaluate(()=>window.GrconSigemPwDashboardUi.state.modelGeneration),generation,'metadata-only update reuses the model');
 // Active date flows to the Conferência projection even when that module was not open.
 await page.locator('[data-pc-open="sidebar"]').click();
 await page.waitForFunction(()=>window.GrconPostingConferenceUi?.state.ready&&!window.GrconPostingConferenceUi.state.busy&&window.GrconPostingConferenceUi.state.base?.meta?.referenceDate==='2026-10-03');
 await page.fill('#pc-reference-date','2026-10-02');await page.locator('#pc-save-date').click();
 try { await page.waitForFunction(()=>window.GrconSigemPwDashboardUi.state.sigem.meta.referenceDate==='2026-10-02'); }
 catch(error){console.error(await page.evaluate(()=>({dateWrites:window.__sharedQa.dateWrites,current:window.GrconSharedSigemQuery.current()?.meta,dashboard:window.GrconSigemPwDashboardUi.state.sigem.meta,conference:window.GrconPostingConferenceUi.state.base.meta,input:document.querySelector('#pc-reference-date').value,toasts:document.querySelector('#toast')?.textContent})));throw error;}
 fs.mkdirSync('artifacts/owner-shared-sigem',{recursive:true});await page.screenshot({path:'artifacts/owner-shared-sigem/conference-date.png'});
 await page.evaluate(()=>window.GrconSigemPwDashboardBootstrap.open());
 await page.evaluate(()=>{window.__sharedQa.unavailable=true;window.__sharedQa.versions[2].metadata.referenceDate='2026-10-01';});
 await choose('shared-old');
 assert.equal(await page.evaluate(()=>window.GrconSigemPwDashboardUi.state.result),null,'unavailable version never shows another source numbers');
 await page.locator('[role="alert"]').filter({hasText:'Não foi possível carregar'}).waitFor({state:'visible'});
 await page.evaluate(()=>window.__sharedQa.unavailable=false);
 await page.getByText('Tentar novamente',{exact:true}).click();await page.waitForFunction(()=>!window.GrconSigemPwDashboardUi.state.busy);
 assert.equal(await page.evaluate(()=>window.GrconSigemPwDashboardUi.state.result.summary.sigem),1);
 assert.deepEqual(errors,[]);
 console.log('Chromium: owner/admin/operator/viewer, direct access, 20k records, historical selection, 4 independent combinations, revision scopes, XLSX provenance, preserved selection and bidirectional date passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
