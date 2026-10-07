'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright')
  : 'playwright');
const XLSX = require('../xlsx.full.min.js');

(async () => {
  const out = path.resolve(__dirname, '../artifacts/document-workflows-auto');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block', acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    const calls = [];
    page.on('pageerror', error => errors.push(error.message));

    let files = Array.from({ length: 120 }, (_, i) => {
      const allocated = i % 3 === 0;
      const identified = i % 3 !== 2;
      return {
        id: 'qa-' + i,
        sequence: i + 1,
        document_code: 'DOC-' + String(i + 1).padStart(3, '0'),
        identity_code: 'DOC-' + String(i + 1).padStart(3, '0'),
        revision: '0',
        file_name: 'DOC-' + String(i + 1).padStart(3, '0') + '_0.pdf',
        format: 'pdf',
        size_bytes: 3,
        sha256: String(i + 1).padStart(64, '0'),
        allocated,
        allocation_identified: identified,
        allocation_label: allocated ? 'C1O-ALOC-QA-' + String(i + 1).padStart(4, '0') : identified ? 'Não informado no Controle' : 'Não identificado',
        allocation_source: 'Controle de Solicitações',
        status: 'ready',
        created_by_name: 'Owner QA',
        created_at: '2026-10-07T12:00:00Z',
      };
    });

    await page.route('**/api/document-vault/**', async route => {
      const req = route.request();
      const url = new URL(req.url());
      const action = url.pathname.split('/').pop();
      calls.push({ action, method: req.method(), query: Object.fromEntries(url.searchParams) });
      let data = { ok: true };
      if (action === 'health') data = { ok: true, supabaseConfigured: true, r2Configured: true };
      if (action === 'usage') data = {
        ok: true,
        storage: {
          checkedAt: '2026-10-07T14:30:00Z',
          source: 'catalog',
          usedBytes: files.reduce((sum, file) => sum + file.size_bytes, 0),
          fileCount: files.length,
          catalogDocuments: files.length,
          pendingChecked: 0,
          lastReconciledAt: '2026-10-07T14:00:00Z',
        },
      };
      if (action === 'reconcile') data = {
        ok: true,
        storage: {
          checkedAt: '2026-10-07T14:31:00Z',
          source: 'r2',
          usedBytes: files.reduce((sum, file) => sum + file.size_bytes, 0),
          fileCount: files.length,
          physicalObjects: files.length,
          physicalBytes: files.reduce((sum, file) => sum + file.size_bytes, 0),
          catalogObjects: files.length,
          catalogDocuments: files.length,
          missingObjects: 0,
          sizeMismatches: 0,
          orphanObjects: 0,
          removedPendingFinalization: 0,
        },
      };
      if (action === 'list') {
        const q = url.searchParams.get('q') || '';
        const allocation = url.searchParams.get('allocation') || 'all';
        const after = Number(url.searchParams.get('after') || 0);
        const limit = Number(url.searchParams.get('limit') || 50);
        const matchesAllocation = file => allocation === 'all'
          || (allocation === 'allocated' && file.allocated)
          || (allocation === 'not_allocated' && file.allocation_identified && !file.allocated)
          || (allocation === 'not_identified' && !file.allocation_identified);
        const all = files.filter(file => file.sequence > after && file.document_code.includes(q) && matchesAllocation(file));
        const batch = all.slice(0, limit);
        data = { ok: true, files: batch, has_more: all.length > limit, next: all.length > limit ? batch.at(-1).sequence : null };
      }
      if (action === 'lookup') {
        const payload = req.postDataJSON();
        data = {
          ok: true,
          results: payload.items.map(item => ({
            requestId: item.requestId,
            documentCode: item.documentCode,
            requestedRevision: item.revision,
            matches: files.filter(file => file.document_code === item.documentCode && (!item.revision || file.revision === item.revision)),
          })),
        };
      }
      if (action === 'download') {
        return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('PDF') });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });

    await page.route('https://kvyrttccwzdhasplfxnr.supabase.co/**', route =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"QA"}' })
    );

    await page.goto('http://127.0.0.1:8778/', { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: 'html.grcon-cloud-pending body > :not(.grcon-cloud-auth):not(script){visibility:visible!important}#grcon-cloud-auth{display:none!important}' });
    await page.waitForFunction(() => window.GrconDocumentVault);

    await page.evaluate(() => {
      const workspace = '00000000-0000-4000-8000-000000000001';
      window.GrconCloud = {
        state: {
          membership: { workspace_id: workspace, contract_id: 'qa-contract', role: 'owner' },
          contract: { display_name: 'CONSAG / RNEST / UHDT-D', code: 'UHDT-D' },
          session: { access_token: 'qa-session' },
          online: true,
        },
      };
      window.dispatchEvent(new CustomEvent('grcon:cloud-ready'));
    });

    assert.equal(await page.locator('input[name="grdt-document-source"]').count(), 0, 'manual Local/Cofre selector must not exist');
    assert.equal(await page.locator('#grdt-auto-source-help').count(), 1, 'automatic source guidance must exist');
    assert.match(await page.locator('#grdt-auto-source-help').textContent(), /pasta documental é opcional/i);

    await page.evaluate(() => window.GrconDocumentVault.open());
    await page.waitForFunction(() => document.querySelectorAll('#vault-list-body tr').length > 0);
    assert.match(await page.locator('#vault-storage-used').textContent(), /B|KB|MB|GB/);
    assert.match(await page.locator('#vault-storage-integrity').textContent(), /catálogo/i);

    await page.locator('#vault-allocation').selectOption('not_identified');
    await page.waitForFunction(() => window.GrconDocumentVault.state.allocation === 'not_identified' && !window.GrconDocumentVault.state.loading);
    assert.ok((await page.locator('#vault-list-body tr').count()) > 0);
    assert.match(await page.locator('#vault-list-body').textContent(), /Não identificado/);

    await page.locator('#vault-allocation').selectOption('allocated');
    await page.waitForFunction(() => window.GrconDocumentVault.state.allocation === 'allocated' && !window.GrconDocumentVault.state.loading);
    const exportDownload = page.waitForEvent('download');
    await page.locator('#vault-export').click();
    const exported = await exportDownload;
    const exportPath = path.join(out, 'cofre.xlsx');
    await exported.saveAs(exportPath);
    const workbook = XLSX.read(fs.readFileSync(exportPath), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Cofre);
    assert.ok(rows.length > 0);
    assert.ok(rows.every(row => row['Fonte da alocação'] === 'Controle de Solicitações'));
    assert.ok(rows.every(row => String(row['Alocação']).startsWith('C1O-ALOC-QA-')));

    await page.locator('#vault-storage-reconcile').click();
    await page.waitForFunction(() => !document.querySelector('#vault-storage-reconcile').disabled);
    assert.ok(calls.some(call => call.action === 'reconcile'));
    assert.match(await page.locator('#vault-storage-integrity').textContent(), /coerentes/i);

    const fallbackCodes = [
      ...Array.from({ length: 27 }, (_, i) => 'DOC-' + String(i + 1).padStart(3, '0')),
      'DOC-900', 'DOC-901', 'DOC-902',
    ];
    const lookupBefore = calls.filter(call => call.action === 'lookup').length;
    const fallback = await page.evaluate(async codes => window.GrconDocumentVault.resolveMissingEntries(
      codes.map((document, index) => ({ document, fileName: document + '.pdf', raw: document, sheetName: 'Entrada por texto', rowNumber: index + 1 }))
    ), fallbackCodes);
    assert.equal(fallback.files.length, 27);
    assert.equal(fallback.missing.length, 3);
    assert.equal(calls.filter(call => call.action === 'lookup').length - lookupBefore, 1, 'missing set is queried as one batch');

    const metrics = [];
    for (const size of [10, 50, 100]) {
      const entries = Array.from({ length: size }, (_, i) => {
        const document = 'DOC-' + String(i + 1).padStart(3, '0');
        return { document, fileName: document + '.pdf', raw: document, sheetName: 'Entrada por texto', rowNumber: i + 1 };
      });
      const beforeLookup = calls.filter(call => call.action === 'lookup').length;
      const beforeDownload = calls.filter(call => call.action === 'download').length;
      const start = performance.now();
      const result = await page.evaluate(async source => window.GrconDocumentVault.resolveMissingEntries(source), entries);
      const elapsed = Math.round(performance.now() - start);
      assert.equal(result.files.length, size);
      assert.equal(result.missing.length, 0);
      assert.equal(calls.filter(call => call.action === 'lookup').length - beforeLookup, 1);
      assert.equal(calls.filter(call => call.action === 'download').length - beforeDownload, size);
      metrics.push({ documents: size, automaticFallbackMs: elapsed, lookupRequests: 1, downloads: size });
    }

    await page.screenshot({ path: path.join(out, 'cofre-auto-1366.png') });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ ok: true, metrics, missing: fallback.missing.length, errors }, null, 2));
    console.log('Automatic document workflows browser QA passed:', JSON.stringify(metrics));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
