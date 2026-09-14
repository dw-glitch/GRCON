const { test, expect } = require('@playwright/test');

function seedData() {
  const history = [];
  for (let index = 1; index <= 1205; index += 1) {
    const sequence = String(index).padStart(4, '0');
    const family = index % 3 === 0 ? 'CV' : index % 2 === 0 ? 'N-1710' : 'ET';
    const document = family === 'CV'
      ? `5900.00.2231.391-C1O-CV-TST-${sequence}`
      : family === 'N-1710'
        ? `DE-5290.00-22313-970-C1O-${sequence}`
        : `C1O_RNEST_U32_3.1.1.1_TUB_REP_VM-${sequence}`;
    const generatedAt = new Date(Date.UTC(2026, 8, 3, 12, 0, 0) - index * 60_000).toISOString();
    const egrdtNumber = `0130870-C1O-PGV-G-${sequence}-2026 - eGRDT`;
    history.push({
      id: `history-${sequence}`,
      clientRecordId: `history-${sequence}`,
      egrdtNumber,
      generatedAt,
      outputType: 'Pacote completo',
      ldName: `LD_${family}_${sequence}.xlsx`,
      sourceName: 'Teste E2E',
      files: [{
        document,
        originalName: `${document}.pdf`,
        finalName: `${document}_0001_A.pdf`,
        revision: 'A',
        grdtRevision: 'A',
        discipline: family === 'CV' ? 'CIVIL' : 'TUBULAÇÃO',
        allocation: `ALOC-${sequence}`,
        allocationStatus: 'ALOCADO',
        sheet: family,
        ldVersion: 'E2E',
        databook: `Databook/${family}`,
      }],
    });
  }

  const postings = history.slice(0, 305).map((record, index) => ({
    id: `posting-${String(index + 1).padStart(4, '0')}`,
    historyId: record.id,
    egrdtNumber: record.egrdtNumber,
    generatedAt: record.generatedAt,
    createdAt: record.generatedAt,
    updatedAt: record.generatedAt,
    status: 'POSTADO',
    postingGrdtNumber: record.egrdtNumber,
    resultAt: record.generatedAt,
    files: record.files,
  }));

  localStorage.setItem('grcon.egrdt.history.v1', JSON.stringify(history));
  localStorage.setItem('grcon.sigem.postings.v1', JSON.stringify(postings));
}

async function preparePage(page) {
  await page.route('**/grcon_cloud_app.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript; charset=utf-8',
      body: `
        (function(){
          window.GrconCloud = {
            state: { membership: null, online: false },
            canWriteHistory: function(){ return true; },
            canManageHistory: function(){ return true; },
            canManageMembers: function(){ return true; },
            pull: async function(){ return { pulled: 0 }; },
            sync: function(){},
            reserveEgrdtSequences: async function(){ return { reservations: [] }; },
            deleteHistoryRecord: async function(){ return { deleted: true }; },
            clearHistory: async function(){ return true; }
          };
        })();
      `,
    });
  });

  await page.addInitScript(seedData);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.GrconOperationalPersistence?.status?.().ready === true, null, { timeout: 15_000 });
  return pageErrors;
}

async function openHistory(page) {
  await page.locator('[data-grcon-view="history"]').first().click();
  await expect(page.locator('#history-module')).toBeVisible();
  await expect(page.locator('#history-list [data-history-id]').first()).toBeVisible();
}

test('migra sem truncar mais de 1.000 eGRDTs e 240 registros SIGEM', async ({ page }) => {
  const errors = await preparePage(page);
  const snapshot = await page.evaluate(() => ({
    persistence: window.GrconOperationalPersistence.status(),
    history: window.GrconHistory.read().length,
    postings: window.GrconSigemPosting.read().length,
  }));

  expect(snapshot.persistence.ready).toBe(true);
  expect(snapshot.history).toBe(1205);
  expect(snapshot.postings).toBe(305);
  expect(errors).toEqual([]);
});

