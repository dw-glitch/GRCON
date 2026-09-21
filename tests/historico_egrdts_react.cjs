"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const index = read("index.html");
const loader = read("grcon_module_loader.js");
const vite = read("vite.config.ts");
const pkg = read("package.json");
const sw = read("sw.js");
const adapter = read("src/react/historico-egrdts/services/historicoEgrdtsAdapter.ts");
const hook = read("src/react/historico-egrdts/hooks/useHistoricoEgrdts.ts");
const bootstrap = read("src/react/historico-egrdts/index.tsx");
const app = read("src/react/historico-egrdts/HistoricoEgrdtsApp.tsx");
const filters = read("src/react/historico-egrdts/components/HistoricoEgrdtsFilters.tsx");
const list = read("src/react/historico-egrdts/components/HistoricoEgrdtsList.tsx");
const detail = read("src/react/historico-egrdts/components/HistoricoEgrdtDetail.tsx");
const documents = read("src/react/historico-egrdts/components/HistoricoEgrdtDocuments.tsx");
const editor = read("src/react/historico-egrdts/components/HistoricoEgrdtNumberEditor.tsx");

assert.match(index, /id="history-module"/);
assert.match(index, /id="grcon-egrdt-history-root"/);
const historyBlock = index.slice(index.indexOf('id="history-module"'), index.indexOf('id="sigem-module"'));
assert.doesNotMatch(historyBlock, /id="history-search"|id="history-list"|id="history-detail"/, "markup legado não deve competir com React");

assert.match(vite, /"historico-egrdts"/);
assert.match(vite, /src\/react\/historico-egrdts\/index\.tsx/);
assert.match(vite, /historico-egrdts-app\.js/);
assert.match(pkg, /vite build --mode historico-egrdts/);
assert.match(pkg, /tests\/historico_egrdts_react\.cjs/);

assert.match(loader, /history:\s*\["navigation", "react-dist\/historico-egrdts-app\.js"\]/);
assert.match(loader, /GrconHistoricoEgrdtsReact/);
assert.doesNotMatch(loader, /"history_app\.js"/);
assert.match(sw, /"react-dist\/historico-egrdts-app\.js"/);
assert.doesNotMatch(sw, /"history_app\.js"/);

assert.match(bootstrap, /containerId:\s*"grcon-egrdt-history-root"/);
assert.match(bootstrap, /mountReactIsland/);
assert.match(bootstrap, /GrconHistoricoEgrdtsReact/);
assert.match(bootstrap, /GrconHistoryUi/);
assert.match(bootstrap, /Object\.defineProperties\(compatibilityState/);
assert.match(bootstrap, /selectedId/);
assert.match(bootstrap, /filtered/);
assert.match(bootstrap, /performanceSnapshot/);

assert.match(hook, /useHistoricoEgrdts/);
assert.match(adapter, /GrconHistory/);
assert.match(adapter, /GrconHistoryReport/);
assert.match(adapter, /GrconSigemPosting/);
assert.match(adapter, /GrconMacro5Flow/);
assert.match(adapter, /filterByDocumentFamily/);
assert.match(adapter, /history\(\)\.updateNumber/);
assert.match(adapter, /report\(\)\.revisionRelation/);
assert.match(adapter, /history_report_worker\.js/);
assert.match(adapter, /URL\.createObjectURL/);
assert.match(adapter, /URL\.revokeObjectURL/);

assert.match(filters, /id="history-search"/);
assert.match(filters, /id="history-year"/);
assert.match(filters, /id="history-type"/);
assert.match(filters, /id="history-posting-status"/);
assert.match(filters, /id="history-sort"/);
assert.match(filters, /id="history-date-start"/);
assert.match(filters, /id="history-date-end"/);
assert.match(filters, /id="history-period-document-type"/);
assert.match(filters, /N-1710/);
assert.match(filters, />ET</);
assert.match(filters, />CV</);

assert.match(app, /id="history-clear"/);
assert.match(list, /data-history-id/);
assert.match(list, /data-history-load-more/);
assert.match(detail, /data-history-action="prepare-sigem"/);
assert.match(detail, /data-egrdt-teams-record-id/);
assert.match(detail, /data-history-action="email-reply"/);
assert.match(detail, /data-history-action="edit"/);
assert.match(detail, /data-history-action="delete"/);
assert.match(editor, /id="history-number-input"/);
assert.match(editor, /maxLength=\{4\}/);

for (const column of [
  "Documento",
  "Arquivo original",
  "Arquivo enviado",
  "Revisão gerada na GRDT",
  "Revisão desta GRDT postada",
  "Outra revisão postada",
  "Situação na geração",
  "Alocação",
  "Versão da LD enviada",
  "Aba LD",
]) assert.match(documents, new RegExp(column));
assert.match(documents, /revisionManual/);
assert.match(documents, /revisionSuggested/);
assert.match(documents, /ldPrazo/);

for (const source of [app, filters, list, detail, documents, editor]) {
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML/);
}
assert.doesNotMatch(hook, /querySelector|innerHTML/);

const remotePosition = adapter.indexOf("await Cloud.deleteHistoryRecord(record)");
const localPosition = adapter.indexOf("history().deleteOne(record.id)", remotePosition);
assert.ok(remotePosition >= 0 && localPosition > remotePosition, "exclusão compartilhada deve ocorrer antes da local");
assert.match(adapter, /await Cloud\.clearHistory\(\)/);
assert.match(adapter, /grcon:history-updated/);
assert.match(hook, /grcon:egrdt-teams-state/);
assert.match(hook, /grcon:egrdt-teams-notified/);
assert.match(hook, /grcon:sigem-updated/);
assert.match(hook, /window\.addEventListener\("storage"/);
assert.match(hook, /window\.removeEventListener\("storage"/);

assert.equal(fs.existsSync(path.join(root, "docs/react-phase-a-egrdt-history-parity.md")), true);
console.log("historico_egrdts_react: OK — arquitetura, contratos, paridade estática, loader e PWA protegidos.");
