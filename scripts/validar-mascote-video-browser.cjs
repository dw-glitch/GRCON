const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";
const outputDir = process.env.GRCON_MASCOT_OUTPUT || path.join(process.cwd(), "artifacts/mascot-video");
const fixtureUrl = `${baseUrl}/tests/fixtures/grcon-mascot-video.html`;

async function waitForMascot(page) {
  await page.waitForSelector(".grcon-brand-mascot", { state: "visible", timeout: 15000 });
  await page.waitForFunction(() => window.GrconMascot?.diagnostics().ready, null, { timeout: 15000 });
}

async function visibleFallback(page) {
  return page.evaluate(() => {
    const host = document.querySelector(".grcon-brand-mascot");
    const sprite = host.querySelector(".grcon-mascot-sprite");
    const style = getComputedStyle(sprite);
    const bounds = sprite.getBoundingClientRect();
    return {
      visible: style.visibility !== "hidden" && Number(style.opacity) > 0 && bounds.width > 0 && bounds.height > 0,
      source: style.backgroundImage,
      media: host.dataset.grconMascotMedia,
    };
  });
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      serviceWorkers: "block",
    });
    const errors = [];
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(fixtureUrl, { waitUntil: "networkidle", timeout: 30000 });
    await waitForMascot(page);

    let diagnostics = await page.evaluate(() => window.GrconMascot.diagnostics());
    assert.equal(diagnostics.engine, "official-video-v1");
    assert.equal(diagnostics.videoSupported, true);
    assert.equal(diagnostics.fallback, false);
    assert.equal(diagnostics.instances, 1);
    assert.equal(diagnostics.activeVideos, 0);
    assert.deepEqual(diagnostics.states, ["idle"]);
    assert.equal(await page.locator(".grcon-brand-mascot > video").count(), 1);
    assert.equal((await visibleFallback(page)).visible, true, "PNG precisa aparecer antes de qualquer reprodução");
    await page.screenshot({ path: path.join(outputDir, "idle-png.png") });

    await page.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:processing-state", {
      detail: { active: true, context: "control", task: "Analisar e conferir na LD" },
    })));
    await page.waitForFunction(() => {
      const diagnostics = window.GrconMascot.diagnostics();
      return diagnostics.states.includes("searching-files") && diagnostics.activeVideos === 1;
    }, null, { timeout: 15000 });
    const processing = await page.evaluate(() => {
      const host = document.querySelector(".grcon-brand-mascot");
      const video = host.querySelector("video");
      return {
        src: video.currentSrc,
        loop: video.loop,
        muted: video.muted,
        paused: video.paused,
        readyState: video.readyState,
        media: host.dataset.grconMascotMedia,
        spriteOpacity: Number(getComputedStyle(host.querySelector(".grcon-mascot-sprite")).opacity),
      };
    });
    assert.match(processing.src, /grcon-mascot-processing-alpha\.webm/);
    assert.equal(processing.loop, true);
    assert.equal(processing.muted, true);
    assert.equal(processing.paused, false);
    assert.ok(processing.readyState >= 2);
    assert.equal(processing.media, "processing");
    assert.equal(processing.spriteOpacity, 0);
    await page.waitForTimeout(2850);
    await page.screenshot({ path: path.join(outputDir, "processing-head-scratch.png") });

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("grcon:notification", { detail: { kind: "success", message: "Conferência concluída" } }));
      window.dispatchEvent(new CustomEvent("grcon:processing-state", { detail: { active: false, context: "control" } }));
    });
    await page.waitForFunction(() => {
      const diagnostics = window.GrconMascot.diagnostics();
      return diagnostics.states.includes("success") && diagnostics.activeVideos === 0;
    });
    assert.equal((await visibleFallback(page)).visible, true, "PNG deve voltar após a operação");

    await page.hover(".grcon-brand-mascot");
    await page.waitForFunction(() => {
      const diagnostics = window.GrconMascot.diagnostics();
      return diagnostics.states.includes("hover") && diagnostics.activeVideos === 1;
    }, null, { timeout: 15000 });
    const wave = await page.evaluate(() => {
      const video = document.querySelector(".grcon-brand-mascot > video");
      return { src: video.currentSrc, loop: video.loop, muted: video.muted, paused: video.paused };
    });
    assert.match(wave.src, /grcon-mascot-wave-alpha\.webm/);
    assert.equal(wave.loop, false);
    assert.equal(wave.muted, true);
    assert.equal(wave.paused, false);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: path.join(outputDir, "wave.png") });

    await page.evaluate(() => {
      for (let index = 0; index < 80; index += 1) {
        window.GrconMascot.play(index % 2 ? "checking-document" : "searching-files");
      }
      window.GrconMascot.play("searching-files");
    });
    diagnostics = await page.evaluate(() => window.GrconMascot.diagnostics());
    assert.equal(diagnostics.instances, 1, "troca rápida não pode duplicar a instância");
    assert.equal(await page.locator(".grcon-brand-mascot > video").count(), 1, "troca rápida não pode duplicar o vídeo");
    assert.deepEqual(errors, [], `console precisa permanecer sem erros: ${errors.join(" | ")}`);

    const fallback = await context.newPage();
    const fallbackErrors = [];
    await fallback.route("**/assets/mascot/video/grcon-mascot-processing-alpha.webm", (route) => route.abort("failed"));
    fallback.on("pageerror", (error) => fallbackErrors.push(error.message));
    fallback.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (!/Failed to load resource: net::ERR_FAILED/.test(text)) fallbackErrors.push(text);
    });
    await fallback.goto(`${fixtureUrl}?fallback=1`, { waitUntil: "networkidle", timeout: 30000 });
    await waitForMascot(fallback);
    await fallback.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:processing-state", {
      detail: { active: true, task: "Analisar documentos" },
    })));
    await fallback.waitForFunction(() => window.GrconMascot.diagnostics().fallback, null, { timeout: 15000 });
    const fallbackResult = await visibleFallback(fallback);
    assert.equal(fallbackResult.visible, true, "falha do WebM nunca pode ocultar o PNG oficial");
    assert.match(fallbackResult.source, /grcon-mascot-sprite\.png/);
    assert.deepEqual(fallbackErrors, []);
    await fallback.screenshot({ path: path.join(outputDir, "fallback-png.png") });

    const reduced = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    const reducedPage = await reduced.newPage();
    await reducedPage.goto(`${fixtureUrl}?reduced=1`, { waitUntil: "networkidle", timeout: 30000 });
    await waitForMascot(reducedPage);
    await reducedPage.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:processing-state", {
      detail: { active: true, task: "Conferindo documentos" },
    })));
    const reducedResult = await reducedPage.evaluate(() => ({
      diagnostics: window.GrconMascot.diagnostics(),
      videoDisplay: getComputedStyle(document.querySelector(".grcon-brand-mascot > video")).display,
      spriteOpacity: Number(getComputedStyle(document.querySelector(".grcon-brand-mascot .grcon-mascot-sprite")).opacity),
    }));
    assert.equal(reducedResult.diagnostics.reducedMotion, true);
    assert.equal(reducedResult.diagnostics.activeVideos, 0);
    assert.equal(reducedResult.videoDisplay, "none");
    assert.equal(reducedResult.spriteOpacity, 1);
    await reduced.close();

    console.log(JSON.stringify({ diagnostics, processing, wave, fallback: fallbackResult, reduced: reducedResult }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
