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
      contract,
      membership: { workspace_id: contract.workspace_id, role: userId === 'publisher' ? 'owner' : 'viewer' },
      session: { user: { id: userId }, access_token: 'fixture' },
      online: true,
      client: {
        rpc(name, args) {
          const result = window.qaRpc(name, args);
          result.range = () => result;
          return result;
        },
        functions: { invoke: async () => ({ data: { users: [] }, error: null }) },
      },
    }, canManageMembers: () => userId === 'publisher' };
    if (!document.querySelector('#qa-account')) {
      document.querySelector('.runtime-status').insertAdjacentHTML('beforeend',
        '<span class="grcon-active-contract-badge">CONSAG / RNEST / UHDT-D</span><div class="grcon-cloud-account" id="qa-account"><button class="grcon-cloud-account-button"><span class="grcon-cloud-account-dot"></span><span><strong>Vinício Silva — Controle da Qualidade</strong><small>Proprietário · online</small></span><svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg></button></div>');
    }
    window.dispatchEvent(new CustomEvent('grcon:cloud-ready'));
  }, user);
  await page.waitForFunction(() => document.querySelector('#grcon-notification-button'));
  await page.evaluate(() => window.GrconSigemStatusMonitoring.refreshNotifications());
}

async function activeView(page) {
  return page.evaluate(() => document.querySelector('.ops-nav-button.active[data-grcon-view]')?.dataset.grconView || '');
}

