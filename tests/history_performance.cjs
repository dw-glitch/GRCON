const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "..", "history_app.js"), "utf8");

function check(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

check("Histórico lê Postagem SIGEM uma vez para montar índice do ciclo", () => {
  const matches = source.match(/Posting\?\.read\?\.\(\)/g) || [];
  assert.equal(matches.length, 1, "Posting.read não deve voltar a ser chamado por linha/cartão");
  assert.match(source, /function refreshPostingCache\(\)/);
  assert.match(source, /postingByHistoryId = new Map\(\)/);
  assert.match(source, /postingByEgrdt = new Map\(\)/);
});

check("postingRecord consulta Maps e não executa find sobre toda a fila", () => {
  const block = source.slice(source.indexOf("function postingRecord"), source.indexOf("function sortRecords"));
  assert.match(block, /postingByHistoryId\.get/);
  assert.match(block, /postingById\.get/);
  assert.match(block, /postingByEgrdt\.get/);
  assert.doesNotMatch(block, /Posting\.read/);
  assert.doesNotMatch(block, /\.find\(/);
});

check("lista grande usa carregamento incremental de 200 registros", () => {
  assert.match(source, /const LIST_PAGE_SIZE = 200/);
  assert.match(source, /state\.filtered\.slice\(0, state\.visibleLimit\)/);
  assert.match(source, /data-history-load-more/);
});

check("pesquisa usa debounce pequeno sem afetar os demais filtros", () => {
  assert.match(source, /const SEARCH_DEBOUNCE_MS = 120/);
  assert.match(source, /els\.search\.addEventListener\("input"/);
  assert.match(source, /window\.setTimeout\(render, SEARCH_DEBOUNCE_MS\)/);
  assert.match(source, /\[els\.year, els\.type, els\.postingStatus, els\.sort, els\.dateStart, els\.dateEnd, els\.periodDocumentType\]/);
});

check("métrica expõe leituras e quantidade realmente renderizada", () => {
  assert.match(source, /postingReadsLastRender/);
  assert.match(source, /renderedRecords/);
  assert.match(source, /performanceSnapshot/);
});

console.log("history_performance: 5 cenários OK");
