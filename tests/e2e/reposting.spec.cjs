const { test, expect } = require('@playwright/test');

const DOC = 'MC-5290.00-22313-970-C1O-009';
const OTHER = 'DE-5290.00-22313-142-C1O-076';

function seed() {
  const record = {
    id: 'history-repost-1', clientRecordId: 'history-repost-1',
    egrdtNumber: '0130870-C1O-PGV-G-0042-2026 - eGRDT',
    generatedAt: '2026-09-03T12:00:00Z', outputType: 'Pacote completo', ldName: 'LD_TESTE.xlsx', sourceName: 'E2E',
    files: [
      { document: DOC, originalName: `${DOC}_0001_0.pdf`, finalName: `${DOC}_0001_0.pdf`, revision: '0', grdtRevision: '0', discipline: 'MECÂNICA', allocation: 'ALOC-0042', allocationStatus: 'ALOCADO', sheet: 'N-1710', ldVersion: 'E2E', databook: 'Databook/MEC' },
      { document: DOC, originalName: `${DOC}_0001_0.xlsx`, finalName: `${DOC}_0001_0.xlsx`, revision: '0', grdtRevision: '0', discipline: 'MECÂNICA', allocation: 'ALOC-0042', allocationStatus: 'ALOCADO', sheet: 'N-1710', ldVersion: 'E2E', databook: 'Databook/MEC' },
      { document: OTHER, originalName: `${OTHER}_0001_A.pdf`, finalName: `${OTHER}_0001_A.pdf`, revision: 'A', grdtRevision: 'A', discipline: 'CIVIL', allocation: 'ALOC-0043', allocationStatus: 'ALOCADO', sheet: 'N-1710', ldVersion: 'E2E', databook: 'Databook/CIVIL' },
    ],
  };
  localStorage.setItem('grcon.egrdt.history.v1', JSON.stringify([record]));
}

async function prepare(page) {
  await page.route('**/grcon_cloud_app.js', (route) => route.fulfill({
    contentType: 'application/javascript; charset=utf-8',
    body: `(function(){window.GrconCloud={state:{membership:null,online:false,session:{user:{id:'e2e-user',email:'e2e@grcon.local',user_metadata:{display_name:'Operador E2E'}}}},canWriteHistory:()=>true,canManageHistory:()=>true,canManageMembers:()=>true,pull:async()=>({pulled:0}),sync:()=>{},reserveEgrdtSequences:async()=>({reservations:[]}),deleteHistoryRecord:async()=>({deleted:true}),clearHistory:async()=>true};document.documentElement.classList.remove('grcon-cloud-pending','grcon-cloud-locked');})();`,
  }));
  await page.addInitScript(seed);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.GrconOperationalPersistence?.status?.().ready === true && window.GrconRevisionControl?.updateDocumentRevision && window.GrconRepostingUi, null, { timeout: 20_000 });
  return errors;
}

async function openHistory(page) {
  await page.locator('[data-grcon-view="history"]').first().click();
  await expect(page.locator('#history-module')).toBeVisible();
  await expect(page.locator('#history-list [data-history-id]').first()).toBeVisible();
  await expect(page.locator('[data-history-revision-edit]')).toBeVisible();
}

