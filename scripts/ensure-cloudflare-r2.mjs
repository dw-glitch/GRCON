import {pathToFileURL} from 'node:url';

export const BUCKET_NAME = 'grcon-documents';

// No object reads/writes, deletion, public-access changes or billing activation.
export async function ensurePrivateBucket({env = process.env, fetchImpl = fetch} = {}) {
  const account = env.CLOUDFLARE_ACCOUNT_ID || '';
  const token = env.CLOUDFLARE_API_TOKEN || '';
  if (!/^[a-f0-9]{32}$/i.test(account) || !token.trim() || /[\r\n]/.test(token)) {
    throw Error('CLOUDFLARE_ACCOUNT_ID ou CLOUDFLARE_API_TOKEN ausente/inválido nos Secrets do GitHub.');
  }
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets`;
  const bucket = `${base}/${BUCKET_NAME}`;
  async function request(url, method = 'GET', body) {
    let response;
    try {
      response = await fetchImpl(url, {
        method, redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'},
        ...(body ? {body: JSON.stringify(body)} : {})
      });
    } catch {
      throw Error('Falha de conexão com a API R2; nenhuma credencial foi registrada.');
    }
    const data = await response.json().catch(() => null);
    return {status: response.status, ok: response.ok && data?.success === true, data};
  }
  function requireOk(result, operation) {
    if (result.ok) return;
    const permission = [401, 403].includes(result.status)
      ? ' Verifique a conta e a permissão Workers R2 Storage Read/Write do token existente.' : '';
    throw Error(`${operation}: HTTP ${result.status}.${permission} Sem alteração de plano ou exclusão de dados.`);
  }
  let found = await request(bucket), created = false;
  if (found.status === 404) {
    const creation = await request(base, 'POST', {name: BUCKET_NAME, storageClass: 'Standard'});
    // A concurrent run may have created it. Re-read, never delete/recreate.
    if (creation.status !== 409) requireOk(creation, 'Criação do bucket');
    created = creation.ok;
    found = await request(bucket);
  }
  requireOk(found, 'Consulta do bucket');
  if (found.data?.result?.name !== BUCKET_NAME) throw Error('A API não confirmou o bucket esperado.');
  const managed = await request(`${bucket}/domains/managed`);
  requireOk(managed, 'Verificação do acesso r2.dev');
  const custom = await request(`${bucket}/domains/custom`);
  requireOk(custom, 'Verificação dos domínios públicos');
  if (managed.data?.result?.enabled !== false || !Array.isArray(custom.data?.result?.domains) ||
      custom.data.result.domains.some(domain => domain.enabled !== false)) {
    throw Error('Privacidade do bucket não comprovada. Acesso público não foi alterado; publicação interrompida.');
  }
  return {ok: true, bucket: BUCKET_NAME, created, reused: !created, private: true, objectsModified: 0};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ensurePrivateBucket().then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
