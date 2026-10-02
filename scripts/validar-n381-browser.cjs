const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const PDF = require('../pdf-lib.min.js');
const base = process.env.GRCON_PREVIEW_URL || 'http://127.0.0.1:8765';
const out = path.resolve('artifacts/n381-browser');
fs.mkdirSync(out, { recursive: true });
const code = 'PR-5290.00-22313-91B-C1O-002';
async function fixture(revisions, label = true) {
  const pdf = await PDF.PDFDocument.create(); const font = await pdf.embedFont(PDF.StandardFonts.Helvetica);
  for (const revision of revisions) {
    const page = pdf.addPage([595.28, 841.89]);
    const lines = label ? [`DOCUMENTO: ${code}`, `REVISAO: ${revision}`, 'TITULO: PROCEDIMENTO DE TESTE', `FOLHA: ${pdf.getPageCount()} DE ${revisions.length}`] : [];
    lines.forEach((line, index) => page.drawText(line, { x: 40, y: 790 - index * 24, size: 12, font }));
  }
  return Buffer.from(await pdf.save());
}
async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: 'html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script){visibility:visible!important}#grcon-cloud-auth{display:none!important}' });
    await page.evaluate(async () => { await window.GRCONModuleLoader.ensure('pdf-document'); });
    const inspect = async buffer => page.evaluate(async bytes => window.GrconPdfDocument.inspect(new File([new Uint8Array(bytes)], 'teste.pdf', { type: 'application/pdf' })), [...buffer]);
    const good = await inspect(await fixture(['B', 'B']));
    assert.equal(good.status, 'complete'); assert.equal(good.pages.length, 2); assert.equal(good.pages[0].values.revision, 'B');
    assert.equal(good.pages[0].values.documentNumber, code);
    const mismatch = await inspect(await fixture(['A', 'A']));
    const scanned = await inspect(await fixture(['B'], false));
    assert.equal(scanned.pages[0].textReadable, false);
    const snapshots = await page.evaluate(({ good, mismatch, scanned, code }) => {
      const expected = { documentNumber: code, revision: 'B' };
      return [window.GrconN381Concordance.audit({ expected, inspection: good }), window.GrconN381Concordance.audit({ expected, inspection: mismatch }), window.GrconN381Concordance.audit({ expected, inspection: mismatch, revisionBySheet: true }), window.GrconN381Concordance.audit({ expected, inspection: scanned })];
    }, { good, mismatch, scanned, code });
    assert.equal(snapshots[0].blocks.length, 0); assert.equal(snapshots[1].blocks.length, 2); assert.equal(snapshots[2].blocks.length, 0); assert.equal(snapshots[3].blocks.length, 0);
    // Exercise blocking at the actual cover generation boundary and the snapshot.
    await page.evaluate(async () => { await window.GRCONModuleLoader.ensureModule('cover-document'); });
    await page.locator('.cover-file-input input[type=file]').waitFor({ state: 'attached' });
    await page.evaluate(async code => {
      const sheet = window.XLSX.utils.aoa_to_sheet([
        ['DOCUMENTO', 'REVISAO', 'TITULO', 'DATA', 'DISCIPLINA', 'TIPO DE DOCUMENTO', 'TAXONOMIA INTERNA', 'EAP'],
        [code, '0', 'PROCEDIMENTO DE TESTE', '01/10/2026', 'SMS', 'PR', 'TX-SMS-TESTE', '1.1.1.1'],
      ]);
      const workbook = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(workbook, sheet, 'LD');
      const bytes = window.XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
      const transfer = new DataTransfer(); transfer.items.add(new File([bytes], 'LD_N381.xlsx'));
      const input = document.querySelector('.cover-file-input input[type=file]'); Object.defineProperty(input, 'files', { configurable: true, value: transfer.files }); input.dispatchEvent(new Event('change', { bubbles: true }));
    }, code);
    await page.locator('#cover-title-search').fill('PROCEDIMENTO DE TESTE');
    await page.waitForFunction(code => window.GrconCoverDocumentUi?._debug?.state?.selectedDocument === code, code);
    await page.getByRole('button', { name: 'Revisar dados da capa' }).click();
    const revisionInput = page.locator('.cover-edit-grid label').filter({ hasText: 'Revisão · informada manualmente' }).locator('input');
    assert.equal(await revisionInput.inputValue(), '');
    await revisionInput.fill('B');
    await page.locator('.cover-edit-grid label').filter({ hasText: 'Descrição da revisão' }).locator('input').fill('PARA TESTE');
    await page.locator('.cover-dropzone input[type=file]').setInputFiles({ name: 'ORIGEM_A.pdf', mimeType: 'application/pdf', buffer: await fixture(['A', 'A']) });
    await page.waitForFunction(() => !window.GrconCoverDocumentUi?._debug?.state?.busy && window.GrconCoverDocumentUi?._debug?.state?.validationErrors === 1);
    assert.equal(await page.getByRole('button', { name: 'Gerar PDF', exact: true }).isDisabled(), true);
    await page.locator('.cover-n381-scope').getByLabel('Documento com controle de revisão por folha').check();
    await page.waitForFunction(() => window.GrconCoverDocumentUi?._debug?.state?.validationErrors === 0);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Gerar PDF', exact: true }).click();
    const download = await downloadPromise; await download.saveAs(path.join(out, 'capa-gerada.pdf'));
    const history = await page.evaluate(() => JSON.parse(localStorage.getItem('grcon_cover_document_history_v1'))[0]);
    assert.equal(history.revision, 'B'); assert.equal(history.normativeValidation.revisionBySheet, true); assert.equal(history.normativeValidation.blocks.length, 0); assert.equal(history.normativeValidation.results, undefined);
    assert.ok(history.normativeValidation.rulesChecked.includes('n381.page.2.revision'));
    // Exercise the real Conference mount, fields, attachment, references and foldout.
    await page.locator('[data-pc-open="sidebar"]').click();
    await page.locator('#pc-check-pdf').waitFor({ state: 'visible' });
    await page.waitForFunction(() => window.GrconPostingConferenceUi?.state.ready === true);
    await page.evaluate(async code => {
      window.GrconPostingConferenceUi.state.base.records = [{ document: code, revision: 'B', title: 'PROCEDIMENTO DE TESTE', sourceRow: 2 }];
    }, code);
    await page.locator('#pc-check-pdf').click();
    await page.getByRole('textbox', { name: 'Documento', exact: true }).fill(code);
    await page.getByRole('textbox', { name: 'Revisão de destino' }).fill('B');
    await page.getByText(/Fontes do documento/).click();
    await page.getByRole('button', { name: 'Usar como destino da conferência' }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Título de destino' }).inputValue(), 'PROCEDIMENTO DE TESTE');
    await page.getByLabel('PDF para conferência', { exact: true }).setInputFiles({ name: 'DIVERGENTE.pdf', mimeType: 'application/pdf', buffer: await fixture(['A', 'A']) });
    await page.waitForFunction(() => document.querySelector('#pc-pdf-root .pdf-concordance')?.textContent.includes('2 bloqueio(s)'));
    await page.locator('#pc-pdf-root').getByText(/Ver regras e evidências/).click();
    assert.ok((await page.locator('#pc-pdf-root .pdf-concordance').innerText()).includes('Encontrado: A'));
    await page.locator('#pc-pdf-root').getByLabel('Documento com controle de revisão por folha').check();
    await page.waitForFunction(() => document.querySelector('#pc-pdf-root .pdf-concordance')?.textContent.includes('0 bloqueio(s)'));
    await page.screenshot({ path: path.join(out, 'conference-n381.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify({ cases: ['PDF textual concordante', 'revisão divergente bloqueada', 'revisão por folha', 'PDF sem texto inconclusivo', 'Conferência real'], inspectedPages: good.pages.length, errors }, null, 2));
    console.log('n381_browser: ok — parser e worker reais + Conferência');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
