"use strict";
// Saúde do Supabase (04/11/2026): a verificação de prazos vencidos estourava o tempo limite todo minuto
// e sobrecarregava o banco. Guarda as três defesas: consulta indexada, cron espaçado e cliente com backoff.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");

const migration = read("supabase/migrations/20261104185237_document_task_deadlines_indexed_evidence.sql");
assert.match(migration, /create index if not exists grcon_sigem_projection_master_key_idx[\s\S]*grcon_master_document_key\(content->'payload'->>'document'\)/);
assert.match(migration, /d\.content->>'revision_key'=t\.revision_sent/);
assert.match(migration, /s\.status in\('active','archived'\) and s\.deleted_at is null/, "mesmas versões de antes");
assert.doesNotMatch(migration, /grcon_sigem_operational_rows/, "não volta a varrer a visão com 1 milhão de linhas");

const wrangler = read("wrangler.jsonc");
assert.match(wrangler, /"\*\/15 \* \* \* \*"/);
const worker = read("cloudflare/worker-entry.mjs");
const minute = worker.slice(worker.indexOf("controller.cron === '* * * * *'"), worker.indexOf("controller.cron === '*/15 * * * *'"));
assert.ok(!minute.includes("grcon_document_task_deadlines"), "o cron de todo minuto não chama mais a verificação de prazos");
assert.match(worker, /controller\.cron === '\*\/15 \* \* \* \*'[\s\S]{0,400}grcon_document_task_deadlines/);

const cloud = read("grcon_cloud_app.js");
assert.match(cloud, /SYNC_BACKOFF_BASE_MS = 5_000/);
assert.match(cloud, /SYNC_BACKOFF_MAX_MS = 300_000/);
assert.match(cloud, /SYNC_BACKOFF_BASE_MS \* 2 \*\* \(state\.syncFailures - 1\)/);
assert.match(cloud, /pull: \(\) => runSyncCycle\(\{ force: true \}\)/, "ação do usuário ignora a espera");
assert.match(cloud, /state\.syncFailures = 0;\s*state\.syncBlockedUntil = 0;/, "sucesso zera a espera");
// Políticas de segurança (RLS) sem reavaliar auth.uid() por linha (alerta auth_rls_initplan).
const rls = read("supabase/migrations/20261104221515_rls_auth_uid_initplan.sql");
for (const policy of ["grcon_contracts_select", "grcon_notifications_select", "grcon_notification_reads_select", "grcon_notification_reads_insert", "grcon_notification_reads_update", "grcon_notification_reads_delete"]) {
  assert.ok(rls.includes(`alter policy ${policy} `), `${policy} reescrita`);
}
assert.doesNotMatch(rls.split("\n").filter((line) => !line.startsWith("--")).join("\n").replace(/\(select auth\.uid\(\)\)/g, ""), /auth\.uid\(\)/, "toda chamada a auth.uid() está dentro de (select …)");
console.log("supabase_deadline_health: OK");
