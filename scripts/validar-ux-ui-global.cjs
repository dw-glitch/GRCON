"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const baseUrl = process.env.GRCON_UX_UI_URL || "http://127.0.0.1:8765";
const outputDir = path.join(process.cwd(), "artifacts", "ux-ui-audit");
fs.mkdirSync(outputDir, { recursive: true });

function expectedExternal(message) {
  return /supabase|Failed to fetch|net::ERR_|ERR_CONNECTION|storage.*initialize|favicon/i.test(String(message || ""));
}

async function installQaShellBypass(page) {
  await page.addInitScript(() => {
    const css = [
      "html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script){visibility:visible!important}",
      "#grcon-cloud-auth{display:none!important;pointer-events:none!important}",
    ].join("\n");
    const install = () => {
      if (document.getElementById("grcon-ux-ui-qa-style")) return true;
      const host = document.head || document.documentElement;
      if (!host) return false;
      const style = document.createElement("style");
      style.id = "grcon-ux-ui-qa-style";
      style.textContent = css;
      host.appendChild(style);
      return true;
    };
    if (!install()) {
      document.addEventListener("DOMContentLoaded", install, { once: true });
    }
  });
}

// A classe do body sozinha não ativa todos os tokens de tema do GRCON.
async function setQaTheme(page, dark) {
  await page.evaluate((darkMode) => {
    const html = document.documentElement;
    const button = document.querySelector("#ui-theme-toggle");
    // Preferir a mesma ação do usuário para disparar eventos e sincronizar tokens.
    if (button && (html.dataset.theme === "dark") !== darkMode) {
      button.click();
      return;
    }
    html.dataset.theme = darkMode ? "dark" : "light";
    html.style.colorScheme = darkMode ? "dark" : "light";
    html.classList.toggle("theme-dark", darkMode);
    document.body.classList.toggle("p2-dark", darkMode);
  }, dark);
  // O tema altera as cores por transições CSS. Medir no mesmo quadro pode
  // capturar a cor anterior e reprovar um tema que ainda está sendo pintado.
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations()
      .filter(animation => animation instanceof CSSTransition)
      .map(animation => animation.finished.catch(() => {})));
  });
}

async function clickVisible(page, selector) {
  return page.evaluate((wanted) => {
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const node = [...document.querySelectorAll(wanted)].find(visible);
    if (!node) return false;
    node.click();
    return true;
  }, selector);
}

