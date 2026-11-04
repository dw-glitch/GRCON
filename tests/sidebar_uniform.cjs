"use strict";
// Menu lateral uniforme: um título por linha; a descrição vira dica e continua
// acessível. Módulos que inserem botões depois do início também recebem a dica.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const css = read("grcon-final.css");
const appUi = read("app-ui.js");
assert.match(css, /\.ops-sidebar \.ops-nav-button small\s*\{[^}]*clip: rect\(0 0 0 0\)/, "descrição escondida só visualmente (continua para leitores de tela)");
assert.match(css, /\.ops-sidebar \.ops-nav-button\s*\{[^}]*min-height: 44px/, "altura uniforme");
assert.match(appUi, /new MutationObserver\(\(\) => enrichNavigationNames\(\)\)\.observe\(sidebar, \{ childList: true \}\)/, "dica também nos botões inseridos depois");
assert.match(appUi, /button\.title = detail \? `\$\{title\} — \$\{detail\}` : title/, "dica com título e descrição");
// As descrições injetadas pelos módulos continuam no DOM (acessíveis e usadas na dica).
for (const [file, text] of [["retomar.js", "Indicadores de emissões"], ["sigem_pw_dashboard_bootstrap.js", "Dashboard comparativo"], ["posting_conference_bootstrap.js", "Histórico × Consulta Geral"]]) {
  assert.ok(read(file).includes(text), `${file} mantém a descrição`);
}
console.log("sidebar_uniform: OK");
