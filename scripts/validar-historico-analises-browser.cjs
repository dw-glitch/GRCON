const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const XLSX = require("../xlsx.full.min.js");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";
const outputDir = path.join(process.cwd(), "artifacts/historico-analises-browser");
const fixtureDir = path.join(process.cwd(), "artifacts/historico-analises-fixtures");
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(fixtureDir, { recursive: true });

function localIso(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const pad = (value) => String(value).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function analyzedAt(offsetDays, hour) {
  return localIso(offsetDays) + "T" + String(hour).padStart(2, "0") + ":15:00.000";
}

const statuses = [
  ["Será incluído na eGRDT", "READY"],
  ["Não será incluído", "BLOCKED"],
  ["Não será enviado novamente", "DISCARD"],
  ["Precisa de conferência", "REVIEW"],
];

function buildFixture() {
  const sessions = [
    {
      id: "history-session-old",
      analyzedAt: analyzedAt(-5, 9),
      dateKey: localIso(-5),
      completed: true,
      appVersion: "5.41.0",
      ldName: "LD_003_TESTE.xlsx",
      sourceName: "fixture-browser",
      inputType: "teste",
      total: 120,
      counts: { ready: 30, blocked: 30, discard: 30, review: 30 },
      savedDocuments: 120,
    },
    {
      id: "history-session-new",
      analyzedAt: analyzedAt(0, 10),
      dateKey: localIso(0),
      completed: true,
      appVersion: "5.41.0",
      ldName: "LD_001_TESTE.xlsx",
      sourceName: "fixture-browser",
      inputType: "teste",
      total: 120,
      counts: { ready: 30, blocked: 30, discard: 30, review: 30 },
      savedDocuments: 120,
    },
  ];
  const documents = [];
  sessions.forEach((session, sessionIndex) => {
    for (let index = 0; index < 120; index += 1) {
      const serial = String(index + 1).padStart(4, "0");
      const [statusDelivered] = statuses[index % statuses.length];
      const document = index === 0 ? "DOC-HISTORY-0001" : "DOC-" + (sessionIndex ? "NEW" : "OLD") + "-" + serial;
      documents.push({
        id: session.id + "-doc-" + serial,
        sessionId: session.id,
        analyzedAt: session.analyzedAt,
        dateKey: session.dateKey,
        document,
        title: "Documento controlado " + serial,
        statusDelivered,
        currentRevision: sessionIndex ? "A" : "0",
        targetRevision: sessionIndex ? "B" : "A",
        targetRevisionStatus: "Próxima revisão prevista",
        sigemStatus: index % 3 === 0 ? "Postado" : index % 3 === 1 ? "Em Análise" : "Não Postado",
        postingStatus: index % 3 === 0 ? "POSTADO" : "PENDENTE",
        allocationStatus: index % 2 ? "Alocado" : "Não alocado",
        allocation: index % 2 ? "C1O-ALOC-CM-" + serial + "-2026" : "",
        ldVersion: sessionIndex ? "LD_001" : "LD_003",
        sheet: index % 2 ? "ET" : "CV",
        ldRow: index + 7,
        reasonCode: "MOTIVO-" + String((index % 8) + 1).padStart(2, "0"),
        reason: "Evidência operacional controlada para validação da interface e rastreabilidade.",
        fiscalComment: index % 5 === 0 ? "Comentário da Fiscal preservado." : "",
        inputSource: "Fixture Chromium",
        originalFiles: "original-" + serial + ".pdf",
        finalFiles: "final-" + serial + ".pdf",
        databook: "DATA BOOK / TESTE / " + serial,
        grdt: "GRDT-TESTE-" + serial,
      });
    }
  });
  return {
    schema: "grcon.analysis.history.backup.v1",
    exportedAt: new Date().toISOString(),
    sessions,
    documents,
    summaries: [],
  };
}

async function revealApp(page) {
  await page.addStyleTag({ content: [
    'html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script) { visibility: visible !important; }',
    '#grcon-cloud-auth { display: none !important; }',
  ].join("\n") });
}

async function reloadApp(page) {
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    if (!/ERR_ABORTED|frame was detached/i.test(message)) throw error;
    await page.waitForTimeout(250);
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  }
}

