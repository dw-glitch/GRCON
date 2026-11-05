"use strict";
// Menu lateral recolhível: o botão de hambúrguer abre a barra por cima do conteúdo (gaveta); ela não ocupa largura fixa.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const html = read("index.html");
const ui = read("app-ui.js");
const css = read("grcon-final.css");

// Marcação: botão acessível, barra nomeada e inerte enquanto fechada (fora da ordem de Tab).
assert.match(html, /<button aria-controls="grcon-sidebar" aria-expanded="false" aria-label="Abrir menu de módulos" class="grcon-menu-toggle" id="grcon-menu-toggle"[^>]*type="button">/);
assert.match(html, /<aside aria-label="Áreas do GRCON" class="ops-sidebar" id="grcon-sidebar" inert="">/);
assert.match(html, /<html[^>]*data-sidebar-drawer="on"[^>]*data-sidebar-open="false"/, "começa recolhida, sem piscar aberta");
// A camada da gaveta é declarada antes de qualquer folha de estilo: !important da camada mais antiga vence as regras antigas da barra.
assert.ok(html.indexOf("@layer grcon-drawer;") > -1 && html.indexOf("@layer grcon-drawer;") < html.indexOf('rel="stylesheet"') || html.indexOf("@layer grcon-drawer;") < html.indexOf(".css"), "camada declarada antes dos estilos");
assert.match(css, /@layer grcon-drawer \{/);
assert.match(css, /\.app-shell > \.ops-sidebar \{\s*position: fixed !important/);
assert.match(css, /grid-template-columns: minmax\(0, 1fr\) !important/, "o conteúdo ocupa a tela inteira");
assert.match(css, /\[data-sidebar-open="true"\] \.app-shell > \.ops-sidebar/);

// Comportamento: clique abre/fecha; Esc, clique fora e escolher um módulo fecham; foco volta ao botão.
assert.match(ui, /function installSidebarDrawer\(\)/);
assert.match(ui, /toggle\.addEventListener\("click", \(\) => \{ if \(!isPinned\(\)\) set\(!isOpen\(\), true\); \}\)/);
assert.match(ui, /scrim\.addEventListener\("click", \(\) => set\(false, true\)\)/);
assert.match(ui, /event\.key === "Escape" && !isPinned\(\) && isOpen\(\) && !document\.querySelector\("dialog\[open\]"\)/, "Esc não atropela janelas abertas");
assert.match(ui, /closest\?\.\("button, a"\) && !event\.target\.closest\("#grcon-sidebar-pin"\)\)\s*window\.setTimeout\(\(\) => set\(false, false\), 0\)/, "escolher um módulo fecha o menu");
assert.match(ui, /sidebar\.setAttribute\("inert", ""\)/);
assert.match(ui, /installSidebarDrawer\(\);\s*installRenamerUx\(\)/, "instalado na inicialização");

// Fixar menu: volta ao formato de antes (barra sempre visível); a escolha é lembrada e aplicada antes da tela aparecer.
assert.match(html, /<button aria-label="Fixar a barra lateral" aria-pressed="false" class="ops-sidebar-pin" id="grcon-sidebar-pin"[^>]*type="button">/);
const head = read("grcon_bootstrap_head.js");
assert.match(head, /localStorage\.getItem\("grcon\.sidebar\.pinned"\) === "true" && !\(window\.matchMedia && window\.matchMedia\("\(max-width: 58rem\)"\)\.matches\)\) document\.documentElement\.dataset\.sidebarDrawer = "off"/, "preferência lida no head (sem piscar), só em janela larga");
assert.match(ui, /const applyMode = \(\) =>/);
assert.match(ui, /const pinned = wantsPinned && !\(narrow && narrow\.matches\)/, "janela estreita: fixada vira hambúrguer (a barra fica escondida pelo CSS responsivo)");
assert.match(ui, /root\.dataset\.sidebarDrawer = pinned \? "off" : "on"/);
assert.match(ui, /setItem\("grcon\.sidebar\.pinned", String\(value\)\)/);
assert.match(ui, /matchMedia\("\(max-width: 58rem\)"\)/);
assert.match(ui, /toggle\.addEventListener\("click", \(\) => \{ if \(!isPinned\(\)\) set\(!isOpen\(\), true\); \}\)/, "hambúrguer não age quando fixada");
assert.match(ui, /!isPinned\(\) && event\.target\?\.closest\?\.\("button, a"\) && !event\.target\.closest\("#grcon-sidebar-pin"\)/, "fixada: escolher módulo não fecha nem torna inerte");
assert.match(ui, /event\.key === "Escape" && !isPinned\(\)/);
assert.match(css, /\[data-sidebar-drawer="off"\] \.grcon-menu-toggle \{ display: none; \}/, "fixada: sem hambúrguer");
// As regras da gaveta só valem em modo "on": em "off" a barra é a de antes.
assert.doesNotMatch(css.slice(css.indexOf("@layer grcon-drawer"), css.indexOf("@layer grcon-drawer") + 2500).replace(/\[data-sidebar-drawer="on"\]/g, ""), /data-sidebar-drawer="off"/, "camada da gaveta não mexe no modo fixado");
console.log("sidebar_drawer: OK");
