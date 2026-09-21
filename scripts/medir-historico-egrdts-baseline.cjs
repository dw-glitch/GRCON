"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8764";
const outputDir = path.join(process.cwd(), "artifacts/historico-egrdts-baseline");
fs.mkdirSync(outputDir, { recursive: true });

async function revealApp(page) {
  await page.addStyleTag({ content: [
    "html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script) { visibility: visible !important; }",
    "#grcon-cloud-auth { display: none !important; }",
  ].join("\n") });
}

async function clickHistory(page) {
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('[data-grcon-view="history"]')).find((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none";
    });
    if (!button) throw new Error("Aba Histórico não encontrada.");
    button.click();
  });
  await page.evaluate(async () => window.GRCONModuleLoader?.ensureModule?.("history"));
  await page.locator("#history-search").waitFor({ state: "visible", timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.GrconHistoryUi?.performanceSnapshot));
}

async function installFixture(page, count) {
  await page.evaluate(({ count }) => {
    const pad = (value, size) => String(value).padStart(size, "0");
    const records = Array.from({ length: count }, (_, index) => {
      const sequence = index + 1;
      const year = sequence % 4 === 0 ? 2025 : 2026;
      const family = sequence % 3 === 0 ? "CV" : sequence % 3 === 1 ? "N-1710" : "ET";
      const document = family === "N-1710"
        ? `RL-5290.00-22313-${pad((sequence % 900) + 100, 3)}-C1O-${pad(sequence % 999, 3)}`
        : family === "CV"
          ? `CV-5290.00-${pad(sequence, 6)}`
          : `C1O_RNEST_U32_3.1.1.${(sequence % 9) + 1}_INS_RIR_PI-${pad(sequence, 6)}`;
      return {
        id: `fixture-${sequence}`,
        clientRecordId: `client-fixture-${sequence}`,
        egrdtNumber: `0130870-C1O-PGV-G-${pad(sequence, 4)}-${year} - eGRDT`,
        generatedAt: `${year}-09-${pad((sequence % 20) + 1, 2)}T12:15:00.000Z`,
        outputType: sequence % 2 ? "eGRDT final" : "Primeiras versões",
        ldName: "LD_001.xlsx",
        sourceName: "Fixture baseline",
        files: [{
          document,
          originalName: `${document}.pdf`,
          finalName: `${document}_0001_A.pdf`,
          revision: "A",
          grdtRevision: "A",
          sigemStatus: "Postado",
          allocation: `C1O-ALOC-${pad((sequence % 20) + 1, 3)}-2026`,
          ldPrazo: "E30",
          sheet: family,
          discipline: "DINÂMICOS",
        }],
      };
    });
    localStorage.setItem(window.GrconHistory.STORAGE_KEY, JSON.stringify(records));
    const postings = records.slice(0, 60).map((record, index) => {
      const item = window.GrconSigemPosting.fromHistory(record, { appVersion: "BASELINE" });
      item.status = index % 2 ? window.GrconSigemPosting.STATUSES.POSTADO : window.GrconSigemPosting.STATUSES.PRONTO;
      return item;
    });
    localStorage.setItem(window.GrconSigemPosting.STORAGE_KEY, JSON.stringify(postings));
    window.dispatchEvent(new CustomEvent("grcon:history-updated"));
    window.dispatchEvent(new CustomEvent("grcon:sigem-updated"));
  }, { count });
  await page.waitForFunction((wanted) => window.GrconHistoryUi.performanceSnapshot().totalRecords === wanted, count);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const metrics = {};
  page.on("dialog", (dialog) => dialog.accept());

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await revealApp(page);
    const openStarted = Date.now();
    await clickHistory(page);
    metrics.openModuleMs = Date.now() - openStarted;

    await installFixture(page, 1000);
    await page.waitForFunction(() => document.querySelectorAll("#history-list .history-record").length === 200);
    let snapshot = await page.evaluate(() => window.GrconHistoryUi.performanceSnapshot());
    assert.equal(snapshot.renderedRecords, 200);
    assert.equal(snapshot.totalFiltered, 1000);
    assert.ok(snapshot.postingReadsLastRender <= 1);

    const searchStarted = Date.now();
    await page.locator("#history-search").pressSequentially("0007-2026", { delay: 18 });
    await page.waitForTimeout(180);
    await page.waitForFunction(() => window.GrconHistoryUi.state.filtered.length === 1);
    metrics.searchMs = Date.now() - searchStarted;

    await page.locator("#history-search").fill("");
    await page.waitForTimeout(180);
    const filterStarted = Date.now();
    await page.locator("#history-year").selectOption("2025");
    await page.waitForFunction(() => window.GrconHistoryUi.state.filtered.length > 0);
    metrics.filterMs = Date.now() - filterStarted;
    await page.locator("#history-year").selectOption("");
    await page.waitForTimeout(80);

    const selectStarted = Date.now();
    await page.locator("#history-list .history-record").nth(6).click();
    await page.waitForFunction(() => document.querySelector("#history-detail h3")?.textContent?.includes("0007"));
    metrics.selectMs = Date.now() - selectStarted;
    metrics.detailRenderMs = metrics.selectMs;

    const loadStarted = Date.now();
    await page.locator("[data-history-load-more]").click();
    await page.waitForFunction(() => document.querySelectorAll("#history-list .history-record").length === 400);
    metrics.loadMoreMs = Date.now() - loadStarted;

    await page.locator('[data-history-action="edit"]').click();
    const editStarted = Date.now();
    await page.locator("#history-number-input").fill("1200");
    await page.locator("#history-number-editor").locator('button[type="submit"]').click();
    await page.waitForFunction(() => window.GrconHistoryUi.state.selectedId.includes("-1200-2026"));
    metrics.editNumberMs = Date.now() - editStarted;

    snapshot = await page.evaluate(() => window.GrconHistoryUi.performanceSnapshot());
    metrics.renderedRecords = snapshot.renderedRecords;
    metrics.totalFiltered = snapshot.totalFiltered;
    metrics.postingReadsPerRefresh = snapshot.postingReadsLastRender;

    fs.writeFileSync(path.join(outputDir, "metrics.json"), JSON.stringify({ metrics, snapshot }, null, 2));
    console.log("historico-egrdts-baseline: PASS", metrics);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
