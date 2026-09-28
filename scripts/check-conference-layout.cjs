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

const rows = [
  {
    document: "C1O_RNEST_U32_3.1.ET1_TUB_RIR_U32-AAG-04425",
    family: "ET",
    discipline: "TUBULAÇÃO",
    sendCount: "2 envios",
    sendMeta: "2 eGRDTs · 0 repostagens · ver histórico",
    date: "28/09/2026",
    egrdt: "0130870-C1O-PGV-G-1739-2026 - eGRDT",
    revision: "B2",
    history: "2 revisões no histórico",
    sigemRevision: "B1",
    conference: "Não verificado",
    sigem: "Em Workflow",
    confirmed: "—",
    note: "A revisão enviada ainda precisa ser confirmada na Consulta Geral atual.",
  },
  {
    document: "C1O_RNEST_U32_3.1.ET1_TUB_RIR_HC-32-06021",
    family: "ET",
    discipline: "TUBULAÇÃO",
    sendCount: "1 envio",
    sendMeta: "1 eGRDT · 0 repostagens · ver histórico",
    date: "28/09/2026",
    egrdt: "0130870-C1O-PGV-G-1739-2026 - eGRDT",
    revision: "A",
    history: "",
    sigemRevision: "—",
    conference: "Aguardando retorno do SIGEM",
    sigem: "Em análise / Workflow",
    confirmed: "28/09/2026 17:42",
    note: "Texto longo proposital para comprovar que a observação quebra linha dentro da própria célula sem invadir a coluna anterior.",
  },
  {
    document: "DOCUMENTO_COM_CODIGO_EXTREMAMENTE_LONGO_SEM_ESPACOS_1234567890_ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    family: "N-1710",
    discipline: "INSTRUMENTAÇÃO",
    sendCount: "4 envios",
    sendMeta: "4 eGRDTs · 1 repostagem · ver histórico",
    date: "28/09/2026",
    egrdt: "0130870-C1O-PGV-G-1739-2026-LOTE-EXTRA-LONGO - eGRDT",
    revision: "C10",
    history: "7 revisões no histórico",
    sigemRevision: "C9",
    conference: "Requer análise",
    sigem: "Aguardando retorno da fiscalização / SIGEM",
    confirmed: "—",
    note: "Fixture extrema de UX/UI.",
  },
];

function sendHistory(row, open) {
  return `<details class="pc-send-history" ${open ? "open" : ""}>
    <summary><strong>${row.sendCount}</strong><span>${row.sendMeta}</span></summary>
    <div class="pc-send-history-list">
      <article class="pc-send-event"><button class="pc-link" type="button">${row.egrdt}</button><small>${row.date} · Rev. ${row.revision} · envio mais recente</small><small class="pc-event-status">${row.conference}</small></article>
      <article class="pc-send-event"><button class="pc-link" type="button">0130870-C1O-PGV-G-1701-2026 - eGRDT</button><small>24/09/2026 · Rev. A</small><small class="pc-event-status">Postagem confirmada anteriormente</small></article>
    </div>
  </details>`;
}

