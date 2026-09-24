"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const app = read("src/react/sigem-pw/evolution/SigemPwEvolutionApp.tsx");
const hook = read("src/react/sigem-pw/evolution/hooks/useSigemPwEvolution.ts");
const adapter = read("src/react/sigem-pw/evolution/services/sigemPwEvolutionAdapter.ts");
const domain = read("src/react/sigem-pw/evolution/types/domain.ts");
const entry = read("src/react/sigem-pw/evolution/index.tsx");
const globals = read("src/react/sigem-pw/types/legacy-globals.d.ts");
const bootstrap = read("sigem_pw_dashboard_bootstrap.js");
const css = read("sigem-pw-evolution.css");
const sw = read("sw.js");
const vite = read("vite.config.ts");
const pkg = JSON.parse(read("package.json"));

assert.equal(fs.existsSync(path.join(root, "sigem_pw_evolution_app.js")), false, "UI legada da Evolução deve ser removida");

assert.match(vite, /"sigem-pw-evolution"[\s\S]*src\/react\/sigem-pw\/evolution\/index\.tsx[\s\S]*sigem-pw-evolution-app\.js/);
assert.match(pkg.scripts.build, /vite build --mode sigem-pw-evolution/);
assert.match(bootstrap, /grcon-sigem-pw-evolution-root/);
assert.match(bootstrap, /ensure\("sigem_pw_evolution_core\.js"\)/);
assert.match(bootstrap, /ensure\("react-dist\/sigem-pw-evolution-app\.js"\)/);
assert.doesNotMatch(bootstrap, /ensure\("sigem_pw_evolution_app\.js"\)/);
assert.ok(
  bootstrap.indexOf('ensure("sigem_pw_evolution_core.js")') < bootstrap.indexOf('ensure("react-dist/sigem-pw-evolution-app.js")'),
  "Core da Evolução deve carregar antes do bundle React",
);

assert.match(entry, /mountReactIsland/);
assert.match(entry, /containerId:\s*"grcon-sigem-pw-evolution-root"/);
assert.match(entry, /GrconSigemPwEvolutionUi\s*=\s*Object\.freeze/);
for (const contract of ["activate", "refresh", "state", "filteredRows", "exportFilteredRows"]) {
  assert.match(entry, new RegExp(contract));
}
assert.match(entry, /sigem-pw-evolution\.css/);

assert.match(hook, /useSyncExternalStore/);
assert.match(hook, /subscribeExternalEvents/);
assert.match(hook, /EVOLUTION_SEARCH_DEBOUNCE_MS/);
assert.match(hook, /periodSnapshots\("sigem"\)/);
assert.match(hook, /periodSnapshots\("pw"\)/);

assert.match(domain, /EVOLUTION_PAGE_SIZE\s*=\s*100/);
assert.match(domain, /EVOLUTION_SEARCH_DEBOUNCE_MS\s*=\s*180/);
assert.match(domain, /interface EvolutionUiState/);
assert.match(domain, /interface EvolutionComparison/);
assert.match(domain, /Cadastrados no SIGEM/);
assert.match(domain, /Encontrados no ProjectWise/);

assert.match(adapter, /Core\(\)\.buildLdUniverse/);
assert.match(adapter, /Core\(\)\.buildSnapshot/);
assert.match(adapter, /Core\(\)\.comparePeriod/);
assert.match(adapter, /Core\(\)\.buildDailyTimeline/);
assert.match(adapter, /History\(\)\.listSourceSnapshots\("sigem"\)/);
assert.match(adapter, /History\(\)\.listSourceSnapshots\("pw"\)/);
assert.match(adapter, /window\.GrconSigemPwDashboardUi\?\.state\?\.ld/);
assert.match(adapter, /GRCONModuleLoader\.ensure\("xlsx"\)/);
assert.match(adapter, /bookType:\s*"xlsx"/);
assert.match(adapter, /rows\.slice\(start, start \+ EVOLUTION_PAGE_SIZE\)/);
assert.match(adapter, /function currentFiltersForExport\(\)/);
assert.match(adapter, /return \{ \.\.\.state\.filters, \.\.\.state\.rawFilters \}/);

for (const label of ["Entraram no SIGEM", "Entraram no PW", "Emitidos no PW", "SIGEM novo sem PW", "Gerenciar histórico"]) {
  assert.ok(app.includes(label), "texto funcional ausente: " + label);
}
for (const id of ["spw-evo-date-start", "spw-evo-date-end", "spw-evo-filter-query", "spw-evo-filter-document-type", "spw-evo-filter-source", "spw-evo-table"]) {
  assert.ok(app.includes(id), "controle ausente: " + id);
}
assert.match(app, /data-evolution-version="react-phase-a"/);
assert.match(app, /data-evo-select/);
assert.match(app, /data-evo-row/);
assert.match(app, /role="dialog"/);
assert.match(app, /aria-live="polite"/);
assert.doesNotMatch(app, /dangerouslySetInnerHTML/);
assert.doesNotMatch(app, /\.innerHTML\s*=/);
assert.doesNotMatch(app, /insertAdjacentHTML/);

assert.match(globals, /interface SigemPwEvolutionUiApi/);
assert.match(globals, /GrconSigemPwEvolutionUi/);
assert.match(css, /#spw-evolution-section/);
assert.match(css, /@media/);
assert.match(css, /\[data-theme="dark"\]/);

assert.match(sw, /sigem-pw-evolution\.css/);
assert.match(sw, /react-dist\/sigem-pw-evolution-app\.js/);
assert.match(sw, /phase-a-sigem-pw-evolution-react1/);
assert.doesNotMatch(sw, /"sigem_pw_evolution_app\.js"/);

if (fs.existsSync(path.join(root, "react-dist/sigem-pw-evolution-app.js"))) {
  const bundle = read("react-dist/sigem-pw-evolution-app.js");
  const bytes = Buffer.byteLength(bundle);
  assert.ok(bytes < 500000, `bundle Evolução inesperadamente grande: ${bytes} bytes`);
  assert.doesNotMatch(bundle, /ExcelJS|exceljs\.min|SheetJS.*Community Edition|xlsx\.full\.min/i, "XLSX/ExcelJS não podem entrar no bundle React");
}

console.log("sigem_pw_evolution_react: OK — React/TS lazy, facade, Core/History preservados, filtros, paginação, exportação e PWA validados.");