(async () => {
  const base = process.env.GRCON_PREVIEW_URL || 'http://127.0.0.1:8781';
  if (!process.env.GRCON_PREVIEW_URL) {
    server = spawn('python3', ['-u', '-m', 'http.server', '8781', '--bind', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      server.stdout.once('data', resolve);
      server.once('error', reject);
      server.once('exit', code => reject(new Error('Preview server exited: ' + code)));
    });
  }

  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const pages = [];
    for (const user of ['publisher', 'viewer']) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 615 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      pages.push(page);
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://kvyrttccwzdhasplfxnr.supabase.co/**', route =>
        route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
      await page.exposeFunction('qaRpc', async (name, args) => {
        const userReads = reads.get(user) || new Set();
        reads.set(user, userReads);
        let data = [];
        const rows = args?.target_workspace === 'qa-contract'
          ? notices.map(notice => ({ ...notice, is_read: userReads.has(notice.id) }))
          : [];
        if (name === 'grcon_notifications_list') data = args.only_unread ? rows.filter(notice => !notice.is_read) : rows;
        if (name === 'grcon_notifications_unread_count') data = rows.filter(notice => !notice.is_read).length;
        if (name === 'grcon_notifications_mark_read') {
          for (const notice of rows) {
            if (!args.target_ids || args.target_ids.includes(notice.id)) userReads.add(notice.id);
          }
          data = rows.length;
        }
        return { data, error: null };
      });
      await page.clock.install();
      await page.goto(base, { waitUntil: 'networkidle' });
      await fixture(page, user);
    }

    const [publisher, viewer] = pages;

    // Realtime: toast profissional em qualquer módulo, sem alterar a tela atual.
    notices.push({
      id: 'transition-1',
      kind: 'MONITORED_STATUS_CHANGE',
      title: 'Documento monitorado',
      message: 'A Consulta Geral registrou uma nova situação.',
      document_code: 'DOC-001',
      previous_status: 'Em análise',
      current_status: 'Emitido',
      created_at: new Date().toISOString(),
    });
    for (const page of pages) {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('grcon:notifications-updated')));
      await page.clock.runFor(400);
      await page.locator('#sigem-monitor-popup').waitFor();
      assert.match(await page.locator('#sigem-monitor-popup').textContent(), /Documento monitorado atualizado/);
      assert.match(await page.locator('#sigem-monitor-popup').textContent(), /DOC-001[\s\S]*Em análise[\s\S]*Emitido/);
      assert.equal(await page.locator('#grcon-notification-count').textContent(), '1');
    }
    await publisher.screenshot({ path: path.join(out, 'toast-professional.png') });

    // Clique no cabeçalho abre central flutuante e não navega para Consultas.
    const viewBefore = await activeView(viewer);
    await viewer.locator('#grcon-notification-button').click();
    await viewer.locator('#grcon-notification-popover').waitFor({ state: 'visible' });
    assert.equal(await viewer.locator('#grcon-notification-button').getAttribute('aria-expanded'), 'true');
    assert.equal(await activeView(viewer), viewBefore, 'notification button must not change the active GRCON module');
    assert.match(await viewer.locator('#grcon-notification-popover').textContent(), /DOC-001/);
    assert.match(await viewer.locator('#grcon-notification-center-summary').textContent(), /1 não lida/);
    await viewer.screenshot({ path: path.join(out, 'notification-center.png') });

    // Leitura individual é isolada por usuário.
    await viewer.locator('[data-notification-center-read="transition-1"]').click();
    await viewer.waitForFunction(() => document.querySelector('#grcon-notification-count').hidden);
    assert.equal(reads.get('viewer').has('transition-1'), true);
    assert.equal(reads.get('publisher').has('transition-1'), false, 'viewer reading does not read publisher alert');

    // Esc fecha e devolve foco; clique fora também fecha.
    await viewer.keyboard.press('Escape');
    assert.equal(await viewer.locator('#grcon-notification-popover').isHidden(), true);
    assert.equal(await viewer.locator('#grcon-notification-button').getAttribute('aria-expanded'), 'false');
    assert.equal(await viewer.evaluate(() => document.activeElement?.id), 'grcon-notification-button');

    if (await publisher.locator('[data-popup-close]').count()) await publisher.locator('[data-popup-close]').click();
    await publisher.evaluate(() => window.GrconSigemStatusMonitoring.refreshNotifications());
    assert.equal(await publisher.locator('#sigem-monitor-popup').count(), 0, 'closing and duplicate delivery do not replay');

    await publisher.locator('#grcon-notification-button').click();
    await publisher.locator('#grcon-notification-popover').waitFor({ state: 'visible' });
    await publisher.locator('#app-main').click({ position: { x: 12, y: 12 } });
    assert.equal(await publisher.locator('#grcon-notification-popover').isHidden(), true, 'outside click closes notification center');

    // Recarregar mantém acknowledgement visual, mas a notificação segue não lida.
    await publisher.reload({ waitUntil: 'networkidle' });
    await fixture(publisher, 'publisher');
    assert.equal(await publisher.locator('#sigem-monitor-popup').count(), 0, 'refresh preserves per-user delivery acknowledgement');
    assert.equal(await publisher.locator('#grcon-notification-count').textContent(), '1', 'closing keeps unread count');

    // Fallback de polling e ação do toast abrem a central, sem navegação.
    notices.push({
      id: 'transition-2',
      kind: 'MONITORED_STATUS_CHANGE',
      title: 'Documento monitorado',
      document_code: 'DOC-002',
      previous_status: 'Em workflow',
      current_status: 'Aprovado',
      created_at: new Date().toISOString(),
    });
    for (const page of pages) {
      await page.clock.runFor(15100);
      await page.locator('#sigem-monitor-popup').waitFor();
      assert.match(await page.locator('#sigem-monitor-popup').textContent(), /DOC-002/);
    }
    const publisherView = await activeView(publisher);
    await publisher.locator('[data-popup-open]').click();
    await publisher.locator('#grcon-notification-popover').waitFor({ state: 'visible' });
    assert.equal(await activeView(publisher), publisherView);
    assert.match(await publisher.locator('#grcon-notification-popover').textContent(), /DOC-002/);
    await publisher.keyboard.press('Escape');

    // Toast é transitório: sumir da tela não apaga a notificação.
    await viewer.clock.runFor(8100);
    assert.equal(await viewer.locator('#sigem-monitor-popup').count(), 0, 'toast auto dismisses');
    await viewer.locator('#grcon-notification-button').click();
    await viewer.locator('#grcon-notification-popover').waitFor({ state: 'visible' });
    assert.match(await viewer.locator('#grcon-notification-popover').textContent(), /DOC-002/, 'auto-dismissed toast remains in center');
    await viewer.keyboard.press('Escape');

    // Muitas notificações usam rolagem interna e "marcar todas" limpa o badge.
    for (let i = 3; i <= 24; i++) {
      notices.push({
        id: 'transition-' + i,
        kind: 'MONITORED_STATUS_CHANGE',
        title: 'Documento monitorado',
        document_code: 'DOC-' + String(i).padStart(3, '0'),
        previous_status: 'Em análise',
        current_status: 'Emitido',
        created_at: new Date(Date.now() - i * 60000).toISOString(),
      });
    }
    await publisher.locator('#grcon-notification-button').click();
    await publisher.locator('#grcon-notification-popover').waitFor({ state: 'visible' });
    await publisher.waitForFunction(() => document.querySelector('#grcon-notification-center-list')?.textContent.includes('DOC-024'));
    assert.equal(await publisher.evaluate(() => {
      const list = document.querySelector('#grcon-notification-center-list');
      return list.scrollHeight > list.clientHeight;
    }), true, 'notification list scrolls internally');
    await publisher.locator('[data-notification-center-read-all]').click();
    await publisher.waitForFunction(() => document.querySelector('#grcon-notification-count').hidden);
    assert.equal(reads.get('publisher').has('transition-1'), true);
    assert.equal(reads.get('publisher').has('transition-24'), true);
    await publisher.locator('[data-notification-center-close]').click();

    // Troca de contrato limpa contexto e apresenta estado vazio.
    await viewer.evaluate(() => {
      window.GrconCloud.state.membership.workspace_id = 'other-contract';
      window.dispatchEvent(new CustomEvent('grcon:contract-context-changed'));
    });
    await viewer.evaluate(() => window.GrconSigemStatusMonitoring.refreshNotifications());
    assert.equal(await viewer.locator('#sigem-monitor-popup').count(), 0, 'contract switch removes previous alerts');
    await viewer.locator('#grcon-notification-button').click();
    await viewer.locator('#grcon-notification-popover').waitFor({ state: 'visible' });
    assert.match(await viewer.locator('#grcon-notification-popover').textContent(), /Nenhuma notificação/);
    assert.match(await viewer.locator('#grcon-notification-popover').textContent(), /documentos que você monitora/);
    await viewer.keyboard.press('Escape');

    // Responsividade do shell/header permanece estável em notebook e janelas menores.
    const sizes = [[1920, 920], [1440, 760], [1366, 615], [1280, 600], [1092, 492], [1024, 568], [800, 600], [600, 600], [390, 844]];
    const layout = [];
    for (const [width, height] of sizes) {
      await publisher.setViewportSize({ width, height });
      await publisher.evaluate(() => window.scrollTo(0, 0));
      const metrics = await publisher.evaluate(() => {
        const top = document.querySelector('.topbar').getBoundingClientRect();
        const footer = document.querySelector('.app-footer').getBoundingClientRect();
        const controls = [...document.querySelectorAll('.topbar .brand, .topbar .brand-title, .runtime-status > *')]
          .filter(element => element.getBoundingClientRect().height > 0)
          .map(element => {
            const box = element.getBoundingClientRect();
            return { label: element.className || element.id, x: box.x, right: box.right, y: box.y, bottom: box.bottom };
          });
        return {
          width: innerWidth,
          height: innerHeight,
          overflow: document.documentElement.scrollWidth - innerWidth,
          top: top.top,
          bottom: top.bottom,
          footerBottom: footer.bottom,
          controls,
        };
      });
      assert.ok(metrics.top >= -1, 'header starts in viewport: ' + width);
      assert.ok(metrics.overflow <= 1, 'no horizontal page overflow: ' + width);
      for (const control of metrics.controls) {
        assert.ok(control.y >= metrics.top - 1 && control.bottom <= metrics.bottom + 1, 'header child not clipped: ' + width + ' ' + control.label);
        assert.ok(control.x >= -1 && control.right <= width + 1, 'header child fits width: ' + width + ' ' + control.label);
      }
      if (width > 928) assert.ok(metrics.footerBottom <= height + 1, 'footer fits actual remaining height: ' + width);
      const menu = publisher.locator('#grcon-app-shortcuts');
      const trigger = menu.locator('summary');
      await trigger.focus();
      await publisher.keyboard.press('Enter');
      await menu.locator('.grcon-app-shortcuts-panel').waitFor({ state: 'visible' });
      const menuBox = await menu.locator('.grcon-app-shortcuts-panel').boundingBox();
      assert.ok(menuBox.x >= -1 && menuBox.x + menuBox.width <= width + 1, 'menu Aplicativos cabe na viewport: ' + width);
      assert.equal(await menu.locator('a').count(), 2);
      await publisher.keyboard.press('Escape');
      assert.equal(await menu.getAttribute('open'), null);
      assert.equal(await trigger.evaluate(el => document.activeElement === el), true, 'Escape devolve foco a Aplicativos');
      await trigger.click();
      await publisher.locator('.brand-title').click();
      assert.equal(await menu.getAttribute('open'), null, 'clique fora fecha Aplicativos');
      layout.push(metrics);
      await publisher.screenshot({ path: path.join(out, 'layout-' + width + 'x' + height + '.png') });
    }

    await publisher.setViewportSize({ width: 1366, height: 615 });
    await publisher.evaluate(() => {
      const tall = document.createElement('div');
      tall.style.height = '3000px';
      document.querySelector('.workspace').appendChild(tall);
      document.querySelector('.workspace').scrollTop = 500;
    });
    assert.equal(await publisher.evaluate(() => document.querySelector('.topbar').getBoundingClientRect().top), 0, 'workspace scroll never cuts header');
    assert.equal(await publisher.evaluate(() => window.scrollY), 0);
    assert.doesNotMatch(await publisher.locator('[data-grcon-view="additional-tools"]').first().textContent(), /repostagem/i);

    await viewer.evaluate(() => {
      window.GrconCloud.state.session = null;
      window.dispatchEvent(new CustomEvent('grcon:cloud-signed-out'));
    });
    assert.equal(await viewer.locator('#sigem-monitor-popup').count(), 0);
    assert.equal(await viewer.locator('#grcon-notification-popover').isHidden(), true);
    assert.deepEqual(errors, []);

    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({
      ok: true,
      toast: 'professional-auto-dismiss',
      notificationCenter: 'anchored-no-navigation',
      individualReads: true,
      markAll: true,
      emptyState: true,
      internalScroll: true,
      keyboardAndOutsideClose: true,
      realtimeFanout: 2,
      fallbackFanout: 2,
      duplicateSuppression: true,
      contractIsolation: true,
      layout,
      errors,
    }, null, 2));
    console.log('Notification center: floating no-navigation UI, professional toast, reads, empty state, scroll, realtime/polling and 9 viewport layouts passed.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => server?.kill());
