"use strict";
// Regressão de acessibilidade e rastreabilidade do handoff visual.
// A regra de foco usa :focus-visible para teclado sem afetar toque/mouse.
// A galeria documenta conceitos: nunca deve entrar como dado operacional.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const css = read("grcon-final.css");
const html = read("index.html");
const doc = read("docs/ux-18-higgsfield-handoff-20261009.md");

assert.match(css, /:is\(button, a\[href\], input, select, textarea, summary, \[role="button"\], \[tabindex\]\):focus-visible/);
assert.match(css, /outline:\s*3px solid var\(--ui-focus\)/);
assert.match(html, /class="app-shortcut-link app-shortcut-link-flow"[^>]*href="https:\/\/grcon-flow\.vercel\.app\//);
assert.doesNotMatch(html, /class="ops-nav-button ops-nav-external"[^>]*href="https:\/\/grcon-flow\.vercel\.app\//);
assert.doesNotMatch(html, /class="ops-nav-external"[^>]*href="https:\/\/grcon-flow\.vercel\.app\//);
const appsMenu = html.match(/<div class="grcon-app-shortcuts-panel">([\s\S]*?)<\/div>/)?.[1] || "";
assert.match(appsMenu, /app-shortcut-link-flow/);
const appPositions = ["app-shortcut-link-vincula", "app-shortcut-link-recon", "app-shortcut-link-flow"].map(name => appsMenu.indexOf(name));
assert.ok(appPositions.every(pos => pos >= 0) && appPositions[0] < appPositions[1] && appPositions[1] < appPositions[2], "Aplicativos: Vincula, RECON, GRCON Flow");
assert.equal((html.match(/https:\/\/grcon-flow\.vercel\.app\//g) || []).length, 1, "GRCON Flow aparece uma vez no cabeçalho");
assert.match(html, /<nav aria-label="Navegação compacta do GRCON"/);
assert.match(doc, /UX Pilot:[^\n]*erro interno/);
assert.match(doc, /não[^\n]*screenshots do GRCON em produção/i);
const rows = doc.match(/^\| \d{2} \|/gm) || [];
assert.equal(rows.length, 18, "O handoff deve descrever exatamente 18 telas");
const links = doc.match(/https:\/\/d8j0ntlcm91z4\.cloudfront\.net\/user_[^\s)]+\.png/g) || [];
assert.equal(links.length, 18, "Cada tela precisa de uma referência Higgsfield");
console.log("OK — foco acessível e rastreabilidade das 18 referências visuais.");
