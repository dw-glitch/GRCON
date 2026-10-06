const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const app = read("document_vault_app.js");
const html = read("index.html");
const emission = read("emission.js");
const worker = read("cloudflare/worker-entry.mjs");
const wrangler = read("wrangler.jsonc");
const migrations = fs.readdirSync(path.join(root, "supabase", "migrations"))
  .filter(name => /^202610061(63921|70344|70405|70533|70546)_document_vault/.test(name))
  .map(name => read(path.join("supabase", "migrations", name)))
  .join("\n");

new vm.Script(app, { filename: "document_vault_app.js" });
execFileSync(process.execPath, ["--check", path.join(root, "cloudflare", "worker-entry.mjs")], { stdio: "pipe" });

assert.match(html, /document_vault_app\.js/);
assert.match(app, /\/api\/document-vault/);
assert.match(app, /allocation:\s*state\.allocation/);
assert.match(app, /value="allocated">Alocados/);
assert.match(app, /value="not_allocated">Não alocados/);
assert.match(app, /relativePath:\s*task\.file\.name/);
assert.match(app, /webkitdirectory/);
assert.match(app, /document_hash_worker\.js/);
assert.match(app, /Pausar/);
assert.match(app, /Retomar/);
assert.match(app, /Tentar novamente/);
assert.match(app, /DataTransfer/);
assert.match(app, /input\.dispatchEvent\(new Event\("change"/);
assert.match(app, /lookupSource/);
assert.doesNotMatch(app, /SUPABASE_SECRET_KEY|service_role|R2_SECRET|R2_ACCESS_KEY/i);

assert.match(worker, /authenticatedUser/);
assert.match(worker, /SUPABASE_SECRET_KEY/);
assert.match(worker, /GRCON_DOCUMENTS/);
assert.match(worker, /grcon_document_vault_list/);
assert.match(worker, /handleDownload/);
assert.match(worker, /createMultipartUpload/);
assert.match(worker, /find_hash/);
assert.match(worker, /cache-control": "private, no-store"/);
assert.match(wrangler, /"bucket_name"\s*:\s*"grcon-documents"/);
assert.match(wrangler, /"main"\s*:\s*"\.\/cloudflare\/worker-entry\.mjs"/);

assert.match(migrations, /create table private\.grcon_document_files/i);
assert.match(migrations, /grcon_planned_document_snapshots/i);
assert.match(migrations, /grcon_document_vault_list/i);
assert.match(migrations, /allocation_filter/i);
assert.match(migrations, /grant execute[^;]+service_role/i);
assert.doesNotMatch(migrations, /create table if not exists public\.grcon_document_objects/i);

assert.match(emission, /vaultFileId:\s*text\(vaultSource/);
assert.match(emission, /historyClassification/);

console.log("Document Vault contracts: OK");
