// Browser regression check focused on the real document table used by Conferência.
// Uses an existing Playwright installation (CI installs Chromium before running).
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, "playwright")
  : "playwright");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "artifacts", "ux-ui-audit");
fs.mkdirSync(outputDir, { recursive: true });

const css = [
  "design-system.css",
  "legacy-compat.css",
  "grcon-ui.css",
  "grcon-final.css",
  "grcon_cloud.css",
  "grcon-ui-fix.css",
  "grcon-responsive.css",
  "posting-conference.css",
].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");

const fixtures = [
  {
    "id": "A",
    "document": "C1O_RNEST_U32_3.1.ET1_TUB_RIR_U32-AAG-01001",
    "family": "ET",
    "discipline": "TUBULAÇÃO",
    "sendCount": 1,
    "egrdtCount": 1,
    "repostCount": 0,
    "date": "28/09/2026",
    "egrdt": "0130870-C1O-PGV-G-1700-2026 - eGRDT",
    "revision": "A",
    "revisionCount": 1,
    "sigemRevision": "A",
    "conference": "Não verificado",
    "sigem": "Em Workflow",
    "confirmed": "—",
    "note": "—"
  },
  {
    "id": "B",
    "document": "C1O_RNEST_U32_3.1.ET1_TUB_RIR_U32-AAG-04425",
    "family": "ET",
    "discipline": "TUBULAÇÃO",
    "sendCount": 2,
    "egrdtCount": 2,
    "repostCount": 0,
    "date": "28/09/2026",
    "egrdt": "0130870-C1O-PGV-G-1739-2026-LOTE-EXTRA-LONGO - eGRDT",
    "revision": "B2",
    "revisionCount": 2,
    "sigemRevision": "B1",
    "conference": "Não verificado",
    "sigem": "Em Workflow",
    "confirmed": "—",
    "note": "A revisão enviada ainda precisa ser confirmada na Consulta Geral atual."
  },
  {
    "id": "C",
    "document": "C1O_RNEST_U32_3.1.ET1_INSTR_RIR_U32-AAG-09991",
    "family": "ET",
    "discipline": "INSTRUMENTAÇÃO",
    "sendCount": 4,
    "egrdtCount": 4,
    "repostCount": 1,
    "date": "28/09/2026",
    "egrdt": "0130870-C1O-PGV-G-1801-2026 - eGRDT",
    "revision": "C10",
    "revisionCount": 7,
    "sigemRevision": "C9",
    "conference": "Requer análise",
    "sigem": "Aguardando retorno da fiscalização / SIGEM com descrição operacional longa",
    "confirmed": "—",
    "note": "Fixture com múltiplos envios, repostagem e status SIGEM longo."
  },
  {
    "id": "D",
    "document": "C1O_RNEST_U32_3.1.ET1_INSTR_DOCUMENTO_COM_CODIGO_EXTREMAMENTE_LONGO_SEM_ESPACOS_1234567890_ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "family": "N-1710",
    "discipline": "INSTRUMENTAÇÃO",
    "sendCount": 1,
    "egrdtCount": 1,
    "repostCount": 0,
    "date": "28/09/2026",
    "egrdt": "0130870-C1O-PGV-G-1810-2026 - eGRDT",
    "revision": "0",
    "revisionCount": 1,
    "sigemRevision": "0",
    "conference": "Postado",
    "sigem": "Postado",
    "confirmed": "28/09/2026 17:42",
    "note": "Documento longo para validar quebra controlada."
  },
  {
    "id": "E",
    "document": "C1O_RNEST_U32_3.1.ET1_TUB_RIR_U32-AAG-05555",
    "family": "ET",
    "discipline": "TUBULAÇÃO",
    "sendCount": 1,
    "egrdtCount": 1,
    "repostCount": 0,
    "date": "28/09/2026",
    "egrdt": "0130870-C1O-PGV-G-1820-2026 - eGRDT",
    "revision": "B",
    "revisionCount": 1,
    "sigemRevision": "B",
    "conference": "Postado",
    "sigem": "Postado",
    "confirmed": "28/09/2026 17:42",
    "note": "Observação extensa para validar a visualização resumida em até três linhas e a expansão controlada sem alterar a largura da tabela. Este texto continua propositalmente maior para comprovar que apenas a observação pode ser recolhida e expandida, preservando documento, eGRDT, data, revisão, Conferência e Status SIGEM sempre visíveis."
  },
  {
    "id": "F",
    "document": "C1O_RNEST_U32_3.1.ET1_TUB_RIR_U32-AAG-06666",
    "family": "—",
    "discipline": "—",
    "sendCount": 0,
    "egrdtCount": 0,
    "repostCount": 0,
    "date": "—",
    "egrdt": "",
    "revision": "—",
    "revisionCount": 0,
    "sigemRevision": "—",
    "conference": "Não verificado",
    "sigem": "—",
    "confirmed": "—",
    "note": ""
  }
];