async function auditGeometry(page, label) {
  const result = await page.evaluate(() => {
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const rectOf = (node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };

    const viewport = { width: innerWidth, height: innerHeight };
    const pageOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const conferenceWrap = document.querySelector(".pc-table-wrap");
    const conferenceTable = document.querySelector(".pc-document-table");
    const conferenceOverflow = {
      wrapClientWidth: conferenceWrap?.clientWidth || 0,
      wrapScrollWidth: conferenceWrap?.scrollWidth || 0,
      tableClientWidth: conferenceTable?.clientWidth || 0,
      tableScrollWidth: conferenceTable?.scrollWidth || 0,
    };
    const conferenceHeaderNodes = conferenceTable ? [...conferenceTable.querySelectorAll("thead th")].filter(visible) : [];
    const conferenceHeaderLabels = conferenceHeaderNodes.map((node) => node.textContent.trim());
    const conferenceHeaderRects = conferenceHeaderNodes.map(rectOf);
    const conferenceBodyRects = conferenceTable
      ? [...conferenceTable.querySelectorAll("tbody tr:first-child > td")].filter(visible).map(rectOf)
      : [];
    const headerTopValues = conferenceHeaderRects.map((rect) => rect.top);
    const headerHeightValues = conferenceHeaderRects.map((rect) => rect.height);
    const headerEdgeDeltas = conferenceHeaderRects.map((rect, index) => {
      const body = conferenceBodyRects[index];
      return body ? Math.max(Math.abs(rect.left - body.left), Math.abs(rect.right - body.right)) : Infinity;
    });
    const conferenceHeader = {
      labels: conferenceHeaderLabels,
      count: conferenceHeaderNodes.length,
      emptyCount: conferenceHeaderLabels.filter((value) => !value).length,
      topSpread: headerTopValues.length ? Math.max(...headerTopValues) - Math.min(...headerTopValues) : 0,
      heightSpread: headerHeightValues.length ? Math.max(...headerHeightValues) - Math.min(...headerHeightValues) : 0,
      observationTopDelta: conferenceHeaderRects.length === 6 ? Math.abs(conferenceHeaderRects[5].top - conferenceHeaderRects[0].top) : Infinity,
      columnEdgeDelta: headerEdgeDeltas.length ? Math.max(...headerEdgeDeltas) : 0,
      rects: conferenceHeaderRects,
    };
    const conferenceOverflowNodes = conferenceTable
      ? [...conferenceTable.querySelectorAll("*")]
          .filter(visible)
          .map((node) => ({
            target: node.className || node.tagName,
            text: node.textContent.trim().slice(0, 120),
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            overflow: node.scrollWidth - node.clientWidth,
          }))
          .filter((item) => item.overflow > 2)
          .sort((a, b) => b.overflow - a.overflow)
          .slice(0, 30)
      : [];
    const horizontalScrollRegions = [...document.querySelectorAll("main.workspace *")]
      .filter(visible)
      .map((node) => {
        const style = getComputedStyle(node);
        const overflow = node.scrollWidth - node.clientWidth;
        return {
          target: node.id || node.className || node.tagName,
          overflow,
          overflowX: style.overflowX,
          width: node.clientWidth,
          scrollWidth: node.scrollWidth,
        };
      })
      .filter((item) => item.overflow > 2 && ["auto", "scroll"].includes(item.overflowX))
      .slice(0, 80);

    const tableOverlaps = [];
    document.querySelectorAll("table").forEach((table, tableIndex) => {
      if (!visible(table)) return;
      table.querySelectorAll("tr").forEach((row, rowIndex) => {
        const cells = [...row.children].filter((node) => /^(TH|TD)$/.test(node.tagName) && visible(node)).map(rectOf);
        for (let index = 0; index < cells.length - 1; index += 1) {
          const a = cells[index];
          const b = cells[index + 1];
          const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (x > 1 && y > 1) tableOverlaps.push({ tableIndex, rowIndex, leftCell: index, rightCell: index + 1, x, y });
        }
      });
    });

    const flowOverlaps = [];
    const flowContainers = [...document.querySelectorAll("main.workspace *")].filter((node) => {
      if (!visible(node)) return false;
      const style = getComputedStyle(node);
      if (!["grid", "flex", "inline-flex"].includes(style.display)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width >= 160 && rect.height >= 32;
    }).slice(0, 450);

    flowContainers.forEach((container, containerIndex) => {
      const children = [...container.children].filter((child) => {
        if (!visible(child)) return false;
        const style = getComputedStyle(child);
        return !["absolute", "fixed"].includes(style.position);
      });
      if (children.length < 2 || children.length > 18) return;
      const rects = children.map((child) => ({ node: child, rect: rectOf(child) }));
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          const a = rects[i].rect;
          const b = rects[j].rect;
          const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (x > 2 && y > 2) {
            flowOverlaps.push({
              containerIndex,
              container: container.className || container.id || container.tagName,
              first: rects[i].node.className || rects[i].node.id || rects[i].node.tagName,
              second: rects[j].node.className || rects[j].node.id || rects[j].node.tagName,
              x, y,
            });
          }
        }
      }
    });

    const offscreenDialogs = [...document.querySelectorAll('[role="dialog"],aside[aria-hidden="false"],.ops-inspector.open')]
      .filter((node) => !node.classList.contains("ops-sidebar"))
      .filter((node) => !node.hasAttribute("hidden") && !node.hasAttribute("inert"))
      .filter(visible)
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left < -2 || rect.top < -2 || rect.right > innerWidth + 2 || rect.bottom > innerHeight + 2;
      })
      .map((node) => ({ target: node.id || node.className || node.tagName, rect: rectOf(node), viewport }));

    const criticalTextOverflow = [...document.querySelectorAll(
      '.pc-status,.pc-aggregate,.pc-history-badge,.pc-sigem-status,quality-status,[class*="status-badge"],[class*="state-badge"]'
    )].filter(visible).filter((node) => {
      const style = getComputedStyle(node);
      return style.overflowX === "visible" && node.scrollWidth > node.clientWidth + 2;
    }).map((node) => ({
      target: node.className || node.tagName,
      text: node.textContent.trim().slice(0, 100),
      width: node.clientWidth,
      scrollWidth: node.scrollWidth,
    }));

    const conferenceEscapes = [];
    document.querySelectorAll(".pc-document-table .pc-cell").forEach((cell, index) => {
      if (!visible(cell)) return;
      const cellRect = rectOf(cell);
      [...cell.children].forEach((child, childIndex) => {
        if (!visible(child)) return;
        const childRect = rectOf(child);
        if (childRect.left < cellRect.left - 2 || childRect.right > cellRect.right + 2) {
          conferenceEscapes.push({ index, childIndex, text: child.textContent.trim().slice(0, 100), cellRect, childRect });
        }
      });
    });

    return { pageOverflow, conferenceOverflow, conferenceHeader, conferenceOverflowNodes, horizontalScrollRegions, tableOverlaps, flowOverlaps, offscreenDialogs, criticalTextOverflow, conferenceEscapes, viewport };
  });

  assert.ok(result.pageOverflow <= 2, `${label}: overflow horizontal global de ${result.pageOverflow}px`);
  assert.deepEqual(result.tableOverlaps, [], `${label}: células de tabela sobrepostas`);
  assert.deepEqual(result.flowOverlaps, [], `${label}: filhos de grid/flex sobrepostos`);
  assert.deepEqual(result.offscreenDialogs, [], `${label}: drawer/modal fora da viewport`);
  assert.deepEqual(result.criticalTextOverflow, [], `${label}: badge/status com texto escapando`);
  assert.deepEqual(result.conferenceEscapes, [], `${label}: conteúdo da Conferência escapou da própria célula`);
  if (label.startsWith("Conferência") && result.conferenceOverflow.tableClientWidth) {
    assert.deepEqual(result.conferenceHeader.labels, ["Documento", "Envios", "Revisões", "Situação", "Confirmação", "Observação"], `${label}: cabeçalho documental inesperado`);
    assert.equal(result.conferenceHeader.count, 6, `${label}: cabeçalho deve conter exatamente 6 células`);
    assert.equal(result.conferenceHeader.emptyCount, 0, `${label}: existe heading vazio`);
    assert.ok(result.conferenceHeader.topSpread <= 2, `${label}: headings fora da mesma linha visual (${result.conferenceHeader.topSpread}px)`);
    assert.ok(result.conferenceHeader.heightSpread <= 2, `${label}: headings com alturas divergentes (${result.conferenceHeader.heightSpread}px)`);
    assert.ok(result.conferenceHeader.observationTopDelta <= 2, `${label}: Observação deslocada verticalmente (${result.conferenceHeader.observationTopDelta}px)`);
    assert.ok(result.conferenceHeader.columnEdgeDelta <= 2, `${label}: colunas do cabeçalho não coincidem com o tbody (${result.conferenceHeader.columnEdgeDelta}px)`);
    assert.ok(
      result.conferenceOverflow.tableScrollWidth <= result.conferenceOverflow.tableClientWidth + 2,
      `${label}: tabela da Conferência com overflow horizontal de ${result.conferenceOverflow.tableScrollWidth - result.conferenceOverflow.tableClientWidth}px; nós: ${JSON.stringify(result.conferenceOverflowNodes)}`
    );
    assert.ok(
      result.conferenceOverflow.wrapScrollWidth <= result.conferenceOverflow.wrapClientWidth + 2,
      `${label}: container da Conferência com overflow horizontal de ${result.conferenceOverflow.wrapScrollWidth - result.conferenceOverflow.wrapClientWidth}px`
    );
  }
  return result;
}

