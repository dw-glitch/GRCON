"use strict";
const assert=require("node:assert/strict");
const path=require("node:path");
const {chromium}=require("playwright");
(async()=>{
  const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const failures=[];
  page.on("pageerror",e=>failures.push(e.message));
  page.on("console",m=>{if(m.type()==="error")failures.push(m.text());});
  try{
    await page.setContent('<!doctype html><html lang="pt-BR"><head><title>QA Central SIGEM</title></head><body><section id="sigem-module"></section></body></html>');
    await page.evaluate(()=>{
      const t=v=>String(v??"").trim(),key=v=>t(v).toUpperCase();
      window.TriagemCore={key,normalizeRevision:key,revisionRank:v=>key(v)==="0"?0:(key(v).charCodeAt(0)-64)*1000,
        documentSearchKeys:v=>[key(v)],displayDocumentCode:t};
      const history=[{id:"qa-1",cloudId:"cloud-qa-1",clientRecordId:"qa-1",workspaceId:"W1",
        egrdtNumber:"GRDT-001",generatedAt:"2026-10-12T10:00:00Z",
        files:[{document:"DOC-001",revision:"A",purpose:"Construção",discipline:"MEC"},
               {document:"DOC-002",revision:"B",purpose:"Informação",discipline:"TUB"},
               {document:"DOC-003",revision:"0",purpose:"Construção",discipline:"CIV"}]}];
      window.GrconHistory={STORAGE_KEY:"qa.history",text:t,norm:key,cleanRecord:r=>r,read:()=>history,
        generatedRevision:f=>f.grdtRevision||f.revision,documentFamily:f=>f.sheet||"ET"};
      window.GrconCloud={state:{membership:{workspace_id:"W1",role:"owner"},session:{user:{id:"u-qa"}}}};
      window.GrconSharedSigemQuery={state:{workspace:"W1",stale:false},
        current:()=>({meta:{snapshotId:"qa-base",fileName:"Consulta_QA.xlsx",referenceDate:"2026-10-13"},
          records:[{document:"DOC-001",revision:"A",status:"Em análise",sourceRow:2},
                   {document:"DOC-002",revision:"A",status:"Emitido",sourceRow:3}]})};
      const versions=[{snapshot_id:'new',file_name:'CG-nova.xlsx',metadata:{referenceDate:'2026-10-13'}},{snapshot_id:'old',file_name:'CG-anterior.xlsx',metadata:{referenceDate:'2026-10-12'}}];
      window.GrconSharedSigemQuery.listVersions=async()=>versions;
      window.monitorCalls=[];window.monitorTargets=[];
      const changes=[{document_code:'DOC-001',revision:'A',previous_status:'Em análise',current_status:'Emitido',change_type:'SAIU_DE_ANALISE',monitored:true},{document_code:'DOC-002',revision:'A',previous_status:'Emitido',current_status:'Emitido',change_type:'SEM_ALTERACAO',monitored:false},{document_code:'DOC-002',revision:'B',previous_status:null,current_status:'Em análise',change_type:'NOVO_NA_CONSULTA',monitored:false}];
      window.GrconCloud.state.client={rpc:(name,args)=>{
        if(name==='grcon_sigem_comparison_rows')return {range:async(from,to)=>({data:changes.slice(from,to+1)})};
        if(name==='grcon_sigem_compare_versions')return Promise.resolve({data:'comp-qa'});
        if(name==='grcon_monitor_targets'){
          window.monitorCalls.push(args);
          if(args.operation==='save'){
            const i=args.input,id='target-'+i.kind;
            window.monitorTargets=window.monitorTargets.filter(t=>t.id!==id).concat([{id,kind:i.kind,label:i.kind==='grdt'?'GRDT-001':'DOC-001 · Rev. A',active:true,sourceAvailable:true,members:[{document:'DOC-001',revision:'A'}]}]);
          }
          if(args.operation==='toggle')window.monitorTargets.find(t=>t.id===args.input.id).active=args.input.active;
          if(args.operation==='delete')window.monitorTargets=window.monitorTargets.filter(t=>t.id!==args.input.id);
          return Promise.resolve({data:args.operation==='list'?window.monitorTargets:{ok:true}});
        }
        return Promise.resolve({error:{message:'RPC inesperada '+name}});
      }};
      window.GrconAllocationRegistry={resolve:d=>({label:d==="DOC-001"?"Alocado":"Não alocado",
        allocations:d==="DOC-001"?["A123"]:[],warnings:[]}),fiscalComments:()=>[]};
      window.GRCONModuleLoader={ensureModule:async()=>{}};
      window.GrconTriageUiApi={prepareRelationDraft:codes=>{window.preparedCodes=codes;return true;}};
      window.GrconNotify=(message)=>{window.lastNotification=message;};
    });
    for(const file of ["posting_conference_core.js","posting_conference_refinement.js",
      "sigem_posting_central_core.js","sigem_posting_central_query.js",
      "sigem_posting_central_render.js","sigem_posting_central_tracking.js","sigem_posting_central_app.js"]){
      await page.addScriptTag({path:path.join(process.cwd(),file)});
    }
    await page.addStyleTag({path:path.join(process.cwd(),"sigem-posting-central.css")});
    await page.locator("#scc-query").waitFor();
    await page.waitForFunction(()=>document.querySelectorAll("#sigem-central-tbody tr[data-scc-index]").length>=2);
    assert.match(await page.locator("#sigem-central-base").innerText(),/Consulta_QA.xlsx/);
    const first=await page.locator("#sigem-central-tbody").innerText();
    assert.match(first,/DOC-001/);assert.match(first,/DOC-002/);
    await page.locator("#scc-query").fill("DOC-001");
    assert.equal(await page.locator("tr[data-scc-index]").count(),1);
    await page.locator("tr[data-scc-index]").click();
    assert.match(await page.locator("#sigem-central-detail").innerText(),/GRDT-001/);
    await page.locator(".scc-close").click();
    await page.locator("#scc-query").fill("");
    await page.locator('[data-scc-view="grdts"]').click();
    assert.equal(await page.locator("tr[data-scc-index]").count(),1);
    await page.locator("tr[data-scc-index]").click();
    const detail=await page.locator("#sigem-central-detail").innerText();
    assert.match(detail,/DOC-001|GRDT-001/);
    assert.match(detail,/DOC-002/);
    assert.equal(await page.locator('[data-scc-pending-index]:checked').count(),0,"nenhuma seleção automática");
    await page.locator('[data-scc-pending-index]').last().check();
    await page.locator('[data-scc-prepare-pending]').click();
    assert.deepEqual(await page.evaluate(()=>window.preparedCodes),["DOC-003"]);
    assert.equal(await page.locator("#sigem-central-detail").isVisible(),false);

    await page.locator('[data-scc-view="documentos"]').click();
    await page.locator("#scc-columns").click();
    await page.locator('[data-scc-column="purpose"]').check();
    assert.match(await page.locator("#sigem-central-thead").innerText(),/Propósito/);
    await page.locator('[data-scc-sort="document"]').click();
    assert.match(await page.locator('[data-scc-sort="document"]').innerText(),/↑/);
    await page.locator("#scc-list-toggle").click();
    await page.locator("#scc-list-input").fill("DOC-001\nDOC-999");
    assert.match(await page.locator("#sigem-central-missing").innerText(),/DOC-999/);
    await page.locator("#scc-list-input").fill("DOC-999");
    assert.match(await page.locator("#sigem-central-missing").innerText(),/DOC-999/);
    await page.locator("#scc-list-input").fill("DOC-001\nDOC-002");
    await page.locator('[data-scc-view="grdts"]').click();
    assert.equal(await page.locator("tr[data-scc-index]").count(),1,"lista indexada dentro de GRDT");
    await page.locator("#scc-list-toggle").click();
    await page.locator("#scc-discipline").fill("MEC");
    await page.locator("#scc-revision").fill("B");
    assert.equal(await page.locator("tr[data-scc-index]").count(),0,"filtros da mesma ocorrência");
    await page.locator("#scc-clear-filters").click();
    await page.locator('[data-scc-view="documentos"]').click();
    await page.locator('[data-scc-filter="document"]').fill("DOC-002");
    await page.locator('[data-scc-filter="document"]').press("Tab");
    assert.equal(await page.locator("tr[data-scc-index]").count(),1,"filtro por coluna");
    await page.locator("#scc-clear-filters").click();
    await page.locator("#scc-view-name").fill("Minha conferência");
    await page.locator("#scc-view-save").click();
    assert.match(await page.locator("#scc-saved-views").innerText(),/Minha conferência/);
    await page.locator('[data-scc-width="document"]').fill("260");
    await page.locator('[data-scc-width="document"]').press("Tab");
    assert.equal(await page.evaluate(()=>window.GrconSigemCentralUi.state.widths.document),260);
    await page.locator('[data-scc-pin="title"]').check();
    assert.ok(await page.locator('.scc-table thead .scc-pinned').count()>=2);
    await page.locator('[data-scc-key="title"]').dragTo(page.locator('[data-scc-key="document"]'));
    assert.equal(await page.evaluate(()=>window.GrconSigemCentralUi.state.columns[0]),"title");
    await page.locator("#scc-columns").click();
    await page.locator("tr[data-scc-index]").first().focus();
    await page.locator("tr[data-scc-index]").first().press("Enter");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("tr[data-scc-index]").first().evaluate(el=>el===document.activeElement),true,"foco restaurado");
    await page.locator("#scc-clear-filters").click();
    await page.evaluate(()=>window.GrconSigemCentralUi.openTarget('document','DOC-001'));
    await page.locator('[data-scc-monitor-revision]').click();
    await page.waitForFunction(()=>window.monitorTargets.some(t=>t.kind==='revision'));
    assert.deepEqual(await page.evaluate(()=>window.monitorCalls.find(a=>a.operation==='save').input),{kind:'revision',documentCode:'DOC-001',revision:'A'});
    await page.locator('.scc-close').click();
    await page.evaluate(()=>window.GrconSigemCentralUi.openTarget('revision','DOC-002|B'));
    assert.match(await page.locator('#sigem-central-detail').innerText(),/DOC-002/);
    assert.equal(await page.evaluate(()=>window.GrconSigemCentralUi.state.selectedRow.revisionSent),'B');
    await page.locator('.scc-close').click();
    await page.evaluate(()=>window.GrconSigemCentralUi.openTarget('grdt','cloud-qa-1'));
    assert.match(await page.locator('#sigem-central-detail').innerText(),/GRDT-001/);
    await page.locator('[data-scc-monitor-grdt]').click();
    await page.waitForFunction(()=>window.monitorTargets.some(t=>t.kind==='grdt'));
    await page.locator('.scc-close').click();
    await page.locator('#scc-tracking-panel summary').click();
    await page.waitForFunction(()=>document.querySelectorAll('[data-scc-target-toggle]').length===2);
    await page.locator('[data-scc-target-toggle="target-grdt"]').click();
    await page.waitForFunction(()=>window.monitorTargets.find(t=>t.kind==='grdt').active===false);
    await page.locator('[data-scc-target-delete="target-grdt"]').click();
    await page.waitForFunction(()=>!window.monitorTargets.some(t=>t.kind==='grdt'));
    await page.locator('[data-scc-view="grdts"]').click();
    const oldColumns=await page.evaluate(()=>window.GrconSigemCentralUi.state.columns.slice());
    await page.locator('[data-scc-view="evolucao"]').click();
    await page.locator('#scc-previous-base').selectOption('old');
    await page.locator('#scc-current-base').selectOption('new');
    await page.locator('#scc-compare-bases').click();
    await page.waitForFunction(()=>window.GrconSigemCentralUi.state.comparisonRows.length===3);
    assert.equal(await page.locator('tr[data-scc-index]').count(),3,'inclui sem alteração');
    assert.match(await page.locator('#sigem-central-base').innerText(),/CG-anterior.xlsx.*CG-nova.xlsx/);
    await page.locator('#scc-change-type').selectOption('PENDENCIAS_RESOLVIDAS');
    assert.equal(await page.locator('tr[data-scc-index]').count(),1,'revisão monitorada deixa de ser divergente conforme motor oficial');
    await page.locator('#scc-change-type').selectOption('DIVERGENCIAS');
    assert.equal(await page.locator('tr[data-scc-index]').count(),1);
    await page.locator('#scc-change-type').selectOption('SEM_ALTERACAO');
    assert.equal(await page.locator('tr[data-scc-index]').count(),1);
    assert.match(await page.locator('#sigem-central-tbody').innerText(),/DOC-002/);
    await page.locator('#scc-change-type').selectOption('');
    await page.locator('#scc-only-monitored').check();
    assert.equal(await page.locator('tr[data-scc-index]').count(),1);
    await page.locator('#scc-columns').click();
    await page.locator('#scc-view-name').fill('Evolução monitorada');await page.locator('#scc-view-save').click();
    await page.locator('[data-scc-view="grdts"]').click();
    assert.deepEqual(await page.evaluate(()=>window.GrconSigemCentralUi.state.columns),oldColumns,'restaura colunas operacionais');
    assert.equal(await page.locator('#scc-only-monitored').isChecked(),false,'limpa filtro oculto');
    await page.locator('#scc-saved-views').selectOption({label:'Evolução monitorada'});
    assert.equal(await page.locator('#scc-only-monitored').isChecked(),true,'restaura filtro de evolução');
    assert.equal(await page.locator('tr[data-scc-index]').count(),1);
    await page.evaluate(()=>{window.GrconCloud.state.membership.role='operator';});
    await page.locator('#scc-tracking-refresh').click();
    await page.waitForFunction(()=>!document.querySelector('[data-scc-target-toggle]'));
    await page.evaluate(()=>window.GrconSigemCentralUi.openTarget('document','DOC-001'));
    assert.equal(await page.locator('[data-scc-monitor-revision]').count(),0,'operador não gerencia assinatura');
    await page.locator('.scc-close').click();
    await page.evaluate(()=>{
      window.GrconCloud.state.membership.workspace_id="W2";
      window.GrconCloud.state.session.user.id="u-other";
      window.GrconHistory.read=()=>[];
      window.dispatchEvent(new CustomEvent("grcon:contract-context-changed"));
    });
    await page.waitForFunction(()=>window.GrconSigemCentralUi.state.workspace==="W2");
    assert.equal(await page.locator("tr[data-scc-index]").count(),0);
    assert.doesNotMatch(await page.locator("#scc-saved-views").innerText(),/Minha conferência/);
    await page.evaluate(()=>{
      window.GrconCloud.state.membership=null;window.GrconCloud.state.session=null;
      window.dispatchEvent(new CustomEvent("grcon:cloud-signed-out"));
    });
    await page.waitForFunction(()=>window.GrconSigemCentralUi.state.workspace==="unavailable");
    assert.equal(await page.locator("tr[data-scc-index]").count(),0);
    assert.deepEqual(failures,[],"Errors in browser: "+failures.join("; "));
    console.log("OK — Chromium: revisão exata, assinatura de GRDT, desativação/exclusão, evolução completa, filtros salvos, colunas por visão, link com ID remoto e operador.");
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
