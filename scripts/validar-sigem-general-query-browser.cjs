"use strict";
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),assert=require("node:assert/strict");
const XLSX=require("../xlsx.full.min.js");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,".."),out=path.join(root,"artifacts/sigem-general-query");
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
  if(req.url==="/__query_fixture__"){res.setHeader("content-type","text/html; charset=utf-8");return res.end('<main class="workspace"></main>');}
  const file=path.join(root,new URL(req.url,"http://localhost").pathname);
  try{res.setHeader("content-type",file.endsWith(".js")?"text/javascript; charset=utf-8":file.endsWith(".css")?"text/css":"text/html; charset=utf-8");res.end(fs.readFileSync(file));}
  catch{res.writeHead(404).end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true,args:["--no-sandbox"],...(process.env.GRCON_CHROMIUM_PATH?{executablePath:process.env.GRCON_CHROMIUM_PATH}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
    const errors=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto("http://127.0.0.1:"+server.address().port+"/__query_fixture__");
    await page.evaluate(()=>{
      window.GrconNotify=()=>{};
      window.GrconHistory={read:()=>[{id:"one",egrdtNumber:"GRDT-001",generatedAt:"2026-10-21",files:[{document:"POSTADO-PELO-GRCON",revision:"A",title:"Título GRCON"}]}]};
      window.GrconCloud={state:{session:{user:{id:"author"}},membership:{workspace_id:"w1",contract_id:"c1",role:"operator"},online:false}};
      window.GRCONModuleLoader={ensure:async()=>{}};
    });
    for(const file of ["design-system.css","posting-conference.css"])await page.addStyleTag({url:"/"+file});
    for(const file of ["xlsx.full.min.js","posting_conference_core.js","posting_conference_refinement.js","posting_conference_report.js","document_task_queue.js","posting_conference_app.js","sigem_general_query_app.js"])
      await page.addScriptTag({url:"/"+file});
    await page.evaluate(()=>{
      const C=window.GrconPostingConference;
      const rows=[["Documento","Revisão","Título","Status","Disciplina"],
        ["ANTES-DO-GRCON-121","A","Documento vizinho","Em Workflow","Civil"],
        ["ANTES-DO-GRCON-122","A","<img src=x onerror=alert(1)> Título legado","Em Workflow","Civil"],
        ["ANTES-DO-GRCON-122","B","Título legado revisão B","Recusado","Civil"],
        ...Array.from({length:200},(_,i)=>["LEGADO-"+i,"0","Título "+i,"Em Workflow","Civil"])];
      window.queryFixture={meta:{fileName:"Consulta_Geral_Oficial.xlsx",referenceDate:"2026-10-23",snapshotId:"snapshot"},records:C.parseMatrix(rows).records};
      window.GrconSharedSigemQuery={state:{shared:window.queryFixture,stale:false},
        current:()=>window.queryFixture,refresh:async()=>{},refreshLatest:async()=>{},canPublish:()=>false};
      window.GrconPostingConferenceNavigation={open:async()=>{document.getElementById("sigem-general-query-module").hidden=true;await window.GrconPostingConferenceUi.activate();}};
    });
    await page.evaluate(()=>window.GrconPostingConferenceUi.activate());
    await page.locator("#pc-query-base").click();
    await page.waitForSelector("#sigem-general-query-module:not([hidden])");
    assert.equal(await page.locator("#posting-conference-module").isVisible(),false);
    assert.match(await page.locator("#sgq-source").innerText(),/203 registros/);
    assert.equal(await page.evaluate(()=>window.GrconGeneralQueryUi.state.result.rows.length),203);
    const initiallyRendered=await page.locator("#sgq-body tr").count();
    assert.ok(initiallyRendered<100&&initiallyRendered>0,"renderização virtual limita somente as linhas DOM");
    await page.locator("#sgq-batch").fill("ANTES-DO-GRCON-121\nANTES-DO-GRCON-122\nNAO-LOCALIZADO\nANTES-DO-GRCON-122");
    await page.locator("#sgq-search").click();
    assert.equal(await page.evaluate(()=>window.GrconGeneralQueryUi.state.result.rows.length),3);
    assert.equal(await page.evaluate(()=>window.GrconGeneralQueryUi.state.result.missing[0]),"NAO-LOCALIZADO");
    assert.match(await page.locator("#sgq-missing-title").innerText(),/1/);
    await page.locator("#sgq-code").fill("ANTES-DO-GRCON-122");
    await page.waitForFunction(()=>window.GrconGeneralQueryUi.state.result.rows.length===2);
    assert.equal(await page.locator("#sgq-body").innerText().then(s=>s.includes("ANTES-DO-GRCON-121")),false);
    assert.equal(await page.locator("#sgq-body img").count(),0,"título perigoso não pode gerar HTML");
    await page.locator("[data-sgq-detail]").first().click();
    const dialog=page.locator("dialog[open]");
    assert.match(await dialog.innerText(),/Histórico de revisões/);
    assert.match(await dialog.innerText(),/Linha da planilha/);
    assert.ok((await dialog.locator("tbody tr").count())===2,"detalhe deve mostrar todas as revisões do código");
    await dialog.locator("[data-sgq-close]").click();
    await page.locator("[data-sgq-sort=revision]").click();
    await page.locator("[data-sgq-sort=revision]").click();
    assert.equal(await page.evaluate(()=>window.GrconGeneralQueryUi.state.result.rows[0].revision),"B");
    await page.locator("#sgq-column-details summary").click();
    await page.locator('[data-sgq-column="discipline"]').uncheck();
    const downloaded=page.waitForEvent("download");
    await page.locator("#sgq-export").click();
    const download=await downloaded,saved=path.join(out,download.suggestedFilename());
    await download.saveAs(saved);
    const book=XLSX.read(fs.readFileSync(saved),{type:"buffer"});
    const exported=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
    assert.equal(exported.length,2,"XLSX precisa incluir somente linhas filtradas");
    assert.equal(exported[0].Documento,"ANTES-DO-GRCON-122");
    assert.equal(exported[0]["Revisão"],"B","XLSX deve manter a ordenação da tabela");
    assert.equal(Object.hasOwn(exported[0],"Disciplina"),false,"coluna oculta não pode ser exportada");
    await page.locator("#sgq-revision").fill("B");
    await page.waitForFunction(()=>window.GrconGeneralQueryUi.state.result.rows.length===1);
    assert.match(await page.locator("#sgq-body").innerText(),/Recusado/);
    await page.locator("#sgq-clear").click();
    assert.equal(await page.evaluate(()=>window.GrconGeneralQueryUi.state.result.rows.length),3,"limpar filtros conserva códigos colados");
    await page.locator("#sgq-clear-batch").click();
    assert.equal(await page.evaluate(()=>window.GrconGeneralQueryUi.state.result.rows.length),203);
    const downloadCsv=page.waitForEvent("download");
    await page.locator("#sgq-csv").click();
    const csv=await downloadCsv;
    const csvPath=path.join(out,csv.suggestedFilename());await csv.saveAs(csvPath);
    assert.equal(fs.readFileSync(csvPath,"utf8").split("\r\n").length,204,"CSV exporta todas as linhas, não só renderizadas");
    await page.screenshot({path:path.join(out,"consulta-geral.png"),fullPage:true});
    await page.evaluate(()=>{
      window.queryFixture=null;
      window.GrconCloud.state.membership.workspace_id="w2";
      window.dispatchEvent(new Event("grcon:contract-context-changed"));
    });
    assert.equal(await page.locator("#sgq-body").innerText().then(s=>s.includes("ANTES-DO-GRCON")),false);
    assert.equal(await page.locator("#sgq-export").isDisabled(),true);
    assert.deepEqual(errors,[]);
    console.log("Consulta Geral Chromium: lote, todas revisões, identidade 121/122, XSS, filtros, virtualização, CSV/XLSX fiel, detalhes e isolamento de contratos aprovados.");
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
