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

check("Histórico lê Postagem SIGEM uma vez para montar índice do ciclo", () => {
  const matches = adapter.match(/Posting\?\.read\?\.\(\)/g) || [];
  assert.equal(matches.length, 1, "Posting.read não deve voltar a ser chamado por linha/cartão");
  assert.match(adapter, /function readPostingCache\(\)/);
  assert.match(adapter, /const byHistoryId = new Map/);
  assert.match(adapter, /const byEgrdt = new Map/);
});

check("postingRecord consulta Maps e não executa find sobre toda a fila", () => {
  const block = adapter.slice(adapter.indexOf("function postingRecord"), adapter.indexOf("function filterOptions"));
  assert.match(block, /cache\.byHistoryId\.get/);
  assert.match(block, /cache\.byId\.get/);
  assert.match(block, /cache\.byEgrdt\.get/);
  assert.doesNotMatch(block, /Posting\.read/);
  assert.doesNotMatch(block, /\.find\(/);
});

check("lista grande usa carregamento incremental de 200 registros", () => {
  assert.match(hook, /LIST_PAGE_SIZE = 200/);
  assert.match(hook, /filtered\.slice\(0, visibleLimit\)/);
  assert.match(app, /data-history-load-more/);
});

check("pesquisa usa debounce de 120 ms sem afetar os demais filtros", () => {
  assert.match(hook, /SEARCH_DEBOUNCE_MS = 120/);
  assert.match(hook, /useDebouncedValue\(filters\.query, SEARCH_DEBOUNCE_MS\)/);
  assert.match(hook, /setFilter/);
  assert.match(hook, /setVisibleLimit\(LIST_PAGE_SIZE\)/);
});

check("métrica de compatibilidade continua exposta", () => {
  assert.match(adapter, /postingReadsLastRender/);
  assert.match(adapter, /renderedRecords/);
  assert.match(adapter, /getPerformanceSnapshot/);
});

console.log("history_performance: 5 cenários React OK");
