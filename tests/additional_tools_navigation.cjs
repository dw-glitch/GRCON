const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const html = read("index.html");
const loader = read("grcon_module_loader.js");
const css = read("grcon-ui-fix.css");

const aside = html.slice(html.indexOf('<aside aria-label="Áreas do GRCON"'), html.indexOf("</aside>"));
assert.match(aside, /data-grcon-view="additional-tools"/);
assert.match(aside, /Ferramentas adicionais/);
assert.doesNotMatch(aside, /data-grcon-view="pdf-tools"/);
assert.doesNotMatch(aside, /data-grcon-view="cover-document"/);

const compactNav = html.slice(
  html.indexOf('<nav aria-label="Navegação compacta do GRCON"'),
  html.indexOf("</nav>", html.indexOf('<nav aria-label="Navegação compacta do GRCON"')) + 6
);
assert.match(compactNav, /id="tab-additional-tools"/);
assert.match(compactNav, /data-grcon-view="additional-tools"/);
assert.doesNotMatch(compactNav, /data-grcon-view="pdf-tools"/);
assert.doesNotMatch(compactNav, /data-grcon-view="cover-document"/);

assert.match(html, /id="additional-tools-module"[^>]+aria-labelledby="tab-additional-tools"/);
assert.match(html, /id="pdf-tools-module"[^>]+aria-label="Combinar PDFs"/);
assert.match(html, /id="cover-document-module"[^>]+aria-label="Adicionar Capa"/);
assert.match(html, /class="additional-tool-card" data-grcon-view="pdf-tools"/);
assert.match(html, /class="additional-tool-card" data-grcon-view="cover-document"/);
assert.match(html, /id="pdf-tools-module"/);
assert.match(html, /id="cover-document-module"/);

assert.match(loader, /"additional-tools": \[\]/);
assert.match(loader, /"additional-tools": "additional-tools-module"/);
assert.match(loader, /"additional-tools": "Ferramentas adicionais"/);
assert.match(loader, /module === "additional-tools"/);
assert.match(loader, /nestedToolView/);
assert.match(loader, /button\.classList\.contains\("ops-nav-button"\)/);

assert.match(css, /\.additional-tools-grid/);
assert.match(css, /\.additional-tool-card/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);

console.log("additional_tools_navigation: ok");
