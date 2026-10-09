const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const History = require("../history_core.js");
const cloud = read("grcon_cloud_app.js");
const react = read("src/react/historico-egrdt/HistoricoEgrdtApp.tsx");
const adapter = read("src/react/historico-egrdt/services/historicoEgrdtAdapter.ts");
const hook = read("src/react/historico-egrdt/hooks/useHistoricoEgrdt.ts");
const reportSource = read("history_report.js");
const migration = read("supabase/migrations/20261009160000_history_individual_file_removal.sql");

const docA = { document: "RHDD-001", revision: "0", finalName: "RHDD-001.pdf", allocation: "A-1" };
const docB = { document: "RHDD-002", revision: "A", finalName: "RHDD-002.pdf", allocation: "A-2" };
const original = History.cleanRecord({
  id: "GRDT-123|2026-10-09", egrdtNumber: "GRDT-123",
  generatedAt: "2026-10-09T12:00:00Z", files: [docA, docB],
  removedFiles: [],
});
assert.equal(original.fileCount, 2);
assert.equal(original.documentCount, 2);
const removed = History.cleanRecord({
  ...original, files: [docB],
  removedFiles: [{
    id: "a1356b44-e72a-4114-a387-39811c217371", file: docA,
    reason: "Documento incluído por engano",
    removedAt: "2026-10-09T13:00:00Z", removedBy: "test-user",
  }],
});
assert.equal(removed.fileCount, 1, "somente um arquivo ativo");
assert.equal(removed.documentCount, 1);
assert.equal(removed.files[0].document, "RHDD-002", "outro documento intacto");
assert.equal(removed.removedFiles.length, 1, "snapshot auditável mantido");
assert.equal(removed.removedFiles[0].file.document, "RHDD-001");
assert.equal(History.filter([removed], "RHDD-001").length, 0, "retirado não retorna na consulta operacional");
assert.equal(History.summary([removed]).documents, 1, "indicador conta apenas documento ativo");
const restored = History.cleanRecord({ ...removed, files: [docA, docB], removedFiles: [] });
assert.equal(restored.documentCount, 2);
assert.deepEqual(restored.files.map(f => f.document), ["RHDD-001", "RHDD-002"]);
const empty = History.cleanRecord({ ...removed, files: [], removedFiles: removed.removedFiles });
assert.equal(empty.documentCount, 0);
assert.equal(empty.fileCount, 0);
assert.equal(empty.egrdtNumber, original.egrdtNumber, "eGRDT permanece existente mesmo vazia");

// Segurança não depende de ocultar botões: a RPC valida papel autenticado,
// workspace, identidade da ocorrência e versão da linha em transação.
for (const fragment of [
  "private.grcon_has_role(target_workspace, array['owner','admin'])",
  "where id=target_history_id and workspace_id=target_workspace and deleted_at is null",
  "for update;",
  "h.updated_at is distinct from expected_updated_at",
  "event_name := 'history_file_removed'",
  "event_name := 'history_file_restored'",
  "grcon_audit_events",
  "jsonb_set",
  "grant execute on function public.grcon_history_file_action",
]) assert.ok(migration.includes(fragment), "migration sem " + fragment);
assert.match(cloud, /state\.client\.rpc\("grcon_history_file_action"/);
assert.match(reportSource, /buildRemovedAuditWorkbook/);
assert.match(reportSource, /Documentos removidos/);
assert.match(react, /Auditoria de removidos/);
assert.match(cloud, /manageHistoryFile,/);
assert.match(cloud, /if \(!canManageHistory\(\)\)/);
assert.match(adapter, /canManageHistoryFile/);
assert.match(hook, /submitRemoval/);
assert.match(hook, /restoreFile/);
assert.match(react, /Remover do histórico/);
assert.match(react, /Restaurar/);
assert.match(react, /Situação dos documentos no histórico/);
assert.match(react, /Emissão cancelada/);
console.log("Histórico: retirada/restauração individual e verificações de integridade OK.");
