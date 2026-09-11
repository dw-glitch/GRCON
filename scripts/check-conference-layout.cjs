// Browser regression check for the real Conference table structure.
// Uses an existing Playwright installation (CODEX runtime or local package).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright')
  : 'playwright');

const root = path.resolve(__dirname, '..');
const css = [
  'design-system.css',
  'legacy-compat.css',
  'grcon-ui.css',
  'grcon-final.css',
  'grcon_cloud.css',
  'grcon-ui-fix.css',
  'grcon-responsive.css',
  'grcon-reposting.css',
  'posting-conference.css',
].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');

const sampleRows = [
  {
    document: 'C10_RNEST_032_3.1.1.1_INS_RIR_CJA-S-32-0801',
    type: 'RIR', discipline: 'INSTRUMENTAÇÃO', sends: '3 envios', reposts: '3 eGRDTs · 2 repostagens · ver histórico',
    date: '10/09/2026', egrdt: '0130870-C10-PGV-G-1504-2026 · eGRDT', current: '0', sigemRev: '—',
    conference: 'Não postado ainda', sigem: '—', confirmed: '—',
    note: '3 envios consolidados (2 repostagem(ns)); tentativas anteriores permanecem no histórico. Ainda não confirmado na Consulta Geral. A eGRDT tem menos de 48 hora(s); a ausência não é tratada como falha.',
  },
  {
    document: 'C10_RNEST_032_3.1.1.1_ELE_RIR_M-VT-P-32026A-D',
    type: 'RIR', discipline: 'ELÉTRICA', sends: '4 envios', reposts: '4 eGRDTs · 3 repostagens · ver histórico',
    date: '10/09/2026', egrdt: '0130870-C10-PGV-G-1501-2026 · eGRDT', current: '0', sigemRev: '—',
    conference: 'Não postado ainda', sigem: 'Em Análise', confirmed: '—',
    note: '4 envios consolidados (3 repostagem(ns)); tentativas anteriores permanecem no histórico. Conferência pendente sem alterar a regra de negócio.',
  },
  {
    document: 'C10_RNEST_032_3.1.1.1_ELE_RIR_M-VT-P-32027A',
    type: 'RIR', discipline: 'ELÉTRICA', sends: '1 envio', reposts: '1 eGRDT · 0 repostagens · ver histórico',
    date: '09/09/2026', egrdt: '0130870-C10-PGV-G-1498-2026 · eGRDT', current: 'A', sigemRev: 'A',
    conference: 'Postado', sigem: 'Conforme construído', confirmed: '10/09/2026 09:42',
    note: 'Postagem confirmada pela Consulta Geral.',
  },
];

function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rowMarkup(row) {
  const statusClass = row.conference === 'Postado' ? 'confirmed' : 'awaiting';
  return `<tr>
    <td class="grcon-repost-select"><input type="checkbox" aria-label="Selecionar para repostagem"></td>
    <td><div class="pc-document-code"><strong>${esc(row.document)}</strong><span class="pc-consolidation-note">1 documento · ${esc(row.sends)}</span></div></td>
    <td>${esc(row.type)}</td>
    <td>${esc(row.discipline)}</td>
    <td><details class="pc-send-history"><summary><strong>${esc(row.sends)}</strong><span>${esc(row.reposts)}</span></summary></details></td>
    <td><div class="pc-latest-send"><strong>${esc(row.date)}</strong><small>${esc(row.egrdt)}</small></div></td>
    <td><strong>${esc(row.current)}</strong></td>
    <td>${esc(row.sigemRev)}</td>
    <td><span class="pc-status ${statusClass}">${esc(row.conference)}</span></td>
    <td><span class="pc-sigem-status">${esc(row.sigem)}</span></td>
    <td>${esc(row.confirmed)}</td>
    <td class="pc-note" title="${esc(row.note)}">${esc(row.note)}</td>
  </tr>`;
}

