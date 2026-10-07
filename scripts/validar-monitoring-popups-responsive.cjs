'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const out = path.join(process.cwd(), 'artifacts/monitoring-responsive');
fs.mkdirSync(out, { recursive: true });
const notices = [];
const reads = new Map();
let server;
async function fixture(page, user) {
  await page.evaluate(userId => {
    document.documentElement.classList.remove('grcon-cloud-pending');
    document.querySelector('#grcon-cloud-auth').hidden = true;
    const contract = { code: 'UHDT-D', workspace_id: 'qa-contract', name: 'Unidade de Hidrotratamento' };
    window.GrconCloud = { state: {
      contract, membership: { workspace_id: contract.workspace_id, role: userId === 'publisher' ? 'owner' : 'viewer' },
      session: { user: { id: userId }, access_token: 'fixture' }, online: true,
      client: { rpc(name, args) {
        const result = window.qaRpc(name, args);
        result.range = () => result;
        return result;
      }, functions: { invoke: async () => ({ data: { users: [] }, error: null }) } },
    }, canManageMembers: () => userId === 'publisher' };
    if (!document.querySelector('#qa-account')) document.querySelector('.runtime-status').insertAdjacentHTML('beforeend',
      '<span class="grcon-active-contract-badge">CONSAG / RNEST / UHDT-D</span><div class="grcon-cloud-account" id="qa-account"><button class="grcon-cloud-account-button"><span class="grcon-cloud-account-dot"></span><span><strong>Vinício Silva — Controle da Qualidade</strong><small>Proprietário · online</small></span><svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg></button></div>');
    window.dispatchEvent(new CustomEvent('grcon:cloud-ready'));
  }, user);
  await page.waitForFunction(() => document.querySelector('#grcon-notification-button'));
  await page.evaluate(() => window.GrconSigemStatusMonitoring.refreshNotifications());
}
(async () => {
  const base = process.env.GRCON_PREVIEW_URL || 'http://127.0.0.1:8781';
  if (!process.env.GRCON_PREVIEW_URL) {
    server = spawn('python3', ['-u', '-m', 'http.server', '8781', '--bind', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      server.stdout.once('data', resolve); server.once('error', reject);
      server.once('exit', code => reject(new Error('Preview server exited: ' + code)));
    });
  }
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const pages = [];
    for (const user of ['publisher', 'viewer']) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 615 }, serviceWorkers: 'block' });
      const page = await context.newPage(); pages.push(page);
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://kvyrttccwzdhasplfxnr.supabase.co/**', r => r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
      await page.exposeFunction('qaRpc', async (name, args) => {
        const userReads = reads.get(user) || new Set(); reads.set(user, userReads);
        let data = [];
        const rows = args?.target_workspace === 'qa-contract' ? notices.map(n => ({ ...n, is_read: userReads.has(n.id) })) : [];
        if (name === 'grcon_notifications_list') data = args.only_unread ? rows.filter(n => !n.is_read) : rows;
        if (name === 'grcon_notifications_unread_count') data = rows.filter(n => !n.is_read).length;
        if (name === 'grcon_notifications_mark_read') { for (const n of rows) if (!args.target_ids || args.target_ids.includes(n.id)) userReads.add(n.id); data = rows.length; }
        return { data, error: null };
      });
      await page.clock.install();
      await page.goto(base, { waitUntil: 'networkidle' });
      await fixture(page, user);
    }
    const [publisher, viewer] = pages;
    notices.push({ id: 'transition-1', kind: 'MONITORED_STATUS_CHANGE', title: 'Documento monitorado', document_code: 'DOC-001', previous_status: 'Em análise', current_status: 'Emitido', created_at: new Date().toISOString() });
    for (const page of pages) await page.evaluate(() => window.dispatchEvent(new CustomEvent('grcon:notifications-updated')));
    for (const page of pages) { await page.clock.runFor(400); await page.locator('#sigem-monitor-popup').waitFor(); assert.match(await page.locator('#sigem-monitor-popup').textContent(), /DOC-001[\s\S]*Em análise → Emitido/); }
    await publisher.screenshot({ path: path.join(out, 'popup-publisher.png') });
    await viewer.screenshot({ path: path.join(out, 'popup-viewer.png') });
    await publisher.locator('[data-popup-close]').click();
    await publisher.evaluate(() => window.GrconSigemStatusMonitoring.refreshNotifications());
    assert.equal(await publisher.locator('#sigem-monitor-popup').count(), 0, 'closing and duplicate delivery do not replay');
    await viewer.locator('[data-popup-read]').click();
    await viewer.waitForFunction(() => document.querySelector('#grcon-notification-count').hidden);
    assert.equal(reads.get('publisher').has('transition-1'), false, 'viewer reading does not read publisher alert');
    await publisher.reload({ waitUntil: 'networkidle' }); await fixture(publisher, 'publisher');
    assert.equal(await publisher.locator('#sigem-monitor-popup').count(), 0, 'refresh preserves per-user delivery acknowledgement');
    assert.equal(await publisher.locator('#grcon-notification-count').textContent(), '1', 'closing keeps unread count');
    notices.push({ id: 'transition-2', kind: 'MONITORED_STATUS_CHANGE', title: 'Documento monitorado', document_code: 'DOC-002', previous_status: 'Em workflow', current_status: 'Aprovado', created_at: new Date().toISOString() });
    for (const page of pages) { await page.clock.runFor(15100); await page.locator('#sigem-monitor-popup').waitFor(); assert.match(await page.locator('#sigem-monitor-popup').textContent(), /DOC-002/); }
    await viewer.evaluate(() => { window.GrconCloud.state.membership.workspace_id = 'other-contract'; window.dispatchEvent(new CustomEvent('grcon:contract-context-changed')); });
    await viewer.evaluate(() => window.GrconSigemStatusMonitoring.refreshNotifications());
    assert.equal(await viewer.locator('#sigem-monitor-popup').count(), 0, 'contract switch removes previous alerts');
    await publisher.locator('[data-popup-close]').click();
    const sizes = [[1920, 920], [1440, 760], [1366, 615], [1280, 600], [1092, 492], [1024, 568], [800, 600], [600, 600], [390, 844]];
    const layout = [];
    for (const [width, height] of sizes) {
      await publisher.setViewportSize({ width, height });
      await publisher.evaluate(() => window.scrollTo(0, 0));
      const metrics = await publisher.evaluate(() => {
        const top = document.querySelector('.topbar').getBoundingClientRect();
        const footer = document.querySelector('.app-footer').getBoundingClientRect();
        const controls = [...document.querySelectorAll('.topbar .brand, .topbar .brand-title, .runtime-status > *')].filter(el => el.getBoundingClientRect().height > 0).map(el => {
          const r = el.getBoundingClientRect(); return { label: el.className || el.id, x: r.x, right: r.right, y: r.y, bottom: r.bottom };
        });
        return { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth, top: top.top, bottom: top.bottom, footerBottom: footer.bottom, controls };
      });
      assert.ok(metrics.top >= -1, 'header starts in viewport: ' + width);
      assert.ok(metrics.overflow <= 1, 'no horizontal page overflow: ' + width);
      for (const c of metrics.controls) { assert.ok(c.y >= metrics.top - 1 && c.bottom <= metrics.bottom + 1, 'header child not clipped: ' + width + ' ' + c.label); assert.ok(c.x >= -1 && c.right <= width + 1, 'header child fits width: ' + width + ' ' + c.label); }
      if (width > 928) assert.ok(metrics.footerBottom <= height + 1, 'footer fits actual remaining height: ' + width);
      layout.push(metrics);
      await publisher.screenshot({ path: path.join(out, 'layout-' + width + 'x' + height + '.png') });
    }
    await publisher.setViewportSize({ width: 1366, height: 615 });
    await publisher.evaluate(() => { const tall = document.createElement('div'); tall.style.height = '3000px'; document.querySelector('.workspace').appendChild(tall); document.querySelector('.workspace').scrollTop = 500; });
    assert.equal(await publisher.evaluate(() => document.querySelector('.topbar').getBoundingClientRect().top), 0, 'workspace scroll never cuts header');
    assert.equal(await publisher.evaluate(() => window.scrollY), 0);
    assert.doesNotMatch(await publisher.locator('[data-grcon-view="additional-tools"]').first().textContent(), /repostagem/i);
    await viewer.evaluate(() => { window.GrconCloud.state.session = null; window.dispatchEvent(new CustomEvent('grcon:cloud-signed-out')); });
    assert.equal(await viewer.locator('#sigem-monitor-popup').count(), 0);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ ok: true, realtimeFanout: 2, fallbackFanout: 2, perUserReads: true, duplicateSuppression: true, contractIsolation: true, layout, errors }, null, 2));
    console.log('Monitoring popups: two users, event delivery, polling fallback, individual reads, deduplication, contract isolation and 9 viewport layouts passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server?.kill());
