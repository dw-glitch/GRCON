'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const http = require('node:http');
const XLSX = require('../xlsx.full.min');
const output = path.join(process.cwd(), 'artifacts/grdt-file-revision');
fs.mkdirSync(output, { recursive: true });
const doc = 'C1O_RNEST_U32_3.8.9.1_TUB_REP_VM-320236';
const zero = doc.replace('320236', '320237');
const unknown = doc.replace('320236', '320238');
const unallocated = doc.replace('320236', '320239');
const conflict = doc.replace('320236', '320240');
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
  ['DOCUMENTO','REVISÃO','TÍTULO','FORMATO','DISCIPLINA','TIPO DE DOCUMENTO','PROPÓSITO','CONFIRMAÇÃO DE ALOCAÇÃO','GRDT','DATA EFETIVA DE EMISSÃO'],
  ...[doc, zero, unknown].map(d => [d,'B','RELATÓRIO DE INSPEÇÃO','A4','TUBULAÇÃO','REP','Para Construção','ALOCADO','','']),
  [unallocated,'B','RELATÓRIO SEM ALOCAÇÃO','A4','TUBULAÇÃO','REP','Para Construção','NÃO ALOCADO','',''],
  ...['ALOCADO','NÃO ALOCADO'].map(status => [conflict,'B','RELATÓRIO COM CONFLITO','A4','TUBULAÇÃO','REP','Para Construção',status,'','']),
]), 'ET');
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
  ['DOCUMENTO','REVISÃO','STATUS SIGEM'], [doc,'A','Sem Comentários'], [zero,'0','Sem Comentários'],
]), 'Colar SIGEM');
const ld = path.join(output, 'LD_001.xlsx');
fs.writeFileSync(ld, XLSX.write(book, { type:'buffer', bookType:'xlsx' }));
const names = [`${doc}_A.pdf`, `${doc}_B.pdf`, `${doc}_B.docx`, `${zero}.pdf`, `${unknown}_ERRADO.pdf`, `${unallocated}_A.pdf`, `${unallocated}_A.docx`, `${conflict}_B.pdf`];
const bundle = path.join(output, 'bundle');
fs.mkdirSync(bundle, { recursive:true });
names.forEach(name => fs.writeFileSync(path.join(bundle, name), '%PDF-1.4\n%%EOF'));
(async () => {
  const server=http.createServer((req,res)=>{
    const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';
    const root=path.resolve(__dirname,'..'),file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.webm':'video/webm'}[path.extname(file)];
    if(type)res.setHeader('content-type',type);
    fs.createReadStream(file).on('error',()=>{res.statusCode=404;res.end();}).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({ args:['--no-sandbox'], ...(process.env.GRCON_CHROMIUM_PATH ? { executablePath:process.env.GRCON_CHROMIUM_PATH } : {}) });
    for (const worker of [true, false]) {
      const context = await browser.newContext({ viewport:{ width:1366,height:768 }, serviceWorkers:'block' });
      if (!worker) await context.addInitScript(() => { window.__qaNativeWorker = window.Worker; window.Worker = undefined; });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(process.env.GRCON_PREVIEW_URL || `http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction(() => window.GrconTriageUiApi && window.GRCONModuleLoader);
      await page.addStyleTag({ content:'#grcon-cloud-auth{display:none!important} html.grcon-cloud-pending body > :not(script){visibility:visible!important}' });
      await page.locator('#ld-input').setInputFiles(ld);
      await page.locator('#pdf-input').setInputFiles(bundle);
      await page.locator('#analyze').click();
      await page.waitForFunction(() => document.getElementById('ld-compatibility-drawer').getAttribute('aria-hidden') === 'false'
        || window.GrconTriageUiApi.snapshot().total === 6);
      if (await page.locator('#ld-compatibility-drawer').getAttribute('aria-hidden') === 'false') {
        await page.locator('#ld-compatibility-confirm').click();
        await page.locator('#analyze').click();
      }
      await page.waitForFunction(() => window.GrconTriageUiApi.snapshot().total > 0 && !window.GrconPerformanceDiagnostics.state().busy, null, { timeout:30000 }).catch(async error => {
        console.error('analysis state', await page.evaluate(() => ({snapshot:window.GrconTriageUiApi.snapshot(), diagnostics:window.GrconPerformanceDiagnostics.state(), toast:document.getElementById('toast')?.innerText, text:document.body.innerText.slice(-12000)})));
        await page.screenshot({path:path.join(output, worker ? 'worker-failure.png' : 'legacy-failure.png'), fullPage:true});
        throw error;
      });
      assert.equal(await page.evaluate(() => window.GrconTriageUiApi.snapshot().total), 6);
      const rows = await page.evaluate(() => window.GrconTriageUiApi.filteredIndices().map(i => {
        const r = window.GrconTriageUiApi.getResult(i);
        return { index:i, document:r.document, revision:r.revision, fileRevision:r.fileRevision, decision:r.decision, files:r.files.length };
      }));
      const a = rows.find(r => r.document === doc && r.revision === 'A');
      const b = rows.find(r => r.document === doc && r.revision === 'B');
      const z = rows.find(r => r.document === zero);
      const u = rows.find(r => r.document === unknown);
      const n = rows.find(r => r.document === unallocated);
      const c = rows.find(r => r.document === conflict);
      assert.equal(a.decision, 'descartar'); assert.equal(b.decision, 'pronto');
      assert.equal(b.files, 2); assert.equal(z.revision, '0'); assert.equal(z.decision, 'descartar');
      assert.equal(u.revision, ''); assert.equal(u.decision, 'revisar');
      const select = index => page.locator(`tr.result-row[data-index="${index}"] [data-select-row]`);
      assert.equal(await select(a.index).isChecked(), false);
      assert.equal(await select(b.index).isChecked(), true);
      assert.equal(await select(z.index).isChecked(), false);
      assert.equal(await select(u.index).isChecked(), false);
      assert.equal(await select(n.index).isChecked(), false);
      assert.equal(await select(c.index).isChecked(), false);
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
      // An explicit selection survives the real generation-time SIGEM refresh.
      // The early allocation return originally exposed "Não alocado" as if it
      // were a SIGEM status, invalidating the manual choice just before export.
      assert.equal(await select(n.index).isEnabled(), true);
      await select(n.index).check();
      assert.equal(await page.evaluate(() => window.GrconTriageUiApi.ensureFreshAnalysis()), true);
      assert.equal(await select(n.index).isChecked(), true, 'manual unallocated selection must survive freshness checks');
      preview = await page.evaluate(() => window.GrconEgrdtBatchPlan.preview('physical'));
      assert.equal(preview.valid, true, preview.errors.join('\n')); assert.equal(preview.totalItems, 6);
      assert.equal(await select(c.index).isEnabled(), true);
      await select(c.index).check();
      assert.equal(await page.evaluate(() => window.GrconTriageUiApi.ensureFreshAnalysis()), true);
      assert.equal(await select(c.index).isChecked(), true, 'allocation conflict selection must remain explicit');
      preview = await page.evaluate(() => window.GrconEgrdtBatchPlan.preview('physical'));
      assert.equal(preview.valid, true, preview.errors.join('\n')); assert.equal(preview.totalItems, 7);
      assert.equal(await page.evaluate(i => window.GrconTriageUiApi.getResult(i).allocationStatus, n.index), 'NÃO ALOCADO');
      if (!worker) await page.evaluate(() => {
        // The triage/export capability was captured as false at initialization.
        // Restore only the independent Cofre hashing transport for the download.
        window.Worker = window.__qaNativeWorker;
        if(window.GrconPerformance?.supported!==false)throw new Error('legacy export must stay active');
      });
      const downloaded=page.waitForEvent('download', {timeout:30000});
      await page.locator('#export-zip').click();
      await page.locator('#p1-sequence-confirm').check();
      await page.locator('#p1-confirm-ok').click();
      const download=await downloaded.catch(async error=>{
        console.error('download diagnostics',await page.evaluate(()=>({toast:document.getElementById('toast')?.innerText,progress:window.GrconGrdtDownloadProgress?.metrics(),state:window.GrconPerformanceDiagnostics.state(),selected:window.GrconEgrdtBatchPlan.preview('physical')})));
        throw error;
      }), zipPath=path.join(output,worker?'manual-worker.zip':'manual-legacy.zip');
      await download.saveAs(zipPath);
      const zip=await require('../jszip.min.js').loadAsync(fs.readFileSync(zipPath));
      for(const name of [`${unallocated}_A.pdf`,`${unallocated}_A.docx`,`${conflict}_B.pdf`]) {
        const member=Object.values(zip.files).find(f => !f.dir && f.name.split('/').pop()===name);
        assert.ok(member, `manual file present in downloaded package: ${name}`);
        assert.equal(await member.async('string'), '%PDF-1.4\n%%EOF');
      }
      const grdt=Object.values(zip.files).find(f => /\.xls$/i.test(f.name));assert.ok(grdt, 'official GRDT in package');
      const exported=XLSX.read(await grdt.async('uint8array'),{type:'array'});
      const cells=Object.values(exported.Sheets[exported.SheetNames[0]]).map(c => c.v);
      assert.equal(cells.filter(v => v===unallocated).length,2, 'PDF and native are both described in the GRDT');
      assert.equal(cells.filter(v => v===conflict).length,1);
      await select(n.index).uncheck();
      assert.equal((await page.evaluate(() => window.GrconEgrdtBatchPlan.preview('physical'))).totalItems,5,'unchecking withdraws the manual inclusion');
      await page.locator('#results-scroll').scrollIntoViewIfNeeded();
      await page.screenshot({ path:path.join(output, worker ? 'worker.png' : 'legacy.png'), fullPage:true });
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ mode:worker ? 'Worker' : 'Legado', rows, finalItems:preview.totalItems, manualOverride:true, unallocatedPackageVerified:true, errors }));
      await context.close();
    }
  } finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
