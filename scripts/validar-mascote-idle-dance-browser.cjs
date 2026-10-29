const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.install();
    await page.goto((process.env.GRCON_PREVIEW_URL || 'http://127.0.0.1:8765') + '/tests/fixtures/grcon-mascot-video.html');
    await page.waitForFunction(() => window.GrconMascot?.diagnostics().ready && window.GrconMascotIdleDance);
    const state = () => page.evaluate(() => window.GrconMascotIdleDance.diagnostics());
    await page.clock.runFor(121_000);
    assert.equal((await state()).loaded, false, 'locked login must never load dance');
    await page.evaluate(() => { document.documentElement.classList.remove('grcon-cloud-pending'); window.GrconMascot.idle(); });
    await page.clock.runFor(10_000);
    await page.evaluate(() => window.GrconMascot.idle());
    await page.mouse.move(300, 300);
    await page.clock.runFor(119_000);
    assert.equal((await state()).loaded, false, 'no dance before two minutes');
    await page.clock.runFor(1_100);
    await page.waitForFunction(() => window.GrconMascotIdleDance.diagnostics().active);
    const video = page.locator('#grcon-mascot-idle-dance video');
    assert.equal(await video.evaluate(v => v.muted && v.loop && !v.paused), true);
    const box = await page.locator('#grcon-mascot-idle-dance').boundingBox();
    const headerBox = await page.locator('#grcon-context-mascot').boundingBox();
    assert.deepEqual(box, headerBox, 'dance occupies exactly the existing header mascot');
    assert.ok(box.y < 140, 'dance remains inside header');
    assert.equal(await page.locator('#grcon-context-mascot > #grcon-mascot-idle-dance').count(), 1);
    assert.equal(await page.locator('#grcon-context-mascot > .grcon-mascot-stage').evaluate(v => getComputedStyle(v).visibility), 'hidden', 'static mascot hidden while dancing');
    assert.equal(await video.evaluate(v => getComputedStyle(v.parentElement).pointerEvents), 'none');
    const alpha = await video.evaluate(v => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const ctx = c.getContext('2d'); ctx.drawImage(v, 0, 0, 64, 64);
      const p = ctx.getImageData(0, 0, 64, 64).data;
      let transparent = 0, opaque = 0;
      for (let i = 3; i < p.length; i += 4) { if (p[i] === 0) transparent++; if (p[i] > 250) opaque++; }
      return { transparent, opaque };
    });
    assert.ok(alpha.transparent > 2000 && alpha.opaque > 100, JSON.stringify(alpha));
    fs.mkdirSync('artifacts/mascot-video', { recursive: true });
    await page.screenshot({ path: 'artifacts/mascot-video/idle-dance-light.png' });
    await page.evaluate(() => { document.body.style.background = '#17232f'; document.querySelector('.app-shell').style.background = '#17232f'; });
    await page.screenshot({ path: 'artifacts/mascot-video/idle-dance-dark.png' });
    for (const event of ['pointermove', 'keydown', 'wheel', 'pointerdown', 'touchstart', 'focusin']) {
      await page.evaluate(type => window.dispatchEvent(new Event(type)), event);
      assert.equal((await state()).active, false, event + ' must hide immediately');
      assert.equal(await page.locator('#grcon-context-mascot > .grcon-mascot-stage').evaluate(v => getComputedStyle(v).visibility), 'visible', 'original header mascot returns');
      await page.clock.runFor(120_100);
      await page.waitForFunction(() => window.GrconMascotIdleDance.diagnostics().active);
    }
    await page.evaluate(() => window.GrconMascot.setEnabled(false));
    await page.clock.runFor(121_000);
    assert.equal((await state()).active, false, 'preference disables idle dance');
    await page.evaluate(() => window.GrconMascot.setEnabled(true));
    await page.clock.runFor(120_100);
    await page.waitForFunction(() => window.GrconMascotIdleDance.diagnostics().active);
    await page.evaluate(() => { window.testOperation = window.GrconMascot.begin('analyzing'); });
    assert.equal((await state()).active, false, 'operational state immediately dismisses dance');
    await page.clock.runFor(121_000);
    assert.equal((await state()).active, false, 'no dancing while processing');
    await page.evaluate(() => { window.testOperation?.end?.(); window.GrconMascot.idle(); });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.runFor(121_000);
    assert.equal((await state()).active, false, 'respect reduced motion');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
    await page.mouse.move(301,301);
    await page.clock.runFor(121_000);
    await page.waitForFunction(() => window.GrconMascotIdleDance.diagnostics().active);
    await page.evaluate(() => { const d = document.createElement('dialog'); d.id = 'test-modal'; document.body.appendChild(d); d.showModal(); });
    assert.equal((await state()).active, false, 'modal opening hides dance');
    assert.equal(await page.locator('#grcon-mascot-idle-dance').count(), 1);
    assert.deepEqual(errors, []);
    console.log('Idle dance: delay, alpha, same header position and single visible mascot, lazy loading, activity, preferences, processing, modal and reduced motion OK');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