test('Histórico pagina 200 registros, mantém filtros e usa um único índice SIGEM por render', async ({ page }) => {
  const errors = await preparePage(page);
  await openHistory(page);

  await expect(page.locator('#history-list [data-history-id]')).toHaveCount(200);
  await expect(page.locator('[data-history-load-more]')).toBeVisible();

  let metrics = await page.evaluate(() => window.GrconHistoryUi.performanceSnapshot());
  expect(metrics.renderedRecords).toBe(200);
  expect(metrics.totalRecords).toBe(1205);
  expect(metrics.postingReadsLastRender).toBeLessThanOrEqual(1);

  await page.locator('[data-history-load-more]').click();
  await expect(page.locator('#history-list [data-history-id]')).toHaveCount(400);

  await page.locator('#history-period-document-type').selectOption('CV');
  const families = await page.locator('#history-list [data-history-id]').evaluateAll((nodes) => nodes.map((node) => node.textContent));
  expect(families.length).toBeGreaterThan(0);
  expect(families.every((text) => /CV/i.test(text) || /eGRDT/i.test(text))).toBe(true);

  await page.locator('#history-period-document-type').selectOption('');
  await page.locator('#history-search').fill('VM-0001');
  await page.waitForTimeout(180);
  await expect(page.locator('#history-list [data-history-id]')).toHaveCount(1);

  metrics = await page.evaluate(() => window.GrconHistoryUi.performanceSnapshot());
  expect(metrics.postingReadsLastRender).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('abrir, sair e voltar ao Histórico não produz atualização tardia perceptível', async ({ page }) => {
  const errors = await preparePage(page);

  await page.evaluate(() => {
    window.__grconLayoutShifts = [];
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__grconLayoutShifts.push(entry.value);
        }
      });
      try { observer.observe({ type: 'layout-shift', buffered: true }); } catch (_) {}
      window.__grconLayoutObserver = observer;
    }
  });

  await openHistory(page);
  await page.waitForTimeout(350);
  await expect(page.locator('#history-list [data-pc-history-badge]').first()).toBeVisible();

  const firstFrames = await page.evaluate(async () => {
    const sample = () => {
      const list = document.querySelector('#history-list');
      const detail = document.querySelector('#history-detail');
      const badgeCount = document.querySelectorAll('#history-list [data-pc-history-badge]').length;
      return {
        listHeight: Math.round(list?.getBoundingClientRect().height || 0),
        detailHeight: Math.round(detail?.getBoundingClientRect().height || 0),
        badgeCount,
      };
    };
    const values = [];
    for (let i = 0; i < 4; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      values.push(sample());
    }
    return values;
  });

  expect(new Set(firstFrames.map((item) => `${item.listHeight}|${item.detailHeight}|${item.badgeCount}`)).size).toBe(1);

  await page.locator('[data-grcon-view="control"]').first().click();
  await expect(page.locator('#grdt-module')).toBeVisible();
  await page.locator('[data-grcon-view="history"]').first().click();
  await expect(page.locator('#history-module')).toBeVisible();
  await page.waitForTimeout(250);

  const shiftScore = await page.evaluate(() => (window.__grconLayoutShifts || []).reduce((sum, value) => sum + value, 0));
  expect(shiftScore).toBeLessThan(0.12);
  expect(errors).toEqual([]);
});

test('Conferência permanece navegável após repetidas visitas ao Histórico', async ({ page }) => {
  const errors = await preparePage(page);
  await openHistory(page);
  await page.locator('[data-grcon-view="control"]').first().click();
  await openHistory(page);
  await page.locator('[data-pc-open="sidebar"]').click();

  await expect(page.locator('#posting-conference-module')).toBeVisible();
  await expect(page.locator('[data-pc-open="sidebar"]')).toHaveClass(/active/);
  expect(errors).toEqual([]);
});
