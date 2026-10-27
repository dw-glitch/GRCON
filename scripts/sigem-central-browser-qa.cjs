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
      const history=[{id:"qa-1",clientRecordId:"qa-1",workspaceId:"W1",
        egrdtNumber:"GRDT-001",generatedAt:"2026-10-12T10:00:00Z",
        files:[{document:"DOC-001",revision:"A",purpose:"Construção",discipline:"MEC"},
               {document:"DOC-002",revision:"B",purpose:"Informação",discipline:"TUB"},
               {document:"DOC-003",revision:"0",purpose:"Construção",discipline:"CIV"}]}];
      window.GrconHistory={STORAGE_KEY:"qa.history",text:t,norm:key,cleanRecord:r=>r,read:()=>history,
        generatedRevision:f=>f.grdtRevision||f.revision,documentFamily:f=>f.sheet||"ET"};
      window.GrconCloud={state:{membership:{workspace_id:"W1",role:"operator"},session:{user:{id:"u-qa"}}}};
      window.GrconSharedSigemQuery={state:{workspace:"W1",stale:false},
        current:()=>({meta:{snapshotId:"qa-base",fileName:"Consulta_QA.xlsx",referenceDate:"2026-10-13"},
          records:[{document:"DOC-001",revision:"A",status:"Em análise",sourceRow:2},
                   {document:"DOC-002",revision:"A",status:"Emitido",sourceRow:3}]})};
      window.GrconAllocationRegistry={resolve:d=>({label:d==="DOC-001"?"Alocado":"Não alocado",
        allocations:d==="DOC-001"?["A123"]:[],warnings:[]}),fiscalComments:()=>[]};
      window.GRCONModuleLoader={ensureModule:async()=>{}};
      window.GrconTriageUiApi={prepareRelationDraft:codes=>{window.preparedCodes=codes;return true;}};
      window.GrconNotify=(message)=>{window.lastNotification=message;};
    });
    for(const file of ["posting_conference_core.js","posting_conference_refinement.js",
      "sigem_posting_central_core.js","sigem_posting_central_query.js",
      "sigem_posting_central_render.js","sigem_posting_central_app.js"]){
      await page.addScriptTag({path:path.join(process.cwd(),file)});
    }
    await page.addStyleTag({path:path.join(process.cwd(),"sigem-posting-central.css")});
    // The redesigned operator UI starts in GRDT review and hides legacy tabs.
    // This regression also covers the legacy document filters, exposed here only in QA.
    await page.addStyleTag({content:'#sigem-module .scc-grdt-review>.scc-views{display:flex!important} #sigem-module .scc-grdt-review #scc-list-toggle{display:inline-flex!important} #sigem-module .scc-grdt-review>.scc-filters{display:block!important}'});
    await page.locator('[data-scc-view="documentos"]').click();
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
    console.log("OK — Chromium: consulta, GRDT parcial, histórico, filtro, colunas, ordenação e lista não encontrada.");
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
