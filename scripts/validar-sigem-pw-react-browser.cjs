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

async function installRevisionFixture(page, bulkCount = 250) {
  await page.evaluate(({ count }) => {
    const dashboard = window.GrconSigemPwDashboard;
    const dashboardUi = window.GrconSigemPwDashboardUi;
    if (!dashboard?.createModel || !dashboardUi?.state || !window.GrconSigemPwRevisionUi) throw new Error("runtime de Revisões indisponível");

    if (!Object.prototype.hasOwnProperty.call(window, "__revisionOriginalDashboardModel")) {
      window.__revisionOriginalDashboardModel = dashboardUi.state.model;
    }

    const sigemDoc = (id) => `C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-${id}`;
    const pwDoc = (id) => `C1O-RNEST-U32-3.1.1.1-INS-RIR-PI-${id}`;
    const sigem = [];
    const pw = [];
    const addS = (id, revision, status = "Em Workflow") => sigem.push({ document: sigemDoc(id), revision, status });
    const addP = (id, revision, state = "Liberado", lastEmission = "Sim") => pw.push({ document: pwDoc(id), revision, revisionComplete: revision, state, lastEmission });

    addS("910001", "B"); addP("910001", "B");
    addS("910002", "B"); addP("910002", "A");
    addS("910003", "B");
    addS("910004", "B"); addP("910004", "A"); addP("910004", "B", "Cadastrado", "Previsto");
    addS("910005", "A"); addP("910005", "A"); addP("910005", "B");
    addS("910006", "X-1"); addP("910006", "Y-2", "Cadastrado", "Previsto");
    addS("910007", "0", "Recusado"); addS("910007", "A", "Com Comentários"); addS("910007", "B");
    addP("910007", "0", "Superado", "Não"); addP("910007", "A");

    const n1710 = "RL-5290.00-22313-ABC-C1O-777";
    sigem.push({ document: n1710, revision: "0", status: "Postado" });
    pw.push({ document: n1710, revision: "0", revisionComplete: "0", state: "Liberado", lastEmission: "Sim" });

    for (let index = 0; index < count; index += 1) {
      addS(String(920000 + index).padStart(6, "0"), "B");
    }

    const model = dashboard.createModel(sigem, pw);
    window.__revisionControlledModel = model;
    dashboardUi.state.model = model;
  }, { count: bulkCount });
  await page.evaluate(async () => { await window.GrconSigemPwRevisionUi.refresh(); });
  await page.waitForFunction(() => Boolean(window.GrconSigemPwRevisionUi?.state?.analysis) && !window.GrconSigemPwRevisionUi.state.progress?.active, null, { timeout: 30000 });
}

async function restoreRevisionModel(page) {
  await page.evaluate(async () => {
    if (!window.GrconSigemPwDashboardUi?.state || !window.GrconSigemPwRevisionUi) return;
    if (Object.prototype.hasOwnProperty.call(window, "__revisionOriginalDashboardModel")) {
      window.GrconSigemPwDashboardUi.state.model = window.__revisionOriginalDashboardModel;
      await window.GrconSigemPwRevisionUi.refresh();
    }
  });
}

