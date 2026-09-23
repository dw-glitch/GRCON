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
const retomar = read("retomar.js");
const phaseB = read("history-phase-b.css");
const parity = read("docs/phase-b-historico-egrdt-parity.md");
const browserValidation = read("scripts/validar-historico-egrdt-browser.cjs");

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
assert.match(sw, /history-phase-b\.css/);
assert.match(index, /history-phase-b\.css/);
assert.doesNotMatch(sw, /"history_app\.js"/);

assert.match(index, /window\.GrconHistoryUi = Object\.freeze/);
assert.match(index, /state: Adapter\.getCompatibilityState\(\)/);
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

assert.match(app, /UiPageHeader/);
assert.match(app, /UiPanel/);
assert.match(app, /UiMetaPill/);
assert.match(app, /Gerenciar histórico/);
assert.match(app, /Limpar período/);
assert.match(app, /Filtros ativos/);
assert.match(app, /data-history-kpi-status/);
assert.match(app, /history-list-scroll/);
assert.match(app, /Exibindo/);
assert.match(app, /Mais ações/);
assert.match(app, /Preparar no SIGEM/);
assert.match(app, /Resposta de e-mail/);
assert.match(app, /Editar número/);
assert.match(app, /Versão da LD enviada/);
assert.match(app, /Revisão desta GRDT postada/);
assert.match(app, /Outra revisão postada/);
assert.match(hook, /LIST_PAGE_SIZE = 200/);
assert.match(hook, /SEARCH_DEBOUNCE_MS = 120/);
assert.match(hook, /publishCompatibilityState\(filtered, selectedId\)/);
assert.doesNotMatch(hook, /\.\.\.filters,\s*\n\s*query: debouncedQuery/, "busca não deve invalidar effectiveFilters a cada tecla");
assert.match(hook, /filters\.startDate/);
assert.match(hook, /filters\.endDate/);
assert.doesNotMatch(app, /dangerouslySetInnerHTML/);
assert.doesNotMatch(app, /innerHTML\s*=/);
assert.match(phaseB, /history-phase-b/);
assert.match(phaseB, /position:\s*sticky/);
assert.match(phaseB, /color-scheme:\s*dark/);
assert.match(phaseB, /max-height:\s*25rem/);
assert.match(phaseB, /history-phase-b-heading[\s\S]*display:\s*grid/);
assert.match(phaseB, /grid-template-areas:\s*"header manage mascot"/);
assert.match(phaseB, /history-phase-b-heading > \.grcon-mascot-context/);
assert.match(phaseB, /history-manage\s*\{[\s\S]*?position:\s*relative/);
assert.doesNotMatch(phaseB, /history-manage\s*\{[^}]*position:\s*absolute/, "a ação principal Gerenciar histórico deve participar do layout");
assert.match(phaseB, /history-manage-menu\s*\{[\s\S]*?position:\s*absolute/, "o menu interno pode permanecer ancorado ao details");
assert.match(browserValidation, /#grcon-context-mascot\[data-context="history"\]/);
assert.match(browserValidation, /intersectsRect/);
assert.match(browserValidation, /gap visual >= 8px/);
assert.match(browserValidation, /1440/);
assert.match(browserValidation, /1366/);
assert.match(browserValidation, /1024/);
assert.match(browserValidation, /768/);
assert.match(browserValidation, /620/);
assert.match(browserValidation, /430/);
assert.match(browserValidation, /390/);
assert.match(parity, /state\.filtered representa todo o recorte filtrado/);
assert.match(parity, /Power Automate\/payload\/webhook\/menções não alterados/);
assert.match(app, /teamsPresentation/);
assert.match(retomar, /GrconHistoricoEgrdtReact\?\.mounted/);
assert.match(adapter, /readPostingCache/);
assert.match(adapter, /buildWorkbookInWorker/);
assert.match(adapter, /deleteHistoryRecord/);
assert.match(adapter, /GrconEgrdtTeamsNotification/);

assert.equal(fs.existsSync(path.join(root, "history_app.js")), false, "UI legada history_app.js deve permanecer removida após a migração React");

console.log("historico_egrdt_react: contratos estruturais preservados");
