const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Query = require('../shared_sigem_query_core.js');

async function scenario({ broken = false, switchContract = false } = {}) {
  const total = 20001, cache = new Map();
  let active = 0, peak = 0, pageCalls = 0;
  const metrics = [];
  const root = {
    GrconSharedSigemQueryCore: Query,
    GrconCloud: { state: { membership: { workspace_id: 'QA', role: 'owner' }, online: true } },
    GRCONModuleLoader: { ensure: async () => {} },
    GrconPostingConference: {
      kvGet: async (key, fallback) => cache.get(key) || fallback,
      kvSet: async (key, value) => cache.set(key, value),
      kvSetMany: async entries => entries.forEach(([key, value]) => cache.set(key, value)),
    },
    dispatchEvent: event => { if (event.type === 'grcon:performance-metrics') metrics.push(event.detail); },
    addEventListener() {}, document: { hidden: true, addEventListener() {} },
  };
  const version = { snapshot_id: 'v1', record_count: total, metadata: {}, file_name: 'QA.xlsx' };
  root.GrconCloud.state.client = { rpc: async (name, args) => {
    if (name.endsWith('_current')) return { data: version };
    if (name.endsWith('_versions')) return { data: [version] };
    assert.equal(name, 'grcon_sigem_query_page');
    pageCalls++; active++; peak = Math.max(peak, active);
    // Deliberately complete pages out of order.
    await new Promise(resolve => setTimeout(resolve, 8 + (args.after_row % 4000 === 0 ? 6 : 0)));
    active--;
    if (switchContract) root.GrconCloud.state.membership.workspace_id = 'OTHER';
    const count = Math.min(1000, total - args.after_row);
    const data = Array.from({ length: count }, (_, i) => ({ row_number: args.after_row + i + 1,
      payload: { document: `QA-${args.after_row + i + 1}`, revision: '0', status: 'Emitido' } }));
    if (broken && args.after_row === 1000) data[5].row_number--;
    return { data };
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../shared_sigem_query_app.js'), 'utf8'), {
    window: root, console, performance, setTimeout, clearTimeout, setInterval() {},
    CustomEvent: class { constructor(type, { detail }) { this.type = type; this.detail = detail; } },
  });
  const started = performance.now();
  const api = root.GrconSharedSigemQuery;
  const result = await api.refresh();
  if (broken || switchContract) {
    assert.equal(api.current(), null, 'an invalid or cross-contract snapshot must never become active');
    assert.equal(cache.get('shared-sigem-query:QA'), undefined);
    return;
  }
  assert.equal(result.records.length, total);
  assert.equal(result.records[0].document, 'QA-1');
  assert.equal(result.records.at(-1).document, `QA-${total}`);
  assert.equal(peak, 4, 'concurrency must remain bounded');
  assert.equal(pageCalls, 21);
  assert.equal(metrics[0].concurrency, 4);
  const before = pageCalls;
  await api.refresh();
  assert.equal(pageCalls, before, 'unchanged snapshots must reuse their confirmed contents');
  api.state.shared = null;
  const historic = await api.loadSnapshot('v1', [version]);
  assert.equal(historic.records.at(-1).document, `QA-${total}`);
  assert.equal(pageCalls, before + 21);
  console.log(`shared_sigem_parallel_download: 20,001 ordered records, max 4 requests, ${Math.round(performance.now() - started)} ms including indexing + historical read`);
}
(async () => {
  await scenario(); await scenario({ broken: true }); await scenario({ switchContract: true });
})().catch(error => { console.error(error); process.exitCode = 1; });
