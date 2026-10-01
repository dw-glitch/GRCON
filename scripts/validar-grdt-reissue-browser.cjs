const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";
const outputDir = path.join(process.cwd(), "artifacts/grdt-reissue-browser");
fs.mkdirSync(outputDir, { recursive: true });

function fixture(index) {
  const code = "RL-5290.00-22313-VOL-C1O-" + String(index + 1).padStart(3, "0");
  return {
    id: "reissue-browser-" + index,
    egrdtNumber: "0130870-C1O-PGV-G-" + String(3000 + index).padStart(4, "0") + "-2026 - eGRDT",
    generatedAt: new Date(Date.UTC(2026, 8, 26, 12, index % 60, 0)).toISOString(),
    outputType: "eGRDT final",
    ldName: "LD_VOLUME",
    sourceName: "Fixture Chromium",
    files: [{
      document: code,
      title: "RELATÓRIO DE CONSTRUÇÃO " + String(index + 1),
      originalName: code + "_0001_B.pdf",
      finalName: code + "_0001_B.pdf",
      revision: "B",
      grdtRevision: "B",
      format: "A4",
      discipline: index % 2 ? "CIVIL" : "DINÂMICOS",
      documentType: "RL",
      purpose: "Para Construção",
      databook: "R:\\Databook\\Volume",
    }],
  };
}

const fixtures = Array.from({ length: 240 }, (_, index) => fixture(index));

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
      const supported = await page.evaluate(() => "serviceWorker" in navigator);
      if (!supported) return;
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 15000 });
      await page.waitForTimeout(180);
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
      return;
    } catch (error) {
      lastError = error;
      const message = String(error && error.message ? error.message : error);
      if (!/Execution context was destroyed|navigation|frame was detached|Timeout/i.test(message)) throw error;
      await page.waitForTimeout(150);
    }
  }
  if (lastError) throw lastError;
}

async function validateControlShell(page) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForStableServiceWorkerPage(page).catch(() => {});
  await revealApp(page);

  assert.equal(await page.locator("#sgpar-start").count(), 0, "botão SGPAR removido não pode reaparecer");
  assert.equal(await page.locator("#sgpar-drawer").count(), 0, "drawer SGPAR removido não pode reaparecer");

  await page.waitForFunction(() => Boolean(
    window.GrconEgrdtBatchPlan?.getLimit
    && window.GrconEgrdtBatchPlan?.getMode
    && document.querySelector("#egrdt-batch-limit-save")
  ), null, { timeout: 30000 });

  const advanced = page.locator("#advanced-toggle");
  const panel = page.locator("#advanced-panel");
  if (await panel.getAttribute("hidden") !== null) await advanced.click();
  await panel.waitFor({ state: "visible", timeout: 10000 });

  await page.locator("#egrdt-batch-mode").selectOption("limit-only");
  await page.locator("#egrdt-batch-limit").fill("72");
  await page.locator("#egrdt-batch-limit-save").click();
  await page.waitForFunction(() => window.GrconEgrdtBatchPlan?.getLimit?.() === 72
    && window.GrconEgrdtBatchPlan?.getMode?.() === "limit-only");
  const status72 = await page.locator("#egrdt-batch-limit-status").textContent();
  assert.match(status72 || "", /72/, "Aplicar precisa refletir o limite configurado no Controle");
  assert.match(status72 || "", /Somente limite|Somente por limite/i, "modo sem disciplina deve ficar explícito");

  const layout = await page.evaluate(() => {
    const row = document.querySelector(".source-row");
    const controls = row ? Array.from(row.children).filter((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }) : [];
    const rects = controls.map((node) => {
      const r = node.getBoundingClientRect();
      return { id: node.id || node.className, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
    let overlap = false;
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i], b = rects[j];
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > 1 && y > 1) overlap = true;
      }
    }
    return {
      overlap,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rects,
    };
  });
  assert.equal(layout.overlap, false, "controles da faixa principal não podem se sobrepor");
  assert.ok(layout.overflow <= 2, "Controle de GRDT não deve gerar overflow horizontal da página em desktop");

  await page.screenshot({ path: path.join(outputDir, "controle-desktop-sem-sgpar.png"), fullPage: true });

  await page.locator("#egrdt-batch-mode").selectOption("discipline");
  await page.locator("#egrdt-batch-limit").fill("48");
  await page.locator("#egrdt-batch-limit-save").click();
  await page.waitForFunction(() => window.GrconEgrdtBatchPlan?.getLimit?.() === 48
    && window.GrconEgrdtBatchPlan?.getMode?.() === "discipline");
  return { status72, layout };
}

