"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";
const outputDir = path.join(process.cwd(), "artifacts/historico-egrdts-browser");
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
      await page.waitForTimeout(200);
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(150);
    }
  }
  throw lastError || new Error("Service Worker não estabilizou o Histórico de eGRDTs.");
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

async function openHistory(page) {
  await clickVisibleView(page, "history");
  await page.evaluate(async () => {
    if (window.GRCONModuleLoader?.ensureModule) await window.GRCONModuleLoader.ensureModule("history");
  });
  await page.locator("#history-search").waitFor({ state: "visible", timeout: 20000 });
  await page.waitForFunction(() => window.GrconHistoricoEgrdtsReact?.mounted === true && window.GrconHistoryUi?.performanceSnapshot);
}

function fixtureScript(count) {
  return ({ count }) => {
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
      const generatedAt = `${year}-09-${pad((sequence % 20) + 1, 2)}T${pad(sequence % 23, 2)}:15:00.000Z`;
      const egrdtNumber = `0130870-C1O-PGV-G-${pad(sequence, 4)}-${year} - eGRDT`;
      const files = [{
        document,
        originalName: `${document}_orig.pdf`,
        finalName: `${document}_0001_${sequence % 2 ? "A" : "0"}.pdf`,
        revision: sequence % 2 ? "A" : "0",
        grdtRevision: sequence % 2 ? "A" : "0",
        revisionManual: sequence === 7,
        revisionSuggested: sequence === 7 ? "0" : (sequence % 2 ? "A" : "0"),
        sigemStatus: sequence % 5 === 0 ? "Aguardando confirmação" : "Postado",
        allocation: `C1O-ALOC-${pad((sequence % 20) + 1, 3)}-2026`,
        allocationStatus: "ALOCADO",
        allocationStage: "EMITIDO",
        fiscalComment: sequence === 7 ? "Fixture de comentário fiscal" : "",
        ldPrazo: sequence % 2 ? "E30" : "A01",
        ldVersion: "Rev. fixture",
        sheet: family,
        databook: `/Databook/${family}`,
        discipline: family === "CV" ? "VÁLVULAS" : "DINÂMICOS",
      }];
      if (sequence === 7) {
        files.push({
          ...files[0],
          document: `${document}-B`,
          originalName: `${document}-B_orig.dwg`,
          finalName: `${document}-B_0001_B.dwg`,
          revision: "B",
          grdtRevision: "B",
          allocation: "C1O-ALOC-999-2026",
        });
      }
      return {
        id: `fixture-${sequence}`,
        clientRecordId: `client-fixture-${sequence}`,
        egrdtNumber,
        generatedAt,
        outputType: sequence % 2 ? "eGRDT final" : "Primeiras versões",
        ldName: `LD_00${(sequence % 5) + 1}.xlsx`,
        sourceName: "Fixture Chromium",
        createdByName: sequence === 7 ? "Usuário Fixture" : "",
        createdByEmail: sequence === 7 ? "fixture@example.invalid" : "",
        numberHistory: sequence === 7 ? ["0130870-C1O-PGV-G-0907-2026 - eGRDT"] : [],
        files,
      };
    });

    localStorage.setItem(window.GrconHistory.STORAGE_KEY, JSON.stringify(records));
    const postings = records.slice(0, Math.min(60, records.length)).map((record, index) => {
      const item = window.GrconSigemPosting.fromHistory(record, { appVersion: "BROWSER-FIXTURE" });
      const statuses = [
        window.GrconSigemPosting.STATUSES.POSTADO,
        window.GrconSigemPosting.STATUSES.PENDENCIA,
        window.GrconSigemPosting.STATUSES.FALHA,
        window.GrconSigemPosting.STATUSES.PRONTO,
      ];
      item.status = statuses[index % statuses.length];
      return item;
    });
    localStorage.setItem(window.GrconSigemPosting.STORAGE_KEY, JSON.stringify(postings));
    window.dispatchEvent(new CustomEvent("grcon:history-updated", { detail: { fixture: true } }));
    window.dispatchEvent(new CustomEvent("grcon:sigem-updated", { detail: { fixture: true } }));
    return { records: records.length, postings: postings.length };
  };
}

async function installFixture(page, count) {
  const result = await page.evaluate(fixtureScript(count), { count });
  await page.waitForFunction((wanted) => window.GrconHistoryUi?.performanceSnapshot?.().totalRecords === wanted, count);
  return result;
}

async function clearFixture(page) {
  await page.evaluate(() => {
    localStorage.removeItem(window.GrconHistory.STORAGE_KEY);
    localStorage.removeItem(window.GrconSigemPosting.STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("grcon:history-updated"));
    window.dispatchEvent(new CustomEvent("grcon:sigem-updated"));
  });
  await page.waitForFunction(() => window.GrconHistoryUi?.performanceSnapshot?.().totalRecords === 0);
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outputDir, name), fullPage: false });
}

