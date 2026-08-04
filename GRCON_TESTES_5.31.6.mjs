import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const History = require(path.join(root, "history_core.js"));
const Sequence = require(path.join(root, "egrdt_sequence.js"));
const Workbook = require(path.join(root, "grdt_workbook.js"));
const checks = [];

function check(name, fn) {
  fn();
  checks.push(name);
}

function storage(initial = []) {
  const values = new Map([[History.STORAGE_KEY, JSON.stringify(initial)]]);
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function record(id, overrides = {}) {
  return History.cleanRecord({
    id,
    clientRecordId: id,
    egrdtNumber: Sequence.baseName(Number(id.replace(/\D/g, "")) || 1, 2026),
    generatedAt: "2026-08-03T12:00:00.000Z",
    outputType: "eGRDT final",
    files: [{ document: `DOC-${id}`, finalName: `DOC-${id}.pdf` }],
    ...overrides,
  });
}

check("histórico remove registro apagado na nuvem", () => {
  const local = storage([
    record("A1", { cloudId: "cloud-a", workspaceId: "ws", syncedAt: "2026-08-03T12:01:00.000Z", syncState: "synced" }),
    record("B2", { cloudId: "cloud-b", workspaceId: "ws", syncedAt: "2026-08-03T12:01:00.000Z", syncState: "synced" }),
  ]);
  const result = History.replaceWorkspaceSnapshot([
    record("A1", { cloudId: "cloud-a", workspaceId: "ws", syncedAt: "2026-08-03T12:02:00.000Z", syncState: "synced" }),
  ], "ws", local);
  assert.equal(result.error, "");
  assert.equal(result.records.some((item) => item.cloudId === "cloud-b"), false);
  assert.equal(result.removed, 1);
});

check("histórico preserva criação local ainda não enviada", () => {
  const local = storage([record("C3", { syncState: "pending" })]);
  const result = History.replaceWorkspaceSnapshot([], "ws", local);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].syncState, "pending");
});

check("edição pendente não é apagada por uma leitura intermediária", () => {
  const pending = record("D4", {
    cloudId: "cloud-d",
    workspaceId: "ws",
    syncedAt: "2026-08-03T12:01:00.000Z",
    cloudUpdatedAt: "2026-08-03T12:01:00.000Z",
    syncState: "pending",
    egrdtNumber: Sequence.baseName(40, 2026),
  });
  const local = storage([pending]);
  const result = History.replaceWorkspaceSnapshot([
    record("D4", { cloudId: "cloud-d", workspaceId: "ws", syncedAt: "2026-08-03T12:02:00.000Z", syncState: "synced", egrdtNumber: Sequence.baseName(41, 2026) }),
  ], "ws", local);
  assert.equal(result.records[0].egrdtNumber, Sequence.baseName(40, 2026));
  assert.equal(result.records[0].syncState, "pending");
});

check("renomeação mantém identificador estável para sincronização", () => {
  const original = record("E5", { cloudId: "cloud-e", workspaceId: "ws", syncedAt: "2026-08-03T12:01:00.000Z", syncState: "synced" });
  const local = storage([original]);
  const updated = History.updateNumber(original.id, "0099", local);
  assert.equal(updated.updated, true);
  assert.equal(updated.record.clientRecordId, "E5");
  assert.equal(updated.record.syncState, "pending");
});

