const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const adapter = fs.readFileSync(path.join(root, "src/react/historico-egrdts/services/historicoEgrdtsAdapter.ts"), "utf8");
const hook = fs.readFileSync(path.join(root, "src/react/historico-egrdts/hooks/useHistoricoEgrdts.ts"), "utf8");
const list = fs.readFileSync(path.join(root, "src/react/historico-egrdts/components/HistoricoEgrdtsList.tsx"), "utf8");

function check(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

check("Histórico lê Postagem SIGEM uma vez por ciclo de refresh", () => {
  const directReads = adapter.match(/posting\(\)\?\.read\?\.\(\)/g) || [];
  assert.equal(directReads.length, 1, "Posting.read deve ficar centralizado em readPostings");
  const hookReads = hook.match(/Adapter\.readPostings\(\)/g) || [];
  assert.equal(hookReads.length, 1, "o hook deve ler postings uma vez dentro de refresh");
  assert.match(hook, /const nextPostings = Adapter\.readPostings\(\)/);
  assert.doesNotMatch(hook, /useState\(\(\) => Adapter\.readPostings\(\)\)/);
});

check("postingRecord usa índices O(1) sem find na fila", () => {
  const block = adapter.slice(adapter.indexOf("function postingRecord"), adapter.indexOf("function parsedNumber"));
  assert.match(block, /indexes\.byHistoryId\.get/);
  assert.match(block, /indexes\.byId\.get/);
  assert.match(block, /indexes\.byEgrdt\.get/);
  assert.doesNotMatch(block, /\.find\(/);
  assert.match(adapter, /const byHistoryId = new Map/);
  assert.match(adapter, /const byEgrdt = new Map/);
});

check("lista grande mantém carregamento incremental de 200 registros", () => {
  assert.match(adapter, /const LIST_PAGE_SIZE = 200/);
  assert.match(hook, /filtered\.slice\(0, visibleLimit\)/);
  assert.match(hook, /current \+ Adapter\.LIST_PAGE_SIZE/);
  assert.match(list, /data-history-load-more/);
});

check("pesquisa React preserva debounce de 120 ms", () => {
  assert.match(adapter, /const SEARCH_DEBOUNCE_MS = 120/);
  assert.match(hook, /window\.setTimeout\(\(\) => \{/);
  assert.match(hook, /Adapter\.SEARCH_DEBOUNCE_MS/);
  assert.match(hook, /setFilters\(\(current\).*query: searchInput/s);
});

check("fachada de performance preserva métricas de diagnóstico", () => {
  for (const field of ["lastRenderMs", "postingReadsLastRender", "renderedRecords", "totalFiltered", "postingCount", "totalRecords"]) {
    assert.match(hook + adapter, new RegExp(field));
  }
});

console.log("history_performance: 5 cenários React OK");
