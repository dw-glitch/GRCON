'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const XLSX = require('../xlsx.full.min.js');
const fs = require('node:fs');

(async () => {
  const base = process.env.GRCON_PREVIEW_URL || 'http://127.0.0.1:8765';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__qa-performance', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>GRCON QA</title><body>QA</body>' }));
  try {
    await page.goto(base + '/__qa-performance');
    await page.addScriptTag({ url: base + '/performance_workers.js' });
    await page.addScriptTag({ url: base + '/xlsx.full.min.js' });
    const measured = await page.evaluate(async () => {
      const rows = Array.from({ length: 20000 }, (_, i) => ({ Documento: `QA-${i}`, Revisão: i % 2 ? 'A' : '0', Status: 'Emitido' }));
      const baselineBook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(baselineBook, window.XLSX.utils.json_to_sheet(rows), 'Relação');
      const baselineStarted = performance.now();
      window.XLSX.write(baselineBook, { type: 'array', bookType: 'xlsx', compression: true });
      const baselineBlockMs = performance.now() - baselineStarted;
      let ticks = 0, last = performance.now(), maxGap = 0;
      const timer = setInterval(() => { const current = performance.now(); maxGap = Math.max(maxGap, current - last); last = current; ticks++; }, 16);
      const started = performance.now();
      const buffer = await window.GrconPerformance.buildSpreadsheet('sigem-dashboard', {
        sheets: [{ name: 'Relação', rows }, { name: 'Metadados', rows: [{ Item: 'Escopo', Valor: 'Todas as revisões' }] }],
      });
      clearInterval(timer);
      const elapsed = performance.now() - started;
      const book = window.XLSX.read(buffer, { type: 'array' });
      const data = window.XLSX.utils.sheet_to_json(book.Sheets['Relação']);
      return { baselineBlockMs, ticks, maxGap, elapsed, count: data.length, first: data[0], last: data.at(-1), sheets: book.SheetNames };
    });
    assert.equal(measured.count, 20000);
    assert.equal(measured.first.Documento, 'QA-0');
    assert.equal(measured.last.Documento, 'QA-19999');
    assert.deepEqual(measured.sheets, ['Relação', 'Metadados']);
    assert.ok(measured.ticks > 2, 'the interface must keep responding while Excel is built');

    // Read the actual binary from the other three paths, using shared formatters.
    const exports = await page.evaluate(async () => {
      const tasks = [
        ['consultation', { title: 'QA', rows: [{ document: 'QA-CONSULTA', revision: 'A', title: 'Título', internalTaxonomy: 'TX-EXATA', situation: 'Localizado' }],
          options: { columns: [{ key: 'document', header: 'Documento' }, { key: 'revision', header: 'Revisão' }, { key: 'internalTaxonomy', header: 'Taxonomia Interna' }, { key: 'situation', header: 'Situação' }], metadata: 'QA', ldNames: 'QA.xlsx' } }],
        ['vault', { columns: [{ header: 'Código', key: 'document' }, { header: 'Hash', key: 'hash' }, { header: 'Data', key: 'date' }, { header: 'Tamanho', key: 'size' }],
          rows: [{ document: 'QA-COFRE', hash: 'a'.repeat(64), date: new Date('2026-10-08T12:00:00Z'), size: 123 }] }],
        ['conference', { rows: [], options: { mode: 'documents', baseFileName: 'QA.xlsx', baseImportedAt: '2026-10-08T12:00:00Z' } }],
      ];
      const results = [];
      for (const [kind, payload] of tasks) {
        const buffer = await window.GrconPerformance.buildSpreadsheet(kind, payload);
        const book = window.XLSX.read(buffer, { type: 'array' });
        const values = Object.values(book.Sheets).flatMap(sheet => window.XLSX.utils.sheet_to_json(sheet, { header: 1 }).flat());
        results.push({ kind, sheets: book.SheetNames, values });
      }
      return results;
    });
    assert.ok(exports[0].values.includes('QA-CONSULTA'));
    assert.ok(exports[0].values.includes('TX-EXATA'));
    assert.ok(exports[1].values.includes('QA-COFRE'));
    assert.ok(exports[1].values.includes('a'.repeat(64)));
    assert.ok(exports[2].values.some(value => String(value).includes('QA.xlsx')));

    await page.addScriptTag({ url: base + '/exceljs.min.js' });
    await page.addScriptTag({ url: base + '/sigem_pw_dashboard_core.js' });
    await page.addScriptTag({ url: base + '/sigem_pw_revision_core.js' });
    await page.addScriptTag({ url: base + '/sigem_pw_revision_report.js' });
    const additional = await page.evaluate(async () => {
      const runner = window.GrconPerformance;
      const kinds = [];
      window.GrconPerformance = { ...runner, buildSpreadsheet(kind, payload) { kinds.push(kind); return runner.buildSpreadsheet(kind, payload); } };
      const rows = Array.from({ length: 20000 }, (_, i) => ({
        document: `QA-REV-${String(i).padStart(5, '0')}`, documentClass: 'ET', sigemRevision: '0', pwRevision: '01',
        sigemStatus: 'Em Análise', pwStatus: 'Aprovado', situation: 'pw-previous', reason: 'Ação necessária\nRevisão anterior',
        sigemRows: [{ revision: '0', status: 'Em Análise' }], pwRows: [{ revision: '01', state: 'Aprovado', emittedEvidence: true }],
      }));
      const filters = { situation: 'all', search: 'QA-REV', documentList: 'QA-REV-00000\nQA-REV-19999' };
      const options = { createdAt: new Date('2026-10-09T12:00:00Z'), brandAssets: { optionalHelper() {} } };
      let ticks = 0, last = performance.now(), maxGap = 0;
      const timer = setInterval(() => { const current = performance.now(); maxGap = Math.max(maxGap, current - last); last = current; ticks++; }, 16);
      const started = performance.now();
      const buffer = await window.GrconSigemPwRevisionReport.buildWorkbook(rows, filters, options);
      clearInterval(timer);
      const revisionMs = performance.now() - started;
      const book = window.XLSX.read(buffer, { type: 'array' });
      const data = window.XLSX.utils.sheet_to_json(book.Sheets['Lista Filtrada'], { defval: '' });
      const expected = window.GrconSigemPwRevisionReport.exportRows(rows);
      if (JSON.stringify(data) !== JSON.stringify(expected)) {
        const index = data.findIndex((row, i) => JSON.stringify(row) !== JSON.stringify(expected[i]));
        throw new Error('Revision worker cell comparison: ' + JSON.stringify({ count: data.length, expectedCount: expected.length, index, actual: data[index], expected: expected[index] }));
      }
      const filterData = window.XLSX.utils.sheet_to_json(book.Sheets['Filtros Aplicados'], { header: 1 });
      // Real worker and the existing local builder must preserve every cell.
      const smallRows = rows.slice(0, 3);
      const workerSmall = await window.GrconSigemPwRevisionReport.buildWorkbook(smallRows, filters, options);
      window.GrconPerformance = { ...runner, supported: false };
      const localSmall = await window.GrconSigemPwRevisionReport.buildWorkbook(smallRows, filters, options);
      const cells = bytes => {
        const b = window.XLSX.read(bytes, { type: 'array' });
        return b.SheetNames.map(name => ({ name, cells: window.XLSX.utils.sheet_to_json(b.Sheets[name], { header: 1, defval: '' }) }));
      };
      if (JSON.stringify(cells(workerSmall)) !== JSON.stringify(cells(localSmall))) throw new Error('Worker/local revision workbook mismatch.');
      window.GrconPerformance = { ...runner, supported: true, buildSpreadsheet() { return Promise.reject(new Error('QA worker failure')); } };
      const fallback = await window.GrconSigemPwRevisionReport.buildWorkbook(smallRows, filters, options);
      if (JSON.stringify(cells(fallback)) !== JSON.stringify(cells(localSmall))) throw new Error('Compatible fallback changed revision workbook.');
      window.GrconPerformance = runner;
      const evoRows = rows.map((row, i) => ({ Código: row.document, Revisão: i % 2 ? 'A' : '0', Título: 'Título com acento', Origem: 'SIGEM' }));
      const scope = [{ Item: 'Escopo de revisão', Valor: 'Todas as revisões' }];
      const evolution = await runner.buildSpreadsheet('sigem-evolution', { sheets: [{ name: 'Evolução', rows: evoRows }, { name: 'Escopo', rows: scope }], compression: false });
      const evolutionBook = window.XLSX.read(evolution, { type: 'array' });
      if (JSON.stringify(window.XLSX.utils.sheet_to_json(evolutionBook.Sheets['Evolução'])) !== JSON.stringify(evoRows)) throw new Error('Evolution worker changed cells.');
      return { revision: { count: data.length, ticks, maxGap, elapsed: revisionMs, sheets: book.SheetNames, filtersPreserved: filterData.some(r => r.includes('QA-REV')), workerKinds: kinds, localParity: true, fallbackParity: true }, evolution: { count: evoRows.length, sheets: evolutionBook.SheetNames, cellParity: true } };
    });
    assert.equal(additional.revision.count, 20000);
    assert.ok(additional.revision.ticks > 2, 'revision Excel must leave the interface responding');
    assert.ok(additional.revision.workerKinds.includes('sigem-revisions'));
    assert.ok(additional.revision.filtersPreserved);
    assert.deepEqual(additional.evolution.sheets, ['Evolução', 'Escopo']);
    assert.deepEqual(errors, []);
    fs.mkdirSync('artifacts/performance', { recursive: true });
    fs.writeFileSync('artifacts/performance/metrics.json', JSON.stringify({ excel20000: measured, exports: exports.map(({ kind, sheets }) => ({ kind, sheets })), additional }, null, 2));
    console.log('revision-evolution-workers:', JSON.stringify(additional));
    console.log('performance-browser:', JSON.stringify({ excel20000: measured, exports: exports.map(({ kind, sheets }) => ({ kind, sheets })) }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
