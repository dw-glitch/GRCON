const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../grcon_cloud_app.js'), 'utf8');
const start = source.indexOf('  async function fetchHistoryRows(columns) {');
const end = source.indexOf('  async function loadClassificationHistory()', start);
assert.ok(start >= 0 && end > start);
const functionSource = source.slice(start, end);

async function readFixture(total, serverLimit, failureAt = -1) {
  const records = Array.from({ length: total }, (_, id) => ({ id }));
  const ranges = [];
  const query = {
    select() { return this; },
    eq(column, value) { assert.equal(column, 'workspace_id'); assert.equal(value, 'workspace-a'); return this; },
    is() { return this; },
    order() { return this; },
    async range(from, to) {
      ranges.push([from, to]);
      if (from >= failureAt && failureAt >= 0) return { error: new Error('network unavailable') };
      return { data: records.slice(from, Math.min(to + 1, from + serverLimit)) };
    },
  };
  const state = { membership: { workspace_id: 'workspace-a' }, client: { from(table) { assert.equal(table, 'grcon_history'); return query; } } };
  const fetchHistoryRows = new Function('state', `return (${functionSource});`)(state);
  const result = await fetchHistoryRows('id');
  assert.deepEqual(result, records, 'a short server page must not truncate the complete history');
  assert.equal(ranges.at(-1)[0], total, 'read to an empty page');
  return ranges;
}

(async () => {
  assert.equal((await readFixture(1201, 100)).length, 14);
  await readFixture(1000, 500);
  await readFixture(0, 100);
  await assert.rejects(readFixture(1201, 100, 200), /network unavailable/, 'a failed page cannot produce a complete snapshot');
  console.log('Cloud history pagination: server caps, empty termination and failed-page rejection passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
