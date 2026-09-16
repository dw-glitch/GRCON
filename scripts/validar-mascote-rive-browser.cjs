const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";
const outputDir = process.env.GRCON_RIVE_OUTPUT || path.join(process.cwd(), "assets/mascot/rive/build/browser");
const fixtureUrl = `${baseUrl}/tests/fixtures/grcon-mascot-rive.html`;

async function waitForMascot(page) {
  await page.waitForSelector(".grcon-brand-mascot", { state: "visible", timeout: 15000 });
  await page.waitForFunction(() => window.GrconMascot?.diagnostics, null, { timeout: 15000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      serviceWorkers: "block",
    });
    const riveMessages = [];
    const pageErrors = [];
    const page = await context.newPage();
    page.on("console", (message) => {
      if (/rive|wasm|canvaskit/i.test(message.text())) riveMessages.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => {
      if (/rive|wasm|canvaskit/i.test(error.message)) pageErrors.push(error.message);
    });

    await page.goto(fixtureUrl, { waitUntil: "networkidle", timeout: 30000 });
    await waitForMascot(page);
    await page.waitForFunction(() => window.GrconMascot.diagnostics().ready, null, { timeout: 12000 });

    let diagnostics = await page.evaluate(() => window.GrconMascot.diagnostics());
    assert.equal(diagnostics.instances, 1, "deve existir apenas uma instância Rive");
    assert.equal(diagnostics.ready, true, "o primeiro frame Rive deve estar visível");
    assert.equal(diagnostics.state, "idle", "o mascote deve iniciar em idle");
    await page.screenshot({ path: path.join(outputDir, "idle.png") });

    await page.hover(".grcon-brand-mascot");
    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "hover");
    diagnostics = await page.evaluate(() => window.GrconMascot.diagnostics());
    assert.equal(diagnostics.state, "hover");
    await page.screenshot({ path: path.join(outputDir, "hover.png") });

    await page.evaluate(() => window.GrconMascot.setState("processing"));
    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "processing");
    diagnostics = await page.evaluate(() => window.GrconMascot.diagnostics());
    assert.equal(diagnostics.instances, 1);
    assert.equal(diagnostics.state, "processing");
    await page.screenshot({ path: path.join(outputDir, "processing.png") });
    assert.deepEqual(pageErrors, [], `erros Rive no console: ${pageErrors.join(" | ")}`);

    const fallback = await context.newPage();
    const fallbackMessages = [];
    const fallbackErrors = [];
    await fallback.route("**/assets/mascot/rive/build/grcon-mascot.riv", (route) => route.abort("failed"));
    fallback.on("console", (message) => {
      if (/rive|wasm|canvaskit/i.test(message.text())) fallbackMessages.push(`${message.type()}: ${message.text()}`);
    });
    fallback.on("pageerror", (error) => {
      if (/rive|wasm|canvaskit/i.test(error.message)) fallbackErrors.push(error.message);
    });
    await fallback.goto(`${fixtureUrl}?rive-fallback-test=1`, { waitUntil: "networkidle", timeout: 30000 });
    await waitForMascot(fallback);
    await fallback.waitForFunction(() => window.GrconMascot.diagnostics().disabled, null, { timeout: 12000 });
    await fallback.waitForFunction(() => document.documentElement.dataset.grconMascotAsset === "sprite-hd-file-v1", null, { timeout: 12000 });
    const fallbackResult = await fallback.evaluate(() => {
    const mascot = document.querySelector(".grcon-brand-mascot");
    const sprite = mascot.querySelector(".grcon-mascot-sprite");
    const style = getComputedStyle(sprite);
    const bounds = sprite.getBoundingClientRect();
    return {
      diagnostics: window.GrconMascot.diagnostics(),
      canvasCount: mascot.querySelectorAll("canvas").length,
      spriteVisible: style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && bounds.width > 0 && bounds.height > 0,
      hasOfficialPng: style.backgroundImage.includes("grcon-mascot-sprite.png"),
    };
    });
    assert.equal(fallbackResult.diagnostics.engine, "official-png-fallback-v1");
    assert.equal(fallbackResult.canvasCount, 0, "a instância com falha deve ser limpa");
    assert.equal(fallbackResult.spriteVisible, true, "o PNG deve permanecer visível");
    assert.equal(fallbackResult.hasOfficialPng, true, "o fallback deve usar o PNG oficial");
    assert.equal(fallbackMessages.filter((message) => message.startsWith("warning:")).length, 1, "a falha deve gerar no máximo um aviso");
    assert.deepEqual(fallbackErrors, [], `loops/erros Rive no fallback: ${fallbackErrors.join(" | ")}`);
    await fallback.screenshot({ path: path.join(outputDir, "fallback.png") });

    console.log(JSON.stringify({ diagnostics, riveMessages, fallback: fallbackResult, fallbackMessages }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