async function openHistory(page) {
  await page.locator('[data-grcon-view="analysis-history"]:visible').first().click();
  await page.locator("#grcon-analysis-history-root").waitFor({ state: "visible", timeout: 15000 });
  await page.locator(".analysis-history-phase-b").waitFor({ state: "visible", timeout: 15000 });
}

async function seedHistory(page, fixture) {
  await page.evaluate(async (payload) => {
    await window.GrconAnalysisHistory.importBackup(payload, { replace: true });
    window.dispatchEvent(new CustomEvent("grcon:analysis-history-updated"));
  }, fixture);
  await page.waitForFunction(() => {
    const node = document.querySelector("#analysis-history-result-count");
    return node && /240/.test(node.textContent || "");
  }, null, { timeout: 15000 });
}

async function installIntegrationFixture(page) {
  // Carregue os módulos reais primeiro. O carregamento do SIGEM pode mudar a
  // view ativa e a navegação de retorno pode remontar a UI do Histórico.
  await page.evaluate(async () => {
    if (window.GRCONModuleLoader?.ensureModule) {
      await window.GRCONModuleLoader.ensureModule("history");
      await window.GRCONModuleLoader.ensureModule("sigem");
    }
  });
  await openHistory(page);

  // Só depois da navegação instale os stubs de integração. Assim eles não são
  // sobrescritos por um mount tardio do módulo real antes das asserções.
  await page.evaluate(() => {
    const record = {
      id: "history-egrdt-fixture",
      egrdtNumber: "0130870-C1O-PGV-G-1558-2026",
      generatedAt: new Date().toISOString(),
      outputType: "eGRDT",
      documentCount: 1,
      files: [{ document: "DOC-HISTORY-0001", revision: "B" }],
    };
    const originalHistory = window.GrconHistory;
    window.GrconHistory = Object.assign({}, originalHistory || {}, { read: () => [record] });
    window.GrconHistoryUi = Object.assign({}, window.GrconHistoryUi || {}, {
      select: (id) => { window.__phaseBHistorySelected = id; },
    });
    window.GrconSigemPosting = Object.assign({}, window.GrconSigemPosting || {}, {
      registerGenerated: () => { window.__phaseBSigemRegistered = true; },
      read: () => [{ id: "posting-fixture", historyId: record.id }],
    });
    window.GrconSigemUi = Object.assign({}, window.GrconSigemUi || {}, {
      select: (id) => { window.__phaseBSigemSelected = id; },
    });
    const loader = window.GRCONModuleLoader;
    if (loader) {
      const ensure = typeof loader.ensure === "function" ? loader.ensure.bind(loader) : undefined;
      const ensureModule = typeof loader.ensureModule === "function" ? loader.ensureModule.bind(loader) : undefined;
      window.GRCONModuleLoader = {
        ...loader,
        ...(ensure ? { ensure } : {}),
        ensureModule: async (name) => {
          if (name === "history" || name === "sigem") return;
          return ensureModule?.(name);
        },
      };
    }
    window.dispatchEvent(new CustomEvent("grcon:analysis-history-updated"));
  });
}
async function installHistoryQueryInstrumentation(page) {
  await page.evaluate(() => {
    const core = window.GrconAnalysisHistory;
    if (!core || typeof core.queryDocuments !== "function" || typeof core.allDocuments !== "function") {
      throw new Error("GrconAnalysisHistory não está disponível para instrumentação.");
    }
    if (!core.__phaseBHistoryPerformanceInstrumented) {
      const originalQueryDocuments = core.queryDocuments.bind(core);
      const originalAllDocuments = core.allDocuments.bind(core);
      core.queryDocuments = async (...args) => {
        window.__historyQueryCalls = Number(window.__historyQueryCalls || 0) + 1;
        window.__historyQueryLog = Array.isArray(window.__historyQueryLog) ? window.__historyQueryLog : [];
        window.__historyQueryLog.push({
          query: String(args[0]?.query || ""),
          offset: Number(args[1]?.offset || 0),
          limit: Number(args[1]?.limit || 0),
        });
        return originalQueryDocuments(...args);
      };
      core.allDocuments = async (...args) => {
        const documents = await originalAllDocuments(...args);
        window.__historyLastAllDocumentsCount = Array.isArray(documents) ? documents.length : 0;
        return documents;
      };
      core.__phaseBHistoryPerformanceInstrumented = true;
    }
    window.__historyQueryCalls = 0;
    window.__historyQueryLog = [];
    window.__historyLastAllDocumentsCount = 0;
  });
}