async function injectConferenceFixture(page) {
  await page.waitForFunction(() => Boolean(window.GrconPostingConferenceUi?.state && window.GrconPostingConference?.STATUSES), null, { timeout: 20000 });
  await page.evaluate(() => {
    const C = window.GrconPostingConference;
    const ui = window.GrconPostingConferenceUi;
    const generatedAt = "2026-09-28T20:30:00.000Z";
    const makeSend = (document, egrdtNumber, revisionSent, status, conferenceLabel, older = false) => ({
      key: document + "::" + egrdtNumber + "::" + revisionSent,
      historyId: egrdtNumber,
      document,
      documentFamily: "ET",
      sheet: "ET",
      discipline: document.includes("INSTR") ? "INSTRUMENTAÇÃO" : "TUBULAÇÃO",
      egrdtNumber,
      generatedAt: older ? "2026-09-24T12:00:00.000Z" : generatedAt,
      revisionSent,
      status,
      conferenceLabel,
      statusLabel: conferenceLabel,
      sigemStatus: status === C.STATUSES.CONFIRMED ? "Postado" : "Em Workflow",
      note: "Fixture UX/UI controlada.",
    });
    const doc1 = "C1O_RNEST_U32_3.1.ET1_TUB_RIR_U32-AAG-04425";
    const doc2 = "C1O_RNEST_U32_3.1.ET1_TUB_RIR_HC-32-06021";
    const doc3 = "C1O_RNEST_U32_3.1.ET1_INSTR_DOCUMENTO_COM_CODIGO_EXTREMAMENTE_LONGO_SEM_ESPACOS_123456789";
    const sends1 = [
      makeSend(doc1, "0130870-C1O-PGV-G-1739-2026 - eGRDT", "B2", C.STATUSES.NOT_VERIFIED, "Não verificado"),
      makeSend(doc1, "0130870-C1O-PGV-G-1701-2026 - eGRDT", "A", C.STATUSES.CONFIRMED, "Postagem confirmada anteriormente", true),
    ];
    const sends2 = [makeSend(doc2, "0130870-C1O-PGV-G-1739-2026 - eGRDT", "A", C.STATUSES.REVISION_DIVERGENT, "Aguardando retorno do SIGEM")];
    const sends3 = [
      makeSend(doc3, "0130870-C1O-PGV-G-1801-2026-LOTE-EXTRA-LONGO - eGRDT", "C10", C.STATUSES.REVIEW, "Requer análise"),
      makeSend(doc3, "0130870-C1O-PGV-G-1790-2026 - eGRDT", "C9", C.STATUSES.NOT_FOUND, "Não encontrado", true),
      makeSend(doc3, "0130870-C1O-PGV-G-1765-2026 - eGRDT", "C8", C.STATUSES.CONFIRMED, "Postado", true),
      makeSend(doc3, "0130870-C1O-PGV-G-1730-2026 - eGRDT", "C7", C.STATUSES.CONFIRMED, "Postado", true),
    ];
    ui.state.ready = true;
    ui.state.base = { meta: { fileName: "Consulta_Geral_QA.xlsx", recordCount: 42000, importedAt: generatedAt, duplicateCount: 0 }, records: [] };
    ui.state.audit = [];
    ui.state.filters = { search: "", document: "", documentList: "", grdt: "", family: "", discipline: "", revision: "", status: "", startDate: "", endDate: "" };
    ui.state.page = 1;
    ui.state.view = "documents";
    ui.state.result = {
      rows: [...sends1, ...sends2, ...sends3],
      eventRows: [...sends1, ...sends2, ...sends3],
      documentRows: [
        { document: doc1, documentFamily: "ET", sheet: "ET", discipline: "TUBULAÇÃO", sends: sends1, sendCount: 2, egrdtCount: 2, repostCount: 0, latestSendAt: generatedAt, generatedAt, latestEgrdtNumber: sends1[0].egrdtNumber, egrdtNumber: sends1[0].egrdtNumber, currentRevision: "B2", revisionSent: "B2", revisionCount: 2, revisionFound: "B1", status: C.STATUSES.NOT_VERIFIED, conferenceLabel: "Não verificado", sigemStatus: "Em Workflow", firstConfirmedAt: "", note: "A revisão enviada ainda precisa ser confirmada na Consulta Geral atual.", historicalPreserved: false },
        { document: doc2, documentFamily: "ET", sheet: "ET", discipline: "TUBULAÇÃO", sends: sends2, sendCount: 1, egrdtCount: 1, repostCount: 0, latestSendAt: generatedAt, generatedAt, latestEgrdtNumber: sends2[0].egrdtNumber, egrdtNumber: sends2[0].egrdtNumber, currentRevision: "A", revisionSent: "A", revisionCount: 1, revisionFound: "0", status: C.STATUSES.REVISION_DIVERGENT, conferenceLabel: "Aguardando retorno do SIGEM", sigemStatus: "Em Workflow", firstConfirmedAt: "", note: "Aguardando retorno do SIGEM.", historicalPreserved: false },
        { document: doc3, documentFamily: "ET", sheet: "ET", discipline: "INSTRUMENTAÇÃO", sends: sends3, sendCount: 4, egrdtCount: 4, repostCount: 1, latestSendAt: generatedAt, generatedAt, latestEgrdtNumber: sends3[0].egrdtNumber, egrdtNumber: sends3[0].egrdtNumber, currentRevision: "C10", revisionSent: "C10", revisionCount: 7, revisionFound: "C9", status: C.STATUSES.REVIEW, conferenceLabel: "Requer análise", sigemStatus: "Aguardando retorno da fiscalização / SIGEM", firstConfirmedAt: "", note: "Código e textos extremos para validar geometria sem colisão.", historicalPreserved: false },
      ],
      groups: [],
      summary: { total: 3, confirmed: 0, pending: 3, awaiting: 0, divergent: 1, notFound: 0, review: 1, notVerified: 1, percentConfirmed: 0, sendCount: 7, repostCount: 1, egrdtCount: 7, documentsWithMultipleSends: 2 },
      eventSummary: { total: 7 },
      changes: {},
      consolidation: {},
    };
    ui.render();
  });
}

