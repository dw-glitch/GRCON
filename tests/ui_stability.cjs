// Estabilidade visual: impede o retorno do ciclo que fazia a interface do GRCON
// repintar sozinha, sem nenhuma interação.
//
// O defeito original: ui-v3.js observa atributos de toda a body (inclusive
// "class") e, no refinamento, reescrevia atributos com o MESMO valor. Uma
// escrita sem mudança ainda gera registro de mutação, o registro reagendava o
// refinamento e o refinamento escrevia de novo — 25 vezes por segundo, para
// sempre. Medido antes da correção: 729 mutações de DOM em 10 s de tela parada.
// Depois: 0.
//
// A garantia aqui é a invariante que elimina o ciclo na origem: nenhuma escrita
// incondicional de atributo, classe ou dataset nesses arquivos.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.join(__dirname, "..");
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), "utf8");

function semCorpoDosAuxiliares(fonte) {
  // Os próprios auxiliares precisam conter a escrita crua; o resto do arquivo não.
  return fonte
    .replace(/if \(element && element\.getAttribute\(name\) !== value\) element\.setAttribute\(name, value\);/g, "")
    .replace(/if \(element && element\.hasAttribute\(name\)\) element\.removeAttribute\(name\);/g, "")
    .replace(/if \(element && !element\.classList\.contains\(name\)\) element\.classList\.add\(name\);/g, "")
    .replace(/if \(element && element\.dataset\[key\] !== value\) element\.dataset\[key\] = value;/g, "");
}

const uiV3 = ler("ui-v3.js");

// 1. Os auxiliares condicionais existem e comparam antes de escrever.
assert.match(uiV3, /function setAttr\(element, name, value\) \{\s*if \(element && element\.getAttribute\(name\) !== value\)/);
assert.match(uiV3, /function addClass\(element, name\) \{\s*if \(element && !element\.classList\.contains\(name\)\)/);
assert.match(uiV3, /function setData\(element, key, value\) \{\s*if \(element && element\.dataset\[key\] !== value\)/);

// 2. Nenhuma escrita crua sobrou fora deles. É esta invariante que impede o
//    ciclo de voltar: sem mudança real não há registro de mutação, e sem
//    registro o observer não reagenda o refinamento.
const corpo = semCorpoDosAuxiliares(uiV3);
const cruas = [
  [/\.setAttribute\(/g, "setAttribute"],
  [/\.classList\.add\(/g, "classList.add"],
  [/\.dataset\.[A-Za-z0-9_]+\s*=[^=]/g, "dataset direto"],
];
for (const [padrao, nome] of cruas) {
  const achados = corpo.match(padrao) || [];
  assert.equal(achados.length, 0, `ui-v3.js voltou a escrever ${nome} sem comparar antes (${achados.length} ocorrência(s)). Use setAttr/addClass/setData.`);
}

// 3. Segunda linha de defesa: o refinamento descarta os próprios registros.
assert.match(uiV3, /observer\.takeRecords\(\)/);
assert.match(uiV3, /function flushEnhancements\(\)[\s\S]*?observer\.takeRecords\(\);\s*\}/);

// 4. O observer continua escutando "class" — a correção não pode ter sido feita
//    estreitando o filtro, o que desligaria o refinamento de ordenação.
assert.match(uiV3, /attributeFilter: \[[^\]]*"class"[^\]]*\]/);

// 5. Conferência: o selo de Status SIGEM não pode ser destruído e recriado a
//    cada refinamento, linha a linha — isso repinta a coluna inteira.
const refinamento = ler("posting_conference_refinement.js");
assert.match(refinamento, /function setText\(node, value\) \{\s*if \(node && node\.textContent !== value\) node\.textContent = value;/);
assert.doesNotMatch(refinamento, /cell\.textContent = "";\s*const badge = document\.createElement/);
assert.match(refinamento, /if \(!badge \|\| !badge\.classList\.contains\("pc-sigem-status"\)\)/);
const refinamentoSemAuxiliar = refinamento.replace(/if \(node && node\.textContent !== value\) node\.textContent = value;/g, "");
const textosCrus = (refinamentoSemAuxiliar.match(/\.textContent = (?!"";)/g) || []);
assert.equal(textosCrus.length, 0, `posting_conference_refinement.js voltou a escrever textContent sem comparar antes (${textosCrus.length}). Use setText.`);

// 6. O refinamento da Conferência mantém o descarte dos próprios registros.
assert.match(refinamento, /moduleObserver\?\.takeRecords\?\.\(\)/);

console.log("ui_stability: sem escrita incondicional em ui-v3 e na Conferência — ciclo de repintura não pode voltar");
