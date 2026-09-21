"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const XLSX = require("../xlsx.full.min.js");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";
const outputDir = path.join(process.cwd(), "artifacts/sigem-pw-react");
const fixtureDir = path.join(process.cwd(), "artifacts/sigem-pw-fixtures");
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(fixtureDir, { recursive: true });

const et = (id) => `C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-${id}`;
const n1710 = "RL-5290.00-22313-ABC-C1O-001";
const revisionDoc = et("009999");

function writeFixtures() {
  const ldFile = path.join(fixtureDir, "LD_QUALIDADE.xlsx");
  const sigemFile = path.join(fixtureDir, "CONSULTA_GERAL.xlsx");
  const pwFile = path.join(fixtureDir, "PROJECTWISE.csv");

  const ldBook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(ldBook, XLSX.utils.aoa_to_sheet([
    ["ITEM", "DOCUMENTO", "REVISÃO", "TÍTULO"],
    ["1", n1710, "0", "Documento N-1710 de teste"],
  ]), "N-1710");
  fs.writeFileSync(ldFile, XLSX.write(ldBook, { type: "buffer", bookType: "xlsx" }));

  const sigemRows = [
    ["DOCUMENTO", "REVISÃO", "STATUS", "TIPO DE DOCUMENTO"],
    [revisionDoc, "0", "Postado", "RIR"],
    [revisionDoc, "A", "Postado", "RIR"],
    [revisionDoc, "B", "Postado", "RIR"],
  ];
  for (let index = 0; index < 247; index += 1) {
    sigemRows.push([et(String(100000 + index).padStart(6, "0")), "0", "Postado", "RIR"]);
  }
  sigemRows.push([et("200001"), "0", "Postado", "RIR"]);
  sigemRows.push([et("200002"), "0", "Postado", "RIR"]);
  sigemRows.push([n1710, "0", "Postado", "RL"]);
  const sigemBook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(sigemBook, XLSX.utils.aoa_to_sheet(sigemRows), "Consulta Geral");
  fs.writeFileSync(sigemFile, XLSX.write(sigemBook, { type: "buffer", bookType: "xlsx" }));

  const header = "NumeroDocumentoCliente;RevisaoCompleta;Revisao;TipoDocumento;TipoDocumentoDesc;Disciplina;DisciplinaDesc;o_statename;Última emissão;datacriacao";
  const rows = [
    [et("200001"),"0","0","RIR","Relatório","INS","Instrumentação","Cadastrado","Previsto","20/09/2026"],
    [et("200002"),"0","0","RIR","Relatório","INS","Instrumentação","Liberado","Sim","20/09/2026"],
    [et("200003"),"0","0","RIR","Relatório","INS","Instrumentação","Cadastrado","Previsto","20/09/2026"],
    [et("200004"),"0","0","RIR","Relatório","INS","Instrumentação","Liberado","Sim","20/09/2026"],
    [n1710,"0","0","RL","Relatório","QUA","Qualidade","Liberado","Sim","20/09/2026"],
  ];
  fs.writeFileSync(pwFile, [header, ...rows.map((row) => row.join(";"))].join("\n"), "utf8");
  return { ldFile, sigemFile, pwFile };
}

