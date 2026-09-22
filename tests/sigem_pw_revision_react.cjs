"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const app = read("src/react/sigem-pw/SigemPwDashboardApp.tsx");
const index = read("src/react/sigem-pw/index.tsx");
const section = read("src/react/sigem-pw/revision/SigemPwRevisionSection.tsx");
const hook = read("src/react/sigem-pw/revision/hooks/useSigemPwRevision.ts");
const adapter = read("src/react/sigem-pw/revision/services/sigemPwRevisionAdapter.ts");
const domain = read("src/react/sigem-pw/revision/types/domain.ts");
const cards = read("src/react/sigem-pw/revision/components/SigemPwRevisionCards.tsx");
const filters = read("src/react/sigem-pw/revision/components/SigemPwRevisionFilters.tsx");
const table = read("src/react/sigem-pw/revision/components/SigemPwRevisionTable.tsx");
const pager = read("src/react/sigem-pw/revision/components/SigemPwRevisionPager.tsx");
const globals = read("src/react/sigem-pw/types/legacy-globals.d.ts");
const bootstrap = read("sigem_pw_dashboard_bootstrap.js");
const css = read("sigem-pw-revision.css");
const sw = read("sw.js");

assert.match(app, /<SigemPwRevisionSection\s*\/>/);
assert.match(index, /sigemPwRevisionAdapter/);
assert.match(index, /GrconSigemPwRevisionUi\s*=\s*Object\.freeze/);
assert.match(index, /filteredRows:\s*\(\)\s*=>\s*sigemPwRevisionAdapter\.filteredRows/);
assert.match(index, /exportFilteredRows:\s*\(\)\s*=>\s*sigemPwRevisionAdapter\.exportFilteredRows/);
assert.match(index, /sigem-pw-revision\.css/);

assert.match(section, /id="spw-revision-section"/);
assert.match(section, /Situação das Revisões/);
assert.match(section, /Carregue as bases para analisar as revisões/);
assert.match(section, /Comparando revisões SIGEM × PW/);
assert.match(section, /Exportar lista filtrada/);
assert.match(section, /Exportar Excel/);
assert.match(section, /documentos comparáveis/);
assert.match(section, /Compare a revisão encontrada no SIGEM com a situação atual no ProjectWise/);
assert.match(section, /role="progressbar"/);
assert.match(section, /Deslize horizontalmente para ver todas as colunas/);
assert.match(section, /aria-live="polite"/);

assert.match(hook, /useSyncExternalStore/);
assert.match(hook, /REVISION_SEARCH_DEBOUNCE_MS/);
assert.match(hook, /window\.setTimeout/);
assert.match(hook, /state\.rawSearch/);
assert.match(hook, /state\.rawDocumentList/);
assert.match(hook, /useMemo[\s\S]*sigemPwRevisionAdapter\.filteredRows/);

assert.match(domain, /REVISION_PAGE_SIZE\s*=\s*100/);
assert.match(domain, /REVISION_SEARCH_DEBOUNCE_MS\s*=\s*180/);
assert.match(domain, /interface RevisionAnalysis/);
assert.match(domain, /interface RevisionCounts/);
assert.match(domain, /interface RevisionRow/);
assert.match(domain, /interface RevisionFilters/);
assert.match(domain, /interface RevisionHistoryItem/);
assert.match(domain, /interface RevisionMetrics/);
assert.match(domain, /interface RevisionUiState/);

