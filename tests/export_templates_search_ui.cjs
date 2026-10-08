const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (name) => fs.readFileSync(path.resolve(__dirname, "..", name), "utf8");
const html = read("index.html");
const app = read("requests_app.js");
const css = read("requests.css");

assert.match(html, /id="requests-modelo-search"/);
assert.match(html, /id="requests-modelo-contagem"/);
assert.match(app, /modeloBusca:\s*""/);
assert.match(app, /const modelosVisiveis = query \? state\.modelos\.filter/);
assert.match(app, /els\.modeloSearch\?\.addEventListener\("input"/);
assert.match(app, /renderModelos\(true\)/);
assert.match(app, /if \(!preservarEditor\) renderEditorModelo\(\)/);
assert.match(app, /Nenhum modelo corresponde à pesquisa/);
assert.match(css, /\.requests-modelo-pesquisa/);

const func = app.match(/function normalizarPesquisaModelo\(value\) \{[\s\S]*?\n  \}/);
assert.ok(func);
const normalize = new Function(func[0] + ";return normalizarPesquisaModelo;")();
assert.equal(normalize(" Alocação "), "alocacao");
assert.equal(normalize("SITUAÇÃO"), "situacao");
assert.equal(normalize("Embutido no GRCON"), "embutido no grcon");
console.log("export_templates_search_ui: ok");
