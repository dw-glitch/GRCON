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


async function installEvolutionFixture(page) {
  return page.evaluate(async () => {
    const history = window.GrconSigemPwHistory;
    const management = window.GrconSigemPwHistoryManagement;
    const dashboardUi = window.GrconSigemPwDashboardUi;
    if (!history?.recordActiveBases || !management?.capturePayload || !dashboardUi?.state?.ld?.records?.length) {
      throw new Error("Runtime histórico/LD indisponível para fixture da Evolução.");
    }

    await history.clearHistory();

    const sigemDoc = (id) => `C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-${id}`;
    const pwDoc = (id) => `C1O-RNEST-U32-3.1.1.1-INS-RIR-PI-${id}`;
    const s = (id, revision = "0", extra = {}) => ({
      document: sigemDoc(id),
      revision,
      status: extra.status || "Postado",
      documentType: extra.documentType || "RIR",
      title: extra.title || `Documento SIGEM ${id}`,
      discipline: extra.discipline || "INS",
      disciplineDesc: extra.discipline || "INS",
      tag: extra.tag || `TAG-${id}`,
      eap: extra.eap || "3.1.1.1",
      modifiedAt: extra.modifiedAt || "2026-09-01T08:00:00.000Z",
      sourceRow: extra.sourceRow || 1,
    });
    const p = (id, revision = "0", emitted = false, extra = {}) => ({
      document: pwDoc(id),
      revision,
      revisionComplete: revision,
      state: emitted ? "Liberado" : (extra.state || "Cadastrado"),
      lastEmission: emitted ? "Sim" : "Previsto",
      documentType: extra.documentType || "RIR",
      title: extra.title || `Documento PW ${id}`,
      discipline: extra.discipline || "INS",
      disciplineDesc: extra.discipline || "INS",
      tag: extra.tag || `TAG-${id}`,
      eap: extra.eap || "3.1.1.1",
      stateChangedAt: extra.stateChangedAt || "2026-09-01T09:00:00.000Z",
      sourceRow: extra.sourceRow || 1,
    });

    const sigem1 = [
      s("300001", "A", { modifiedAt: "2026-09-01T08:01:00.000Z" }),
      s("300002", "0", { modifiedAt: "2026-09-01T08:02:00.000Z" }),
      s("300003", "0", { modifiedAt: "2026-09-01T08:03:00.000Z" }),
    ];
    const sigem2 = [
      ...sigem1,
      s("300001", "A", { status: "Em Workflow", modifiedAt: "2026-09-10T08:04:00.000Z", sourceRow: 4 }),
    ];
    const sigem3 = [
      ...sigem2,
      s("300001", "0", { modifiedAt: "2026-09-20T08:05:00.000Z", sourceRow: 5 }),
    ];

    const bulk = Array.from({ length: 250 }, (_, index) => {
      const id = String(400000 + index).padStart(6, "0");
      return s(id, index % 2 === 0 ? "A" : "0", {
        documentType: index === 42 ? "REP" : "RIR",
        status: index % 10 === 0 ? "Em Workflow" : "Postado",
        discipline: index % 2 === 0 ? "INS" : "PIP",
        tag: `TAG-${id}`,
        eap: index % 2 === 0 ? "3.1.1.1" : "4.2.2.2",
        modifiedAt: `2026-09-30T08:${String(index % 60).padStart(2, "0")}:00.000Z`,
        sourceRow: 100 + index,
      });
    });
    const sigem4 = [
      ...sigem3.filter((row) => !row.document.endsWith("-300003")),
      ...bulk,
      { ...bulk[0] },
    ];

    const pw1 = [
      p("300002", "0", true, { stateChangedAt: "2026-09-01T09:01:00.000Z" }),
      p("300010", "0", false, { stateChangedAt: "2026-09-01T09:02:00.000Z" }),
      p("300011", "0", true, { stateChangedAt: "2026-09-01T09:03:00.000Z" }),
    ];
    const pw2 = [
      ...pw1,
      p("300012", "0", false, { stateChangedAt: "2026-09-10T09:04:00.000Z" }),
    ];
    const pw3 = [
      ...pw2,
      p("300013", "0", false, { stateChangedAt: "2026-09-20T09:05:00.000Z" }),
    ];
    const pw4 = [
      ...pw3.filter((row) => !row.document.endsWith("-300011") && !row.document.endsWith("-300010")),
      p("300010", "0", true, { stateChangedAt: "2026-09-30T09:02:00.000Z" }),
      p("400000", "A", true, { stateChangedAt: "2026-09-30T09:06:00.000Z" }),
      p("500001", "0", false, { stateChangedAt: "2026-09-30T09:07:00.000Z" }),
      p("500002", "0", true, { stateChangedAt: "2026-09-30T09:08:00.000Z" }),
    ];

    const sigemSets = [sigem1, sigem2, sigem3, sigem4];
    const pwSets = [pw1, pw2, pw3, pw4];
    const sigemMetaDates = [
      "2026-09-01T12:00:00.000Z",
      "2026-09-01T12:00:00.000Z",
      "2026-09-20T12:00:00.000Z",
      "2026-09-30T12:00:00.000Z",
    ];
    const pwMetaDates = [
      "2026-09-01T13:00:00.000Z",
      "2026-09-10T13:00:00.000Z",
      "2026-09-20T13:00:00.000Z",
      "2026-09-30T13:00:00.000Z",
    ];
    const recordedDates = [
      "2026-09-01T14:00:00.000Z",
      "2026-09-10T14:00:00.000Z",
      "2026-09-20T14:00:00.000Z",
      "2026-09-30T14:00:00.000Z",
    ];
    const ldRecords = dashboardUi.state.ld.records;
    const sigemIds = [];
    const pwIds = [];

    for (let index = 0; index < 4; index += 1) {
      const sigemBase = {
        meta: {
          fileName: `SIGEM_${String(index + 1).padStart(2, "0")}.xlsx`,
          importedAt: sigemMetaDates[index],
          recordCount: sigemSets[index].length,
          sourceRowCount: sigemSets[index].length,
        },
        records: sigemSets[index],
      };
      const pwBase = {
        meta: {
          fileName: `PW_${String(index + 1).padStart(2, "0")}.csv`,
          importedAt: pwMetaDates[index],
          recordCount: pwSets[index].length,
          sourceRowCount: pwSets[index].length,
        },
        records: pwSets[index],
      };
      const options = {
        recordedAt: recordedDates[index],
        ldRecords,
        ...(index === 1 ? {
          changedSystem: "sigem",
          effectiveAt: "2026-09-15T12:00:00.000Z",
        } : {}),
      };
      const recorded = await history.recordActiveBases(sigemBase, pwBase, options);
      const sigemId = recorded.sigem?.snapshot?.id;
      const pwId = recorded.pw?.snapshot?.id;
      if (!sigemId || !pwId) throw new Error("Fixture não registrou os snapshots esperados.");
      sigemIds.push(sigemId);
      pwIds.push(pwId);
      await management.capturePayload("sigem", sigemBase, sigemId, { sigemBase, pwBase, ldRecords });
      await management.capturePayload("pw", pwBase, pwId, { sigemBase, pwBase, ldRecords });
    }

    window.__evolutionFixture = {
      sigemIds,
      pwIds,
      operationalSigemId: sigemIds[1],
      expected: {
        "sigem-new": 250,
        "pw-new": 3,
        "pw-emitted": 3,
        both: 1,
        "missing-pw": 249,
        "removed-sigem": 1,
        "removed-pw": 1,
      },
    };
    return window.__evolutionFixture;
  });
}

