const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";
const artifactDir = path.resolve(process.cwd(), "artifacts", "historico-egrdt");
fs.mkdirSync(artifactDir, { recursive: true });

function isExpectedBootstrapConsoleError(message) {
  const text = String(message || "");
  return text.includes("[GRCON Storage][initialize]")
    && text.includes("DependencyError")
    && text.includes("módulos de Histórico e Postagem SIGEM ainda não estão disponíveis");
}

function record(id, sequence, generatedAt, sheet = "N-1710") {
  const code = "RL-5290.00-22313-91B-C1O-" + String(sequence).padStart(3, "0");
  return {
    id,
    egrdtNumber: "0130870-C1O-PGV-G-" + String(sequence).padStart(4, "0") + "-2026 - eGRDT",
    generatedAt,
    outputType: sequence % 2 ? "ZIP + PDFs" : "PDFs",
    ldName: "LD_001",
    sourceName: "Fixture Chromium",
    createdByName: "Teste Chromium",
    createdByEmail: "teste@example.com",
    allocations: ["3.1.1.1"],
    files: [{
      document: code,
      originalName: code + "_0.pdf",
      finalName: code + "_0.pdf",
      revision: "0",
      grdtRevision: "0",
      revisionSuggested: "0",
      revisionManual: sequence === 2,
      sigemStatus: "POSTADO",
      allocation: "3.1.1.1",
      ldPrazo: "A01",
      sheet,
    }],
  };
}

const fixtures = [
  record("fixture-a", 1, "2026-09-01T12:00:00-03:00", "ET"),
  record("fixture-b", 2, "2026-09-15T12:00:00-03:00", "N-1710"),
  record("fixture-c", 3, "2026-09-30T12:00:00-03:00", "CV"),
];

const postingFixtures = [
  { id: "posting-b", historyId: "fixture-b", egrdtNumber: fixtures[1].egrdtNumber, status: "POSTADO", files: [] },
  { id: "posting-c", historyId: "fixture-c", egrdtNumber: fixtures[2].egrdtNumber, status: "PENDENCIA", files: [] },
];

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
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
      return;
    } catch (error) {
      lastError = error;
      const message = String(error && error.message ? error.message : error);
      if (!/Execution context was destroyed|navigation|frame was detached|Timeout/i.test(message)) throw error;
      await page.waitForTimeout(150);
    }
  }
  throw lastError || new Error("Service Worker não estabilizou a página do Histórico de eGRDTs.");
}

async function openHistory(page) {
  await page.evaluate(async () => {
    if (window.GRCONModuleLoader?.ensureModule) await window.GRCONModuleLoader.ensureModule("history");
    window.GrconHistoryUi?.activate?.("history");
  });
  await page.locator("#history-date-start").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => Boolean(document.querySelector('link[href="history-phase-b.css"]')));
}

async function installFixtureAdapters(page, rows = fixtures, postings = postingFixtures) {
  await page.evaluate(({ rows, postings }) => {
    window.__historyFixtureRecords = rows.map((row) => window.GrconHistory.cleanRecord(row));
    window.__historyPostingFixtures = postings.map((row) => ({ ...row }));
    window.__postingReadCalls = 0;
    window.__historyOriginalRead = window.__historyOriginalRead || window.GrconHistory.read;
    window.__historyOriginalDeleteOne = window.__historyOriginalDeleteOne || window.GrconHistory.deleteOne;
    window.__historyOriginalUpdateNumber = window.__historyOriginalUpdateNumber || window.GrconHistory.updateNumber;
    window.__postingOriginalRead = window.__postingOriginalRead || window.GrconSigemPosting?.read;

    window.GrconHistory.read = () => window.__historyFixtureRecords.map((row) => ({
      ...row,
      allocations: [...(row.allocations || [])],
      files: row.files.map((file) => ({ ...file })),
    }));

    if (window.GrconSigemPosting) {
      window.GrconSigemPosting.read = () => {
        window.__postingReadCalls += 1;
        return window.__historyPostingFixtures.map((row) => ({ ...row, files: [...(row.files || [])] }));
      };
    }

    window.dispatchEvent(new CustomEvent("grcon:history-updated", { detail: { fixture: true } }));
    window.GrconHistoryUi?.render?.();
  }, { rows, postings });
  await page.waitForTimeout(220);
}