function breakableCode(value) {
  return String(value || "—").replace(/([_.-])/g, "$1<wbr>");
}

function sendHistory(row) {
  const latest = row.egrdt
    ? `<button class="pc-link pc-latest-egrdt" type="button">${breakableCode(row.egrdt)}</button>`
    : '<span class="pc-empty-value">—</span>';
  const historyItems = Array.from({ length: Math.max(1, row.sendCount) }, (_, index) => {
    const number = index === 0 ? row.egrdt : `0130870-C1O-PGV-G-${1700 + index}-2026 - eGRDT`;
    return `<article class="pc-send-event"><button class="pc-link" type="button">${breakableCode(number || "eGRDT não informada")}</button><small>${row.date} · Rev. ${row.revision}${index === 0 ? " · envio mais recente" : ""}</small><small class="pc-event-status">${row.conference}</small></article>`;
  }).join("");
  return `<div class="pc-send-overview">
    <div class="pc-send-count"><strong>${row.sendCount} ${row.sendCount === 1 ? "envio" : "envios"}</strong><small>${row.egrdtCount} ${row.egrdtCount === 1 ? "eGRDT" : "eGRDTs"} · ${row.repostCount} ${row.repostCount === 1 ? "repostagem" : "repostagens"}</small></div>
    <div class="pc-latest-send"><span class="pc-block-label">Último envio</span><strong>${row.date}</strong>${latest}</div>
    <details class="pc-send-history"><summary>Ver histórico</summary><div class="pc-send-history-list">${historyItems}</div></details>
  </div>`;
}

function observationCell(row) {
  const note = String(row.note || "").trim();
  if (!note || note === "—") return '<span class="pc-empty-value">—</span>';
  if (note.length <= 150) return `<div class="pc-note-text">${note}</div>`;
  const preview = `${note.slice(0, 150).trimEnd()}…`;
  return `<details class="pc-note-details"><summary><span>${preview}</span><em>Ver observação completa</em></summary><div class="pc-note-full">${note}</div></details>`;
}

function tableMarkup() {
  return `<section class="pc-table-card">
    <header><div><span>DOCUMENTOS CONFERIDOS</span><strong>6 documentos</strong></div><small>Cada documento aparece apenas uma vez.</small></header>
    <div class="pc-table-wrap">
      <table class="pc-table pc-document-table" aria-label="Documentos conferidos">
        <colgroup><col class="pc-col-document"/><col class="pc-col-sends"/><col class="pc-col-revisions"/><col class="pc-col-situation"/><col class="pc-col-confirmation"/><col class="pc-col-note"/></colgroup>
        <thead><tr><th scope="col">Documento</th><th scope="col">Envios</th><th scope="col">Revisões</th><th scope="col">Situação</th><th scope="col">Confirmação</th><th scope="col">Observação</th></tr></thead>
        <tbody>${fixtures.map((row) => `<tr data-fixture="${row.id}">
          <td class="pc-cell pc-cell-document"><div class="pc-document-code"><strong>${breakableCode(row.document)}</strong><div class="pc-document-meta"><span>${row.family}</span><span aria-hidden="true">·</span><span>${row.discipline}</span></div>${row.sendCount > 1 ? `<span class="pc-consolidation-note">1 documento · ${row.sendCount} envios</span>` : ""}</div></td>
          <td class="pc-cell pc-cell-sends">${sendHistory(row)}</td>
          <td class="pc-cell pc-cell-revisions"><div class="pc-revision-grid"><div><span class="pc-block-label">Atual</span><strong>${row.revision}</strong></div><div><span class="pc-block-label">SIGEM</span><strong>${row.sigemRevision}</strong></div></div>${row.revisionCount > 1 ? `<small class="pc-revision-history">${row.revisionCount} revisões no histórico</small>` : ""}</td>
          <td class="pc-cell pc-cell-situation"><div class="pc-situation-stack"><div><span class="pc-block-label">Conferência</span><span class="pc-status ${row.id === "C" ? "review" : row.id === "D" || row.id === "E" ? "confirmed" : "neutral"}">${row.conference}</span></div><div><span class="pc-block-label">Status SIGEM</span><span class="pc-sigem-status">${row.sigem}</span></div></div></td>
          <td class="pc-cell pc-cell-confirmation"><span class="pc-block-label">Confirmado em</span><strong>${row.confirmed}</strong></td>
          <td class="pc-cell pc-cell-note pc-note">${observationCell(row)}</td>
        </tr>`).join("")}</tbody>
      </table>
    </div>
  </section>`;
}