async function resetEvolutionFilters(page) {
  await page.locator("#spw-evolution-section").getByRole("button", { name: "Limpar filtros" }).click();
  await page.waitForFunction(() => {
    const state = window.GrconSigemPwEvolutionUi?.state;
    return Boolean(state)
      && Object.values(state.filters || {}).every((value) => value === "")
      && Object.values(state.rawFilters || {}).every((value) => value === "");
  });
}

async function waitEvolutionReady(page) {
  await page.waitForFunction(() => Boolean(window.GrconSigemPwEvolutionUi?.state?.ready) && !window.GrconSigemPwEvolutionUi.state.busy, null, { timeout: 30000 });
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
    await page.locator("#spw-revision-section").getByRole("button", { name: "Limpar filtros" }).click();
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
    assert.match(detailText, /código sigem/i);
    assert.match(detailText, /código pw/i);
    assert.match(detailText, /eap/i);
    assert.match(detailText, /critério/i);
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
    await page.locator("#spw-revision-section").getByRole("button", { name: "Limpar filtros" }).click();
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

    // Evolução React: lazy loading real antes de qualquer ativação.
    assert.equal(await page.locator("#grcon-sigem-pw-evolution-root").count(), 0, "raiz da Evolução não deve existir antes do clique");
    assert.equal(await page.evaluate(() => Boolean(window.GrconSigemPwEvolutionUi)), false, "facade da Evolução não deve inicializar antes do clique");
    const resourcesBeforeEvolution = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
    assert.equal(resourcesBeforeEvolution.some((url) => /react-dist\/sigem-pw-evolution-app\.js(?:\?|$)/.test(url)), false, "bundle React da Evolução deve permanecer lazy");
    assert.equal(resourcesBeforeEvolution.some((url) => /sigem_pw_evolution_app\.js(?:\?|$)/.test(url)), false, "UI legada da Evolução nunca deve carregar");

    // Primeiro abre sem LD válida: não pode inventar zero.
    await page.evaluate(() => {
      window.__evolutionOriginalLd = window.GrconSigemPwDashboardUi.state.ld;
      window.GrconSigemPwDashboardUi.state.ld = { meta: null, records: [] };
    });
    const evolutionLazyStart = Date.now();
    await page.locator("#spw-evolution-open").click();
    await page.locator("#spw-evolution-section").waitFor({ state: "visible", timeout: 30000 });
    await waitEvolutionReady(page);
    metrics.evolutionLazyLoadMs = Date.now() - evolutionLazyStart;
    assert.equal(await page.locator("#grcon-sigem-pw-evolution-root").count(), 1, "Evolução deve montar em uma única raiz React");
    assert.equal(await page.locator("#spw-evolution-section").getAttribute("data-evolution-version"), "react-phase-a", "Evolução deve permanecer React da FASE A");
    assert.equal(await page.evaluate(() => Boolean(window.GrconSigemPwEvolutionUi?.state && window.GrconSigemPwEvolutionUi?.refresh)), true, "facade React da Evolução deve estar disponível");
    assert.match(await page.locator("#spw-evo-scope").innerText(), /LD da Qualidade necessária/i);
    assert.equal(await page.locator("#spw-evo-kpis strong").first().innerText(), "—", "sem LD os KPIs não podem exibir zero válido");
    await page.screenshot({ path: path.join(outputDir, "01-evolution-no-ld-1366.png"), fullPage: true });

    const evolutionResources = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
    assert.ok(evolutionResources.some((url) => /react-dist\/sigem-pw-evolution-app\.js(?:\?|$)/.test(url)), "bundle React da Evolução deve carregar somente após o clique");
    assert.equal(evolutionResources.some((url) => /sigem_pw_evolution_app\.js(?:\?|$)/.test(url)), false, "UI legada da Evolução não pode ser carregada");

    await page.evaluate(() => {
      window.GrconSigemPwDashboardUi.state.ld = window.__evolutionOriginalLd;
    });
    const evolutionFixture = await installEvolutionFixture(page);
    await page.evaluate(async () => { await window.GrconSigemPwEvolutionUi.refresh(true); });
    await waitEvolutionReady(page);

    // A data operacional do snapshot prevalece sobre a data original do payload.
    const operationalDate = await page.evaluate(async (snapshotId) => {
      const snapshot = window.GrconSigemPwEvolutionUi.state.sigem.find((item) => item.id === snapshotId);
      const history = window.GrconSigemPwHistory;
      const db = await history.openDb();
      try {
        const payload = await new Promise((resolve, reject) => {
          const request = db.transaction(history.STORES.meta, "readonly").objectStore(history.STORES.meta).get("sourcePayload:" + snapshotId);
          request.onsuccess = () => resolve(request.result?.value || null);
          request.onerror = () => reject(request.error);
        });
        return { importedAt: snapshot?.importedAt || "", payloadImportedAt: payload?.meta?.importedAt || "" };
      } finally {
        db.close();
      }
    }, evolutionFixture.operationalSigemId);
    assert.match(operationalDate.importedAt, /^2026-09-15/, "snapshot deve usar 15/09 como data operacional");
    assert.match(operationalDate.payloadImportedAt, /^2026-09-01/, "payload deve preservar a data original 01/09");

    // Ajusta a data operacional controlada para 10/09 antes dos testes de período 01/10/20/30.
    await page.evaluate(async (snapshotId) => {
      await window.GrconSigemPwHistory.updateSourceSnapshotDate("sigem", snapshotId, "2026-09-10T12:00:00.000Z");
      await window.GrconSigemPwEvolutionUi.refresh(false);
    }, evolutionFixture.operationalSigemId);
    await waitEvolutionReady(page);

    const fullDates = await page.evaluate(() => ({
      sigem: window.GrconSigemPwEvolutionUi.state.sigem.map((item) => item.importedAt.slice(0, 10)),
      pw: window.GrconSigemPwEvolutionUi.state.pw.map((item) => item.importedAt.slice(0, 10)),
    }));
    assert.deepEqual(fullDates.sigem, ["2026-09-01", "2026-09-10", "2026-09-20", "2026-09-30"]);
    assert.deepEqual(fullDates.pw, ["2026-09-01", "2026-09-10", "2026-09-20", "2026-09-30"]);

    // Defaults: atual = mais recente; anterior = imediatamente anterior, independentemente por sistema.
    assert.deepEqual(await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.selections), {
      sigemPrev: evolutionFixture.sigemIds[2],
      sigemCurrent: evolutionFixture.sigemIds[3],
      pwPrev: evolutionFixture.pwIds[2],
      pwCurrent: evolutionFixture.pwIds[3],
    });

    const expectedTimeline = [
      { date: "2026-09-10", sigemAdded: 1, sigemRemoved: 0, pwAdded: 1, pwRemoved: 0, pwEmitted: 0, events: 2 },
      { date: "2026-09-20", sigemAdded: 1, sigemRemoved: 0, pwAdded: 1, pwRemoved: 0, pwEmitted: 0, events: 2 },
      { date: "2026-09-30", sigemAdded: 250, sigemRemoved: 1, pwAdded: 3, pwRemoved: 1, pwEmitted: 3, events: 2 },
    ];
    assert.deepEqual(await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.timeline), expectedTimeline, "timeline deve refletir exatamente a fixture controlada");

    const overviewState = await page.evaluate(() => ({
      sigemAdded: window.GrconSigemPwEvolutionUi.state.comparison?.sigem?.added.length,
      sigemRemoved: window.GrconSigemPwEvolutionUi.state.comparison?.sigem?.removed.length,
      pwAdded: window.GrconSigemPwEvolutionUi.state.comparison?.pw?.added.length,
      pwRemoved: window.GrconSigemPwEvolutionUi.state.comparison?.pw?.removed.length,
      pwEmitted: window.GrconSigemPwEvolutionUi.state.comparison?.pwEmissions.length,
      both: window.GrconSigemPwEvolutionUi.state.comparison?.relation?.newInBoth.length,
      missingPw: window.GrconSigemPwEvolutionUi.state.comparison?.relation?.newSigemMissingPw.length,
    }));
    assert.deepEqual(overviewState, { sigemAdded: 250, sigemRemoved: 1, pwAdded: 3, pwRemoved: 1, pwEmitted: 3, both: 1, missingPw: 249 });
    assert.match(await page.locator("#spw-evo-audit").innerText(), /252 documentos únicos · 254 registros\/revisões válidos · 1 duplicidade/i);
    assert.match(await page.locator("#spw-evo-audit").innerText(), /7 documentos únicos · 7 registros\/revisões válidos · 0 duplicidade/i);
    await page.screenshot({ path: path.join(outputDir, "02-evolution-overview-1366.png"), fullPage: true });

    // Período: somente inicial.
    await page.locator("#spw-evo-date-start").fill("2026-09-10");
    await page.waitForFunction(() => window.GrconSigemPwEvolutionUi.state.period.start === "2026-09-10");
    assert.match(await page.locator("#spw-evo-period-summary").innerText(), /SIGEM: 3 base\(s\); PW: 3 base\(s\)/);

    // Somente final.
    await page.locator("#spw-evo-date-start").fill("");
    await page.locator("#spw-evo-date-end").fill("2026-09-20");
    await page.waitForFunction(() => window.GrconSigemPwEvolutionUi.state.period.end === "2026-09-20");
    assert.match(await page.locator("#spw-evo-period-summary").innerText(), /SIGEM: 3 base\(s\); PW: 3 base\(s\)/);

    // Intervalo 10/09 -> 20/09.
    await page.locator("#spw-evo-date-start").fill("2026-09-10");
    await page.waitForFunction(() => window.GrconSigemPwEvolutionUi.state.period.start === "2026-09-10");
    assert.match(await page.locator("#spw-evo-period-summary").innerText(), /SIGEM: 2 base\(s\); PW: 2 base\(s\)/);
    await page.screenshot({ path: path.join(outputDir, "03-evolution-period-1366.png"), fullPage: true });

    // Período inválido preserva o estado anterior e apresenta feedback.
    await page.evaluate(() => {
      window.__evolutionNotifications = [];
      window.__evolutionNotifyOriginal = window.GrconNotify;
      window.GrconNotify = (message, kind) => {
        window.__evolutionNotifications.push({ message: String(message || ""), kind: String(kind || "") });
        if (typeof window.__evolutionNotifyOriginal === "function") window.__evolutionNotifyOriginal(message, kind);
      };
    });
    await page.locator("#spw-evo-date-start").fill("2026-09-25");
    await page.waitForFunction(() => window.GrconSigemPwEvolutionUi.state.period.start === "2026-09-10");
    assert.equal(await page.locator("#spw-evo-date-start").inputValue(), "2026-09-10");
    assert.equal(await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.period.end), "2026-09-20");
    assert.ok(await page.evaluate(() => window.__evolutionNotifications.some((item) => /data inicial/i.test(item.message) && item.kind === "warning")), "período inválido deve produzir feedback");
    await page.evaluate(() => { window.GrconNotify = window.__evolutionNotifyOriginal; });

    // Todo o histórico limpa as duas datas e restaura defaults.
    await page.locator("#spw-evo-date-clear").click();
    await page.waitForFunction(() => !window.GrconSigemPwEvolutionUi.state.period.start && !window.GrconSigemPwEvolutionUi.state.period.end);
    assert.equal(await page.locator("#spw-evo-date-start").inputValue(), "");
    assert.equal(await page.locator("#spw-evo-date-end").inputValue(), "");
    assert.deepEqual(await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.selections), {
      sigemPrev: evolutionFixture.sigemIds[2],
      sigemCurrent: evolutionFixture.sigemIds[3],
      pwPrev: evolutionFixture.pwIds[2],
      pwCurrent: evolutionFixture.pwIds[3],
    });

    // Seletores SIGEM/PW são independentes.
    const pwBeforeSigemChange = await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.selections.pwPrev);
    await page.locator('[data-evo-select="sigemPrev"]').selectOption(evolutionFixture.sigemIds[0]);
    assert.equal(await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.selections.pwPrev), pwBeforeSigemChange);
    const sigemAfterChange = await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.selections.sigemPrev);
    await page.locator('[data-evo-select="pwPrev"]').selectOption(evolutionFixture.pwIds[1]);
    assert.equal(await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.selections.sigemPrev), sigemAfterChange);
    await page.screenshot({ path: path.join(outputDir, "04-evolution-selectors-1366.png"), fullPage: true });

    // Multiconjunto: 1 ocorrência DOC 300001 Rev A -> 2 ocorrências = +1.
    await page.locator('[data-evo-select="sigemPrev"]').selectOption(evolutionFixture.sigemIds[0]);
    await page.locator('[data-evo-select="sigemCurrent"]').selectOption(evolutionFixture.sigemIds[1]);
    const multisetDelta = await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.comparison?.sigem?.added || []);
    assert.equal(multisetDelta.length, 1, "1 -> 2 ocorrências deve resultar em +1");
    assert.match(multisetDelta[0].document, /300001$/);
    assert.equal(multisetDelta[0].revision, "A");

    // Documento + revisão continuam ocorrências independentes: Rev 0 entra sem substituir Rev A.
    await page.locator('[data-evo-select="sigemPrev"]').selectOption(evolutionFixture.sigemIds[1]);
    await page.locator('[data-evo-select="sigemCurrent"]').selectOption(evolutionFixture.sigemIds[2]);
    const revisionDelta = await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.comparison?.sigem?.added || []);
    assert.equal(revisionDelta.length, 1);
    assert.match(revisionDelta[0].document, /300001$/);
    assert.equal(revisionDelta[0].revision, "0");

    // Restaura o comparativo 20 -> 30 para os demais testes.
    await page.locator('[data-evo-select="sigemPrev"]').selectOption(evolutionFixture.sigemIds[2]);
    await page.locator('[data-evo-select="sigemCurrent"]').selectOption(evolutionFixture.sigemIds[3]);
    await page.locator('[data-evo-select="pwPrev"]').selectOption(evolutionFixture.pwIds[2]);
    await page.locator('[data-evo-select="pwCurrent"]').selectOption(evolutionFixture.pwIds[3]);

    // Quatro KPIs operam a lista real.
    for (const mode of ["sigem-new", "pw-new", "pw-emitted", "missing-pw"]) {
      await page.locator('[data-evo-list="' + mode + '"]').first().click();
      await page.waitForFunction((wanted) => window.GrconSigemPwEvolutionUi.state.listMode === wanted, mode);
      assert.equal(await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.filteredRows.length), evolutionFixture.expected[mode]);
    }
    await page.screenshot({ path: path.join(outputDir, "05-evolution-kpis-1366.png"), fullPage: true });
    await page.screenshot({ path: path.join(outputDir, "06-evolution-timeline-1366.png"), fullPage: true });

    // Sete listas: ativação, contagem e linhas.
    for (const mode of ["sigem-new", "pw-new", "pw-emitted", "both", "missing-pw", "removed-sigem", "removed-pw"]) {
      await page.locator('[data-evo-list="' + mode + '"]').last().click();
      await page.waitForFunction((wanted) => window.GrconSigemPwEvolutionUi.state.listMode === wanted, mode);
      const count = await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.filteredRows.length);
      assert.equal(count, evolutionFixture.expected[mode], "contagem incorreta para " + mode);
      assert.equal(await page.locator("#spw-evo-table tbody tr").count(), Math.min(100, count), "linhas incorretas para " + mode);
    }

    await page.locator('[data-evo-list="sigem-new"]').last().click();
    await page.waitForFunction(() => window.GrconSigemPwEvolutionUi.state.listMode === "sigem-new");
    await resetEvolutionFilters(page);
    assert.equal(await page.locator("#spw-evo-table tbody tr").count(), 100);
    await page.screenshot({ path: path.join(outputDir, "07-evolution-list-1366.png"), fullPage: true });

    // Nove filtros, individualmente, e duas combinações.
    const filterCases = [
      ["#spw-evo-filter-query", "fill", "400042", "query", 1, true],
      ["#spw-evo-filter-class", "select", "ET", "documentClass", 250, false],
      ["#spw-evo-filter-document-type", "fill", "REP", "documentType", 1, false],
      ["#spw-evo-filter-revision", "fill", "A", "revision", 125, false],
      ["#spw-evo-filter-status", "fill", "Em Workflow", "status", 25, false],
      ["#spw-evo-filter-discipline", "fill", "PIP", "discipline", 125, false],
      ["#spw-evo-filter-tag", "fill", "TAG-400042", "tag", 1, true],
      ["#spw-evo-filter-eap", "fill", "4.2.2.2", "eap", 125, true],
      ["#spw-evo-filter-source", "select", "sigem", "source", 250, false],
    ];
    for (const [selector, action, value, key, expected, debounced] of filterCases) {
      await resetEvolutionFilters(page);
      if (action === "select") await page.locator(selector).selectOption(value);
      else await page.locator(selector).fill(value);
      if (debounced) await page.waitForTimeout(230);
      await page.waitForFunction(({ filterKey, wanted }) => String(window.GrconSigemPwEvolutionUi.state.filters[filterKey] || "") === wanted, { filterKey: key, wanted: value });
      assert.equal(await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.filteredRows.length), expected, "filtro " + key + " deve produzir a contagem controlada");
    }

    await resetEvolutionFilters(page);
    await page.locator("#spw-evo-filter-revision").fill("A");
    await page.locator("#spw-evo-filter-status").fill("Em Workflow");
    assert.equal(await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.filteredRows.length), 25, "combinação revisão + status");
    await resetEvolutionFilters(page);
    await page.locator("#spw-evo-filter-document-type").fill("RIR");
    await page.locator("#spw-evo-filter-discipline").fill("PIP");
    assert.equal(await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.filteredRows.length), 125, "combinação tipo + disciplina");

    // Debounce real: query, TAG e EAP não recalculam a lista por caractere.
    await page.evaluate(() => {
      window.__evolutionCoreOriginal = window.GrconSigemPwEvolution;
      window.__evolutionNormCalls = 0;
      const original = window.__evolutionCoreOriginal;
      window.GrconSigemPwEvolution = Object.freeze({
        ...original,
        norm(value) {
          window.__evolutionNormCalls += 1;
          return original.norm(value);
        },
      });
    });
    const debounceCases = [
      ["#spw-evo-filter-query", "query", "400042"],
      ["#spw-evo-filter-tag", "tag", "TAG-400042"],
      ["#spw-evo-filter-eap", "eap", "4.2.2.2"],
    ];
    for (const [selector, key, value] of debounceCases) {
      await resetEvolutionFilters(page);
      await page.evaluate(() => { window.__evolutionNormCalls = 0; });
      await page.locator(selector).pressSequentially(value, { delay: 40 });
      assert.equal(await page.evaluate((filterKey) => window.GrconSigemPwEvolutionUi.state.rawFilters[filterKey], key), value);
      assert.equal(await page.evaluate((filterKey) => window.GrconSigemPwEvolutionUi.state.filters[filterKey], key), "", key + " não deve aplicar antes do debounce");
      const callsBeforeDebounce = await page.evaluate(() => window.__evolutionNormCalls);
      await page.waitForFunction(({ filterKey, wanted }) => window.GrconSigemPwEvolutionUi.state.filters[filterKey] === wanted, { filterKey: key, wanted: value }, { timeout: 3000 });
      const callsAfterDebounce = await page.evaluate(() => window.__evolutionNormCalls);
      assert.ok(callsAfterDebounce > callsBeforeDebounce, key + " deve recalcular uma vez após o debounce");
    }
    await page.evaluate(() => { window.GrconSigemPwEvolution = window.__evolutionCoreOriginal; });
    await resetEvolutionFilters(page);

    // Exportação imediata usa rawFilters, mesmo antes do debounce visual.
    await page.locator("#spw-evo-filter-query").fill("400042");
    const immediateEvolutionDownloadPromise = page.waitForEvent("download");
    await page.locator("#spw-evo-export").click();
    const immediateEvolutionDownload = await immediateEvolutionDownloadPromise;
    const immediateEvolutionPath = path.join(fixtureDir, "sigem-pw-evolution-export-immediate.xlsx");
    await immediateEvolutionDownload.saveAs(immediateEvolutionPath);
    const immediateEvolutionBook = XLSX.read(fs.readFileSync(immediateEvolutionPath), { type: "buffer" });
    const immediateEvolutionRows = XLSX.utils.sheet_to_json(immediateEvolutionBook.Sheets[immediateEvolutionBook.SheetNames[0]], { defval: "" });
    assert.equal(immediateEvolutionRows.length, 1, "exportação antes do debounce deve respeitar o texto atual");
    assert.match(String(immediateEvolutionRows[0]["Código"] || ""), /400042$/);
    await page.waitForTimeout(230);
    await resetEvolutionFilters(page);

    // Paginação 250 = 100 / 100 / 50.
    assert.equal(await page.locator("#spw-evo-table tbody tr").count(), 100);
    assert.equal(await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.page), 1);
    await page.locator('[data-evo-page="next"]').click();
    assert.equal(await page.locator("#spw-evo-table tbody tr").count(), 100);
    assert.equal(await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.page), 2);
    await page.screenshot({ path: path.join(outputDir, "09-evolution-page2-1366.png"), fullPage: true });
    await page.locator('[data-evo-page="next"]').click();
    assert.equal(await page.locator("#spw-evo-table tbody tr").count(), 50);
    assert.equal(await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.page), 3);
    await page.locator('[data-evo-page="prev"]').click();
    await page.locator('[data-evo-page="prev"]').click();

    // Excel exporta todas as 250 linhas, não somente a página visível.
    const evolutionExportStart = Date.now();
    const evolutionDownloadPromise = page.waitForEvent("download");
    await page.locator("#spw-evo-export").click();
    const evolutionDownload = await evolutionDownloadPromise;
    const evolutionExportPath = path.join(fixtureDir, "sigem-pw-evolution-export.xlsx");
    await evolutionDownload.saveAs(evolutionExportPath);
    metrics.evolutionExportWallMs = Date.now() - evolutionExportStart;
    const evolutionBook = XLSX.read(fs.readFileSync(evolutionExportPath), { type: "buffer" });
    const evolutionRows = XLSX.utils.sheet_to_json(evolutionBook.Sheets[evolutionBook.SheetNames[0]], { defval: "" });
    assert.equal(evolutionRows.length, 250, "Excel da Evolução deve exportar todas as páginas");
    assert.deepEqual(Object.keys(evolutionRows[0]), [
      "Código", "Revisão", "Classe", "Tipo documental", "Título", "Movimento", "Status", "Disciplina",
      "TAG", "EAP", "Data", "Origem", "Emissão PW", "LD origem", "LD aba", "Prazo LD",
    ]);

    // Detalhe pelo mouse: conteúdo, foco, trap, scroll lock, clique interno e overlay.
    const firstEvolutionRow = page.locator("#spw-evo-table tbody tr").first();
    const firstEvolutionIdentity = await firstEvolutionRow.getAttribute("data-analysis-id");
    const bodyOverflowBeforeEvolutionDrawer = await page.evaluate(() => document.body.style.overflow);
    await firstEvolutionRow.click();
    await page.locator("#spw-evo-drawer").waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => document.activeElement?.id), "spw-evo-drawer", "drawer deve assumir foco");
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden", "drawer deve bloquear scroll do body");
    const evolutionDetailText = await page.locator("#spw-evo-detail-body").innerText();
    for (const label of ["Código", "Revisão", "Título", "Classe", "Tipo documental", "TAG", "EAP", "Disciplina", "Status SIGEM", "Status PW", "Data SIGEM", "Data PW", "Origem", "Movimento", "Snapshot", "Existia anteriormente?", "Emissão PW", "LD", "Prazo LD", "Chave da ocorrência", "Situação SIGEM × PW"]) {
      assert.ok(evolutionDetailText.includes(label), "campo do detalhe ausente: " + label);
    }
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "spw-evo-close");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "spw-evo-close", "Tab não pode escapar do drawer");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "spw-evo-close", "Shift+Tab não pode escapar do drawer");
    await page.locator("#spw-evo-detail-body").click({ position: { x: 10, y: 10 } });
    assert.equal(await page.locator("#spw-evo-drawer").count(), 1, "clique dentro não pode fechar o drawer");
    await page.screenshot({ path: path.join(outputDir, "08-evolution-detail-1366.png"), fullPage: true });
    await page.locator("#spw-evo-overlay").click({ position: { x: 10, y: 10 } });
    await page.waitForFunction(() => !document.getElementById("spw-evo-drawer"));
    assert.equal(await page.evaluate(() => document.body.style.overflow), bodyOverflowBeforeEvolutionDrawer, "scroll lock deve restaurar o valor original");
    assert.equal(await page.evaluate((identity) => document.activeElement?.getAttribute("data-analysis-id") === identity, firstEvolutionIdentity), true, "foco deve retornar à linha após overlay");

    // Detalhe por Enter e Space; Escape fecha e restaura foco.
    await firstEvolutionRow.focus();
    await firstEvolutionRow.press("Enter");
    await page.locator("#spw-evo-drawer").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.getElementById("spw-evo-drawer"));
    assert.equal(await page.evaluate((identity) => document.activeElement?.getAttribute("data-analysis-id") === identity, firstEvolutionIdentity), true, "Escape deve restaurar foco");
    await firstEvolutionRow.press(" ");
    await page.locator("#spw-evo-drawer").waitFor({ state: "visible" });
    await page.locator("#spw-evo-close").click();
    await page.waitForFunction(() => !document.getElementById("spw-evo-drawer"));

    // Gerenciar histórico: contrato de integração deve chamar o RuntimeFix sem alterar seu módulo.
    await page.evaluate(() => {
      window.__evolutionHistoryRuntimeOriginal = window.GrconSigemPwHistoryRuntimeFix;
      window.__evolutionHistoryManagerCalls = 0;
      window.GrconSigemPwHistoryRuntimeFix = {
        openManager() { window.__evolutionHistoryManagerCalls += 1; },
      };
    });
    await page.locator("#spw-evolution-section #spw-history-manage").click();
    assert.equal(await page.evaluate(() => window.__evolutionHistoryManagerCalls), 1);
    await page.evaluate(() => { window.GrconSigemPwHistoryRuntimeFix = window.__evolutionHistoryRuntimeOriginal; });

    // Eventos rápidos devem ser agrupados em um único refresh pesado.
    await page.evaluate(() => {
      const original = window.GrconSigemPwEvolution;
      window.__evolutionEventCoreOriginal = original;
      window.__evolutionBuildSnapshotCalls = 0;
      window.GrconSigemPwEvolution = Object.freeze({
        ...original,
        buildSnapshot(...args) {
          window.__evolutionBuildSnapshotCalls += 1;
          return original.buildSnapshot(...args);
        },
      });
      window.dispatchEvent(new CustomEvent("grcon:conference-updated"));
      window.dispatchEvent(new CustomEvent("grcon:pw-base-updated"));
      window.dispatchEvent(new CustomEvent("grcon:sigem-pw-base-date-updated"));
    });
    await page.waitForTimeout(850);
    await page.waitForFunction(() => !window.GrconSigemPwEvolutionUi.state.busy && window.__evolutionBuildSnapshotCalls > 0, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => window.__evolutionBuildSnapshotCalls), 8, "três eventos rápidos devem resultar em um único rebuild de 4+4 snapshots");
    await page.evaluate(() => { window.GrconSigemPwEvolution = window.__evolutionEventCoreOriginal; });

    // Responsividade específica da Evolução, com scroll horizontal somente local à tabela.
    metrics.evolutionWidths = {};
    for (const width of [1440, 1366, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      const dimensions = await page.evaluate(() => {
        const table = document.querySelector("#spw-evo-table");
        return {
          documentScrollWidth: document.documentElement.scrollWidth,
          documentClientWidth: document.documentElement.clientWidth,
          tableScrollWidth: table?.scrollWidth || 0,
          tableClientWidth: table?.clientWidth || 0,
        };
      });
      metrics.evolutionWidths[String(width)] = dimensions;
      assert.ok(dimensions.documentScrollWidth <= dimensions.documentClientWidth + 1, "overflow global da Evolução em " + width + "px");
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(outputDir, "10-evolution-mobile-390.png"), fullPage: true });
    const mobileRow = page.locator("#spw-evo-table tbody tr").first();
    await mobileRow.click();
    await page.locator("#spw-evo-drawer").waitFor({ state: "visible" });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await page.screenshot({ path: path.join(outputDir, "11-evolution-detail-mobile-390.png"), fullPage: true });
    await page.keyboard.press("Escape");

    // Dark mode: overview, drawer/overlay, loading, feedback e erro.
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await page.screenshot({ path: path.join(outputDir, "12-evolution-dark-1366.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await mobileRow.click();
    await page.locator("#spw-evo-drawer").waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(outputDir, "13-evolution-dark-390.png"), fullPage: true });
    await page.keyboard.press("Escape");

    await page.evaluate(() => {
      const original = window.GrconSigemPwHistory;
      window.__evolutionHistoryOriginalForDark = original;
      window.GrconSigemPwHistory = Object.freeze({
        ...original,
        async listSourceSnapshots(system) {
          await new Promise((resolve) => setTimeout(resolve, 180));
          return original.listSourceSnapshots(system);
        },
      });
      window.__evolutionDarkLoadingPromise = window.GrconSigemPwEvolutionUi.refresh(false);
    });
    await page.waitForFunction(() => window.GrconSigemPwEvolutionUi.state.busy);
    assert.equal(await page.locator('.spw-evo-message[role="status"]').count(), 1, "loading deve continuar visível em dark mode");
    await page.evaluate(async () => { await window.__evolutionDarkLoadingPromise; });

    await page.evaluate(async () => {
      const original = window.__evolutionHistoryOriginalForDark;
      window.GrconSigemPwHistory = Object.freeze({
        ...original,
        async listSourceSnapshots() { throw new Error("fixture dark error"); },
      });
      await window.GrconSigemPwEvolutionUi.refresh(false).catch(() => undefined);
    });
    assert.match(await page.locator(".spw-evo-message.error").innerText(), /fixture dark error/i);
    await page.evaluate(async () => {
      window.GrconSigemPwHistory = window.__evolutionHistoryOriginalForDark;
      await window.GrconSigemPwEvolutionUi.refresh(false);
      document.documentElement.dataset.theme = "";
    });
    await waitEvolutionReady(page);

    // Reentrada: Dashboard -> Evolução -> Consultas -> Dashboard -> Evolução sem duplicação.
    const evolutionBundleCountBeforeReentry = await page.evaluate(() => performance.getEntriesByType("resource").filter((entry) => /react-dist\/sigem-pw-evolution-app\.js(?:\?|$)/.test(entry.name)).length);
    await page.evaluate(() => {
      window.__spwModelRef = window.GrconSigemPwDashboardUi.state.model;
      window.__revisionGenerationBeforeNavigation = window.GrconSigemPwRevisionUi.state.analysisGeneration;
    });
    await clickView(page, "requests");
    await clickSpw(page);
    await page.locator("#spw-evolution-open").click();
    await page.locator("#spw-evolution-section").waitFor({ state: "visible", timeout: 30000 });
    assert.equal(await page.locator("#grcon-sigem-pw-root").count(), 1);
    assert.equal(await page.locator("#grcon-sigem-pw-evolution-root").count(), 1);
    assert.equal(await page.locator("#spw-evolution-section").count(), 1);
    assert.equal(await page.locator("#spw-evo-overlay").count(), 0, "não pode haver overlay órfão");
    assert.equal(await page.evaluate(() => window.__spwModelRef === window.GrconSigemPwDashboardUi.state.model), true, "reabertura não deve reconstruir modelo sem mudança");
    assert.equal(await page.evaluate(() => window.GrconSigemPwRevisionUi.state.analysisGeneration), await page.evaluate(() => window.__revisionGenerationBeforeNavigation), "reentrada não deve reanalisar o mesmo modelo");
    const evolutionBundleCountAfterReentry = await page.evaluate(() => performance.getEntriesByType("resource").filter((entry) => /react-dist\/sigem-pw-evolution-app\.js(?:\?|$)/.test(entry.name)).length);
    assert.equal(evolutionBundleCountAfterReentry, evolutionBundleCountBeforeReentry, "reentrada não deve reimportar bundle da Evolução");

    // O listener externo também deve continuar único após reentrada.
    await page.evaluate(() => {
      const original = window.GrconSigemPwEvolution;
      window.__evolutionReentryCoreOriginal = original;
      window.__evolutionReentryBuildCalls = 0;
      window.GrconSigemPwEvolution = Object.freeze({
        ...original,
        buildSnapshot(...args) {
          window.__evolutionReentryBuildCalls += 1;
          return original.buildSnapshot(...args);
        },
      });
      window.dispatchEvent(new CustomEvent("grcon:conference-updated"));
    });
    await page.waitForTimeout(850);
    await page.waitForFunction(() => !window.GrconSigemPwEvolutionUi.state.busy && window.__evolutionReentryBuildCalls > 0, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => window.__evolutionReentryBuildCalls), 8, "reentrada não pode duplicar listeners/refreshes");
    await page.evaluate(() => { window.GrconSigemPwEvolution = window.__evolutionReentryCoreOriginal; });

    metrics.evolution = await page.evaluate(() => ({ ...window.GrconSigemPwEvolutionUi.state.metrics }));
    for (const key of ["evolutionSnapshotBuildMs", "evolutionPeriodChangeMs", "evolutionFilterMs", "evolutionSearchMs", "evolutionPageChangeMs", "evolutionDetailMs", "evolutionExportMs"]) {
      assert.ok(Number.isFinite(metrics.evolution[key]) && metrics.evolution[key] >= 0, "métrica ausente: " + key);
    }
    assert.ok(await page.locator("#spw-revision-section").count() === 1);
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