function tableMarkup() {
  return `<section class="pc-table-card">
    <header><div><span>DOCUMENTOS CONFERIDOS</span><strong>3 documentos</strong></div><small>Cada documento aparece apenas uma vez.</small></header>
    <div class="pc-table-wrap">
      <table class="pc-table pc-document-table" aria-label="Documentos conferidos">
        <colgroup>
          <col class="pc-col-document"/><col class="pc-col-type"/><col class="pc-col-discipline"/><col class="pc-col-sends"/>
          <col class="pc-col-latest"/><col class="pc-col-revision"/><col class="pc-col-sigem-revision"/><col class="pc-col-conference"/>
          <col class="pc-col-sigem-status"/><col class="pc-col-confirmed"/><col class="pc-col-note"/>
        </colgroup>
        <thead><tr><th>Documento</th><th>Tipo</th><th>Disciplina</th><th>Envios / eGRDTs</th><th>Último envio</th><th>Rev. atual</th><th>Rev. SIGEM</th><th>Conferência</th><th>Status SIGEM</th><th>Confirmado em</th><th>Observação</th></tr></thead>
        <tbody>
          ${rows.map((row, index) => `<tr>
            <td class="pc-cell pc-cell-document"><div class="pc-document-code"><strong>${row.document}</strong>${index === 0 ? '<span class="pc-consolidation-note">1 documento · 2 envios</span>' : ""}</div></td>
            <td class="pc-cell pc-cell-type">${row.family}</td>
            <td class="pc-cell pc-cell-discipline">${row.discipline}</td>
            <td class="pc-cell pc-cell-sends">${sendHistory(row, index === 2)}</td>
            <td class="pc-cell pc-cell-latest"><div class="pc-latest-send"><strong>${row.date}</strong><small>${row.egrdt}</small></div></td>
            <td class="pc-cell pc-cell-revision"><div class="pc-revision-stack"><strong>${row.revision}</strong>${row.history ? `<small>${row.history}</small>` : ""}</div></td>
            <td class="pc-cell pc-cell-sigem-revision">${row.sigemRevision}</td>
            <td class="pc-cell pc-cell-conference"><span class="pc-status ${index === 1 ? "divergent" : index === 2 ? "review" : "neutral"}">${row.conference}</span></td>
            <td class="pc-cell pc-cell-sigem-status"><span class="pc-sigem-status">${row.sigem}</span></td>
            <td class="pc-cell pc-cell-confirmed">${row.confirmed}</td>
            <td class="pc-cell pc-cell-note pc-note">${row.note}</td>
          </tr>`).join("")}
        </tbody>
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

    const textOverflow = [...document.querySelectorAll(".pc-document-code,.pc-send-history summary,.pc-latest-send,.pc-revision-stack,.pc-status,.pc-sigem-status,.pc-note")]
      .filter(visible)
      .filter((node) => node.scrollWidth > node.clientWidth + 2)
      .map((node) => ({ className: node.className, text: node.textContent.trim().slice(0, 100), clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }));

    const rows = [...document.querySelectorAll(".pc-document-table tbody tr")].map((row) => row.getBoundingClientRect().height);
    return {
      pageOverflow,
      wrapWidth: wrap?.clientWidth || 0,
      wrapScrollWidth: wrap?.scrollWidth || 0,
      tableWidth: table?.getBoundingClientRect().width || 0,
      cellEscapes,
      rowOverlaps,
      textOverflow,
      rowHeights: rows,
    };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const metrics = {};
  try {
    const page = await browser.newPage();
    for (const viewport of [1920, 1600, 1440, 1366, 1280]) {
      await page.setViewportSize({ width: viewport, height: 900 });
      for (const theme of ["light", "dark"]) {
        const darkClass = theme === "dark" ? "p2-dark" : "";
        await page.setContent(`<html data-app="GRCON" data-ui-generation="3" data-theme="${theme}"><head><style>${css}</style></head><body class="${darkClass}" style="margin:0;padding:16px"><main class="posting-conference-module">${tableMarkup()}</main></body></html>`);
        const result = await measure(page);
        metrics[`${viewport}-${theme}`] = result;
        assert.ok(result.pageOverflow <= 2, `Global overflow at ${viewport}px / ${theme}: ${result.pageOverflow}`);
        assert.deepEqual(result.cellEscapes, [], `Content escaped its cell at ${viewport}px / ${theme}`);
        assert.deepEqual(result.rowOverlaps, [], `Adjacent table cells overlapped at ${viewport}px / ${theme}`);
        assert.deepEqual(result.textOverflow, [], `Key table content overflowed at ${viewport}px / ${theme}`);
        assert.ok(result.tableWidth >= 1840, `Document table lost its readable desktop width at ${viewport}px / ${theme}`);
        assert.ok(result.rowHeights[0] < 190, `Closed multi-send row became excessively tall at ${viewport}px / ${theme}`);

        if ((viewport === 1440 || viewport === 1280) && theme === "light") {
          await page.screenshot({ path: path.join(outputDir, `conference-${viewport}.png`), fullPage: true });
        }
        if (viewport === 1440 && theme === "dark") {
          await page.screenshot({ path: path.join(outputDir, "conference-1440-dark.png"), fullPage: true });
        }
      }
    }
    fs.writeFileSync(path.join(outputDir, "conference-metrics.json"), JSON.stringify(metrics, null, 2));
    console.log("OK — Conferência: 1920/1600/1440/1366/1280, claro/escuro, múltiplos envios, códigos longos e tabela sem colisões.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