async function measure(page) {
  return page.evaluate(() => {
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const pageOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const wrap = document.querySelector(".pc-table-wrap");
    const table = document.querySelector(".pc-document-table");
    const cellEscapes = [];
    document.querySelectorAll(".pc-document-table .pc-cell").forEach((cell, cellIndex) => {
      if (!visible(cell)) return;
      const cellRect = cell.getBoundingClientRect();
      [...cell.children].forEach((child, childIndex) => {
        if (!visible(child)) return;
        const rect = child.getBoundingClientRect();
        if (rect.left < cellRect.left - 2 || rect.right > cellRect.right + 2) {
          cellEscapes.push({ cellIndex, childIndex, text: child.textContent.trim().slice(0, 90), cell: [cellRect.left, cellRect.right], child: [rect.left, rect.right] });
        }
      });
    });
    const rowOverlaps = [];
    document.querySelectorAll(".pc-document-table tbody tr").forEach((row, rowIndex) => {
      const cells = [...row.children].filter(visible).map((cell) => {
        const rect = cell.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      });
      for (let index = 0; index < cells.length - 1; index += 1) {
        const a = cells[index];
        const b = cells[index + 1];
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > 1 && y > 1) rowOverlaps.push({ rowIndex, leftCell: index, rightCell: index + 1, x, y });
      }
    });
    const textOverflow = [...document.querySelectorAll(".pc-document-code,.pc-send-overview,.pc-revision-grid,.pc-status,.pc-sigem-status,.pc-cell-confirmation,.pc-note")]
      .filter(visible)
      .filter((node) => node.scrollWidth > node.clientWidth + 2)
      .map((node) => ({ className: node.className, text: node.textContent.trim().slice(0, 100), clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }));
    const headings = [...document.querySelectorAll(".pc-document-table thead th")].map((node) => node.textContent.trim());
    const visibleFacts = {
      document: Boolean(document.querySelector(".pc-document-code strong")),
      latestSend: Boolean(document.querySelector(".pc-latest-send strong")),
      egrdt: Boolean(document.querySelector(".pc-latest-egrdt")),
      currentRevision: Boolean(document.querySelector(".pc-revision-grid>div:first-child strong")),
      sigemRevision: Boolean(document.querySelector(".pc-revision-grid>div:nth-child(2) strong")),
      conference: Boolean(document.querySelector(".pc-situation-stack .pc-status")),
      sigemStatus: Boolean(document.querySelector(".pc-situation-stack .pc-sigem-status")),
      confirmation: Boolean(document.querySelector(".pc-cell-confirmation strong")),
      multiSend: Boolean(document.querySelector('.pc-consolidation-note')),
      history: Boolean(document.querySelector(".pc-send-history summary")),
    };
    const rows = [...document.querySelectorAll(".pc-document-table tbody tr")].map((row) => row.getBoundingClientRect().height);
    return {
      pageOverflow,
      wrapClientWidth: wrap?.clientWidth || 0,
      wrapScrollWidth: wrap?.scrollWidth || 0,
      tableClientWidth: table?.clientWidth || 0,
      tableScrollWidth: table?.scrollWidth || 0,
      tableWidth: table?.getBoundingClientRect().width || 0,
      headings,
      visibleFacts,
      cellEscapes,
      rowOverlaps,
      textOverflow,
      rowHeights: rows,
    };
  });
}

