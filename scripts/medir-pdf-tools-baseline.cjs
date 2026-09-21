const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";
const outputDir = path.join(process.cwd(), "artifacts/pdf-tools-baseline");
fs.mkdirSync(outputDir, { recursive: true });

async function revealApp(page) {
  await page.addStyleTag({ content: [
    'html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script) { visibility: visible !important; }',
    '#grcon-cloud-auth { display: none !important; }',
  ].join("\n") });
}

async function clickVisibleView(page, view) {
  await page.waitForFunction((wanted) => Array.from(document.querySelectorAll('[data-grcon-view="' + wanted + '"]')).some((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }), view);
  await page.evaluate((wanted) => {
    const target = Array.from(document.querySelectorAll('[data-grcon-view="' + wanted + '"]')).find((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    target.click();
  }, view);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await revealApp(page);

    const openStarted = Date.now();
    await clickVisibleView(page, "pdf-tools");
    await page.evaluate(async () => {
      if (window.GRCONModuleLoader?.ensureModule) await window.GRCONModuleLoader.ensureModule("pdf-tools");
    });
    await page.locator("#pdf-merge-drop").waitFor({ state: "visible", timeout: 15000 });
    const openModuleMs = Date.now() - openStarted;

    const metrics = await page.evaluate(async () => {
      const makeFiles = (count, prefix) => Array.from({ length: count }, (_, index) => new File(
        [new Uint8Array(512 + index)],
        prefix + "-" + String(index + 1).padStart(3, "0") + ".pdf",
        { type: "application/pdf", lastModified: index + 1 },
      ));
      const raf2 = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      window.GrconPdfMergeUi.clear();
      const add20Started = performance.now();
      window.GrconPdfMergeUi.addFiles(makeFiles(20, "BASELINE20"));
      await raf2();
      const add20Ms = performance.now() - add20Started;
      const count20 = document.querySelectorAll("#pdf-merge-list [data-pdf-id]").length;

      const firstDown = document.querySelector('#pdf-merge-list [data-pdf-action="down"]');
      const reorderStarted = performance.now();
      firstDown.click();
      await raf2();
      const reorderMs = performance.now() - reorderStarted;

      window.GrconPdfMergeUi.clear();
      const add50Started = performance.now();
      window.GrconPdfMergeUi.addFiles(makeFiles(50, "BASELINE50"));
      await raf2();
      const add50Ms = performance.now() - add50Started;
      const count50 = document.querySelectorAll("#pdf-merge-list [data-pdf-id]").length;

      const middle = document.querySelectorAll("#pdf-merge-list [data-pdf-id]")[25];
      const moveButton = middle.querySelector('[data-pdf-action="up"]');
      const response50Started = performance.now();
      moveButton.click();
      await raf2();
      const response50Ms = performance.now() - response50Started;

      return { add20Ms, reorderMs, add50Ms, response50Ms, count20, count50 };
    });

    assert.equal(metrics.count20, 20);
    assert.equal(metrics.count50, 50);
    const result = {
      baselineCommit: "ea2d432542f026a0c6833ce68d329c48cf05ab12",
      implementation: "pdf_merge_app.js",
      openModuleMs,
      ...metrics,
    };
    fs.writeFileSync(path.join(outputDir, "metrics.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ passed: true, ...result }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
