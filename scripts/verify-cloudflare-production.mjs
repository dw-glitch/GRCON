import assert from 'node:assert/strict';

const base = process.env.GRCON_PRODUCTION_URL;
const expectedCommit = process.env.GITHUB_SHA;
assert.ok(base && new URL(base).protocol === 'https:', 'Origem de produção HTTPS obrigatória.');
assert.ok(/^[0-9a-f]{40}$/.test(expectedCommit || ''), 'Commit esperado obrigatório.');
async function get(path) {
  return fetch(new URL(path, base), { cache: 'no-store', signal: AbortSignal.timeout(20000) });
}
let metadata;
for (let attempt = 0; attempt < 6; attempt++) {
  const response = await get('/deployment-meta.json?verify=' + expectedCommit);
  assert.equal(response.status, 200, 'Identificação da publicação indisponível.');
  metadata = await response.json();
  if (metadata.commit === expectedCommit) break;
  if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 5000));
}
assert.equal(metadata.commit, expectedCommit, 'Produção deve servir exatamente o commit publicado.');
assert.equal(metadata.provider, 'cloudflare');
const page = await get('/');
assert.equal(page.status, 200);
const html = await page.text();
for (const path of ['contract_storage.js', 'contract_admin_app.js', 'sigem_status_monitoring_app.js', 'document_vault_app.js', 'egrdt_email_reply_ui.js']) {
  assert.ok(html.includes(path), 'Página sem módulo ' + path);
  const response = await get('/' + path);
  assert.equal(response.status, 200, 'Módulo indisponível: ' + path);
  assert.ok((await response.text()).length > 100, 'Módulo vazio: ' + path);
}
const healthResponse = await get('/api/document-vault/health');
const health = await healthResponse.json().catch(() => null);
const configured = value => typeof value === 'boolean' ? String(value) : 'desconhecido';
assert.equal(healthResponse.status, 200, 'Saúde do Cofre HTTP ' + healthResponse.status + ': Supabase configurado=' + configured(health?.supabaseConfigured) + ', R2 configurado=' + configured(health?.r2Configured) + '. O health verifica presença da configuração, não a validade da chave.');
assert.equal(health.ok, true, 'Cofre deve estar configurado.');
assert.equal(health.r2Configured, true);
assert.equal(health.supabaseConfigured, true);
const anonymous = await get('/api/document-vault/list');
assert.equal(anonymous.status, 401, 'Catálogo deve exigir sessão.');
console.log(JSON.stringify({ ok: true, url: base, commit: metadata.commit, provider: metadata.provider, modules: 5, cofreConfigured: true, anonymousCatalogStatus: anonymous.status }));
