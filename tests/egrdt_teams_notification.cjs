"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Core = require("../egrdt_teams_notification_core.js");
const Api = require("../api/egrdt-teams-notification.js")._internal;

const record = {
  id: "history-1558",
  clientRecordId: "client-1558",
  egrdtNumber: "0130870-C1O-PGV-G-1558-2026 - eGRDT",
  generatedAt: "2026-09-17T12:00:00.000Z",
  outputType: "eGRDT final",
  files: [
    { document: "RL-5290.00-22313-91B-C1O-002", grdtRevision: "B", discipline: "DINÂMICOS", finalName: "a.pdf" },
    { document: "RL-5290.00-22313-91B-C1O-002", revision: "B", discipline: "DINÂMICOS", finalName: "a.docx" },
    { document: "RL-5290.00-22313-92A-C1O-003", revision: "0", discipline: "TUBULAÇÃO", finalName: "b.pdf" },
  ],
};

const rows = Core.documentRows(record);
assert.equal(rows.length, 2, "PDF e nativo da mesma revisão devem formar uma só linha no aviso");
assert.deepEqual(rows[0], {
  document: "RL-5290.00-22313-91B-C1O-002",
  revision: "B",
  discipline: "DINÂMICOS",
});

assert.throws(() => Core.buildPayload(record, {}), /colocada na pasta/i);
const payload = Core.buildPayload(record, {
  folderConfirmed: true,
  requestedAt: "2026-09-17T13:00:00.000Z",
  workspaceId: "workspace-1",
  confirmedBy: "Vinicio",
  confirmedByEmail: "vinicio@example.com",
  appVersion: "5.41.0",
});
assert.equal(payload.eventType, "EGRDT_READY_FOR_SIGEM");
assert.equal(payload.destination.name, "Qualidade - Documentação");
assert.deepEqual(payload.mentions.map((item) => item.displayName), ["Adriana Nojosa da Silva", "Janecleide Maria de Oliveira"]);
assert.equal(payload.egrdt.documentCount, 2);
assert.equal(payload.eventId, "egrdt-ready:client-1558");
assert.match(payload.message.tableHtml, /RL-5290\.00-22313-91B-C1O-002 · Rev\. B/);

const normalized = Api.normalizePayload(payload);
assert.equal(normalized.egrdt.number, record.egrdtNumber);
assert.equal(normalized.egrdt.items.length, 2);
assert.equal(normalized.confirmation.folderConfirmed, true);
assert.match(normalized.message.tableHtml, /<table>/);
assert.equal(Api.escapeHtml('<script>alert("x")</script>'), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
assert.throws(() => Api.normalizePayload({ ...payload, destination: { name: "Outro grupo" } }), /Destino do Teams inválido/);
assert.equal(Api.isAllowedFlowUrl("https://prod-01.brazilsouth.logic.azure.com/workflows/abc/triggers/manual/paths/invoke"), true);
assert.equal(Api.isAllowedFlowUrl("https://tenant.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/abc/triggers/manual/paths/invoke"), true);
assert.equal(Api.isAllowedFlowUrl("http://localhost:3000/steal"), false);
assert.equal(Api.isAllowedFlowUrl("https://example.com/webhook"), false);

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const historyApp = fs.readFileSync(path.join(root, "src/react/historico-egrdt/HistoricoEgrdtApp.tsx"), "utf8");
const historyAdapter = fs.readFileSync(path.join(root, "src/react/historico-egrdt/services/historicoEgrdtAdapter.ts"), "utf8");
const teamsNotificationApp = fs.readFileSync(path.join(root, "egrdt_teams_notification_app.js"), "utf8");
assert.match(html, /id="egrdt-teams-ready"/);
assert.match(html, /egrdt_teams_notification_core\.js/);
assert.match(html, /egrdt_teams_notification_app\.js/);
assert.match(app, /grcon:egrdt-generated/);
assert.match(historyApp, /data-egrdt-teams-record-id/);
assert.doesNotMatch(historyApp, /dangerouslySetInnerHTML/);
assert.match(historyAdapter, /GrconEgrdtTeamsNotification\?\.open/);
assert.match(historyAdapter, /teamsPresentation/);
assert.match(teamsNotificationApp, /buttonLabel, isSending, buttonHtml/);

console.log("OK: aviso manual de eGRDT ao Teams validado");
