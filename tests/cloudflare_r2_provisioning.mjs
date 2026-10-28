import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ensurePrivateBucket, BUCKET_NAME} from '../scripts/ensure-cloudflare-r2.mjs';

const env = {CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'synthetic-secret'};
const ok = result => [200, {success: true, result}];
const existing = () => [ok({name: BUCKET_NAME}), ok({enabled: false}), ok({domains: []})];
function fixture(responses) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({url, ...options});
    const next = responses.shift();
    assert.ok(next, 'Unexpected extra API call');
    return new Response(JSON.stringify(next[1]), {status: next[0]});
  };
  return {calls, fetchImpl};
}
test('reuses existing private bucket without mutations', async () => {
  const f = fixture(existing());
  assert.deepEqual(await ensurePrivateBucket({env, fetchImpl: f.fetchImpl}),
    {ok: true, bucket: BUCKET_NAME, created: false, reused: true, private: true, objectsModified: 0});
  assert.equal(f.calls.length, 3);
  assert.ok(f.calls.every(call => call.method === 'GET' && call.redirect === 'error'));
});
test('creates only after 404, Standard, then verifies privacy', async () => {
  const f = fixture([[404, {success: false}], ok({name: BUCKET_NAME}), ...existing()]);
  assert.equal((await ensurePrivateBucket({env, fetchImpl: f.fetchImpl})).created, true);
  assert.deepEqual(JSON.parse(f.calls[1].body), {name: BUCKET_NAME, storageClass: 'Standard'});
  assert.deepEqual(f.calls.map(call => call.method), ['GET','POST','GET','GET','GET']);
});
test('a concurrent create conflict requires successful re-read', async () => {
  const f = fixture([[404, {success: false}], [409, {success: false}], ...existing()]);
  assert.equal((await ensurePrivateBucket({env, fetchImpl: f.fetchImpl})).reused, true);
});
for (const status of [401, 403, 429, 500]) test(`HTTP ${status} never causes bucket creation`, async () => {
  const f = fixture([[status, {success: false, errors: [{message: env.CLOUDFLARE_API_TOKEN}]}]]);
  await assert.rejects(ensurePrivateBucket({env, fetchImpl: f.fetchImpl}), error =>
    error.message.includes(String(status)) && !error.message.includes(env.CLOUDFLARE_API_TOKEN));
  assert.equal(f.calls.length, 1);
});
test('missing secrets cause no API calls', async () => {
  const f = fixture([]);
  await assert.rejects(ensurePrivateBucket({env: {}, fetchImpl: f.fetchImpl}), /Secrets/);
  assert.equal(f.calls.length, 0);
});
test('managed public access blocks release without changing it', async () => {
  const responses = existing(); responses[1] = ok({enabled: true}); const f = fixture(responses);
  await assert.rejects(ensurePrivateBucket({env, fetchImpl: f.fetchImpl}), /Privacidade/);
  assert.ok(f.calls.every(call => call.method === 'GET'));
});
test('custom public domains and unknown visibility block release', async () => {
  for (const domains of [[{enabled:true}], [{}], null]) {
    const responses = existing(); responses[2] = ok({domains}); const f = fixture(responses);
    await assert.rejects(ensurePrivateBucket({env, fetchImpl: f.fetchImpl}), /Privacidade/);
  }
});
test('network errors cannot expose a token through reflected error text', async () => {
  await assert.rejects(ensurePrivateBucket({env, fetchImpl: async () => {throw Error(env.CLOUDFLARE_API_TOKEN);}}),
    error => !error.message.includes(env.CLOUDFLARE_API_TOKEN));
});
