const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { chromium } = require("playwright");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";
const outputDir = path.join(process.cwd(), "artifacts/cover-document-browser");
fs.mkdirSync(outputDir, { recursive: true });

async function revealApp(page) {
  await page.addStyleTag({ content: [
    "html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script) { visibility: visible !important; }",
    "#grcon-cloud-auth { display: none !important; }",
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
    if (!target) throw new Error("View não encontrada: " + wanted);
    target.click();
  }, view);
}

async function stabilizeServiceWorker(page) {
  if (!await page.evaluate(() => "serviceWorker" in navigator)) return;
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await revealApp(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
  }
  await page.waitForFunction(() => !("serviceWorker" in navigator) || Boolean(navigator.serviceWorker.controller), null, { timeout: 10000 });
}

async function openCover(page) {
  await clickVisibleView(page, "additional-tools");
  await page.evaluate(async () => {
    if (window.GRCONModuleLoader?.ensureModule) await window.GRCONModuleLoader.ensureModule("additional-tools");
  });
  await page.locator("#additional-tools-module").waitFor({ state: "visible", timeout: 10000 });
  await clickVisibleView(page, "cover-document");
  await page.evaluate(async () => {
    if (window.GRCONModuleLoader?.ensureModule) await window.GRCONModuleLoader.ensureModule("cover-document");
  });
  await page.locator("#grcon-cover-document-root").waitFor({ state: "visible", timeout: 20000 });
  await page.waitForFunction(() => window.GrconCoverDocumentReact?.mounted === true && window.GrconCoverDocumentUi?._debug?.state);
}

async function probePdfTemplate(page) {
  return page.evaluate(async () => {
    const urls = [
      "assets/templates/CAPA_PAGE1_BASE.pdf.b64.001",
      "assets/templates/CAPA_PAGE1_BASE.pdf.b64.002",
      "assets/templates/CAPA_PAGE1_BASE.pdf.b64.003",
      "assets/templates/CAPA_PAGE1_BASE.pdf.b64.004",
      "assets/templates/CAPA_PAGE1_BASE.pdf.b64.005",
    ];
    const withTimeout = (promise, label) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(label + " excedeu 5 s")), 5000)),
    ]);
    const chunks = [];
    const responses = [];
    for (const url of urls) {
      const response = await withTimeout(fetch(url, { cache: "no-store" }), "fetch " + url);
      const text = await withTimeout(response.text(), "text " + url);
      responses.push({ url, ok: response.ok, status: response.status, length: text.trim().length });
      if (!response.ok) return { stage: "fetch", responses };
      chunks.push(text.trim());
    }
    const binary = atob(chunks.join(""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const documentPdf = await withTimeout(window.PDFLib.PDFDocument.load(bytes), "PDFDocument.load");
    const pages = documentPdf.getPageCount();
    await withTimeout(documentPdf.save(), "PDFDocument.save");
    return { stage: "ok", responses, bytes: bytes.length, pages };
  });
}

async function setLd(page, rows, fileName = "LD_TESTE_CAPA.xlsx") {
  await page.evaluate(({ rows, fileName }) => {
    const worksheet = window.XLSX.utils.aoa_to_sheet(rows);
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, "LD_003");
    const bytes = window.XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = new File([bytes], fileName, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      lastModified: 1727049600000,
    });
    const input = document.querySelector(".cover-file-input input[type=file]");
    const dt = new DataTransfer();
    dt.items.add(file);
    Object.defineProperty(input, "files", { configurable: true, value: dt.files });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { rows, fileName });
  await page.waitForFunction(() => window.GrconCoverDocumentUi?._debug?.state?.ldCount === 1 && !window.GrconCoverDocumentUi._debug.state.busy, null, { timeout: 30000 });
}

async function setSourcePdf(page) {
  await page.evaluate(async () => {
    const documentPdf = await window.PDFLib.PDFDocument.create({ updateMetadata: false });
    const pagePdf = documentPdf.addPage([595, 842]);
    pagePdf.drawText("ORIGINAL QA", { x: 48, y: 780, size: 12 });
    const bytes = await documentPdf.save();
    const file = new File([bytes], "origem-qa.pdf", { type: "application/pdf", lastModified: 1727049600000 });
    const input = document.querySelector(".cover-dropzone input[type=file]");
    const dt = new DataTransfer();
    dt.items.add(file);
    Object.defineProperty(input, "files", { configurable: true, value: dt.files });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(() => window.GrconCoverDocumentUi?._debug?.state?.sourceName === "origem-qa.pdf" && !window.GrconCoverDocumentUi._debug.state.busy, null, { timeout: 20000 });
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outputDir, name), fullPage: false });
}

