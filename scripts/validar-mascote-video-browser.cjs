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

async function mascotVisualTransparency(page) {
  await page.waitForFunction(() => {
    const diagnostics = window.GrconMascot?.diagnostics?.();
    return Boolean(diagnostics && (diagnostics.media === "video" || diagnostics.mediaFallback || diagnostics.reducedMotion || !diagnostics.animationsEnabled));
  }, null, { timeout: 8000 });
  return page.evaluate(async () => {
    const host = document.querySelector("#grcon-context-mascot");
    const stage = host?.querySelector(".grcon-mascot-stage");
    const video = host?.querySelector("video");
    const sprite = host?.querySelector(".grcon-mascot-sprite");
    if (!host || !stage || !video || !sprite) throw new Error("estrutura do mascote ausente");

    const hostStyle = getComputedStyle(host);
    const stageStyle = getComputedStyle(stage);
    const before = getComputedStyle(host, "::before");
    const after = getComputedStyle(host, "::after");
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 48;
    const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
    if (!context) throw new Error("canvas 2D indisponível");
    context.clearRect(0, 0, canvas.width, canvas.height);

    const media = host.dataset.media || "png";
    if (media === "video" && video.readyState >= 2) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else {
      const background = getComputedStyle(sprite).backgroundImage;
      const match = background.match(/^url\(["']?(.*?)["']?\)$/);
      if (!match) throw new Error("sprite sem URL de fundo");
      const image = new Image();
      image.src = match[1];
      if (typeof image.decode === "function") await image.decode();
      else await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
      const x = Number.parseFloat(host.style.getPropertyValue("--mx") || getComputedStyle(host).getPropertyValue("--mx")) || 0;
      const y = Number.parseFloat(host.style.getPropertyValue("--my") || getComputedStyle(host).getPropertyValue("--my")) || 0;
      const frameWidth = image.naturalWidth / 4;
      const frameHeight = image.naturalHeight / 4;
      context.drawImage(image, x * frameWidth, y * frameHeight, frameWidth, frameHeight, 0, 0, canvas.width, canvas.height);
    }

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const edge = 9;
    let transparent = 0;
    let total = 0;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const corner = (x < edge || x >= canvas.width - edge) && (y < edge || y >= canvas.height - edge);
        if (!corner) continue;
        total += 1;
        if (pixels[((y * canvas.width + x) * 4) + 3] <= 24) transparent += 1;
      }
    }
    return {
      media,
      fallback: host.dataset.mediaFallback || "",
      transparentEdgeRatio: total ? transparent / total : 0,
      hostBackground: hostStyle.backgroundColor,
      hostBorder: [hostStyle.borderTopWidth, hostStyle.borderRightWidth, hostStyle.borderBottomWidth, hostStyle.borderLeftWidth],
      hostShadow: hostStyle.boxShadow,
      hostOverflow: hostStyle.overflow,
      hostContain: hostStyle.contain,
      stageBackground: stageStyle.backgroundColor,
      beforeContent: before.content,
      afterContent: after.content,
      rect: host.getBoundingClientRect().toJSON(),
    };
  });
}

async function waitMascotInsideViewport(page) {
  await page.waitForFunction(() => {
    const host = document.querySelector("#grcon-context-mascot");
    if (!host) return false;
    const rect = host.getBoundingClientRect();
    return rect.left >= -0.5
      && rect.top >= -0.5
      && rect.right <= innerWidth + 0.5
      && rect.bottom <= innerHeight + 0.5;
  }, null, { timeout: 3000 });
}

async function assertMascotTransparent(page, label) {
  const visual = await mascotVisualTransparency(page);
  assert.ok(visual.transparentEdgeRatio >= 0.72, label + ": mídia precisa ter transparência real nas bordas; razão=" + visual.transparentEdgeRatio);
  assert.equal(visual.hostBackground, "rgba(0, 0, 0, 0)", label + ": wrapper deve ser transparente");
  assert.deepEqual(visual.hostBorder, ["0px", "0px", "0px", "0px"], label + ": wrapper não pode ter borda");
  assert.equal(visual.hostShadow, "none", label + ": wrapper não pode ter sombra/card");
  assert.equal(visual.hostOverflow, "visible", label + ": wrapper não pode cortar o mascote");
  assert.doesNotMatch(visual.hostContain, /paint/, label + ": paint containment não pode recortar a animação");
  if (visual.media === "png") assert.ok(Math.abs((visual.rect.width / visual.rect.height) - 1) < 0.12, label + ": fallback PNG deve preservar proporção quadrada");
  assert.equal(visual.stageBackground, "rgba(0, 0, 0, 0)", label + ": stage deve ser transparente");
  assert.ok(visual.beforeContent === "none" || visual.beforeContent === "normal", label + ": ::before não pode criar caixa");
  assert.ok(visual.afterContent === "none" || visual.afterContent === "normal", label + ": ::after não pode criar caixa");
  return visual;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
    const errors = [];
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

    await page.goto(fixtureUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitRuntime(page);

    let state = await diagnostics(page);
    assert.equal(state.engine, "official-sprite-contextual-v5");
    assert.equal(state.assetRevision, "20260925.1");
    assert.equal(state.instances, 1);
    assert.equal(await page.locator("#grcon-context-mascot video").count(), 1);
    assert.deepEqual(Object.keys(state.assets).sort(), ["analyzing", "hello", "running", "success", "warning"]);
    assert.equal(await page.locator("#grcon-context-mascot").evaluate((el) => getComputedStyle(el).pointerEvents), "none");
    await page.evaluate(() => window.GrconMascot.idle({ source: "qa-idle-transparent" }));
    await assertMascotTransparent(page, "idle");
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
    assert.match(state.assets.analyzing, /grcon-mascot-analyzing-alpha\.webm\?v=20260925\.1$/);
    await assertMascotTransparent(page, "analyzing/checking-document/loading/searching-files");
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
    await assertMascotTransparent(page, "warning/confused/error");
    await page.screenshot({ path: path.join(outputDir, "03-warning-target.png") });

    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "analyzing", null, { timeout: 5000 });
    await page.evaluate(() => {
      document.querySelector("#fixture-revision")?.remove();
      window.dispatchEvent(new CustomEvent("grcon:notification", { detail: { kind: "success", message: "Conferência concluída" } }));
      window.dispatchEvent(new CustomEvent("grcon:processing-state", { detail: { active: false, context: "control" } }));
    });
    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "success", null, { timeout: 5000 });
    await assertMascotTransparent(page, "success");
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
    await assertMascotTransparent(page, "running/sigem-pw-analysis");
    await page.waitForFunction(() => {
      const host = document.querySelector("#grcon-context-mascot");
      if (!host) return false;
      const rect = host.getBoundingClientRect();
      return rect.left >= 12 && rect.right <= innerWidth - 12 && rect.top >= -0.5 && rect.bottom <= innerHeight + 0.5;
    }, null, { timeout: 3000 });
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
    await assertMascotTransparent(page, "mobile-390x844");
    await page.screenshot({ path: path.join(outputDir, "06-mobile-warning.png") });
    await page.waitForTimeout(1700);
    await page.evaluate(() => document.querySelector("#fixture-mobile-target")?.remove());

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.evaluate(() => window.GrconMascot.idle({ source: "qa-desktop-1920" }));
    await waitMascotInsideViewport(page);
    const desktop1920 = await assertMascotTransparent(page, "desktop-1920x1080");
    assert.ok(desktop1920.rect.left >= 0 && desktop1920.rect.top >= 0 && desktop1920.rect.right <= 1920 && desktop1920.rect.bottom <= 1080);
    await page.screenshot({ path: path.join(outputDir, "09-desktop-1920.png") });

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.evaluate(() => window.GrconMascot.idle({ source: "qa-desktop-1366" }));
    await waitMascotInsideViewport(page);
    const desktop1366 = await assertMascotTransparent(page, "desktop-1366x768");
    assert.ok(desktop1366.rect.left >= 0 && desktop1366.rect.top >= 0 && desktop1366.rect.right <= 1366 && desktop1366.rect.bottom <= 768);
    await page.screenshot({ path: path.join(outputDir, "10-desktop-1366.png") });

    await page.evaluate(() => {
      document.documentElement.style.background = "#162630";
      document.body.style.background = "#162630";
      document.documentElement.style.backgroundImage = "none";
      document.body.style.backgroundImage = "none";
      window.GrconMascot.idle({ source: "qa-dark-surface" });
    });
    await assertMascotTransparent(page, "dark-surface");
    await page.screenshot({ path: path.join(outputDir, "11-dark-surface.png") });

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
    await assertMascotTransparent(fallbackPage, "network-fallback");
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
    await assertMascotTransparent(helloPage, "hello");
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