async function waitForStablePage(page) {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
      await page.waitForFunction(() => Boolean(navigator.serviceWorker && navigator.serviceWorker.controller), null, { timeout: 15000 });
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
  throw lastError || new Error("Service Worker não estabilizou o Dashboard SIGEM × PW.");
}
async function exposeApp(page) {
  await page.addStyleTag({ content: [
    "html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script) { visibility: visible !important; }",
    "#grcon-cloud-auth { display: none !important; }",
  ].join("\n") });
}
async function clickSpw(page) {
  await page.waitForFunction(() => Array.from(document.querySelectorAll("[data-spw-open]")).some((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }), null, { timeout: 30000 });
  const clicked = await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll("[data-spw-open]")).find((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });
    if (!target) return false;
    target.click();
    return true;
  });
  assert.equal(clicked, true);
  await page.locator("#grcon-sigem-pw-root").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.GrconSigemPwDashboardUi?.state?.ready) && !window.GrconSigemPwDashboardUi.state.busy, null, { timeout: 30000 });
}
async function openDashboard(page) {
  const started = Date.now();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForStablePage(page);
  await exposeApp(page);
  await clickSpw(page);
  return Date.now() - started;
}
async function waitIdle(page) {
  await page.waitForFunction(() => Boolean(window.GrconSigemPwDashboardUi?.state?.ready) && !window.GrconSigemPwDashboardUi.state.busy, null, { timeout: 30000 });
}
async function importFile(page, selector, file) {
  const started = Date.now();
  await page.locator(selector).setInputFiles(file);
  await page.waitForFunction(() => Boolean(window.GrconSigemPwDashboardUi?.state?.busy), null, { timeout: 5000 }).catch(() => undefined);
  await waitIdle(page);
  return Date.now() - started;
}
async function resetDashboard(page) {
  await page.evaluate(async () => {
    const core = window.GrconSigemPwDashboard;
    const history = window.GrconSigemPwHistory;
    if (!core || !history) throw new Error("runtime SIGEM×PW ausente");
    await history.clearHistory();
    const empty = { meta: null, records: [] };
    await core.kvSetMany([
      [core.SIGEM_BASE_KEY, empty],
      [core.PW_BASE_KEY, empty],
      [core.LD_BASE_KEY, empty],
      [core.HISTORY_KEY, { version: core.HISTORY_VERSION, snapshots: [], deletedIds: [] }],
      [core.LEGACY_SIGEM_BASE_KEY, empty],
      [core.LEGACY_PW_BASE_KEY, empty],
    ]);
    await window.GrconSigemPwDashboardUi.refresh("browser-reset");
  });
  await waitIdle(page);
}
async function clickView(page, view) {
  const ok = await page.evaluate((wanted) => {
    const nodes = Array.from(document.querySelectorAll(`[data-grcon-view="${wanted}"]`));
    const target = nodes.find((node) => {
      const r = node.getBoundingClientRect();
      const s = getComputedStyle(node);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    });
    if (!target) return false;
    target.click();
    return true;
  }, view);
  assert.equal(ok, true, `navegação ${view} deve existir`);
}

