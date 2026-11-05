"use strict";
// "Conferir GRDT" deixou de ser um módulo do menu: agora é uma aba do Histórico de eGRDTs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const index = read("index.html");

// Sem item próprio no menu lateral nem na navegação compacta.
assert.doesNotMatch(index, /<button class="ops-nav-button" data-grcon-view="sigem"/, "menu lateral sem Conferir GRDT");
assert.doesNotMatch(index, /id="tab-sigem"/, "navegação compacta sem Conferir GRDT");
// A área continua existindo, agora com a faixa de abas do Histórico nas duas pontas.
assert.match(index, /<section id="sigem-module"[^>]*aria-labelledby="sigem-subtab-conferir"/);
assert.match(index, /<section id="history-module"[^>]*aria-labelledby="history-subtab-egrdts"/);
const strips = index.match(/<nav class="history-subnav"[^>]*role="tablist"/g) || [];
assert.equal(strips.length, 2, "uma faixa no Histórico e uma no Conferir GRDT");
for (const id of ["history-subtab-egrdts", "history-subtab-conferir", "sigem-subtab-egrdts", "sigem-subtab-conferir"]) {
  assert.equal((index.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, `${id} único`);
}
assert.equal((index.match(/id="ops-sigem-count"/g) || []).length, 1, "contador da conferência sem id duplicado");

// O carregador ainda abre a view e mantém o Histórico marcado no menu.
const loader = read("grcon_module_loader.js");
assert.match(loader, /sigem: "Histórico de eGRDTs · Conferir GRDT"/);
assert.match(loader, /historyAreaNav = view === "sigem" && button\.dataset\.grconView === "history"/);
assert.match(loader, /sigem: "sigem-module"/);

// Outros módulos que se penduravam no item antigo agora entram antes de Configurações gerais.
for (const file of ["posting_conference_bootstrap.js", "sigem_pw_dashboard_bootstrap.js"]) {
  const text = read(file);
  assert.doesNotMatch(text, /querySelector\('\[data-grcon-view="sigem"\]'\)/, `${file} sem âncora antiga`);
  assert.match(text, /querySelector\('\[data-ops-open-settings\]'\)/, `${file} ancora em Configurações gerais`);
}
// A renderização da conferência preserva a faixa de abas.
const central = read("sigem_posting_central_app.js");
assert.match(central, /const subnav=module\.querySelector\("\.history-subnav"\)/);
assert.match(central, /if\(subnav\)module\.prepend\(subnav\)/);
assert.match(read("grcon-final.css"), /\.history-subnav-tab\[aria-selected="true"\]/);
console.log("history_conferir_tab: OK");
