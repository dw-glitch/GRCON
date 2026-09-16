const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";
const outputDir = process.env.GRCON_MASCOT_OUTPUT || path.join(process.cwd(), "artifacts/mascot-gsap");
const fixtureUrl = `${baseUrl}/tests/fixtures/grcon-mascot-gsap.html`;

async function waitForMascot(page) {
  await page.waitForSelector(".grcon-brand-mascot", { state: "visible", timeout: 15000 });
  await page.waitForFunction(() => window.GrconMascot?.diagnostics().ready, null, { timeout: 15000 });
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, serviceWorkers: "block" });
    const errors = [];
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(fixtureUrl, { waitUntil: "networkidle", timeout: 30000 });
    await waitForMascot(page);

    let diagnostics = await page.evaluate(() => window.GrconMascot.diagnostics());
    assert.equal(diagnostics.engine, "official-png-gsap-v2");
    assert.equal(diagnostics.gsap, true);
    assert.equal(diagnostics.fallback, false);
    assert.equal(diagnostics.instances, 1);
    assert.equal(diagnostics.timelines, 1);
    assert.deepEqual(diagnostics.states, ["idle"]);
    assert.equal(await page.locator("canvas").count(), 0, "a solução não deve criar canvas/WebAssembly");
    await page.screenshot({ path: path.join(outputDir, "idle.png") });

    await page.hover(".grcon-brand-mascot");
    await page.waitForFunction(() => window.GrconMascot.diagnostics().states.includes("hover"));
    await page.waitForTimeout(420);
    await page.screenshot({ path: path.join(outputDir, "hover.png") });

    await page.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:processing-state", {
      detail: { active: true, context: "control", task: "Analisar e conferir na LD" },
    })));
    await page.waitForFunction(() => window.GrconMascot.diagnostics().states.includes("searching-files"));
    await page.waitForTimeout(1150);
    const searching = await page.evaluate(() => {
      const host = document.querySelector(".grcon-brand-mascot");
      const folder = host.querySelector(".grcon-mascot-folder");
      const paper = host.querySelector(".grcon-mascot-paper-a");
      return {
        diagnostics: window.GrconMascot.diagnostics(),
        folderOpacity: Number(getComputedStyle(folder).opacity),
        paperOpacity: Number(getComputedStyle(paper).opacity),
        layers: host.querySelectorAll(".grcon-mascot-layer").length,
      };
    });
    assert.equal(searching.diagnostics.instances, 1);
    assert.equal(searching.diagnostics.timelines, 1);
    assert.equal(searching.layers, 3, "deve usar somente corpo, cabeça e braço oficiais");
    assert.ok(searching.folderOpacity > 0, "a pasta deve aparecer durante a busca");
    assert.ok(searching.paperOpacity > 0, "os documentos devem aparecer durante a busca");
    assert.equal(await page.locator(".grcon-mascot-speech").getAttribute("data-visible"), "false", "o balão não pode cobrir a busca");
    await page.screenshot({ path: path.join(outputDir, "searching-files.png") });
    await page.waitForTimeout(2400);
    const scratchAngle = await page.evaluate(() => {
      const transform = getComputedStyle(document.querySelector(".grcon-mascot-arm")).transform;
      const matrix = new DOMMatrixReadOnly(transform);
      return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
    });
    assert.ok(scratchAngle > 90, `o braço precisa alcançar a cabeça durante o gesto (ângulo: ${scratchAngle.toFixed(1)}°)`);
    await page.screenshot({ path: path.join(outputDir, "searching-files-scratch.png") });
    await page.evaluate(() => {
      const timeline = window.gsap.globalTimeline;
      timeline.time(timeline.time() + 300, false);
    });
    diagnostics = await page.evaluate(() => window.GrconMascot.diagnostics());
    assert.equal(diagnostics.instances, 1, "cinco minutos virtuais de loop não podem duplicar a instância");
    assert.equal(diagnostics.timelines, 1, "cinco minutos virtuais de loop não podem acumular timelines");

    await page.evaluate(() => {
      for (let index = 0; index < 80; index += 1) {
        window.GrconMascot.play(index % 2 ? "checking-document" : "searching-files");
      }
      window.GrconMascot.play("searching-files");
    });
    diagnostics = await page.evaluate(() => window.GrconMascot.diagnostics());
    assert.equal(diagnostics.instances, 1, "navegação rápida não pode duplicar o mascote");
    assert.equal(diagnostics.timelines, 1, "troca rápida não pode acumular timelines");

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("grcon:notification", { detail: { kind: "success", message: "Conferência concluída" } }));
      window.dispatchEvent(new CustomEvent("grcon:processing-state", { detail: { active: false, context: "control" } }));
    });
    await page.waitForFunction(() => window.GrconMascot.diagnostics().states.includes("success"));
    await page.screenshot({ path: path.join(outputDir, "success.png") });
    await page.waitForFunction(() => window.GrconMascot.diagnostics().states.includes("idle"), null, { timeout: 5000 });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:notification", {
      detail: { kind: "error", message: "Falha real de teste" },
    })));
    await page.waitForFunction(() => window.GrconMascot.diagnostics().states.includes("error"));
    await page.waitForFunction(() => window.GrconMascot.diagnostics().states.includes("idle"), null, { timeout: 5000 });
    assert.deepEqual(errors, [], `console precisa permanecer sem erros: ${errors.join(" | ")}`);

    const fallback = await context.newPage();
    const fallbackErrors = [];
    await fallback.route("**/assets/mascot/layers/grcon-mascot-head.png", (route) => route.abort("failed"));
    fallback.on("pageerror", (error) => fallbackErrors.push(error.message));
    await fallback.goto(`${fixtureUrl}?fallback=1`, { waitUntil: "networkidle", timeout: 30000 });
    await fallback.waitForSelector(".grcon-brand-mascot", { state: "visible", timeout: 15000 });
    await fallback.waitForFunction(() => window.GrconMascot?.diagnostics().fallback, null, { timeout: 15000 });
    const fallbackResult = await fallback.evaluate(() => {
      const host = document.querySelector(".grcon-brand-mascot");
      const sprite = host.querySelector(".grcon-mascot-sprite");
      const style = getComputedStyle(sprite);
      const bounds = sprite.getBoundingClientRect();
      return {
        diagnostics: window.GrconMascot.diagnostics(),
        visible: style.visibility !== "hidden" && Number(style.opacity) > 0 && bounds.width > 0 && bounds.height > 0,
        official: style.backgroundImage.includes("grcon-mascot-sprite.png") || style.backgroundImage.startsWith("url(\"data:image/png"),
      };
    });
    assert.equal(fallbackResult.visible, true, "fallback PNG nunca pode desaparecer");
    assert.equal(fallbackResult.official, true, "fallback precisa ser o PNG oficial");
    assert.equal(fallbackResult.diagnostics.timelines, 0);
    assert.deepEqual(fallbackErrors, []);
    await fallback.screenshot({ path: path.join(outputDir, "fallback.png") });

    const runtimeFallback = await context.newPage();
    await runtimeFallback.route("**/vendor/gsap/gsap.min.js", (route) => route.abort("failed"));
    await runtimeFallback.goto(`${fixtureUrl}?runtime-fallback=1`, { waitUntil: "networkidle", timeout: 30000 });
    await runtimeFallback.waitForSelector(".grcon-brand-mascot", { state: "visible", timeout: 15000 });
    const runtimeFallbackResult = await runtimeFallback.evaluate(() => {
      const sprite = document.querySelector(".grcon-brand-mascot .grcon-mascot-sprite");
      const style = getComputedStyle(sprite);
      const bounds = sprite.getBoundingClientRect();
      return {
        diagnostics: window.GrconMascot?.diagnostics?.(),
        visible: style.visibility !== "hidden" && Number(style.opacity) > 0 && bounds.width > 0 && bounds.height > 0,
      };
    });
    assert.equal(runtimeFallbackResult.diagnostics.fallback, true);
    assert.equal(runtimeFallbackResult.diagnostics.engine, "official-png-static-fallback");
    assert.equal(runtimeFallbackResult.visible, true, "o PNG deve aparecer mesmo sem o runtime GSAP");

    console.log(JSON.stringify({ diagnostics, searching, fallback: fallbackResult, runtimeFallback: runtimeFallbackResult }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