async function expectCount(page, count) {
  await page.waitForFunction((expected) => {
    const text = (document.querySelector("#history-result-count")?.textContent || "").trim();
    const prefix = text.split(" eGRDT")[0] || "";
    const digits = Array.from(prefix).filter((char) => char >= "0" && char <= "9").join("");
    return digits !== "" && Number(digits) === expected;
  }, count, { timeout: 5000 });
}

async function resetFilters(page) {
  await page.locator("#history-search").fill("");
  await page.locator("#history-year").selectOption("");
  await page.locator("#history-type").selectOption("");
  await page.locator("#history-posting-status").selectOption("");
  await page.locator("#history-sort").selectOption("recent");
  await page.locator("#history-date-start").fill("");
  await page.locator("#history-date-end").fill("");
  await page.locator("#history-period-document-type").selectOption("");
  await page.waitForTimeout(170);
}

async function shot(page, name, fullPage = true) {
  await page.screenshot({ path: path.join(artifactDir, name), fullPage });
}

function intersectsRect(a, b) {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function visualGap(a, b) {
  const horizontal = Math.max(b.left - a.right, a.left - b.right, 0);
  const vertical = Math.max(b.top - a.bottom, a.top - b.bottom, 0);
  return Math.max(horizontal, vertical);
}

async function waitForHistoryMascot(page) {
  await page.evaluate(() => window.GRCONMascot?.refresh?.());
  await page.waitForFunction(() => {
    const mascot = document.querySelector('#grcon-context-mascot[data-context="history"]');
    return Boolean(mascot && mascot.getBoundingClientRect().width > 0 && mascot.getBoundingClientRect().height > 0);
  }, null, { timeout: 15000 });
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function headerGeometry(page, label) {
  await waitForHistoryMascot(page);
  const geometry = await page.evaluate(() => {
    const rect = (node) => {
      const value = node.getBoundingClientRect();
      return {
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      };
    };
    const summary = document.querySelector(".history-manage > summary");
    const details = document.querySelector(".history-manage");
    const mascot = document.querySelector('#grcon-context-mascot[data-context="history"]');
    const header = document.querySelector(".history-phase-b-heading > .ui-page-header");
    const title = header?.querySelector("h2");
    const pills = Array.from(header?.querySelectorAll(".ui-meta-pill") || []);
    const menu = document.querySelector(".history-manage-menu");
    return {
      summary: rect(summary),
      details: rect(details),
      mascot: rect(mascot),
      header: rect(header),
      title: title ? rect(title) : null,
      pills: pills.map(rect),
      menu: details.open && menu ? rect(menu) : null,
      menuOpen: details.open,
      mascotContext: mascot.dataset.context,
      mascotPose: mascot.dataset.pose,
      mascotPointerEvents: getComputedStyle(mascot).pointerEvents,
      summaryText: summary.textContent.trim(),
      pillTexts: pills.map((node) => node.textContent.trim()),
      pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      summaryTabIndex: summary.tabIndex,
    };
  });

  assert.equal(geometry.mascotContext, "history", label + ": mascote deve permanecer no contexto history");
  assert.equal(geometry.mascotPose, "history", label + ": pose history deve permanecer ativa");
  assert.equal(geometry.mascotPointerEvents, "none", label + ": mascote contextual não pode interceptar cliques");
  assert.equal(geometry.summaryText, "Gerenciar histórico", label + ": texto real da ação deve ser preservado");
  assert.equal(geometry.pills.length, 2, label + ": duas meta pills devem permanecer no cabeçalho");
  assert.equal(intersectsRect(geometry.summary, geometry.mascot), false, label + ": botão não pode intersectar mascote");
  assert.equal(intersectsRect(geometry.header, geometry.summary), false, label + ": header não pode intersectar botão");
  if (geometry.title) assert.equal(intersectsRect(geometry.title, geometry.summary), false, label + ": título não pode intersectar botão");
  for (const pill of geometry.pills) {
    assert.equal(intersectsRect(pill, geometry.summary), false, label + ": meta pill não pode intersectar botão");
  }
  const gapPx = visualGap(geometry.summary, geometry.mascot);
  assert.ok(gapPx >= 8, label + ": botão e mascote precisam manter gap visual >= 8px");
  assert.ok(geometry.pageOverflowX <= 1, label + ": não pode existir overflow horizontal global");
  assert.ok(geometry.summaryTabIndex >= 0, label + ": summary deve permanecer focável");

  console.log("history-header-geometry", JSON.stringify({ label, gapPx, ...geometry }));
  return { ...geometry, gapPx };
}

async function validateClosedHeader(page, width, height, screenshotName = "") {
  await page.setViewportSize({ width, height });
  const details = page.locator(".history-manage");
  if (await details.getAttribute("open") !== null) await page.locator(".history-manage > summary").click();
  await page.locator(".history-phase-b-heading").scrollIntoViewIfNeeded();
  const geometry = await headerGeometry(page, String(width));
  if (screenshotName) await shot(page, screenshotName, true);
  return geometry;
}

async function validateOpenMenu(page, width, height, screenshotName = "") {
  await page.setViewportSize({ width, height });
  const details = page.locator(".history-manage");
  if (await details.getAttribute("open") === null) await page.locator(".history-manage > summary").click();
  await page.locator(".history-manage-menu").waitFor({ state: "visible" });
  const geometry = await headerGeometry(page, String(width) + "-open");
  assert.ok(geometry.menu, "menu aberto precisa ter geometria");
  assert.equal(intersectsRect(geometry.menu, geometry.mascot), false, String(width) + ": menu aberto não pode intersectar mascote");
  assert.equal(await page.locator("#history-clear").isVisible(), true, String(width) + ": Limpar histórico deve continuar acessível");
  if (screenshotName) await shot(page, screenshotName, true);
  return geometry;
}

async function setSharedHistoryFixture(page, enabled) {
  await page.evaluate((shared) => {
    const state = window.GrconCloud?.state;
    if (!state) return;
    if (!Object.prototype.hasOwnProperty.call(window, "__historyOriginalMembership")) {
      window.__historyOriginalMembership = state.membership || null;
    }
    state.membership = shared
      ? { ...(window.__historyOriginalMembership || {}), workspace_id: "fixture-workspace" }
      : window.__historyOriginalMembership;
    window.dispatchEvent(new CustomEvent("grcon:history-react-refresh", { detail: { sharedFixture: shared } }));
  }, enabled);
  await page.waitForTimeout(180);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (!isExpectedBootstrapConsoleError(text)) errors.push(text);
  });

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitForStableServiceWorkerPage(page);
    await revealApp(page);
    await openHistory(page);

    await installFixtureAdapters(page, [], []);
    await expectCount(page, 0);
    await shot(page, "01-history-egrdt-empty-1366.png");

    await installFixtureAdapters(page);
    await expectCount(page, 3);
    assert.equal(await page.locator("#history-list [data-history-id]").count(), 3);
    await shot(page, "02-history-egrdt-results-1366.png");

    // Hardening corretivo integrado: o botão administrativo e o mascote real
    // precisam ocupar áreas independentes em todos os viewports suportados.
    const geometryByViewport = {};
    geometryByViewport["1440"] = await validateClosedHeader(page, 1440, 900, "01-history-header-mascot-1440.png");
    geometryByViewport["1366"] = await validateClosedHeader(page, 1366, 900, "02-history-header-mascot-1366.png");
    geometryByViewport["1024"] = await validateClosedHeader(page, 1024, 820, "03-history-header-mascot-1024.png");
    geometryByViewport["768"] = await validateClosedHeader(page, 768, 900, "04-history-header-mascot-768.png");
    geometryByViewport["620"] = await validateClosedHeader(page, 620, 900);
    geometryByViewport["430"] = await validateClosedHeader(page, 430, 900);
    geometryByViewport["390"] = await validateClosedHeader(page, 390, 844, "05-history-header-mascot-390.png");

    // Acessibilidade do <details>/<summary>: foco e Enter continuam funcionais.
    await page.setViewportSize({ width: 1366, height: 900 });
    const manageSummary = page.locator(".history-manage > summary");
    await manageSummary.focus();
    assert.equal(await manageSummary.evaluate((node) => document.activeElement === node), true);
    await page.keyboard.press("Enter");
    assert.equal(await page.locator(".history-manage").getAttribute("open") !== null, true);
    await page.keyboard.press("Enter");
    assert.equal(await page.locator(".history-manage").getAttribute("open") === null, true);

    const open1366 = await validateOpenMenu(page, 1366, 900, "06-history-manage-open-1366.png");
    assert.ok(open1366.gapPx >= 8);
    await page.locator(".history-manage > summary").click();

    const open390 = await validateOpenMenu(page, 390, 844, "07-history-manage-open-390.png");
    assert.ok(open390.gapPx >= 8);
    await page.locator(".history-manage > summary").click();

    // Histórico compartilhado tem texto maior e precisa preservar a mesma geometria.
    await setSharedHistoryFixture(page, true);
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.waitForFunction(() => /Histórico compartilhado/i.test(document.querySelector(".history-phase-b-heading")?.textContent || ""));
    const sharedGeometry = await headerGeometry(page, "1366-shared");
    assert.ok(sharedGeometry.pillTexts.some((text) => /Histórico compartilhado/i.test(text)));
    await setSharedHistoryFixture(page, false);

    // Dark mode mantém contraste/layout; o teste geométrico continua obrigatório.
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await validateClosedHeader(page, 1366, 900, "08-history-header-dark-1366.png");
    await validateClosedHeader(page, 390, 844, "09-history-header-dark-390.png");
    await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
    await page.setViewportSize({ width: 1366, height: 900 });

    console.log("history-header-gaps", JSON.stringify(Object.fromEntries(
      Object.entries(geometryByViewport).map(([key, value]) => [key, value.gapPx]),
    )));

    await page.locator("#history-year").selectOption("2026");
    await expectCount(page, 3);
    assert.ok(await page.locator(".history-active-filters").isVisible());
    await shot(page, "03-history-egrdt-filters-1366.png");
    await page.locator("#history-year").selectOption("");

    // Regressão crítica: intervalo completo deve produzir somente B em lista,
    // resumo e fachada legada.
    await page.locator("#history-date-start").fill("2026-09-10");
    await page.locator("#history-date-end").fill("2026-09-20");
    await expectCount(page, 1);
    const afterDate = await page.evaluate(() => ({
      filtered: Array.isArray(window.GrconHistoryUi?.state?.filtered)
        ? window.GrconHistoryUi.state.filtered.map((item) => item.egrdtNumber)
        : null,
      selectedId: window.GrconHistoryUi?.state?.selectedId || "",
    }));
    assert.deepEqual(afterDate.filtered, [fixtures[1].egrdtNumber]);
    assert.ok(afterDate.selectedId);
    assert.match(await page.locator("#history-summary").innerText(), /eGRDTs\s*1/i);
    await shot(page, "04-history-egrdt-date-filter-1366.png");

    await page.evaluate(() => window.GrconRetomar?.render?.());
    await page.waitForTimeout(80);
    assert.match(await page.locator("#history-summary").innerText(), /eGRDTs\s*1/i);

    // Inicial apenas → B + C.
    await page.locator("#history-date-end").fill("");
    await expectCount(page, 2);
    let listText = await page.locator("#history-list").innerText();
    assert.doesNotMatch(listText, /0001-2026/);
    assert.match(listText, /0002-2026/);
    assert.match(listText, /0003-2026/);

    // Final apenas → A + B.
    await page.locator("#history-date-start").fill("");
    await page.locator("#history-date-end").fill("2026-09-20");
    await expectCount(page, 2);
    listText = await page.locator("#history-list").innerText();
    assert.match(listText, /0001-2026/);
    assert.match(listText, /0002-2026/);
    assert.doesNotMatch(listText, /0003-2026/);

    // Limpar período → A + B + C.
    await page.locator("#history-clear-period").click();
    await expectCount(page, 3);
    assert.equal(await page.locator("#history-date-start").inputValue(), "");
    assert.equal(await page.locator("#history-date-end").inputValue(), "");

    // Período inválido precisa bloquear exportação e exibir mensagem.
    await page.locator("#history-date-start").fill("2026-09-25");
    await page.locator("#history-date-end").fill("2026-09-20");
    assert.equal(await page.locator("#history-export-period").isDisabled(), true);
    assert.match(await page.locator("#history-period-error").innerText(), /igual ou posterior/i);
    await page.locator("#history-clear-period").click();

    // Filtros combinados: data + postagem, data + família, ano + data.
    await page.locator("#history-date-start").fill("2026-09-10");
    await page.locator("#history-date-end").fill("2026-09-20");
    await page.locator("#history-posting-status").selectOption("POSTADO");
    await expectCount(page, 1);
    assert.match(await page.locator("#history-list").innerText(), /0002-2026/);
    await page.locator("#history-posting-status").selectOption("");

    await page.locator("#history-period-document-type").selectOption("N-1710");
    await expectCount(page, 1);
    assert.match(await page.locator("#history-list").innerText(), /0002-2026/);
    await page.locator("#history-period-document-type").selectOption("");

    await page.locator("#history-year").selectOption("2026");
    await expectCount(page, 1);
    await resetFilters(page);
    await expectCount(page, 3);

    // Busca progressiva: antes de 120 ms o recorte anterior permanece; depois,
    // o termo final passa a valer.
    await page.locator("#history-search").fill("0");
    await page.locator("#history-search").fill("00");
    await page.locator("#history-search").fill("0001");
    await page.waitForTimeout(45);
    assert.match(await page.locator("#history-result-count").innerText(), /^3 eGRDT/);
    await page.waitForTimeout(130);
    await expectCount(page, 1);
    await page.locator("#history-search").fill("");
    await page.waitForTimeout(150);
    await expectCount(page, 3);

    await page.locator('[data-history-id="fixture-b"]').click();
    await page.locator("#history-detail").waitFor({ state: "visible" });
    await shot(page, "05-history-egrdt-detail-1366.png");
    await page.locator(".history-workflow-section").scrollIntoViewIfNeeded();
    await shot(page, "06-history-egrdt-workflow-1366.png");

    // Ações operacionais em navegador real, sem chamar webhook:
    // Teams abre somente a confirmação (Enviar permanece desabilitado) e o
    // teste fecha o diálogo sem marcar a confirmação.
    const teamsButton = page.locator(".egrdt-teams-notify-button");
    assert.equal(await teamsButton.count(), 1);
    await teamsButton.click();
    await page.locator("#egrdt-teams-dialog[open]").waitFor({ state: "visible" });
    assert.equal(await page.locator("#egrdt-teams-dialog-send").isDisabled(), true);
    await page.locator('#egrdt-teams-dialog button[value="cancel"]').first().click();
    await page.locator("#egrdt-teams-dialog").waitFor({ state: "hidden" });

    // A resposta de e-mail abre apenas a prévia. Não aciona cliente de e-mail,
    // clipboard nem qualquer integração externa.
    await page.locator('[data-history-action="email-reply"]').click();
    await page.locator("#egrdt-email-panel").waitFor({ state: "visible" });
    await page.locator('[data-egrdt-email-action="close"]').click();
    await page.locator("#egrdt-email-panel").waitFor({ state: "hidden" });

    // Preparar no SIGEM é testado por último porque a ação real navega para o
    // módulo SIGEM. O navegador do CI usa apenas o armazenamento efêmero.
    await page.locator('[data-history-action="prepare-sigem"]').click();
    await page.waitForTimeout(80);
    await page.evaluate(() => window.GrconHistoryUi?.activate?.("history"));
    await page.locator("#history-detail").waitFor({ state: "visible" });

    // Editor: inválido, duplicado e válido sem tocar no Core persistente.
    await page.locator(".history-detail-more > summary").click();
    await page.locator('[data-history-action="edit"]').click();
    await shot(page, "07-history-egrdt-edit-number-1366.png");

    await page.evaluate(() => {
      window.GrconHistory.updateNumber = (id, value) => {
        if (value === "12") return { updated: false, error: "Informe exatamente 4 dígitos." };
        if (value === "0001") return { updated: false, error: "Esse número já existe no histórico." };
        const source = window.__historyFixtureRecords.find((row) => row.id === id);
        const updated = { ...source, egrdtNumber: source.egrdtNumber.replace(/-\d{4}-2026/, "-" + value + "-2026") };
        return { updated: true, previous: source.egrdtNumber, record: updated, records: window.__historyFixtureRecords };
      };
    });

    await page.locator("#history-number-input").fill("12");
    await page.locator('[data-history-action="save"]').click();
    assert.equal(await page.locator("#history-number-input").getAttribute("aria-invalid"), "true");

    await page.locator("#history-number-input").fill("0001");
    await page.locator('[data-history-action="save"]').click();
    assert.equal(await page.locator("#history-number-input").getAttribute("aria-invalid"), "true");

    await page.locator("#history-number-input").fill("0042");
    await page.locator('[data-history-action="save"]').click();
    await page.waitForTimeout(80);
    assert.equal(await page.locator("#history-number-editor").count(), 0);

    // Exclusão local segura: mock altera somente fixtures em memória.
    await page.locator('[data-history-id="fixture-b"]').click();
    await page.locator(".history-detail-more > summary").click();
    await page.evaluate(() => {
      window.confirm = () => true;
      window.GrconHistory.deleteOne = (id) => {
        window.__historyFixtureRecords = window.__historyFixtureRecords.filter((row) => row.id !== id);
        return { deleted: true, records: window.__historyFixtureRecords };
      };
    });
    await page.locator('[data-history-action="delete"]').click();
    await expectCount(page, 2);
    await installFixtureAdapters(page);
    await expectCount(page, 3);

    // Responsividade 390 px: lista fica controlada por scroll interno.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#history-list").scrollIntoViewIfNeeded();
    await shot(page, "08-history-egrdt-mobile-390.png");
    await page.locator('[data-history-id="fixture-b"]').click();
    await page.locator("#history-detail").scrollIntoViewIfNeeded();
    await shot(page, "09-history-egrdt-mobile-detail-390.png");

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.locator(".history-phase-b").scrollIntoViewIfNeeded();
    await shot(page, "10-history-egrdt-dark-1366.png");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, "11-history-egrdt-dark-390.png");
    await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
    await page.setViewportSize({ width: 1366, height: 900 });

    // Volume: 1000 registros; fachada mantém todos, DOM inicial <= 200.
    const volumeRows = Array.from({ length: 1000 }, (_, index) => {
      const sequence = index + 1;
      const day = String((index % 28) + 1).padStart(2, "0");
      return record("volume-" + sequence, sequence, "2026-09-" + day + "T12:00:00-03:00", sequence % 3 === 0 ? "ET" : "N-1710");
    });
    await installFixtureAdapters(page, volumeRows, []);
    await expectCount(page, 1000);
    const volumeSnapshot = await page.evaluate(() => ({
      rendered: document.querySelectorAll("#history-list [data-history-id]").length,
      filtered: window.GrconHistoryUi?.state?.filtered?.length || 0,
      performance: window.GrconHistoryUi?.performanceSnapshot?.(),
      postingReads: window.__postingReadCalls,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    console.log("volume-1000", JSON.stringify(volumeSnapshot));
    assert.equal(volumeSnapshot.filtered, 1000);
    assert.ok(volumeSnapshot.rendered <= 200);
    assert.ok((volumeSnapshot.performance?.postingReadsLastRender || 0) <= 1);
    assert.ok(volumeSnapshot.scrollHeight < 15000, "scroll interno deve impedir página gigantesca no volume inicial");

    const dateStarted = Date.now();
    await page.locator("#history-date-start").fill("2026-09-15");
    await page.waitForFunction(() => !/^1000 eGRDT/.test(document.querySelector("#history-result-count")?.textContent || ""));
    const dateFilterMs = Date.now() - dateStarted;

    await page.locator("#history-date-start").fill("");
    await page.waitForTimeout(80);
    const searchStarted = Date.now();
    await page.locator("#history-search").fill("1000-2026");
    await expectCount(page, 1);
    const searchMs = Date.now() - searchStarted;

    await page.locator("#history-search").fill("");
    await page.waitForTimeout(150);
    await expectCount(page, 1000);
    const selectStarted = Date.now();
    await page.locator("#history-list [data-history-id]").nth(1).click();
    const selectedId = await page.locator("#history-list [data-history-id]").nth(1).getAttribute("data-history-id");
    await page.waitForFunction((id) => window.GrconHistoryUi?.state?.selectedId === id, selectedId);
    const selectMs = Date.now() - selectStarted;

    console.log("performance-1000", JSON.stringify({ dateFilterMs, searchMs, selectMs }));
    assert.ok(dateFilterMs < 2000, "filtro de data deve permanecer fluido");
    assert.ok(searchMs < 2500, "busca com debounce deve permanecer fluida");
    assert.ok(selectMs < 1500, "seleção deve permanecer fluida");

    assert.deepEqual(errors, []);
    console.log("historico-egrdt-browser FASE B: PASS");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
