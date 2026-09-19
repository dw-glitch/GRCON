const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const XLSX = require("../xlsx.full.min.js");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";
const outputDir = path.join(process.cwd(), "artifacts/consultas-browser");
const fixtureDir = path.join(process.cwd(), "artifacts/consultas-fixtures");
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(fixtureDir, { recursive: true });

function writeLd(file, mode) {
  if (mode === "invalid") { fs.writeFileSync(file, "arquivo invalido"); return; }
  if (mode === "empty") {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["PLANILHA SEM DOCUMENTOS"]]), "ET");
    fs.writeFileSync(file, XLSX.write(wb, { type:"buffer", bookType:"xlsx" }));
    return;
  }
  const P = "C1O_RNEST_U32_3.1.1.1_INS_RIR_";
  const h = Array(24).fill("");
  [["ITEM",0],["DOCUMENTO",1],["REVISÃO",2],["TÍTULO",3],["UNIDADE/ÁREA",4],["DISCIPLINA",5],["TIPO DE DOCUMENTO",6],["PROPÓSITO DE EMISSÃO",7],["FORMATO",8],["TAG",9],["GRDT",12],["DATA EFETIVA DE EMISSÃO",13],["STATUS",14],["STATUS SIGEM",16],["ALOCAÇÃO",18],["COMENTÁRIO DA FISCAL",20],["CAMINHO DATABOOK",21],["CONFIRMAÇÃO DE ALOCAÇÃO",23]].forEach(function (x) { h[x[1]] = x[0]; });
  function row(item, doc, rev, tag, extra) {
    extra = extra || {};
    const a = Array(24).fill("");
    a[0]=String(item); a[1]=doc; a[2]=rev; a[3]="RELATÓRIO DE INSPEÇÃO — "+tag; a[4]="U-32"; a[5]="RNEST UHDT-D U32 INSPEÇÃO"; a[6]="RELATÓRIO"; a[7]="Para Informação"; a[8]="A4"; a[9]=tag; a[14]="EM EMISSÃO"; a[18]=extra.aloc===undefined?"C1O-ALOC-CM-0062-2026":extra.aloc; a[21]="DATA BOOK C&M UHDTD U-32"; a[23]=extra.confirmacao||"ALOCADO"; if(extra.grdt)a[12]=extra.grdt; if(extra.data)a[13]=extra.data; return a;
  }
  const et = XLSX.utils.aoa_to_sheet([["LISTA DE DOCUMENTOS"],[""],["CONSAG"],[""],["DADOS DOS DOCUMENTOS"],h,row(1,P+"SPE-AST-320019","0","SPE-AST-320019"),row(2,P+"nt-SPE-AST-320019","B","SPE-AST-320019",{aloc:"",confirmacao:"NÃO ALOCADO",grdt:"GRDT-2026-0087",data:"12/03/2026"}),row(3,P+"nt-SPE-AST-320020","0","SPE-AST-320020"),row(4,P+"nt-SPE-AST-320021","0","SPE-AST-320021"),["FIM"]]);
  const hist = XLSX.utils.aoa_to_sheet([["COLAR AQUI O RELATÓRIO DO SIGEM"],[""],["DOCUMENTO","REVISÃO","STATUS SIGEM","GRDT","DATA EFETIVA DE EMISSÃO",""],[P+"SPE-AST-320019","0","Não Postado","","",""],[P+"nt-SPE-AST-320019","B","Em Análise","GRDT-2026-0087","12/03/2026",""]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, et, "ET"); XLSX.utils.book_append_sheet(wb, hist, "Colar SIGEM");
  fs.writeFileSync(file, XLSX.write(wb, { type:"buffer", bookType:"xlsx" }));
}

async function openConsultas(page) {
  await page.goto(baseUrl, { waitUntil:"networkidle", timeout:30000 });
  // Este roteiro valida Consultas, não autenticação/cloud. Em vez de mutar o
  // estado assíncrono do login (que pode relocar o gate após getSession), a
  // página de teste recebe apenas uma sobrescrita visual. O código publicado,
  // a sessão Supabase e os eventos do app permanecem intocados.
  await page.addStyleTag({ content: [
    'html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script) { visibility: visible !important; }',
    '#grcon-cloud-auth { display: none !important; }',
  ].join("\n") });
  await page.locator('[data-grcon-view="requests"]:visible').first().click();
  await page.locator("#requests-area-consulta-react").waitFor({ state:"visible", timeout:15000 });
}
async function uploadLds(page, files) {
  await page.locator('.requests-drop input[type="file"]').setInputFiles(files);
  await page.waitForFunction(function () { return document.querySelectorAll(".requests-ld-loading").length === 0; }, null, { timeout:15000 });
}
async function clearLds(page) {
  const panel = page.locator(".requests-setup-panel").first();
  const body = panel.locator(".requests-setup-body");
  if (await body.getAttribute("hidden") !== null) {
    const edit = panel.getByRole("button", { name:"Alterar" });
    if (await edit.count()) await edit.click();
  }
  const button = panel.getByRole("button", { name:"Remover todas" });
  if (await button.count()) {
    await button.click();
    await page.waitForFunction(function () { return document.querySelectorAll(".requests-ld-item").length === 0; });
  }
}