async function clickVisibleView(page, view) {
  await page.waitForFunction((wanted) => Array.from(document.querySelectorAll('[data-grcon-view="' + wanted + '"]')).some((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }), view, { timeout: 30000 });
  const clicked = await page.evaluate((wanted) => {
    const target = Array.from(document.querySelectorAll('[data-grcon-view="' + wanted + '"]')).find((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    if (!target) return false;
    target.click();
    return true;
  }, view);
  assert.equal(clicked, true);
}

async function openReissue(page) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForStableServiceWorkerPage(page).catch(() => {});
  await revealApp(page);
  const topLevelReissue = page.locator('aside .ops-nav-button[data-grcon-view="grdt-reissue"], nav.grcon-view-tabs > [data-grcon-view="grdt-reissue"]');
  assert.equal(await topLevelReissue.count(), 0, "Repostagem deve existir somente dentro de Ferramentas adicionais");
  await clickVisibleView(page, "additional-tools");
  await page.locator("#additional-tools-module").waitFor({ state: "visible", timeout: 10000 });
  const reissueCard = page.locator('#additional-tools-module .additional-tool-card[data-grcon-view="grdt-reissue"]');
  await reissueCard.waitFor({ state: "visible", timeout: 10000 });
  await reissueCard.click();
  await page.evaluate(async () => {
    if (window.GRCONModuleLoader?.ensureModule) await window.GRCONModuleLoader.ensureModule("grdt-reissue");
  });
  await page.locator("#grdt-reissue-module").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.GrconGrdtReissueUi && window.GrconGrdtReissueCore && window.GrconHistory));
}

async function installFixtures(page) {
  await page.evaluate((rows) => {
    window.__reissueFixtures = rows.map((row) => window.GrconHistory.cleanRecord(row));
    window.__reissueOriginalRead = window.__reissueOriginalRead || window.GrconHistory.read;
    window.GrconHistory.read = () => window.__reissueFixtures.map((record) => ({
      ...record,
      files: record.files.map((file) => ({ ...file })),
      allocations: [...(record.allocations || [])],
    }));
  }, fixtures);
}

