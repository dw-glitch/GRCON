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
assert.equal(normalized.message.adaptiveCard.version, "1.2");
assert.equal(normalized.message.mascot.sourcePath, "/assets/mascot/grcon-mascot-teams-thumbsup.png");
assert.match(normalized.message.mascot.url, /^https:\/\//);
assert.match(normalized.message.fallbackText, /eGRDT pronta para postagem/);
assert.doesNotMatch(normalized.message.fallbackText, /Qualidade - Documentação|Favor realizar a postagem no SIGEM/i);
const cardJson = JSON.stringify(normalized.message.adaptiveCard);
assert.match(cardJson, /Mascote GRCON dando joia/);
assert.match(cardJson, /RL-5290\.00-22313-91B-C1O-002/);
assert.match(cardJson, /DINÂMICOS/);
assert.doesNotMatch(cardJson, /Qualidade - Documentação|Favor realizar a postagem no SIGEM/i);
assert.match(cardJson, /Enviado pelo GRCON/);
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
assert.match(teamsNotificationApp, /Avisar equipe no Teams/);
const mascotPath = path.join(root, "assets", "mascot", "grcon-mascot-teams-thumbsup.png");
assert.equal(fs.existsSync(mascotPath), true, "asset PNG do mascote precisa existir no pacote");
const mascotPng = fs.readFileSync(mascotPath);
assert.deepEqual([...mascotPng.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "asset do mascote precisa ter assinatura PNG válida");
let cursor = 8;
let sawIend = false;
while (cursor + 12 <= mascotPng.length) {
  const chunkLength = mascotPng.readUInt32BE(cursor);
  const chunkEnd = cursor + 12 + chunkLength;
  assert.ok(chunkEnd <= mascotPng.length, "asset PNG do mascote não pode estar truncado");
  if (mascotPng.toString("ascii", cursor + 4, cursor + 8) === "IEND") {
    sawIend = true;
    assert.equal(chunkLength, 0, "bloco IEND do PNG deve estar íntegro");
    assert.equal(chunkEnd, mascotPng.length, "PNG não deve conter dados incompletos após IEND");
    break;
  }
  cursor = chunkEnd;
}
assert.equal(sawIend, true, "asset PNG do mascote precisa terminar com IEND");

async function testTeamsRendering() {
  const Worker = (await import('../cloudflare/worker.mjs'))._internal;
  const publicUrl = 'https://grcon-cloudflare.grcon-qualidade.workers.dev/assets/mascot/grcon-mascot-teams-thumbsup.png';
  const oldUrl = 'https://raw.githubusercontent.com/dw-glitch/GRCON/034c4270f0e7585ba77010f26e4880c128c934e0/assets/mascot/grcon-mascot-teams-thumbsup.png';
  const previous = process.env.GRCON_TEAMS_MASCOT_URL;
  try {
    for (const candidate of ['', oldUrl, 'http://localhost/mascot.png', 'https://user:password@example.com/mascot.png', 'not-a-url']) {
      process.env.GRCON_TEAMS_MASCOT_URL = candidate;
      assert.equal(Api.resolveMascotUrl(), publicUrl, 'Node deve evitar imagem do repositório privado, inclusive em configuração antiga');
      assert.equal(Worker.resolveMascotUrl({GRCON_TEAMS_MASCOT_URL: candidate}), publicUrl, 'Worker deve usar a mesma imagem pública');
    }
    const custom = 'https://cdn.example.com/grcon.png';
    process.env.GRCON_TEAMS_MASCOT_URL = custom;
    assert.equal(Api.resolveMascotUrl(), custom);
    assert.equal(Worker.resolveMascotUrl({GRCON_TEAMS_MASCOT_URL: custom}), custom);
    delete process.env.GRCON_TEAMS_MASCOT_URL;
    const nodePayload = Api.normalizePayload(payload);
    const workerPayload = Worker.normalizePayload(payload, {});
    assert.deepEqual(workerPayload.message.adaptiveCard, nodePayload.message.adaptiveCard, 'Node e Cloudflare devem gerar o mesmo cartão');
    const card = workerPayload.message.adaptiveCard;
    assert.equal(card.msteams.width, 'Full');
    const images = card.body.filter(block => block.type === 'Image');
    assert.equal(images.length, 1);
    assert.equal(images[0].url, publicUrl);
    assert.equal(images[0].width, '64px');
    assert.equal(images[0].height, '80px');
    assert.equal(card.body.some(block => block.type === 'ColumnSet'), false, 'Mascote indisponível não pode espremer os dados em outra coluna');
    const readableText = card.body.filter(block => block.type !== 'Image');
    assert.ok(readableText.some(block => block.text === record.egrdtNumber && block.wrap));
    for (const row of payload.egrdt.items) {
      assert.ok(readableText.some(block => block.items?.some(item => item.text.includes(row.document) && item.wrap)), 'Documento/revisão deve permanecer no cartão quando a imagem falha');
    }
    // Power Automate may replace msteams while adding mentions. Layout must
    // remain independent of Full width and keep compatibility with actions.
    const {interactiveCard} = await import('../cloudflare/teams-traceability.mjs');
    const interactive = interactiveCard(workerPayload, {id:'attempt', workspace_id:'workspace', contract_code:'UHDT-D', expires_at:'2026-11-01T12:00:00Z', documents:payload.egrdt.items});
    assert.ok(interactive.actions.some(action => action.title.includes('Postado')));
    assert.equal(interactive.body.filter(block => block.type === 'TextBlock' && payload.egrdt.items.some(row => block.text.includes(row.document))).length, 2);
  } finally {
    if (previous === undefined) delete process.env.GRCON_TEAMS_MASCOT_URL;
    else process.env.GRCON_TEAMS_MASCOT_URL = previous;
  }
  const headers = fs.readFileSync(path.join(root, 'cloudflare/_headers'), 'utf8');
  const mascotRule = headers.split('/assets/mascot/grcon-mascot-teams-thumbsup.png\n')[1]?.split('\n\n')[0];
  assert.match(mascotRule || '', /! Cross-Origin-Resource-Policy/);
  assert.match(mascotRule || '', /Access-Control-Allow-Origin: \*/);
  assert.match(headers.split('\n\n')[0], /Cross-Origin-Resource-Policy: same-origin/, 'Demais assets devem manter a política atual');
  console.log('OK: aviso manual, imagem pública, layout resiliente e paridade Node/Cloudflare validados');
}
testTeamsRendering().catch(error => { console.error(error); process.exitCode = 1; });