(async function () {
  const browser = await chromium.launch({ headless:true });
  const errors = [];
  const responses = new Map();
  try {
    const context = await browser.newContext({ viewport:{width:1366,height:900}, serviceWorkers:"allow", acceptDownloads:true, permissions:["clipboard-read","clipboard-write"] });
    const page = await context.newPage();
    page.on("pageerror", function (e) { errors.push("pageerror: "+e.message); });
    page.on("console", function (m) { if (m.type()==="error") errors.push("console: "+m.text()); });
    page.on("response", function (r) { try { responses.set(new URL(r.url()).pathname, {status:r.status(), type:r.headers()["content-type"]||""}); } catch (_) {} });
    await openConsultas(page);
    await page.screenshot({ path:path.join(outputDir,"01-consultas-vazia-1366.png"), fullPage:true });

    const head = await page.evaluate(function () {
      return ["requests.css","react-ui.css","requests-phase-b.css"].map(function (name) { const l=document.head.querySelector('link[href="'+name+'"]'); return {name:name,inHead:Boolean(l),media:l?l.media:"",sheet:Boolean(l&&l.sheet)}; });
    });
    head.forEach(function (x) { assert.equal(x.inHead,true,x.name); assert.equal(x.media,"all",x.name); assert.equal(x.sheet,true,x.name); const r=responses.get("/"+x.name); assert.equal(r&&r.status,200,x.name); assert.match(r&&r.type||"",/css/i,x.name); });
    assert.equal(await page.evaluate(function(){return document.head.textContent.includes("\\n");}),false);

    const valid1=path.join(fixtureDir,"LD_VALIDA_1.xlsx"), valid2=path.join(fixtureDir,"LD_VALIDA_2.xlsx"), valid3=path.join(fixtureDir,"LD_VALIDA_3.xlsx"), invalid=path.join(fixtureDir,"LD_INVALIDA.xlsx"), empty=path.join(fixtureDir,"LD_VAZIA.xlsx");
    [valid1,valid2,valid3].forEach(function(f){writeLd(f,"valid");}); writeLd(invalid,"invalid"); writeLd(empty,"empty");
    await uploadLds(page,[valid1]); assert.match(await page.locator(".requests-setup-panel").first().locator("p").innerText(),/1 LD\(s\) válida\(s\)/); await clearLds(page);
    await uploadLds(page,[valid1,valid2]); assert.match(await page.locator(".requests-setup-panel").first().locator("p").innerText(),/2 LD\(s\) válida\(s\)/); await clearLds(page);
    await uploadLds(page,[valid1,valid2,valid3]); assert.match(await page.locator(".requests-setup-panel").first().locator("p").innerText(),/3 LD\(s\) válida\(s\)/); await page.screenshot({path:path.join(outputDir,"02-consultas-preparada-3lds-1366.png"),fullPage:true}); await clearLds(page);
    await uploadLds(page,[valid1,invalid,empty]); assert.equal(await page.locator(".requests-ld-item.has-error").count(),2); assert.equal(await page.locator(".requests-ld-item:not(.has-error)").count(),1); assert.match(await page.locator(".requests-setup-panel").first().locator("p").innerText(),/1 válida.*2 com erro/); assert.equal(await page.locator(".requests-setup-panel").first().locator(".requests-setup-body").getAttribute("hidden"),null);

    const P="C1O_RNEST_U32_3.1.1.1_INS_RIR_"; const docs=[P+"SPE-AST-320019",P+"SPE-AST-320020",P+"nt-SPE-AST-32O021",P+"nt-SPE-AST-999999"]; for(let i=docs.length;i<500;i+=1)docs.push(P+"nt-ZZ-"+String(i).padStart(6,"0"));
    await page.locator("#requests-paste").fill(docs.join("\n")); await page.getByRole("button",{name:"Adicionar à lista"}).click(); await page.waitForFunction(function(){return document.querySelector(".requests-selection-note")&&document.querySelector(".requests-selection-note").textContent.includes("500 de 500");});
    await page.getByRole("button",{name:"Consultar documentos",exact:true}).click(); await page.waitForFunction(function(){return document.querySelector(".requests-progress")&&document.querySelector(".requests-progress").hidden&&document.querySelector(".requests-summary");},{},{timeout:20000});
    assert.equal(await page.locator(".requests-kpi").first().locator("strong").innerText(),"500"); assert.match(await page.locator(".requests-pagination").innerText(),/Página 1 de 5/); await page.screenshot({path:path.join(outputDir,"03-resultados-1366.png"),fullPage:true});

    for (const label of ["Localizados","A validar","Não localizados","Total"]) { const k=page.getByRole("button",{name:new RegExp("^"+label+"\\s+\\d+$")}); await k.click(); assert.equal(await k.getAttribute("aria-pressed"),"true"); }
    await page.getByRole("button",{name:/^Localizados\s+\d+$/}).click(); await page.locator(".requests-search input").fill("SPE-AST-320020"); await page.locator(".requests-filterbar select").nth(0).selectOption("sim"); await page.locator(".requests-filterbar select").nth(1).selectOption("documento"); await page.waitForTimeout(100); assert.match(await page.locator(".requests-filter-count").innerText(),/Exibindo 1 de 500/); await page.getByRole("button",{name:"Limpar filtros"}).click(); await page.getByRole("button",{name:/^Total\s+\d+$/}).click();

    for(let i=0;i<4;i+=1)await page.getByRole("button",{name:"Próxima"}).click(); assert.match(await page.locator(".requests-pagination").innerText(),/Página 5 de 5/); assert.match(await page.locator(".requests-pagination").innerText(),/401–500/); await page.locator(".requests-search input").fill("ZZ-000499"); await page.waitForTimeout(100); assert.equal(await page.locator(".requests-pagination").count(),0); await page.getByRole("button",{name:"Limpar filtros"}).click(); await page.waitForTimeout(100); assert.match(await page.locator(".requests-pagination").innerText(),/Página 1 de 5/);

    await page.getByRole("button",{name:"Copiar",exact:true}).click(); const clip=await page.evaluate(function(){return navigator.clipboard.readText();}); const clipLines=clip.split(/\\r?\\n/).filter(Boolean); const clipHeaders=clipLines[0].split("\\t"); const clipDocumentIndex=clipHeaders.indexOf("DOCUMENTO"); assert.ok(clipDocumentIndex>=0); const copiedDocuments=clipLines.slice(1).map(function(line){return line.split("\\t")[clipDocumentIndex]||"";}).filter(Boolean); assert.equal(copiedDocuments.length,500); assert.equal(new Set(copiedDocuments).size,500);
    const downloadPromise=page.waitForEvent("download"); await page.getByRole("button",{name:"Exportar Excel"}).click(); const dl=await downloadPromise; const exportPath=path.join(fixtureDir,"export.xlsx"); await dl.saveAs(exportPath); const wb=XLSX.read(fs.readFileSync(exportPath),{type:"buffer"}); const matrix=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""}); const hi=matrix.findIndex(function(r){return String(r[0]||"").toUpperCase()==="SITUAÇÃO";}); assert.ok(hi>=0); assert.equal(matrix.slice(hi+1).filter(function(r){return String(r[0]||"").trim();}).length,500);

    const opener=page.locator('button[aria-label^="Abrir detalhes"]').first(); await opener.focus(); await opener.click(); await page.locator('.requests-detail-drawer[role="dialog"][aria-modal="true"]').waitFor(); assert.equal(await page.evaluate(function(){return document.body.style.overflow;}),"hidden"); assert.equal(await page.evaluate(function(){return document.querySelector(".requests-detail-drawer").contains(document.activeElement);}),true); await page.screenshot({path:path.join(outputDir,"04-drawer-aberto-1366.png"),fullPage:true}); await page.keyboard.press("Tab"); assert.equal(await page.evaluate(function(){return document.querySelector(".requests-detail-drawer").contains(document.activeElement);}),true); await page.keyboard.press("Shift+Tab"); assert.equal(await page.evaluate(function(){return document.querySelector(".requests-detail-drawer").contains(document.activeElement);}),true); await page.keyboard.press("Escape"); await page.locator(".requests-detail-drawer").waitFor({state:"detached"}); assert.equal(await page.evaluate(function(){return document.body.style.overflow;}),""); assert.match(await page.evaluate(function(){return document.activeElement&&document.activeElement.getAttribute("aria-label")||"";}),/^Abrir detalhes/);
    await opener.click(); await page.locator(".requests-detail-overlay").click({position:{x:5,y:5}}); await page.locator(".requests-detail-drawer").waitFor({state:"detached"});

    await page.locator(".requests-more-actions summary").click(); await page.getByRole("button",{name:"Remover duplicados"}).click(); assert.equal(await page.locator(".requests-more-actions").getAttribute("open"),null); await page.locator(".requests-more-actions summary").click(); await page.keyboard.press("Escape"); assert.equal(await page.locator(".requests-more-actions").getAttribute("open"),null); await page.locator(".requests-more-actions summary").click(); await page.locator("body").click({position:{x:2,y:2}}); assert.equal(await page.locator(".requests-more-actions").getAttribute("open"),null);

    const widths={}; for(const width of [1440,1366,1024,768]) { await page.setViewportSize({width:width,height:900}); widths[width]=await page.evaluate(function(){const t=document.querySelector(".requests-table"),w=document.querySelector(".requests-table-wrap"),r=document.documentElement,hs=[...document.querySelectorAll(".requests-table thead th")].map(function(x){return x.getBoundingClientRect();}); return {table:t.scrollWidth,client:w.clientWidth,scroll:w.scrollWidth,page:r.scrollWidth,viewport:r.clientWidth,max:Math.max.apply(null,hs.map(function(x){return x.width;})),ok:hs.every(function(x,i){return i===0||x.left>=hs[i-1].right-1;})};}); assert.equal(widths[width].scroll,widths[width].table); assert.ok(widths[width].page<=widths[width].viewport+1); assert.ok(widths[width].max<=330); assert.equal(widths[width].ok,true); }

    await page.setViewportSize({width:390,height:844}); await page.screenshot({path:path.join(outputDir,"05-mobile-390.png"),fullPage:true}); const mobile=await page.evaluate(function(){const r=document.documentElement,bs=[...document.querySelectorAll(".requests-commandbar button:not([disabled]),.requests-commandbar summary")].map(function(x){return x.getBoundingClientRect();}),ks=[...document.querySelectorAll(".requests-kpi")].map(function(x){return x.getBoundingClientRect();}); return {page:r.scrollWidth,viewport:r.clientWidth,buttons:bs.every(function(x){return x.left>=-1&&x.right<=innerWidth+1;}),rows:new Set(ks.map(function(x){return Math.round(x.top);})).size};}); assert.ok(mobile.page<=mobile.viewport+1); assert.equal(mobile.buttons,true); assert.ok(mobile.rows>=2);
    await opener.click(); const dm=await page.evaluate(function(){const d=document.querySelector(".requests-detail-drawer"),b=d.querySelector(".requests-detail-body");return {width:d.getBoundingClientRect().width,viewport:innerWidth,scroll:b.scrollHeight>=b.clientHeight};}); assert.ok(dm.width<=dm.viewport); assert.equal(dm.scroll,true); await page.locator(".requests-detail-overlay").click({position:{x:5,y:5}});
    await page.evaluate(function(){document.documentElement.dataset.theme="dark";}); await page.screenshot({path:path.join(outputDir,"06-dark-mode-390.png"),fullPage:true}); await page.setViewportSize({width:1366,height:900}); await page.screenshot({path:path.join(outputDir,"07-dark-mode-1366.png"),fullPage:true}); await page.evaluate(function(){document.documentElement.dataset.theme="";});

    for(let i=0;i<3;i+=1){await page.locator('[data-grcon-view="control"]:visible').first().click(); await page.locator('[data-grcon-view="requests"]:visible').first().click(); await page.locator("#requests-area-consulta-react").waitFor({state:"visible"}); assert.equal(await page.locator("#requests-area-consulta-react").count(),1); assert.equal(await page.locator(".requests-detail-drawer").count(),0); assert.equal(await page.locator(".requests-more-actions[open]").count(),0);}
    await page.evaluate(async function(){await navigator.serviceWorker.ready;}); await page.reload({waitUntil:"networkidle"}); await page.waitForFunction(function(){return Boolean(navigator.serviceWorker.controller);},null,{timeout:10000}); const caches=await page.evaluate(function(){return window.caches.keys();}); assert.ok(caches.some(function(k){return k.includes("phase-b-consultas-ui1-hardening1");})); await page.locator('[data-grcon-view="requests"]:visible').first().click(); await page.locator("#requests-area-consulta-react").waitFor();
    ["/requests.css","/react-ui.css","/requests-phase-b.css","/react-dist/consultas-app.js"].forEach(function(p){const r=responses.get(p);assert.equal(r&&r.status,200,p);});
    const relevant=errors.filter(function(x){return /ReferenceError|TypeError|Unhandled|React|duplicate key|Content Security Policy|CSP|service worker/i.test(x);}); assert.deepEqual(relevant,[]);
    fs.writeFileSync(path.join(outputDir,"metrics.json"),JSON.stringify({head:head,widths:widths,mobile:mobile,drawerMobile:dm,caches:caches,errors:errors},null,2));
    console.log(JSON.stringify({passed:true,widths:widths,mobile:mobile,caches:caches,errors:errors},null,2));
  } finally { await browser.close(); }
})().catch(function(e){console.error(e);process.exitCode=1;});
