# Deploy independente do GRCON na Cloudflare

A Cloudflare é um caminho de publicação paralelo à Vercel. O projeto Vercel e `vercel.json` permanecem ativos; esta integração não troca a URL de produção automaticamente.

## Arquitetura

`main` continua sendo a fonte única. A Vercel publica a raiz do repositório como hoje. Em paralelo, o GitHub Actions executa o build das ilhas React, gera `dist-cloudflare/` com apenas o runtime necessário e publica esse artefato usando Cloudflare Workers Static Assets.

O Worker `cloudflare/worker.mjs` preserva o endpoint `/api/egrdt-teams-notification`, que na Vercel é uma função serverless. Os demais arquivos são servidos pelo binding `ASSETS`.

## Build e validação

```bash
npm ci --ignore-scripts
npm run verify
npm run build:cloudflare
npm run verify:cloudflare
npx --yes wrangler@4.34.0 deploy --config wrangler.jsonc --dry-run
```

`dist-cloudflare/` é gerado e ignorado pelo Git. O pacote inclui arquivos de runtime da raiz, `assets/`, `workers/`, `react-dist/`, `_headers` e `deployment-meta.json`. Ele não inclui `.git`, `.github`, `node_modules`, `tests`, `src` nem arquivos `.env*`.

A validação falha se um item obrigatório não existir, se uma referência local verificável estiver quebrada, se houver arquivo acima de 25 MiB ou se o pacote ultrapassar 20.000 arquivos. O limite de 20.000 mantém compatibilidade com Workers Free; planos pagos aceitam mais arquivos, e Wrangler 4.34.0+ suporta o limite ampliado.

## Headers e PWA

`cloudflare/_headers` replica semanticamente as políticas de cache e segurança de `vercel.json`, incluindo a CSP que libera apenas o Supabase já usado pelo GRCON. `sw.js` e `manifest.json` são servidos na nova origem Cloudflare e, portanto, criam um registro PWA independente da origem Vercel.

## Credenciais

O workflow de deploy usa somente estes GitHub Actions secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

O token deve ter somente as permissões necessárias para publicar o Worker/Static Assets da conta selecionada.

O endpoint do Teams também precisa do segredo de runtime `POWER_AUTOMATE_EGRDT_WEBHOOK_URL` configurado diretamente no Worker Cloudflare. Ele não deve ser salvo no GitHub, no repositório, no README ou em logs. `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `GRCON_TEAMS_MASCOT_URL` são overrides opcionais; sem eles, o Worker usa os mesmos valores públicos já usados pelo GRCON/Vercel.

## Primeiro deploy

Antes do merge, configure a conta/projeto Cloudflare, os dois GitHub Actions secrets e o segredo de runtime `POWER_AUTOMATE_EGRDT_WEBHOOK_URL`. Depois execute o workflow de deploy a partir de `main` somente quando a integração estiver pronta. O workflow recusa deploy de outra branch.

Após publicar, valide `/`, `/index.html`, `/sw.js`, `/manifest.json`, `/grcon_mascot_controller_v4.js`, `/deployment-meta.json`, os bundles em `/react-dist/`, os WebM em `/assets/mascot/video/` e o endpoint `/api/egrdt-teams-notification`.

## Rollback

A Vercel não é removida e continua sendo o caminho de produção existente. Em caso de falha Cloudflare, não altere a Vercel; corrija a branch/PR e publique novamente. Se a Cloudflare já estiver em uso, um rollback pode ser feito publicando novamente um commit conhecido e validado.