check("histórico preserva a identidade da reserva compartilhada", () => {
  const item = record("F6", {
    reservationRequestId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    reservationIds: ["11111111-2222-4333-8444-555555555555"],
  });
  assert.equal(item.reservationRequestId, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  assert.deepEqual(item.reservationIds, ["11111111-2222-4333-8444-555555555555"]);
});

check("prévia informa que a reserva final ocorre no compartilhado", () => {
  assert.match(Sequence.simultaneousUseWarning(), /reservado no histórico compartilhado/i);
});

check("migrações preservam exclusão lógica, reserva idempotente e retenção física autorizada", () => {
  const migration514 = fs.readFileSync(path.join(root, "SUPABASE_MIGRACAO_5.31.4.sql"), "utf8");
  const migration515 = fs.readFileSync(path.join(root, "SUPABASE_MIGRACAO_5.31.5.sql"), "utf8");
  const migration516 = fs.readFileSync(path.join(root, "SUPABASE_MIGRACAO_5.31.6.sql"), "utf8");
  assert.match(migration514, /grcon_history_workspace_egrdt_number_uidx/i);
  assert.match(migration515, /deleted_at timestamptz/i);
  assert.match(migration515, /target_request_id uuid/i);
  assert.match(migration515, /grcon_egrdt_reservations_request_item_uidx/i);
  assert.match(migration515, /grcon_egrdt_reservations_reserved_by_idx/i);
  assert.match(migration515, /history_id uuid/i);
  assert.match(migration515, /status = 'consumed'/i);
  assert.match(migration515, /revoke all on function public\.grcon_fill_profile_fields\(\) from public, anon, authenticated/i);
  assert.match(migration515, /revoke all on function public\.grcon_sync_auth_user_profile\(\) from public, anon, authenticated/i);
  assert.match(migration516, /grcon_history_storage_retention/i);
  assert.match(migration516, /pg_database_size\(current_database\(\)\)/i);
  assert.match(migration516, /pg_total_relation_size\('public\.grcon_history'::regclass\)/i);
  assert.match(migration516, /newest_position > 100/i);
  assert.match(migration516, /create or replace function public\.grcon_clear_history\(target_workspace uuid\)/i);
  assert.match(migration516, /private\.grcon_has_role\(target_workspace, array\['owner', 'admin'\]\)/i);
  assert.match(migration516, /delete from public\.grcon_history[\s\S]*where workspace_id = target_workspace/i);
  assert.match(migration516, /grant execute on function public\.grcon_clear_history\(uuid\) to authenticated/i);
  assert.match(migration516, /revoke all on function public\.grcon_clear_history\(uuid\) from public, anon/i);
});

check("aplicativo aguarda reserva antes das três gerações", () => {
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.equal((source.match(/officialNumbers\s*=\s*await reserveEgrdtSequences/g) || []).length, 3);
});

check("fluxo acelerado preenche A4 quando a LD não informa o formato", () => {
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(source, /rawResults\.forEach\(\(result\)\s*=>\s*\{[\s\S]*?const formatDefaulted = Boolean\(result\.egrdt && !result\.egrdt\.format\);[\s\S]*?if \(formatDefaulted\) result\.egrdt\.format = "A4";[\s\S]*?const logical = logicalMeta\.get\(result\.id\);/);
});

check("sincronização usa exclusão lógica e evita a segunda leitura quando não há envio", () => {
  const source = fs.readFileSync(path.join(root, "grcon_cloud_app.js"), "utf8");
  assert.match(source, /deleted_at:\s*new Date\(\)\.toISOString\(\)/);
  assert.match(source, /\.is\("deleted_at", null\)/);
  assert.doesNotMatch(source, /from\("grcon_history"\)\.delete\(\)/);
  assert.match(source, /const pushed = await pushLocalHistory\(History\.read\(\)\);\s*if \(pushed\.pushed \|\| pushed\.conflicts\) await pullCloudHistory\(\);/s);
  assert.match(source, /record\?\.syncState !== "synced"/);
});

check("cliente envia e conclui o identificador idempotente da reserva", () => {
  const source = fs.readFileSync(path.join(root, "grcon_cloud_app.js"), "utf8");
  const config = fs.readFileSync(path.join(root, "grcon_cloud_config.js"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(source, /target_request_id:\s*requestId/);
  assert.match(source, /completeEgrdtReservationRequest/);
  assert.match(config, /reservationRequestStorageKey/);
  assert.match(app, /completeEgrdtReservationRequest\(generated\)/);
});


check("limpeza compartilhada só remove o histórico local após confirmação do Supabase", () => {
  const cloud = fs.readFileSync(path.join(root, "grcon_cloud_app.js"), "utf8");
  const ui = fs.readFileSync(path.join(root, "history_app.js"), "utf8");
  assert.match(cloud, /state\.client\.rpc\("grcon_clear_history", \{ target_workspace: workspaceId \}\)/);
  const rpcPosition = cloud.indexOf('state.client.rpc("grcon_clear_history"');
  const localClearPosition = cloud.indexOf("History?.clear?.()", rpcPosition);
  assert.ok(rpcPosition >= 0 && localClearPosition > rpcPosition);
  assert.match(cloud, /\["owner", "admin"\]\.includes\(state\.membership\?\.role\)/);
  assert.match(ui, /Os registros serão apagados também do Supabase/);
  assert.match(ui, /await window\.GrconCloud\?\.clearHistory\?\.\(\)/);
});

check("atalho do cabeçalho abre o RECON sem integração de dados", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /href="https:\/\/recon-ivory\.vercel\.app\/"/i);
  assert.match(html, /target="_blank"/i);
  assert.match(html, /rel="noopener noreferrer"/i);
});

check("manifesto declara o tamanho real do ícone", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const png = fs.readFileSync(path.join(root, manifest.icons[0].src));
  assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, manifest.icons[0].sizes);
});

check("service worker publica o cache isolado da versão 5.31.6", () => {
  const source = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.match(source, /grcon-v5\.31\.6/);
  assert.match(source, /networkFirst/);
});

{
  const items = Array.from({ length: 48 }, (_, index) => {
    const suffix = String(index + 1).padStart(3, "0");
    return {
      document: `0130870-C1O-PGV-G-TESTE-${suffix}`,
      revision: "0",
      title: `DOCUMENTO DE VALIDAÇÃO OPERACIONAL ${suffix}`,
      fileName: `0130870-C1O-PGV-G-TESTE-${suffix}_0001.pdf`,
      format: "A4",
      discipline: "GERAL",
      documentType: "DOCUMENTO",
      purpose: "PARA INFORMAÇÃO",
      databook: "",
    };
  });
  const bytes = await Workbook.build(items);
  const verified = await Workbook.verify(bytes, items);
  assert.equal(Workbook.isLegacyXls(bytes), true);
  assert.equal(verified.valid, true);
  assert.equal(verified.checkedRows, 48);
  await assert.rejects(() => Workbook.build([...items, { ...items[0] }]), /no máximo 48/i);
  checks.push("gerador produz e reabre XLS BIFF8 com 48 linhas e bloqueia a 49ª");
}

check("todos os JavaScripts têm sintaxe válida", () => {
  const scripts = fs.readdirSync(root).filter((name) => /\.(?:m?js)$/.test(name));
  const failures = [];
  for (const name of scripts) {
    const result = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
    if (result.status !== 0) failures.push(`${name}: ${result.stderr.trim()}`);
  }
  assert.deepEqual(failures, []);
});

console.log(JSON.stringify({ version: "5.31.6", passed: true, checks: checks.length, names: checks }, null, 2));
