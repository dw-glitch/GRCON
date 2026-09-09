// Browser regression check. Uses an existing Playwright installation.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright') : 'playwright');
const root = path.resolve(__dirname, '..');
const css = ['design-system.css', 'legacy-compat.css', 'grcon-ui.css', 'grcon-final.css', 'grcon_cloud.css', 'grcon-ui-fix.css', 'grcon-responsive.css', 'posting-conference.css'].map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n');
const labels = ['Confirmado', 'Aguardando confirmação', 'Aguardando retorno do SIGEM', 'Não encontrado', 'Requer análise', 'Não verificado', 'DOCUMENTO_COM_CODIGO_EXTENSO_SEM_ESPACOS'];
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    for (const viewport of [1440, 1024, 720, 390]) {
      await page.setViewportSize({ width: viewport, height: 900 });
      for (const theme of ['light', 'dark']) {
        await page.setContent(`<html data-app="GRCON" data-ui-generation="3" data-theme="${theme}"><head><style>${css}</style></head><body style="padding:16px"><main class="posting-conference-module"><div style="display:grid;grid-template-columns:repeat(auto-fit,128px);gap:12px">${['pc-status divergent', 'pc-aggregate revisar', 'pc-history-badge review', 'pc-sigem-status'].flatMap(cls => labels.map(label => `<div style="width:128px;display:flex"><span class="${cls}">${label}</span></div>`)).join('')}</div><div class="pc-progress"><i></i><span>Conferindo documentos e aguardando retorno do SIGEM para concluir a atualização da consulta geral</span></div><div class="pc-pagination"><button>Anterior</button><span>Página 1000 de 1000</span><button>Próxima</button></div></main></body></html>`);
        const overflow = await page.locator('.pc-status,.pc-aggregate,.pc-history-badge,.pc-sigem-status,.pc-progress,.pc-pagination').evaluateAll(nodes => nodes.filter(n => n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1).map(n => ({ className: n.className, text: n.textContent, width: n.clientWidth, scroll: n.scrollWidth })));
        assert.deepEqual(overflow, [], `Text overflow at ${viewport}px / ${theme}`);
        if (viewport === 720 && theme === 'light') await page.screenshot({path:'/tmp/grcon-conference-layout.png',fullPage:true});
      }
    }
    console.log('OK — labels, progress and pagination: 4 widths, light/dark, narrow containers.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