(async function run() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const metrics = {};
  try {
    const page = await browser.newPage();
    const cases = [
      { viewport: 1920, height: 1080, name: "1920" },
      { viewport: 1600, height: 900, name: "1600" },
      { viewport: 1440, height: 900, name: "1440" },
      { viewport: 1366, height: 768, name: "1366" },
      { viewport: 1280, height: 720, name: "1280" },
      { viewport: 1024, height: 720, name: "1024-scale125" },
    ];
    for (const item of cases) {
      await page.setViewportSize({ width: item.viewport, height: item.height });
      for (const theme of ["light", "dark"]) {
        const darkClass = theme === "dark" ? "p2-dark" : "";
        await page.setContent(`<html data-app="GRCON" data-ui-generation="3" data-theme="${theme}"><head><style>${css}</style></head><body class="${darkClass}" style="margin:0;padding:16px"><main class="posting-conference-module">${tableMarkup()}</main></body></html>`);
        const closed = await measure(page);
        const firstHistory = page.locator(".pc-send-history summary").first();
        await firstHistory.click();
        const opened = await measure(page);
        metrics[`${item.name}-${theme}`] = { closed, opened };
        assert.ok(closed.pageOverflow <= 2, `Global overflow at ${item.name}px / ${theme}: ${closed.pageOverflow}`);
        assert.ok(closed.wrapScrollWidth <= closed.wrapClientWidth + 2, `Conference container has horizontal overflow at ${item.name}px / ${theme}: ${closed.wrapScrollWidth - closed.wrapClientWidth}px`);
        assert.ok(closed.tableScrollWidth <= closed.tableClientWidth + 2, `Document table has horizontal overflow at ${item.name}px / ${theme}: ${closed.tableScrollWidth - closed.tableClientWidth}px`);
        assert.deepEqual(closed.cellEscapes, [], `Content escaped its cell at ${item.name}px / ${theme}`);
        assert.deepEqual(closed.rowOverlaps, [], `Adjacent table cells overlapped at ${item.name}px / ${theme}`);
        assert.deepEqual(closed.textOverflow, [], `Key table content overflowed at ${item.name}px / ${theme}`);
        assert.deepEqual(closed.headings, ["Documento", "Envios", "Revisões", "Situação", "Confirmação", "Observação"], `Unexpected document-table hierarchy at ${item.name}px / ${theme}`);
        assert.ok(Object.values(closed.visibleFacts).every(Boolean), `Important information is missing at ${item.name}px / ${theme}`);
        assert.ok(Math.abs(opened.tableWidth - closed.tableWidth) <= 2, `History expansion changed table width at ${item.name}px / ${theme}`);
        assert.ok(opened.wrapScrollWidth <= opened.wrapClientWidth + 2, `Expanded history introduced horizontal overflow at ${item.name}px / ${theme}`);
        assert.ok(Math.max(...closed.rowHeights) < 240, `Closed row became excessively tall at ${item.name}px / ${theme}`);
        if (theme === "light" && item.viewport !== 1024) {
          await page.screenshot({ path: path.join(outputDir, `conference-${item.name}.png`), fullPage: true });
        }
        if (item.viewport === 1440 && theme === "dark") {
          await page.screenshot({ path: path.join(outputDir, "conference-1440-dark.png"), fullPage: true });
        }
      }
    }
    fs.writeFileSync(path.join(outputDir, "conference-metrics.json"), JSON.stringify(metrics, null, 2));
    console.log("OK — Conferência: 0 overflow horizontal, 6 blocos semânticos, 6 fixtures, temas claro/escuro, 1920/1600/1440/1366/1280 e escala equivalente a 125%.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