function fixture(theme) {
  return `<!doctype html><html data-app="GRCON" data-ui-generation="3" data-theme="${theme}"><head><meta charset="utf-8"><style>${css}</style></head>
  <body style="margin:0;padding:16px"><main class="posting-conference-module">
    <section class="pc-table-card">
      <header><div><span>DOCUMENTOS CONFERIDOS</span><strong>3 documento(s)</strong></div><small>Cada documento aparece apenas uma vez.</small></header>
      <div class="pc-table-wrap" id="wrap"><table class="pc-table" id="table"><thead><tr>
        <th class="grcon-repost-select" aria-label="Selecionar"></th><th>Documento</th><th>Tipo</th><th>Disciplina</th><th>Envios / eGRDTs</th><th>Último envio</th><th>Rev. atual</th><th>Rev. SIGEM</th><th>Conferência</th><th>Status SIGEM</th><th>Confirmado em</th><th>Observação</th>
      </tr></thead><tbody>${sampleRows.map(rowMarkup).join('')}</tbody></table></div>
      <footer class="pc-pagination"><button>Anterior</button><span>Página 1 de 1 · 3 item(ns)</span><button>Próxima</button></footer>
    </section>
  </main></body></html>`;
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const requestedViewports = [
    { width: 1920, height: 1080 },
    { width: 1600, height: 900 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ];
  try {
    const page = await browser.newPage();
    for (const viewport of requestedViewports) {
      await page.setViewportSize(viewport);
      for (const theme of ['light', 'dark']) {
        await page.setContent(fixture(theme));
        const metrics = await page.evaluate(() => {
          const table = document.getElementById('table');
          const wrap = document.getElementById('wrap');
          const heads = [...table.querySelectorAll('thead th')];
          const first = [...table.querySelectorAll('tbody tr:first-child td')];
          const rows = [...table.querySelectorAll('tbody tr')];
          const pagination = document.querySelector('.pc-pagination');
          const body = document.body;
          return {
            headerCount: heads.length,
            cellCount: first.length,
            columnDeltas: heads.map((head, index) => {
              const h = head.getBoundingClientRect();
              const c = first[index].getBoundingClientRect();
              return { index, left: Math.abs(h.left - c.left), width: Math.abs(h.width - c.width) };
            }),
            rowHeights: rows.map((row) => row.getBoundingClientRect().height),
            observationWidth: first[first.length - 1].getBoundingClientRect().width,
            documentWidth: first[1].getBoundingClientRect().width,
            verticalAligns: first.map((cell) => getComputedStyle(cell).verticalAlign),
            wrapOverflow: wrap.scrollWidth > wrap.clientWidth,
            bodyOverflow: body.scrollWidth > document.documentElement.clientWidth + 2,
            paginationTop: pagination.getBoundingClientRect().top,
            wrapBottom: wrap.getBoundingClientRect().bottom,
          };
        });

        assert.equal(metrics.headerCount, metrics.cellCount, `Header/body column count mismatch at ${viewport.width}/${theme}`);
        metrics.columnDeltas.forEach((delta) => {
          assert.ok(delta.left <= 0.75, `Column ${delta.index} left edge drifted ${delta.left}px at ${viewport.width}/${theme}`);
          assert.ok(delta.width <= 0.75, `Column ${delta.index} width drifted ${delta.width}px at ${viewport.width}/${theme}`);
        });
        assert.ok(Math.max(...metrics.rowHeights) < 150, `Row became too tall (${Math.max(...metrics.rowHeights)}px) at ${viewport.width}/${theme}`);
        assert.ok(metrics.observationWidth >= 320, `Observation column too narrow (${metrics.observationWidth}px) at ${viewport.width}/${theme}`);
        assert.ok(metrics.documentWidth >= 260, `Document column too narrow (${metrics.documentWidth}px) at ${viewport.width}/${theme}`);
        assert.ok(metrics.verticalAligns.every((value) => value === 'top'), `Cells are not top aligned at ${viewport.width}/${theme}`);
        assert.equal(metrics.bodyOverflow, false, `Whole page has horizontal overflow at ${viewport.width}/${theme}`);
        assert.ok(metrics.paginationTop >= metrics.wrapBottom - 1, `Pagination overlaps table at ${viewport.width}/${theme}`);
        if (viewport.width <= 1600) assert.equal(metrics.wrapOverflow, true, `Expected controlled table scrolling at ${viewport.width}/${theme}`);
      }
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.setContent(fixture('light'));
    await page.screenshot({ path: '/tmp/grcon-conference-table.png', fullPage: true });
    console.log('OK — Conferência: 5 resoluções solicitadas, light/dark, alinhamento THEAD/TBODY, altura, largura, scroll e paginação.');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
