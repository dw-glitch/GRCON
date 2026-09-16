const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";
const fixtureUrl = `${baseUrl}/tests/fixtures/grcon-mascot-runner.html`;
const outputDir = process.env.GRCON_MASCOT_RUNNER_OUTPUT || path.join(process.cwd(), "artifacts/mascot-runner");
fs.mkdirSync(outputDir, { recursive: true });

async function ready(page) {
  await page.waitForFunction(() => window.GrconMascotRunner?.diagnostics?.().ready, null, { timeout: 15000 });
  assert.equal(await page.locator("#grcon-mascot-run-lane").count(), 1);
}
async function start(page, detail = {}) {
  await page.evaluate((extra) => {
    window.dispatchEvent(new CustomEvent("grcon:processing-state", {
      detail: { active: true, state: "analyzing", context: "control", task: "Analisar e conferir", ...extra },
    }));
  }, detail);
}
async function stop(page, detail = {}) {
  await page.evaluate((extra) => {
    window.dispatchEvent(new CustomEvent("grcon:processing-state", {
      detail: { active: false, state: "analyzing", context: "control", task: "Analisar e conferir", ...extra },
    }));
  }, detail);
}
async function geometry(page) {
  return page.evaluate(() => {
    const lane = document.querySelector("#grcon-mascot-run-lane .grcon-mascot-run-track");
    const runner = document.querySelector("#grcon-mascot-run-lane .grcon-mascot-runner");
    const workspace = document.querySelector("#app-main");
    const laneRect = lane.getBoundingClientRect();
    const runnerRect = runner.getBoundingClientRect();
    const workspaceRect = workspace.getBoundingClientRect();
    return {
      lane: { left: laneRect.left, right: laneRect.right, width: laneRect.width },
      runner: { left: runnerRect.left, right: runnerRect.right, width: runnerRect.width },
      workspace: { left: workspaceRect.left, right: workspaceRect.right, width: workspaceRect.width },
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      pointerEvents: getComputedStyle(document.getElementById("grcon-mascot-run-lane")).pointerEvents,
      active: document.getElementById("grcon-mascot-run-lane").classList.contains("is-active"),
      media: document.getElementById("grcon-mascot-run-lane").dataset.media,
    };
  });
}

