const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";
const outputDir = path.join(process.cwd(), "artifacts/pdf-tools-browser");
fs.mkdirSync(outputDir, { recursive: true });

async function revealApp(page) {
  await page.addStyleTag({ content: [
    "html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script) { visibility: visible !important; }",
    "#grcon-cloud-auth { display: none !important; }",
  ].join("\n") });
}

async function waitForStableServiceWorkerPage(page) {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
      await page.waitForFunction(() => Boolean(navigator.serviceWorker && navigator.serviceWorker.controller), null, { timeout: 15000 });
      // grcon_service_worker.js recarrega a página em controllerchange. Só
      // prossiga depois que esse primeiro reload automático tiver estabilizado.
      await page.waitForTimeout(200);
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
      return;
    } catch (error) {
      lastError = error;
      const message = String(error && error.message ? error.message : error);
      if (!/Execution context was destroyed|navigation|frame was detached|Timeout/i.test(message)) throw error;
      await page.waitForTimeout(150);
    }
  }
  throw lastError || new Error("Service Worker não estabilizou a página de Combinar PDFs.");
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
    if (!target) throw new Error("View não encontrada: " + wanted);
    target.click();
  }, view);
}

async function openPdfTools(page) {
  await clickVisibleView(page, "pdf-tools");
  await page.evaluate(async () => {
    if (window.GRCONModuleLoader?.ensureModule) await window.GRCONModuleLoader.ensureModule("pdf-tools");
  });
  await page.locator("#pdf-merge-drop").waitFor({ state: "visible", timeout: 20000 });
  await page.waitForFunction(() => window.GrconPdfMergeReact?.mounted === true && window.GrconPdfMergeUi?._debug?.state);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  try {
    const openStart = Date.now();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitForStableServiceWorkerPage(page);
    await revealApp(page);
    await openPdfTools(page);
    const openModuleMs = Date.now() - openStart;

    assert.equal(await page.locator("#grcon-pdf-tools-root").count(), 1);
    assert.equal(await page.locator("#pdf-merge-drop").count(), 1);
    assert.equal(await page.locator("#pdf-merge-run").isDisabled(), true);

    await page.addScriptTag({ url: baseUrl + "/pdf-lib.min.js" });
    await page.evaluate(() => {
      window.__pdfTestMessages = [];
      const original = window.GrconNotify;
      window.GrconNotify = (message, kind) => {
        window.__pdfTestMessages.push({ message: String(message || ""), kind: String(kind || "info") });
        if (typeof original === "function") original(message, kind);
      };
    });

    await page.evaluate(async () => {
      async function makePdf(name, width, height, lastModified) {
        const doc = await window.PDFLib.PDFDocument.create({ updateMetadata: false });
        doc.addPage([width, height]);
        const bytes = await doc.save();
        return new File([bytes], name, { type: "application/pdf", lastModified });
      }
      window.__pdfA = await makePdf("A-primeiro.pdf", 220, 300, 101);
      window.__pdfB = await makePdf("B-segundo.pdf", 440, 500, 102);
      window.GrconPdfMergeUi.clear();
      window.GrconPdfMergeUi.addFiles([window.__pdfA, window.__pdfB]);
    });

    await page.waitForFunction(() => window.GrconPdfMergeUi._debug.state.items.length === 2);
    assert.equal(await page.locator("#pdf-merge-run").isDisabled(), false);

    const orderStart = await page.evaluate(() => performance.now());
    await page.locator('#pdf-merge-list [data-pdf-action="down"]').first().click();
    await page.waitForFunction(() => window.GrconPdfMergeUi._debug.state.items[0]?.name === "B-segundo.pdf");
    const reorderMs = await page.evaluate((start) => performance.now() - start, orderStart);

    const autoDownloadPromise = page.waitForEvent("download", { timeout: 20000 });
    await page.locator("#pdf-merge-run").click();
    const autoDownload = await autoDownloadPromise;
    await page.waitForFunction(() => window.GrconPdfMergeUi._debug.state.result && !window.GrconPdfMergeUi._debug.state.busy, null, { timeout: 20000 });
    assert.equal(autoDownload.suggestedFilename(), "PDF_Combinado.pdf");

    const resultInfo = await page.evaluate(async () => {
      const state = window.GrconPdfMergeUi._debug.state;
      const buffer = await state.result.blob.arrayBuffer();
      const doc = await window.PDFLib.PDFDocument.load(buffer);
      return {
        pageCount: doc.getPageCount(),
        widths: doc.getPages().map((p) => Math.round(p.getSize().width)),
        heights: doc.getPages().map((p) => Math.round(p.getSize().height)),
        fileCount: state.result.fileCount,
        workerActive: state.workerActive,
      };
    });
    assert.equal(resultInfo.pageCount, 2);
    assert.deepEqual(resultInfo.widths, [440, 220]);
    assert.deepEqual(resultInfo.heights, [500, 300]);
    assert.equal(resultInfo.fileCount, 2);
    assert.equal(resultInfo.workerActive, false);

    await page.locator("#pdf-merge-output-name").fill("Resultado React");
    const secondDownloadPromise = page.waitForEvent("download", { timeout: 10000 });
    await page.locator("#pdf-merge-download").click();
    const secondDownload = await secondDownloadPromise;
    assert.equal(secondDownload.suggestedFilename(), "Resultado React.pdf");

    await page.evaluate(() => {
      window.GrconPdfMergeUi.clear();
      const bad = new File([new Uint8Array([1,2,3])], "nao-pdf.txt", { type: "text/plain", lastModified: 333 });
      window.GrconPdfMergeUi.addFiles([window.__pdfA, window.__pdfA, bad]);
    });
    await page.waitForFunction(() => window.GrconPdfMergeUi._debug.state.items.length === 1);
    const duplicateKinds = await page.evaluate(() => window.__pdfTestMessages.filter((entry) => entry.kind === "warn").map((entry) => entry.message));
    assert.ok(duplicateKinds.some((message) => /idêntico/i.test(message)));
    assert.ok(duplicateKinds.some((message) => /ignorad/i.test(message)));

    await page.evaluate(() => {
      window.GrconPdfMergeUi.clear();
      const corrupt = new File([new Uint8Array([37,80,68,70,45,98,97,100])], "corrompido.pdf", { type: "application/pdf", lastModified: 444 });
      window.GrconPdfMergeUi.addFiles([window.__pdfA, corrupt]);
    });
    await page.locator("#pdf-merge-run").click();
    await page.waitForFunction(() => !window.GrconPdfMergeUi._debug.state.busy, null, { timeout: 20000 });
    const errors = await page.evaluate(() => window.__pdfTestMessages.filter((entry) => entry.kind === "error").map((entry) => entry.message));
    assert.ok(errors.length >= 1, "PDF corrompido precisa produzir mensagem de erro.");
    assert.ok(errors.every((message) => !/\bat\s+\w|Error:/i.test(message)), "Stack trace não deve chegar ao usuário.");

    await page.evaluate(() => {
      window.GrconPdfMergeUi.clear();
      window.GrconPdfMergeUi.addFiles([window.__pdfA, window.__pdfB]);
      const NativeWorker = window.Worker;
      window.__pdfNativeWorker = NativeWorker;
      window.Worker = class DelayedWorker {
        constructor(...args) {
          this.inner = new NativeWorker(...args);
          this.timer = 0;
        }
        addEventListener(...args) { return this.inner.addEventListener(...args); }
        removeEventListener(...args) { return this.inner.removeEventListener(...args); }
        postMessage(message, ...rest) {
          if (message && message.type === "merge") {
            this.timer = window.setTimeout(() => {
              this.timer = 0;
              this.inner.postMessage(message, ...rest);
            }, 1500);
            return;
          }
          return this.inner.postMessage(message, ...rest);
        }
        terminate() {
          if (this.timer) window.clearTimeout(this.timer);
          this.timer = 0;
          return this.inner.terminate();
        }
      };
    });
    await page.locator("#pdf-merge-run").click();
    await page.waitForFunction(() => window.GrconPdfMergeUi._debug.state.busy && window.GrconPdfMergeUi._debug.state.workerActive);
    await clickVisibleView(page, "control");
    await page.waitForFunction(() => {
      const state = window.GrconPdfMergeUi?._debug?.state;
      return state && !state.busy && !state.workerActive;
    }, null, { timeout: 10000 });
    await page.evaluate(() => { window.Worker = window.__pdfNativeWorker; });
    await openPdfTools(page);
    const persisted = await page.evaluate(() => ({
      items: window.GrconPdfMergeUi._debug.state.items.map((item) => item.name),
      result: Boolean(window.GrconPdfMergeUi._debug.state.result),
    }));
    assert.deepEqual(persisted.items, ["A-primeiro.pdf", "B-segundo.pdf"]);
    assert.equal(persisted.result, false);

    for (let i = 0; i < 3; i += 1) {
      await clickVisibleView(page, "control");
      await openPdfTools(page);
    }
    assert.equal(await page.locator("#grcon-pdf-tools-root").count(), 1);
    assert.equal(await page.locator("#pdf-merge-drop").count(), 1);

    const perf = await page.evaluate(async () => {
      const makeFiles = (count, prefix) => Array.from({ length: count }, (_, index) =>
        new File([new Uint8Array(512 + index)], prefix + "-" + String(index + 1).padStart(3, "0") + ".pdf", {
          type: "application/pdf",
          lastModified: index + 1,
        })
      );
      const raf2 = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.GrconPdfMergeUi.clear();
      let started = performance.now();
      window.GrconPdfMergeUi.addFiles(makeFiles(20, "REACT20"));
      await raf2();
      const add20Ms = performance.now() - started;
      const count20 = document.querySelectorAll("#pdf-merge-list [data-pdf-id]").length;
      started = performance.now();
      document.querySelector('#pdf-merge-list [data-pdf-action="down"]').click();
      await raf2();
      const reorder20Ms = performance.now() - started;

      window.GrconPdfMergeUi.clear();
      started = performance.now();
      window.GrconPdfMergeUi.addFiles(makeFiles(50, "REACT50"));
      await raf2();
      const add50Ms = performance.now() - started;
      const count50 = document.querySelectorAll("#pdf-merge-list [data-pdf-id]").length;
      const middle = document.querySelectorAll("#pdf-merge-list [data-pdf-id]")[25];
      started = performance.now();
      middle.querySelector('[data-pdf-action="up"]').click();
      await raf2();
      const response50Ms = performance.now() - started;
      return { add20Ms, reorder20Ms, add50Ms, response50Ms, count20, count50 };
    });
    assert.equal(perf.count20, 20);
    assert.equal(perf.count50, 50);

    await page.screenshot({ path: path.join(outputDir, "desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, "A tela mobile não deve criar overflow horizontal.");
    await page.screenshot({ path: path.join(outputDir, "mobile.png"), fullPage: true });

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.evaluate(async () => {
      if ("serviceWorker" in navigator) await navigator.serviceWorker.ready;
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await revealApp(page);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 15000 });
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await revealApp(page);
    await openPdfTools(page);
    assert.equal(await page.locator("#pdf-merge-drop").count(), 1);
    await context.setOffline(false);

    const filteredConsoleErrors = consoleErrors.filter((message) =>
      !/supabase|ERR_INTERNET_DISCONNECTED|Failed to fetch|net::ERR_/i.test(message)
    );
    assert.deepEqual(filteredConsoleErrors, []);

    const metrics = {
      passed: true,
      implementation: "React + TypeScript",
      openModuleMs,
      reorderMs,
      ...perf,
      merge: {
        pageCount: resultInfo.pageCount,
        widths: resultInfo.widths,
        heights: resultInfo.heights,
        automaticDownload: true,
        downloadAgain: true,
        cancellationOnNavigation: true,
        corruptedPdfError: true,
        offlineWarmCache: true,
      },
    };
    fs.writeFileSync(path.join(outputDir, "metrics.json"), JSON.stringify(metrics, null, 2));
    console.log(JSON.stringify(metrics, null, 2));
  } finally {
    await context.setOffline(false).catch(() => {});
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
