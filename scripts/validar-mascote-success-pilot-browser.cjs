const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";
const out = process.env.GRCON_MASCOT_OUTPUT || path.join(process.cwd(), "artifacts/mascot-video");
fs.mkdirSync(out, { recursive: true });

async function run(viewport, name, reducedMotion = "no-preference") {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, reducedMotion, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (text.includes("[GRCON Storage][initialize]") && text.includes("Os módulos de Histórico e Postagem SIGEM ainda não estão disponíveis.")) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto(baseUrl + "/index.html", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.GrconMascotSuccessPilot && window.GrconMascot?.diagnostics?.().ready), null, { timeout: 15000 });

  await page.evaluate(() => {
    document.documentElement.classList.remove("grcon-cloud-pending");
    const panel = document.querySelector("#egrdt-teams-ready") || document.createElement("div");
    panel.id = "egrdt-teams-ready";
    panel.hidden = false;
    Object.assign(panel.style, {
      position: "fixed",
      left: innerWidth > 700 ? "300px" : "18px",
      top: "220px",
      width: innerWidth > 700 ? "420px" : "300px",
      minHeight: "110px",
      border: "1px solid transparent",
    });
    if (!panel.isConnected) document.body.appendChild(panel);
  });

  const ok = await page.evaluate(() => window.GrconMascotSuccessPilot.play({
    anchor: "#egrdt-teams-ready",
    message: "Postagem concluída.",
    duration: 2200,
  }));
  assert.equal(ok, true);
  await page.waitForFunction(() => window.GrconMascot.diagnostics().state === "success", null, { timeout: 5000 });

  const result = await page.evaluate(() => {
    const el = document.querySelector("#grcon-context-mascot");
    const anchor = document.querySelector("#egrdt-teams-ready");
    const rect = el.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    return {
      pointerEvents: getComputedStyle(el).pointerEvents,
      media: el.dataset.media,
      state: el.dataset.state,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      anchor: { left: anchorRect.left, right: anchorRect.right, top: anchorRect.top, bottom: anchorRect.bottom },
      viewport: { width: innerWidth, height: innerHeight },
      diag: window.GrconMascot.diagnostics(),
      delegated: window.GrconMascotSuccessPilot.diagnostics().delegated,
    };
  });

  assert.equal(result.delegated, true);
  assert.equal(result.pointerEvents, "none");
  assert.equal(result.diag.instances, 1);
  assert.ok(result.left >= -0.5 && result.top >= -0.5);
  assert.ok(result.right <= result.viewport.width + 0.5 && result.bottom <= result.viewport.height + 0.5);
  if (reducedMotion === "reduce") {
    assert.equal(result.diag.reducedMotion, true);
    assert.equal(result.media, "png");
  }

  await page.screenshot({ path: path.join(out, name + ".png"), fullPage: true });
  assert.deepEqual(errors, []);
  await context.close();
  await browser.close();
  return result;
}

(async () => {
  const desktop = await run({ width: 1440, height: 900 }, "success-pilot-desktop");
  const mobile = await run({ width: 390, height: 844 }, "success-pilot-mobile");
  const reduced = await run({ width: 1440, height: 900 }, "success-pilot-reduced", "reduce");
  console.log(JSON.stringify({ desktop, mobile, reduced }, null, 2));
  console.log("mascot-success-delegation-browser: PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