test('cancela, altera revisão 0→B, preserva outro documento e mantém após reload', async ({ page }) => {
  const errors = await prepare(page);
  await openHistory(page);

  await page.locator('[data-history-revision-edit]').click();
  await expect(page.locator('#grcon-revision-overlay')).toBeVisible();
  await expect(page.locator('#grcon-revision-current')).toHaveText('0');
  await page.locator('#grcon-revision-new').fill('A');
  await page.locator('#grcon-revision-review').click();
  await expect(page.locator('#grcon-revision-confirm')).toContainText(DOC);
  await expect(page.locator('#grcon-revision-confirm')).toContainText('0');
  await expect(page.locator('#grcon-revision-confirm')).toContainText('A');
  await page.locator('[data-revision-close]').last().click();
  expect(await page.evaluate(() => window.GrconHistory.read()[0].files.filter((f) => f.document === DOC).every((f) => f.revision === '0'))).toBe(true);

  await page.locator('[data-history-revision-edit]').click();
  await page.locator('#grcon-revision-new').fill('B');
  await page.locator('#grcon-revision-review').click();
  await page.locator('#grcon-revision-save').click();
  await expect(page.locator('#grcon-revision-overlay')).toBeHidden();

  let snapshot = await page.evaluate(() => {
    const record = window.GrconHistory.read()[0];
    return {
      corrected: record.files.filter((f) => f.document === DOC).map((f) => [f.revision, f.grdtRevision, f.revisionManual]),
      other: record.files.find((f) => f.document === OTHER).revision,
      trace: record.revisionHistory || [],
    };
  });
  expect(snapshot.corrected).toEqual([['B','B',true],['B','B',true]]);
  expect(snapshot.other).toBe('A');
  expect(snapshot.trace).toHaveLength(1);
  expect(snapshot.trace[0]).toMatchObject({ previousRevision: '0', newRevision: 'B', document: DOC, userEmail: 'e2e@grcon.local' });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.GrconOperationalPersistence?.status?.().ready === true && window.GrconRevisionControl?.updateDocumentRevision, null, { timeout: 20_000 });
  snapshot = await page.evaluate(() => { const record = window.GrconHistory.read()[0]; return { revs: record.files.filter((f) => f.document === DOC).map((f) => f.revision), trace: record.revisionHistory || [] }; });
  expect(snapshot.revs).toEqual(['B','B']);
  expect(snapshot.trace).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('Conferência usa a revisão corrigida e envia seleção para a Central sem marcar postagem', async ({ page }) => {
  const errors = await prepare(page);
  await openHistory(page);
  await page.locator('[data-history-revision-edit]').click();
  await page.locator('#grcon-revision-new').fill('B');
  await page.locator('#grcon-revision-review').click();
  await page.locator('#grcon-revision-save').click();
  await expect(page.locator('#grcon-revision-overlay')).toBeHidden();

  await page.locator('[data-pc-open="sidebar"]').click();
  await expect(page.locator('#posting-conference-module')).toBeVisible();
  await page.evaluate(async ({ DOC, OTHER }) => {
    const C = window.GrconPostingConference;
    const make = (document, revision, status) => ({ id: `${C.documentIdentity(document)}|${revision}`, document, documentIdentity: C.documentIdentity(document), searchKeys: C.documentKeys(document), revision, status });
    await C.saveBase({ meta: { fileName: 'Consulta Geral E2E.xlsx', importedAt: new Date().toISOString(), recordCount: 2 }, records: [make(DOC,'B','Em Workflow'), make(OTHER,'A','Conforme Construído')] });
    await window.GrconPostingConferenceUi.reconcile({ reason: 'e2e-revision' });
  }, { DOC, OTHER });

  const row = page.locator('#pc-table-wrap tbody tr').filter({ hasText: DOC }).first();
  await expect(row).toContainText('B');
  await expect(row).toContainText('Postado');
  await expect(row.locator('[data-repost-key]')).toBeVisible();
  await row.locator('[data-repost-key]').check();
  await expect(page.locator('#grcon-repost-prepare')).toBeEnabled();
  await page.locator('#grcon-repost-prepare').click();
  await expect(page.locator('#grcon-repost-overlay')).toBeVisible();
  const prepRow = page.locator('#grcon-repost-results tbody tr').filter({ hasText: DOC }).first();
  await expect(prepRow).toContainText('B');
  await expect(prepRow).toContainText('Não verificado');

  const current = await page.evaluate(() => window.GrconPostingConferenceUi.state.result.rows.find((item) => item.document === DOC));
  expect(current.revisionSent).toBe('B');
  expect(current.status).toBe('CONFIRMADO');
  expect(errors).toEqual([]);
});
