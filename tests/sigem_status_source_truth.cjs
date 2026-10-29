const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../core.js');
const Query = require('../shared_sigem_query_core.js');
const Conference = require('../posting_conference_core.js');
const Refinement = require('../posting_conference_refinement.js');
const TriageQuery = require('../grdt_triage_query.js');

// Rows reproduced from the 29/10/2026 10:01 Consulta Geral. Workflow is a
// separate field and must never replace the document's Status.
const documents = [
  'C1O_RNEST_U32_3.6.9.1_EST_RIR_nt-NF-0007-PARAFUSOS',
  'C1O_RNEST_U32_3.6.9.1_EST_RIR_nt-NF-136122-PARAFUSOS',
  'C1O_RNEST_U32_3.6.9.1_EST_RIR_nt-NF-141446-PARAFUSOS',
  'C1O_RNEST_U32_6.10.4.1_CVL_RIR_nt-EMT-NF-3857-ABRASIVO',
  'C1O_RNEST_U32_6.10.4.1_CVL_RIR_nt-EMT-NF-50006-TINTA',
];
const header = ['Documento', 'Revisão', 'Modificado em', 'Incluido em', 'Status', 'Status Workflow'];
const revisions = documents.flatMap((document, i) => (i === 3 ? ['0', 'A', 'B'] : ['0']).map(revision => [
  document, revision, '26/10/2026 14:48:07', '25/09/2026 10:38:55', 'Recusado', 'TERMINADO',
]));
const unrelated = [documents[1].replace('3.6.9.1_EST', '3.8.28.1_TUB'), '0', '', '', 'Em Análise', 'ATIVO'];
const base = { meta: { fileName: 'Consulta Geral 29-10.xlsx' }, records: Conference.parseMatrix([header, ...revisions, unrelated]).records };
const older = { meta: { snapshotId: 'old-team-base' }, records: base.records.map(r => ({ ...r, status: 'Em Análise' })) };

function assertSource(source, ctx) {
  for (const r of source.records) {
    const status = Query.resolve(r.document, r.revision, ctx, 'Em Análise');
    assert.equal(status.status, r.status, `${r.document} ${r.revision}`);
    assert.equal(status.item.sourceRow, r.sourceRow);
    const history = [{ id: 'h', generatedAt: '2026-10-20T10:00:00Z', files: [{ document: r.document, revision: r.revision }] }];
    const row = Refinement.enrichResult(Conference.reconcile(history, source.records), source.records, Conference).rows[0];
    assert.equal(row.sigemStatus, r.status);
    assert.equal(row.sigemStatusRevision, r.revision);
    assert.equal(row.status, Conference.STATUSES.CONFIRMED, 'posting presence and technical acceptance remain distinct');
    const technical = { document: r.document, revision: r.revision, sheet: 'ET', title: 'Relatório', allocationStatus: 'ALOCADO' };
    const index = Core.buildIndex([technical], [{ ...technical, sheet: 'Colar SIGEM', status: 'Em Análise' }]);
    const triaged = Core.triageOne({ id: r.document, name: `${r.document}_${r.revision}.pdf` }, index, { sigemQueryContext: ctx });
    assert.equal(triaged.status, r.status, 'triage must not resurrect the stale LD status');
  }
}
const local = { ...base, meta: { ...base.meta, localOverrideSnapshotId: 'old-team-base' } };
assert.equal(Query.activeBase(older, local), local);
assertSource(local, Query.context(older, local));
assert.equal(Query.activeBase({ ...older, meta: { snapshotId: 'new-team-base' } }, local).meta.snapshotId, 'new-team-base');

// Conflicts and empty values in the selected source cannot fall through to a
// stale shared/local/LD Em Análise; missing pairs cannot borrow old revisions.
for (const statuses of [['Recusado', 'Em Análise'], ['', ''], ['', 'Recusado']]) {
  const records = statuses.map(status => ({ document: documents[0], revision: '0', status }));
  for (const ordered of [records, records.slice().reverse()]) {
    const resolved = Query.resolve(documents[0], '0', Query.context({ records: ordered }), 'Em Análise');
    assert.ok(resolved.conflict || resolved.incomplete);
    assert.notEqual(resolved.status, 'Em Análise');
  }
}
let ctx = Query.context({ records: [{ document: documents[0], revision: 'B', status: 'Recusado' }] }, older);
assert.equal(Query.resolve(documents[0], '0', ctx, 'Em Análise').status, 'Não Postado');
assert.equal(Query.previousAnalysis(documents[0], 'C', ctx, [{ revision: 'A' }], () => ({ status: 'Em Análise' })), null);
assert.equal(Query.resolve(documents[0], '0', Query.context(), 'Recusado').status, 'Recusado', 'legacy still works without a Consulta Geral');

// The original also contains these two complete spellings as separate SIGEM
// codes. The newer nt- row must not overwrite the exact non-nt row.
const spelling = 'C1O_RNEST_U32_3.1.1.1_CVL_RIR_B-32001A';
const variants = Conference.parseMatrix([header,
  [spelling, '0', '02/10/2026 17:31:27', '', 'Sem Comentários', 'TERMINADO'],
  [spelling.replace('_B-', '_nt-B-'), '0', '02/10/2026 17:32:55', '', 'Com Comentários', 'TERMINADO'],
  [spelling.replace('_B-', '_nt-B-'), 'A', '03/10/2026 17:32:55', '', 'Em Análise', 'ATIVO'],
]).records;
ctx = Query.context({ records: variants });
assert.equal(Query.resolve(spelling, '0', ctx).status, 'Sem Comentários');
assert.equal(Query.resolve(spelling.replace('_B-', '_nt-B-'), '0', ctx).status, 'Com Comentários');
assert.equal(Query.resolve(spelling, 'A', ctx).status, 'Não Postado', 'exact document cannot borrow an alias revision');
assert.equal(Query.previousAnalysis(spelling, 'B', ctx), null, 'exact document cannot inherit analysis from the alias');
for (const record of variants) {
  const row = Conference.reconcile([{ id: record.document, files: [{ document: record.document, revision: record.revision }] }], variants).rows[0];
  assert.equal(row.sigemStatus, record.status);
}

