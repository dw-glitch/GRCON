'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.GRCON_PREVIEW_URL || 'http://127.0.0.1:8778';
const output = path.join(process.cwd(), 'artifacts/integrated-contracts');
const csp = fs.readFileSync(path.join(__dirname, '../cloudflare/_headers'), 'utf8').split('\n').find(line => line.trim().startsWith('Content-Security-Policy:')).trim().slice('Content-Security-Policy:'.length).trim();
const metrics = element => {
  const cell = element.querySelector('tbody td');
  const head = element.querySelector('thead th');
  const message = element.querySelector('[data-grcon-email-message] p');
  const style = node => node && getComputedStyle(node);
  return {
    cellSize: style(cell.querySelector('span')).fontSize,
    cellFont: style(cell.querySelector('span')).fontFamily,
    padding: style(cell).paddingTop,
    textColor: style(cell.querySelector('span')).color,
    background: style(cell).backgroundColor,
    header: style(head).backgroundColor,
    messageSize: style(message?.querySelector('span'))?.fontSize || null,
    paragraphGap: style(message)?.marginBottom || null,
    lineHeight: style(cell.querySelector('span')).lineHeight,
    width: element.querySelector('table').style.width,
    columns: element.querySelectorAll('thead th').length,
  };
};
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/email-copy-qa', route => route.fulfill({ contentType: 'text/html; charset=utf-8', headers: { 'Content-Security-Policy': csp }, body: `<!doctype html><html><head><meta charset="utf-8">
      <link rel="stylesheet" href="/egrdt-email-reply.css"><style>body{font:20px Times New Roman}p{margin:0}table{min-width:3300px}td{height:48px}th{position:sticky}</style>
      </head><body><script src="/history_core.js"></script><script src="/egrdt_email_reply.js"></script><script src="/egrdt_email_reply_ui.js"></script></body></html>` }));
    await page.goto(base + '/email-copy-qa');
    await page.evaluate(() => {
      window.qaNotifications = [];
      window.GrconNotify = (message, kind) => window.qaNotifications.push({ message, kind });
      window.GrconEgrdtEmailReplyUi.open([{ egrdtNumber: 'QA-001', generatedAt: '2026-10-14T14:09:00Z', files: [
        { document: 'PR-5290.00-22313-98V-C1O-081', revision: 'A', title: 'Título com <texto> & instrumentos', finalName: 'DOC_A.pdf' },
        { document: 'PR-5290.00-22313-98V-C1O-081', revision: 'A', title: 'Título com <texto> & instrumentos', finalName: 'DOC_A.xlsx' },
      ] }]);
    });
    await page.locator('#egrdt-email-message').fill('Prezado(a),\n\nMensagem personalizada.\nSegunda linha.\n\nConsulte a base.');
    await page.locator('#egrdt-email-quick-settings > summary').click();
    const frame = page.frameLocator('#egrdt-email-outlook-preview');
    const target = await context.newPage();
    await target.goto(base + '/email-copy-qa');
    await target.setContent('<html><body style="font:20px Times New Roman"><div id="destination" contenteditable="true" style="width:800px"></div></body></html>');
    const pasteAndMeasure = async () => {
      await target.locator('#destination').evaluate(element => { element.innerHTML = ''; });
      await target.locator('#destination').click();
      await target.keyboard.press('Control+V');
      await target.locator('#destination table').waitFor();
      return target.locator('#destination').evaluate(metrics);
    };
    const copyAndCheck = async (action = 'copy-all') => {
      const before = await page.evaluate(() => window.qaNotifications.length);
      await page.locator(`[data-egrdt-email-action="${action}"]`).click();
      // ClipboardItem.write is asynchronous: do not paste the previous copy while the new one is still pending.
      await page.waitForFunction(count => window.qaNotifications.slice(count).some(item => item.kind === 'success' && /formatada copiada/.test(item.message)), before);
      const expected = await frame.locator('body').evaluate(metrics);
      const pasted = await pasteAndMeasure();
      if (action === 'copy-table') { expected.messageSize = null; expected.paragraphGap = null; }
      assert.deepEqual(pasted, expected, 'a colagem real deve preservar os estilos da prévia isolada');
      return pasted;
    };
    await page.locator('[data-egrdt-email-action="preset-compact"]').click();
    const compact = await copyAndCheck();
    assert.equal(compact.padding, '3px');
    assert.ok(Math.abs(parseFloat(compact.cellSize) - 8 * 4 / 3) < .01);
    assert.equal(await target.locator('[data-grcon-email-message] p').count(), 3);
    await page.locator('[data-egrdt-email-action="preset-readable"]').click();
    const readable = await copyAndCheck();
    assert.equal(readable.padding, '9px');
    assert.equal(readable.cellSize, '16px');
    assert.notDeepEqual(compact, readable, 'presets distintos precisam produzir cópias distintas');
    await page.locator('[data-email-style="fontFamily"]').selectOption('Calibri');
    for (const [key, value] of Object.entries({ fontSize: '14', messageFontSize: '13', padding: '5', paragraphSpacing: '18', tableWidth: '70', lineHeight: '1.5' })) {
      await page.locator(`[data-email-style="${key}"]`).fill(value);
      await page.locator(`[data-email-style="${key}"]`).press('Tab');
    }
    for (const [key, value] of Object.entries({ bodyColor: '#123456', headerBackground: '#fedcba', bodyBackground: '#f4fafe' })) {
      await page.locator(`[data-email-style="${key}"]`).evaluate((field, color) => { field.value = color; field.dispatchEvent(new Event('change', { bubbles: true })); }, value);
    }
    await page.locator('[data-email-column="DISCIPLINA"]').uncheck();
    const custom = await copyAndCheck();
    assert.equal(custom.width, '70%');
    assert.equal(custom.columns, 7);
    assert.equal(custom.textColor, 'rgb(18, 52, 86)');
    assert.equal(custom.paragraphGap, '18px');
    await copyAndCheck('copy-table');
    // Testar a rota de cópia por evento, sem substituir a área de transferência real.
    await page.evaluate(() => {
      window.qaClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        write: async () => { throw new Error('QA rich API unavailable'); },
        writeText: window.qaClipboard.writeText.bind(window.qaClipboard),
      } });
    });
    await copyAndCheck();
    // Texto simples não pode ser anunciado como cópia formatada bem-sucedida.
    await page.evaluate(() => { document.execCommand = () => false; });
    await page.locator('[data-egrdt-email-action="copy-all"]').click();
    await page.waitForFunction(() => window.qaNotifications.some(item => item.kind === 'warning' && item.message.includes('somente texto')));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, 'outlook-copy-preview.png') });
    fs.writeFileSync(path.join(output, 'outlook-clipboard-result.json'), JSON.stringify({ ok: true, realClipboard: true, realPaste: true, compact, readable, custom, fallback: true, plainTextWarning: true, errors }, null, 2));
    console.log('Outlook copy: real Chromium clipboard/paste, presets, personal typography/colors/spacing, columns, isolated preview and fallback passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
