"use strict";
// Corretor de títulos: o arquivo é lido UMA vez, ao ser escolhido. A análise usa a cópia em memória e nunca relê o disco
// (o navegador recusa a referência antiga — "The requested file could not be read" — se o arquivo mudou ou foi bloqueado).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const app = fs.readFileSync(path.resolve(__dirname, "../src/react/title-corrector/TitleCorrectorApp.tsx"), "utf8");
const analyze = app.slice(app.indexOf("const analyze=async"), app.indexOf("const exportLd=async"));
assert.ok(analyze.length > 200, "função analyze localizada");
assert.ok(!/\.arrayBuffer\(\)/.test(analyze), "a análise não relê o arquivo do disco");
assert.match(analyze, /files\.map\(file=>\(\{name:file\.name,bytes:file\.bytes\}\)\)/, "a análise usa a cópia em memória");
assert.match(analyze, /referenceBytes:reference\?reference\.bytes:null/);
assert.match(app, /async function snapshotOf\(file:File\)/);
assert.match(app, /const pickFiles=async/);
assert.match(app, /const pickReference=async/);
assert.equal((app.match(/onClick=\{e=>\{e\.currentTarget\.value='';\}\}/g) || []).length, 2, "escolher o mesmo arquivo de novo dispara a leitura (os dois campos)");
assert.match(app, /Feche o arquivo no Excel/, "mensagem clara quando o arquivo não pode ser lido");
assert.match(app, /filesSeq/, "escolha antiga das LDs não sobrescreve a mais nova");
assert.match(app, /referenceSeq/, "a base complementar tem contador próprio");
assert.ok(!/loadSeq/.test(app), "um único contador faria um campo descartar a leitura do outro");
assert.match(app, /const reset=\(\)=>\{filesSeq\.current\+\+;referenceSeq\.current\+\+;/, "troca de contrato ou saída invalida leituras pendentes");
console.log("title_corrector_file_snapshot: leitura única, cópia em memória, reescolha do mesmo arquivo e mensagem clara OK");
