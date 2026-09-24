const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";
const fixtureUrl = baseUrl + "/tests/fixtures/grcon-mascot-video.html";
const outputDir = process.env.GRCON_MASCOT_OUTPUT || path.join(process.cwd(), "artifacts/mascot-video");
fs.mkdirSync(outputDir, { recursive: true });

function intersects(a, b) {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

async function waitRuntime(page) {
  await page.waitForFunction(() => Boolean(window.GrconMascot?.diagnostics?.().ready), null, { timeout: 15000 });
  await page.waitForSelector("#grcon-context-mascot", { state: "attached", timeout: 15000 });
}

async function unlock(page) {
  await page.evaluate(() => {
    document.documentElement.classList.remove("grcon-cloud-pending");
    window.dispatchEvent(new CustomEvent("grcon:cloud-ready"));
  });
}

async function diagnostics(page) {
  return page.evaluate(() => window.GrconMascot.diagnostics());
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
    const errors = [];
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

    await page.goto(fixtureUrl, { waitUntil: "networkidle", timeout: 30000 });
    await waitRuntime(page);

    let state = await diagnostics(page);
    assert.equal(state.engine, "official-contextual-v5");
    assert.equal(state.assetRevision, "20260924.1");
    assert.equal(state.instances, 1);
    assert.equal(await page.locator("#grcon-context-mascot video").count(), 1);
    assert.deepEqual(Object.keys(state.assets).sort(), ["analyzing", "hello", "idle", "running", "success", "warning"]);
    assert.equal(await page.locator("#grcon-context-mascot").evaluate((el) => getComputedStyle(el).pointerEvents), "none");
    await page.screenshot({ path: path.join(outputDir, "01-idle.png") });

    await page.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:processing-pulse", {
      detail: { context: "control", duration: 800 },
    })));
    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "analyzing", null, { timeout: 3000 });
    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "idle", null, { timeout: 4000 });

    await page.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:processing-state", {
      detail: { active: true, context: "control", state: "checking-document", task: "Analisar e conferir na LD" },
    })));
    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "analyzing");
    state = await diagnostics(page);
    assert.equal(state.activeOperations, 1);
    assert.match(state.assets.analyzing, /grcon-mascot-analyzing-alpha\.webm\?v=20260924\.1$/);
    await page.screenshot({ path: path.join(outputDir, "02-analyzing.png") });

    await page.evaluate(() => {
      const target = document.createElement("input");
      target.id = "fixture-revision";
      target.value = "A";
      Object.assign(target.style, { position: "fixed", left: "520px", top: "320px", width: "180px", height: "42px" });
      document.body.appendChild(target);
      window.GrconMascot.warning({ target: "#fixture-revision", message: "Confira a revisão deste documento.", duration: 1600 });
    });
    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "warning");
    const warningGeometry = await page.evaluate(() => {
      const mascot = document.querySelector("#grcon-context-mascot").getBoundingClientRect();
      const target = document.querySelector("#fixture-revision").getBoundingClientRect();
      const bubble = document.querySelector("#grcon-mascot-context-bubble");
      return {
        mascot: { left: mascot.left, right: mascot.right, top: mascot.top, bottom: mascot.bottom },
        target: { left: target.left, right: target.right, top: target.top, bottom: target.bottom },
        bubble: bubble.textContent,
        bubbleVisible: bubble.dataset.visible,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    assert.equal(intersects(warningGeometry.mascot, warningGeometry.target), false);
    assert.equal(warningGeometry.bubble, "Confira a revisão deste documento.");
    assert.equal(warningGeometry.bubbleVisible, "true");
    assert.ok(warningGeometry.overflow <= 1);
    await page.screenshot({ path: path.join(outputDir, "03-warning-target.png") });

    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "analyzing", null, { timeout: 5000 });
    await page.evaluate(() => {
      document.querySelector("#fixture-revision")?.remove();
      window.dispatchEvent(new CustomEvent("grcon:notification", { detail: { kind: "success", message: "Conferência concluída" } }));
      window.dispatchEvent(new CustomEvent("grcon:processing-state", { detail: { active: false, context: "control" } }));
    });
    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "success", null, { timeout: 5000 });
    await page.screenshot({ path: path.join(outputDir, "04-success.png") });
    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "idle", null, { timeout: 7000 });

    await page.evaluate(() => {
      window.GrconMascot.warning({ message: "Aviso concorrente", duration: 1500 });
      window.dispatchEvent(new CustomEvent("grcon:processing-state", {
        detail: { active: true, context: "control", state: "checking-document", task: "Operação durante warning" },
      }));
      window.dispatchEvent(new CustomEvent("grcon:processing-state", {
        detail: { active: false, success: true, context: "control" },
      }));
    });
    await page.waitForTimeout(180);
    assert.equal((await diagnostics(page)).state, "warning", "operação não pode interromper warning ativo");
    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "success", null, { timeout: 5000 });
    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "idle", null, { timeout: 7000 });

    await page.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:mascot-operation", {
      detail: { active: true, state: "sigem-pw-analysis", task: "Comparando SIGEM e ProjectWise" },
    })));
    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "running", null, { timeout: 5000 });
    state = await diagnostics(page);
    assert.match(state.assets.running, /grcon-mascot-run-alpha\.webm/);
    await page.screenshot({ path: path.join(outputDir, "05-running.png") });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:mascot-operation", { detail: { active: false } })));
    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "idle", null, { timeout: 5000 });

    const disabled = await page.evaluate(() => {
      window.GrconMascot.setEnabled(false);
      window.GrconMascot.show("analyzing");
      const el = document.querySelector("#grcon-context-mascot");
      const video = el.querySelector("video");
      return {
        diagnostics: window.GrconMascot.diagnostics(),
        media: el.dataset.media,
        videoSrc: video.getAttribute("src"),
        fallbackOpacity: getComputedStyle(el.querySelector(".grcon-mascot-sprite")).opacity,
      };
    });
    assert.equal(disabled.diagnostics.animationsEnabled, false);
    assert.equal(disabled.media, "png");
    assert.equal(disabled.videoSrc, null);
    assert.equal(Number(disabled.fallbackOpacity), 1);
    await page.evaluate(() => { window.GrconMascot.setEnabled(true); window.GrconMascot.idle(); });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      const target = document.createElement("input");
      target.id = "fixture-mobile-target";
      Object.assign(target.style, { position: "fixed", left: "12px", top: "420px", width: "350px", height: "44px" });
      document.body.appendChild(target);
      window.GrconMascot.warning({ target, message: "Campo precisa de atenção.", duration: 1500 });
    });
    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "warning");
    const mobile = await page.evaluate(() => {
      const rect = document.querySelector("#grcon-context-mascot").getBoundingClientRect();
      return {
        left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
        width: innerWidth, height: innerHeight,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    console.log("mobile-geometry", JSON.stringify(mobile));
    assert.ok(mobile.left >= -0.5 && mobile.top >= -0.5 && mobile.right <= mobile.width + 0.5 && mobile.bottom <= mobile.height + 0.5);
    assert.ok(mobile.overflow <= 1);
    await page.screenshot({ path: path.join(outputDir, "06-mobile-warning.png") });
    await page.waitForTimeout(1700);
    await page.evaluate(() => document.querySelector("#fixture-mobile-target")?.remove());

    await page.evaluate(() => {
      const menu = document.createElement("div");
      menu.id = "fixture-critical-menu";
      menu.setAttribute("role", "menu");
      Object.assign(menu.style, { position: "fixed", right: "12px", bottom: "56px", width: "300px", height: "160px" });
      document.body.appendChild(menu);
      window.GrconMascot.idle({ source: "qa-visible-menu" });
    });
    await page.waitForTimeout(100);
    const menuAvoidance = await page.evaluate(() => {
      const mascot = document.querySelector("#grcon-context-mascot").getBoundingClientRect();
      const menu = document.querySelector("#fixture-critical-menu").getBoundingClientRect();
      return {
        mascot: { left: mascot.left, right: mascot.right, top: mascot.top, bottom: mascot.bottom },
        menu: { left: menu.left, right: menu.right, top: menu.top, bottom: menu.bottom },
      };
    });
    assert.equal(intersects(menuAvoidance.mascot, menuAvoidance.menu), false, "mascote não pode cobrir menu visível");
    await page.evaluate(() => document.querySelector("#fixture-critical-menu")?.remove());

    assert.deepEqual(errors, [], "console deve permanecer limpo: " + errors.join(" | "));
    await context.close();

    const reducedContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
    const reducedPage = await reducedContext.newPage();
    await reducedPage.goto(fixtureUrl + "?reduced=1", { waitUntil: "networkidle", timeout: 30000 });
    await waitRuntime(reducedPage);
    await reducedPage.evaluate(() => window.GrconMascot.show("running"));
    const reduced = await reducedPage.evaluate(() => ({
      diagnostics: window.GrconMascot.diagnostics(),
      videoDisplay: getComputedStyle(document.querySelector("#grcon-context-mascot video")).display,
      state: document.querySelector("#grcon-context-mascot").dataset.state,
    }));
    assert.equal(reduced.diagnostics.reducedMotion, true);
    assert.equal(reduced.videoDisplay, "none");
    assert.notEqual(reduced.state, "running");
    await reducedContext.close();

    const fallbackContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
    const fallbackPage = await fallbackContext.newPage();
    const fallbackErrors = [];
    await fallbackPage.route(/grcon-mascot-analyzing-alpha\.webm(?:\?.*)?$/, (route) => route.abort("failed"));
    fallbackPage.on("pageerror", (error) => fallbackErrors.push(error.message));
    fallbackPage.on("console", (message) => {
      if (message.type() !== "error") return;
      if (!/Failed to load resource|ERR_FAILED/.test(message.text())) fallbackErrors.push(message.text());
    });
    await fallbackPage.goto(fixtureUrl + "?fallback=1", { waitUntil: "networkidle", timeout: 30000 });
    await waitRuntime(fallbackPage);
    await fallbackPage.evaluate(() => window.GrconMascot.show("analyzing"));
    await fallbackPage.waitForFunction(() => window.GrconMascot.diagnostics().mediaFailureCount > 0, null, { timeout: 10000 });
    const fallback = await fallbackPage.evaluate(() => ({
      media: document.querySelector("#grcon-context-mascot").dataset.media,
      opacity: Number(getComputedStyle(document.querySelector("#grcon-context-mascot .grcon-mascot-sprite")).opacity),
    }));
    assert.equal(fallback.media, "png");
    assert.equal(fallback.opacity, 1);
    assert.deepEqual(fallbackErrors, []);
    await fallbackPage.screenshot({ path: path.join(outputDir, "07-fallback.png") });
    await fallbackContext.close();

    const helloContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
    const helloPage = await helloContext.newPage();
    await helloPage.addInitScript(() => {
      window.GrconCloud = {
        state: { session: { user: { id: "mascot-test-user" } } },
        getCurrentUserIdentity() { return { userId: "mascot-test-user", displayName: "Vinicio Teste" }; },
      };
    });
    await helloPage.goto(fixtureUrl + "?hello=1", { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitRuntime(helloPage);
    assert.equal((await diagnostics(helloPage)).greetingPlayedThisSession, false);
    await unlock(helloPage);
    await helloPage.waitForFunction(() => window.GrconMascot.diagnostics().state === "hello", null, { timeout: 5000 });
    assert.equal(await helloPage.locator("#grcon-mascot-context-bubble").textContent(), "Olá, Vinicio!");
    await helloPage.screenshot({ path: path.join(outputDir, "08-hello.png") });

    await helloPage.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await waitRuntime(helloPage);
    await unlock(helloPage);
    await helloPage.waitForTimeout(450);
    const afterReload = await diagnostics(helloPage);
    assert.equal(afterReload.greetingPlayedThisSession, true);
    assert.notEqual(afterReload.state, "hello", "hello não pode repetir na mesma sessão");

    await helloPage.evaluate(() => document.documentElement.classList.add("grcon-cloud-pending"));
    await helloPage.waitForFunction(() => window.GrconMascot.diagnostics().greetingPlayedThisSession === false, null, { timeout: 3000 });
    await helloPage.evaluate(() => {
      document.documentElement.classList.remove("grcon-cloud-pending");
      window.dispatchEvent(new CustomEvent("grcon:cloud-ready"));
    });
    await helloPage.waitForFunction(() => window.GrconMascot.diagnostics().state === "hello", null, { timeout: 5000 });
    assert.equal(await helloPage.locator("#grcon-mascot-context-bubble").textContent(), "Olá, Vinicio!");
    const afterRelogin = await diagnostics(helloPage);
    assert.equal(afterRelogin.greetingPlayedThisSession, true);
    await helloContext.close();

    console.log(JSON.stringify({ warningGeometry, disabled, mobile, reduced, fallback, afterReload, afterRelogin }, null, 2));
    console.log("mascot-runtime-browser: PASS");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
