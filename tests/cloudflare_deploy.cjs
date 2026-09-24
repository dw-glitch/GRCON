"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const wrangler = read("wrangler.jsonc");
const worker = read("cloudflare/worker.mjs");
const headers = read("cloudflare/_headers");
const build = read("scripts/build-cloudflare-package.mjs");
const verify = read("scripts/verify-cloudflare-package.mjs");
const deploy = read(".github/workflows/deploy-cloudflare.yml");
const validate = read(".github/workflows/validate-cloudflare.yml");
const vercel = read("vercel.json");

assert.match(wrangler, /"name"\s*:\s*"grcon-cloudflare"/);
assert.match(wrangler, /"directory"\s*:\s*"\.\/dist-cloudflare"/);
assert.match(wrangler, /"binding"\s*:\s*"ASSETS"/);
assert.match(wrangler, /"run_worker_first"\s*:\s*\["\/api\/\*"\]/);
assert.match(worker, /\/api\/egrdt-teams-notification/);
assert.match(worker, /POWER_AUTOMATE_EGRDT_WEBHOOK_URL/);
assert.match(worker, /grcon_memberships/);
assert.match(worker, /env\.ASSETS\.fetch\(request\)/);
assert.doesNotMatch(worker, /process\.env|Buffer\./);
assert.match(headers, /Content-Security-Policy:/);
assert.match(headers, /kvyrttccwzdhasplfxnr\.supabase\.co/);
assert.match(headers, /assets\/mascot\/video\/\*\.webm/);
assert.match(build, /dist-cloudflare/);
assert.match(build, /react-dist/);
assert.match(build, /25 \* 1024 \* 1024/);
assert.match(verify, /Referências locais quebradas/);
assert.match(deploy, /branches:\s*\[main\]/);
assert.match(deploy, /workflow_dispatch:/);
assert.match(deploy, /github\.ref == 'refs\/heads\/main'/);
assert.match(deploy, /CLOUDFLARE_API_TOKEN/);
assert.match(deploy, /CLOUDFLARE_ACCOUNT_ID/);
assert.match(deploy, /wrangler@4\.34\.0/);
assert.match(validate, /pull_request:/);
assert.doesNotMatch(validate, /CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|wrangler deploy/);
assert.match(vercel, /grcon-ten\.vercel\.app/);
assert.match(vercel, /"outputDirectory"\s*:\s*"\."/);

console.log("Cloudflare deploy: configuração, segurança, API parity e workflows validados.");
