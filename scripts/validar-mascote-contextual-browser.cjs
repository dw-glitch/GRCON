const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";
const fixtureUrl = `${baseUrl}/tests/fixtures/grcon-mascot-scenarios.html`;
const outputDir = process.env.GRCON_MASCOT_OUTPUT || path.join(process.cwd(), "artifacts/mascot-contextual");
const keys = ["importBases","longProcessing","sleepy","curious","grdtStamp","teamsSend","grdtToTeams","paperwork","reviewCoffee"];
const assetByKey = {
  importBases:"grcon-mascot-import-bases.mp4", longProcessing:"grcon-mascot-long-processing.mp4",
  sleepy:"grcon-mascot-sleep.mp4", curious:"grcon-mascot-curious.mp4", grdtStamp:"grcon-mascot-grdt-stamp.mp4",
  teamsSend:"grcon-mascot-teams-send.mp4", grdtToTeams:"grcon-mascot-grdt-to-teams.mp4",
  paperwork:"grcon-mascot-paperwork.mp4", reviewCoffee:"grcon-mascot-review-coffee.mp4",
};

async function waitReady(page) {
  await page.waitForFunction(() => window.GrconMascotScenarios?.diagnostics().ready && window.GrconMascot?.diagnostics().ready, null, { timeout: 15000 });
}
async function enableServiceWorker(page) {
  await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload({ waitUntil: "networkidle" });
    await waitReady(page);
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10000 });
}
async function stop(page) {
  await page.evaluate(() => window.GrconMascotScenarios.stop("browser-test"));
  await page.waitForTimeout(80);
}
async function play(page, key) {
  if (key === "teamsSend") await page.evaluate(() => { const dialog=document.querySelector("#egrdt-teams-dialog"); if (dialog && !dialog.open) dialog.showModal(); });
  const shown = await page.evaluate((scenario) => window.GrconMascotScenarios.play(scenario, { priority: 400, force: true, source: "browser-test" }), key);
  assert.equal(shown, true, `${key}: cenário deve ser inserido`);
  await page.waitForFunction((scenario) => {
    const d = window.GrconMascotScenarios.diagnostics();
    const stage = d.stages.find((item) => item.key === scenario);
    return d.active?.key === scenario && stage && ["playing","fallback"].includes(stage.status);
  }, key, { timeout: 15000 });
  const state = await page.evaluate((scenario) => {
    const d = window.GrconMascotScenarios.diagnostics();
    const stage = d.stages.find((item) => item.key === scenario);
    const el = document.querySelector(`[data-scene="${scenario}"]`);
    const video = el?.querySelector("video");
    const rect = el?.getBoundingClientRect();
    return { stage, rect: rect ? { left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom, width:rect.width, height:rect.height } : null,
      video: video ? { muted:video.muted, playsInline:video.playsInline, preload:video.preload, readyState:video.readyState, paused:video.paused, src:video.currentSrc } : null,
      header: window.GrconMascot.diagnostics(), runner: window.GrconMascotRunner?.diagnostics?.() || null };
  }, key);
  assert.notEqual(state.stage.status, "fallback", `${key}: mídia não pode cair em fallback no teste normal`);
  assert.equal(state.video.muted, true, `${key}: autoplay precisa ser muted`);
  assert.equal(state.video.playsInline, true, `${key}: precisa usar playsInline`);
  assert.ok(state.video.readyState >= 2, `${key}: readyState insuficiente`);
  assert.match(state.video.src, new RegExp(`${assetByKey[key].replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\?v=20260918\\.3$`));
  assert.equal(state.header.activeVideos, 0, `${key}: cabeçalho deve ficar estático`);
  assert.equal(state.runner?.suppressed, true, `${key}: runner não pode competir`);
  return state;
}
async function probeHttp(page, key) {
  return page.evaluate(async (scenario) => {
    const url = window.GrconMascotScenarios.diagnostics().assets[scenario].asset;
    const response = await fetch(url, { cache: "reload" });
    await response.arrayBuffer();
    return { status: response.status, type: response.headers.get("content-type") || "", url };
  }, key);
}
async function playAll(page) {
  const result = {};
  for (const key of keys) { result[key] = await play(page, key); await stop(page); }
  return result;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport:{width:1440,height:900}, serviceWorkers:"allow" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(fixtureUrl, { waitUntil:"networkidle", timeout:30000 });
    await waitReady(page);
    await page.evaluate(async () => { for (const name of await caches.keys()) await caches.delete(name); });
    let originRange = null;
    if (/\\.vercel\\.app$/i.test(new URL(baseUrl).hostname)) {
      originRange = await page.evaluate(async () => {
        const url = window.GrconMascotScenarios.diagnostics().assets.paperwork.asset;
        const response = await fetch(url, { headers:{ Range:"bytes=0-1023" }, cache:"reload" });
        await response.arrayBuffer();
        return { status:response.status, contentRange:response.headers.get("content-range"), acceptRanges:response.headers.get("accept-ranges") };
      });
      assert.equal(originRange.status, 206, "Vercel Preview precisa aceitar Range");
      assert.match(originRange.contentRange || "", /^bytes 0-1023\\//);
    }
    await enableServiceWorker(page);

    const cold = {};
    for (const key of keys) {
      cold[key] = { http: await probeHttp(page, key), playback: await play(page, key) };
      assert.equal(cold[key].http.status, 200, `${key}: HTTP cold precisa ser 200`);
      assert.match(cold[key].http.type, /^video\/mp4(?:;|$)/i, `${key}: MIME incorreto`);
      await page.screenshot({ path:path.join(outputDir,`${key}-desktop.png`), fullPage:true });
      await stop(page);
    }
    await page.screenshot({ path:path.join(outputDir,"desktop-cold.png"), fullPage:true });
    assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true, "Service Worker deve controlar a fixture");

    const range = await page.evaluate(async () => {
      const url = window.GrconMascotScenarios.diagnostics().assets.paperwork.asset;
      const response = await fetch(url, { headers:{ Range:"bytes=0-1023" } });
      await response.arrayBuffer();
      return { status:response.status, contentRange:response.headers.get("content-range"), acceptRanges:response.headers.get("accept-ranges") };
    });
    assert.equal(range.status, 206); assert.match(range.contentRange || "", /^bytes 0-1023\//); assert.equal(range.acceptRanges, "bytes");

    const warm = await playAll(page);
    await page.reload({ waitUntil:"networkidle", timeout:30000 }); await waitReady(page);
    assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);
    const reload = await playAll(page);
    const versionProbe = await page.evaluate(async () => {
      const current = window.GrconMascotScenarios.diagnostics().assets.curious.asset;
      const url = current.replace("v=20260918.4", "v=20260918.4-probe");
      const response = await fetch(url, { cache:"reload" }); await response.arrayBuffer();
      return { status:response.status, type:response.headers.get("content-type") || "", url };
    });
    assert.equal(versionProbe.status,200); assert.match(versionProbe.type,/^video\/mp4/i);

    await page.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:processing-state", { detail:{ active:true, context:"control", task:"Analisando documentos" } })));
    await page.waitForFunction(() => window.GrconMascotScenarios.diagnostics().active?.key === "paperwork");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:processing-state", { detail:{ active:false, context:"control" } })));
    await page.waitForFunction(() => !window.GrconMascotScenarios.diagnostics().active);

    await page.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:mascot-operation", { detail:{ active:true, state:"sigem-pw-analysis", task:"Validando e indexando a base ProjectWise…" } })));
    await page.waitForFunction(() => window.GrconMascotScenarios.diagnostics().active?.key === "importBases");
    await page.evaluate(() => document.querySelector('[data-scene="importBases"] video').dispatchEvent(new Event("ended")));
    await page.waitForFunction(() => window.GrconMascotScenarios.diagnostics().active?.key === "longProcessing");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:mascot-operation", { detail:{ active:false, state:"sigem-pw-analysis" } })));

    await page.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:mascot-operation", { detail:{ active:true, state:"checking-document", task:"Conferindo documentos" } })));
    await page.waitForFunction(() => window.GrconMascotScenarios.diagnostics().active?.key === "reviewCoffee", null, { timeout:5000 });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:mascot-operation", { detail:{ active:false, state:"checking-document" } })));

    await page.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:egrdt-generated", { detail:{ records:[{ id:"browser-grdt-1", egrdtNumber:"EGRDT-TESTE" }] } })));
    await page.waitForFunction(() => window.GrconMascotScenarios.diagnostics().active?.key === "grdtStamp");
    await page.evaluate(() => document.querySelector('[data-scene="grdtStamp"] video').dispatchEvent(new Event("ended")));
    await page.waitForFunction(() => window.GrconMascotScenarios.diagnostics().active?.key === "grdtToTeams");
    await stop(page);

    await page.evaluate(() => { const d=document.querySelector("#egrdt-teams-dialog"); if(!d.open) d.showModal(); window.dispatchEvent(new CustomEvent("grcon:egrdt-teams-send", { detail:{ active:true, record:{id:"browser-grdt-1"} } })); });
    await page.waitForFunction(() => window.GrconMascotScenarios.diagnostics().active?.key === "teamsSend");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:egrdt-teams-send", { detail:{ active:false, outcome:"error" } })));
    await page.waitForFunction(() => !window.GrconMascotScenarios.diagnostics().active);
    assert.deepEqual(errors, [], `console deve ficar sem erros: ${errors.join(" | ")}`);

    const fallbackContext = await browser.newContext({ viewport:{width:1440,height:900}, serviceWorkers:"block" });
    const fallback = await fallbackContext.newPage();
    await fallback.route(/grcon-mascot-paperwork\.mp4(?:\?.*)?$/, (route) => route.abort("failed"));
    await fallback.route(/grcon-mascot-paperwork-poster\.webp(?:\?.*)?$/, (route) => route.abort("failed"));
    await fallback.goto(`${fixtureUrl}?fallback=1`, { waitUntil:"networkidle", timeout:30000 }); await waitReady(fallback);
    await fallback.evaluate(() => window.GrconMascotScenarios.play("paperwork", { priority:400, force:true }));
    await fallback.waitForFunction(() => window.GrconMascotScenarios.diagnostics().stages.find((s)=>s.key==="paperwork")?.status === "fallback", null, { timeout:15000 });
    const fallbackState = await fallback.evaluate(() => { const el=document.querySelector('[data-scene="paperwork"]'); const img=el.querySelector("img"); return { d:window.GrconMascotScenarios.diagnostics(), poster:getComputedStyle(img).opacity, posterSrc:img.currentSrc || img.src, hidden:el.hidden }; });
    assert.equal(fallbackState.hidden,false); assert.equal(Number(fallbackState.poster),1); assert.match(fallbackState.posterSrc,/grcon-mascot-sprite\.png\?v=20260918\.4$/);
    await fallback.screenshot({ path:path.join(outputDir,"fallback-poster.png"), fullPage:true }); await fallbackContext.close();

    const reducedContext = await browser.newContext({ viewport:{width:1440,height:900}, reducedMotion:"reduce", serviceWorkers:"block" });
    const reduced = await reducedContext.newPage(); await reduced.goto(`${fixtureUrl}?reduced=1`, { waitUntil:"networkidle" }); await waitReady(reduced);
    await reduced.evaluate(() => window.GrconMascotScenarios.play("curious", { priority:400, force:true }));
    const reducedState = await reduced.evaluate(() => { const el=document.querySelector('[data-scene="curious"]'); return { status:window.GrconMascotScenarios.diagnostics().stages.find((s)=>s.key==="curious").status, video:getComputedStyle(el.querySelector("video")).display, poster:getComputedStyle(el.querySelector("img")).opacity }; });
    assert.equal(reducedState.status,"poster"); assert.equal(reducedState.video,"none"); assert.equal(Number(reducedState.poster),1);
    await reduced.waitForFunction(() => !window.GrconMascotScenarios.diagnostics().active, null, { timeout:4000 });
    await reducedContext.close();

    const mobileContext = await browser.newContext({ viewport:{width:390,height:844}, serviceWorkers:"block" });
    const mobile = await mobileContext.newPage(); await mobile.goto(`${fixtureUrl}?mobile=1`, { waitUntil:"networkidle" }); await waitReady(mobile);
    for (const key of ["paperwork","longProcessing","grdtStamp","curious"]) {
      const s=await play(mobile,key); assert.ok(s.rect.left >= -1 && s.rect.right <= 391, `${key}: não pode vazar horizontalmente no mobile`);
      await mobile.screenshot({ path:path.join(outputDir,`${key}-mobile.png`), fullPage:true });
      await stop(mobile);
    }
    await mobile.screenshot({ path:path.join(outputDir,"mobile.png"), fullPage:true }); await mobileContext.close();

    console.log(JSON.stringify({ cold:Object.fromEntries(Object.entries(cold).map(([k,v])=>[k,{http:v.http,status:v.playback.stage.status}])), warm:Object.fromEntries(keys.map(k=>[k,warm[k].stage.status])), originRange, reload:Object.fromEntries(keys.map(k=>[k,reload[k].stage.status])), range, versionProbe, fallback: fallbackState.d.stages.find((s)=>s.key==="paperwork"), reduced:reducedState }, null, 2));
    await context.close();
  } finally { await browser.close(); }
}
main().catch((error)=>{ console.error(error); process.exitCode=1; });