(async () => {
  const fixtures = writeFixtures();
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const badResponses = [];
  const metrics = {};
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: "allow", acceptDownloads: true });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push("pageerror: " + error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push("console: " + message.text()); });
    page.on("response", (response) => {
      if (response.status() >= 400 && /sigem|react-dist|worker|service|\.css/i.test(response.url())) badResponses.push(response.status() + " " + response.url());
    });

    metrics.openModuleMs = await openDashboard(page);
    assert.equal(await page.locator("#grcon-sigem-pw-root").count(), 1);
    assert.equal(await page.evaluate(() => Boolean(window.GrconSigemPwDashboardReact?.mounted)), true);
    assert.equal(await page.evaluate(() => Boolean(window.GrconSigemPwDashboardUi?.state)), true);
    assert.equal(await page.evaluate(() => window.GrconSigemPwDashboardUi.state.readiness?.status), "empty");
    await page.screenshot({ path: path.join(outputDir, "01-sigem-pw-empty-1366.png"), fullPage: true });

    await importFile(page, "#spw-ld-file", fixtures.ldFile);
    assert.deepEqual(await page.evaluate(() => ({
      sigem: Boolean(window.GrconSigemPwDashboardUi.state.sigem.meta),
      pw: Boolean(window.GrconSigemPwDashboardUi.state.pw.meta),
      ld: Boolean(window.GrconSigemPwDashboardUi.state.ld.meta),
      status: window.GrconSigemPwDashboardUi.state.readiness?.status,
    })), { sigem: false, pw: false, ld: true, status: "partial" });

    await resetDashboard(page);
    metrics.importSigemOnlyMs = await importFile(page, "#spw-sigem-file", fixtures.sigemFile);
    assert.deepEqual(await page.evaluate(() => ({
      sigem: Boolean(window.GrconSigemPwDashboardUi.state.sigem.meta),
      pw: Boolean(window.GrconSigemPwDashboardUi.state.pw.meta),
      ld: Boolean(window.GrconSigemPwDashboardUi.state.ld.meta),
    })), { sigem: true, pw: false, ld: false });

    await resetDashboard(page);
    metrics.importPwOnlyMs = await importFile(page, "#spw-pw-file", fixtures.pwFile);
    assert.deepEqual(await page.evaluate(() => ({
      sigem: Boolean(window.GrconSigemPwDashboardUi.state.sigem.meta),
      pw: Boolean(window.GrconSigemPwDashboardUi.state.pw.meta),
      ld: Boolean(window.GrconSigemPwDashboardUi.state.ld.meta),
    })), { sigem: false, pw: true, ld: false });

    await resetDashboard(page);
    await importFile(page, "#spw-ld-file", fixtures.ldFile);

    await page.evaluate(() => {
      window.__spwTicks = 0;
      window.__spwTickTimer = window.setInterval(() => { window.__spwTicks += 1; }, 20);
    });
    metrics.importSigemMs = await importFile(page, "#spw-sigem-file", fixtures.sigemFile);
    const ticksAfterSigem = await page.evaluate(() => {
      clearInterval(window.__spwTickTimer);
      return window.__spwTicks;
    });
    assert.ok(ticksAfterSigem > 0, "a thread principal deve continuar executando tarefas durante import/modelo");

    metrics.importPwMs = await importFile(page, "#spw-pw-file", fixtures.pwFile);
    await page.waitForSelector("#spw-revision-section", { timeout: 30000 });
    await page.screenshot({ path: path.join(outputDir, "02-sigem-pw-bases-1366.png"), fullPage: true });

    const summary = await page.evaluate(() => window.GrconSigemPwDashboardUi.state.aggregates.all.summary);
    assert.equal(summary.sigemOnly, 250);
    assert.equal(summary.bothNotEmitted, 1);
    assert.equal(summary.bothEmitted, 2);
    assert.equal(summary.pwOnlyNotEmitted, 1);
    assert.equal(summary.pwOnlyEmitted, 1);
    assert.equal(summary.classifiedTotal, 255);
    const revisionCount = await page.evaluate((doc) => window.GrconSigemPwDashboardUi.state.aggregates.all.lists.sigemOnly.filter((row) => row.document === doc).length, revisionDoc);
    assert.equal(revisionCount, 3, "0/A/B precisam continuar como três ocorrências");
    await page.screenshot({ path: path.join(outputDir, "03-sigem-pw-results-1366.png"), fullPage: true });

    const generationBeforeClassSwitch = await page.evaluate(() => window.GrconSigemPwDashboardUi.state.modelGeneration);
    let started = Date.now();
    await page.locator("#spw-class").selectOption("ET");
    await page.waitForFunction(() => window.GrconSigemPwDashboardUi.state.filters.documentClass === "ET");
    metrics.classSwitchMs = Date.now() - started;
    assert.equal(await page.evaluate(() => window.GrconSigemPwDashboardUi.state.modelGeneration), generationBeforeClassSwitch, "troca de classe não reconstrói o modelo");
    await page.screenshot({ path: path.join(outputDir, "04-sigem-pw-filter-et-1366.png"), fullPage: true });
    await page.locator("#spw-class").selectOption("");

    await page.locator('[data-list="sigemOnly"]').click();
    await page.waitForFunction(() => window.GrconSigemPwDashboardUi.state.activeList === "sigemOnly");
    assert.equal(await page.locator("#spw-table tbody tr").count(), 100);
    assert.match(await page.locator("#spw-page-info").innerText(), /250/);
    await page.screenshot({ path: path.join(outputDir, "05-sigem-pw-list-1366.png"), fullPage: true });

    started = Date.now();
    await page.locator("#spw-query").focus();
    await page.locator("#spw-query").pressSequentially("009999", { delay: 20 });
    await page.waitForFunction(() => window.GrconSigemPwDashboardUi.state.filters.query === "009999", null, { timeout: 5000 });
    await page.waitForTimeout(220);
    metrics.filterMs = Date.now() - started;
    assert.equal(await page.locator("#spw-table tbody tr").count(), 3);
    await page.locator("#spw-clear").click();
    await page.waitForFunction(() => window.GrconSigemPwDashboardUi.state.filters.query === "");

    started = Date.now();
    await page.locator("#spw-next").click();
    await page.waitForFunction(() => window.GrconSigemPwDashboardUi.state.page === 2);
    metrics.pageChangeMs = Date.now() - started;
    assert.match(await page.locator("#spw-page-info").innerText(), /página 2/);
    await page.locator("#spw-prev").click();

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#spw-export").click();
    const download = await downloadPromise;
    const exportPath = path.join(fixtureDir, "sigem-pw-export.xlsx");
    await download.saveAs(exportPath);
    const exported = XLSX.read(fs.readFileSync(exportPath), { type: "buffer" });
    const exportedRows = XLSX.utils.sheet_to_json(exported.Sheets[exported.SheetNames[0]], { defval: "" });
    assert.equal(exportedRows.length, 250, "exportação deve incluir todas as páginas filtradas");

    const oldSigemDate = await page.evaluate(() => window.GrconSigemPwDashboardUi.state.sigem.meta.importedAt);
    await page.locator('[data-edit-base-date="sigem"]').click();
    await page.locator("#spw-date-input").fill("2026-09-20T08:30");
    await page.locator("#spw-date-save").click();
    await waitIdle(page);
    const sigemDate = await page.evaluate(() => ({
      importedAt: window.GrconSigemPwDashboardUi.state.sigem.meta.importedAt,
      sourceImportedAt: window.GrconSigemPwDashboardUi.state.sigem.meta.sourceImportedAt,
    }));
    assert.notEqual(sigemDate.importedAt, oldSigemDate);
    assert.equal(Boolean(sigemDate.sourceImportedAt), true);

    const oldPwDate = await page.evaluate(() => window.GrconSigemPwDashboardUi.state.pw.meta.importedAt);
    await page.locator('[data-edit-base-date="pw"]').click();
    await page.locator("#spw-date-input").fill("2026-09-20T09:30");
    await page.locator("#spw-date-save").click();
    await waitIdle(page);
    assert.notEqual(await page.evaluate(() => window.GrconSigemPwDashboardUi.state.pw.meta.importedAt), oldPwDate);

    await page.locator("#spw-history-open").click();
    await page.locator("#spw-base-history").waitFor({ state: "visible" });
    assert.ok(await page.locator(".spw-history-row").count() >= 3);
    await page.screenshot({ path: path.join(outputDir, "06-sigem-pw-history-dialog-1366.png"), fullPage: true });
    await page.locator("#spw-base-history-close").click();

    await importFile(page, "#spw-pw-file", fixtures.pwFile);
    await page.locator("#spw-history-open").click();
    await page.locator("#spw-base-history").waitFor({ state: "visible" });
    const pwRows = page.locator(".spw-history-row").filter({ hasText: "PW" });
    const beforeDelete = await pwRows.count();
    let deleted = false;
    for (let i = 0; i < beforeDelete; i += 1) {
      const row = pwRows.nth(i);
      if (await row.locator(".spw-current").count()) continue;
      page.once("dialog", (dialog) => dialog.accept());
      await row.getByRole("button", { name: "Excluir" }).click();
      deleted = true;
      break;
    }
    assert.equal(deleted, true, "deve existir snapshot PW histórico removível");
    await page.waitForTimeout(200);
    await page.locator("#spw-base-history-close").click().catch(() => undefined);

    await page.locator("#spw-evolution-open").click();
    await page.locator("#spw-evolution-section").waitFor({ state: "visible", timeout: 30000 });
    assert.ok(await page.locator("#spw-revision-section").count() === 1);

    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await page.screenshot({ path: path.join(outputDir, "07-sigem-pw-mobile-390.png"), fullPage: true });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await page.screenshot({ path: path.join(outputDir, "08-sigem-pw-dark-1366.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(outputDir, "09-sigem-pw-dark-390.png"), fullPage: true });
    await page.evaluate(() => { document.documentElement.dataset.theme = ""; });

    const widths = {};
    for (const width of [1440,1366,1024,768,390]) {
      await page.setViewportSize({ width, height: 900 });
      widths[width] = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
        tableScroll: document.querySelector("#spw-table")?.scrollWidth || 0,
        tableClient: document.querySelector("#spw-table")?.clientWidth || 0,
      }));
      assert.ok(widths[width].page <= widths[width].viewport + 1, `overflow global em ${width}px`);
    }

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.evaluate(() => { window.__spwModelRef = window.GrconSigemPwDashboardUi.state.model; });
    await clickView(page, "control");
    await clickSpw(page);
    assert.equal(await page.evaluate(() => window.__spwModelRef === window.GrconSigemPwDashboardUi.state.model), true, "reabertura não deve reconstruir modelo sem mudança");
    assert.equal(await page.locator("#grcon-sigem-pw-root").count(), 1);
    await clickView(page, "analysis-history");
    await clickSpw(page);
    assert.equal(await page.locator("#grcon-sigem-pw-root").count(), 1);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForStablePage(page);
    await exposeApp(page);
    await clickSpw(page);
    assert.equal(await page.evaluate(() => Boolean(window.GrconSigemPwDashboardUi.state.sigem.meta && window.GrconSigemPwDashboardUi.state.pw.meta && window.GrconSigemPwDashboardUi.state.ld.meta)), true);
    const caches = await page.evaluate(async () => await window.caches.keys());
    assert.ok(caches.some((key) => key.includes("phase-a-sigem-pw-react1")));

    const relevantErrors = errors.filter((item) => /ReferenceError|TypeError|Unhandled|React|duplicate key|Content Security Policy|CSP|Worker|MIME|service worker/i.test(item));
    assert.deepEqual(relevantErrors, []);
    assert.deepEqual(badResponses, []);

    fs.writeFileSync(path.join(outputDir, "metrics.json"), JSON.stringify({
      ...metrics,
      widths,
      ticksDuringSigemImport: ticksAfterSigem,
      caches,
      errors,
      badResponses,
    }, null, 2));
    console.log(JSON.stringify({ passed: true, metrics, widths, caches, errors, badResponses }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
