const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
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
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const supported = await page.evaluate(() => "serviceWorker" in navigator);
      if (!supported) return;
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      if (await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
        await page.waitForTimeout(250);
        return;
      }
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
      await revealApp(page);
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      if (!/Execution context was destroyed|navigation|frame was detached|Timeout/i.test(message)) throw error;
      await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
      await revealApp(page).catch(() => {});
    }
  }
  await page.waitForFunction(
    () => !("serviceWorker" in navigator) || Boolean(navigator.serviceWorker.controller),
    null,
    { timeout: 10000 },
  );
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
  await clickVisibleView(page, "additional-tools");
  await page.evaluate(async () => {
    if (window.GRCONModuleLoader?.ensureModule) await window.GRCONModuleLoader.ensureModule("additional-tools");
  });
  await page.locator("#additional-tools-module").waitFor({ state: "visible", timeout: 10000 });
  await clickVisibleView(page, "pdf-tools");
  await page.evaluate(async () => {
    if (window.GRCONModuleLoader?.ensureModule) await window.GRCONModuleLoader.ensureModule("pdf-tools");
  });
  await page.locator("#pdf-merge-drop").waitFor({ state: "visible", timeout: 20000 });
  await page.waitForFunction(() => window.GrconPdfMergeReact?.mounted === true && window.GrconPdfMergeUi?._debug?.state);
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outputDir, name), fullPage: false });
}

async function setTheme(page, theme) {
  await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
  await page.waitForTimeout(80);
}

async function createPdfFixtures(page) {
  await page.addScriptTag({ url: baseUrl + "/pdf-lib.min.js" });
  await page.evaluate(async () => {
    async function makePdf(name, width, height, lastModified) {
      const doc = await window.PDFLib.PDFDocument.create({ updateMetadata: false });
      doc.addPage([width, height]);
      const bytes = await doc.save();
      return new File([bytes], name, { type: "application/pdf", lastModified });
    }
    window.__pdfA = await makePdf("A-primeiro.pdf", 220, 300, 101);
    window.__pdfB = await makePdf("B-segundo.pdf", 440, 500, 102);
  });
}

async function inspectCurrentResult(page) {
  return page.evaluate(async () => {
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
}

async function mergeAndWait(page, expectedFileName) {
  const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
  await page.locator("#pdf-merge-run").click();
  const download = await downloadPromise;
  await page.waitForFunction(() => window.GrconPdfMergeUi._debug.state.result && !window.GrconPdfMergeUi._debug.state.busy, null, { timeout: 20000 });
  if (expectedFileName) assert.equal(download.suggestedFilename(), expectedFileName);
  return inspectCurrentResult(page);
}

async function installDelayedWorker(page, delay = 1800) {
  await page.evaluate((delayMs) => {
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
          }, delayMs);
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
  }, delay);
}

async function restoreNativeWorker(page) {
  await page.evaluate(() => {
    if (window.__pdfNativeWorker) {
      window.Worker = window.__pdfNativeWorker;
      delete window.__pdfNativeWorker;
    }
  });
}

async function addSyntheticFiles(page, count, prefix) {
  await page.evaluate(({ count, prefix }) => {
    const files = Array.from({ length: count }, (_, index) =>
      new File([new Uint8Array(512 + index)], prefix + "-" + String(index + 1).padStart(3, "0") + ".pdf", {
        type: "application/pdf",
        lastModified: index + 1,
      })
    );
    window.GrconPdfMergeUi.clear();
    window.GrconPdfMergeUi.addFiles(files);
  }, { count, prefix });
  await page.waitForFunction((wanted) => window.GrconPdfMergeUi._debug.state.items.length === wanted, count);
  await page.waitForTimeout(60);
}

