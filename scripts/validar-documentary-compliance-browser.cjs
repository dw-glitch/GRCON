'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const XLSX = require('../xlsx.full.min');
const output = path.join(process.cwd(), 'artifacts/documentary-compliance');
fs.mkdirSync(path.join(output, 'bundle'), { recursive: true });
const docs = Array.from({ length: 60 }, (_, index) => `RL-5290.00-22313-${index === 1 ? 'ZZZ' : '91B'}-C1O-${String(index + 1).padStart(3, '0')}`);
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
  ['DOCUMENTO', 'REVISÃO', 'TÍTULO', 'FORMATO', 'DISCIPLINA', 'TIPO DE DOCUMENTO', 'PROPÓSITO', 'CONFIRMAÇÃO DE ALOCAÇÃO', 'CAMINHO DATABOOK', 'GRDT', 'DATA EFETIVA DE EMISSÃO'],
  ...docs.map((doc, index) => [doc, index === 2 ? 'I' : '0', 'RELATÓRIO QA ' + index, 'A4', 'DINÂMICOS', index === 3 ? 'FD' : 'RL', index === 4 ? 'Para Cancelamento' : 'Para Construção', 'ALOCADO', 'R:\\DB', '', '']),
]), 'N-1710');
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
  ['DOCUMENTO', 'REVISÃO', 'STATUS SIGEM'], ...docs.map((doc, index) => [doc, index === 2 ? 'I' : '0', 'Não Postado']),
]), 'Colar SIGEM');
const ld = path.join(output, 'LD_QA.xlsx');
fs.writeFileSync(ld, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
docs.forEach((doc, index) => fs.writeFileSync(path.join(output, 'bundle', `${doc}_0001_${index === 2 ? 'I' : '0'}.pdf`), '%PDF-1.4\n%%EOF'));
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  let page;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.GRCON_PREVIEW_URL || 'http://127.0.0.1:8765');
    await page.waitForFunction(() => window.GrconTriageUiApi && window.GRCONModuleLoader);
    await page.addStyleTag({ content: '#grcon-cloud-auth{display:none!important} html.grcon-cloud-pending body > :not(script){visibility:visible!important}' });
    await page.locator('#ld-input').setInputFiles(ld);
    await page.locator('#pdf-input').setInputFiles(path.join(output, 'bundle'));
    await page.locator('#analyze').click();
    await page.waitForFunction(() => document.getElementById('ld-compatibility-drawer').getAttribute('aria-hidden') === 'false' || window.GrconTriageUiApi.snapshot().total === 60);
    if (await page.locator('#ld-compatibility-drawer').getAttribute('aria-hidden') === 'false') {
      await page.locator('#ld-compatibility-confirm').click();
      await page.locator('#analyze').click();
    }
    await page.waitForFunction(() => window.GrconTriageUiApi.snapshot().total === 60 && !window.GrconPerformanceDiagnostics.state().busy, null, { timeout: 30000 }).catch(async error => { console.log('qa_diagnostics', await page.evaluate(() => ({ui:window.GrconTriageUiApi.snapshot(),perf:window.GrconPerformanceDiagnostics.state(),body:document.body.innerText.slice(-8000)}))); await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}); throw error; });
    await page.evaluate(async () => {
      await window.GRCONModuleLoader.ensure('xlsx');
      const file = document.getElementById('ld-input').files[0];
      await window.GrconLdCompatibility.prepare(file);
      window.GrconLdCompatibility.open(file);
    });
    await page.locator('#ld-compatibility-confirm').click();
    const panel = page.locator('#documentary-compliance');
    await panel.locator(':scope > summary').click({ timeout: 5000 });
    await page.waitForFunction(() => document.querySelectorAll('.compliance-document').length === 50);
    assert.match(await panel.innerText(), /com alertas/);
    await panel.getByRole('button', { name: 'Carregar mais 50' }).click();
    assert.equal(await page.locator('.compliance-document').count(), 60);
    await panel.getByRole('searchbox').fill(docs[1]);
    assert.equal(await page.locator('.compliance-document').count(), 1);
    await page.locator('.compliance-document > summary').click();
    assert.match(await panel.innerText(), /Classe de serviço/);
    assert.match(await panel.innerText(), /Anexo D/);
    assert.match(await panel.innerText(), /ZZZ/);
    const overflow = await panel.evaluate(node => node.scrollWidth - node.clientWidth);
    assert.ok(overflow <= 1, 'painel sem rolagem horizontal');
    await page.screenshot({ path: path.join(output, 'conformidade-1440.png'), fullPage: true });
    const snapshot = await page.evaluate(() => {
      const row = window.GrconTriageUiApi.getResult(0);
      const plan = window.GrconEmission.createPlan([row], new Set([0]));
      const record = window.GrconHistory.recordFromGenerated({ fileName: 'QA.xls', group: { entries: plan.entries } }, [row], {});
      return { errors: plan.errors, normative: record.normativeValidation, file: record.files[0]?.normativeValidation };
    });
    assert.equal(snapshot.errors.length, 0);
    assert.ok(snapshot.normative?.rulesChecked.length > 0);
    assert.equal(snapshot.file?.results, undefined);
    await panel.getByRole('searchbox').fill(docs[2]);
    await page.locator('.compliance-document > summary').click();
    assert.match(await panel.innerText(), /recomenda não utilizar I/);
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    const mobileOverflow = await panel.evaluate(node => node.scrollWidth - node.clientWidth);
    assert.ok(mobileOverflow <= 1, 'painel sem rolagem horizontal no celular');
    await page.screenshot({ path: path.join(output, 'conformidade-390.png'), fullPage: true });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.body.classList.add('p2-dark'); });
    await page.screenshot({ path: path.join(output, 'conformidade-390-dark.png'), fullPage: true });
    await context.setOffline(true);
    const offline = await page.evaluate(() => window.GrconDocumentaryCompliance.audit({ document: 'RL-5290.00-22313-91B-C1O-001', revision: '0', documentType: 'RL' }).outcome);
    assert.equal(offline, 'CONFORME');
    await context.setOffline(false);
    assert.deepEqual(errors.filter(error => !/supabase|Failed to fetch|ERR_|storage.*initialize/i.test(error)), []);
    fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify({ passed: true, total: 60, initialRendered: 50, search: true, components: true, overflow, mobileOverflow, snapshot: true, offline: true, errors }, null, 2));
    console.log('documentary_compliance_browser: 60 documentos, paginação 50, busca, componentes, snapshot e offline OK.');
  } catch (error) {
    if (page) {
      console.log('qa_visibility', JSON.stringify(await page.evaluate(() => {
        const nodes = ['documentary-compliance', 'results-section', 'analyze', 'ld-compatibility-drawer'].map(id => { const node = document.getElementById(id); const style = getComputedStyle(node); return { id, hidden: node.hidden, display: style.display, visibility: style.visibility, rect: node.getBoundingClientRect().toJSON(), ancestors: Array.from((function*(){ let p=node.parentElement; while(p){yield p;p=p.parentElement;} })()).map(p => ({tag:p.tagName,id:p.id,hidden:p.hidden,display:getComputedStyle(p).display,visibility:getComputedStyle(p).visibility})) }; });
        return { nodes, ui: window.GrconTriageUiApi.snapshot(), body: document.body.innerText.slice(-1800) };
      })));
      await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
    }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
