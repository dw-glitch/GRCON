"use strict";
// Resultado da triagem: faixa de filtros primeiro, faixa de ações depois, e os
// três controles de leitura da tabela agrupados em "Exibição". Os elementos são
// movidos (mesmos ids), nunca recriados, para não perder eventos nem seleção.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const js = read("grcon-ui-fix.js");
const css = read("grcon-ui-fix.css");
const html = read("index.html");

assert.match(js, /function installFilterAndActionBars\(\)/);
assert.match(js, /\[count, sheet, searchBox\]\.filter\(Boolean\)\.forEach\(\(node\) => filters\.prepend\(node\)\)/, "busca, aba e contagem vão para a faixa de filtros");
assert.match(js, /toolbar\.before\(filters\)/, "filtros vêm antes das ações");
assert.match(js, /panel\.append\(toggle, density, group\)/, "controles de exibição agrupados");
assert.doesNotMatch(js, /cloneNode|innerHTML\s*=\s*[^;]*search/, "nada é clonado ou recriado");
assert.match(js, /installToolbarBreaks\(\);\s*installFilterAndActionBars\(\);\s*installFilterBar\(\);/, "ordem de instalação");
assert.match(css, /\.grcon-fix-filters > \.search-box/);
assert.match(css, /\.grdt-view-options-panel/);
// Todos os ids operacionais continuam no HTML.
for (const id of ["search", "sheet-filter", "p1-shown-count", "p1-columns-toggle", "triage-density", "triage-group-toggle", "triage-column-manager", "triage-sort", "triage-clear-all", "selected-count", "batch-egrdt", "export-zip", "triage-operational-filter"]) {
  assert.ok(html.includes(`id="${id}"`), `${id} continua no HTML`);
}
console.log("grdt_filter_bar: OK");
