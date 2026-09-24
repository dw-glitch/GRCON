const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { chromium } = require("playwright");
const PDFLib = require("../pdf-lib.min.js");

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
      if (!/Execution context was destroyed|navigation|frame was detached/i.test(message)) throw error;
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
    const oldCover = documentPdf.addPage([420, 610]);
    oldCover.drawText("CAPA ANTIGA QA", { x: 48, y: 550, size: 12 });
    const backCover = documentPdf.addPage([500, 700]);
    backCover.drawText("CONTRACAPA ESPECIFICA QA", { x: 48, y: 640, size: 12 });
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
  const headers = ["DOCUMENTO", "REVISAO", "TITULO", "DATA EFETIVA DE EMISSAO", "DISCIPLINA", "TIPO DE DOCUMENTO", "TAXONOMIA INTERNA", "EAP"];
  const visualCases = [
    { code: "PR-5290.00-22313-955-C1O-101", ldRevision: "E", title: "POP CURTO", taxonomy: "TX-1", revision: "0", description: "EMISSÃO ORIGINAL" },
    { code: "PR-5290.00-22313-955-C1O-102", ldRevision: "D", title: "PROCEDIMENTO DE INSPEÇÃO E CONTROLE DE QUALIDADE PARA EQUIPAMENTOS", taxonomy: "RHDD-PEX-SMS-EX-REF-SST-PT-0002", revision: "A", description: "REVISÃO A" },
    { code: "PR-5290.00-22313-955-C1O-103-EXTENSA", ldRevision: "C", title: "PROCEDIMENTO EXTENSO PARA VALIDAR O LIMITE VISUAL DA CÉLULA SEM ULTRAPASSAR BORDAS OU COBRIR LINHAS DO FORMULÁRIO OFICIAL", taxonomy: "RHDD-TAXONOMIA-INTERNA-MUITO-LONGA-PARA-VALIDAR-LIMITE-0002", revision: "B", description: "REVISÃO B" },
  ];

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
      ...visualCases.map((item) => [item.code, item.ldRevision, item.title, "22/09/2026", "SMS", "PR", item.taxonomy, "3.3.3.3"]),
    ]);

    await page.locator("#cover-title-search").fill(uniqueTitle);
    await page.waitForFunction((code) => window.GrconCoverDocumentUi?._debug?.state?.selectedDocument === code, documentCode, { timeout: 10000 });
    await page.locator("#cover-data-heading").waitFor({ state: "visible" });
    assert.ok((await page.locator(".cover-data-summary").innerText()).includes(taxonomy));

    // A revisão é exclusivamente manual: o valor existente na LD não preenche a capa.
    await page.getByRole("button", { name: "Revisar dados da capa" }).click();
    const revisionLabel = page.locator(".cover-edit-grid label").filter({ hasText: "Revisão · informada manualmente" });
    const revisionInput = revisionLabel.locator("input");
    assert.equal(await revisionInput.inputValue(), "");
    await revisionInput.fill("0");
    assert.equal(await revisionInput.inputValue(), "0");
    assert.equal(await revisionLabel.getByRole("button", { name: "Restaurar valor da LD" }).count(), 0);
    const today = await page.evaluate(() => {
      const now = new Date();
      const pad = (value) => String(value).padStart(2, "0");
      return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    });
    const dateInput = page.locator(".cover-edit-grid label").filter({ hasText: "Data · preenchida automaticamente hoje" }).locator("input");
    assert.equal(await dateInput.inputValue(), today);
    assert.equal(await dateInput.getAttribute("readonly"), "");

    await setSourcePdf(page);
    assert.equal(await page.locator('input[name="cover-placement"][value="replace-first-page"]').isChecked(), true);
    assert.equal(await page.evaluate(() => window.GrconCoverDocumentUi._debug.state.coverMode), "replace-first-page");
    const backcoverNote = await page.locator('[data-cover-backcover-state="preserved"]').innerText();
    assert.match(backcoverNote, /Contracapa detectada: a página 2 deste PDF será preservada exatamente como está/);
    const diagnostics = await page.evaluate(() => ({
      debug: window.GrconCoverDocumentUi?._debug?.state || null,
      validations: Array.from(document.querySelectorAll(".cover-validation")).map((node) => node.textContent?.trim() || ""),
      status: document.querySelector(".cover-status")?.textContent?.trim() || "",
    }));
    console.log("cover_pre_preview", JSON.stringify(diagnostics));
    assert.equal(diagnostics.debug?.validationErrors, 0, "A prévia ficou bloqueada por validações: " + diagnostics.validations.join(" | "));
    await page.waitForFunction(() => {
      const iframe = document.querySelector(".cover-preview-frame iframe");
      const status = document.querySelector(".cover-status")?.textContent || "";
      return Boolean(iframe && iframe.getAttribute("src")?.startsWith("blob:"))
        || status.includes("Não foi possível gerar a prévia do documento:");
    }, null, { timeout: 20000 });
    const previewFailure = await page.locator(".cover-status").innerText();
    assert.ok(!previewFailure.includes("Não foi possível gerar a prévia do documento:"), previewFailure);
    const iframeSrc = await page.locator(".cover-preview-frame iframe").getAttribute("src");
    assert.ok(iframeSrc?.startsWith("blob:"), "A prévia PDF não recebeu URL blob.");

    const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
    await page.getByRole("button", { name: "Gerar PDF" }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /PR-5290\.00-22313-91B-C1O-002/);
    assert.match(download.suggestedFilename(), /REV 0\.pdf$/);
    const replacedPdfPath = path.join(outputDir, "resultado-cover-substituicao.pdf");
    await download.saveAs(replacedPdfPath);
    const replacedPdf = await PDFLib.PDFDocument.load(fs.readFileSync(replacedPdfPath));
    assert.equal(replacedPdf.getPageCount(), 2, "Substituir capa deve manter o total original.");
    assert.equal(Math.round(replacedPdf.getPages()[1].getWidth()), 500, "Contracapa específica deve permanecer como página 2.");
    assert.equal(Math.round(replacedPdf.getPages()[1].getHeight()), 700, "Contracapa específica não pode ser redimensionada.");
    const history = await page.evaluate(() => JSON.parse(localStorage.getItem("grcon_cover_document_history_v1") || "[]"));
    assert.equal(history[0]?.coverMode, "replace-first-page");
    assert.equal(history[0]?.revision, "0");

    await screenshot(page, "01-cover-1366.png");

    // O modo alternativo é explícito e só deve ser usado quando o arquivo ainda não tem capa.
    await page.locator('input[name="cover-placement"][value="prepend"]').check();
    await page.waitForFunction(() => window.GrconCoverDocumentUi._debug.state.coverMode === "prepend");
    const prependPromise = page.waitForEvent("download", { timeout: 20000 });
    await page.getByRole("button", { name: "Gerar PDF" }).click();
    const prependDownload = await prependPromise;
    const prependedPdfPath = path.join(outputDir, "resultado-cover-adicionar-antes.pdf");
    await prependDownload.saveAs(prependedPdfPath);
    const prependedPdf = await PDFLib.PDFDocument.load(fs.readFileSync(prependedPdfPath));
    assert.equal(prependedPdf.getPageCount(), 3);
    assert.equal(Math.round(prependedPdf.getPages()[1].getWidth()), 420);
    assert.equal(Math.round(prependedPdf.getPages()[2].getWidth()), 500);
    await page.locator('input[name="cover-placement"][value="replace-first-page"]').check();
    await page.waitForFunction(() => window.GrconCoverDocumentUi._debug.state.coverMode === "replace-first-page");

    const revisionDescriptionInput = page.locator(".cover-edit-grid label").filter({ hasText: "Descrição da revisão" }).locator("input");
    for (const [index, item] of visualCases.entries()) {
      await page.locator("#cover-title-search").fill(item.title);
      await page.waitForFunction((code) => window.GrconCoverDocumentUi?._debug?.state?.selectedDocument === code, item.code, { timeout: 10000 });
      assert.ok((await page.locator(".cover-data-summary").innerText()).includes(item.taxonomy));
      assert.equal(await revisionInput.inputValue(), "", "A revisão da LD não pode preencher a capa ao trocar de documento.");
      await revisionInput.fill(item.revision);
      await revisionDescriptionInput.fill(item.description);
      await page.waitForTimeout(350);
      await page.waitForFunction(() => Boolean(document.querySelector(".cover-preview-frame iframe")));
      const visualDownloadPromise = page.waitForEvent("download", { timeout: 20000 });
      await page.getByRole("button", { name: "Gerar PDF" }).click();
      const visualDownload = await visualDownloadPromise;
      await visualDownload.saveAs(path.join(outputDir, `cover-visual-case-${index + 1}.pdf`));
      await screenshot(page, `cover-visual-case-${index + 1}.png`);
    }
    // Mantém o caso mais exigente selecionado para validar também a responsividade da interface.
    assert.equal(await page.evaluate(() => window.GrconCoverDocumentUi._debug.state.selectedDocument), visualCases[visualCases.length - 1].code);
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
      replaceFirstPage: true,
      backCoverPreserved: true,
      prependMode: true,
      manualRevision: true,
      visualCases: 3,
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
