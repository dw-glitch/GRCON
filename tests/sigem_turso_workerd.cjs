'use strict';
// Native Workers Request/fetch semantics; all outbound requests terminate in
// this local fixture. cf:false disables Miniflare's optional metadata download.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {Miniflare} = require('miniflare');
(async () => {
  let scenario = 200, calls = [];
  const mf = new Miniflare({
    cf: false,
    modulesRoot: '/virtual',
    compatibilityDate: '2025-09-02',
    modules: [
      {type: 'ESModule', path: '/virtual/worker.mjs', contents: `
        import {tursoClient} from './sigem-turso.mjs';
        export default {async fetch(request) {
          if (new URL(request.url).pathname === '/native-rejection') {
            try { new Request('https://unit.test', {redirect: 'error'}); return Response.json({rejected: false}); }
            catch (error) { return Response.json({rejected: true, name: error.name}); }
          }
          try {
            const db = tursoClient({TURSO_DATABASE_URL: 'libsql://test-org.turso.io', TURSO_AUTH_TOKEN: 'synthetic-only'});
            return Response.json({ok: true, result: await db.execute('SELECT 1 AS connected')});
          } catch (error) { return Response.json({ok: false, code: error.code}); }
        }};
      `},
      {type: 'ESModule', path: '/virtual/sigem-turso.mjs', contents: fs.readFileSync('cloudflare/sigem-turso.mjs', 'utf8')}
    ],
    outboundService: async request => {
      calls.push(request.url);
      assert.equal(request.url, 'https://test-org.turso.io/v2/pipeline');
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.get('authorization'), 'Bearer synthetic-only');
      const body = await request.json();
      assert.equal(body.requests[0].stmt.sql, 'SELECT 1 AS connected');
      if (scenario >= 300 && scenario < 400) return new Response(null, {status: scenario, headers: {location: 'https://untrusted.invalid/steal'}});
      if (scenario !== 200) return new Response('not exposed', {status: scenario});
      return Response.json({results: [
        {type: 'ok', response: {type: 'execute', result: {cols: [{name: 'connected'}], rows: [[{type: 'integer', value: '1'}]], affected_row_count: 0}}},
        {type: 'ok', response: {type: 'close'}}
      ]});
    }
  });
  try {
    const dispatch = async path => (await mf.dispatchFetch('https://local.test/' + (path || ''))).json();
    assert.deepEqual(await dispatch('native-rejection'), {rejected: true, name: 'TypeError'});
    assert.equal(calls.length, 0, 'unsupported redirect mode fails before a request');
    const success = await dispatch();
    assert.equal(success.ok, true); assert.equal(success.result.rows[0].connected, 1);
    assert.equal(calls.length, 1, 'real Workers fetch reaches the local upstream');
    for (const status of [301, 302, 303, 307, 308]) {
      scenario = status; calls = [];
      assert.deepEqual(await dispatch(), {ok: false, code: 'TURSO_REDIRECT_REJECTED'});
      assert.equal(calls.length, 1, 'redirects never transmit credentials to another host');
    }
    for (const [status, code] of [[401, 'TURSO_AUTH_REJECTED'], [503, 'TURSO_UNAVAILABLE']]) {
      scenario = status; calls = [];
      assert.deepEqual(await dispatch(), {ok: false, code}); assert.equal(calls.length, 1);
    }
    console.log('SIGEM Turso workerd: native Request rejection reproduced, real fetch succeeds, all redirects blocked without forwarding credentials.');
  } finally { await mf.dispose(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