// The UI used to label every DISCARD as Em análise, including Recusado.
const appSource = fs.readFileSync(require.resolve('../app.js'), 'utf8');
function uiFunction(name, row) {
  const source = appSource.match(new RegExp(`  function ${name}\\(row\\) \\{[\\s\\S]*?\\n  \\}`))[0];
  return vm.runInNewContext(`(${source})(row)`, { row, C: Core, TriageQuery,
    rowStatusPolicy: TriageQuery.selectionPolicy, manuallyIncluded: () => false });
}
for (const status of ['Recusado', 'Sem Comentários', 'Com Comentários', 'Para Construção']) {
  const row = { status, decision: Core.DISCARD };
  assert.equal(uiFunction('decisionGroupKey', row), 'bloqueado', status);
  assert.equal(uiFunction('compactDecisionLabel', row), 'Não incluir', status);
}
for (const status of ['Em Análise', 'Em Workflow']) {
  const row = { status, decision: Core.DISCARD };
  assert.equal(uiFunction('decisionGroupKey', row), 'descartar', status);
  assert.equal(uiFunction('compactDecisionLabel', row), 'Em análise', status);
}
const blocked = Core.grdtStatusForRevision({ records: [{ document: documents[0], revision: 'A' }], history: [] }, 'A',
  Query.context({ records: [{ document: documents[0], revision: '0', status: 'Em Análise' }] }), documents[0]);
assert.equal(blocked.status, 'Não Postado');
assert.equal(blocked.blockingRevision, '0');
const blockedRow = { ...blocked, decision: Core.DISCARD };
assert.equal(TriageQuery.selectionPolicy(blockedRow).autoEligible, false);
assert.equal(uiFunction('decisionGroupKey', blockedRow), 'bloqueado');
assert.equal(uiFunction('compactDecisionLabel', blockedRow), 'Revisão 0 em análise');

// Exercise the app import -> persistence -> refresh -> triage context. This
// catches the original bug where setLocal() reported success but current()
// kept returning the previously published snapshot.
async function appScenario() {
  const cache = new Map(), events = [];
  let version = { snapshot_id: 'old-team-base', record_count: older.records.length, metadata: {}, file_name: 'Anterior.xlsx' };
  let serverRecords = older.records;
  const root = {
    crypto: require('node:crypto').webcrypto, GrconSharedSigemQueryCore: Query,
    GrconSigemPwDashboard: { updateSnapshotMetadata: async () => {} },
    GrconSigemPwHistory: { contentFingerprint: () => 'qa', updateSourceSnapshotDate: async () => {} },
    GrconCloud: { state: { membership: { workspace_id: 'QA', role: 'owner' }, online: true } },
    GRCONModuleLoader: { ensure: async () => {} },
    GrconPostingConference: {
      kvGet: async (key, fallback) => cache.get(key) || fallback,
      kvSet: async (key, value) => cache.set(key, value),
      kvSetMany: async entries => entries.forEach(([key, value]) => cache.set(key, value)),
    },
    dispatchEvent: event => events.push(event), addEventListener() {}, document: { hidden: true, addEventListener() {} },
  };
  root.GrconCloud.state.client = { rpc: async (name, args) => {
    if (name.endsWith('_current')) return { data: version };
    if (name.endsWith('_page')) return { data: serverRecords.slice(args.after_row, args.after_row + args.page_size).map((payload, i) => ({ row_number: args.after_row + i + 1, payload })) };
    throw new Error(`Unexpected RPC: ${name}`);
  } };
  function loadApp() {
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared_sigem_query_app.js'), 'utf8'), {
      window: root, console, performance, TextEncoder, setTimeout, clearTimeout, setInterval() {},
      CustomEvent: class { constructor(type, { detail } = {}) { this.type = type; this.detail = detail; } },
    });
    return root.GrconSharedSigemQuery;
  }
  let app = loadApp();
  await app.refresh();
  assert.equal(app.current().meta.snapshotId, 'old-team-base');
  await app.setLocal(base);
  const localId = app.current().meta.snapshotId;
  assert.match(localId, /^local:/);
  assertSource(app.current(), structuredClone(app.context())); // Worker serialization
  assert.equal((await app.refreshLatest()).meta.snapshotId, localId, 'same shared version cannot overwrite explicit import');
  assertSource(app.current(), app.context());
  await app.setReferenceDate('2026-10-29'); // must update local, never call shared set_date
  app = loadApp();
  await app.refresh();
  assert.equal(app.current().meta.snapshotId, localId, 'selection survives reload');
  assertSource(app.current(), app.context());
  version = { ...version, snapshot_id: 'new-team-base' };
  serverRecords = base.records;
  await app.refreshLatest();
  assert.equal(app.current().meta.snapshotId, 'new-team-base', 'a new team publication supersedes the local import');
  assertSource(app.current(), app.context());
  assert.ok(events.some(e => e.type === 'grcon:shared-sigem-updated'));
}
appScenario().then(() => console.log('OK — five reported codes/seven revisions, import activation, reload, refresh, Worker context, triage, conflicts and stale fallback.')).catch(error => { console.error(error); process.exitCode = 1; });
