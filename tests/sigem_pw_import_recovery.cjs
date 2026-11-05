const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function loadAdapter(config = {}) {
  const cache = new Map();
  const events = new EventTarget();
  const notes = []; let writes = 0, rollbacks = 0, refreshes = 0, savedBase, failAnalysis = config.failAnalysis;
  const old = { meta: { snapshotId: 'old', companyColumn: 'C' }, records: [] };
  const result = { lists: { all: [] }, summary: {}, classes: [] };
  const core = {
    parsePwCsv: () => config.parseWait || ({ meta: { snapshotId: 'new', companyColumn: config.invalid ? 'B' : 'C' }, records: [] }),
    sanitizePwBase: base => base,
    saveBase: async (kind, base) => { if (config.failSave) throw Error('disco indisponível'); writes++; savedBase = base; return base; },
    loadHistoryIndex: async () => { if (config.failHistory) throw Error('leitura do índice falhou'); return { snapshots: [] }; },
    kvGet: async () => true,
    loadBases: async () => { refreshes++; return { sigem: { meta: null, records: [] }, pw: savedBase || old, ld: { meta: null, records: [] }, history: { snapshots: [] } }; },
    kvSetMany: async () => { rollbacks++; },
    createModel: () => { if (failAnalysis) throw Error('cálculo falhou'); return { normalizedPw: [], normalizedSigem: [] }; },
    aggregateModel: () => result,
    hydrateModel: x => x,
  };
  const win = Object.assign(events, {
    GrconSigemPwDashboard: core, GrconSigemPwReadiness: { assess: () => ({ ready: true }) },
    GrconNotify: (message, kind) => notes.push({ message, kind }),
    GrconSigemPwHistory: { recordActiveBases: async () => ({ pw: { snapshot: { id: 'history-new' } }, rollbackToken: 'token' }), rollbackRecordedActiveBases: async () => {} },
    GrconSigemPwHistoryManagement: { capturePayload: async () => {} },
    requestAnimationFrame: callback => callback(), setTimeout, clearTimeout,
  });
  global.window = win; global.document = { documentElement: { dataset: {} } }; global.Worker = undefined;
  function importTs(file) {
    file = path.resolve(__dirname, '..', file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ? importTs(path.resolve(path.dirname(file), name + '.ts')) : require(name), module, module.exports);
    return module.exports;
  }
  const adapter = importTs('src/react/sigem-pw/services/sigemPwDashboardAdapter.ts').sigemPwDashboardAdapter;
  Object.assign(adapter.state, { pw: old, ready: true, history: { snapshots: [] } });
  return { adapter, notes, stats: () => ({ writes, rollbacks, refreshes }), recover: () => { failAnalysis = false; } };
}
const file = { name: 'PW.csv', size: 20, text: async () => 'CSV' };
(async () => {
  for (const config of [{}, { invalid: true }, { failAnalysis: true }, { failHistory: true }, { failSave: true }]) {
    const test = loadAdapter(config);
    await test.adapter.importPw(file);
    const succeeded = test.notes.some(x => x.kind === 'success');
    assert.equal(succeeded, !Object.keys(config).length, JSON.stringify(config));
    assert.equal(test.adapter.state.busy, false);
    if (config.failSave) {
      assert.equal(test.adapter.state.pw.meta.snapshotId, 'old');
      assert.equal(test.stats().rollbacks, 1);
    } else if (Object.keys(config).length) {
      assert.equal(test.stats().writes, 1);
      assert.match(test.adapter.state.analysisError, /salva; comparação pendente/);
      assert.equal(test.adapter.state.result, null);
    }
    if (config.failAnalysis) {
      test.recover(); await test.adapter.retryAnalysis();
      assert.equal(test.adapter.state.analysisError, '');
      assert.ok(test.adapter.state.result);
      assert.equal(test.stats().writes, 1, 'repetir análise não deve reimportar nem regravar a base');
    }
  }
  let release;
  const parseWait = new Promise(resolve => { release = resolve; });
  const queued = loadAdapter({ parseWait });
  const cleanup = queued.adapter.subscribeExternalEvents();
  const importing = queued.adapter.importPw(file);
  await new Promise(resolve => setImmediate(resolve));
  window.dispatchEvent(new CustomEvent('grcon:pw-base-updated', { detail: { source: 'shared-projectwise' } }));
  await queued.adapter.refresh('facade externa');
  assert.equal(queued.stats().refreshes, 0, 'atualizações devem aguardar a importação');
  release({ meta: { snapshotId: 'new', companyColumn: 'C' }, records: [] });
  await importing;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(queued.stats().refreshes, 1, 'eventos concorrentes são agrupados em uma atualização posterior');
  cleanup();
  console.log('Importação PW: sucesso confirmado, falso sucesso rejeitado, falhas após gravação, rollback e repetição da análise OK.');
})().catch(error => { console.error(error); process.exitCode = 1; });