assert.match(adapter, /analyzeAsync/);
assert.match(adapter, /chunkSize:\s*350/);
assert.match(adapter, /analysisGeneration/);
assert.match(adapter, /isCurrent:/);
assert.match(adapter, /generation\s*!==\s*state\.analysisGeneration/);
assert.match(adapter, /Core\(\)\.filterRows/);
assert.match(adapter, /Core\(\)\.historyForRows/);
assert.match(adapter, /Core\(\)\.rank/);
assert.match(adapter, /dashboardModel\(\)/);
assert.doesNotMatch(adapter, /JSON\.parse\(JSON\.stringify/);
assert.match(adapter, /search:\s*state\.rawSearch/);
assert.match(adapter, /documentList:\s*state\.rawDocumentList/);
assert.match(adapter, /GRCONModuleLoader\.ensure\("report"\)/);
assert.match(adapter, /sigem_pw_revision_report\.js/);
assert.match(adapter, /buildWorkbook/);
assert.match(adapter, /function clearFilters\(\)/);
assert.match(adapter, /state\.filters\s*=\s*EMPTY_REVISION_FILTERS\(\)/);
assert.match(adapter, /state\.rawSearch\s*=\s*""/);
assert.match(adapter, /state\.rawDocumentList\s*=\s*""/);

assert.match(cards, /Atualizados/);
assert.match(cards, /PW em revisão anterior/);
assert.match(cards, /Não localizados no PW/);
assert.match(cards, /Aguardando emissão no PW/);
assert.match(cards, /Outras divergências/);
assert.match(cards, /c\.pwAhead\s*\+\s*c\.review/);
assert.match(cards, /aria-pressed/);

assert.match(filters, /spw-rev-filter-situation/);
assert.match(filters, /spw-rev-filter-class/);
assert.match(filters, /spw-rev-filter-sigem-rev/);
assert.match(filters, /spw-rev-filter-pw-rev/);
assert.match(filters, /spw-rev-filter-sigem-status/);
assert.match(filters, /spw-rev-filter-pw-status/);
assert.match(filters, /spw-rev-search/);
assert.match(filters, /spw-rev-document-list/);
assert.match(filters, /Mais filtros/);
assert.match(filters, /Pesquisa em lote/);
assert.match(filters, /Limpar filtros/);
assert.match(filters, /<details className="spw-rev-advanced">/);

[
  "Documento", "Classe", "Rev. SIGEM", "Status SIGEM", "Rev. PW",
  "Status PW", "Última emissão PW", "Situação", "Detalhes",
].forEach((label) => assert.ok(table.includes(label), "coluna ausente: " + label));
assert.match(table, /Por quê\?/);
assert.match(table, /SIGEM — revisões encontradas/);
assert.match(table, /ProjectWise — revisões encontradas/);
assert.match(table, /Por que esta situação\?/);
assert.ok(table.includes("Código SIGEM"));
assert.ok(table.includes("Código PW"));
assert.ok(table.includes("EAP"));
assert.ok(table.includes("Tipo"));
assert.ok(table.includes("Revisão SIGEM"));
assert.ok(table.includes("Revisões PW"));
assert.ok(table.includes("Critério"));

assert.match(pager, /Anterior/);
assert.match(pager, /Página/);
assert.match(pager, /Próxima/);
assert.match(pager, /start/);
assert.match(pager, /pageSize/);

const reactUi = [section, hook, cards, filters, table, pager].join("\n");
assert.doesNotMatch(reactUi, /dangerouslySetInnerHTML/);
assert.doesNotMatch(reactUi, /\.innerHTML\s*=/);
assert.doesNotMatch(reactUi, /insertAdjacentHTML/);
assert.doesNotMatch(reactUi, /querySelector\(/);
assert.doesNotMatch(reactUi, /addEventListener\(/);

assert.match(globals, /interface SigemPwRevisionCoreApi/);
assert.match(globals, /interface SigemPwRevisionUiApi/);
assert.match(globals, /state:\s*RevisionUiState/);
assert.match(globals, /filteredRows\(\):\s*RevisionRow\[\]/);
assert.match(globals, /exportFilteredRows\(\):\s*Promise<number>/);
assert.match(globals, /interface SigemPwRevisionReportApi/);

assert.match(bootstrap, /afterFirstPaint/);
assert.match(bootstrap, /GrconSigemPwRevisionUi\?\.activate/);
assert.doesNotMatch(bootstrap, /ensure\("sigem_pw_revision_section\.js"\)/);
assert.match(bootstrap, /ensure\("sigem_pw_revision_core\.js"\)/);

assert.match(css, /#spw-revision-section/);
assert.match(css, /@media\(max-width:1250px\)/);
assert.match(css, /@media\(max-width:850px\)/);
assert.match(css, /@media\(max-width:560px\)/);
assert.match(css, /grid-template-columns:\s*repeat\(5/);
assert.match(css, /spw-rev-advanced/);
assert.match(css, /spw-rev-scroll-hint/);
assert.match(css, /spw-rev-progress-track/);
assert.match(css, /\[data-theme="dark"\]/);

assert.match(sw, /sigem-pw-revision\.css/);
assert.match(sw, /phase-b-sigem-pw-revision-ui1/);
assert.doesNotMatch(sw, /"sigem_pw_revision_section\.js"/);

console.log("sigem_pw_revision_react: OK — React/TS, hook, adapter, facade, deferred, paginação e lazy report validados.");