async function lookup(page, count) {
  const documents = fixtures.slice(0, count).map((record) => record.files[0].document).join("\n");
  await page.locator("#grdt-reissue-documents").fill(documents);
  const started = Date.now();
  await page.locator("#grdt-reissue-find").click();
  await page.waitForFunction((wanted) => Number(document.querySelector("#grdt-reissue-count-rows")?.textContent || 0) === wanted, count);
  return Date.now() - started;
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.GRCON_CHROMIUM_PATH ? { executablePath: process.env.GRCON_CHROMIUM_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error && error.stack || error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  const metrics = {};
  try {
    const control = await validateControlShell(page);
    metrics.controlBatchApply = control.status72;
    metrics.controlOverflow = control.layout.overflow;
    await openReissue(page);
    await installFixtures(page);
    await page.locator("#grdt-reissue-batch-mode").selectOption("limit-only");

    for (const count of [48, 96, 240]) {
      metrics["lookup" + count + "Ms"] = await lookup(page, count);
      const expected = Math.ceil(count / 48);
      assert.equal(Number(await page.locator("#grdt-reissue-count-batches").textContent()), expected, count + " itens devem gerar " + expected + " lote(s)");
    }
    assert.ok(metrics.lookup240Ms < 7000, "240 linhas devem permanecer interativas; medido " + metrics.lookup240Ms + "ms");

    const interaction = await page.evaluate(() => {
      const wrap = document.querySelector(".grdt-reissue-table-wrap");
      const revision = document.querySelector('[data-row="0"][data-field="revision"]');
      const fileName = document.querySelector('[data-row="0"][data-field="fileName"]');
      if (!wrap || !revision || !fileName) throw new Error("Campos de edição não renderizados");
      revision.focus();
      wrap.scrollTop = 240;
      const beforeScroll = wrap.scrollTop;
      revision.value = "C";
      revision.dispatchEvent(new Event("change", { bubbles: true }));
      const purpose = document.querySelector('[data-row="0"][data-field="purpose"]');
      const afterRevision = {
        focusPreserved: document.activeElement === revision,
        beforeScroll,
        afterScroll: wrap.scrollTop,
        revision: revision.value,
        fileName: fileName.value,
      };
      purpose.value = "CANCELAMENTO";
      purpose.dispatchEvent(new Event("change", { bubbles: true }));
      const describedBy = purpose.getAttribute("aria-describedby");
      const error = describedBy ? document.getElementById(describedBy) : null;
      return {
        ...afterRevision,
        purposeInvalid: purpose.getAttribute("aria-invalid"),
        purposeError: error && !error.hidden ? error.textContent : "",
      };
    });
    assert.equal(interaction.focusPreserved, true, "edição incremental não pode substituir o input focado");
    assert.equal(interaction.afterScroll, interaction.beforeScroll, "edição não pode resetar a rolagem da tabela");
    assert.equal(interaction.revision, "C");
    assert.ok(await page.locator('.grdt-reissue-compliance').count() > 0, 'Repostagem apresenta conformidade antes da geração');
    const compliance = page.locator('[data-reissue-row="0"] .grdt-reissue-compliance');
    await compliance.locator('summary').click();
    assert.match(await compliance.innerText(), /n1710.group4.class.catalog/);
    await compliance.locator('summary').click();
    assert.match(interaction.fileName, /_C\.pdf$/i, "arquivo deve acompanhar a revisão");
    assert.equal(interaction.purposeInvalid, "true");
    assert.match(interaction.purposeError, /PROPÓSITO fora da lista oficial/i);

    await page.screenshot({ path: path.join(outputDir, "desktop-240.png"), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(120);
    const mobile = await page.evaluate(() => {
      const table = document.querySelector(".grdt-reissue-table");
      const row = table && table.querySelector("tbody tr");
      const input = table && table.querySelector("input");
      return {
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        tableDisplay: table ? getComputedStyle(table).display : "",
        rowDisplay: row ? getComputedStyle(row).display : "",
        inputWidth: input ? input.getBoundingClientRect().width : 0,
        viewport: document.documentElement.clientWidth,
      };
    });
    assert.ok(mobile.pageOverflow <= 2, "mobile não deve criar rolagem horizontal da página");
    assert.equal(mobile.tableDisplay, "block");
    assert.equal(mobile.rowDisplay, "grid");
    assert.ok(mobile.inputWidth < mobile.viewport, "inputs devem caber no cartão mobile");
    await page.screenshot({ path: path.join(outputDir, "mobile-240.png"), fullPage: true });

    const unexpectedErrors = errors.filter((message) => {
      if (/GRCON Storage.*initialize/i.test(message) && /módulos de Histórico e Postagem SIGEM ainda não estão disponíveis/i.test(message)) return false;
      if (/supabase|Failed to fetch|net::ERR_/i.test(message)) return false;
      return true;
    });
    assert.equal(unexpectedErrors.length, 0, "console/page errors: " + unexpectedErrors.join("\\n"));
    fs.writeFileSync(path.join(outputDir, "metrics.json"), JSON.stringify({ metrics, interaction, mobile, filteredBootstrapErrors: errors.length - unexpectedErrors.length }, null, 2));
    console.log("OK — Controle de GRDT sem SGPAR e Aplicar 72/48 validado; Repostagem validada no Chromium em 48/96/240 linhas, edição incremental e mobile.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
