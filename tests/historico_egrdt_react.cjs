const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const html = read("index.html");
const loader = read("grcon_module_loader.js");
const sw = read("sw.js");
const vite = read("vite.config.ts");
const pkg = JSON.parse(read("package.json"));
const index = read("src/react/historico-egrdt/index.tsx");
const app = read("src/react/historico-egrdt/HistoricoEgrdtApp.tsx");
const hook = read("src/react/historico-egrdt/hooks/useHistoricoEgrdt.ts");
const adapter = read("src/react/historico-egrdt/services/historicoEgrdtAdapter.ts");

assert.match(html, /id="history-module"/);
assert.match(html, /id="grcon-history-root"/);
assert.doesNotMatch(html, /id="history-list"/, "a UI estática legada não deve continuar duplicada no HTML");

assert.match(vite, /"historico-egrdt"/);
assert.match(vite, /historico-egrdt-app\.js/);
assert.match(pkg.scripts.build, /--mode historico-egrdt/);

assert.match(loader, /react-dist\/historico-egrdt-app\.js/);
assert.match(loader, /GrconHistoricoEgrdtReact/);
assert.doesNotMatch(loader, /history_app\.js/);

assert.match(sw, /react-dist\/historico-egrdt-app\.js/);
assert.match(sw, /phase-a-egrdt-history-react1/);
assert.doesNotMatch(sw, /"history_app\.js"/);

assert.match(index, /window\.GrconHistoryUi = Object\.freeze/);
assert.match(index, /performanceSnapshot/);
assert.match(index, /GrconHistoricoEgrdtReact/);

[
  "history-search",
  "history-year",
  "history-type",
  "history-posting-status",
  "history-sort",
  "history-date-start",
  "history-date-end",
  "history-period-document-type",
  "history-export-period",
  "history-summary",
  "history-list",
  "history-empty",
  "history-detail",
  "history-clear",
].forEach((id) => assert.match(app, new RegExp(`id=["']${id}["']`), `controle ausente: ${id}`));

assert.match(app, /Preparar no SIGEM/);
assert.match(app, /Resposta de e-mail/);
assert.match(app, /Editar número/);
assert.match(app, /Versão da LD enviada/);
assert.match(app, /Revisão desta GRDT postada/);
assert.match(app, /Outra revisão postada/);
assert.match(hook, /LIST_PAGE_SIZE = 200/);
assert.match(hook, /SEARCH_DEBOUNCE_MS = 120/);
assert.match(adapter, /readPostingCache/);
assert.match(adapter, /buildWorkbookInWorker/);
assert.match(adapter, /deleteHistoryRecord/);
assert.match(adapter, /GrconEgrdtTeamsNotification/);

assert.equal(fs.existsSync(path.join(root, "history_app.js")), false, "UI legada history_app.js deve ser removida após paridade");

console.log("historico_egrdt_react: contratos estruturais preservados");