async function resetFilters(page) {
  await page.locator("#analysis-history-search").fill("");
  await page.locator("#analysis-history-status").selectOption("ALL");
  await page.locator("#analysis-history-start").fill("");
  await page.locator("#analysis-history-end").fill("");
  await page.locator("#analysis-history-session").selectOption("");
  await page.waitForFunction(() => /240/.test(document.querySelector("#analysis-history-result-count")?.textContent || ""), null, { timeout: 8000 });
}

(async function () {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const responses = new Map();
  const metrics = {};
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      serviceWorkers: "allow",
      acceptDownloads: true,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push("pageerror: " + error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push("console: " + message.text()); });
    page.on("response", (response) => {
      try {
        responses.set(new URL(response.url()).pathname, {
          status: response.status(),
          type: response.headers()["content-type"] || "",
        });
      } catch (_) {}
    });

    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30000 });
    await revealApp(page);

    // Simula atualização PWA: remove registro/cache do carregamento inicial,
    // cria um cache antigo e deixa a versão atual instalar/ativar do zero.
    await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await caches.open("grcon-v5.40.0-browser-old-cache");
    });
    await reloadApp(page);
    await revealApp(page);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await reloadApp(page);
    await revealApp(page);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10000 });
    const postUpgradeCaches = await page.evaluate(() => caches.keys());
    assert.equal(postUpgradeCaches.includes("grcon-v5.40.0-browser-old-cache"), false, "cache antigo deve ser removido na ativação");
    assert.ok(postUpgradeCaches.some((key) => key.includes("history-perf-hardening1")), "cache atual do hardening precisa existir");

    const openStarted = Date.now();
    await openHistory(page);
    await page.waitForFunction(() => !document.querySelector(".analysis-history-loading"), null, { timeout: 10000 }).catch(() => {});
    metrics.openEmptyMs = Date.now() - openStarted;
    await page.screenshot({ path: path.join(outputDir, "01-historico-vazio-1366.png"), fullPage: true });

    const head = await page.evaluate(() => ["react-ui.css", "analysis-history.css", "analysis-history-phase-b.css"].map((name) => {
      const link = document.head.querySelector('link[href="' + name + '"]');
      return { name, inHead: Boolean(link), media: link ? link.media : "", sheet: Boolean(link && link.sheet) };
    }));
    head.forEach((entry) => {
      assert.equal(entry.inHead, true, entry.name);
      assert.equal(entry.media, "all", entry.name);
      assert.equal(entry.sheet, true, entry.name);
      const response = responses.get("/" + entry.name);
      assert.equal(response && response.status, 200, entry.name);
      assert.match(response && response.type || "", /css/i, entry.name);
    });

    const fixture = buildFixture();
    await seedHistory(page, fixture);
    await installIntegrationFixture(page);
    await installHistoryQueryInstrumentation(page);
    await page.screenshot({ path: path.join(outputDir, "02-historico-resultados-1366.png"), fullPage: true });
    assert.match(await page.locator("#analysis-history-page-status").innerText(), /Página 1 de 2/);
    assert.equal(await page.locator("#analysis-history-body tr[data-analysis-id]").count(), 200);
    metrics.desktopRows = 200;

    // O teste precisa falhar contra o padrão antigo: digitação progressiva em
    // página 2 não pode disparar query por tecla nem uma consulta intermediária
    // com o texto anterior quando setPage(1) é executado.
    await page.locator("#analysis-history-next").click();
    await page.waitForFunction(() => /Página 2 de 2/.test(document.querySelector("#analysis-history-page-status")?.textContent || ""));
    await page.waitForFunction(() => document.querySelectorAll("#analysis-history-body tr[data-analysis-id]").length === 40);
    await page.waitForTimeout(350);
    await page.evaluate(() => {
      window.__historyQueryCalls = 0;
      window.__historyQueryLog = [];
    });
    const progressiveQuery = "DOC-HISTORY-0001";
    const debounceStarted = Date.now();
    await page.locator("#analysis-history-search").pressSequentially(progressiveQuery, { delay: 50 });
    const debounceDuringCalls = await page.evaluate(() => Number(window.__historyQueryCalls || 0));
    assert.equal(debounceDuringCalls, 0, "nenhuma consulta documental deve ocorrer durante a digitação rápida");
    await page.waitForFunction((query) => {
      const count = Number(window.__historyQueryCalls || 0);
      const last = Array.isArray(window.__historyQueryLog) ? window.__historyQueryLog.at(-1) : null;
      const label = document.querySelector("#analysis-history-result-count")?.textContent || "";
      return count === 1 && last?.query === query && /2 de 240/.test(label);
    }, progressiveQuery, { timeout: 5000 });
    const debounceAfterCalls = await page.evaluate(() => Number(window.__historyQueryCalls || 0));
    const debounceLog = await page.evaluate(() => window.__historyQueryLog || []);
    assert.equal(debounceAfterCalls, 1, "somente a consulta final deve chegar ao motor após o debounce");
    assert.equal(debounceLog.at(-1)?.query, progressiveQuery);
    assert.equal(debounceLog.at(-1)?.offset, 0, "reset de página durante a digitação não pode consultar a página antiga");
    metrics.debounceProgressiveMs = Date.now() - debounceStarted;
    metrics.debounceQueryCallsDuringTyping = debounceDuringCalls;
    metrics.debounceQueryCallsAfterSettled = debounceAfterCalls;
    metrics.debounceTypedCharacters = progressiveQuery.length;
    await page.locator("#analysis-history-search").fill("");
    await page.waitForFunction(() => /240/.test(document.querySelector("#analysis-history-result-count")?.textContent || ""), null, { timeout: 5000 });

    const searchStarted = Date.now();
    await page.locator("#analysis-history-search").fill("DOC-NEW-0119");
    await page.waitForFunction(() => /1 de 240/.test(document.querySelector("#analysis-history-result-count")?.textContent || ""), null, { timeout: 5000 });
    metrics.searchMs = Date.now() - searchStarted;
    await page.locator("#analysis-history-search").fill("");
    await page.waitForFunction(() => /240/.test(document.querySelector("#analysis-history-result-count")?.textContent || ""), null, { timeout: 5000 });

    await page.locator("#analysis-history-status").selectOption("REVIEW");
    await page.waitForFunction(() => /60 de 240/.test(document.querySelector("#analysis-history-result-count")?.textContent || ""));
    assert.equal(await page.locator('button.analysis-history-kpi.review').getAttribute("aria-pressed"), "true");
    await page.locator('button.analysis-history-kpi.review').click();
    await page.waitForFunction(() => /240/.test(document.querySelector("#analysis-history-result-count")?.textContent || ""));

    await page.locator("#analysis-history-start").fill(localIso(0));
    await page.locator("#analysis-history-end").fill(localIso(0));
    await page.waitForFunction(() => /120 de 240/.test(document.querySelector("#analysis-history-result-count")?.textContent || ""));
    await page.locator("#analysis-history-start").fill(localIso(0));
    await page.locator("#analysis-history-end").fill(localIso(-5));
    const periodAlert = page.locator(".analysis-history-period-error[role=\"alert\"]");
    await periodAlert.waitFor();
    assert.match(await periodAlert.innerText(), /data final deve ser igual ou posterior/i);
    assert.equal(await page.locator("#analysis-history-export").isDisabled(), true);
    await page.screenshot({ path: path.join(outputDir, "03-historico-filtros-1366.png"), fullPage: true });
    await resetFilters(page);

    await page.locator("#analysis-history-session").selectOption("history-session-new");
    await page.waitForFunction(() => /120 de 240/.test(document.querySelector("#analysis-history-result-count")?.textContent || ""));
    await resetFilters(page);

    await page.locator('[data-analysis-quick="today"]').click();
    assert.equal(await page.locator('[data-analysis-quick="today"]').getAttribute("aria-pressed"), "true");
    await page.waitForFunction(() => /120 de 240/.test(document.querySelector("#analysis-history-result-count")?.textContent || ""));
    await page.locator('[data-analysis-quick="7days"]').click();
    assert.equal(await page.locator('[data-analysis-quick="7days"]').getAttribute("aria-pressed"), "true");
    await page.waitForFunction(() => /240/.test(document.querySelector("#analysis-history-result-count")?.textContent || ""));
    await page.locator('[data-analysis-quick="pending"]').click();
    await page.waitForFunction(() => /60 de 240/.test(document.querySelector("#analysis-history-result-count")?.textContent || ""));
    await page.locator('[data-analysis-quick="included"]').click();
    await page.waitForFunction(() => /60 de 240/.test(document.querySelector("#analysis-history-result-count")?.textContent || ""));
    await resetFilters(page);

    await page.locator("#analysis-history-status").selectOption("REVIEW");
    page.once("dialog", async (dialog) => { assert.equal(dialog.type(), "prompt"); await dialog.accept("Filtro Chromium"); });
    await page.locator("#analysis-history-save-filter").click();
    await page.locator("#analysis-history-saved-filter").selectOption({ label: "Filtro Chromium" });
    assert.equal(await page.locator("#analysis-history-status").inputValue(), "REVIEW");
    page.once("dialog", async (dialog) => { assert.equal(dialog.type(), "confirm"); await dialog.accept(); });
    await page.locator("#analysis-history-delete-filter").click();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll("#analysis-history-saved-filter option")).some((option) => option.textContent === "Filtro Chromium"));
    await resetFilters(page);

    const pageStarted = Date.now();
    await page.locator("#analysis-history-next").click();
    await page.waitForFunction(() => /Página 2 de 2/.test(document.querySelector("#analysis-history-page-status")?.textContent || ""));
    await page.waitForFunction(() => document.querySelectorAll("#analysis-history-body tr[data-analysis-id]").length === 40);
    metrics.pageChangeMs = Date.now() - pageStarted;
    assert.equal(await page.locator("#analysis-history-body tr[data-analysis-id]").count(), 40);
    await page.locator("#analysis-history-previous").click();
    await page.waitForFunction(() => /Página 1 de 2/.test(document.querySelector("#analysis-history-page-status")?.textContent || ""));
    await page.waitForFunction(() => document.querySelectorAll("#analysis-history-body tr[data-analysis-id]").length === 200);

    // Busca de rastreabilidade independente do filtro textual.
    await page.locator("#unified-search-text").fill("DOC-HISTORY-0001");
    await page.locator("#unified-search-text").press("Enter");
    await page.waitForFunction(() => Number(document.querySelector("#unified-history-count")?.textContent || 0) === 1);
    assert.equal(await page.locator("#unified-analysis-count").innerText(), "2");
    await page.locator("#unified-search-text").press("Shift+Enter");
    await page.locator("#unified-search-text").type("DOC-NEW-0002");
    assert.match(await page.locator("#unified-search-text").inputValue(), /\nDOC-NEW-0002/);
    await page.locator("#unified-search-clear").click();
    assert.equal(await page.locator("#unified-search-text").inputValue(), "");

    // Abrir detalhe do documento que possui duas ocorrências/timeline e eGRDT relacionada.
    await page.locator("#analysis-history-search").fill("DOC-HISTORY-0001");
    await page.waitForFunction(() => /2 de 240/.test(document.querySelector("#analysis-history-result-count")?.textContent || ""));
    const opener = page.locator('#analysis-history-body tr[aria-label="Abrir detalhes de DOC-HISTORY-0001"]').first();
    const detailStarted = Date.now();
    await opener.focus();
    await opener.click();
    await page.locator('.analysis-history-detail-panel[role="dialog"][aria-modal="true"]').waitFor();
    await page.waitForFunction(() => document.querySelectorAll(".analysis-timeline li").length >= 2);
    metrics.detailOpenMs = Date.now() - detailStarted;
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
    assert.equal(await page.evaluate(() => document.querySelector(".analysis-history-detail-panel").contains(document.activeElement)), true);
    assert.equal(await page.locator(".analysis-timeline li").count(), 2);
    assert.match(await page.locator(".analysis-related-egrdt-summary").innerText(), /0130870-C1O-PGV-G-1558-2026/);
    await page.screenshot({ path: path.join(outputDir, "04-historico-drawer-1366.png"), fullPage: true });
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.querySelector(".analysis-history-detail-panel").contains(document.activeElement)), true);
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.evaluate(() => document.querySelector(".analysis-history-detail-panel").contains(document.activeElement)), true);
    await page.keyboard.press("Escape");
    await page.locator(".analysis-history-detail-panel").waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    assert.match(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || ""), /^Abrir detalhes/);

    await opener.press("Enter");
    await page.locator(".analysis-history-detail-panel").waitFor();
    await page.locator(".analysis-history-detail-overlay").click({ position: { x: 5, y: 5 } });
    await page.locator(".analysis-history-detail-panel").waitFor({ state: "detached" });
    await opener.press(" ");
    await page.locator(".analysis-history-detail-panel").waitFor();

    await page.getByRole("button", { name: "Abrir eGRDT no histórico" }).click();
    await page.waitForFunction(() => window.__phaseBHistorySelected === "history-egrdt-fixture");
    // Retorna ao Histórico de análises, recompõe o fixture de globals e testa SIGEM.
    await openHistory(page);
    await installIntegrationFixture(page);
    await page.locator("#analysis-history-search").fill("DOC-HISTORY-0001");
    await page.waitForFunction(() => /2 de 240/.test(document.querySelector("#analysis-history-result-count")?.textContent || ""));
    await page.locator('#analysis-history-body tr[aria-label="Abrir detalhes de DOC-HISTORY-0001"]').first().click();
    await page.locator(".analysis-history-detail-panel").waitFor();
    await page.getByRole("button", { name: "Preparar no SIGEM" }).click();
    await page.waitForFunction(() => window.__phaseBSigemRegistered === true && window.__phaseBSigemSelected === "posting-fixture");
    await openHistory(page);
    await resetFilters(page);

    await page.evaluate(() => { window.__historyLastAllDocumentsCount = 0; });
    const excelDownload = page.waitForEvent("download");
    await page.locator("#analysis-history-export").click();
    const excel = await excelDownload;
    const excelPath = path.join(fixtureDir, "historico.xlsx");
    await excel.saveAs(excelPath);
    assert.ok(fs.statSync(excelPath).size > 1000);
    const workbook = XLSX.read(fs.readFileSync(excelPath), { type: "buffer" });
    const workbookText = JSON.stringify(workbook.SheetNames.map((name) => XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "" })));
    assert.match(workbookText, /DOC-OLD-0120/);
    assert.match(workbookText, /DOC-NEW-0120/);
    assert.match(workbookText, /DOC-HISTORY-0001/);
    const exportDocuments = await page.evaluate(() => Number(window.__historyLastAllDocumentsCount || 0));
    assert.equal(exportDocuments, 240, "exportação deve usar todos os documentos filtrados, não apenas a página visível");
    metrics.exportDocuments = exportDocuments;

    const backupDownload = page.waitForEvent("download");
    await page.locator(".analysis-history-manage > summary").click();
    await page.locator("#analysis-history-backup").click();
    const backup = await backupDownload;
    const backupPath = path.join(fixtureDir, "historico-backup.json");
    await backup.saveAs(backupPath);
    const backupJson = JSON.parse(fs.readFileSync(backupPath, "utf8"));
    assert.equal(backupJson.documents.length, 240);
    assert.equal(backupJson.sessions.length, 2);

    // Exclusão de uma sessão mantém confirmação e reduz o recorte.
    await page.locator(".analysis-history-manage > summary").click().catch(() => {});
    await page.locator("#analysis-history-session").selectOption("history-session-old");
    await page.waitForFunction(() => /120 de 240/.test(document.querySelector("#analysis-history-result-count")?.textContent || ""));
    if (!(await page.locator(".analysis-history-manage").evaluate((element) => element.open))) await page.locator(".analysis-history-manage > summary").click();
    page.once("dialog", async (dialog) => { assert.equal(dialog.type(), "confirm"); await dialog.accept(); });
    await page.locator("#analysis-history-delete-session").click();
    await page.waitForFunction(() => document.querySelectorAll("#analysis-history-session option").length === 2);

    // Limpeza total usa a confirmação reforçada existente; no fixture isolado,
    // a confirmação visual é substituída apenas por uma resposta afirmativa.
    await page.evaluate(() => {
      window.GrconEnhancements = Object.assign({}, window.GrconEnhancements || {}, { confirmAction: async () => true });
    });
    if (!(await page.locator(".analysis-history-manage").evaluate((element) => element.open))) await page.locator(".analysis-history-manage > summary").click();
    await page.locator("#analysis-history-clear").click();
    await page.waitForFunction(() => /Nenhum documento/.test(document.querySelector("#analysis-history-page-status")?.textContent || ""));

    // Restauração do backup controlado.
    page.once("dialog", async (dialog) => { assert.equal(dialog.type(), "confirm"); await dialog.accept(); });
    await page.locator("#analysis-history-restore-input").setInputFiles(backupPath);
    await page.waitForFunction(() => /240/.test(document.querySelector("#analysis-history-result-count")?.textContent || ""), null, { timeout: 10000 });

    // Responsividade: desktop/tablet preservam tabela; somente mobile estreito
    // usa cards e page size reduzido.
    const widths = {};
    for (const width of [1440, 1366, 1024, 768]) {
      await page.setViewportSize({ width, height: 900 });
      widths[width] = await page.evaluate(() => {
        const root = document.documentElement;
        const table = document.querySelector(".analysis-history-table");
        const wrap = document.querySelector(".analysis-history-table-wrap");
        return {
          page: root.scrollWidth,
          viewport: root.clientWidth,
          tableDisplay: table ? getComputedStyle(table).display : "",
          rowDisplay: document.querySelector("#analysis-history-body tr[data-analysis-id]")
            ? getComputedStyle(document.querySelector("#analysis-history-body tr[data-analysis-id]")).display
            : "",
          localScroll: table && wrap ? wrap.scrollWidth > wrap.clientWidth + 1 : false,
          rows: document.querySelectorAll("#analysis-history-body tr[data-analysis-id]").length,
        };
      });
      assert.ok(widths[width].page <= widths[width].viewport + 1, "sem scroll horizontal global em " + width);
      assert.equal(widths[width].rows, 200, "desktop/tablet devem preservar 200 registros por página em " + width);
    }
    assert.notEqual(widths[768].tableDisplay, "block", "768 px deve continuar em tabela, não card wall");
    assert.notEqual(widths[768].rowDisplay, "grid", "768 px não deve transformar linhas em cards");
    assert.equal(widths[768].localScroll, true, "768 px deve usar scroll horizontal local da tabela");

    const mobileRenderStarted = Date.now();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const status = document.querySelector("#analysis-history-page-status")?.textContent || "";
      return /Página 1 de 10/.test(status)
        && document.querySelectorAll("#analysis-history-body tr[data-analysis-id]").length === 25;
    }, null, { timeout: 8000 });
    metrics.mobileRenderMs = Date.now() - mobileRenderStarted;
    const mobile = await page.evaluate(() => {
      const root = document.documentElement;
      const resultRoot = document.querySelector(".analysis-history-results");
      const rows = Array.from(document.querySelectorAll("#analysis-history-body tr[data-analysis-id]"));
      const labels = rows.slice(0, 3).flatMap((row) => Array.from(row.querySelectorAll("td")).map((cell) => getComputedStyle(cell, "::before").content));
      const kpis = Array.from(document.querySelectorAll(".analysis-history-kpi")).map((node) => node.getBoundingClientRect());
      return {
        page: root.scrollWidth,
        viewport: root.clientWidth,
        cards: rows.length,
        scrollHeight: root.scrollHeight,
        resultDomElements: resultRoot ? resultRoot.querySelectorAll("*").length : 0,
        rowDisplay: rows[0] ? getComputedStyle(rows[0]).display : "",
        labels: labels.filter((label) => label && label !== "none").length,
        kpiRows: new Set(kpis.map((box) => Math.round(box.top))).size,
      };
    });
    assert.ok(mobile.page <= mobile.viewport + 1);
    assert.equal(mobile.cards, 25);
    assert.equal(mobile.rowDisplay, "grid");
    assert.ok(mobile.scrollHeight < 20000, "390 px não pode voltar a gerar documento >20.000 px");
    assert.ok(mobile.labels >= 8);
    assert.ok(mobile.kpiRows >= 2);
    metrics.mobileCards = mobile.cards;
    metrics.mobileScrollHeight = mobile.scrollHeight;
    metrics.mobileResultDomElements = mobile.resultDomElements;
    await page.screenshot({ path: path.join(outputDir, "05-historico-mobile-390.png"), fullPage: true });

    const mobilePageStarted = Date.now();
    await page.locator("#analysis-history-next").click();
    await page.waitForFunction(() => /Página 2 de 10/.test(document.querySelector("#analysis-history-page-status")?.textContent || ""));
    await page.waitForFunction(() => document.querySelectorAll("#analysis-history-body tr[data-analysis-id]").length === 25);
    metrics.mobilePageChangeMs = Date.now() - mobilePageStarted;

    // Mudança de page size precisa voltar para página 1 e 768 px continua tabela.
    await page.setViewportSize({ width: 768, height: 900 });
    await page.waitForFunction(() => /Página 1 de 2/.test(document.querySelector("#analysis-history-page-status")?.textContent || ""));
    await page.waitForFunction(() => document.querySelectorAll("#analysis-history-body tr[data-analysis-id]").length === 200);
    const tabletAfterResize = await page.evaluate(() => {
      const root = document.documentElement;
      const table = document.querySelector(".analysis-history-table");
      const wrap = document.querySelector(".analysis-history-table-wrap");
      const row = document.querySelector("#analysis-history-body tr[data-analysis-id]");
      return {
        page: root.scrollWidth,
        viewport: root.clientWidth,
        tableDisplay: table ? getComputedStyle(table).display : "",
        rowDisplay: row ? getComputedStyle(row).display : "",
        localScroll: table && wrap ? wrap.scrollWidth > wrap.clientWidth + 1 : false,
      };
    });
    assert.ok(tabletAfterResize.page <= tabletAfterResize.viewport + 1);
    assert.notEqual(tabletAfterResize.tableDisplay, "block");
    assert.notEqual(tabletAfterResize.rowDisplay, "grid");
    assert.equal(tabletAfterResize.localScroll, true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => /Página 1 de 10/.test(document.querySelector("#analysis-history-page-status")?.textContent || ""));
    await page.waitForFunction(() => document.querySelectorAll("#analysis-history-body tr[data-analysis-id]").length === 25);

    await page.locator("#analysis-history-search").fill("DOC-HISTORY-0001");
    await page.waitForFunction(() => /2 de 240/.test(document.querySelector("#analysis-history-result-count")?.textContent || ""));
    await page.locator('#analysis-history-body tr[aria-label="Abrir detalhes de DOC-HISTORY-0001"]').first().click();
    const drawerMobile = await page.evaluate(() => {
      const drawer = document.querySelector(".analysis-history-detail-panel");
      const body = document.querySelector(".analysis-history-detail-body");
      return {
        width: drawer?.getBoundingClientRect().width || 0,
        viewport: innerWidth,
        scroll: body ? body.scrollHeight >= body.clientHeight : false,
      };
    });
    assert.ok(drawerMobile.width <= drawerMobile.viewport);
    assert.equal(drawerMobile.scroll, true);
    await page.locator(".analysis-history-detail-overlay").click({ position: { x: 4, y: 4 } });

    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await page.screenshot({ path: path.join(outputDir, "06-historico-dark-390.png"), fullPage: true });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.screenshot({ path: path.join(outputDir, "07-historico-dark-1366.png"), fullPage: true });
    await page.evaluate(() => { document.documentElement.dataset.theme = ""; });

    // Repetição de navegação não pode duplicar a ilha/drawer.
    for (let index = 0; index < 3; index += 1) {
      await page.locator('[data-grcon-view="control"]:visible').first().click();
      await openHistory(page);
      assert.equal(await page.locator(".analysis-history-phase-b").count(), 1);
      assert.equal(await page.locator(".analysis-history-detail-panel").count(), 0);
    }

    // Cache quente/reload com SW controlador.
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await reloadApp(page);
    await revealApp(page);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10000 });
    await openHistory(page);
    const warmCaches = await page.evaluate(() => caches.keys());
    assert.ok(warmCaches.some((key) => key.includes("history-perf-hardening1")));

    ["/react-ui.css", "/analysis-history.css", "/analysis-history-phase-b.css", "/react-dist/historico-analises-app.js"].forEach((pathname) => {
      const response = responses.get(pathname);
      assert.equal(response && response.status, 200, pathname);
    });

    const relevantErrors = errors.filter((entry) => /ReferenceError|TypeError|Unhandled|React|duplicate key|Content Security Policy|CSP|service worker|404/i.test(entry));
    assert.deepEqual(relevantErrors, []);

    const payload = {
      passed: true,
      metrics,
      widths,
      mobile,
      drawerMobile,
      head,
      postUpgradeCaches,
      warmCaches,
      errors,
    };
    fs.writeFileSync(path.join(outputDir, "metrics.json"), JSON.stringify(payload, null, 2));
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
