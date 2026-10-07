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
assert.match(refinamento, /const nativeSituation = \/\^Situação\$\/i\.test/);
assert.match(refinamento, /if \(nativeSituation\)/);
assert.match(refinamento, /statusCell\.querySelector\("\.pc-sigem-status"\)/);
assert.match(refinamento, /if \(nativeSituation\) \{[\s\S]*?setText\(sigem,[\s\S]*?return;/);
const refinamentoSemAuxiliar = refinamento.replace(/if \(node && node\.textContent !== value\) node\.textContent = value;/g, "");
const textosCrus = (refinamentoSemAuxiliar.match(/\.textContent = (?!"";)/g) || []);
assert.equal(textosCrus.length, 0, `posting_conference_refinement.js voltou a escrever textContent sem comparar antes (${textosCrus.length}). Use setText.`);

// 6. O refinamento da Conferência mantém o descarte dos próprios registros.
assert.match(refinamento, /moduleObserver\?\.takeRecords\?\.\(\)/);

// 7. document-class visual contract: cores ficam centralizadas e as principais
//    superfícies usam identificação textual + semântica, sem reaproveitar cores de status.
const classCss = ler("grcon-ui.css");
assert.match(classCss, /--document-et-color:\s*#0a4f83/);
assert.match(classCss, /--document-et-background:\s*#e6f1fa/);
assert.match(classCss, /--document-n1710-color:\s*#542c84/);
assert.match(classCss, /--document-n1710-background:\s*#f1eaf8/);
assert.match(classCss, /\.document-class-badge\[data-document-class="ET"\]/);
assert.match(classCss, /\.document-class-badge\[data-document-class="N-1710"\]/);

// O Dashboard SIGEM × PW mantém ET/N-1710 identificáveis por contorno/texto,
// mas sem preenchimento azul/lilás nos cards e badges do resumo.
const sigemPwCss = ler("sigem-pw-dashboard.css");
assert.match(sigemPwCss, /\.spw-system-split div\[data-document-class="ET"\][\\s\\S]*?background:\s*var\(--spw-surface\)/);
assert.match(sigemPwCss, /\.spw-system-split div\[data-document-class="N-1710"\][\\s\\S]*?background:\s*var\(--spw-surface\)/);
assert.match(sigemPwCss, /\.document-class-badge\[data-document-class="ET"\],[\\s\\S]*?\.document-class-badge\[data-document-class="N-1710"\][\\s\\S]*?background:\s*var\(--spw-surface\)/);
assert.doesNotMatch(sigemPwCss, /\.spw-system-split div\[data-document-class="(?:ET|N-1710)"\][\\s\\S]*?background:\s*var\(--document-(?:et|n1710)-background/);

const dashboard = ler("retomar.js");
assert.doesNotMatch(dashboard, /--dash-et:#0b7895/);
assert.doesNotMatch(dashboard, /--dash-n1710:#6d4ac7/);
assert.match(dashboard, /--dash-et:var\(--document-et-accent/);
assert.match(dashboard, /data-document-class="ET"/);
assert.match(dashboard, /data-document-class="N-1710"/);

const spwTable = ler("src/react/sigem-pw/components/SigemPwTable.tsx");
const spwEvolution = ler("src/react/sigem-pw/evolution/SigemPwEvolutionApp.tsx");
const historyReact = ler("src/react/historico-egrdt/HistoricoEgrdtApp.tsx");
assert.match(spwTable, /DocumentClassBadge/);
assert.match(spwEvolution, /DocumentClassBadge/);
assert.match(historyReact, /DocumentClassBadge/);
const spwRevision = ler("src/react/sigem-pw/revision/components/SigemPwRevisionTable.tsx");
const conferenceUi = ler("posting_conference_app.js");
assert.match(spwRevision, /DocumentClassBadge/);
assert.match(conferenceUi, /document-class-badge/);

function hexLuminance(hex) {
  const rgb = hex.replace("#", "").match(/.{2}/g).map((part) => parseInt(part, 16) / 255).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function contrastRatio(first, second) {
  const a = hexLuminance(first);
  const b = hexLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
assert.ok(contrastRatio("#0a4f83", "#e6f1fa") >= 4.5, "ET precisa manter contraste AA no badge");
assert.ok(contrastRatio("#542c84", "#f1eaf8") >= 4.5, "N-1710 precisa manter contraste AA no badge");
assert.ok(contrastRatio("#ffffff", "#0b63a3") >= 4.5, "ET precisa manter contraste AA no gráfico");
assert.ok(contrastRatio("#ffffff", "#6b3fa0") >= 4.5, "N-1710 precisa manter contraste AA no gráfico");

console.log("ui_stability: sem escrita incondicional em ui-v3 e na Conferência — ciclo de repintura não pode voltar");
