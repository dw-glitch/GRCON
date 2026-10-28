import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Workers Builds currently calls `npm run build`, followed by `wrangler deploy`.
// Only that environment needs this automatic packaging; other build providers
// retain their existing build/output contract.
if (process.env.WORKERS_CI === '1') {
  const root = fileURLToPath(new URL('../', import.meta.url));
  for (const script of ['build-cloudflare-package.mjs', 'verify-cloudflare-package.mjs']) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
      cwd: root, env: process.env, stdio: 'inherit'
    });
    if (result.error || result.status !== 0) {
      console.error('Preparação do pacote Cloudflare falhou em ' + script + '. Deploy deve ser interrompido.');
      process.exit(result.status || 1);
    }
  }
}
