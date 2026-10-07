"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Dashboard = require(path.join(root, "sigem_pw_dashboard_core.js"));
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

const et = (id) => `C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-${id}`;

(function sigemKpiUsesTheExactDetailedCollection() {
  const sigem = [
    { document: et("100001"), revision: "0", status: "Postado", modifiedAt: "2026-10-01T10:00:00Z" },
    { document: et("100001"), revision: "A", status: "Em análise", modifiedAt: "2026-10-02T10:00:00Z" },
    { document: et("100002"), revision: "0", status: "Postado", modifiedAt: "2026-10-03T10:00:00Z" },
  ];
  const pw = [
    { document: et("100001"), revision: "0", state: "Liberado", lastEmission: "Sim" },
    { document: et("100002"), revision: "0", state: "Cadastrado", lastEmission: "Previsto" },
  ];
  const result = Dashboard.aggregate(sigem, pw);
  assert.equal(result.summary.sigem, 3);
  assert.equal(result.lists.sigem.length, result.summary.sigem, "KPI SIGEM deve ser exatamente o tamanho da lista SIGEM");
  assert.equal(new Set(result.lists.sigem.map((row) => row.key)).size, 3, "documento + revisão deve permanecer ocorrência independente");
  assert.deepEqual(result.lists.sigem.filter((row) => row.document === et("100001")).map((row) => row.revision), ["0", "A"]);
  assert.equal(result.lists.sigem.find((row) => row.revision === "A").sigemDate, "2026-10-02T10:00:00Z");
})();

(function dashboardKeepsKpiImmutableAndFiltersOnlyTheDetail() {
  const adapter = read("src/react/sigem-pw/services/sigemPwDashboardAdapter.ts");
  assert.match(adapter, /state\.result = state\.aggregates\.all/);
  assert.match(adapter, /state\.filters\.documentClass/);
  assert.match(adapter, /state\.filters\.revision/);
  assert.match(adapter, /state\.filters\.sigemStatus/);
  assert.match(adapter, /state\.filters\.pwPresence/);
  assert.match(adapter, /openSigemDetails[\s\S]*setActiveList\("sigem"\)/);
  assert.match(adapter, /"Existe no PW"/);
  assert.match(adapter, /"Data SIGEM"/);
  assert.match(adapter, /"LD"/);
  assert.match(adapter, /bases\.sigem = EMPTY_BASE\(\)[\s\S]*SIGEM_BASE_KEY/, "sem base compartilhada ativa, cache local do Dashboard deve ser esvaziado");
})();

(function sharedHistoryIsAuthoritativeAndDeletionIsTraceable() {
  const app = read("shared_sigem_query_app.js");
  const migration = read("supabase/migrations/20261007143000_shared_sigem_history_management.sql");
  assert.match(app, /async function listHistory\(\)/);
  assert.match(app, /async function activateSnapshot\(snapshotId\)/);
  assert.match(app, /async function deleteSnapshot\(snapshotId\)/);
  assert.match(app, /state\.shared = null; indexedShared = null; state\.stale = false; state\.error = "";/);
  assert.doesNotMatch(app, /if \(!meta\?\.snapshot_id\) \{ state\.stale = false; state\.error = ""; return current\(\); \}/);

  assert.match(migration, /add column if not exists deleted_at timestamptz/);
  assert.match(migration, /grcon_sigem_query_history/);
  assert.match(migration, /grcon_sigem_query_activate/);
  assert.match(migration, /grcon_sigem_query_delete/);
  assert.match(migration, /private\.grcon_has_role\(target_workspace,array\['owner'\]\)/);
  assert.match(migration, /set status=case when status='active' then 'archived' else status end,[\s\S]*deleted_at=now\(\),deleted_by=auth\.uid\(\)/);
  assert.match(migration, /order by coalesce\(s\.published_at,s\.created_at\) desc/);
  assert.doesNotMatch(migration, /delete from private\.grcon_sigem_query_snapshots\s+where id=target_snapshot/i, "exclusão compartilhada deve preservar snapshot para rastreabilidade");
})();

(function historyUiShowsOperationalMetadataAndSafeActions() {
  const dialog = read("src/react/sigem-pw/components/SigemPwBaseHistoryDialog.tsx");
  assert.match(dialog, /uniqueDocumentCount/);
  assert.match(dialog, /etCount/);
  assert.match(dialog, /n1710Count/);
  assert.match(dialog, /createdByName/);
  assert.match(dialog, /Selecionar como atual/);
  assert.match(dialog, /spw-danger-button/);
  assert.match(dialog, /Nenhuma Consulta Geral ativa/);
})();

console.log("sigem_pw_shared_history_kpi: OK — histórico compartilhado gerenciável e KPI SIGEM auditável sem lógica paralela.");
