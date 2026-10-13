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
               {document:"DOC-002",revision:"B",purpose:"Informação",discipline:"TUB"}]}];
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
      window.GrconNotify=(message)=>{window.lastNotification=message;};
    });
    for(const file of ["posting_conference_core.js","posting_conference_refinement.js",
      "sigem_posting_central_core.js","sigem_posting_central_query.js",
      "sigem_posting_central_render.js","sigem_posting_central_app.js"]){
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
    await page.locator(".scc-close").click();
    await page.locator('[data-scc-view="documentos"]').click();
    await page.locator("#scc-columns").click();
    await page.locator('[data-scc-column="purpose"]').check();
    assert.match(await page.locator("#sigem-central-thead").innerText(),/Propósito/);
    await page.locator('[data-scc-sort="document"]').click();
    assert.match(await page.locator('[data-scc-sort="document"]').innerText(),/↑/);
    await page.locator("#scc-list-toggle").click();
    await page.locator("#scc-list-input").fill("DOC-001\nDOC-999");
    assert.match(await page.locator("#sigem-central-missing").innerText(),/DOC-999/);
    assert.deepEqual(failures,[],"Errors in browser: "+failures.join("; "));
    console.log("OK — Chromium: consulta, GRDT parcial, histórico, filtro, colunas, ordenação e lista não encontrada.");
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
