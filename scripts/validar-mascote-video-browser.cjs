const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";
const fixtureUrl = `${baseUrl}/tests/fixtures/grcon-mascot-video.html`;

async function waitReady(page) {
  await page.waitForSelector(".grcon-brand-mascot", { state: "visible", timeout: 15000 });
  await page.waitForFunction(() => window.GrconMascot?.diagnostics?.().ready, null, { timeout: 15000 });
}
async function operate(page) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("grcon:mascot-operation", {
    detail: { active: true, state: "checking-document", task: "Conferindo documentos" },
  })));
}
async function waitMedia(page, suffix) {
  await page.waitForFunction((expected) => {
    const record = window.GrconMascot?.diagnostics?.().records?.[0];
    return record?.media?.endsWith(expected);
  }, suffix, { timeout: 15000 });
}
async function spriteVisible(page) {
  return page.evaluate(() => {
    const sprite = document.querySelector(".grcon-brand-mascot .grcon-mascot-sprite");
    const style = getComputedStyle(sprite);
    const rect = sprite.getBoundingClientRect();
    return Number(style.opacity) > 0 && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  });
}
async function makePage(context, init) {
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  await page.goto(fixtureUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitReady(page);
  return page;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    // 1 — caminho principal: WebM real reproduz.
    const normalContext = await browser.newContext({ serviceWorkers: "block" });
    const normal = await makePage(normalContext);
    let d = await normal.evaluate(() => window.GrconMascot.diagnostics());
    assert.equal(d.engine, "official-video-v5-multiformat");
    assert.equal(d.assetRevision, "20260916.3");
    assert.equal(d.instances, 1);
    assert.equal(await normal.locator("[data-grcon-mascot-motion-setting]").count(), 1);
    await operate(normal);
    await waitMedia(normal, ":webm");
    d = await normal.evaluate(() => window.GrconMascot.diagnostics());
    assert.deepEqual(d.formats, ["webm"]);
    assert.equal(d.activeVideos, 1);
    assert.equal(await normal.locator(".grcon-brand-mascot > video").count(), 1);
    assert.equal(await normal.locator(".grcon-brand-mascot > canvas").count(), 1);

    // Trocas rápidas não criam instâncias/listeners de mídia duplicados.
    await normal.evaluate(() => {
      for (let i = 0; i < 60; i += 1) window.GrconMascot.play(i % 2 ? "checking-document" : "searching-files");
      window.GrconMascot.play("checking-document");
    });
    d = await normal.evaluate(() => window.GrconMascot.diagnostics());
    assert.equal(d.instances, 1);
    assert.equal(await normal.locator(".grcon-brand-mascot > video").count(), 1);
    assert.equal(await normal.locator(".grcon-brand-mascot > canvas").count(), 1);
    await normalContext.close();

    // 2 — WebM bloqueado: H.264 local reconstruído e reproduzido em Blob.
    const fallbackContext = await browser.newContext({ serviceWorkers: "block" });
    const fallback = await fallbackContext.newPage();
    await fallback.route(/grcon-mascot-.*-alpha\.webm(?:\?.*)?$/, (route) => route.abort("failed"));
    await fallback.goto(`${fixtureUrl}?mp4=1`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitReady(fallback);
    await operate(fallback);
    await waitMedia(fallback, ":mp4");
    d = await fallback.evaluate(() => window.GrconMascot.diagnostics());
    assert.deepEqual(d.formats, ["mp4"]);
    assert.equal(d.activeVideos, 1);
    assert.ok(Object.values(d.failures).some((count) => count > 0), "falha do WebM precisa ser diagnosticada");
    assert.equal(await fallback.locator(".grcon-brand-mascot.is-compat-active > canvas").count(), 1);
    await fallbackContext.close();

    // 3 — WebM e compat bloqueados: PNG final permanece visível.
    const pngContext = await browser.newContext({ serviceWorkers: "block" });
    const png = await pngContext.newPage();
    await png.route(/grcon-mascot-.*-alpha\.webm(?:\?.*)?$/, (route) => route.abort("failed"));
    await png.route(/assets\/mascot\/compat\/.*\.b64(?:\?.*)?$/, (route) => route.abort("failed"));
    await png.goto(`${fixtureUrl}?png=1`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitReady(png);
    await operate(png);
    await png.waitForFunction(() => window.GrconMascot.diagnostics().records[0]?.media?.startsWith("png-"), null, { timeout: 15000 });
    d = await png.evaluate(() => window.GrconMascot.diagnostics());
    assert.deepEqual(d.formats, ["png"]);
    assert.equal(await spriteVisible(png), true);
    await pngContext.close();

    // 4 — reduced-motion sem escolha explícita: PNG, não erro de codec.
    const reducedContext = await browser.newContext({ reducedMotion: "reduce", serviceWorkers: "block" });
    const reduced = await makePage(reducedContext);
    await operate(reduced);
    d = await reduced.evaluate(() => window.GrconMascot.diagnostics());
    assert.equal(d.reducedMotion, true);
    assert.equal(d.userPreference, "system");
    assert.equal(d.animationsEnabled, false);
    assert.equal(d.failures.REDUCED_MOTION >= 1, true);
    assert.deepEqual(d.formats, ["png"]);
    assert.equal(await spriteVisible(reduced), true);
    await reducedContext.close();

    // 5 — escolha explícita ON prevalece sobre reduced-motion.
    const overrideContext = await browser.newContext({ reducedMotion: "reduce", serviceWorkers: "block" });
    const override = await makePage(overrideContext, () => localStorage.setItem("grcon:mascot:animations:v5", "on"));
    await operate(override);
    await waitMedia(override, ":webm");
    d = await override.evaluate(() => window.GrconMascot.diagnostics());
    assert.equal(d.reducedMotion, true);
    assert.equal(d.userPreference, "on");
    assert.equal(d.animationsEnabled, true);
    await overrideContext.close();

    // 6 — escolha explícita OFF bloqueia animação mesmo sem reduced-motion.
    const offContext = await browser.newContext({ serviceWorkers: "block" });
    const off = await makePage(offContext, () => localStorage.setItem("grcon:mascot:animations:v5", "off"));
    await operate(off);
    d = await off.evaluate(() => window.GrconMascot.diagnostics());
    assert.equal(d.userPreference, "off");
    assert.equal(d.animationsEnabled, false);
    assert.deepEqual(d.formats, ["png"]);
    await offContext.close();

    // 7 — autoplay é classificado separadamente e mantém PNG.
    const autoplayContext = await browser.newContext({ serviceWorkers: "block" });
    const autoplay = await makePage(autoplayContext, () => {
      HTMLMediaElement.prototype.play = function () {
        return Promise.reject(new DOMException("blocked by policy", "NotAllowedError"));
      };
    });
    await operate(autoplay);
    await autoplay.waitForFunction(() => window.GrconMascot.diagnostics().failures.AUTOPLAY_BLOCKED >= 1, null, { timeout: 5000 });
    d = await autoplay.evaluate(() => window.GrconMascot.diagnostics());
    assert.equal(d.failures.AUTOPLAY_BLOCKED >= 1, true);
    assert.deepEqual(d.formats, ["png"]);
    assert.equal(await spriteVisible(autoplay), true);
    await autoplayContext.close();

    // 8 — saudação: só após desbloqueio e uma vez por sessão.
    const greetingContext = await browser.newContext({ serviceWorkers: "block" });
    await greetingContext.addInitScript(() => {
      window.GrconCloud = {
        state: { session: { user: { id: "browser-test-user" } } },
        getCurrentUserIdentity() { return { userId: "browser-test-user", displayName: "Vinicio Melo" }; },
      };
    });
    const greeting = await greetingContext.newPage();
    await greeting.goto(`${fixtureUrl}?greeting=1`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitReady(greeting);
    d = await greeting.evaluate(() => window.GrconMascot.diagnostics());
    assert.equal(d.appLocked, true);
    assert.equal(d.greetingPlayedThisSession, false);
    await greeting.evaluate(() => {
      document.documentElement.classList.remove("grcon-cloud-pending");
      window.dispatchEvent(new CustomEvent("grcon:cloud-ready"));
    });
    await greeting.waitForFunction(() => window.GrconMascot.diagnostics().greetingPlayedThisSession, null, { timeout: 10000 });
    assert.equal(await greeting.locator("#grcon-mascot-greeting-bubble").textContent(), "Olá, Vinicio!");
    await greetingContext.close();

    console.log("mascot-browser: OK — WebM, MP4, PNG, reduced-motion, override, autoplay, concorrência e saudação validados no Chromium/Edge engine.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