async function collectLayout(page, width, height = 900) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(80);
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const list = document.querySelector(".pdf-merge-list-wrap");
    const output = document.querySelector(".pdf-merge-output");
    const outputRect = output ? output.getBoundingClientRect() : null;
    return {
      documentScrollWidth: root.scrollWidth,
      documentClientWidth: root.clientWidth,
      overflow: root.scrollWidth - root.clientWidth,
      listScrollHeight: list ? list.scrollHeight : 0,
      listClientHeight: list ? list.clientHeight : 0,
      outputVisible: Boolean(outputRect && outputRect.bottom > 0 && outputRect.top < window.innerHeight),
    };
  });
  assert.ok(metrics.overflow <= 1, "Viewport " + width + " criou overflow horizontal global.");
  assert.ok(metrics.listScrollHeight >= metrics.listClientHeight, "Lista deve manter área de scroll controlada.");
  return metrics;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitForStableServiceWorkerPage(page);
    await revealApp(page);

    const openStart = Date.now();
    await openPdfTools(page);
    const openModuleMs = Date.now() - openStart;

    assert.equal(await page.locator("#grcon-pdf-tools-root").count(), 1);
    assert.equal(await page.locator("#pdf-merge-drop").count(), 1);
    assert.equal(await page.locator("#pdf-merge-run").isDisabled(), true);
    await screenshot(page, "01-pdf-vazio-1366.png");

    await createPdfFixtures(page);
    await page.evaluate(() => {
      window.__pdfTestMessages = [];
      const original = window.GrconNotify;
      window.GrconNotify = (message, kind) => {
        window.__pdfTestMessages.push({ message: String(message || ""), kind: String(kind || "info") });
        if (typeof original === "function") original(message, kind);
      };
      window.GrconPdfMergeUi.clear();
      window.GrconPdfMergeUi.addFiles([window.__pdfA, window.__pdfB]);
    });
    await page.waitForFunction(() => window.GrconPdfMergeUi._debug.state.items.length === 2);
    assert.equal(await page.locator("#pdf-merge-run").isDisabled(), false);
    await screenshot(page, "02-pdf-2-arquivos-1366.png");

    const resultAB = await mergeAndWait(page, "PDF_Combinado.pdf");
    assert.equal(resultAB.pageCount, 2);
    assert.deepEqual(resultAB.widths, [220, 440]);
    assert.deepEqual(resultAB.heights, [300, 500]);
    assert.equal(resultAB.fileCount, 2);
    assert.equal(resultAB.workerActive, false);
    await screenshot(page, "06-pdf-sucesso-1366.png");

    await page.locator("#pdf-merge-output-name").fill("Resultado React");
    const secondDownloadPromise = page.waitForEvent("download", { timeout: 10000 });
    await page.locator("#pdf-merge-download").click();
    const secondDownload = await secondDownloadPromise;
    assert.equal(secondDownload.suggestedFilename(), "Resultado React.pdf");

    const orderStart = await page.evaluate(() => performance.now());
    await page.locator('#pdf-merge-list [data-pdf-action="down"]').first().click();
    await page.waitForFunction(() => window.GrconPdfMergeUi._debug.state.items[0]?.name === "B-segundo.pdf");
    const reorderMs = await page.evaluate((start) => performance.now() - start, orderStart);
    const resultBA = await mergeAndWait(page, "Resultado React.pdf");
    assert.deepEqual(resultBA.widths, [440, 220]);
    assert.deepEqual(resultBA.heights, [500, 300]);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#pdf-merge-result").scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
    await screenshot(page, "09-pdf-mobile-sucesso-390.png");

    await page.evaluate(() => window.GrconPdfMergeUi.clear());
    await page.waitForFunction(() => window.GrconPdfMergeUi._debug.state.items.length === 0);
    await page.locator(".pdf-merge-shell").scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
    await screenshot(page, "07-pdf-mobile-vazio-390.png");

    await addSyntheticFiles(page, 20, "MOBILE20");
    await page.locator(".pdf-merge-file-tools").scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
    await screenshot(page, "08-pdf-mobile-arquivos-390.png");

    await page.setViewportSize({ width: 1366, height: 900 });
    await addSyntheticFiles(page, 20, "SHOT20");
    await screenshot(page, "03-pdf-20-arquivos-1366.png");
    await addSyntheticFiles(page, 50, "SHOT50");
    await screenshot(page, "04-pdf-50-arquivos-1366.png");

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
      const middle50 = document.querySelectorAll("#pdf-merge-list [data-pdf-id]")[25];
      started = performance.now();
      middle50.querySelector('[data-pdf-action="up"]').click();
      await raf2();
      const response50Ms = performance.now() - started;

      window.GrconPdfMergeUi.clear();
      started = performance.now();
      window.GrconPdfMergeUi.addFiles(makeFiles(100, "REACT100"));
      await raf2();
      const add100Ms = performance.now() - started;
      const count100 = document.querySelectorAll("#pdf-merge-list [data-pdf-id]").length;
      const listWrap = document.querySelector(".pdf-merge-list-wrap");
      started = performance.now();
      listWrap.scrollTop = listWrap.scrollHeight;
      await raf2();
      const response100Ms = performance.now() - started;
      const middle100 = document.querySelectorAll("#pdf-merge-list [data-pdf-id]")[50];
      started = performance.now();
      middle100.querySelector('[data-pdf-action="up"]').click();
      await raf2();
      const move100Ms = performance.now() - started;

      return {
        add20Ms, reorder20Ms, add50Ms, response50Ms, add100Ms, response100Ms, move100Ms,
        count20, count50, count100,
        dom100: document.querySelectorAll("#pdf-merge-list [data-pdf-id]").length,
      };
    });

    assert.equal(perf.count20, 20);
    assert.equal(perf.count50, 50);
    assert.equal(perf.count100, 100);
    assert.equal(perf.dom100, 100);

    const layout = {};
    for (const width of [1440, 1366, 1024, 768, 390]) {
      layout[String(width)] = await collectLayout(page, width, width === 390 ? 844 : 900);
    }

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.evaluate(() => {
      window.GrconPdfMergeUi.clear();
      window.GrconPdfMergeUi.addFiles([window.__pdfA, window.__pdfB]);
    });
    await installDelayedWorker(page);
    await page.locator("#pdf-merge-run").click();
    await page.waitForFunction(() => window.GrconPdfMergeUi._debug.state.busy && window.GrconPdfMergeUi._debug.state.workerActive);
    assert.notEqual(await page.locator("#pdf-merge-progress-percent").textContent(), "");
    await screenshot(page, "05-pdf-processando-1366.png");
    await page.locator("#pdf-merge-cancel").click();
    await page.waitForFunction(() => {
      const state = window.GrconPdfMergeUi._debug.state;
      return !state.busy && !state.workerActive && !state.result;
    }, null, { timeout: 10000 });
    await restoreNativeWorker(page);

    const recoveryDownload = page.waitForEvent("download", { timeout: 20000 });
    await page.locator("#pdf-merge-run").click();
    await recoveryDownload;
    await page.waitForFunction(() => window.GrconPdfMergeUi._debug.state.result && !window.GrconPdfMergeUi._debug.state.busy, null, { timeout: 20000 });

    await page.evaluate(() => {
      window.GrconPdfMergeUi.clear();
      const bad = new File([new Uint8Array([1, 2, 3])], "nao-pdf.txt", { type: "text/plain", lastModified: 333 });
      const empty = new File([], "vazio.pdf", { type: "application/pdf", lastModified: 334 });
      window.GrconPdfMergeUi.addFiles([window.__pdfA, window.__pdfA, bad, empty]);
    });
    await page.waitForFunction(() => window.GrconPdfMergeUi._debug.state.items.length === 1);
    const warnings = await page.evaluate(() => window.__pdfTestMessages.filter((entry) => entry.kind === "warn").map((entry) => entry.message));
    assert.ok(warnings.some((message) => /idêntico/i.test(message)));
    assert.ok(warnings.some((message) => /ignorad/i.test(message)));

    await page.evaluate(() => {
      window.GrconPdfMergeUi.clear();
      const corrupt = new File([new Uint8Array([37, 80, 68, 70, 45, 98, 97, 100])], "corrompido.pdf", { type: "application/pdf", lastModified: 444 });
      window.GrconPdfMergeUi.addFiles([window.__pdfA, corrupt]);
    });
    await page.locator("#pdf-merge-run").click();
    await page.waitForFunction(() => !window.GrconPdfMergeUi._debug.state.busy, null, { timeout: 20000 });
    const errors = await page.evaluate(() => window.__pdfTestMessages.filter((entry) => entry.kind === "error").map((entry) => entry.message));
    assert.ok(errors.length >= 1, "PDF corrompido precisa produzir mensagem de erro.");
    assert.ok(errors.every((message) => !/Error:| at /.test(message)), "Stack trace não deve chegar ao usuário.");

    await page.evaluate(() => {
      window.GrconPdfMergeUi.clear();
      window.GrconPdfMergeUi.addFiles([window.__pdfA, window.__pdfB]);
    });
    await installDelayedWorker(page, 1500);
    await page.locator("#pdf-merge-run").click();
    await page.waitForFunction(() => window.GrconPdfMergeUi._debug.state.busy && window.GrconPdfMergeUi._debug.state.workerActive);
    await clickVisibleView(page, "control");
    await page.waitForFunction(() => {
      const state = window.GrconPdfMergeUi?._debug?.state;
      return state && !state.busy && !state.workerActive;
    }, null, { timeout: 10000 });
    await restoreNativeWorker(page);
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

    await setTheme(page, "dark");
    await page.evaluate(() => {
      window.GrconPdfMergeUi.clear();
      window.GrconPdfMergeUi.addFiles([window.__pdfA, window.__pdfB]);
    });
    const darkDownload = page.waitForEvent("download", { timeout: 20000 });
    await page.locator("#pdf-merge-run").click();
    await darkDownload;
    await page.waitForFunction(() => window.GrconPdfMergeUi._debug.state.result && !window.GrconPdfMergeUi._debug.state.busy, null, { timeout: 20000 });
    await page.setViewportSize({ width: 1366, height: 900 });
    await screenshot(page, "10-pdf-dark-1366.png");
    await page.locator("#pdf-merge-download").focus();
    assert.equal(await page.locator("#pdf-merge-download").evaluate((node) => document.activeElement === node), true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#pdf-merge-result").scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
    await screenshot(page, "11-pdf-dark-390.png");
    await setTheme(page, "light");

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

    const filteredConsoleErrors = consoleErrors.filter((message) => {
      if (/supabase|ERR_INTERNET_DISCONNECTED|Failed to fetch|net::ERR_/i.test(message)) return false;
      if (/GRCON Storage.*initialize/i.test(message) && /Histórico e Postagem SIGEM ainda não estão disponíveis/i.test(message)) return false;
      return true;
    });
    assert.deepEqual(filteredConsoleErrors, []);

    const bundlePath = path.join(process.cwd(), "react-dist/pdf-tools-app.js");
    const bundle = fs.readFileSync(bundlePath);
    const bundleBytes = bundle.byteLength;
    const bundleGzipBytes = zlib.gzipSync(bundle).byteLength;
    assert.equal(/PDFLib|pdf-lib\.min\.js/.test(bundle.toString("utf8")), false, "pdf-lib não pode estar no bundle React.");

    const metrics = {
      passed: true,
      phase: "FASE B — Combinar PDFs",
      implementation: "React + TypeScript",
      openModuleMs,
      reorderMs,
      ...perf,
      layout,
      bundle: {
        baselineKb: 162.55,
        baselineGzipKb: 52.80,
        currentKb: Number((bundleBytes / 1024).toFixed(2)),
        currentGzipKb: Number((bundleGzipBytes / 1024).toFixed(2)),
        pdfLibInReactBundle: false,
      },
      merge: {
        orderAB: resultAB.widths,
        orderBA: resultBA.widths,
        automaticDownload: true,
        downloadAgain: true,
        explicitCancellation: true,
        recoveryAfterCancellation: true,
        cancellationOnNavigation: true,
        corruptedPdfError: true,
        duplicateRejected: true,
        invalidRejected: true,
        offlineWarmCache: true,
      },
      screenshots: [
        "01-pdf-vazio-1366.png",
        "02-pdf-2-arquivos-1366.png",
        "03-pdf-20-arquivos-1366.png",
        "04-pdf-50-arquivos-1366.png",
        "05-pdf-processando-1366.png",
        "06-pdf-sucesso-1366.png",
        "07-pdf-mobile-vazio-390.png",
        "08-pdf-mobile-arquivos-390.png",
        "09-pdf-mobile-sucesso-390.png",
        "10-pdf-dark-1366.png",
        "11-pdf-dark-390.png",
      ],
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
