// Server-only libSQL adapter. No credentials, source payloads or SQL reach errors/logs.
// Official protocol: https://docs.turso.tech/sdk/http/reference
export const fail = (code, status = 409) => Object.assign(new Error(code), {code, status});
export const ZERO_HASH = '0'.repeat(64);
export function storageMode(env) {
  const mode = env.GRCON_SIGEM_STORAGE_MODE || 'supabase';
  if (!['supabase', 'shadow', 'turso'].includes(mode)) throw fail('SIGEM_MODE_INVALID', 503);
  return mode;
}
export function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  throw fail('SIGEM_NON_CANONICAL_DATA');
}
export async function sha256(text) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), n => n.toString(16).padStart(2, '0')).join('');
}
export async function chainHash(previous, rows) { return sha256(previous + '\n' + await sha256(canonical(rows))); }
const value = v => v === null ? {type: 'null'} : typeof v === 'number' ? {type: Number.isInteger(v) ? 'integer' : 'float', value: String(v)} : {type: 'text', value: String(v)};
function decoded(cell) {
  if (cell.type === 'null') return null;
  if (cell.type === 'integer' || cell.type === 'float') {
    const n = Number(cell.value);
    if (!Number.isFinite(n) || (cell.type === 'integer' && !Number.isSafeInteger(n))) throw fail('TURSO_INTEGER_RANGE', 503);
    return n;
  }
  if (cell.type !== 'text') throw fail('TURSO_RESPONSE_INVALID', 503);
  return cell.value;
}
export function tursoClient(env, fetcher = fetch) {
  let url;
  try { url = new URL(String(env.TURSO_DATABASE_URL || '').replace(/^libsql:/, 'https:')); } catch { throw fail('TURSO_NOT_CONFIGURED', 503); }
  // A fixed trusted database host prevents redirect-based credential disclosure/SSRF.
  if (url.protocol !== 'https:' || !/^(?:[a-z0-9-]+\.)+turso\.io$/.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/' || !env.TURSO_AUTH_TOKEN) throw fail('TURSO_NOT_CONFIGURED', 503);
  async function execute(sql, args = []) {
    let response;
    try { response = await fetcher(new URL('/v2/pipeline', url), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: {'content-type': 'application/json', authorization: `Bearer ${env.TURSO_AUTH_TOKEN}`},
      body: JSON.stringify({requests: [{type: 'execute', stmt: {sql, args: args.map(value)}}, {type: 'close'}]}),
    }); } catch { throw fail('TURSO_UNAVAILABLE', 503); }
    if (!response.ok) throw fail(response.status === 429 ? 'TURSO_RATE_LIMIT' : 'TURSO_UNAVAILABLE', response.status === 429 ? 429 : 503);
    const data = await response.json().catch(() => null), item = data?.results?.[0];
    if (item?.type !== 'ok' || item.response?.type !== 'execute' || data.results?.[1]?.type !== 'ok') throw fail('TURSO_QUERY_FAILED', 503);
    const result = item.response.result;
    if (!Array.isArray(result?.rows) || !Array.isArray(result?.cols)) throw fail('TURSO_RESPONSE_INVALID', 503);
    return {rows: result.rows.map(row => Object.fromEntries(result.cols.map((col, i) => [col.name, decoded(row[i])]))), affected: result.affected_row_count};
  }
  return {execute};
}
// Each statement is atomic. A checkpoint is never trusted without reading and
// hashing the destination again. Single-statement JSON insertion avoids partial batches.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sigem_snapshots (
    workspace_id TEXT NOT NULL, contract_id TEXT NOT NULL, id TEXT NOT NULL,
    source_json TEXT NOT NULL CHECK(json_valid(source_json)), expected_count INTEGER NOT NULL CHECK(expected_count BETWEEN 1 AND 100000),
    state TEXT NOT NULL DEFAULT 'copying' CHECK(state IN ('copying','verified')),
    checksum TEXT, verified_at TEXT, PRIMARY KEY(workspace_id,contract_id,id)) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS sigem_rows (
    workspace_id TEXT NOT NULL, contract_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, row_number INTEGER NOT NULL CHECK(row_number BETWEEN 1 AND 100000),
    document_key TEXT NOT NULL, revision_key TEXT NOT NULL, status_normalized TEXT NOT NULL,
    row_json TEXT NOT NULL CHECK(json_valid(row_json)),
    PRIMARY KEY(workspace_id,contract_id,snapshot_id,row_number),
    FOREIGN KEY(workspace_id,contract_id,snapshot_id) REFERENCES sigem_snapshots(workspace_id,contract_id,id)) WITHOUT ROWID`,
  `CREATE INDEX IF NOT EXISTS sigem_exact_document ON sigem_rows(workspace_id,contract_id,snapshot_id,document_key,revision_key,row_number)`,
  `CREATE TABLE IF NOT EXISTS sigem_import_jobs (
    workspace_id TEXT NOT NULL, contract_id TEXT NOT NULL, snapshot_id TEXT NOT NULL,
    after_row INTEGER NOT NULL, last_row INTEGER NOT NULL, row_count INTEGER NOT NULL,
    checksum TEXT NOT NULL, backup_key TEXT NOT NULL, verified_at TEXT NOT NULL,
    PRIMARY KEY(workspace_id,contract_id,snapshot_id,after_row)) WITHOUT ROWID`,
];
export async function initialize(db) { for (const sql of SCHEMA) await db.execute(sql); }
const scopeArgs = s => [s.workspace_id, s.contract_id, s.id];
export async function beginSnapshot(db, source) {
  if (!source.id || !source.workspace_id || !source.contract_id || !Number.isSafeInteger(source.record_count) || source.record_count < 1 || !['active','archived'].includes(source.status)) throw fail('SIGEM_SOURCE_INVALID');
  await db.execute(`INSERT INTO sigem_snapshots(workspace_id,contract_id,id,source_json,expected_count) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING`, [...scopeArgs(source), canonical(source), source.record_count]);
  const existing = (await db.execute(`SELECT * FROM sigem_snapshots WHERE workspace_id=? AND contract_id=? AND id=?`, scopeArgs(source))).rows[0];
  if (existing?.source_json !== canonical(source) || existing.expected_count !== source.record_count) throw fail('SIGEM_SOURCE_CHANGED');
  return existing;
}
export function checkPage(source, after, rows, size = 250) {
  const expected = Math.min(size, source.record_count - after);
  if (!Number.isInteger(after) || after < 0 || expected < 1 || !Array.isArray(rows) || rows.length !== expected) throw fail('SIGEM_SOURCE_INCOMPLETE');
  rows.forEach((r, i) => {
    if (r.snapshot_id !== source.id || r.row_number !== after + i + 1 || !r.payload || typeof r.payload !== 'object' || Array.isArray(r.payload) || typeof r.document_key !== 'string' || typeof r.revision_key !== 'string' || typeof r.status_normalized !== 'string') throw fail('SIGEM_SOURCE_INCOMPLETE');
    canonical(r);
  });
}
export async function readRows(db, source, after, limit = 250) {
  const result = await db.execute(`SELECT row_number,row_json FROM sigem_rows WHERE workspace_id=? AND contract_id=? AND snapshot_id=? AND row_number>? ORDER BY row_number LIMIT ?`, [...scopeArgs(source), after, limit]);
  return result.rows.map(r => JSON.parse(r.row_json));
}
export async function copyPage(db, bucket, source, after, rows) {
  checkPage(source, after, rows);
  const saved = (await db.execute(`SELECT state FROM sigem_snapshots WHERE workspace_id=? AND contract_id=? AND id=?`, scopeArgs(source))).rows[0];
  if (!saved) throw fail('SIGEM_NOT_INITIALIZED');
  const bytes = canonical(rows), checksum = await sha256(bytes);
  const key = `sigem-backups/v1/${source.workspace_id}/${source.contract_id}/${source.id}/rows-${after + 1}-${after + rows.length}-${checksum}.json`;
  if (!bucket?.put || !bucket?.get) throw fail('SIGEM_BACKUP_UNAVAILABLE', 503);
  // Read back the independent backup. A successful PUT alone is insufficient.
  if (!await bucket.head(key)) await bucket.put(key, bytes, {httpMetadata: {contentType: 'application/json'}, customMetadata: {sha256: checksum}});
  const object = await bucket.get(key);
  if (!object || await sha256(await object.text()) !== checksum) throw fail('SIGEM_BACKUP_MISMATCH');
  const prior = await readRows(db, source, after, rows.length);
  if (prior.length) {
    if (canonical(prior) !== bytes) throw fail('SIGEM_DESTINATION_CONFLICT');
  } else {
    if (saved.state !== 'copying') throw fail('SIGEM_SNAPSHOT_IMMUTABLE');
    await db.execute(`INSERT INTO sigem_rows(workspace_id,contract_id,snapshot_id,row_number,document_key,revision_key,status_normalized,row_json)
      SELECT ?,?,?,CAST(json_extract(value,'$.row_number') AS INTEGER),json_extract(value,'$.document_key'),json_extract(value,'$.revision_key'),json_extract(value,'$.status_normalized'),value FROM json_each(?)
      WHERE EXISTS(SELECT 1 FROM sigem_snapshots WHERE workspace_id=? AND contract_id=? AND id=? AND state='copying')
      ON CONFLICT DO NOTHING`, [...scopeArgs(source), bytes, ...scopeArgs(source)]);
  }
  const destination = await readRows(db, source, after, rows.length);
  if (canonical(destination) !== bytes) throw fail('SIGEM_DESTINATION_MISMATCH');
  // Durable checkpoint follows both backup and destination validation.
  await db.execute(`INSERT INTO sigem_import_jobs(workspace_id,contract_id,snapshot_id,after_row,last_row,row_count,checksum,backup_key,verified_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`, [...scopeArgs(source), after, after + rows.length, rows.length, checksum, key, new Date().toISOString()]);
  const checkpoint = (await db.execute(`SELECT * FROM sigem_import_jobs WHERE workspace_id=? AND contract_id=? AND snapshot_id=? AND after_row=?`, [...scopeArgs(source), after])).rows[0];
  if (checkpoint?.checksum !== checksum || checkpoint.last_row !== after + rows.length) throw fail('SIGEM_CHECKPOINT_CONFLICT');
  return {after: after + rows.length, checksum, backupKey: key, count: rows.length};
}
export async function verifySnapshot(db, bucket, source) {
  const jobs = (await db.execute(`SELECT * FROM sigem_import_jobs WHERE workspace_id=? AND contract_id=? AND snapshot_id=? ORDER BY after_row`, scopeArgs(source))).rows;
  let after = 0, digest = ZERO_HASH;
  for (const job of jobs) {
    if (job.after_row !== after || job.last_row !== after + job.row_count) throw fail('SIGEM_CHECKPOINT_GAP');
    const destination = await readRows(db, source, after, job.row_count);
    checkPage(source, after, destination);
    const object = await bucket.get(job.backup_key);
    if (!object || await sha256(await object.text()) !== job.checksum || await sha256(canonical(destination)) !== job.checksum) throw fail('SIGEM_VERIFY_MISMATCH');
    digest = await chainHash(digest, destination); after = job.last_row;
  }
  const total = (await db.execute(`SELECT count(*) total FROM sigem_rows WHERE workspace_id=? AND contract_id=? AND snapshot_id=?`, scopeArgs(source))).rows[0]?.total;
  if (after !== source.record_count || total !== source.record_count) throw fail('SIGEM_VERIFY_INCOMPLETE');
  const manifest = {format: 'grcon-sigem-backup-v1', canonicalization: 'sorted-keys-json-v1', batchSize: 250, source, recordCount: after, checksum: digest, batches: jobs.map(j => ({after: j.after_row, last: j.last_row, checksum: j.checksum, key: j.backup_key}))};
  const body = canonical(manifest), manifestHash = await sha256(body), key = `sigem-backups/v1/${source.workspace_id}/${source.contract_id}/${source.id}/manifest-${manifestHash}.json`;
  await bucket.put(key, body, {httpMetadata: {contentType: 'application/json'}, customMetadata: {sha256: manifestHash}});
  if (await sha256(await (await bucket.get(key)).text()) !== manifestHash) throw fail('SIGEM_BACKUP_MISMATCH');
  await db.execute(`UPDATE sigem_snapshots SET state='verified',checksum=?,verified_at=? WHERE workspace_id=? AND contract_id=? AND id=?`, [digest, new Date().toISOString(), ...scopeArgs(source)]);
  return {count: after, checksum: digest, manifestKey: key, manifestHash};
}
export async function verifiedPage(db, source, after, size) {
  const s = (await db.execute(`SELECT state,checksum,expected_count FROM sigem_snapshots WHERE workspace_id=? AND contract_id=? AND id=?`, scopeArgs(source))).rows[0];
  if (s?.state !== 'verified' || s.expected_count !== source.record_count) throw fail('SIGEM_SNAPSHOT_NOT_VERIFIED');
  return (await readRows(db, source, after, size)).map(r => ({row_number: r.row_number, payload: r.payload}));
}
// Bounded sealing for Workers: each batch was read back from both stores by
// copyPage; never run a whole 25k-row rescan inside one Worker request.
export async function sealSnapshot(db, bucket, source) {
  const jobs = (await db.execute(`SELECT * FROM sigem_import_jobs WHERE workspace_id=? AND contract_id=? AND snapshot_id=? ORDER BY after_row`, scopeArgs(source))).rows;
  let after = 0, digest = ZERO_HASH;
  for (const job of jobs) {
    if (job.after_row !== after || job.last_row !== after + Math.min(250, source.record_count - after) || !/^[a-f0-9]{64}$/.test(job.checksum)) throw fail('SIGEM_CHECKPOINT_GAP');
    digest = await sha256(digest + '\n' + job.checksum); after = job.last_row;
  }
  const total = (await db.execute(`SELECT count(*) total FROM sigem_rows WHERE workspace_id=? AND contract_id=? AND snapshot_id=?`, scopeArgs(source))).rows[0]?.total;
  if (after !== source.record_count || total !== source.record_count) throw fail('SIGEM_VERIFY_INCOMPLETE');
  const manifest = {format: 'grcon-sigem-backup-v1', canonicalization: 'sorted-keys-json-v1', batchSize: 250, source, recordCount: after, checksum: digest, batches: jobs.map(j => ({after: j.after_row, last: j.last_row, checksum: j.checksum, key: j.backup_key}))};
  const body = canonical(manifest), manifestHash = await sha256(body), key = `sigem-backups/v1/${source.workspace_id}/${source.contract_id}/${source.id}/manifest-${manifestHash}.json`;
  await bucket.put(key, body, {httpMetadata: {contentType: 'application/json'}, customMetadata: {sha256: manifestHash}});
  const saved = await bucket.get(key);
  if (!saved || await sha256(await saved.text()) !== manifestHash) throw fail('SIGEM_BACKUP_MISMATCH');
  await db.execute(`UPDATE sigem_snapshots SET state='verified',checksum=?,verified_at=? WHERE workspace_id=? AND contract_id=? AND id=?`, [digest, new Date().toISOString(), ...scopeArgs(source)]);
  return {count: after, checksum: digest, manifestKey: key, manifestHash};
}
