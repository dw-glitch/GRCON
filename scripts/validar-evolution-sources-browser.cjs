"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const baseUrl = process.env.GRCON_PREVIEW_URL || "http://127.0.0.1:8765";
const outputDir = path.join(process.cwd(), "artifacts/evolution-sources");
fs.mkdirSync(outputDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on("pageerror", error => { errors.push(error.message); console.error("browser:", error.stack); });
    // Isolated real runtime: no production login, database write or Teams call.
    await page.route("**/__evolution_qa__.html", route => route.fulfill({ contentType: "text/html", body: `<meta charset="UTF-8"><base href="${baseUrl}/"><div id="grcon-sigem-pw-evolution-root"></div>` }));
    await page.goto(`${baseUrl}/__evolution_qa__.html`);
    for (const file of ["grcon_contracts.js", "discipline_resolver.js", "core.js", "grcon_utils.js", "sigem_pw_dashboard_core.js",
      "sigem_pw_scope_fix.js", "sigem_pw_revision_core.js", "sigem_pw_history_core.js", "sigem_pw_evolution_core.js"]) {
      await page.addScriptTag({ url: `${baseUrl}/${file}` });
    }
    await page.evaluate(async () => {
      const core = window.GrconSigemPwDashboard;
      const row = n => ({ document: `C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-${n}`, revision: "0", status: "Postado", lastEmission: "SIM" });
      const base = (system, id, date, count) => ({ meta: { kind: system, snapshotId: id, fileName: `${id}.xlsx`, importedAt: `${date}T12:00:00.000Z` },
        records: Array.from({ length: count }, (_, n) => row(n)) });
      window.__evolutionBases = { s1: base("sigem", "s1", "2026-10-01", 1), s2: base("sigem", "s2", "2026-10-02", 2),
        p1: base("pw", "p1", "2026-10-01", 1), p2: base("pw", "p2", "2026-10-02", 2),
        remote: base("sigem", "remote", "2026-09-29", 1) };
      await core.kvSet(core.HISTORY_KEY, { version: 3, snapshots: Object.values(window.__evolutionBases).filter(item => item.meta.snapshotId !== "remote"), deletedIds: [] });
      window.GrconSigemPwDashboardUi = { state: { ld: { meta: null, records: [] } }, openHistory: async () => { window.__managerOpened = true; } };
      window.GrconCloud = { state: { online: true, membership: { workspace_id: "test-contract" }, user: { id: "test-user" } } };
      window.__sharedLoads = 0;
      window.__sharedVersions = [{ snapshot_id: "remote", version: 1, file_name: "Consulta anterior compartilhada.xlsx", record_count: 1,
        published_at: "2026-09-29T12:00:00Z", metadata: { referenceDate: "2026-09-29" } }];
      window.GrconSharedSigemQuery = { listVersions: async () => window.__sharedVersions, loadSnapshot: async id => {
        window.__sharedLoads++; if (window.__failShared) throw new Error("Falha de consulta controlada");
        return window.__evolutionBases[id];
      }, activateVersion() {}, deleteVersion() {} };
    });
    await page.addScriptTag({ url: `${baseUrl}/react-dist/sigem-pw-evolution-app.js` });
    await page.waitForFunction(() => Boolean(window.GrconSigemPwEvolutionUi));
    await page.evaluate(() => window.GrconSigemPwEvolutionUi.activate());
    await page.waitForFunction(() => window.GrconSigemPwEvolutionUi.state.ready);
    assert.equal(await page.locator('[data-evo-select="sigemCurrent"] option').count(), 4);
    assert.equal(await page.locator('[data-evo-select="pwCurrent"] option').count(), 3);
    assert.equal(await page.evaluate(() => window.__sharedLoads), 0, "no remote payload reads before LD validation");
    assert.equal(await page.locator('[data-evo-select="sigemCurrent"]').isDisabled(), true);
    assert.equal(await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.comparison), null);
    await page.evaluate(async () => {
      window.GrconSigemPwDashboardUi.state.ld = { meta: { snapshotId: "ld" }, records: [{ document: "RL-5290.00-22313-ABC-C1O-001", revision: "0" }] };
      await window.GrconSigemPwEvolutionUi.refresh(true);
    });
    assert.equal(await page.locator('[data-evo-select="sigemPrev"] option').count(), 4);
    await page.locator('[data-evo-select="sigemPrev"]').selectOption("s1");
    await page.locator('[data-evo-select="sigemCurrent"]').selectOption("s2");
    await page.locator('[data-evo-select="pwPrev"]').selectOption("p1");
    await page.locator('[data-evo-select="pwCurrent"]').selectOption("p2");
    assert.equal(await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.comparison.sigem.added.length), 1);
    assert.equal(await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.comparison.pw.added.length), 1);
    await page.locator('[data-evo-select="sigemPrev"]').selectOption("remote");
    assert.match(await page.locator('[data-evo-select="sigemPrev"]').inputValue(), /remote/);
    await page.evaluate(() => window.GrconSigemPwEvolutionUi.refresh());
    assert.equal(await page.evaluate(() => window.__sharedLoads), 1, "remote version reuses prepared cache");
    await page.locator("#spw-history-manage").click();
    assert.equal(await page.evaluate(() => window.__managerOpened), true);
    await page.evaluate(async () => {
      window.__evolutionBases.failed = { ...window.__evolutionBases.remote, meta: { ...window.__evolutionBases.remote.meta, snapshotId: "failed" } };
      window.__sharedVersions.push({ ...window.__sharedVersions[0], snapshot_id: "failed", version: 2 });
      window.__failShared = true; await window.GrconSigemPwEvolutionUi.refresh();
    });
    await page.waitForFunction(() => document.querySelector('[data-evo-select="sigemCurrent"] option[value="failed"]')?.disabled === true);
    assert.match(await page.locator("#spw-evolution-section [role=alert]").textContent(), /Falha de consulta controlada/);
    await page.evaluate(async () => { window.__failShared = false; await window.GrconSigemPwEvolutionUi.refresh(); });
    await page.waitForFunction(() => document.querySelector('[data-evo-select="sigemCurrent"] option[value="failed"]')?.disabled === false);
    assert.equal(await page.evaluate(() => window.GrconSigemPwEvolutionUi.state.error), "");
    await page.screenshot({ path: path.join(outputDir, "bases-recuperadas.png"), fullPage: true });
    assert.deepEqual(errors, []);
    const result = { passed: true, sigemSources: 4, pwSources: 2, realIndexedDb: true, realWorkers: true,
      sharedBackend: "controlled fixture", noLdVisibility: true, failureAndRetry: true, selection: true, errors };
    fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
