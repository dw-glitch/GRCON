'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const XLSX = require('../xlsx.full.min');
const output = path.join(process.cwd(), 'artifacts/grdt-file-revision');
fs.mkdirSync(output, { recursive: true });
const doc = 'C1O_RNEST_U32_3.8.9.1_TUB_REP_VM-320236';
const zero = doc.replace('320236', '320237');
const unknown = doc.replace('320236', '320238');
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
  ['DOCUMENTO','REVISÃO','TÍTULO','FORMATO','DISCIPLINA','TIPO DE DOCUMENTO','PROPÓSITO','CONFIRMAÇÃO DE ALOCAÇÃO','GRDT','DATA EFETIVA DE EMISSÃO'],
  ...[doc, zero, unknown].map(d => [d,'B','RELATÓRIO DE INSPEÇÃO','A4','TUBULAÇÃO','REP','Para Construção','ALOCADO','','']),
]), 'ET');
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
  ['DOCUMENTO','REVISÃO','STATUS SIGEM'], [doc,'A','Sem Comentários'], [zero,'0','Sem Comentários'],
]), 'Colar SIGEM');
const ld = path.join(output, 'LD_001.xlsx');
fs.writeFileSync(ld, XLSX.write(book, { type:'buffer', bookType:'xlsx' }));
const names = [`${doc}_A.pdf`, `${doc}_B.pdf`, `${doc}_B.docx`, `${zero}.pdf`, `${unknown}_ERRADO.pdf`];
const bundle = path.join(output, 'bundle');
fs.mkdirSync(bundle, { recursive:true });
names.forEach(name => fs.writeFileSync(path.join(bundle, name), '%PDF-1.4\n%%EOF'));
(async () => {
  const browser = await chromium.launch({ args:['--no-sandbox'] });
  try {
    for (const worker of [true, false]) {
      const context = await browser.newContext({ viewport:{ width:1366,height:768 }, serviceWorkers:'block' });
      if (!worker) await context.addInitScript(() => { window.Worker = undefined; });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(process.env.GRCON_PREVIEW_URL || 'http://127.0.0.1:8765');
      await page.waitForFunction(() => window.GrconTriageUiApi && window.GRCONModuleLoader);
      await page.addStyleTag({ content:'#grcon-cloud-auth{display:none!important} html.grcon-cloud-pending body > :not(script){visibility:visible!important}' });
      await page.locator('#ld-input').setInputFiles(ld);
      await page.locator('#pdf-input').setInputFiles(bundle);
      await page.locator('#analyze').click();
      await page.waitForFunction(() => document.getElementById('ld-compatibility-drawer').getAttribute('aria-hidden') === 'false'
        || window.GrconTriageUiApi.snapshot().total === 4);
      if (await page.locator('#ld-compatibility-drawer').getAttribute('aria-hidden') === 'false') {
        await page.locator('#ld-compatibility-confirm').click();
        await page.locator('#analyze').click();
      }
      await page.waitForFunction(() => window.GrconTriageUiApi.snapshot().total > 0 && !window.GrconPerformanceDiagnostics.state().busy, null, { timeout:30000 }).catch(async error => {
        console.error('analysis state', await page.evaluate(() => ({snapshot:window.GrconTriageUiApi.snapshot(), diagnostics:window.GrconPerformanceDiagnostics.state(), toast:document.getElementById('toast')?.innerText, text:document.body.innerText.slice(-12000)})));
        await page.screenshot({path:path.join(output, worker ? 'worker-failure.png' : 'legacy-failure.png'), fullPage:true});
        throw error;
      });
      assert.equal(await page.evaluate(() => window.GrconTriageUiApi.snapshot().total), 4);
      const rows = await page.evaluate(() => window.GrconTriageUiApi.filteredIndices().map(i => {
        const r = window.GrconTriageUiApi.getResult(i);
        return { index:i, document:r.document, revision:r.revision, fileRevision:r.fileRevision, decision:r.decision, files:r.files.length };
      }));
      const a = rows.find(r => r.document === doc && r.revision === 'A');
      const b = rows.find(r => r.document === doc && r.revision === 'B');
      const z = rows.find(r => r.document === zero);
      const u = rows.find(r => r.document === unknown);
      assert.equal(a.decision, 'descartar'); assert.equal(b.decision, 'pronto');
      assert.equal(b.files, 2); assert.equal(z.revision, '0'); assert.equal(z.decision, 'descartar');
      assert.equal(u.revision, ''); assert.equal(u.decision, 'revisar');
      const select = index => page.locator(`tr.result-row[data-index="${index}"] [data-select-row]`);
      assert.equal(await select(a.index).isChecked(), false);
      assert.equal(await select(b.index).isChecked(), true);
      assert.equal(await select(z.index).isChecked(), false);
      assert.equal(await select(u.index).isChecked(), false);
      assert.equal(await select(a.index).isEnabled(), true);
      await select(a.index).check();
      assert.equal((await page.evaluate(() => window.GrconEgrdtBatchPlan.preview('physical'))).totalItems, 3);
      const revisionInput = page.locator(`tr.result-row[data-index="${a.index}"] [data-revision-input]`);
      await revisionInput.fill('C'); await revisionInput.press('Tab');
      await page.waitForFunction(i => window.GrconTriageUiApi.getResult(i).revision === 'C', a.index);
      let preview = await page.evaluate(() => window.GrconEgrdtBatchPlan.preview('physical'));
      assert.equal(preview.valid, true); assert.equal(preview.totalItems, 3);
      assert.ok(preview.warnings.some(w => /inclusão manual com revisão C/i.test(w)));
      await page.locator(`tr.result-row[data-index="${a.index}"] [data-action="restore-revision"]`).click();
      assert.equal(await page.evaluate(i => window.GrconTriageUiApi.getResult(i).revision, a.index), 'A');
      assert.equal(await select(a.index).isChecked(), true);
      // Unknown revision can be entered and explicitly included without a new blocker.
      const unknownInput = page.locator(`tr.result-row[data-index="${u.index}"] [data-revision-input]`);
      await unknownInput.fill('A'); await unknownInput.press('Tab'); await select(u.index).check();
      preview = await page.evaluate(() => window.GrconEgrdtBatchPlan.preview('physical'));
      assert.equal(preview.valid, true); assert.equal(preview.totalItems, 4);
      await page.locator('#results-scroll').scrollIntoViewIfNeeded();
      await page.screenshot({ path:path.join(output, worker ? 'worker.png' : 'legacy.png'), fullPage:true });
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ mode:worker ? 'Worker' : 'Legado', rows, finalItems:preview.totalItems, manualOverride:true, errors }));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
