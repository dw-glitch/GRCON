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
  const failures = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("requestfailed", (req) => failures.push(req.url()));

  await page.goto(baseUrl + "/index.html", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.GrconMascotSuccessPilot), null, { timeout: 15000 });
  await page.evaluate(() => {
    const panel = document.querySelector("#egrdt-teams-ready");
    panel.hidden = false;
    panel.style.minHeight = "120px";
    panel.style.marginTop = "140px";
  });

  const result = await page.evaluate(async (reduce) => {
    const ok = await window.GrconMascotSuccessPilot.play({ anchor: "#egrdt-teams-ready", force: reduce });
    const el = document.querySelector("#grcon-mascot-success-pilot");
    const anchor = document.querySelector("#egrdt-teams-ready");
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    return {
      ok,
      visible: el.dataset.visible,
      pointerEvents: style.pointerEvents,
      background: style.backgroundColor,
      width: rect.width,
      left: rect.left,
      anchorRight: anchorRect.right,
      viewport: innerWidth,
      diag: window.GrconMascotSuccessPilot.diagnostics(),
    };
  }, reducedMotion === "reduce");

  if (reducedMotion === "reduce") {
    assert.equal(result.diag.reducedMotion, true);
  } else {
    assert.equal(result.ok, true);
    assert.equal(result.visible, "true");
    assert.equal(result.pointerEvents, "none");
    assert.ok(result.width <= viewport.width * 0.30, "mascote não pode dominar a interface");
  }
  assert.equal(errors.length, 0, "console sem erros: " + errors.join(" | "));
  assert.equal(failures.filter((u) => /mascot.*success-pilot/i.test(u)).length, 0, "asset do piloto não pode falhar");

  await page.screenshot({ path: path.join(out, name + ".png"), fullPage: true });
  await context.close();
  await browser.close();
  return result;
}

(async () => {
  const desktop = await run({ width: 1440, height: 900 }, "success-pilot-desktop");
  const mobile = await run({ width: 390, height: 844 }, "success-pilot-mobile");
  const reduced = await run({ width: 1440, height: 900 }, "success-pilot-reduced", "reduce");
  console.log(JSON.stringify({ desktop, mobile, reduced }, null, 2));
})().catch((error) => { console.error(error); process.exit(1); });