async function layoutAt(page, width, height = 900) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(120);
  const metrics = await page.evaluate(() => {
    const shell = document.querySelector(".cover-tool-shell");
    const frame = document.querySelector(".cover-preview-frame");
    const iframe = frame?.querySelector("iframe");
    const frameRect = frame?.getBoundingClientRect();
    const iframeRect = iframe?.getBoundingClientRect();
    return {
      shellOverflow: shell ? shell.scrollWidth - shell.clientWidth : 0,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      frameWidth: frameRect ? frameRect.width : 0,
      iframeWidth: iframeRect ? iframeRect.width : 0,
      previewVisible: Boolean(frameRect && frameRect.width > 0 && frameRect.height > 0),
    };
  });
  assert.ok(metrics.shellOverflow <= 1, "Adicionar Capa criou overflow horizontal no shell em " + width + "px.");
  assert.ok(metrics.documentOverflow <= 1, "Adicionar Capa criou overflow horizontal global em " + width + "px.");
  assert.equal(metrics.previewVisible, true);
  assert.ok(metrics.iframeWidth <= metrics.frameWidth + 1, "Preview excedeu o frame em " + width + "px.");
  return metrics;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const uniqueTitle = "POP 01 - PROCEDIMENTO DE REFERÊNCIA";
  const taxonomy = "RHDD-PEX-SMS-EX-REF-SST-PT-0002";
  const documentCode = "PR-5290.00-22313-91B-C1O-002";
  const headers = ["DOCUMENTO", "REVISAO", "TITULO", "DATA EFETIVA DE EMISSAO", "DISCIPLINA", "TIPO DE DOCUMENTO", "TAXONOMIA", "EAP"];

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await revealApp(page);
    await stabilizeServiceWorker(page);
    await revealApp(page);
    await openCover(page);

    const templateProbe = await probePdfTemplate(page);
    console.log("cover_template_probe", JSON.stringify(templateProbe));
    assert.equal(templateProbe.stage, "ok", "Template PDF da capa não passou no probe do Chromium.");
    assert.equal(templateProbe.pages, 1);

    assert.equal(await page.locator("#grcon-cover-document-root").count(), 1);
    assert.equal(await page.locator("#cover-title-search").isDisabled(), true);

    await setLd(page, [
      headers,
      [documentCode, "0", uniqueTitle, "22/09/2026", "SMS", "PR", taxonomy, "1.1.1.1"],
      ["PR-5290.00-22313-91B-C1O-003", "A", "TITULO AMBIGUO", "22/09/2026", "SMS", "PR", "TX-EAP-1", "1.1.1.1"],
      ["PR-5290.00-22313-91B-C1O-004", "A", "TITULO AMBIGUO", "22/09/2026", "SMS", "PR", "TX-EAP-2", "2.2.2.2"],
    ]);

    await page.locator("#cover-title-search").fill(uniqueTitle);
    await page.waitForFunction((code) => window.GrconCoverDocumentUi?._debug?.state?.selectedDocument === code, documentCode, { timeout: 10000 });
    await page.locator("#cover-data-heading").waitFor({ state: "visible" });
    assert.ok((await page.locator(".cover-data-summary").innerText()).includes(taxonomy));

    // Revisão é uma decisão do operador; a LD não preenche esse campo.
    await page.getByRole("button", { name: "Revisar dados da capa" }).click();
    const revisionInput = page.locator(".cover-edit-grid label").filter({ hasText: "Revisão · informe manualmente" }).locator("input");
    await revisionInput.fill("0");
    const today = await page.evaluate(() => {
      const now = new Date();
      const pad = (value) => String(value).padStart(2, "0");
      return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    });
    const dateInput = page.locator(".cover-edit-grid label").filter({ hasText: "Data · preenchida automaticamente hoje" }).locator("input");
    assert.equal(await dateInput.inputValue(), today);
    assert.equal(await dateInput.getAttribute("readonly"), "");

    await setSourcePdf(page);
    const diagnostics = await page.evaluate(() => ({
      debug: window.GrconCoverDocumentUi?._debug?.state || null,
      validations: Array.from(document.querySelectorAll(".cover-validations li")).map((node) => node.textContent?.trim() || ""),
      status: document.querySelector(".cover-status")?.textContent?.trim() || "",
    }));
    console.log("cover_pre_preview", JSON.stringify(diagnostics));
    assert.equal(diagnostics.debug?.validationErrors, 0, "A prévia ficou bloqueada por validações: " + diagnostics.validations.join(" | "));
    await page.waitForFunction(() => {
      const iframe = document.querySelector(".cover-preview-frame iframe");
      const status = document.querySelector(".cover-status")?.textContent || "";
      return Boolean(iframe && iframe.getAttribute("src")?.startsWith("blob:"))
        || status.includes("Não foi possível gerar a prévia da capa:");
    }, null, { timeout: 20000 });
    const previewFailure = await page.locator(".cover-status").innerText();
    assert.ok(!previewFailure.includes("Não foi possível gerar a prévia da capa:"), previewFailure);
    const iframeSrc = await page.locator(".cover-preview-frame iframe").getAttribute("src");
    assert.ok(iframeSrc?.startsWith("blob:"), "A prévia PDF não recebeu URL blob.");

    const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
    await page.getByRole("button", { name: "Gerar PDF" }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /PR-5290\.00-22313-91B-C1O-002/);
    assert.match(download.suggestedFilename(), /REV 0\.pdf$/);

    await screenshot(page, "01-cover-1366.png");

    const longTitle = "POP 01 - PROCEDIMENTO DE REFERÊNCIA COM TÍTULO EXTENSO PARA VALIDAR QUEBRA DE TEXTO E LIMITES VISUAIS SEM ULTRAPASSAR AS BORDAS DA CAPA OFICIAL";
    await page.locator(".cover-edit-grid label").filter({ hasText: "Título" }).locator("input").fill(longTitle);
    await page.waitForTimeout(450);

    const layout = {};
    for (const width of [1366, 1024, 768, 390]) {
      layout[String(width)] = await layoutAt(page, width, width === 390 ? 844 : 900);
      await screenshot(page, "cover-" + width + ".png");
    }

    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    await screenshot(page, "cover-dark-390.png");
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));

    await page.evaluate(() => window.GrconCoverDocumentUi.clear());
    await setLd(page, [
      headers,
      ["PR-5290.00-22313-91B-C1O-003", "A", "TITULO AMBIGUO", "22/09/2026", "SMS", "PR", "TX-EAP-1", "1.1.1.1"],
      ["PR-5290.00-22313-91B-C1O-004", "A", "TITULO AMBIGUO", "22/09/2026", "SMS", "PR", "TX-EAP-2", "2.2.2.2"],
    ], "LD_AMBIGUA.xlsx");
    await page.locator("#cover-title-search").fill("TITULO AMBIGUO");
    await page.waitForFunction(() => document.querySelectorAll(".cover-result").length === 2);
    assert.equal(await page.locator(".cover-result").count(), 2);
    assert.equal(await page.evaluate(() => window.GrconCoverDocumentUi._debug.state.selectedDocument), "");
    await page.setViewportSize({ width: 1366, height: 900 });
    await screenshot(page, "cover-ambiguo-1366.png");

    await page.evaluate(async () => { if ("serviceWorker" in navigator) await navigator.serviceWorker.ready; });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await revealApp(page);
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await revealApp(page);
    await openCover(page);
    assert.equal(await page.locator("#grcon-cover-document-root").count(), 1);
    await context.setOffline(false);

    const filteredErrors = consoleErrors.filter((message) => {
      if (/supabase|ERR_INTERNET_DISCONNECTED|Failed to fetch|net::ERR_/i.test(message)) return false;
      if (/GRCON Storage.*initialize/i.test(message)) return false;
      return true;
    });
    assert.deepEqual(filteredErrors, []);

    const bundle = fs.readFileSync(path.join(process.cwd(), "react-dist/cover-document-app.js"));
    const metrics = {
      passed: true,
      layout,
      bundleKb: Number((bundle.byteLength / 1024).toFixed(2)),
      bundleGzipKb: Number((zlib.gzipSync(bundle).byteLength / 1024).toFixed(2)),
      taxonomy,
      documentCode,
      viewports: [1366, 1024, 768, 390],
      ambiguity: true,
      darkMode: true,
      pdfDownload: true,
      offlineWarmCache: true,
    };
    fs.writeFileSync(path.join(outputDir, "metrics.json"), JSON.stringify(metrics, null, 2));
    console.log("cover_document_browser: ok", JSON.stringify(metrics));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
