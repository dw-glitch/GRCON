const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const adapter = fs.readFileSync(path.join(root, "src/react/historico-egrdt/services/historicoEgrdtAdapter.ts"), "utf8");
const hook = fs.readFileSync(path.join(root, "src/react/historico-egrdt/hooks/useHistoricoEgrdt.ts"), "utf8");
const app = fs.readFileSync(path.join(root, "src/react/historico-egrdt/HistoricoEgrdtApp.tsx"), "utf8");

function check(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

check("Histórico não consulta a fila da Postagem SIGEM para montar a UI", () => {
  const matches = adapter.match(/Posting\?\.read\?\.\(\)/g) || [];
  assert.equal(matches.length, 0, "Histórico não deve depender da fila de postagem aposentada");
  assert.doesNotMatch(adapter, /function readPostingCache\(\)/);
});

check("relação de revisão usa somente os dados registrados na própria eGRDT", () => {
  const block = adapter.slice(adapter.indexOf("function revisionRelation"), adapter.indexOf("function filterOptions"));
  assert.match(block, /generated/);
  assert.doesNotMatch(block, /Posting/);
  assert.doesNotMatch(block, /postingRecord/);
});

check("lista grande usa carregamento incremental de 50 registros", () => {
  assert.match(hook, /LIST_PAGE_SIZE = 50/);
  assert.match(hook, /filtered\.slice\(0, visibleLimit\)/);
  assert.match(app, /data-history-load-more/);
});

check("pesquisa usa debounce de 120 ms sem afetar os demais filtros", () => {
  assert.match(hook, /SEARCH_DEBOUNCE_MS = 120/);
  assert.match(hook, /useDebouncedValue\(filters\.query, SEARCH_DEBOUNCE_MS\)/);
  assert.match(hook, /setFilter/);
  assert.match(hook, /setVisibleLimit\(LIST_PAGE_SIZE\)/);
});

check("métrica de compatibilidade continua exposta sem contador legado de postagem", () => {
  assert.doesNotMatch(adapter, /postingReadsLastRender/);
  assert.match(adapter, /renderedRecords/);
  assert.match(adapter, /getPerformanceSnapshot/);
});

console.log("history_performance: 5 cenários React OK");