async function screenshot(page, name, viewport, allViewports = false) {
  if (!allViewports && viewport !== 1440) return;
  await page.screenshot({ path: path.join(outputDir, `${name}-${viewport}.png`), fullPage: true });
}

async function auditDocumentClassVisuals(page) {
  return page.evaluate(() => {
    const read = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const style = getComputedStyle(node);
      return {
        text: node.textContent.trim(),
        color: style.color,
        background: style.backgroundColor,
        border: style.borderColor,
      };
    };
    return {
      et: read('[data-dashboard-family="ET"]'),
      n1710: read('[data-dashboard-family="N-1710"]'),
    };
  });
}

async function visit(page, selector, label, viewport, waitMs = 800) {
  const clicked = await clickVisible(page, selector);
  if (!clicked) return { label, skipped: true };
  await page.waitForTimeout(waitMs);
  const geometry = await auditGeometry(page, label);
  await screenshot(page, label.replace(/[^a-z0-9]+/gi, "-").toLowerCase(), viewport);
  return { label, skipped: false, geometry };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const metrics = {};
  try {
    for (const viewport of [1920, 1600, 1440, 1366, 1280]) {
      const viewportHeight = viewport === 1366 ? 768 : viewport === 1920 ? 1080 : 900;
      const context = await browser.newContext({ viewport: { width: viewport, height: viewportHeight }, serviceWorkers: "block" });
      const page = await context.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error" && !expectedExternal(message.text())) consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => {
        if (!expectedExternal(error.message)) pageErrors.push(error.stack || error.message);
      });
      await installQaShellBypass(page);
      const response = await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      assert.equal(response?.status(), 200, `GRCON deve responder 200 em ${viewport}px`);
      await page.waitForFunction(() => Boolean(window.GRCONModuleLoader), null, { timeout: 20000 });
      await page.waitForTimeout(650);

      const viewportMetrics = [];
      viewportMetrics.push(await visit(page, '.ops-sidebar [data-grcon-view="control"]', "Controle de GRDT", viewport));
      assert.equal(await page.locator("#grdt-stages [data-grdt-stage]").count(), 4,
        "Controle de GRDT precisa apresentar quatro etapas documentais acessíveis.");
      const advancedOpened = await clickVisible(page, "#advanced-toggle");
      if (advancedOpened) {
        await page.waitForTimeout(150);
        viewportMetrics.push({ label: "Regras desta análise", geometry: await auditGeometry(page, "Regras desta análise") });
        await clickVisible(page, "#advanced-toggle");
      }

      viewportMetrics.push(await visit(page, '.ops-sidebar [data-grcon-view="requests"]', "Consultas", viewport, 1100));
      const modelsVisit = await visit(page, '.requests-subnav [data-requests-area="modelos"]', "Modelos de exportação", viewport, 420);
      viewportMetrics.push(modelsVisit);
      if (!modelsVisit.skipped) {
        assert.equal(await page.locator("#requests-modelo-search").count(), 1,
          "Modelos precisam oferecer a pesquisa local.");
      }
      const monitorVisit = await visit(page, '.requests-subnav [data-requests-area="sigem-monitoring"]',
        "Consulta Geral × SIGEM", viewport, 500);
      viewportMetrics.push(monitorVisit);
      if (!monitorVisit.skipped) {
        assert.equal(await page.locator("#sigem-monitor-history-search").count(), 1,
          "Histórico deve oferecer busca em comparações.");
        assert.equal(await page.locator("#sigem-monitor-monitored-search").count(), 1,
          "Monitoramento deve oferecer busca local dos documentos.");
        if (viewport >= 1600) {
          const monitorColumns = await page.locator(".sigem-monitoring-root").evaluate((node) =>
            getComputedStyle(node).gridTemplateColumns.split(/\s+/).filter(Boolean).length);
          assert.equal(monitorColumns, 2,
            "Monitoramento e histórico devem ocupar duas colunas em telas largas.");
        }
        if (viewport === 1440) {
          const lightBg = await page.locator("#sigem-monitor-history-search").evaluate((node) =>
            getComputedStyle(node).backgroundColor);
          await setQaTheme(page, true);
          const darkBg = await page.locator("#sigem-monitor-history-search").evaluate((node) =>
            getComputedStyle(node).backgroundColor);
          const darkDiagnostics = await page.locator("#sigem-monitor-history-search").evaluate((node) => ({
            matched: node.matches("body.p2-dark .sigem-monitor-local-search input"),
            media: document.querySelector('link[href="sigem-status-monitoring.css"]')?.media || "not-found",
            darkBody: document.body.classList.contains("p2-dark"),
            htmlTheme: document.documentElement.dataset.theme,
            surfaceToken: getComputedStyle(document.body).getPropertyValue("--ops-surface").trim(),
            background: getComputedStyle(node).backgroundColor,
            backgroundImage: getComputedStyle(node).backgroundImage,
            parent: node.parentElement?.className || "",
            inlineStyle: node.getAttribute("style") || "",
            stylesheetLastRules: (() => {
              const link = document.querySelector('link[href="sigem-status-monitoring.css"]');
              try {
                return [...(link?.sheet?.cssRules || [])].slice(-8).map((rule) =>
                  rule.cssText.slice(0, 240));
              } catch (error) { return [String(error)]; }
            })(),
          }));
          assert.notEqual(darkBg, lightBg,
            "Campos de pesquisa devem adaptar o fundo ao modo escuro real: " + JSON.stringify(darkDiagnostics));
          await screenshot(page, "consulta-geral-sigem-dark", viewport);
          await setQaTheme(page, false);
        }
      }

      viewportMetrics.push(await visit(page, '.ops-sidebar [data-grcon-view="analysis-history"]', "Histórico de análises", viewport, 1100));
      viewportMetrics.push(await visit(page, '.ops-sidebar [data-grcon-view="history"]', "Histórico de eGRDTs", viewport, 1100));
      const dashboardVisit = await visit(page, '.ops-sidebar [data-grcon-view="dashboard"]', "Dashboard", viewport, 700);
      viewportMetrics.push(dashboardVisit);
      if (!dashboardVisit.skipped) {
        const classVisuals = await auditDocumentClassVisuals(page);
        assert.equal(classVisuals.et?.text, "ET", "Dashboard deve manter identificação textual ET");
        assert.equal(classVisuals.n1710?.text, "N-1710", "Dashboard deve manter identificação textual N-1710");
        assert.notEqual(classVisuals.et?.color, classVisuals.n1710?.color, "ET e N-1710 precisam de cores distintas");
        assert.notEqual(classVisuals.et?.background, classVisuals.n1710?.background, "ET e N-1710 precisam de fundos distintos");
        assert.notEqual(classVisuals.et?.border, classVisuals.n1710?.border, "ET e N-1710 precisam de bordas distintas");
        viewportMetrics.push({ label: "Dashboard · ET × N-1710", visuals: classVisuals });
        await screenshot(page, "dashboard-et-n1710", viewport, true);
      }
      viewportMetrics.push(await visit(page, '.ops-sidebar [data-grcon-view="sigem"]', "Postagem SIGEM", viewport, 900));

      viewportMetrics.push(await visit(page, '.ops-sidebar [data-grcon-view="additional-tools"]', "Ferramentas adicionais", viewport, 500));
      for (const [view, label] of [["grdt-reissue", "Repostagem de GRDT"], ["pdf-tools", "Combinar PDFs"], ["cover-document", "Adicionar Capa"]]) {
        await clickVisible(page, '.ops-sidebar [data-grcon-view="additional-tools"]');
        await page.waitForTimeout(250);
        viewportMetrics.push(await visit(page, `#additional-tools-module [data-grcon-view="${view}"]`, label, viewport, 900));
      }

      const settings = await clickVisible(page, "[data-ops-open-settings]");
      if (settings) {
        await page.waitForTimeout(250);
        viewportMetrics.push({ label: "Configurações", geometry: await auditGeometry(page, "Configurações") });
        await page.keyboard.press("Escape").catch(() => {});
      }

      await page.waitForFunction(() => Boolean(document.querySelector("[data-pc-open]")), null, { timeout: 10000 });
      viewportMetrics.push(await visit(page, '[data-pc-open="sidebar"]', "Conferência", viewport, 1200));
      await injectConferenceFixture(page);
      await page.waitForTimeout(150);
      viewportMetrics.push({ label: "Conferência com dados", geometry: await auditGeometry(page, "Conferência com dados") });
      await screenshot(page, "conferencia-dados", viewport, true);

      const historySummary = await clickVisible(page, ".pc-send-history summary");
      if (historySummary) {
        await page.waitForTimeout(100);
        viewportMetrics.push({ label: "Conferência histórico expandido", geometry: await auditGeometry(page, "Conferência histórico expandido") });
      }
      for (const pcView of ["grdts", "pending", "documents"]) {
        const switched = await clickVisible(page, `[data-pc-view="${pcView}"]`);
        if (switched) {
          await page.waitForTimeout(120);
          viewportMetrics.push({ label: `Conferência ${pcView}`, geometry: await auditGeometry(page, `Conferência ${pcView}`) });
        }
      }

      await setQaTheme(page, true);
      const darkConferenceText = await page.locator(".pc-document-table .pc-document-code > strong").first().evaluate((node) => {
        const color = getComputedStyle(node).color.match(/\d+/g).map(Number);
        return (color[0] + color[1] + color[2]) / 3;
      });
      assert.ok(darkConferenceText > 150,
        "Códigos dos documentos devem estar claros e legíveis na Conferência em modo escuro.");
      viewportMetrics.push({ label: "Conferência tema escuro", geometry: await auditGeometry(page, "Conferência tema escuro") });
      if (viewport === 1440) await page.screenshot({ path: path.join(outputDir, "conferencia-dark-1440.png"), fullPage: true });
      await setQaTheme(page, false);

      await page.waitForFunction(() => Boolean(document.querySelector("[data-spw-open]")), null, { timeout: 10000 });
      viewportMetrics.push(await visit(page, '[data-spw-open="sidebar"]', "SIGEM × PW", viewport, 1500));

      assert.deepEqual(pageErrors, [], `Page errors inesperados em ${viewport}px`);
      assert.deepEqual(consoleErrors, [], `Console errors inesperados em ${viewport}px`);
      metrics[viewport] = { views: viewportMetrics, pageErrors, consoleErrors };
      await context.close();
    }

    fs.writeFileSync(path.join(outputDir, "global-ux-ui-metrics.json"), JSON.stringify(metrics, null, 2));
    console.log("OK — auditoria UX/UI navegacional: 5 viewports (incluindo 1366×768 e 1920×1080), Dashboard ET/N-1710, módulos principais, ferramentas, Conferência, SIGEM × PW, drawers/toggles e console.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
