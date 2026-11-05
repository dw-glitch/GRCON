"use strict";
// Evolução: o histórico diário ganha a opção Linhas, sem remover as barras (que continuam o padrão).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const app = read("src/react/sigem-pw/evolution/SigemPwEvolutionApp.tsx");
const css = read("sigem-pw-evolution.css");
// As barras continuam exatamente como eram.
for (const piece of ['className="spw-evo-days"', 'className="spw-evo-bar sigem"', 'className="spw-evo-bar emitted"', 'id="spw-evo-timeline"']) assert.ok(app.includes(piece), `barras preservadas: ${piece}`);
// Alternância Barras | Linhas, lembrada neste navegador, com barras como padrão.
assert.match(app, /data-evo-chart-form="bars"/);
assert.match(app, /data-evo-chart-form="lines"/);
assert.match(app, /getItem\(TIMELINE_FORM_KEY\) === "lines" \? "lines" : "bars"/);
assert.match(app, /aria-pressed=\{form === "bars"\}/);
// As linhas usam as MESMAS cinco séries e têm alternativa em tabela e texto para leitor de tela.
for (const key of ["sigemAdded", "sigemRemoved", "pwAdded", "pwRemoved", "pwEmitted"]) assert.ok(app.includes(`key: "${key}"`), `série ${key}`);
assert.match(app, /role="img" aria-label=\{`Histórico diário em linhas\./);
assert.match(app, /Ver como tabela/);
assert.match(css, /\.spw-evo-form-toggle button\[aria-pressed="true"\]/);
assert.match(css, /\.spw-evo-line\.sigem polyline/);
console.log("sigem_pw_evolution_chart_form: OK");