async function setRevisionDocumentList(page, value) {
  await page.locator("#spw-rev-document-list").evaluate((node, nextValue) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(node, nextValue);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function resetRevisionFilters(page) {
  await page.locator("#spw-rev-filter-situation").selectOption("attention");
  await page.locator("#spw-rev-filter-class").selectOption("");
  const advanced = page.locator(".spw-rev-advanced");
  if (await advanced.count()) await advanced.evaluate((node) => { node.open = true; });
  await page.locator("#spw-rev-filter-sigem-rev").selectOption("");
  await page.locator("#spw-rev-filter-pw-rev").selectOption("");
  await page.locator("#spw-rev-filter-sigem-status").selectOption("");
  await page.locator("#spw-rev-filter-pw-status").selectOption("");
  await page.locator("#spw-rev-search").fill("");
  await setRevisionDocumentList(page, "");
  if (await advanced.count()) await advanced.evaluate((node) => { node.open = false; });
  await page.waitForTimeout(230);
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

    await page.waitForFunction(() => Boolean(window.GrconSigemPwRevisionUi?.state?.active), null, { timeout: 30000 });
    await page.locator("#spw-revision-section").waitFor({ state: "visible", timeout: 30000 });
    await page.evaluate(async () => {
      window.__revisionEmptyOriginalModel = window.GrconSigemPwDashboardUi.state.model;
      window.GrconSigemPwDashboardUi.state.model = null;
      await window.GrconSigemPwRevisionUi.refresh();
    });
    assert.match(await page.locator("#spw-rev-table-wrap").innerText(), /Carregue as bases para analisar as revisões/i);
    await page.screenshot({ path: path.join(outputDir, "01-revision-empty-1366.png"), fullPage: true });
    await page.evaluate(async () => {
      window.GrconSigemPwDashboardUi.state.model = window.__revisionEmptyOriginalModel;
      await window.GrconSigemPwRevisionUi.refresh();
    });

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

    await page.locator('[data-summary-list="bothEmitted"]').click();
    await page.waitForFunction(() => window.GrconSigemPwDashboardUi.state.activeList === "bothEmitted");
    assert.equal(await page.locator("#spw-table tbody tr").count(), 2, "KPI da FASE B deve filtrar a relação detalhada sem recalcular o modelo");
    assert.equal(await page.locator('[data-summary-list="bothEmitted"]').getAttribute("aria-pressed"), "true");
    await page.screenshot({ path: path.join(outputDir, "03a-sigem-pw-kpi-filter-1366.png"), fullPage: true });
    await page.locator('[data-list="all"]').click();
    await page.waitForFunction(() => window.GrconSigemPwDashboardUi.state.activeList === "all");

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

    // FASE B — Situação das Revisões: paridade funcional + modernização visual/UX.
    const revisionActivationStart = Date.now();
    await installRevisionFixture(page, 250);
    metrics.revisionActivationMs = Date.now() - revisionActivationStart;
    metrics.revisionAnalysisMs = await page.evaluate(() => window.GrconSigemPwRevisionUi.state.analysis?.metrics?.durationMs || 0);
    await resetRevisionFilters(page);

    const revisionSituationMap = await page.evaluate(() => {
      const rows = window.GrconSigemPwRevisionUi.state.analysis.rows;
      const pick = (needle) => rows.find((row) => row.document.includes(needle))?.situation || "";
      return {
        updated: pick("910001"),
        previous: pick("910002"),
        notFound: pick("910003"),
        awaiting: pick("910004"),
        ahead: pick("910005"),
        review: pick("910006"),
        history: pick("910007"),
        n1710: rows.find((row) => row.document.includes("22313-ABC-C1O-777"))?.situation || "",
      };
    });
    assert.deepEqual(revisionSituationMap, {
      updated: "updated",
      previous: "pw-previous",
      notFound: "pw-not-found",
      awaiting: "pw-awaiting-emission",
      ahead: "pw-ahead",
      review: "review",
      history: "pw-previous",
      n1710: "updated",
    });

    const revisionCounts = await page.evaluate(() => window.GrconSigemPwRevisionUi.state.analysis.counts);
    assert.equal(await page.locator(".spw-rev-card").count(), 5);
    assert.equal(Number((await page.locator('[data-spw-rev-situation="updated"] strong').innerText()).replace(/\D/g, "")), revisionCounts.updated);
    assert.equal(Number((await page.locator('[data-spw-rev-situation="pw-previous"] strong').innerText()).replace(/\D/g, "")), revisionCounts.previous);
    assert.equal(Number((await page.locator('[data-spw-rev-situation="pw-not-found"] strong').innerText()).replace(/\D/g, "")), revisionCounts.notFound);
    assert.equal(Number((await page.locator('[data-spw-rev-situation="pw-awaiting-emission"] strong').innerText()).replace(/\D/g, "")), revisionCounts.awaitingEmission);
    assert.equal(Number((await page.locator('[data-spw-rev-situation="other"] strong').innerText()).replace(/\D/g, "")), revisionCounts.pwAhead + revisionCounts.review);
    await page.screenshot({ path: path.join(outputDir, "02-revision-overview-1366.png"), fullPage: true });

    // Cards continuam filtros e segundo clique volta ao default attention.
    const revisionFilterStart = Date.now();
    const revisionCardFilters = ["updated", "pw-previous", "pw-not-found", "pw-awaiting-emission", "other"];
    for (const situation of revisionCardFilters) {
      const card = page.locator('[data-spw-rev-situation="' + situation + '"]');
      await card.click();
      await page.waitForFunction((value) => window.GrconSigemPwRevisionUi.state.filters.situation === value, situation);
      assert.equal(await card.getAttribute("aria-pressed"), "true");
      if (situation === "updated") {
        metrics.revisionFilterMs = Date.now() - revisionFilterStart;
        assert.ok(await page.locator(".spw-rev-table tbody tr:not(.spw-rev-detail)").count() >= 2);
        await page.screenshot({ path: path.join(outputDir, "04-revision-filter-active-1366.png"), fullPage: true });
      }
      await card.click();
      await page.waitForFunction(() => window.GrconSigemPwRevisionUi.state.filters.situation === "attention");
    }

    // Todas as situações e filtros de domínio.
    for (const situation of ["updated","pw-previous","pw-not-found","pw-awaiting-emission","pw-ahead","review","other","all","attention"]) {
      await page.locator("#spw-rev-filter-situation").selectOption(situation);
      await page.waitForFunction((value) => window.GrconSigemPwRevisionUi.state.filters.situation === value, situation);
    }
    await page.locator("#spw-rev-filter-situation").selectOption("all");
    await page.locator("#spw-rev-filter-class").selectOption("ET");
    assert.ok(await page.locator(".spw-rev-table tbody tr:not(.spw-rev-detail)").count() > 0);
    await page.locator("#spw-rev-filter-class").selectOption("N-1710");
    assert.equal(await page.locator(".spw-rev-table tbody tr:not(.spw-rev-detail)").count(), 1);
    await page.locator("#spw-rev-filter-class").selectOption("");
    await page.locator(".spw-rev-advanced").evaluate((node) => { node.open = true; });

    await page.locator("#spw-rev-filter-sigem-rev").selectOption("B");
    assert.ok(await page.locator(".spw-rev-table tbody tr:not(.spw-rev-detail)").count() > 0);
    await page.locator("#spw-rev-filter-sigem-rev").selectOption("");
    await page.locator("#spw-rev-filter-pw-rev").selectOption("A");
    assert.ok(await page.locator(".spw-rev-table tbody tr:not(.spw-rev-detail)").count() > 0);
    await page.locator("#spw-rev-filter-pw-rev").selectOption("");

    const sigemStatus = await page.locator("#spw-rev-filter-sigem-status option").nth(1).getAttribute("value");
    assert.ok(sigemStatus);
    await page.locator("#spw-rev-filter-sigem-status").selectOption(sigemStatus);
    assert.ok(await page.locator(".spw-rev-table tbody tr:not(.spw-rev-detail)").count() > 0);
    await page.locator("#spw-rev-filter-sigem-status").selectOption("");
    await page.locator(".spw-rev-advanced").evaluate((node) => { node.open = true; });
    const pwStatus = await page.locator("#spw-rev-filter-pw-status option").nth(1).getAttribute("value");
    assert.ok(pwStatus);
    await page.locator("#spw-rev-filter-pw-status").selectOption(pwStatus);
    assert.ok(await page.locator(".spw-rev-table tbody tr:not(.spw-rev-detail)").count() > 0);
    await page.locator("#spw-rev-filter-pw-status").selectOption("");
    await page.locator("#spw-rev-filter-sigem-rev").selectOption("B");
    assert.match(await page.locator(".spw-rev-advanced > summary").innerText(), /1 ativo/);
    await page.screenshot({ path: path.join(outputDir, "03-revision-filters-1366.png"), fullPage: true });
    await page.locator("#spw-rev-filter-sigem-rev").selectOption("");
    await page.locator(".spw-rev-advanced").evaluate((node) => { node.open = false; });

    // Debounce real: digitação progressiva não filtra por tecla.
    await page.evaluate(() => {
      const original = window.GrconSigemPwRevision;
      window.__revisionCoreOriginal = original;
      window.__revisionFilterCalls = 0;
      window.GrconSigemPwRevision = Object.freeze({
        ...original,
        filterRows(rows, filters) {
          window.__revisionFilterCalls += 1;
          return original.filterRows(rows, filters);
        },
      });
    });
    await page.locator("#spw-rev-search").focus();
    const revisionFilterCallsBefore = await page.evaluate(() => window.__revisionFilterCalls);
    await page.locator("#spw-rev-search").pressSequentially("RL-5290.00-22313", { delay: 35 });
    const revisionFilterCallsDuringTyping = (await page.evaluate(() => window.__revisionFilterCalls)) - revisionFilterCallsBefore;
    assert.equal(revisionFilterCallsDuringTyping, 0, "filtro pesado não pode executar por tecla antes do debounce");
    const revisionSearchStart = Date.now();
    await page.waitForTimeout(230);
    metrics.revisionSearchMs = Date.now() - revisionSearchStart;
    const revisionFilterCallsAfter = (await page.evaluate(() => window.__revisionFilterCalls)) - revisionFilterCallsBefore;
    assert.ok(revisionFilterCallsAfter <= 2, "debounce deve consolidar a busca em uma atualização");
    assert.equal(await page.locator(".spw-rev-table tbody tr:not(.spw-rev-detail)").count(), 1);
    await page.evaluate(() => { window.GrconSigemPwRevision = window.__revisionCoreOriginal; });
    await page.locator("#spw-rev-search").fill("");
    await page.waitForTimeout(230);

    // Lista colada continua interpretada exclusivamente pelo Core.filterRows().
    await setRevisionDocumentList(page, [
      "C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-910001",
      "C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-910002",
      "C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-910003",
      "C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-910004",
    ].join("\n"));
    await page.waitForTimeout(230);
    assert.equal(await page.locator(".spw-rev-table tbody tr:not(.spw-rev-detail)").count(), 4);
    await page.locator(".spw-rev-advanced").evaluate((node) => { node.open = true; });
    assert.match(await page.locator(".spw-rev-advanced > summary").innerText(), /1 ativo/);
    await page.getByRole("button", { name: "Limpar filtros" }).click();
    await page.waitForFunction(() => {
      const state = window.GrconSigemPwRevisionUi.state;
      return state.filters.situation === "attention"
        && !state.filters.documentClass
        && !state.filters.sigemRevision
        && !state.filters.pwRevision
        && !state.filters.sigemStatus
        && !state.filters.pwStatus
        && !state.rawSearch
        && !state.rawDocumentList;
    });
    await page.locator(".spw-rev-advanced").evaluate((node) => { node.open = false; });

    // Paginação: 250 documentos filtrados, 100 linhas por página.
    await page.locator("#spw-rev-filter-situation").selectOption("pw-not-found");
    await page.locator("#spw-rev-search").fill("PI-92");
    await page.waitForTimeout(230);
    assert.equal(await page.evaluate(() => window.GrconSigemPwRevisionUi.filteredRows().length), 250);
    assert.equal(await page.locator(".spw-rev-table tbody tr:not(.spw-rev-detail)").count(), 100);
    assert.match(await page.locator("#spw-rev-pages").innerText(), /Página 1 de 3/);
    await page.locator("[data-spw-rev-why]").first().click();
    assert.equal(await page.locator(".spw-rev-detail").count(), 1);
    const revisionPageStart = Date.now();
    await page.locator('[data-spw-rev-page="2"]').click();
    metrics.revisionPageChangeMs = Date.now() - revisionPageStart;
    await page.waitForFunction(() => window.GrconSigemPwRevisionUi.state.page === 2);
    assert.equal(await page.locator(".spw-rev-detail").count(), 0, "mudança de página deve remover detalhe órfão");
    assert.equal(await page.evaluate(() => window.GrconSigemPwRevisionUi.state.expandedKey), "");
    await page.screenshot({ path: path.join(outputDir, "06-revision-page2-1366.png"), fullPage: true });
    await page.locator('[data-spw-rev-page="1"]').click();

    // Exportação completa (> PAGE_SIZE).
    const revisionExportStart = Date.now();
    const revisionDownloadPromise = page.waitForEvent("download");
    await page.locator("[data-spw-rev-export]").click();
    const revisionDownload = await revisionDownloadPromise;
    const revisionExportPath = path.join(fixtureDir, "sigem-pw-revision-export.xlsx");
    await revisionDownload.saveAs(revisionExportPath);
    metrics.revisionExportMs = Date.now() - revisionExportStart;
    const revisionBook = XLSX.read(fs.readFileSync(revisionExportPath), { type: "buffer" });
    const revisionRows = XLSX.utils.sheet_to_json(revisionBook.Sheets[revisionBook.SheetNames[0]], { defval: "" });
    assert.equal(revisionRows.length, 250, "Excel de revisões deve exportar todas as páginas");
    await page.waitForFunction(() => /sucesso/i.test(window.GrconSigemPwRevisionUi.state.exportMessage), null, { timeout: 10000 });
    await page.screenshot({ path: path.join(outputDir, "08-revision-export-success-1366.png"), fullPage: true });

    // Exportação imediata deve usar rawSearch antes de o debounce terminar.
    await page.locator("#spw-rev-search").fill("");
    await page.waitForTimeout(230);
    await page.locator("#spw-rev-search").fill("920001");
    const immediateDownloadPromise = page.waitForEvent("download");
    await page.locator("[data-spw-rev-export]").click();
    const immediateDownload = await immediateDownloadPromise;
    const immediatePath = path.join(fixtureDir, "sigem-pw-revision-export-immediate.xlsx");
    await immediateDownload.saveAs(immediatePath);
    const immediateBook = XLSX.read(fs.readFileSync(immediatePath), { type: "buffer" });
    const immediateRows = XLSX.utils.sheet_to_json(immediateBook.Sheets[immediateBook.SheetNames[0]], { defval: "" });
    assert.equal(immediateRows.length, 1, "exportação antes do debounce deve respeitar o texto cru atual");
    await page.waitForTimeout(230);

    // Detalhe Por quê? usa históricos reais do Core (SIGEM 0/A/B × PW 0/A).
    await resetRevisionFilters(page);
    await page.locator("#spw-rev-search").fill("910007");
    await page.waitForTimeout(230);
    const revisionExpandStart = Date.now();
    await page.locator("[data-spw-rev-why]").click();
    metrics.revisionExpandMs = Date.now() - revisionExpandStart;
    const detailText = await page.locator(".spw-rev-detail").innerText();
    assert.match(detailText, /SIGEM — revisões encontradas/);
    assert.match(detailText, /Rev\. B/);
    assert.match(detailText, /Rev\. A/);
    assert.match(detailText, /Rev\. 0/);
    assert.match(detailText, /ProjectWise — revisões encontradas/);
    assert.match(detailText, /Código SIGEM/);
    assert.match(detailText, /Código PW/);
    assert.match(detailText, /EAP/);
    assert.match(detailText, /Critério/);
    await page.screenshot({ path: path.join(outputDir, "05-revision-detail-1366.png"), fullPage: true });
    await page.locator("[data-spw-rev-why]").click();
    assert.equal(await page.locator(".spw-rev-detail").count(), 0);

    await page.locator("[data-spw-rev-why]").click();
    await page.locator("#spw-rev-search").fill("910002");
    await page.waitForTimeout(230);
    assert.equal(await page.locator(".spw-rev-detail").count(), 0, "filtro que remove a linha expandida deve remover o detalhe");
    assert.equal(await page.evaluate(() => window.GrconSigemPwRevisionUi.state.expandedKey), "", "expandedKey não pode ficar órfão");
    await page.locator("#spw-rev-search").fill("910007");
    await page.waitForTimeout(230);

    assert.equal(await page.locator(".spw-rev-detail").count(), 0);

    // Progresso real: onProgress alimenta a UI enquanto analyzeAsync está pendente.
    await page.evaluate(() => {
      const original = window.GrconSigemPwRevision;
      window.__revisionCoreOriginalProgress = original;
      window.GrconSigemPwRevision = Object.freeze({
        ...original,
        async analyzeAsync(model, options) {
          const total = model.sigemAll?.size || 1;
          options?.onProgress?.(1, total);
          await new Promise((resolve) => setTimeout(resolve, 160));
          return original.analyzeAsync(model, options);
        },
      });
      window.__revisionProgressPromise = window.GrconSigemPwRevisionUi.refresh();
    });
    await page.waitForSelector("#spw-rev-progress-count", { state: "visible", timeout: 5000 });
    assert.match(await page.locator("#spw-rev-table-wrap").innerText(), /Comparando revisões SIGEM × PW/);
    await page.screenshot({ path: path.join(outputDir, "07-revision-processing-1366.png"), fullPage: true });
    await page.evaluate(async () => { await window.__revisionProgressPromise; window.GrconSigemPwRevision = window.__revisionCoreOriginalProgress; });

    // Geração concorrente: geração 1 termina depois e não pode sobrescrever geração 2.
    await page.evaluate(() => {
      const original = window.GrconSigemPwRevision;
      const dashboard = window.GrconSigemPwDashboard;
      const s = (id, revision) => ({ document: "C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-" + id, revision, status: "Postado" });
      const p = (id, revision) => ({ document: "C1O-RNEST-U32-3.1.1.1-INS-RIR-PI-" + id, revision, revisionComplete: revision, state: "Liberado", lastEmission: "Sim" });
      const model1 = dashboard.createModel([s("930001", "A")], [p("930001", "A")]);
      const model2 = dashboard.createModel([s("930002", "B")], [p("930002", "B")]);
      const analysis1 = original.analyze(model1);
      const analysis2 = original.analyze(model2);
      window.__revisionRace = { original, model1, model2, analysis1, analysis2, pending: [] };
      window.GrconSigemPwRevision = Object.freeze({
        ...original,
        analyzeAsync(model, options) {
          return new Promise((resolve) => window.__revisionRace.pending.push({ model, options, resolve }));
        },
      });
      window.GrconSigemPwDashboardUi.state.model = model1;
      window.__revisionRace.p1 = window.GrconSigemPwRevisionUi.refresh();
    });
    await page.waitForFunction(() => window.__revisionRace?.pending?.length === 1);
    await page.evaluate(() => {
      window.GrconSigemPwDashboardUi.state.model = window.__revisionRace.model2;
      window.__revisionRace.p2 = window.GrconSigemPwRevisionUi.refresh();
    });
    await page.waitForFunction(() => window.__revisionRace?.pending?.length === 2);
    await page.evaluate(async () => {
      window.__revisionRace.pending[1].resolve(window.__revisionRace.analysis2);
      await window.__revisionRace.p2;
    });
    await page.evaluate(async () => {
      window.__revisionRace.pending[0].resolve(window.__revisionRace.analysis1);
      await window.__revisionRace.p1;
    });
    assert.equal(await page.evaluate(() => window.GrconSigemPwRevisionUi.state.analysis === window.__revisionRace.analysis2), true, "geração antiga não pode substituir a geração nova");
    await page.evaluate(async () => {
      window.GrconSigemPwRevision = window.__revisionRace.original;
      window.GrconSigemPwDashboardUi.state.model = window.__revisionControlledModel;
      await window.GrconSigemPwRevisionUi.refresh();
    });

    // Responsividade e dark mode específicos da seção de Revisões.
    await resetRevisionFilters(page);
    await page.locator(".spw-rev-advanced").evaluate((node) => { node.open = false; });
    metrics.revisionSectionHeight390Before = 2010.640625;
    metrics.revisionWidths = {};
    for (const width of [1440, 1366, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const revisionWidth = await page.evaluate(() => {
        const section = document.querySelector("#spw-revision-section");
        const table = document.querySelector("#spw-rev-table-wrap");
        return {
          documentScrollWidth: document.documentElement.scrollWidth,
          documentClientWidth: document.documentElement.clientWidth,
          revisionSectionScrollWidth: section?.scrollWidth || 0,
          revisionTableScrollWidth: table?.scrollWidth || 0,
          revisionTableClientWidth: table?.clientWidth || 0,
        };
      });
      metrics.revisionWidths[String(width)] = revisionWidth;
      assert.ok(revisionWidth.documentScrollWidth <= revisionWidth.documentClientWidth + 1, "overflow global da Revisão em " + width + "px");
    }

    await page.setViewportSize({ width: 390, height: 844 });
    metrics.revisionSectionHeight390After = await page.locator("#spw-revision-section").evaluate((node) => node.getBoundingClientRect().height);
    metrics.revisionSectionHeight390ReductionPct = Number(((1 - metrics.revisionSectionHeight390After / metrics.revisionSectionHeight390Before) * 100).toFixed(1));
    assert.ok(metrics.revisionSectionHeight390After < metrics.revisionSectionHeight390Before, "FASE B deve reduzir a altura inicial da seção em 390 px");
    await page.screenshot({ path: path.join(outputDir, "09-revision-mobile-overview-390.png"), fullPage: true });

    await page.locator(".spw-rev-advanced > summary").click();
    await page.locator("#spw-rev-filter-sigem-rev").selectOption("B");
    await page.screenshot({ path: path.join(outputDir, "10-revision-mobile-filters-390.png"), fullPage: true });
    await page.getByRole("button", { name: "Limpar filtros" }).click();
    await page.locator(".spw-rev-advanced").evaluate((node) => { node.open = false; });

    await page.locator("#spw-rev-search").fill("910007");
    await page.waitForTimeout(230);
    await page.locator("[data-spw-rev-why]").click();
    await page.screenshot({ path: path.join(outputDir, "11-revision-mobile-detail-390.png"), fullPage: true });
    await page.locator("[data-spw-rev-why]").click();
    await page.locator("#spw-rev-search").fill("");
    await page.waitForTimeout(230);

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await page.screenshot({ path: path.join(outputDir, "12-revision-dark-1366.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(outputDir, "13-revision-dark-390.png"), fullPage: true });
    await page.evaluate(() => { document.documentElement.dataset.theme = ""; });
    await page.setViewportSize({ width: 1366, height: 900 });

    // Restaura o modelo importado real antes das regressões de histórico/evolução.
    await restoreRevisionModel(page);
    await page.waitForFunction(() => Boolean(window.GrconSigemPwRevisionUi.state.analysis), null, { timeout: 30000 });

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

    const revisionGenerationBeforeReimport = await page.evaluate(() => window.GrconSigemPwRevisionUi.state.analysisGeneration);
    await importFile(page, "#spw-pw-file", fixtures.pwFile);
    await page.waitForFunction((before) => (
      window.GrconSigemPwRevisionUi.state.analysisGeneration > before
      && window.GrconSigemPwRevisionUi.state.modelRef === window.GrconSigemPwDashboardUi.state.model
      && !window.GrconSigemPwRevisionUi.state.progress?.active
    ), revisionGenerationBeforeReimport, { timeout: 30000 });
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
    await page.evaluate(() => {
      window.__spwModelRef = window.GrconSigemPwDashboardUi.state.model;
      window.__revisionGenerationBeforeNavigation = window.GrconSigemPwRevisionUi.state.analysisGeneration;
    });
    await clickView(page, "control");
    await clickSpw(page);
    assert.equal(await page.evaluate(() => window.__spwModelRef === window.GrconSigemPwDashboardUi.state.model), true, "reabertura não deve reconstruir modelo sem mudança");
    assert.equal(await page.locator("#grcon-sigem-pw-root").count(), 1);
    assert.equal(await page.locator("#spw-revision-section").count(), 1, "navegação repetida deve manter uma única seção de Revisões");
    assert.equal(await page.evaluate(() => window.GrconSigemPwRevisionUi.state.analysisGeneration), await page.evaluate(() => window.__revisionGenerationBeforeNavigation), "reentrada não deve reanalisar o mesmo modelo");
    await clickView(page, "analysis-history");
    await clickSpw(page);
    assert.equal(await page.locator("#grcon-sigem-pw-root").count(), 1);
    assert.equal(await page.locator("#spw-revision-section").count(), 1);
    assert.equal(await page.evaluate(() => window.GrconSigemPwRevisionUi.state.analysisGeneration), await page.evaluate(() => window.__revisionGenerationBeforeNavigation));
    assert.equal(await page.evaluate(() => Boolean(window.GrconSigemPwHistoryManagement && window.GrconSigemPwRevisionUi?.state?.analysis)), true, "History Management deve enxergar a facade React de Revisões");

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForStablePage(page);
    await exposeApp(page);
    await clickSpw(page);
    assert.equal(await page.evaluate(() => Boolean(window.GrconSigemPwDashboardUi.state.sigem.meta && window.GrconSigemPwDashboardUi.state.pw.meta && window.GrconSigemPwDashboardUi.state.ld.meta)), true);
    const caches = await page.evaluate(async () => await window.caches.keys());
    assert.ok(caches.some((key) => key.includes("phase-b-sigem-pw-revision-ui1")));
    assert.equal(caches.some((key) => key.endsWith("phase-a-sigem-pw-revision-react1")), false, "cache anterior deve ser removido no upgrade");
    metrics.pwa = { cold: true, warm: true, reload: true, upgrade: true };

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