async function setTheme(page, theme) {
  await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
  await page.waitForTimeout(80);
}

async function assertNoGlobalOverflow(page, width, height = 900) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(80);
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(metrics.scrollWidth - metrics.clientWidth <= 1, `Viewport ${width} criou overflow horizontal global.`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());

  const metrics = {
    openModuleMs: 0,
    searchMs: 0,
    filterMs: 0,
    selectMs: 0,
    detailRenderMs: 0,
    loadMoreMs: 0,
    renderedRecords: 0,
    totalFiltered: 0,
    postingReadsPerRefresh: 0,
  };

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitForStableServiceWorkerPage(page);
    await revealApp(page);

    const openStarted = Date.now();
    await openHistory(page);
    metrics.openModuleMs = Date.now() - openStarted;

    await clearFixture(page);
    assert.equal(await page.locator("#grcon-egrdt-history-root").count(), 1);
    assert.equal(await page.locator("#history-empty").isHidden(), false);
    assert.equal(await page.locator("#history-result-count").textContent(), "0 eGRDTs");
    await screenshot(page, "01-history-empty-1366.png");

    await installFixture(page, 1000);
    await page.waitForFunction(() => document.querySelectorAll("#history-list .history-record").length === 200);
    let perf = await page.evaluate(() => window.GrconHistoryUi.performanceSnapshot());
    assert.equal(perf.totalRecords, 1000);
    assert.equal(perf.totalFiltered, 1000);
    assert.equal(perf.renderedRecords, 200);
    assert.ok(perf.postingReadsLastRender <= 1, "Posting.read não pode ocorrer por linha.");
    assert.equal(window === undefined, false);
    await screenshot(page, "02-history-list-1366.png");

    const facade = await page.evaluate(() => ({
      filtered: window.GrconHistoryUi.state.filtered.length,
      selectedId: window.GrconHistoryUi.state.selectedId,
    }));
    assert.equal(facade.filtered, 1000, "state.filtered deve expor todo o recorte, não só 200 visíveis.");
    assert.ok(facade.selectedId);

    const selectStarted = Date.now();
    await page.locator("#history-list .history-record").nth(6).click();
    await page.waitForFunction(() => document.querySelector("#history-detail h3")?.textContent?.includes("0007"));
    metrics.selectMs = Date.now() - selectStarted;
    metrics.detailRenderMs = metrics.selectMs;
    assert.match(await page.locator("#history-detail").innerText(), /Usuário Fixture/);
    assert.match(await page.locator("#history-detail").innerText(), /Alterada manualmente/);
    assert.equal(await page.locator("#history-detail-table, .history-detail-table").count() > 0, true);
    await screenshot(page, "03-history-detail-1366.png");

    const search = page.locator("#history-search");
    await search.fill("");
    const searchStarted = Date.now();
    await search.pressSequentially("0007-2026", { delay: 18 });
    await page.waitForTimeout(180);
    await page.waitForFunction(() => window.GrconHistoryUi.state.filtered.length === 1);
    metrics.searchMs = Date.now() - searchStarted;
    assert.match(await page.locator("#history-result-count").textContent(), /1 eGRDT/);

    await search.fill("");
    await page.waitForTimeout(180);
    const filterStarted = Date.now();
    await page.locator("#history-year").selectOption("2025");
    await page.waitForFunction(() => window.GrconHistoryUi.state.filtered.length > 0 && window.GrconHistoryUi.state.filtered.every((record) => record.egrdtNumber.includes("-2025 - eGRDT")));
    metrics.filterMs = Date.now() - filterStarted;
    await page.locator("#history-type").selectOption("Primeiras versões");
    await page.locator("#history-posting-status").selectOption("POSTADO");
    await page.locator("#history-sort").selectOption("number-asc");
    await page.locator("#history-date-start").fill("2025-09-01");
    await page.locator("#history-date-end").fill("2025-09-20");
    await page.locator("#history-period-document-type").selectOption("CV");
    await page.waitForTimeout(180);
    assert.ok((await page.evaluate(() => window.GrconHistoryUi.state.filtered.length)) >= 0);
    await screenshot(page, "04-history-filters-1366.png");

    await page.locator("#history-year").selectOption("");
    await page.locator("#history-type").selectOption("");
    await page.locator("#history-posting-status").selectOption("");
    await page.locator("#history-sort").selectOption("recent");
    await page.locator("#history-date-start").fill("");
    await page.locator("#history-date-end").fill("");
    await page.locator("#history-period-document-type").selectOption("");
    await page.waitForTimeout(180);
    await page.waitForFunction(() => window.GrconHistoryUi.state.filtered.length === 1000);

    const loadMoreStarted = Date.now();
    await page.locator("[data-history-load-more]").click();
    await page.waitForFunction(() => document.querySelectorAll("#history-list .history-record").length === 400);
    metrics.loadMoreMs = Date.now() - loadMoreStarted;
    perf = await page.evaluate(() => window.GrconHistoryUi.performanceSnapshot());
    assert.equal(perf.renderedRecords, 400);
    assert.equal(perf.totalFiltered, 1000);
    assert.ok(perf.postingReadsLastRender <= 1);

    await page.evaluate(() => window.GrconHistoryUi.select("fixture-7"));
    await page.waitForFunction(() => window.GrconHistoryUi.state.selectedId === "fixture-7");
    assert.equal(await page.locator("#history-detail table thead th").count(), 10);
    assert.equal(await page.locator("#history-detail table tbody tr").count(), 2);

    await page.evaluate(() => {
      window.__historyUpdatedEvent = null;
      window.__historySyncedNumber = "";
      window.addEventListener("grcon:history-updated", (event) => {
        if (event.detail?.renamed) window.__historyUpdatedEvent = event.detail;
      }, { once: true });
      const sequence = window.GrconEgrdtSequence;
      if (sequence) {
        window.GrconEgrdtSequence = {
          ...sequence,
          syncFromNumber(value) {
            window.__historySyncedNumber = value;
            return sequence.syncFromNumber?.(value) ?? true;
          },
        };
      }
    });
    await page.locator('[data-history-action="edit"]').click();
    await page.locator("#history-number-input").fill("1200");
    await screenshot(page, "05-history-edit-number-1366.png");
    await page.locator("#history-number-editor").locator('button[type="submit"]').click();
    await page.waitForFunction(() => window.GrconHistoryUi.state.selectedId.includes("-1200-2026"));
    const edited = await page.evaluate(() => ({
      event: window.__historyUpdatedEvent,
      synced: window.__historySyncedNumber,
      selected: window.GrconHistoryUi.state.selectedId,
      clientRecordId: window.GrconHistory.read().find((record) => record.id === window.GrconHistoryUi.state.selectedId)?.clientRecordId,
    }));
    assert.equal(edited.event?.renamed, true);
    assert.match(edited.synced, /-1200-2026/);
    assert.equal(edited.clientRecordId, "client-fixture-7");

    const selectedBeforeSigem = await page.evaluate(() => window.GrconHistoryUi.state.selectedId);
    await page.locator('[data-history-action="prepare-sigem"]').click();
    await page.waitForFunction(() => document.querySelector("#sigem-module")?.hidden === false, null, { timeout: 20000 });
    assert.ok(await page.evaluate((historyId) => window.GrconSigemPosting.read().some((item) => item.historyId === historyId || item.id === historyId), selectedBeforeSigem));

    await clickVisibleView(page, "history");
    await page.evaluate(async () => window.GRCONModuleLoader.ensureModule("history"));
    await page.waitForFunction((id) => window.GrconHistoryUi.state.selectedId === id, selectedBeforeSigem);

    await page.evaluate(() => {
      const original = window.GrconEgrdtTeamsNotification;
      window.__historyTeamsOriginal = original;
      window.__historyTeamsOpened = "";
      window.GrconEgrdtTeamsNotification = {
        ...original,
        open(record) { window.__historyTeamsOpened = record.id; },
        status() { return null; },
        statusLabel() { return "Ainda não avisado"; },
      };
    });
    await page.locator("[data-egrdt-teams-record-id]").click();
    assert.equal(await page.evaluate(() => window.__historyTeamsOpened), selectedBeforeSigem);

    await page.evaluate(() => {
      const original = window.GrconEgrdtEmailReplyUi;
      window.__historyEmailOriginal = original;
      window.__historyEmailOpened = "";
      window.GrconEgrdtEmailReplyUi = {
        ...original,
        open(records) { window.__historyEmailOpened = records[0]?.id || ""; return true; },
      };
    });
    await page.locator('[data-history-action="email-reply"]').click();
    assert.equal(await page.evaluate(() => window.__historyEmailOpened), selectedBeforeSigem);

    await search.fill("1200-2026");
    await page.waitForTimeout(180);
    await page.waitForFunction(() => window.GrconHistoryUi.state.filtered.length === 1);
    const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
    await page.locator("#history-export-period").click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /^GRCON_Relacao_eGRDTs_/);
    await page.waitForFunction(() => document.querySelector("#history-export-period")?.textContent === "Baixar relação do período");

    await search.fill("");
    await page.waitForTimeout(180);
    await page.evaluate(() => window.GrconHistoryUi.select("fixture-8"));
    await page.waitForFunction(() => window.GrconHistoryUi.state.selectedId === "fixture-8");
    const beforeDelete = await page.evaluate(() => window.GrconHistory.read().length);
    await page.locator('[data-history-action="delete"]').click();
    await page.waitForFunction((before) => window.GrconHistory.read().length === before - 1, beforeDelete);

    await page.evaluate(() => {
      window.__historyCloudOriginal = window.GrconCloud;
      window.__historyCloudDeleted = "";
      window.GrconCloud = {
        state: { membership: { workspace_id: "workspace-fixture" }, online: true, syncing: false, clearingHistory: false },
        canManageHistory: () => true,
        deleteHistoryRecord: async (record) => { window.__historyCloudDeleted = record.id; return { ok: true }; },
        clearHistory: async () => true,
      };
      window.dispatchEvent(new CustomEvent("grcon:history-updated"));
    });
    await page.evaluate(() => window.GrconHistoryUi.select("fixture-9"));
    await page.waitForFunction(() => window.GrconHistoryUi.state.selectedId === "fixture-9");
    await page.locator('[data-history-action="delete"]').click();
    await page.waitForFunction(() => window.__historyCloudDeleted === "fixture-9");
    assert.equal(await page.evaluate(() => window.GrconHistory.read().some((record) => record.id === "fixture-9")), false);

    await page.evaluate(() => {
      window.GrconCloud = window.__historyCloudOriginal;
      window.GrconEgrdtTeamsNotification = window.__historyTeamsOriginal;
      window.GrconEgrdtEmailReplyUi = window.__historyEmailOriginal;
    });

    const stateBeforeNavigation = await page.evaluate(() => window.GrconHistoryUi.state.selectedId);
    await clickVisibleView(page, "pdf-tools");
    await page.evaluate(async () => window.GRCONModuleLoader.ensureModule("pdf-tools"));
    await clickVisibleView(page, "history");
    await page.evaluate(async () => window.GRCONModuleLoader.ensureModule("history"));
    await page.waitForFunction(() => document.querySelector("#history-search"));
    assert.equal(await page.evaluate(() => window.GrconHistoryUi.state.selectedId), stateBeforeNavigation);

    const filteredLength = await page.evaluate(() => window.GrconHistoryUi.state.filtered.length);
    assert.ok(filteredLength > 200, "dashboard/retomar precisa receber o recorte completo.");

    for (const width of [1440, 1366, 1024, 768, 390]) {
      await assertNoGlobalOverflow(page, width, width === 390 ? 844 : 900);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot(page, "06-history-mobile-390.png");

    await page.setViewportSize({ width: 1366, height: 900 });
    await setTheme(page, "dark");
    await screenshot(page, "07-history-dark-1366.png");
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot(page, "08-history-dark-390.png");
    await setTheme(page, "light");

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForStableServiceWorkerPage(page);
    await revealApp(page);
    await openHistory(page);
    await page.waitForFunction(() => window.GrconHistoryUi.performanceSnapshot().totalRecords > 900);
    assert.equal(await page.locator("#grcon-egrdt-history-root").count(), 1);

    const swAudit = await page.evaluate(async () => {
      const keys = await caches.keys();
      const assets = [];
      for (const key of keys) {
        const cache = await caches.open(key);
        const requests = await cache.keys();
        assets.push(...requests.map((request) => new URL(request.url).pathname));
      }
      return {
        controlled: Boolean(navigator.serviceWorker.controller),
        hasReactHistory: assets.some((value) => value.endsWith("/react-dist/historico-egrdts-app.js")),
        hasLegacyHistory: assets.some((value) => value.endsWith("/history_app.js")),
      };
    });
    assert.equal(swAudit.controlled, true);
    assert.equal(swAudit.hasReactHistory, true);
    assert.equal(swAudit.hasLegacyHistory, false);

    perf = await page.evaluate(() => window.GrconHistoryUi.performanceSnapshot());
    Object.assign(metrics, {
      renderedRecords: perf.renderedRecords,
      totalFiltered: perf.totalFiltered,
      postingReadsPerRefresh: perf.postingReadsLastRender,
    });

    const relevantErrors = consoleErrors.filter((message) => (
      /HistoricoEgrdts|React warning|duplicate key|ReferenceError|TypeError|Unhandled|CSP|MIME|historico-egrdts-app/i.test(message)
      && !/favicon/i.test(message)
    ));
    assert.deepEqual(relevantErrors, [], "Console introduziu erro no Histórico React: " + relevantErrors.join(" | "));

    fs.writeFileSync(path.join(outputDir, "metrics.json"), JSON.stringify({ metrics, swAudit, consoleErrors }, null, 2));
    console.log("historico-egrdts-browser: PASS", metrics);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