async function validateViewport(browser, name, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(fixtureUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await ready(page);
  await page.locator("#fixture-action").click();
  await page.waitForFunction(() => window.GrconMascotRunner.diagnostics().lastResult.reason === "running", null, { timeout: 10000 });
  let g = await geometry(page);
  assert.equal(g.pointerEvents, "none");
  assert.ok(g.lane.width > 0);
  assert.ok(Math.abs(g.lane.left - g.workspace.left) < 2, `${name}: pista precisa começar no workspace`);
  assert.ok(Math.abs(g.lane.right - g.workspace.right) < 2, `${name}: pista precisa terminar no workspace`);
  assert.ok(g.overflow <= 1, `${name}: não pode criar scroll horizontal`);
  const d = await page.evaluate(() => window.GrconMascotRunner.diagnostics());
  assert.ok(d.lastResult.distance > d.lastResult.laneWidth, `${name}: corrida deve começar antes da esquerda e terminar além da direita`);
  assert.ok(d.lastResult.duration >= 2600 && d.lastResult.duration <= 4000);
  await page.screenshot({ path: path.join(outputDir, `${name}-inicio.png`), fullPage: false });
  await page.waitForTimeout(Math.round(d.lastResult.duration * 0.48));
  g = await geometry(page);
  assert.equal(g.active, true);
  assert.ok(g.runner.right > g.lane.left && g.runner.left < g.lane.right, `${name}: mascote precisa estar dentro da pista no meio`);
  assert.ok(g.overflow <= 1);
  await page.screenshot({ path: path.join(outputDir, `${name}-meio.png`), fullPage: false });
  await page.waitForFunction(() => window.GrconMascotRunner.diagnostics().lastResult.reason === "complete", null, { timeout: 7000 });
  await page.screenshot({ path: path.join(outputDir, `${name}-fim.png`), fullPage: false });
  assert.equal(await page.locator("#grcon-mascot-run-lane").count(), 1);
  assert.equal((await page.evaluate(() => window.GrconMascot.calls)).some(([kind]) => kind === "stop"), true);
  assert.deepEqual(pageErrors, []);
  await stop(page);
  await context.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    await validateViewport(browser, "desktop-1440", { width: 1440, height: 900 });
    await validateViewport(browser, "notebook-1024", { width: 1024, height: 768 });
    await validateViewport(browser, "mobile-390", { width: 390, height: 844 });

    // Operação curta: o limiar evita flash da faixa.
    const quickContext = await browser.newContext({ viewport: { width: 1200, height: 800 }, serviceWorkers: "block" });
    const quick = await quickContext.newPage();
    await quick.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
    await ready(quick);
    await start(quick);
    await quick.waitForTimeout(80);
    await stop(quick);
    await quick.waitForTimeout(260);
    let d = await quick.evaluate(() => window.GrconMascotRunner.diagnostics());
    assert.equal(d.active, false);
    assert.equal(d.lastResult.reason, "short-operation-skipped");
    await quickContext.close();

    // Evento irrelevante não dispara corrida.
    const irrelevantContext = await browser.newContext({ serviceWorkers: "block" });
    const irrelevant = await irrelevantContext.newPage();
    await irrelevant.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
    await ready(irrelevant);
    await irrelevant.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:mascot-operation", {
      detail: { active: true, state: "success", task: "Tudo certo" },
    })));
    await irrelevant.waitForTimeout(350);
    assert.equal((await irrelevant.evaluate(() => window.GrconMascotRunner.diagnostics())).active, false);
    await irrelevantContext.close();

    // WebM bloqueado: MP4/canvas é o segundo formato.
    const mp4Context = await browser.newContext({ serviceWorkers: "block" });
    const mp4 = await mp4Context.newPage();
    await mp4.route(/grcon-mascot-running-alpha\.webm(?:\?.*)?$/, (route) => route.abort("failed"));
    await mp4.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
    await ready(mp4);
    await start(mp4);
    await mp4.waitForFunction(() => document.getElementById("grcon-mascot-run-lane")?.dataset.media === "mp4-canvas", null, { timeout: 10000 });
    assert.equal((await geometry(mp4)).overflow <= 1, true);
    await mp4Context.close();

    // Ambos os vídeos bloqueados: poster continua e a travessia visual não bloqueia processamento.
    const posterContext = await browser.newContext({ serviceWorkers: "block" });
    const poster = await posterContext.newPage();
    await poster.route(/grcon-mascot-running-alpha\.webm(?:\?.*)?$/, (route) => route.abort("failed"));
    await poster.route(/grcon-mascot-running-compat\.mp4(?:\?.*)?$/, (route) => route.abort("failed"));
    await poster.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
    await ready(poster);
    let businessSignal = 0;
    await poster.exposeFunction("markBusinessSignal", () => { businessSignal += 1; });
    await poster.evaluate(() => window.addEventListener("grcon:processing-state", () => window.markBusinessSignal(), { once: true }));
    await start(poster);
    await poster.waitForFunction(() => window.GrconMascotRunner.diagnostics().lastResult.reason === "running", null, { timeout: 5000 });
    await poster.waitForTimeout(600);
    assert.equal((await geometry(poster)).media, "poster");
    assert.equal(businessSignal, 1);
    await posterContext.close();

    // Reduced motion impede a travessia.
    const reducedContext = await browser.newContext({ reducedMotion: "reduce", serviceWorkers: "block" });
    const reduced = await reducedContext.newPage();
    await reduced.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
    await ready(reduced);
    await start(reduced);
    await reduced.waitForTimeout(350);
    d = await reduced.evaluate(() => window.GrconMascotRunner.diagnostics());
    assert.equal(d.active, false);
    assert.equal(d.lastResult.reason, "reduced-motion");
    await reducedContext.close();

    // Zoom e múltiplos eventos não duplicam a pista nem criam overflow.
    const zoomContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
    const zoom = await zoomContext.newPage();
    await zoom.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
    await ready(zoom);
    await zoom.evaluate(() => { document.body.style.zoom = "1.25"; });
    await start(zoom);
    await zoom.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:mascot-operation", {
      detail: { active: true, state: "checking-document", task: "Conferindo os documentos" },
    })));
    await zoom.waitForFunction(() => window.GrconMascotRunner.diagnostics().lastResult.reason === "running", null, { timeout: 5000 });
    assert.equal(await zoom.locator("#grcon-mascot-run-lane").count(), 1);
    assert.ok((await geometry(zoom)).overflow <= 1);
    await zoomContext.close();

    console.log("mascot-runner-browser: OK — desktop, notebook, mobile, zoom, fallbacks, reduced-motion, operação curta e layout validados.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
