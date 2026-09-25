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
    return Boolean(diagnostics && (diagnostics.media === "video" || diagnostics.media === "png" || diagnostics.mediaFallback || diagnostics.reducedMotion || !diagnostics.animationsEnabled));
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
    const videoResponses = [];
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", (response) => {
      if (/assets\/mascot\/video\/grcon-mascot-.*\.webm(?:\?|$)/.test(response.url())) {
        videoResponses.push({ url: response.url(), status: response.status() });
      }
    });

    await page.goto(fixtureUrl, { waitUntil: "networkidle", timeout: 30000 });
    await waitRuntime(page);

    let state = await diagnostics(page);
    assert.equal(state.engine, "official-hybrid-media-v5");
    assert.equal(state.assetRevision, "20260925.2");
    assert.equal(state.instances, 1);
    assert.equal(await page.locator("#grcon-context-mascot video").count(), 1);
    assert.deepEqual(Object.keys(state.assets).sort(), ["analyzing", "hello", "idle", "running", "success", "warning"]);
    assert.equal(await page.locator("#grcon-context-mascot").evaluate((el) => getComputedStyle(el).pointerEvents), "none");
    const shellPlacement = await page.evaluate(() => {
      const host = document.querySelector("#grcon-context-mascot");
      const slot = document.querySelector("#grcon-mascot-header-slot");
      const topbar = document.querySelector(".topbar");
      const workspace = document.querySelector(".workspace");
      const hostRect = host.getBoundingClientRect();
      const workspaceRect = workspace.getBoundingClientRect();
      return {
        parentIsSlot: host.parentElement === slot,
        slotInTopbar: topbar.contains(slot),
        position: getComputedStyle(host).position,
        overlapsWorkspace: !(hostRect.right <= workspaceRect.left || hostRect.left >= workspaceRect.right || hostRect.bottom <= workspaceRect.top || hostRect.top >= workspaceRect.bottom),
      };
    });
    assert.equal(shellPlacement.parentIsSlot, true, "mascote contextual precisa estar no slot estrutural da topbar");
    assert.equal(shellPlacement.slotInTopbar, true, "slot do mascote precisa pertencer à topbar");
    assert.notEqual(shellPlacement.position, "fixed", "mascote contextual não pode ficar fixo sobre o workspace");
    assert.equal(shellPlacement.overlapsWorkspace, false, "mascote contextual não pode cobrir a área operacional");
    await page.evaluate(() => window.GrconMascot.idle({ source: "qa-idle-transparent" }));
    await assertMascotTransparent(page, "idle");
    const idleStatic = await page.evaluate(async () => {
      const host = document.querySelector("#grcon-context-mascot");
      const sprite = host.querySelector(".grcon-mascot-sprite");
      const video = host.querySelector("video");
      const beforeTransform = getComputedStyle(sprite).transform;
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: innerWidth - 12, clientY: innerHeight - 12 }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        media: host.dataset.media,
        videoSrc: video.getAttribute("src"),
        videoPaused: video.paused,
        animationName: getComputedStyle(sprite).animationName,
        beforeTransform,
        afterTransform: getComputedStyle(sprite).transform,
      };
    });
    assert.equal(idleStatic.media, "png", "idle deve exibir somente o sprite estático");
    assert.equal(idleStatic.videoSrc, null, "idle não pode manter vídeo anexado");
    assert.equal(idleStatic.videoPaused, true, "nenhum vídeo pode continuar tocando escondido no idle");
    assert.equal(idleStatic.animationName, "none", "sprite idle não pode usar keyframes");
    assert.equal(idleStatic.beforeTransform, idleStatic.afterTransform, "sprite idle não pode seguir o cursor");
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
    assert.match(state.assets.analyzing, /grcon-mascot-analyzing-alpha\.webm\?v=20260925\.2$/);
    await page.waitForFunction(() => {
      const video = document.querySelector("#grcon-context-mascot video");
      return Boolean(video && /grcon-mascot-analyzing-alpha\.webm/.test(video.currentSrc) && !video.paused && video.currentTime > 0);
    }, null, { timeout: 8000 });
    assert.ok(videoResponses.some((entry) => /grcon-mascot-analyzing-alpha\.webm/.test(entry.url) && entry.status === 200), "Network deve comprovar HTTP 200 do vídeo de análise");
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

    await page.evaluate(() => {
      window.__workspaceClicks = 0;
      document.querySelector("#fixture-workspace-action").addEventListener("click", () => { window.__workspaceClicks += 1; });
      window.dispatchEvent(new CustomEvent("grcon:mascot-operation", {
        detail: { active: true, state: "sigem-pw-analysis", task: "Comparando SIGEM e ProjectWise" },
      }));
    });
    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "running", null, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelector("#grcon-mascot-activity-strip")?.dataset.active === "true", null, { timeout: 5000 });
    await page.waitForFunction(() => {
      const video = document.querySelector("#grcon-mascot-activity-strip video");
      return Boolean(video && video.readyState >= 2 && !video.paused && video.currentTime > 0);
    }, null, { timeout: 8000 });
    await page.waitForFunction(() => {
      const track = document.querySelector("#grcon-mascot-activity-strip .grcon-mascot-runner-track");
      if (!track) return false;
      const rect = track.getBoundingClientRect();
      return rect.right > 12 && rect.left < innerWidth - 12;
    }, null, { timeout: 3000 });
    state = await diagnostics(page);
    assert.match(state.assets.running, /grcon-mascot-running-alpha\.webm/);

    const runningStart = await page.evaluate(() => {
      const strip = document.querySelector("#grcon-mascot-activity-strip");
      const workspace = document.querySelector(".workspace");
      const shell = document.querySelector(".app-shell");
      const track = strip.querySelector(".grcon-mascot-runner-track");
      const video = strip.querySelector("video");
      const host = document.querySelector("#grcon-context-mascot");
      const sr = strip.getBoundingClientRect();
      const wr = workspace.getBoundingClientRect();
      const shellRect = shell.getBoundingClientRect();
      return {
        source: video.currentSrc,
        currentTime: video.currentTime,
        paused: video.paused,
        stripActive: strip.dataset.active,
        stripHidden: strip.hidden,
        animationName: getComputedStyle(track).animationName,
        stripPosition: getComputedStyle(strip).position,
        stripPointerEvents: getComputedStyle(strip).pointerEvents,
        outsideWorkspace: sr.bottom <= wr.top + 1 && sr.bottom <= shellRect.top + 1,
        overlapsWorkspace: !(sr.right <= wr.left || sr.left >= wr.right || sr.bottom <= wr.top || sr.top >= wr.bottom),
        hostInHeader: host.parentElement?.id === "grcon-mascot-header-slot",
        hostVisibility: getComputedStyle(host).visibility,
        hasPngRunner: Boolean(strip.querySelector(".grcon-mascot-sprite")),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    await page.waitForTimeout(260);
    const runningLater = await page.locator("#grcon-mascot-activity-strip video").evaluate((video) => video.currentTime);
    assert.match(runningStart.source, /grcon-mascot-running-alpha\.webm/);
    assert.ok(videoResponses.some((entry) => /grcon-mascot-running-alpha\.webm/.test(entry.url) && entry.status === 200), "Network deve comprovar HTTP 200 do vídeo real de corrida");
    assert.equal(runningStart.paused, false);
    assert.ok(runningLater > runningStart.currentTime + 0.05, "vídeo real precisa avançar frames durante a corrida");
    assert.equal(runningStart.stripActive, "true");
    assert.equal(runningStart.stripHidden, false);
    assert.match(runningStart.animationName, /grcon-mascot-strip-run/);
    assert.equal(runningStart.stripPosition, "relative");
    assert.equal(runningStart.stripPointerEvents, "none");
    assert.equal(runningStart.outsideWorkspace, true, "faixa deve ficar integralmente antes do app-shell/workspace");
    assert.equal(runningStart.overlapsWorkspace, false, "corrida não pode passar sobre conteúdo operacional");
    assert.equal(runningStart.hostInHeader, true);
    assert.equal(runningStart.hostVisibility, "hidden", "mascote contextual deve sair visualmente enquanto a corrida usa a faixa");
    assert.equal(runningStart.hasPngRunner, false, "corrida não pode ser simulada com sprite/PNG");
    assert.ok(runningStart.overflow <= 1);

    await page.click("#fixture-workspace-action");
    assert.equal(await page.evaluate(() => window.__workspaceClicks), 1, "faixa do mascote não pode bloquear cliques no workspace");
    await page.screenshot({ path: path.join(outputDir, "05-running-strip.png") });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:mascot-operation", { detail: { active: false } })));
    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "idle", null, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelector("#grcon-mascot-activity-strip")?.hidden === true, null, { timeout: 3000 });

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
    await waitMascotInsideViewport(page);
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
    await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "idle", null, { timeout: 4000 });

    await page.evaluate(() => { void window.GrconMascot.run({ source: "qa-mobile-run" }); });
    await page.waitForFunction(() => document.querySelector("#grcon-mascot-activity-strip")?.dataset.active === "true", null, { timeout: 5000 });
    await page.waitForFunction(() => {
      const track = document.querySelector("#grcon-mascot-activity-strip .grcon-mascot-runner-track");
      if (!track) return false;
      const rect = track.getBoundingClientRect();
      return rect.right > 8 && rect.left < innerWidth - 8;
    }, null, { timeout: 3000 });
    const mobileRun = await page.evaluate(() => {
      const strip = document.querySelector("#grcon-mascot-activity-strip");
      const workspace = document.querySelector(".workspace");
      const video = strip.querySelector("video");
      const sr = strip.getBoundingClientRect();
      const wr = workspace.getBoundingClientRect();
      return {
        source: video.currentSrc,
        outsideWorkspace: sr.bottom <= wr.top + 1,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        stripHeight: sr.height,
      };
    });
    assert.match(mobileRun.source, /grcon-mascot-running-alpha\.webm/);
    assert.equal(mobileRun.outsideWorkspace, true);
    assert.ok(mobileRun.overflow <= 1);
    assert.ok(mobileRun.stripHeight <= 70, "faixa mobile precisa permanecer compacta");
    await page.screenshot({ path: path.join(outputDir, "06b-mobile-running-strip.png") });
    await page.evaluate(() => window.GrconMascot.idle({ source: "qa-mobile-run-end" }));
    await page.waitForFunction(() => document.querySelector("#grcon-mascot-activity-strip")?.hidden === true, null, { timeout: 3000 });

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

    for (const viewport of [
      { width: 1024, height: 768, file: "12-tablet-1024x768.png" },
      { width: 768, height: 1024, file: "13-tablet-768x1024.png" },
      { width: 375, height: 812, file: "14-mobile-375x812.png" },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.evaluate(() => window.GrconMascot.idle({ source: "qa-required-viewport" }));
      await waitMascotInsideViewport(page);
      const placement = await page.evaluate(() => {
        const host = document.querySelector("#grcon-context-mascot");
        const workspace = document.querySelector(".workspace");
        const hr = host.getBoundingClientRect();
        const wr = workspace.getBoundingClientRect();
        return {
          fixed: getComputedStyle(host).position === "fixed",
          inHeader: host.parentElement?.id === "grcon-mascot-header-slot",
          overlapsWorkspace: !(hr.right <= wr.left || hr.left >= wr.right || hr.bottom <= wr.top || hr.top >= wr.bottom),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      assert.equal(placement.fixed, false);
      assert.equal(placement.inHeader, true);
      assert.equal(placement.overlapsWorkspace, false);
      assert.ok(placement.overflow <= 1);
      await assertMascotTransparent(page, viewport.width + "x" + viewport.height);
      await page.screenshot({ path: path.join(outputDir, viewport.file) });
    }

    await page.setViewportSize({ width: 1366, height: 768 });
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

    assert.ok(videoResponses.some((entry) => /grcon-mascot-success-alpha\.webm/.test(entry.url) && entry.status === 200), "Network deve comprovar HTTP 200 do vídeo de sucesso");
    assert.equal(videoResponses.some((entry) => /grcon-mascot-idle-alpha\.webm/.test(entry.url)), false, "idle não deve requisitar vídeo");
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
      runnerActive: document.querySelector("#grcon-mascot-activity-strip")?.dataset.active,
      runnerHidden: document.querySelector("#grcon-mascot-activity-strip")?.hidden,
    }));
    assert.equal(reduced.diagnostics.reducedMotion, true);
    assert.equal(reduced.videoDisplay, "none");
    assert.notEqual(reduced.state, "running");
    assert.notEqual(reduced.runnerActive, "true");
    assert.equal(reduced.runnerHidden, true);
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
